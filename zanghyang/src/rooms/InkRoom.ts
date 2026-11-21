import * as THREE from 'three';
import { Room, type AppContext, type EnterInfo } from './Room';
import { PingPong, makeMaterial, type Stage } from '../core/Stage';
import type { Stroke, StrokePoint } from '../core/Input';
import { PALETTE, clamp, rgb, smoothstep } from '../core/config';
import { haptic } from '../core/haptics';
import type { NoiseVoice } from '../core/AudioEngine';

import copyFrag from '../shaders/copy.frag?raw';
import paperFrag from '../shaders/ink/paper.frag?raw';
import splatVert from '../shaders/ink/splat.vert?raw';
import splatFrag from '../shaders/ink/splat.frag?raw';
import advectDyeFrag from '../shaders/ink/advectDye.frag?raw';
import absorbFrag from '../shaders/ink/absorb.frag?raw';
import fadeFrag from '../shaders/ink/fade.frag?raw';
import displayFrag from '../shaders/ink/display.frag?raw';
import curlFrag from '../shaders/fluid/curl.frag?raw';
import vorticityFrag from '../shaders/fluid/vorticity.frag?raw';
import divergenceFrag from '../shaders/fluid/divergence.frag?raw';
import clearFrag from '../shaders/fluid/clear.frag?raw';
import pressureFrag from '../shaders/fluid/pressure.frag?raw';
import gradientFrag from '../shaders/fluid/gradient.frag?raw';
import advectFrag from '../shaders/fluid/advect.frag?raw';

const ADD = {
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendEquation: THREE.AddEquation,
} as const;

interface BrushState {
  last: StrokePoint;
  started: boolean;
  /** 붓의 마름 정도 — 획을 따라 부드럽게 변한다 */
  dry: number;
}

/** 잉크 파라미터 (먹의 성격) */
const P = {
  curl: 11,
  velDissipation: 1.15,
  absorb: 0.95,
  diffuse: 11,
  waterDecay: 0.62,
  /** 잔향: 마른 먹이 옅어지는 시간 상수(초) */
  fadeTau: 140,
  brushPx: 0.03, // 짧은 변 대비 붓 반지름
};

/**
 * 1실 · 먹 墨
 * GPU 유체(나비에-스토크스, 핑퐁 FBO) 위에 젖은 먹을 싣고, 한지가 서서히 머금는다.
 * 누른 시간 = 농도, 빠른 획 = 갈라지는 마른 붓.
 */
export class InkRoom extends Room {
  readonly index = 1;
  readonly title = '먹';
  readonly hanja = '墨';
  readonly line = '누를수록 짙고, 빠를수록 마릅니다';
  grain = 0.042;
  vignette = 0.2;

  private stage: Stage;
  private velocity!: PingPong;
  private pressure!: PingPong;
  private dye!: PingPong;
  private dried!: THREE.WebGLRenderTarget;
  private divergence!: THREE.WebGLRenderTarget;
  private curl!: THREE.WebGLRenderTarget;
  private paper!: THREE.WebGLRenderTarget;

  private m!: Record<
    'copy' | 'paper' | 'advectDye' | 'absorb' | 'fade' | 'display' | 'curl' | 'vorticity' | 'divergence' | 'clear' | 'pressure' | 'gradient' | 'advect',
    THREE.RawShaderMaterial
  >;
  private splatMesh!: THREE.Mesh;
  private splatWet!: THREE.RawShaderMaterial;
  private splatDry!: THREE.RawShaderMaterial;
  private splatVel!: THREE.RawShaderMaterial;

  private brushes = new Map<number, BrushState>();
  private lastActivity = -1e9;
  private fadeAcc = 0;
  private seed = Math.random() * 100;
  private noise: NoiseVoice | null = null;
  private brushLevel = 0;
  private time = 0;

  constructor(app: AppContext) {
    super(app);
    this.stage = app.stage;
  }

  protected init(): void {
    const common = (frag: string, uniforms: Record<string, THREE.IUniform>, o = {}) => makeMaterial(frag, uniforms, o);
    this.m = {
      copy: common(copyFrag, { uTexture: { value: null } }),
      paper: common(paperFrag, { uSize: { value: new THREE.Vector2() }, uSeed: { value: Math.random() * 50 } }),
      advectDye: common(advectDyeFrag, {
        uVelocity: { value: null },
        uSource: { value: null },
        uPaper: { value: null },
        uSimTexel: { value: new THREE.Vector2() },
        uDyeTexel: { value: new THREE.Vector2() },
        dt: { value: 0 },
        uAbsorb: { value: P.absorb },
        uDiffuse: { value: P.diffuse },
        uWaterDecay: { value: P.waterDecay },
      }),
      absorb: common(absorbFrag, { uDye: { value: null }, uPaper: { value: null }, dt: { value: 0 }, uAbsorb: { value: P.absorb } }, ADD),
      fade: common(fadeFrag, { uFactor: { value: 1 } }, {
        blending: THREE.CustomBlending,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.SrcColorFactor,
        blendEquation: THREE.AddEquation,
      }),
      display: common(displayFrag, {
        uPaper: { value: null },
        uDye: { value: null },
        uDried: { value: null },
        uDyeTexel: { value: new THREE.Vector2() },
        uPaperCol: { value: new THREE.Vector3(...rgb(PALETTE.paper)) },
        uCool: { value: new THREE.Vector3(0.028, 0.034, 0.05) },
        uWarm: { value: new THREE.Vector3(0.095, 0.062, 0.044) },
      }),
      curl: common(curlFrag, { uVelocity: { value: null }, uTexel: { value: new THREE.Vector2() } }),
      vorticity: common(vorticityFrag, {
        uVelocity: { value: null },
        uCurl: { value: null },
        uTexel: { value: new THREE.Vector2() },
        uCurlStrength: { value: P.curl },
        dt: { value: 0 },
      }),
      divergence: common(divergenceFrag, { uVelocity: { value: null }, uTexel: { value: new THREE.Vector2() } }),
      clear: common(clearFrag, { uTexture: { value: null }, uValue: { value: 0.8 } }),
      pressure: common(pressureFrag, { uPressure: { value: null }, uDivergence: { value: null }, uTexel: { value: new THREE.Vector2() } }),
      gradient: common(gradientFrag, { uPressure: { value: null }, uVelocity: { value: null }, uTexel: { value: new THREE.Vector2() } }),
      advect: common(advectFrag, {
        uVelocity: { value: null },
        uTexel: { value: new THREE.Vector2() },
        dt: { value: 0 },
        uDissipation: { value: P.velDissipation },
      }),
    };

    const splatUniforms = () => ({
      uBox: { value: new THREE.Vector4() },
      uA: { value: new THREE.Vector2() },
      uB: { value: new THREE.Vector2() },
      uAspect: { value: 1 },
      uRadius: { value: 0.02 },
      uValue: { value: new THREE.Vector4() },
      uS: { value: new THREE.Vector2() },
      uCaps: { value: new THREE.Vector2() },
      uDry: { value: 0 },
      uSeed: { value: 0 },
      uPx: { value: 1 },
    });
    this.splatWet = makeMaterial(splatFrag, splatUniforms(), { ...ADD, vertexShader: splatVert, defines: { MODE: 0 } });
    this.splatDry = makeMaterial(splatFrag, splatUniforms(), { ...ADD, vertexShader: splatVert, defines: { MODE: 1 } });
    this.splatVel = makeMaterial(splatFrag, splatUniforms(), { ...ADD, vertexShader: splatVert, defines: { MODE: 2 } });
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
    quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.splatMesh = new THREE.Mesh(quad, this.splatWet);
    this.splatMesh.frustumCulled = false;

    this.allocate();
  }

  private allocate(): void {
    const st = this.stage;
    const q = st.quality;
    const half = st.halfType;
    const [sw, sh] = st.resFor(q.simRes);
    let [dw, dh] = st.resFor(q.dyeRes);
    // 화면보다 크게 잡지 않는다
    const k = Math.min(1, st.pw / dw, st.ph / dh);
    dw = Math.round(dw * k);
    dh = Math.round(dh * k);

    const oldDye = this.dye;
    const oldDried = this.dried;
    const oldVel = this.velocity;

    this.velocity = new PingPong(st, sw, sh, { type: half });
    this.pressure = new PingPong(st, sw, sh, { type: half, filter: THREE.NearestFilter });
    this.divergence = st.target(sw, sh, { type: half, filter: THREE.NearestFilter });
    this.curl = st.target(sw, sh, { type: half, filter: THREE.NearestFilter });
    this.dye = new PingPong(st, dw, dh, { type: half });
    this.dried = st.target(dw, dh, { type: half });

    if (oldDye) {
      this.copyInto(oldDye.read, this.dye.read);
      this.copyInto(oldDried, this.dried);
      this.copyInto(oldVel.read, this.velocity.read);
      oldDye.dispose();
      oldDried.dispose();
      oldVel.dispose();
    } else {
      st.clear(this.dye.read);
      st.clear(this.dried);
      st.clear(this.velocity.read);
    }
    st.clear(this.pressure.read);

    this.paper?.dispose();
    this.paper = st.target(st.pw, st.ph);
    const pm = this.m.paper;
    pm.uniforms.uSize.value.set(st.width, st.height);
    st.pass(pm, this.paper);

    const simTexel = new THREE.Vector2(1 / sw, 1 / sh);
    for (const key of ['curl', 'vorticity', 'divergence', 'pressure', 'gradient', 'advect'] as const) {
      this.m[key].uniforms.uTexel.value.copy(simTexel);
    }
    this.m.advectDye.uniforms.uSimTexel.value.copy(simTexel);
    this.m.advectDye.uniforms.uDyeTexel.value.set(1 / dw, 1 / dh);
    this.m.display.uniforms.uDyeTexel.value.set(1 / dw, 1 / dh);
  }

  private copyInto(src: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget) {
    this.m.copy.uniforms.uTexture.value = src.texture;
    this.stage.pass(this.m.copy, dst);
  }

  resize(): void {
    if (!this.initialized) return;
    this.allocate();
  }

  requality(): void {
    if (!this.initialized) return;
    this.allocate();
  }

  enter(info: EnterInfo): void {
    this.app.input.handler = this;
    this.noise = this.app.audio.noise('bandpass');
    if (info.x !== undefined && info.y !== undefined) {
      // 입구에서 처음 만진 자리 — 큰 먹 한 방울이 피어난다
      this.drop(info.x, info.y, 1.9, 1.25);
    }
  }

  leave(): void {
    this.noise?.stop();
    this.noise = null;
    this.brushes.clear();
  }

  // ─────────── 입력 ───────────
  onStrokeStart(s: Stroke): void {
    this.brushes.set(s.id, { last: s.first, started: false, dry: 0 });
    haptic(5);
    this.lastActivity = this.time;
  }

  onStrokeMove(s: Stroke, added: StrokePoint[]): void {
    const b = this.brushes.get(s.id);
    if (!b) return;
    const minDim = Math.min(this.stage.width, this.stage.height);
    for (const p of added) {
      const r = this.radiusPx(p, minDim);
      const minSeg = Math.max(2.5, r * 0.4);
      if (Math.hypot(p.x - b.last.x, p.y - b.last.y) < minSeg) continue;
      b.dry += (this.dryness(p) - b.dry) * 0.3;
      this.segment(b.last, p, !b.started, false, b.dry);
      b.started = true;
      b.last = p;
    }
    this.lastActivity = this.time;
  }

  onStrokeEnd(s: Stroke): void {
    const b = this.brushes.get(s.id);
    if (b) {
      const p = s.last;
      if (s.isTap && !b.started) {
        // 톡 — 작은 먹점
        this.drop(p.x, p.y, 0.55 + p.intensity * 0.5, 0.6);
      } else {
        this.segment(b.last, p, !b.started, true, b.dry);
      }
    }
    this.brushes.delete(s.id);
    if (!s.isTap || s.points.length > 1) {
      this.app.recorder.record(s, 1, 'ink', this.stage.width, this.stage.height);
    }
    this.lastActivity = this.time;
  }

  onStrokeCancel(s: Stroke): void {
    this.brushes.delete(s.id);
  }

  private radiusPx(p: StrokePoint, minDim: number): number {
    return P.brushPx * minDim * p.width * (0.72 + 0.5 * p.intensity);
  }

  private dryness(p: StrokePoint): number {
    const pressBoost = Math.max(0, p.pressure - 0.5) * 0.9;
    return clamp(smoothstep(1.1, 3.4, p.speed) * (1 - 0.85 * p.hold) - pressBoost);
  }

  /** 한 마디의 붓질: 속도 · 젖은 먹 · 마른 붓을 각각의 버퍼에 */
  private segment(a: StrokePoint, b: StrokePoint, capStart: boolean, capEnd: boolean, dry: number): void {
    const st = this.stage;
    const W = st.width;
    const H = st.height;
    const minDim = Math.min(W, H);
    const rpx = this.radiusPx(b, minDim);
    const slow = 1 - smoothstep(0.2, 2.6, b.speed);
    const amount = b.intensity * (0.62 + 0.55 * slow);
    const ua = new THREE.Vector2(a.x / W, 1 - a.y / H);
    const ub = new THREE.Vector2(b.x / W, 1 - b.y / H);
    const r = rpx / H;

    // 1) 속도: 붓이 지나간 방향으로 물을 민다
    const [sw, sh] = [this.velocity.w, this.velocity.h];
    const simShort = Math.min(sw, sh);
    const v = Math.min(b.speed, 4) * simShort * 0.15 * (1 - 0.6 * dry);
    this.splat(this.splatVel, this.velocity.read, ua, ub, r * 1.7, [b.dx * v, -b.dy * v, 0, 0], capStart, capEnd, a.dist, b.dist, dry);

    // 2) 젖은 먹
    const wet = 1 - dry;
    if (wet > 0.03) {
      const water = (0.45 + 0.55 * b.intensity) * wet * (0.6 + 0.4 * slow);
      this.splat(this.splatWet, this.dye.read, ua, ub, r, [amount * wet * 0.62, b.temp, water, 0], capStart, capEnd, a.dist, b.dist, dry);
    }
    // 3) 마른 붓 — 종이에 바로, 갈라진 결
    const dryK = smoothstep(0.22, 0.85, dry);
    if (dryK > 0.01 && !capStart) {
      const dryInk = (0.55 + 0.85 * b.intensity) * dryK;
      this.splat(this.splatDry, this.dried, ua, ub, r * 0.95, [dryInk, b.temp, 0, 0], capStart, capEnd, a.dist, b.dist, dry);
    }

    // 붓 소리 (종이 마찰)
    this.brushLevel = Math.max(this.brushLevel, clamp(b.speed / 3) * (0.35 + 0.65 * b.intensity));
  }

  private splat(
    mat: THREE.RawShaderMaterial,
    target: THREE.WebGLRenderTarget,
    a: THREE.Vector2,
    b: THREE.Vector2,
    r: number,
    value: [number, number, number, number],
    capStart: boolean,
    capEnd: boolean,
    s0: number,
    s1: number,
    dry: number,
  ): void {
    const st = this.stage;
    const asp = st.aspect;
    const u = mat.uniforms;
    const pad = r * 1.75;
    const padX = pad / asp;
    u.uBox.value.set(Math.min(a.x, b.x) - padX, Math.min(a.y, b.y) - pad, Math.max(a.x, b.x) + padX, Math.max(a.y, b.y) + pad);
    u.uA.value.copy(a);
    u.uB.value.copy(b);
    u.uAspect.value = asp;
    u.uRadius.value = r;
    u.uValue.value.set(...value);
    u.uS.value.set(s0, s1);
    u.uCaps.value.set(capStart ? 1 : 0, capEnd ? 1 : 0);
    u.uDry.value = dry;
    u.uSeed.value = this.seed;
    u.uPx.value = st.height;
    this.splatMesh.material = mat;
    st.draw(this.splatMesh, target);
  }

  /** 먹 방울: 톡, 입장 — 고르지 않은 가장자리로 피어난다 */
  private drop(x: number, y: number, size: number, amount: number, temp = 0): void {
    const st = this.stage;
    const W = st.width;
    const H = st.height;
    const minDim = Math.min(W, H);
    const c = new THREE.Vector2(x / W, 1 - y / H);
    const r = (P.brushPx * minDim * size) / H;
    this.splat(this.splatWet, this.dye.read, c, c, r, [amount, temp, 0.9 + 0.3 * amount, 0], true, true, 0, 0, 0);
    // 곁방울: 둥근 원이 아니라 번진 얼룩이 되도록
    const sat = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < sat; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = r * (0.45 + Math.random() * 0.5);
      const off = new THREE.Vector2(c.x + (Math.cos(ang) * dist) / st.aspect, c.y + Math.sin(ang) * dist);
      const rr = r * (0.25 + Math.random() * 0.4);
      this.splat(this.splatWet, this.dye.read, off, off, rr, [amount * (0.4 + Math.random() * 0.5), temp, 0.8, 0], true, true, 0, 0, 0);
    }
    // 꽃잎처럼 퍼지도록 주변에 엇갈린 소용돌이
    const simShort = Math.min(this.velocity.w, this.velocity.h);
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const ang = Math.random() * Math.PI * 2;
      const rr = r * (0.5 + Math.random() * 0.7);
      const off = new THREE.Vector2(c.x + (Math.cos(ang) * rr) / st.aspect, c.y + Math.sin(ang) * rr);
      const tang = ang + (Math.random() < 0.5 ? 1 : -1) * Math.PI * 0.5 + (Math.random() - 0.5) * 1.2;
      const v = simShort * 0.1 * size * (0.4 + Math.random());
      this.splat(this.splatVel, this.velocity.read, off, off, r * (0.5 + Math.random() * 0.6), [Math.cos(tang) * v, Math.sin(tang) * v, 0, 0], true, true, 0, 0, 0);
    }
    this.lastActivity = this.time;
  }

  // ─────────── 시뮬레이션 ───────────
  update(dt: number, time: number): void {
    this.time = time;
    const st = this.stage;

    // 머무름: 멈춰 누르고 있으면 먹이 고이며 번진다
    if (this.app.input.handler === this) {
      for (const s of this.app.input.active) {
        const p = s.last;
        const still = this.app.input.now() - p.t > 45;
        if (still && p.speed < 0.25) {
          const g = 0.45 + 0.9 * p.hold;
          this.holdDab(p, dt, g);
        }
      }
    }

    // 붓 소리
    this.brushLevel *= Math.exp(-dt * 7);
    this.noise?.set(this.brushLevel * 0.09, 1500 + this.brushLevel * 2600, 0.6);

    const active = time - this.lastActivity < 7.5;
    if (active) {
      const sdt = Math.min(dt, 1 / 30);
      const m = this.m;
      // 와도 보존
      m.curl.uniforms.uVelocity.value = this.velocity.read.texture;
      st.pass(m.curl, this.curl);
      m.vorticity.uniforms.uVelocity.value = this.velocity.read.texture;
      m.vorticity.uniforms.uCurl.value = this.curl.texture;
      m.vorticity.uniforms.dt.value = sdt;
      m.vorticity.uniforms.uCurlStrength.value = this.app.reducedMotion ? P.curl * 0.4 : P.curl;
      st.pass(m.vorticity, this.velocity.write);
      this.velocity.swap();
      // 발산 → 압력 (야코비) → 기울기 빼기
      m.divergence.uniforms.uVelocity.value = this.velocity.read.texture;
      st.pass(m.divergence, this.divergence);
      m.clear.uniforms.uTexture.value = this.pressure.read.texture;
      st.pass(m.clear, this.pressure.write);
      this.pressure.swap();
      m.pressure.uniforms.uDivergence.value = this.divergence.texture;
      for (let i = 0; i < st.quality.pressureIters; i++) {
        m.pressure.uniforms.uPressure.value = this.pressure.read.texture;
        st.pass(m.pressure, this.pressure.write);
        this.pressure.swap();
      }
      m.gradient.uniforms.uPressure.value = this.pressure.read.texture;
      m.gradient.uniforms.uVelocity.value = this.velocity.read.texture;
      st.pass(m.gradient, this.velocity.write);
      this.velocity.swap();
      // 속도 이류
      m.advect.uniforms.uVelocity.value = this.velocity.read.texture;
      m.advect.uniforms.dt.value = sdt;
      st.pass(m.advect, this.velocity.write);
      this.velocity.swap();
      // 종이가 먹을 머금는다 (흡수량만큼 마른 층으로)
      m.absorb.uniforms.uDye.value = this.dye.read.texture;
      m.absorb.uniforms.uPaper.value = this.paper.texture;
      m.absorb.uniforms.dt.value = sdt;
      st.pass(m.absorb, this.dried);
      // 먹 이류 + 번짐 + 흡수
      const ad = m.advectDye.uniforms;
      ad.uVelocity.value = this.velocity.read.texture;
      ad.uSource.value = this.dye.read.texture;
      ad.uPaper.value = this.paper.texture;
      ad.dt.value = sdt;
      st.pass(m.advectDye, this.dye.write);
      this.dye.swap();
    }

    // 잔향 — 마른 먹은 아주 천천히 옅어진다 (반정밀도 해상도 때문에 모아서 적용)
    this.fadeAcc += dt;
    if (this.fadeAcc > 0.5) {
      this.m.fade.uniforms.uFactor.value = Math.exp(-this.fadeAcc / P.fadeTau);
      st.pass(this.m.fade, this.dried);
      this.fadeAcc = 0;
    }
  }

  private holdDab(p: StrokePoint, dt: number, grow: number): void {
    const st = this.stage;
    const W = st.width;
    const H = st.height;
    const minDim = Math.min(W, H);
    const c = new THREE.Vector2(p.x / W, 1 - p.y / H);
    const r = (P.brushPx * minDim * (0.75 + 1.1 * p.hold) * Math.max(0.6, p.width)) / H;
    const amt = p.intensity * dt * 1.5 * grow;
    this.splat(this.splatWet, this.dye.read, c, c, r, [amt, p.temp, dt * 2.2, 0], true, true, 0, 0, 0);
    // 미세한 소용돌이로 가장자리가 꽃처럼 일렁이게
    if (Math.random() < 0.5) {
      const ang = Math.random() * Math.PI * 2;
      const off = new THREE.Vector2(c.x + (Math.cos(ang) * r) / st.aspect, c.y + Math.sin(ang) * r);
      const v = Math.min(this.velocity.w, this.velocity.h) * (0.04 + 0.05 * p.hold);
      const tang = ang + Math.PI / 2;
      this.splat(this.splatVel, this.velocity.read, off, off, r * 0.8, [Math.cos(tang) * v, Math.sin(tang) * v, 0, 0], true, true, 0, 0, 0);
    }
    this.lastActivity = this.time;
  }

  render(target: THREE.WebGLRenderTarget): void {
    const u = this.m.display.uniforms;
    u.uPaper.value = this.paper.texture;
    u.uDye.value = this.dye.read.texture;
    u.uDried.value = this.dried.texture;
    this.stage.pass(this.m.display, target);
  }

  /** 4실에서 재사용할 수 있도록 한지 텍스처 노출 */
  get paperTexture(): THREE.Texture | null {
    return this.initialized ? this.paper.texture : null;
  }
}
