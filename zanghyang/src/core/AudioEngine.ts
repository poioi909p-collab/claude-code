/**
 * Web Audio 합성 — 사인 + 약한 배음, 생성형 임펄스 리버브.
 * 모든 소리는 master → (dry / reverb) → compressor → destination.
 */

/** 계면조 느낌의 단조 펜타토닉 (D 기준): 0, 3, 5, 7, 10 반음 */
const PENTA = [0, 3, 5, 7, 10];
const BASE_HZ = 146.83; // D3

export function pentatonicHz(index: number): number {
  const oct = Math.floor(index / PENTA.length);
  const deg = ((index % PENTA.length) + PENTA.length) % PENTA.length;
  return BASE_HZ * Math.pow(2, oct + PENTA[deg] / 12);
}

export interface NoiseVoice {
  set(level: number, freq: number, q?: number): void;
  stop(): void;
}

interface Voice {
  out: GainNode;
  end: number;
  nodes: AudioScheduledSourceNode[];
}

export class AudioEngine {
  ctx: AudioContext | null = null;
  enabled = true;
  private master!: GainNode;
  private bus!: GainNode;
  private reverb!: ConvolverNode;
  private reverbSend!: GainNode;
  private noiseBuf!: AudioBuffer;
  private brownBuf: AudioBuffer | null = null;
  private voices: Voice[] = [];
  private readonly listeners = new Set<(on: boolean) => void>();

  constructor() {
    try {
      const v = localStorage.getItem('zanghyang:sound');
      if (v === '0') this.enabled = false;
    } catch {
      /* noop */
    }
  }

  /** 사용자 제스처 안에서 호출 */
  unlock(): void {
    if (!this.ctx) {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.build();
    }
    if (this.ctx.state !== 'running') void this.ctx.resume().catch(() => undefined);
  }

  get ready(): boolean {
    return !!this.ctx && this.ctx.state === 'running';
  }

  private build() {
    const ctx = this.ctx!;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    comp.connect(ctx.destination);

    this.master = ctx.createGain();
    this.master.gain.value = this.enabled ? 1 : 0;
    this.master.connect(comp);

    this.bus = ctx.createGain();
    this.bus.gain.value = 0.9;
    this.bus.connect(this.master);

    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(3.6, 2.4);
    this.reverbSend = ctx.createGain();
    this.reverbSend.gain.value = 0.55;
    const tone = ctx.createBiquadFilter();
    tone.type = 'lowpass';
    tone.frequency.value = 5200;
    this.bus.connect(this.reverbSend);
    this.reverbSend.connect(this.reverb);
    this.reverb.connect(tone);
    tone.connect(this.master);

    const len = ctx.sampleRate * 2;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  /** 지수 감쇠 잡음 임펄스 — 꼬리로 갈수록 어두워지는 홀 */
  private impulse(seconds: number, decay: number): AudioBuffer {
    const ctx = this.ctx!;
    const rate = ctx.sampleRate;
    const len = Math.floor(rate * seconds);
    const buf = ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const x = i / len;
        const env = Math.pow(1 - x, decay) * (i < rate * 0.012 ? i / (rate * 0.012) : 1);
        const k = 0.75 - 0.6 * x; // 점점 어두운 꼬리
        lp += (Math.random() * 2 - 1 - lp) * k;
        d[i] = lp * env * 0.6;
      }
    }
    return buf;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    try {
      localStorage.setItem('zanghyang:sound', on ? '1' : '0');
    } catch {
      /* noop */
    }
    if (this.ctx) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(on ? 1 : 0, t, 0.12);
    }
    this.listeners.forEach((fn) => fn(on));
  }

  onToggle(fn: (on: boolean) => void): void {
    this.listeners.add(fn);
  }

  private reap() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    while (this.voices.length > 14) {
      const v = this.voices.shift()!;
      v.out.gain.cancelScheduledValues(now);
      v.out.gain.setTargetAtTime(0, now, 0.03);
      v.nodes.forEach((n) => n.stop(now + 0.2));
    }
  }

  /**
   * 현을 튕긴 소리: 사인 기음 + 2·3·4배음(약하게), 배음이 먼저 사라지는 지수 감쇠.
   */
  pluck(freq: number, amp = 0.5, pan = 0, decay = 4, bright = 0.5): void {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx!;
    this.reap();
    const t = ctx.currentTime + 0.005;
    const out = ctx.createGain();
    out.gain.value = 1;
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-0.9, Math.min(0.9, pan));
    out.connect(panner);
    panner.connect(this.bus);
    const partials: [number, number, number][] = [
      [1, 1, 1],
      [2, 0.2 + 0.18 * bright, 0.45],
      [3, 0.06 + 0.08 * bright, 0.28],
      [4.02, 0.025 * (0.5 + bright), 0.18],
    ];
    const nodes: AudioScheduledSourceNode[] = [];
    const a = Math.min(1, amp) * 0.22;
    for (const [mul, g, dk] of partials) {
      const f = freq * mul;
      if (f > 16000) continue;
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * 1.008, t);
      osc.frequency.exponentialRampToValueAtTime(f, t + 0.07);
      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, t);
      env.gain.exponentialRampToValueAtTime(a * g, t + 0.004);
      env.gain.exponentialRampToValueAtTime(0.0001, t + decay * dk + 0.05);
      osc.connect(env);
      env.connect(out);
      osc.start(t);
      osc.stop(t + decay * dk + 0.1);
      nodes.push(osc);
    }
    this.voices.push({ out, end: t + decay + 0.2, nodes });
  }

  /** 입장 — 낮고 둥근 울림 (비조화 배음 약간) */
  bell(): void {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.01;
    const f0 = 73.4;
    const parts: [number, number, number][] = [
      [1, 0.35, 7],
      [2.01, 0.12, 4.5],
      [2.76, 0.06, 3],
      [5.4, 0.018, 1.6],
    ];
    for (const [m, g, d] of parts) {
      const o = ctx.createOscillator();
      o.frequency.value = f0 * m;
      const e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(g, t + 0.05);
      e.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(e);
      e.connect(this.bus);
      o.start(t);
      o.stop(t + d + 0.1);
    }
  }

  /** 전환 — 낮게 부풀었다 가라앉는 잡음 */
  swell(duration = 2): void {
    const v = this.noise('lowpass');
    if (!v) return;
    const ctx = this.ctx!;
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
      const x = i / steps;
      const lvl = Math.sin(Math.PI * x) ** 2 * 0.11;
      setTimeout(() => v.set(lvl, 260 + 900 * Math.sin(Math.PI * x)), x * duration * 1000);
    }
    setTimeout(() => v.stop(), duration * 1000 + 400);
    void ctx;
  }

  /** 지속 잡음 성부 (붓 마찰, 바람) */
  noise(type: BiquadFilterType = 'bandpass'): NoiseVoice | null {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.5 + Math.random() * 0.2;
    const filt = ctx.createBiquadFilter();
    filt.type = type;
    filt.frequency.value = 1200;
    filt.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(filt);
    filt.connect(g);
    g.connect(this.bus);
    src.start();
    let stopped = false;
    return {
      set: (level, freq, q) => {
        if (stopped) return;
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(Math.max(0, level), t, 0.06);
        filt.frequency.setTargetAtTime(Math.max(40, freq), t, 0.08);
        if (q !== undefined) filt.Q.setTargetAtTime(q, t, 0.1);
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(0, t, 0.08);
        src.stop(t + 0.6);
      },
    };
  }

  // ─────────── 먹실 전용 소리 ───────────

  /** 갈색 잡음 (먹실 붓결): 이음매 없이 반복되도록 끝을 처음에 맞춘다 */
  private brown(): AudioBuffer {
    if (this.brownBuf) return this.brownBuf;
    const ctx = this.ctx!;
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = b;
    }
    const drift = d[len - 1] - d[0];
    let peak = 0;
    for (let i = 0; i < len; i++) {
      d[i] -= (drift * i) / (len - 1);
      peak = Math.max(peak, Math.abs(d[i]));
    }
    for (let i = 0; i < len; i++) d[i] /= peak || 1;
    this.brownBuf = buf;
    return buf;
  }

  /** 먹실 붓결: 종이를 스치는 낮고 둥근 소리. 세기는 느린 시정수로 따라간다 */
  inkBrush(): NoiseVoice | null {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.brown();
    src.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 90;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 300;
    lp.Q.value = 0.4;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(hp);
    hp.connect(lp);
    lp.connect(g);
    g.connect(this.bus);
    src.start(ctx.currentTime, Math.random() * 3);
    let stopped = false;
    let lastL = -1;
    let lastF = -1;
    return {
      set: (level, freq) => {
        if (stopped) return;
        const t = ctx.currentTime;
        if (Math.abs(level - lastL) > 0.0015) {
          lastL = level;
          g.gain.setTargetAtTime(Math.max(0, level), t, level > g.gain.value ? 0.09 : 0.28);
        }
        if (Math.abs(freq - lastF) > 25) {
          lastF = freq;
          lp.frequency.setTargetAtTime(Math.max(60, freq), t, 0.25);
        }
      },
      stop: () => {
        if (stopped) return;
        stopped = true;
        const t = ctx.currentTime;
        g.gain.cancelScheduledValues(t);
        g.gain.setValueAtTime(g.gain.value, t);
        g.gain.setTargetAtTime(0, t, 0.15);
        src.stop(t + 1.2);
      },
    };
  }

  /** 먹실 톡 — 낮고 둥근 물방울 (110~150Hz) */
  drip(amp = 0.2, pan = 0): void {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx!;
    const t = ctx.currentTime + 0.005;
    const f = pentatonicHz(Math.floor(Math.random() * 3) - 2);
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    p.connect(this.bus);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f * 1.12, t);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const e = ctx.createGain();
    e.gain.setValueAtTime(0.0001, t);
    e.gain.exponentialRampToValueAtTime(amp * 0.2, t + 0.015);
    e.gain.exponentialRampToValueAtTime(0.0001, t + 1.4);
    o.connect(e);
    e.connect(p);
    o.start(t);
    o.stop(t + 1.45);
  }

  /** 잔상실의 낮은 지속음 */
  drone(): { stop(): void } | null {
    if (!this.ready) return null;
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 4);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 600;
    g.connect(lp);
    lp.connect(this.bus);
    const oscs = [73.42, 110.0 * 0.998, 146.83 * 1.003].map((f) => {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.connect(g);
      o.start(t);
      return o;
    });
    return {
      stop: () => {
        const n = ctx.currentTime;
        g.gain.cancelScheduledValues(n);
        g.gain.setTargetAtTime(0.0001, n, 0.6);
        oscs.forEach((o) => o.stop(n + 3));
      },
    };
  }
}
