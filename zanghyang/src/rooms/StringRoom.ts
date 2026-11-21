import * as THREE from 'three';
import gsap from 'gsap';
import { Room, type AppContext, type EnterInfo } from './Room';
import { makeMaterial, type Stage } from '../core/Stage';
import type { Stroke, StrokePoint } from '../core/Input';
import { PALETTE, clamp, lerp, rgb } from '../core/config';
import { haptic } from '../core/haptics';
import { pentatonicHz } from '../core/AudioEngine';

import ribbonVert from '../shaders/string/ribbon.vert?raw';
import ribbonFrag from '../shaders/string/ribbon.frag?raw';
import bgFrag from '../shaders/string/bg.frag?raw';
import fadeFrag from '../shaders/ink/fade.frag?raw';

const MAX_STRINGS = 14;
const SUBSTEPS = 12;
const SUBDIV = 4;
const MAX_VERTS = 24000;

/** 하나의 현 — 양 끝이 고정된 Verlet 사슬, 변위에 대한 파동 방정식으로 떤다. */
class Str {
  n: number;
  /** 정지 모양 (CSS px) */
  rest: Float32Array;
  /** 정지 모양에 대한 변위 (현재/이전) */
  d: Float32Array;
  dp: Float32Array;
  /** 마디별 굵기 */
  w: Float32Array;
  length: number;
  note: number;
  hz: number;
  /** 파동 속도 (λ = (c·dt/dx)²) */
  lambda: number;
  damp: number;
  energy = 0;
  flash: Float32Array;
  alpha = 0;
  dying = false;
  intensity: number;
  temp: number;
  grab = -1;
  grabX = 0;
  grabY = 0;
  born: number;
  lastPluck = -1;

  constructor(points: { x: number; y: number; w: number }[], note: number, intensity: number, temp: number, born: number) {
    this.n = points.length;
    this.rest = new Float32Array(this.n * 2);
    this.d = new Float32Array(this.n * 2);
    this.dp = new Float32Array(this.n * 2);
    this.w = new Float32Array(this.n);
    this.flash = new Float32Array(this.n);
    let len = 0;
    for (let i = 0; i < this.n; i++) {
      this.rest[i * 2] = points[i].x;
      this.rest[i * 2 + 1] = points[i].y;
      this.w[i] = points[i].w;
      if (i) len += Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    }
    this.length = len;
    this.note = note;
    this.hz = pentatonicHz(note);
    // 눈에 보이는 진동수: 음이 높을수록 빠르게 (프레임과 엇갈리며 잔상 렌즈를 만든다)
    const fVis = lerp(7, 19, note / 14);
    const s = clamp((fVis * 2 * (this.n - 1)) / (60 * SUBSTEPS), 0.05, 0.92);
    this.lambda = s * s;
    // 낮은 음은 오래 울린다
    const t60 = lerp(5.5, 2.4, note / 14);
    this.damp = 1 - Math.pow(0.001, 1 / (t60 * 60 * SUBSTEPS));
    this.intensity = intensity;
    this.temp = temp;
    this.born = born;
  }

  x(i: number) {
    return this.rest[i * 2] + this.d[i * 2];
  }
  y(i: number) {
    return this.rest[i * 2 + 1] + this.d[i * 2 + 1];
  }

  step(): void {
    const n = this.n;
    const L = this.lambda;
    const k = 1 - this.damp;
    const d = this.d;
    const dp = this.dp;
    let e = 0;
    // 내부 마디만 (양 끝은 고정)
    for (let c = 0; c < 2; c++) {
      let prev = d[c];
      for (let i = 1; i < n - 1; i++) {
        const j = i * 2 + c;
        const cur = d[j];
        const next = d[j + 2];
        const lap = prev + next - 2 * cur;
        const nv = cur + (cur - dp[j]) * k + L * lap;
        dp[j] = cur;
        d[j] = nv;
        prev = cur;
        e += Math.abs(nv - cur);
      }
    }
    if (this.grab >= 0) this.applyGrab();
    // 마디당 평균 움직임(px/스텝) → 0..1 근방
    this.energy = this.energy * 0.9 + (e / (2 * n)) * 0.6 * 0.1;
  }

  /** 손가락이 잡은 자리까지 삼각형으로 당긴다 */
  applyGrab(): void {
    const g = this.grab;
    const n = this.n;
    const gx = this.grabX - this.rest[g * 2];
    const gy = this.grabY - this.rest[g * 2 + 1];
    for (let i = 1; i < n - 1; i++) {
      const f = i <= g ? i / g : (n - 1 - i) / (n - 1 - g);
      this.d[i * 2] = this.dp[i * 2] = gx * f;
      this.d[i * 2 + 1] = this.dp[i * 2 + 1] = gy * f;
    }
  }

  /** 가장 가까운 마디와 거리 */
  nearest(px: number, py: number): { i: number; dist: number } {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.n; i++) {
      const dd = Math.hypot(this.x(i) - px, this.y(i) - py);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    }
    // 마디 사이 선분까지의 거리로 보정
    let segD = bd;
    for (let i = Math.max(0, best - 1); i < Math.min(this.n - 1, best + 1); i++) {
      segD = Math.min(segD, distToSeg(px, py, this.x(i), this.y(i), this.x(i + 1), this.y(i + 1)));
    }
    return { i: best, dist: segD };
  }

  /** 선분 (ax,ay)-(bx,by) 와 교차하는 마디 */
  crossing(ax: number, ay: number, bx: number, by: number): number {
    for (let i = 0; i < this.n - 1; i++) {
      if (segIntersect(ax, ay, bx, by, this.x(i), this.y(i), this.x(i + 1), this.y(i + 1))) return i;
    }
    return -1;
  }

  /** 지나가며 튕김: 속도 충격 (삼각형 분포) */
  strike(i: number, vx: number, vy: number): void {
    const n = this.n;
    i = clamp(i, 1, n - 2);
    for (let j = 1; j < n - 1; j++) {
      const f = j <= i ? j / i : (n - 1 - j) / (n - 1 - i);
      const ff = Math.pow(f, 3);
      this.dp[j * 2] -= vx * ff;
      this.dp[j * 2 + 1] -= vy * ff;
    }
  }
}

function distToSeg(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const abx = bx - ax;
  const aby = by - ay;
  const t = clamp(((px - ax) * abx + (py - ay) * aby) / (abx * abx + aby * aby + 1e-9));
  return Math.hypot(px - (ax + abx * t), py - (ay + aby * t));
}

function segIntersect(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

interface StrokeState {
  grab: Str | null;
  crossed: Set<Str>;
  lastPluck: Map<Str, number>;
}

/**
 * 2실 · 현 絃
 * 그은 선이 실이 된다. 손가락으로 튕기면 떨림과 소리 — 길이가 음높이(펜타토닉).
 */
export class StringRoom extends Room {
  readonly index = 2;
  readonly title = '현';
  readonly hanja = '絃';
  readonly line = '선을 긋고, 튕겨 보세요';
  grain = 0.05;
  vignette = 0.28;

  private stage: Stage;
  private strings: Str[] = [];
  private states = new Map<number, StrokeState>();
  private geo!: THREE.BufferGeometry;
  private pos!: Float32Array;
  private aux!: Float32Array;
  private mesh!: THREE.Mesh;
  private crisp!: THREE.RawShaderMaterial;
  private glow!: THREE.RawShaderMaterial;
  private bg!: THREE.RawShaderMaterial;
  private fade!: THREE.RawShaderMaterial;
  private trail!: THREE.WebGLRenderTarget;
  private ripples: THREE.Vector4[] = [];
  private rippleIdx = 0;
  private time = 0;
  private dt = 1 / 60;

  constructor(app: AppContext) {
    super(app);
    this.stage = app.stage;
  }

  protected init(): void {
    const st = this.stage;
    this.pos = new Float32Array(MAX_VERTS * 2);
    this.aux = new Float32Array(MAX_VERTS * 4);
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 2).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aux', new THREE.BufferAttribute(this.aux, 4).setUsage(THREE.DynamicDrawUsage));
    this.geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e9);
    const paper = new THREE.Vector3(...rgb(PALETTE.paper));
    const verm = new THREE.Vector3(...rgb(PALETTE.vermilion));
    const ribbonU = (gain: number, aa: number) => ({
      uSize: { value: new THREE.Vector2(st.width, st.height) },
      uPaper: { value: paper },
      uVermilion: { value: verm },
      uGain: { value: gain },
      uAA: { value: aa },
    });
    this.crisp = makeMaterial(ribbonFrag, ribbonU(1, 0.5), {
      vertexShader: ribbonVert,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    this.glow = makeMaterial(ribbonFrag, ribbonU(0.22, 1), {
      vertexShader: ribbonVert,
      blending: THREE.CustomBlending,
      blendSrc: THREE.SrcAlphaFactor,
      blendDst: THREE.OneFactor,
    });
    this.mesh = new THREE.Mesh(this.geo, this.crisp);
    this.mesh.frustumCulled = false;

    for (let i = 0; i < 8; i++) this.ripples.push(new THREE.Vector4(0, 0, -100, 0));
    this.bg = makeMaterial(bgFrag, {
      uTrail: { value: null },
      uTime: { value: 0 },
      uAspect: { value: st.aspect },
      uSize: { value: new THREE.Vector2(st.width, st.height) },
      uRipples: { value: this.ripples },
      uPaper: { value: paper },
      uVermilion: { value: verm },
    });
    this.fade = makeMaterial(fadeFrag, { uFactor: { value: 0.85 } }, {
      blending: THREE.CustomBlending,
      blendSrc: THREE.ZeroFactor,
      blendDst: THREE.SrcColorFactor,
    });
    this.allocate();
  }

  private allocate(): void {
    const st = this.stage;
    this.trail?.dispose();
    this.trail = st.target(st.pw * 0.5, st.ph * 0.5, { type: st.halfType });
    st.clear(this.trail);
  }

  resize(w: number, h: number): void {
    if (!this.initialized) return;
    this.allocate();
    this.crisp.uniforms.uSize.value.set(w, h);
    this.glow.uniforms.uSize.value.set(w, h);
    this.bg.uniforms.uSize.value.set(w, h);
    this.bg.uniforms.uAspect.value = this.stage.aspect;
  }

  enter(_info: EnterInfo): void {
    this.app.input.handler = this;
    if (this.strings.length === 0) this.seed();
  }

  leave(): void {
    for (const s of this.strings) s.grab = -1;
    this.states.clear();
  }

  /** 빈 방이 아니도록 처음엔 가느다란 현 셋 */
  private seed(): void {
    const W = this.stage.width;
    const H = this.stage.height;
    const portrait = H > W;
    const defs = portrait
      ? [
          [0.18, 0.3, 0.82, 0.26, 11],
          [0.12, 0.5, 0.88, 0.53, 7],
          [0.22, 0.7, 0.76, 0.69, 9],
        ]
      : [
          [0.22, 0.34, 0.78, 0.31, 9],
          [0.16, 0.5, 0.84, 0.52, 5],
          [0.28, 0.66, 0.68, 0.64, 11],
        ];
    defs.forEach(([x0, y0, x1, y1, note], k) => {
      const pts: { x: number; y: number; w: number }[] = [];
      const n = 28;
      for (let i = 0; i < n; i++) {
        const t = i / (n - 1);
        pts.push({ x: lerp(x0, x1, t) * W, y: lerp(y0, y1, t) * H + Math.sin(t * Math.PI) * H * 0.012 * (k - 1), w: 0.7 });
      }
      const s = new Str(pts, note, 0.5, 0, this.time);
      s.alpha = 0;
      gsap.to(s, { alpha: 0.55, duration: 2.5, delay: 1.2 + k * 0.5, ease: 'sine.out' });
      this.strings.push(s);
    });
  }

  // ─────────── 입력 ───────────
  onStrokeStart(s: Stroke): void {
    const p = s.first;
    const st: StrokeState = { grab: null, crossed: new Set(), lastPluck: new Map() };
    // 현 가까이에서 시작하면 붙잡아 당긴다
    const grabR = Math.max(18, Math.min(this.stage.width, this.stage.height) * 0.035);
    let best: Str | null = null;
    let bi = -1;
    let bd = grabR;
    for (const str of this.strings) {
      if (str.dying) continue;
      const { i, dist } = str.nearest(p.x, p.y);
      if (dist < bd && i > 0 && i < str.n - 1) {
        bd = dist;
        best = str;
        bi = i;
      }
    }
    if (best) {
      st.grab = best;
      best.grab = bi;
      best.grabX = p.x;
      best.grabY = p.y;
      haptic(4);
    }
    this.states.set(s.id, st);
  }

  onStrokeMove(s: Stroke, added: StrokePoint[]): void {
    const st = this.states.get(s.id);
    if (!st) return;
    const pts = s.points;
    if (st.grab) {
      const g = st.grab;
      const p = s.last;
      const rx = g.rest[g.grab * 2];
      const ry = g.rest[g.grab * 2 + 1];
      const pull = Math.hypot(p.x - rx, p.y - ry);
      const maxPull = Math.max(30, g.length * 0.16);
      if (pull > maxPull) {
        // 너무 당기면 손에서 미끄러져 튕겨 나간다
        this.release(g, p.x, p.y);
        st.grab = null;
      } else {
        g.grabX = p.x;
        g.grabY = p.y;
      }
      return;
    }
    // 지나가며 튕기기 (스트럼)
    const now = this.app.input.now();
    for (let k = 0; k < added.length; k++) {
      const b = added[k];
      const idx = pts.length - added.length + k;
      const a = pts[idx - 1];
      if (!a) continue;
      for (const str of this.strings) {
        if (str.dying || str.alpha < 0.2) continue;
        const i = str.crossing(a.x, a.y, b.x, b.y);
        if (i < 0) continue;
        const lastT = st.lastPluck.get(str) ?? -1e9;
        if (now - lastT < 90) continue;
        st.lastPluck.set(str, now);
        st.crossed.add(str);
        const v = clamp(b.speed / 3, 0.15, 1.2);
        const mag = 6 + 22 * v;
        str.strike(i, b.dx * mag * 0.5, b.dy * mag * 0.5);
        this.sound(str, i, 0.25 + 0.6 * clamp(v), b);
      }
    }
  }

  onStrokeEnd(s: Stroke): void {
    const st = this.states.get(s.id);
    this.states.delete(s.id);
    if (!st) return;
    if (st.grab) {
      this.release(st.grab, s.last.x, s.last.y);
      this.app.recorder.record(s, 2, 'string', this.stage.width, this.stage.height, { note: st.grab.note });
      return;
    }
    if (s.isTap) {
      // 톡 — 가까운 현을 가볍게
      const p = s.last;
      for (const str of this.strings) {
        const { i, dist } = str.nearest(p.x, p.y);
        if (dist < 26 && i > 0 && i < str.n - 1) {
          str.strike(i, 0, -9);
          this.sound(str, i, 0.35, p);
          break;
        }
      }
      return;
    }
    const minDim = Math.min(this.stage.width, this.stage.height);
    const avgSpeed = s.length / Math.max(1, s.duration) / (minDim / 1000);
    // 빠르게 휙 — 가로지른 현이 있으면 튕기기만 하고 새 현은 만들지 않는다
    const strum = st.crossed.size > 0 && (avgSpeed > 2.3 || s.duration < 280);
    if (!strum && s.length > minDim * 0.09) {
      const str = this.create(s);
      this.app.recorder.record(s, 2, 'string', this.stage.width, this.stage.height, { note: str?.note });
    } else {
      this.app.recorder.record(s, 2, 'string', this.stage.width, this.stage.height);
    }
  }

  onStrokeCancel(s: Stroke): void {
    const st = this.states.get(s.id);
    if (st?.grab) st.grab.grab = -1;
    this.states.delete(s.id);
  }

  private release(g: Str, x: number, y: number): void {
    const i = g.grab;
    const rx = g.rest[i * 2];
    const ry = g.rest[i * 2 + 1];
    const pull = Math.hypot(x - rx, y - ry);
    g.grab = -1;
    const amp = clamp(pull / Math.max(30, g.length * 0.12), 0.08, 1);
    const fake = { x: rx, y: ry, temp: g.temp } as StrokePoint;
    this.sound(g, i, 0.2 + 0.8 * amp, fake);
  }

  /** 획을 균일 간격으로 다시 뽑아 현으로 */
  private create(s: Stroke): Str | null {
    const src = s.points;
    const total = s.length;
    const n = Math.round(clamp(total / 14, 16, 44));
    const out: { x: number; y: number; w: number }[] = [];
    let j = 0;
    let iSum = 0;
    let tSum = 0;
    for (const p of src) {
      iSum += p.intensity;
      tSum += p.temp;
    }
    for (let k = 0; k < n; k++) {
      const target = (k / (n - 1)) * total;
      while (j < src.length - 2 && src[j + 1].dist < target) j++;
      const a = src[j];
      const b = src[Math.min(j + 1, src.length - 1)];
      const seg = Math.max(1e-6, b.dist - a.dist);
      const t = clamp((target - a.dist) / seg);
      out.push({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), w: lerp(a.width, b.width, t) });
    }
    // 정지 모양을 조금 매끄럽게 (팽팽해지는 느낌)
    for (let it = 0; it < 3; it++) {
      for (let k = 1; k < n - 1; k++) {
        out[k].x = lerp(out[k].x, (out[k - 1].x + out[k + 1].x) * 0.5, 0.35);
        out[k].y = lerp(out[k].y, (out[k - 1].y + out[k + 1].y) * 0.5, 0.35);
      }
    }
    const W = this.stage.width;
    const H = this.stage.height;
    const diag = Math.hypot(W, H);
    // 길이 → 음높이: 길수록 낮게 (펜타토닉 15음)
    const norm = clamp(total / (diag * 0.85));
    const note = Math.round(clamp(1 - Math.sqrt(norm)) * 13) + 1;
    const str = new Str(out, note, iSum / src.length, tSum / src.length, this.time);
    // 처음엔 그은 모양에서 출발해 팽팽히 당겨지며 울린다
    for (let k = 1; k < n - 1; k++) {
      const raw = src[Math.min(src.length - 1, Math.round((k / (n - 1)) * (src.length - 1)))];
      str.d[k * 2] = str.dp[k * 2] = (raw.x - out[k].x) * 0.6;
      str.d[k * 2 + 1] = str.dp[k * 2 + 1] = (raw.y - out[k].y) * 0.6;
    }
    str.alpha = 0;
    gsap.to(str, { alpha: 0.35 + 0.6 * str.intensity, duration: 0.5, ease: 'sine.out' });
    this.strings.push(str);
    // 넘치면 가장 오래된 현부터 사라진다
    const alive = this.strings.filter((x) => !x.dying);
    if (alive.length > MAX_STRINGS) {
      const old = alive[0];
      old.dying = true;
      gsap.to(old, { alpha: 0, duration: 2.5, ease: 'sine.in', onComplete: () => (this.strings = this.strings.filter((x) => x !== old)) });
    }
    const mid = Math.floor(n / 2);
    this.sound(str, mid, 0.3, src[Math.floor(src.length / 2)]);
    return str;
  }

  private sound(str: Str, i: number, amp: number, p: Pick<StrokePoint, 'x' | 'y' | 'temp'>): void {
    const W = this.stage.width;
    const pan = ((p.x / W) * 2 - 1) * 0.8;
    // 튕긴 자리가 끝에 가까울수록 배음이 밝다
    const pos = i / (str.n - 1);
    const bright = 1 - Math.sin(pos * Math.PI) * 0.7;
    this.app.audio.pluck(str.hz, amp, pan, lerp(6, 2.6, str.note / 14), bright);
    // 주홍 불꽃: 튕긴 자리에서 번져 나간다
    for (let k = 0; k < str.n; k++) {
      const f = Math.exp(-Math.pow((k - i) / (str.n * 0.08 + 1), 2));
      str.flash[k] = Math.max(str.flash[k], f * clamp(0.4 + amp));
    }
    str.lastPluck = this.time;
    const r = this.ripples[this.rippleIdx++ % this.ripples.length];
    r.set(str.x(i), str.y(i), this.time, clamp(amp, 0.2, 1));
    haptic(6 + amp * 6, 30);
  }

  // ─────────── 시뮬레이션 ───────────
  update(dt: number, time: number): void {
    this.time = time;
    this.dt = dt;
    const steps = Math.round(SUBSTEPS * clamp(dt * 60, 0.5, 2));
    for (const s of this.strings) {
      for (let k = 0; k < steps; k++) s.step();
      const fd = Math.exp(-dt * 1.6);
      for (let i = 0; i < s.n; i++) s.flash[i] *= fd;
    }
  }

  /** 현 리본 메시 구성 (Catmull-Rom 세분) */
  private build(includeLive: boolean): number {
    const pos = this.pos;
    const aux = this.aux;
    let v = 0;
    const px: number[] = [];
    const py: number[] = [];
    const pw: number[] = [];
    const pf: number[] = [];
    const lx: number[] = [];
    const ly: number[] = [];
    const rx: number[] = [];
    const ry: number[] = [];
    const put = (x: number, y: number, side: number, a: number, f: number, temp: number) => {
      pos[v * 2] = x;
      pos[v * 2 + 1] = y;
      aux[v * 4] = side;
      aux[v * 4 + 1] = a;
      aux[v * 4 + 2] = f;
      aux[v * 4 + 3] = temp;
      v++;
    };
    /** px/py 폴리라인을 두께 있는 리본(삼각형 목록)으로 */
    const pushStrip = (alpha: number, temp: number, glow: boolean) => {
      const m = px.length;
      if (m < 2 || v + (m - 1) * 6 > MAX_VERTS) return;
      lx.length = ly.length = rx.length = ry.length = 0;
      for (let i = 0; i < m; i++) {
        const i0 = Math.max(0, i - 1);
        const i1 = Math.min(m - 1, i + 1);
        const tx = px[i1] - px[i0];
        const ty = py[i1] - py[i0];
        const tl = Math.hypot(tx, ty) || 1;
        const nx = -ty / tl;
        const ny = tx / tl;
        // 굵기 + 안티앨리어싱 여유, 양 끝은 가늘게
        const half = (glow ? 3.2 : 0.55) * pw[i] + (glow ? 2.5 : 0.9);
        const taper = Math.min(1, Math.min(i, m - 1 - i) / 3 + 0.35);
        const hw = half * taper;
        lx.push(px[i] + nx * hw);
        ly.push(py[i] + ny * hw);
        rx.push(px[i] - nx * hw);
        ry.push(py[i] - ny * hw);
      }
      for (let i = 1; i < m; i++) {
        const fa = pf[i - 1];
        const fb = pf[i];
        put(lx[i - 1], ly[i - 1], 1, alpha, fa, temp);
        put(rx[i - 1], ry[i - 1], -1, alpha, fa, temp);
        put(lx[i], ly[i], 1, alpha, fb, temp);
        put(rx[i - 1], ry[i - 1], -1, alpha, fa, temp);
        put(rx[i], ry[i], -1, alpha, fb, temp);
        put(lx[i], ly[i], 1, alpha, fb, temp);
      }
    };

    const glow = !includeLive;
    for (const s of this.strings) {
      if (s.alpha <= 0.002) continue;
      px.length = py.length = pw.length = pf.length = 0;
      const n = s.n;
      for (let i = 0; i < n - 1; i++) {
        const i0 = Math.max(0, i - 1);
        const i2 = Math.min(n - 1, i + 1);
        const i3 = Math.min(n - 1, i + 2);
        for (let k = 0; k < SUBDIV; k++) {
          const t = k / SUBDIV;
          px.push(catmull(s.x(i0), s.x(i), s.x(i2), s.x(i3), t));
          py.push(catmull(s.y(i0), s.y(i), s.y(i2), s.y(i3), t));
          pw.push(lerp(s.w[i], s.w[i2], t));
          pf.push(lerp(s.flash[i], s.flash[i2], t));
        }
      }
      px.push(s.x(n - 1));
      py.push(s.y(n - 1));
      pw.push(s.w[n - 1]);
      pf.push(s.flash[n - 1]);
      const e = clamp(s.energy * 0.6);
      const alpha = glow ? s.alpha * (0.12 + 0.9 * e) * clamp(this.dt * 60, 0.25, 4) : s.alpha * (0.75 + 0.25 * e);
      pushStrip(alpha, s.temp, glow);
      if (!glow) {
        // 양 끝의 작은 못 (안족)
        for (const end of [0, n - 1]) {
          px.length = py.length = pw.length = pf.length = 0;
          const ex = s.x(end);
          const ey = s.y(end);
          px.push(ex - 2.2, ex + 2.2);
          py.push(ey, ey);
          pw.push(3.4, 3.4);
          pf.push(0, 0);
          pushStrip(s.alpha * 0.8, s.temp, false);
        }
      }
    }
    // 긋는 중인 선: 아직 실이 되기 전의 희미한 획
    if (includeLive) {
      for (const stroke of this.app.input.active) {
        const st = this.states.get(stroke.id);
        if (!st || st.grab) continue;
        px.length = py.length = pw.length = pf.length = 0;
        const pts = stroke.points;
        const step = Math.max(1, Math.floor(pts.length / 400));
        for (let i = 0; i < pts.length; i += step) {
          px.push(pts[i].x);
          py.push(pts[i].y);
          pw.push(pts[i].width * 0.8);
          pf.push(0);
        }
        pushStrip(0.32, stroke.last.temp, false);
      }
    }
    return Math.max(0, v);
  }

  render(target: THREE.WebGLRenderTarget): void {
    const st = this.stage;
    // 1) 잔상: 흐려지며 남는 떨림의 궤적
    this.fade.uniforms.uFactor.value = Math.exp(-this.dt * (this.app.reducedMotion ? 30 : 10));
    st.pass(this.fade, this.trail);
    const nGlow = this.build(false);
    this.geo.setDrawRange(0, nGlow);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aux.needsUpdate = true;
    this.mesh.material = this.glow;
    st.draw(this.mesh, this.trail);
    // 2) 배경 + 잔상 + 물결
    const u = this.bg.uniforms;
    u.uTrail.value = this.trail.texture;
    u.uTime.value = this.time;
    st.pass(this.bg, target);
    // 3) 또렷한 현
    const n = this.build(true);
    this.geo.setDrawRange(0, n);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.aux.needsUpdate = true;
    this.mesh.material = this.crisp;
    st.draw(this.mesh, target);
  }
}

function catmull(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

