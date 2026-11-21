import * as THREE from 'three';
import gsap from 'gsap';
import { Room, type AppContext, type EnterInfo } from './Room';
import { PingPong, makeMaterial, type Stage } from '../core/Stage';
import { STRIDE, type RecordedStroke } from '../core/Recorder';
import { PALETTE, clamp, lerp, rgb, smoothstep } from '../core/config';
import { pentatonicHz } from '../core/AudioEngine';
import { haptic } from '../core/haptics';

import paperFrag from '../shaders/ink/paper.frag?raw';
import splatVert from '../shaders/ink/splat.vert?raw';
import splatFrag from '../shaders/ink/splat.frag?raw';
import advectDyeFrag from '../shaders/ink/advectDye.frag?raw';
import absorbFrag from '../shaders/ink/absorb.frag?raw';
import displayFrag from '../shaders/ink/display.frag?raw';
import galleryFrag from '../shaders/afterimage/gallery.frag?raw';

const ADD = {
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendEquation: THREE.AddEquation,
} as const;

/** 포스터 비율 3:4. 작품 영역: 가로 x0..x1, 세로는 위에서 (1 - y1) 부터 (y1 - y0) 높이 */
const ART = { x0: 0.085, x1: 0.915, y0: 0.235, y1: 0.93 };

interface Pt {
  x: number; // 포스터 px
  y: number;
  t: number; // 재생 시각 (초)
  w: number;
  i: number;
  temp: number;
  speed: number;
}

interface Track {
  src: RecordedStroke;
  pts: Pt[];
  drawn: number;
  start: number;
  end: number;
  /** 원래 화면 CSS px → 포스터 px */
  pxScale: number;
  sounded: boolean;
}

/**
 * 4실 · 잔상 殘像
 * 1~3실의 모든 스트로크를 한 장의 종이 위에 다시 재생한다. 서명과 날짜, 낙관을 찍어 PNG 로.
 */
export class AfterimageRoom extends Room {
  readonly index = 4;
  readonly title = '잔상';
  readonly hanja = '殘像';
  readonly line = '당신이 남긴 것들';
  grain = 0.045;
  vignette = 0.22;

  private stage: Stage;
  private PW = 1500;
  private PH = 2000;
  private paper!: THREE.WebGLRenderTarget;
  private dried!: THREE.WebGLRenderTarget;
  private wet!: PingPong;
  private poster!: THREE.WebGLRenderTarget;
  private zeroVel!: THREE.DataTexture;
  private m!: Record<'paper' | 'advect' | 'absorb' | 'display' | 'gallery', THREE.RawShaderMaterial>;
  private splatWet!: THREE.RawShaderMaterial;
  private splatDry!: THREE.RawShaderMaterial;
  private splatMesh!: THREE.Mesh;
  private textCanvas!: HTMLCanvasElement;
  private textTex!: THREE.CanvasTexture;

  private tracks: Track[] = [];
  private replay = { t: 0 };
  private replayTween: gsap.core.Tween | null = null;
  private total = 1;
  private dirty = true;
  private wetActive = 0;
  private time = 0;
  private seed = Math.random() * 100;
  private drone: { stop(): void } | null = null;
  private form = document.getElementById('signature') as HTMLFormElement;
  private nameInput = document.getElementById('signature-name') as HTMLInputElement;
  private saveBtn = this.form.querySelector<HTMLButtonElement>('.signature__save')!;
  private replayBtn = this.form.querySelector<HTMLButtonElement>('.signature__replay')!;
  private signTimer: number | undefined;
  private builtFrom = -1;

  constructor(app: AppContext) {
    super(app);
    this.stage = app.stage;
  }

  protected init(): void {
    const st = this.stage;
    const long = st.quality.posterLong;
    this.PH = long;
    this.PW = Math.round((long * 3) / 4);
    const half = st.halfType;

    this.m = {
      paper: makeMaterial(paperFrag, { uSize: { value: new THREE.Vector2() }, uSeed: { value: Math.random() * 50 } }),
      advect: makeMaterial(advectDyeFrag, {
        uVelocity: { value: null },
        uSource: { value: null },
        uPaper: { value: null },
        uSimTexel: { value: new THREE.Vector2(0, 0) },
        uDyeTexel: { value: new THREE.Vector2() },
        dt: { value: 1 / 60 },
        uAbsorb: { value: 1.1 },
        uDiffuse: { value: 30 },
        uWaterDecay: { value: 0.7 },
      }),
      absorb: makeMaterial(absorbFrag, { uDye: { value: null }, uPaper: { value: null }, dt: { value: 1 / 60 }, uAbsorb: { value: 1.1 } }, ADD),
      display: makeMaterial(
        displayFrag,
        {
          uPaper: { value: null },
          uDye: { value: null },
          uDried: { value: null },
          uDyeTexel: { value: new THREE.Vector2() },
          uPaperCol: { value: new THREE.Vector3(...rgb(PALETTE.paper)) },
          uCool: { value: new THREE.Vector3(0.028, 0.034, 0.05) },
          uWarm: { value: new THREE.Vector3(0.095, 0.062, 0.044) },
          uText: { value: null },
          uVermilion: { value: new THREE.Vector3(...rgb(PALETTE.vermilion)) },
        },
        { defines: { POSTER: 1 } },
      ),
      gallery: makeMaterial(galleryFrag, {
        uPoster: { value: null },
        uRect: { value: new THREE.Vector4(0.2, 0.2, 0.8, 0.8) },
        uStep: { value: new THREE.Vector2() },
        uAspect: { value: 1 },
        uTime: { value: 0 },
        uShow: { value: 0 },
      }),
    };
    const su = () => ({
      uBox: { value: new THREE.Vector4() },
      uA: { value: new THREE.Vector2() },
      uB: { value: new THREE.Vector2() },
      uAspect: { value: 3 / 4 },
      uRadius: { value: 0.01 },
      uValue: { value: new THREE.Vector4() },
      uS: { value: new THREE.Vector2() },
      uCaps: { value: new THREE.Vector2() },
      uDry: { value: 0 },
      uSeed: { value: this.seed },
      uPx: { value: 1 },
      uVerm: { value: 0 },
    });
    this.splatWet = makeMaterial(splatFrag, su(), { ...ADD, vertexShader: splatVert, defines: { MODE: 0 } });
    this.splatDry = makeMaterial(splatFrag, su(), { ...ADD, vertexShader: splatVert, defines: { MODE: 1 } });
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
    quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.splatMesh = new THREE.Mesh(quad, this.splatWet);
    this.splatMesh.frustumCulled = false;

    this.zeroVel = new THREE.DataTexture(new Uint8Array(4), 1, 1);
    this.zeroVel.needsUpdate = true;

    this.paper = st.target(this.PW, this.PH);
    this.dried = st.target(this.PW, this.PH, { type: half });
    this.wet = new PingPong(st, this.PW / 2, this.PH / 2, { type: half });
    this.poster = st.target(this.PW, this.PH);
    // 포스터 위 종이결: 화면에서 보던 섬유 굵기와 비슷하도록 CSS px 환산
    this.m.paper.uniforms.uSize.value.set(this.PW / 1.6, this.PH / 1.6);
    st.pass(this.m.paper, this.paper);

    this.textCanvas = document.createElement('canvas');
    this.textCanvas.width = this.PW;
    this.textCanvas.height = this.PH;
    this.textTex = new THREE.CanvasTexture(this.textCanvas);
    this.textTex.colorSpace = THREE.NoColorSpace;
    this.textTex.minFilter = THREE.LinearFilter;
    this.textTex.generateMipmaps = false;

    const d = this.m.display.uniforms;
    d.uPaper.value = this.paper.texture;
    d.uDried.value = this.dried.texture;
    d.uDyeTexel.value.set(1 / this.PW, 1 / this.PH);
    d.uText.value = this.textTex;
    const a = this.m.advect.uniforms;
    a.uVelocity.value = this.zeroVel;
    a.uPaper.value = this.paper.texture;
    a.uDyeTexel.value.set(2 / this.PW, 2 / this.PH);
    this.m.absorb.uniforms.uPaper.value = this.paper.texture;

    this.bindForm();
  }

  // ─────────── 서명 폼 ───────────
  private bindForm(): void {
    try {
      this.nameInput.value = localStorage.getItem('zanghyang:name') ?? '';
    } catch {
      /* noop */
    }
    this.nameInput.addEventListener('input', () => {
      window.clearTimeout(this.signTimer);
      this.signTimer = window.setTimeout(() => void this.drawText(), 160);
    });
    this.nameInput.addEventListener('keydown', (e) => e.stopPropagation());
    this.form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.nameInput.blur();
      void this.save();
    });
    this.replayBtn.addEventListener('click', () => this.play());
  }

  enter(_info: EnterInfo): void {
    this.app.input.handler = this;
    gsap.set(this.form, { visibility: 'visible' });
    gsap.fromTo(this.form, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 1.4, delay: 1.6, ease: 'power2.out' });
    gsap.fromTo(this.m.gallery.uniforms.uShow, { value: 0 }, { value: 1, duration: 2.2, ease: 'sine.inOut' });
    void this.drawText();
    // 새 기록이 있으면 다시 구성
    if (this.builtFrom !== this.app.recorder.strokes.length) this.compose();
    this.play();
  }

  leave(): void {
    this.replayTween?.kill();
    this.drone?.stop();
    this.drone = null;
    gsap.to(this.form, { autoAlpha: 0, duration: 0.5 });
    this.nameInput.blur();
  }

  // ─────────── 구성 ───────────
  /** 기록된 획들을 포스터 좌표와 재생 시각으로 */
  private compose(): void {
    const rec = this.app.recorder.strokes.slice();
    this.builtFrom = rec.length;
    const strokes = rec.length ? rec : synthesize();
    if (!rec.length) this.app.toast('남긴 흔적이 없어 빈 종이의 잔향을 그립니다', 3200);

    // 모든 획의 경계 (높이 단위: x 는 화면비를 곱한다)
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const s of strokes) {
      for (let i = 0; i < s.pts.length; i += STRIDE) {
        const X = s.pts[i] * s.aspect;
        const Y = s.pts[i + 1];
        x0 = Math.min(x0, X);
        x1 = Math.max(x1, X);
        y0 = Math.min(y0, Y);
        y1 = Math.max(y1, Y);
      }
    }
    const pad = 0.06;
    x0 -= pad;
    y0 -= pad;
    x1 += pad;
    y1 += pad;
    const bw = Math.max(0.3, x1 - x0);
    const bh = Math.max(0.3, y1 - y0);
    const aw = (ART.x1 - ART.x0) * this.PW;
    const ah = (ART.y1 - ART.y0) * this.PH;
    const k = Math.min(aw / bw, ah / bh);
    const ox = ART.x0 * this.PW + (aw - bw * k) / 2 - x0 * k;
    // 화면 y(아래로 증가) → 포스터 uv y(위로 증가): 위쪽 여백 = (1 - ART.y1)
    const top = (1 - ART.y1) * this.PH + (ah - bh * k) / 2;
    const oy = top - y0 * k;

    // 재생 시간표: 획 사이 공백은 압축하고 획 안의 시간은 조금 빠르게
    const sorted = strokes.slice().sort((a, b) => a.t0 - b.t0);
    let clock = 0.6;
    let lastEnd = sorted.length ? sorted[0].t0 : 0;
    const speed = 1.5;
    const tracks: Track[] = [];
    for (const s of sorted) {
      const gap = Math.min(0.32, Math.max(0, (s.t0 - lastEnd) / 1000));
      clock += gap;
      const start = clock;
      const pts: Pt[] = [];
      for (let i = 0; i < s.pts.length; i += STRIDE) {
        pts.push({
          x: s.pts[i] * s.aspect * k + ox,
          y: s.pts[i + 1] * k + oy,
          t: start + s.pts[i + 2] / 1000 / speed,
          w: s.pts[i + 3],
          i: s.pts[i + 4],
          temp: s.pts[i + 5],
          speed: s.pts[i + 6],
        });
      }
      const dur = Math.min(4, s.dur / 1000 / speed);
      clock = start + dur * 0.55; // 다음 획은 조금 겹쳐서
      lastEnd = s.t0 + s.dur;
      tracks.push({ src: s, pts, drawn: 0, start, end: start + dur, pxScale: k / s.vh, sounded: false });
    }
    // 너무 길면 전체를 압축 (최대 26초)
    let total = tracks.reduce((m, tr) => Math.max(m, tr.end), 1) + 1.2;
    const maxT = this.app.reducedMotion ? 8 : 26;
    if (total > maxT) {
      const f = maxT / total;
      for (const tr of tracks) {
        tr.start *= f;
        tr.end *= f;
        for (const p of tr.pts) p.t *= f;
      }
      total = maxT;
    }
    this.tracks = tracks;
    this.total = total;
  }

  /** 처음부터 다시 그린다 */
  private play(): void {
    if (!this.tracks.length) this.compose();
    const st = this.stage;
    st.clear(this.dried);
    st.clear(this.wet.read);
    st.clear(this.wet.write);
    for (const tr of this.tracks) {
      tr.drawn = 0;
      tr.sounded = false;
    }
    this.replay.t = 0;
    this.replayTween?.kill();
    this.saveBtn.disabled = true;
    this.replayBtn.disabled = true;
    this.drone?.stop();
    this.drone = this.app.audio.drone();
    this.replayTween = gsap.to(this.replay, {
      t: this.total,
      duration: this.total,
      ease: 'none',
      delay: 0.8,
      onComplete: () => {
        this.saveBtn.disabled = false;
        this.replayBtn.disabled = false;
        this.drone?.stop();
        this.drone = null;
        this.app.toast('서명을 남기고 포스터로 저장하세요', 3000);
      },
    });
    this.dirty = true;
  }

  // ─────────── 그리기 ───────────
  private splat(
    mat: THREE.RawShaderMaterial,
    target: THREE.WebGLRenderTarget,
    a: Pt,
    b: Pt,
    rpx: number,
    value: [number, number, number, number],
    capStart: boolean,
    capEnd: boolean,
    s0: number,
    s1: number,
    dry: number,
    verm = false,
  ): void {
    const PW = this.PW;
    const PH = this.PH;
    const ua = new THREE.Vector2(a.x / PW, 1 - a.y / PH);
    const ub = new THREE.Vector2(b.x / PW, 1 - b.y / PH);
    const r = rpx / PH;
    const asp = PW / PH;
    const u = mat.uniforms;
    const pad = r * 1.8;
    u.uBox.value.set(Math.min(ua.x, ub.x) - pad / asp, Math.min(ua.y, ub.y) - pad, Math.max(ua.x, ub.x) + pad / asp, Math.max(ua.y, ub.y) + pad);
    u.uA.value.copy(ua);
    u.uB.value.copy(ub);
    u.uAspect.value = asp;
    u.uRadius.value = r;
    u.uValue.value.set(...value);
    u.uS.value.set(s0, s1);
    u.uCaps.value.set(capStart ? 1 : 0, capEnd ? 1 : 0);
    u.uDry.value = dry;
    u.uPx.value = PH;
    u.uVerm.value = verm ? 1 : 0;
    this.splatMesh.material = mat;
    this.stage.draw(this.splatMesh, target);
  }

  /** 트랙의 새 구간을 각 방의 어법으로 그린다 */
  private drawTrack(tr: Track, from: number, to: number): void {
    const kind = tr.src.kind;
    const pts = tr.pts;
    let dist = 0;
    for (let j = 1; j <= from && j < pts.length; j++) dist += Math.hypot(pts[j].x - pts[j - 1].x, pts[j].y - pts[j - 1].y);
    const minDimPx = Math.min(tr.src.aspect, 1) * tr.src.vh * tr.pxScale; // 원래 화면 짧은 변 → 포스터 px
    for (let j = Math.max(1, from); j <= to; j++) {
      const a = pts[j - 1];
      const b = pts[j];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      const s0 = dist;
      dist += seg;
      if (kind === 'ink') {
        const rpx0 = 0.03 * minDimPx * b.w * (0.72 + 0.5 * b.i);
        const dry = clamp(smoothstep(1.1, 3.4, b.speed) * (1 - 0.6 * b.i));
        const wob = 1 + 0.18 * Math.sin(dist * 0.02 + this.seed) * Math.sin(dist * 0.0071);
        const rpx = rpx0 * wob;
        const slow = 1 - smoothstep(0.2, 2.6, b.speed);
        const amount = b.i * (0.62 + 0.55 * slow);
        if (1 - dry > 0.03) {
          this.splat(this.splatWet, this.wet.read, a, b, rpx, [amount * (1 - dry) * 1.05, b.temp, (0.85 + 0.5 * b.i) * (1 - dry), 0], j === 1, j === pts.length - 1, s0, dist, dry);
          this.wetActive = 5;
        }
        const dryK = smoothstep(0.22, 0.85, dry);
        if (dryK > 0.01 && j > 1) {
          this.splat(this.splatDry, this.dried, a, b, rpx * 0.95, [(0.55 + 0.85 * b.i) * dryK, b.temp, 0, 0], false, false, s0, dist, dry);
        }
        // 머무른 자리(진하기 높고 느림)는 먹이 고인다
        if (j === 1 && b.i > 0.6) {
          this.splat(this.splatWet, this.wet.read, a, a, rpx * (1 + b.i), [b.i * 0.8, b.temp, 0.9, 0], true, true, 0, 0, 0);
        }
      } else if (kind === 'string') {
        // 팽팽한 실 한 올 + 떨림의 잔상 (렌즈 모양으로 벌어진 겹선)
        const n = pts.length;
        const env = (q: number) => Math.sin(Math.PI * clamp(q / Math.max(1, n - 1)));
        const nx = -(b.y - a.y) / (seg || 1);
        const ny = (b.x - a.x) / (seg || 1);
        const core = Math.max(0.9, 0.55 * tr.pxScale * (0.6 + b.w));
        const amp = minDimPx * 0.012 * (tr.src.note !== undefined ? 1 : 0.5);
        this.splat(this.splatDry, this.dried, a, b, core, [0.9 + 0.5 * b.i, b.temp, 0, 0], false, false, s0, dist, 0);
        for (let g = 1; g <= 3; g++) {
          for (const sgn of [-1, 1]) {
            const off = sgn * amp * g * 0.55;
            const ea = env(j - 1) * off;
            const eb = env(j) * off;
            const ga = { ...a, x: a.x + nx * ea, y: a.y + ny * ea };
            const gb = { ...b, x: b.x + nx * eb, y: b.y + ny * eb };
            this.splat(this.splatDry, this.dried, ga, gb, core * 0.7, [0.16 / g, b.temp, 0, 0], false, false, s0, dist, 0);
          }
        }
      } else {
        // 흐름: 빗질한 듯한 가는 결 여러 올
        const nx = -(b.y - a.y) / (seg || 1);
        const ny = (b.x - a.x) / (seg || 1);
        const spread = minDimPx * (0.035 + 0.03 * b.w);
        const hairs = 9;
        for (let h = 0; h < hairs; h++) {
          const u = (h / (hairs - 1)) * 2 - 1;
          const jitter = Math.sin(dist * 0.012 + h * 1.7 + this.seed) * 0.25;
          const off = (u + jitter * 0.3) * spread;
          const offA = (u + Math.sin(s0 * 0.012 + h * 1.7 + this.seed) * 0.075) * spread;
          const ga = { ...a, x: a.x + nx * offA, y: a.y + ny * offA };
          const gb = { ...b, x: b.x + nx * off, y: b.y + ny * off };
          const amt = (0.22 + 0.25 * b.i) * (1 - Math.abs(u) * 0.6);
          const warm = b.temp > 0.35 && h % 3 === 1;
          this.splat(this.splatDry, this.dried, ga, gb, Math.max(0.8, tr.pxScale * 0.7), [warm ? amt * 1.6 : amt, b.temp, 0, 0], false, false, s0, dist, 0.35, warm);
        }
      }
    }
  }

  update(dt: number, time: number): void {
    this.time = time;
    const T = this.replay.t;
    let any = false;
    for (const tr of this.tracks) {
      if (T < tr.start || tr.drawn >= tr.pts.length - 1) continue;
      let n = tr.drawn;
      while (n < tr.pts.length - 1 && tr.pts[n + 1].t <= T) n++;
      if (n > tr.drawn) {
        this.drawTrack(tr, tr.drawn + 1, n);
        tr.drawn = n;
        any = true;
      }
      // 현이 다시 울린다
      if (!tr.sounded && tr.src.kind === 'string' && tr.src.note !== undefined && n > tr.pts.length * 0.5) {
        tr.sounded = true;
        const mid = tr.pts[Math.floor(tr.pts.length / 2)];
        this.app.audio.pluck(pentatonicHz(tr.src.note), 0.32, (mid.x / this.PW) * 1.6 - 0.8, 5, 0.3);
        haptic(4, 60);
      }
    }
    // 젖은 먹은 종이에 스며 마른다
    if (this.wetActive > 0) {
      const sdt = Math.min(dt, 1 / 30);
      const st = this.stage;
      this.m.absorb.uniforms.uDye.value = this.wet.read.texture;
      this.m.absorb.uniforms.dt.value = sdt;
      st.pass(this.m.absorb, this.dried);
      this.m.advect.uniforms.uSource.value = this.wet.read.texture;
      this.m.advect.uniforms.dt.value = sdt;
      st.pass(this.m.advect, this.wet.write);
      this.wet.swap();
      this.wetActive -= dt;
      any = true;
    }
    if (any) this.dirty = true;
  }

  private composePoster(): void {
    const d = this.m.display.uniforms;
    d.uDye.value = this.wet.read.texture;
    this.stage.pass(this.m.display, this.poster);
    this.dirty = false;
  }

  render(target: THREE.WebGLRenderTarget): void {
    if (this.dirty) this.composePoster();
    const st = this.stage;
    // 화면 배치: 아래쪽은 서명 자리
    const W = st.width;
    const H = st.height;
    const narrow = W < 560;
    const topM = Math.max(24, H * 0.07);
    const botM = narrow ? 168 : 128;
    const availH = Math.max(100, H - topM - botM);
    const availW = W - Math.max(32, W * 0.08);
    let ph = availH;
    let pw = (ph * 3) / 4;
    if (pw > availW) {
      pw = availW;
      ph = (pw * 4) / 3;
    }
    const x0 = (W - pw) / 2;
    const yTop = topM + (availH - ph) / 2;
    const g = this.m.gallery.uniforms;
    g.uRect.value.set(x0 / W, 1 - (yTop + ph) / H, (x0 + pw) / W, 1 - yTop / H);
    g.uStep.value.set(1 / (pw * st.dpr), 1 / (ph * st.dpr));
    g.uAspect.value = st.aspect;
    g.uTime.value = this.time;
    g.uPoster.value = this.poster.texture;
    st.pass(this.m.gallery, target);
  }

  // ─────────── 글씨 · 낙관 ───────────
  private async drawText(): Promise<void> {
    const name = this.nameInput.value.trim().slice(0, 12);
    try {
      localStorage.setItem('zanghyang:name', name);
    } catch {
      /* noop */
    }
    const c = this.textCanvas;
    const ctx = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    const now = new Date();
    const date = `${now.getFullYear()}. ${now.getMonth() + 1}. ${now.getDate()}.`;
    const serif = '"Noto Serif KR", "Nanum Myeongjo", serif';
    try {
      await Promise.all([
        document.fonts.load(`400 40px "Noto Serif KR"`, '殘響잔향' + name + date),
        document.fonts.load(`600 40px "Noto Serif KR"`, name || '殘響'),
      ]);
    } catch {
      /* 글꼴이 없어도 계속 */
    }
    ctx.clearRect(0, 0, W, H);
    const ink = PALETTE.ink;
    ctx.fillStyle = ink;
    ctx.textBaseline = 'alphabetic';
    const m = W * ART.x0;
    const baseY = H * 0.86;

    // 왼쪽 아래: 제목
    ctx.font = `400 ${W * 0.034}px ${serif}`;
    setSpacing(ctx, W * 0.034 * 0.5);
    ctx.textAlign = 'left';
    ctx.fillText('殘響', m, baseY);
    ctx.globalAlpha = 0.62;
    ctx.font = `400 ${W * 0.0145}px ${serif}`;
    setSpacing(ctx, W * 0.0145 * 0.35);
    ctx.fillText('잔향 — 네 개의 방에 남긴 선', m, baseY + W * 0.038);
    ctx.globalAlpha = 1;

    // 오른쪽 아래: 낙관 + 서명 + 날짜
    const seal = W * 0.088;
    const sx = W - m - seal;
    const sy = baseY - seal * 0.78;
    this.drawSeal(ctx, sx, sy, seal, name);
    ctx.textAlign = 'right';
    const tx = sx - W * 0.03;
    if (name) {
      ctx.font = `400 ${W * 0.03}px ${serif}`;
      setSpacing(ctx, W * 0.03 * 0.3);
      ctx.fillText(name, tx, baseY - W * 0.004);
    }
    ctx.globalAlpha = 0.66;
    ctx.font = `400 ${W * 0.0145}px ${serif}`;
    setSpacing(ctx, W * 0.0145 * 0.25);
    ctx.fillText(date, tx, baseY + W * 0.038);
    ctx.globalAlpha = 1;
    setSpacing(ctx, 0);

    this.textTex.needsUpdate = true;
    this.dirty = true;
  }

  /** 주홍 낙관 — 글자를 음각으로 새기고 가장자리는 거칠게 */
  private drawSeal(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, name: string): void {
    const rnd = mulberry(Math.floor(this.seed * 1000) + name.length * 31);
    ctx.save();
    ctx.fillStyle = PALETTE.vermilion;
    ctx.beginPath();
    const steps = 44;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const side = Math.floor(t * 4);
      const f = (t * 4) % 1;
      const j = () => (rnd() - 0.5) * s * 0.018;
      const pts: [number, number][] = [
        [x + f * s, y],
        [x + s, y + f * s],
        [x + s - f * s, y + s],
        [x, y + s - f * s],
      ];
      const [px, py] = pts[side];
      if (i === 0) ctx.moveTo(px + j(), py + j());
      else ctx.lineTo(px + j(), py + j());
    }
    ctx.closePath();
    ctx.fill();

    // 글자: 이름이 없으면 殘響
    const text = (name || '殘響').replace(/\s+/g, '');
    const chars = [...text];
    ctx.globalCompositeOperation = 'destination-out';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const inner = s * 0.8;
    const cx = x + s / 2;
    const cy = y + s / 2;
    const font = (px: number) => `600 ${px}px "Noto Serif KR", serif`;
    const cjk = chars.every((ch) => /[ㄱ-힝一-鿿]/.test(ch));
    if (cjk && chars.length <= 4) {
      // 세로쓰기, 오른쪽 줄부터
      const cols = chars.length <= 2 ? 1 : 2;
      const rows = Math.ceil(chars.length / cols);
      const cw = inner / cols;
      const rh = inner / rows;
      const size = Math.min(cw, rh) * 0.92;
      ctx.font = font(size);
      chars.forEach((ch, i) => {
        const col = Math.floor(i / rows);
        const row = i % rows;
        const colX = cols === 1 ? cx : cx + inner / 4 - col * cw;
        const rowsHere = cols === 2 && col === cols - 1 ? chars.length - rows : rows;
        const rhHere = inner / Math.max(1, rowsHere);
        const ry = cy - inner / 2 + rhHere * (row + 0.5);
        ctx.save();
        ctx.translate(colX, ry);
        if (rowsHere === 1 && rows > 1) ctx.scale(1, 1.7);
        ctx.fillText(ch, 0, size * 0.04);
        ctx.restore();
      });
    } else {
      let size = inner * 0.5;
      ctx.font = font(size);
      const w = ctx.measureText(text).width;
      size = Math.min(size, (size * inner) / Math.max(1, w));
      ctx.font = font(size);
      ctx.fillText(text, cx, cy);
    }
    // 인주가 덜 묻은 자리
    for (let i = 0; i < 70; i++) {
      ctx.globalAlpha = 0.25 + rnd() * 0.6;
      ctx.beginPath();
      ctx.arc(x + rnd() * s, y + rnd() * s, s * (0.004 + rnd() * 0.012), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // ─────────── 저장 ───────────
  private async save(): Promise<void> {
    await this.drawText();
    this.composePoster();
    const st = this.stage;
    const W = this.PW;
    const H = this.PH;
    const buf = new Uint8Array(W * H * 4);
    st.renderer.readRenderTargetPixels(this.poster, 0, 0, W, H, buf);
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    const img = ctx.createImageData(W, H);
    // WebGL 은 아래에서 위로 — 뒤집어 담는다
    const row = W * 4;
    for (let y = 0; y < H; y++) img.data.set(buf.subarray((H - 1 - y) * row, (H - y) * row), y * row);
    ctx.putImageData(img, 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png'));
    if (!blob) {
      this.app.toast('저장하지 못했습니다');
      return;
    }
    const name = this.nameInput.value.trim();
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    const file = `잔향_${name ? name + '_' : ''}${stamp}.png`;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    const shareFile = typeof File !== 'undefined' ? new File([blob], file, { type: 'image/png' }) : null;
    if (shareFile && matchMedia('(pointer: coarse)').matches && nav.canShare?.({ files: [shareFile] })) {
      try {
        await navigator.share({ files: [shareFile], title: '잔향 殘響' });
        return;
      } catch {
        /* 취소 → 다운로드로 */
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    this.app.toast('포스터를 저장했습니다');
    haptic(10, 0);
  }
}

function setSpacing(ctx: CanvasRenderingContext2D, px: number): void {
  (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = `${px}px`;
}

function mulberry(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 기록이 없을 때: 원 하나, 현 셋, 결 둘 — 빈 종이의 잔향 */
function synthesize(): RecordedStroke[] {
  const out: RecordedStroke[] = [];
  const mk = (room: 1 | 2 | 3, kind: RecordedStroke['kind'], pts: number[][], t0: number, note?: number): RecordedStroke => {
    const arr = new Float32Array(pts.length * STRIDE);
    pts.forEach((p, i) => arr.set(p, i * STRIDE));
    return { room, kind, t0, dur: pts[pts.length - 1][2], aspect: 1, vh: 800, pts: arr, note };
  };
  // 일원상
  const circle: number[][] = [];
  for (let i = 0; i <= 90; i++) {
    const a = -Math.PI * 0.55 + (i / 90) * Math.PI * 1.85;
    const r = 0.27 + 0.01 * Math.sin(i * 0.3);
    const sp = lerp(0.5, 3.2, i / 90);
    circle.push([0.5 + Math.cos(a) * r, 0.46 + Math.sin(a) * r, i * 14, lerp(1.1, 0.5, i / 90), lerp(0.85, 0.4, i / 90), 0.2, sp]);
  }
  out.push(mk(1, 'ink', circle, 0));
  [0.2, 0.26, 0.31].forEach((y, k) => {
    const pts: number[][] = [];
    for (let i = 0; i <= 30; i++) pts.push([0.16 + (i / 30) * 0.68, 0.74 + k * 0.045 + Math.sin((i / 30) * Math.PI) * 0.01, i * 16, 0.7, 0.5, 0, 1]);
    void y;
    out.push(mk(2, 'string', pts, 2000 + k * 700, 5 + k * 3));
  });
  for (let k = 0; k < 2; k++) {
    const pts: number[][] = [];
    for (let i = 0; i <= 50; i++) {
      const t = i / 50;
      pts.push([0.08 + t * 0.84, 0.2 + k * 0.08 + Math.sin(t * Math.PI * 1.5 + k) * 0.06, i * 12, 0.8, 0.5, k ? 0.6 : -0.4, 1.4]);
    }
    out.push(mk(3, 'flow', pts, 5000 + k * 900));
  }
  return out;
}
