// Tiny procedural water sounds (off by default).

export class WaterSound {
  private ctx: AudioContext | null = null;
  private noise: AudioBuffer | null = null;
  private last = 0;
  enabled = false;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    this.ctx = new AC();
    const len = Math.floor(this.ctx.sampleRate * 0.25);
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    return this.ctx;
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (on) {
      const c = this.ensure();
      void c?.resume();
      this.drop(0.6);
    }
  }

  /** A soft "plip" of a brush touching wet paper. */
  drop(strength = 1): void {
    if (!this.enabled) return;
    const c = this.ensure();
    if (!c || !this.noise) return;
    const now = c.currentTime;
    if (now - this.last < 0.07) return;
    this.last = now;
    const vol = 0.05 * strength;

    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    const f0 = 700 + Math.random() * 500;
    o.frequency.setValueAtTime(f0, now);
    o.frequency.exponentialRampToValueAtTime(f0 * 0.45, now + 0.11);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(vol, now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.16);
    o.connect(g).connect(c.destination);
    o.start(now);
    o.stop(now + 0.2);

    const n = c.createBufferSource();
    n.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1400 + Math.random() * 900;
    bp.Q.value = 1.4;
    const ng = c.createGain();
    ng.gain.value = vol * 0.5;
    n.connect(bp).connect(ng).connect(c.destination);
    n.start(now);
  }

  /** Long whoosh of water for the wash. */
  wash(): void {
    if (!this.enabled) return;
    const c = this.ensure();
    if (!c || !this.noise) return;
    const now = c.currentTime;
    const len = Math.floor(c.sampleRate * 2.4);
    const buf = c.createBuffer(1, len, c.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = b * 0.97 + (Math.random() * 2 - 1) * 0.03;
      const t = i / len;
      d[i] = b * Math.sin(Math.PI * t) * 6;
    }
    const s = c.createBufferSource();
    s.buffer = buf;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(500, now);
    lp.frequency.linearRampToValueAtTime(1600, now + 1.2);
    lp.frequency.linearRampToValueAtTime(400, now + 2.4);
    const g = c.createGain();
    g.gain.value = 0.12;
    s.connect(lp).connect(g).connect(c.destination);
    s.start(now);
    for (let i = 0; i < 5; i++) setTimeout(() => this.drop(0.4), 200 + i * 260 + Math.random() * 120);
  }
}
