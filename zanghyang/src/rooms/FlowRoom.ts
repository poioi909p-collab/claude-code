import * as THREE from 'three';
import gsap from 'gsap';
import { Room, type AppContext, type EnterInfo } from './Room';
import { PingPong, makeMaterial, type Stage } from '../core/Stage';
import type { Stroke, StrokePoint } from '../core/Input';
import { PALETTE, clamp, rgb } from '../core/config';
import { haptic } from '../core/haptics';
import type { NoiseVoice } from '../core/AudioEngine';

import initFrag from '../shaders/flow/init.frag?raw';
import fieldFrag from '../shaders/flow/field.frag?raw';
import splatFrag from '../shaders/flow/splat.frag?raw';
import splatVert from '../shaders/ink/splat.vert?raw';
import updateFrag from '../shaders/flow/update.frag?raw';
import pointsVert from '../shaders/flow/points.vert?raw';
import pointsFrag from '../shaders/flow/points.frag?raw';
import displayFrag from '../shaders/flow/display.frag?raw';
import fadeFrag from '../shaders/ink/fade.frag?raw';

const ADD = {
  blending: THREE.CustomBlending,
  blendSrc: THREE.OneFactor,
  blendDst: THREE.OneFactor,
  blendEquation: THREE.AddEquation,
} as const;

type OrientationPermission = { requestPermission?: () => Promise<'granted' | 'denied'> };

/**
 * 3실 · 흐름 流
 * 손짓이 흐름장(결)이 되고, 5만~10만 개의 GPU 파티클이 그 결을 따라 흐른다.
 * 모바일은 기울기가 중력이 된다.
 */
export class FlowRoom extends Room {
  readonly index = 3;
  readonly title = '흐름';
  readonly hanja = '流';
  readonly line = '손짓이 결이 됩니다';
  grain = 0.05;
  vignette = 0.3;

  private stage: Stage;
  private state!: PingPong;
  private field!: PingPong;
  private trail!: THREE.WebGLRenderTarget;
  private m!: Record<'init' | 'field' | 'update' | 'display' | 'fade', THREE.RawShaderMaterial>;
  private splatLine!: THREE.RawShaderMaterial;
  private splatSpin!: THREE.RawShaderMaterial;
  private splatMesh!: THREE.Mesh;
  private points!: THREE.Points;
  private pointsMat!: THREE.RawShaderMaterial;
  private texSize: [number, number] = [256, 256];
  private last = new Map<number, StrokePoint>();
  private gravity = new THREE.Vector2();
  private gravityTarget = new THREE.Vector2();
  private tiltBound = false;
  private time = 0;
  private dt = 1 / 60;
  private frame = 0;
  private noise: NoiseVoice | null = null;
  private wind = 0;
  private tiltBtn = document.getElementById('tilt-permission') as HTMLButtonElement;

  constructor(app: AppContext) {
    super(app);
    this.stage = app.stage;
  }

  protected init(): void {
    this.m = {
      init: makeMaterial(initFrag, { uSeed: { value: Math.random() * 1000 } }),
      field: makeMaterial(fieldFrag, { uField: { value: null }, uTexel: { value: new THREE.Vector2() }, uDecay: { value: 1 } }),
      update: makeMaterial(updateFrag, {
        uState: { value: null },
        uField: { value: null },
        dt: { value: 0 },
        uTime: { value: 0 },
        uAspect: { value: 1 },
        uGravity: { value: this.gravity },
        uFrame: { value: 0 },
        uMotion: { value: this.app.reducedMotion ? 0.45 : 1 },
      }),
      display: makeMaterial(displayFrag, {
        uTrail: { value: null },
        uPaper: { value: new THREE.Vector3(...rgb(PALETTE.paper)) },
        uAspect: { value: 1 },
        uTime: { value: 0 },
      }),
      fade: makeMaterial(fadeFrag, { uFactor: { value: 0.9 } }, {
        blending: THREE.CustomBlending,
        blendSrc: THREE.ZeroFactor,
        blendDst: THREE.SrcColorFactor,
      }),
    };
    const su = () => ({
      uBox: { value: new THREE.Vector4() },
      uA: { value: new THREE.Vector2() },
      uB: { value: new THREE.Vector2() },
      uAspect: { value: 1 },
      uRadius: { value: 0.05 },
      uValue: { value: new THREE.Vector4() },
      uCaps: { value: new THREE.Vector2(1, 1) },
    });
    this.splatLine = makeMaterial(splatFrag, su(), { ...ADD, vertexShader: splatVert, defines: { MODE: 0 } });
    this.splatSpin = makeMaterial(splatFrag, su(), { ...ADD, vertexShader: splatVert, defines: { MODE: 1 } });
    const quad = new THREE.BufferGeometry();
    quad.setAttribute('position', new THREE.BufferAttribute(new Float32Array([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1]), 2));
    quad.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.splatMesh = new THREE.Mesh(quad, this.splatLine);
    this.splatMesh.frustumCulled = false;

    this.pointsMat = makeMaterial(
      pointsFrag,
      {
        uState: { value: null },
        uField: { value: null },
        uTex: { value: new THREE.Vector2(1, 1) },
        uSize: { value: 1 },
        uBright: { value: 0.05 },
        uDt60: { value: 1 },
        uCool: { value: new THREE.Vector3(0.84, 0.92, 1.05) },
        uWarm: { value: new THREE.Vector3(...rgb(PALETTE.vermilion)).multiplyScalar(1.15) },
      },
      { ...ADD, vertexShader: pointsVert },
    );
    this.allocate(true);
  }

  private allocate(fresh: boolean): void {
    const st = this.stage;
    const q = st.quality;
    const [tw, th] = q.particleTex;
    if (fresh || tw !== this.texSize[0]) {
      this.texSize = [tw, th];
      this.state?.dispose();
      this.state = new PingPong(st, tw, th, { type: st.floatType, filter: THREE.NearestFilter });
      st.pass(this.m.init, this.state.read);
      this.points?.geometry.dispose();
      const geo = new THREE.BufferGeometry();
      // gl_VertexID 로 상태 텍스처를 읽으므로 위치 속성은 자리만 차지한다
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(tw * th * 3), 3));
      geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
      this.points = new THREE.Points(geo, this.pointsMat);
      this.points.frustumCulled = false;
      this.pointsMat.uniforms.uTex.value.set(tw, th);
    }
    const [fw, fh] = st.resFor(q.tier === 'high' ? 128 : 96);
    const old = this.field;
    this.field = new PingPong(st, fw, fh, { type: st.halfType });
    st.clear(this.field.read);
    old?.dispose();
    this.m.field.uniforms.uTexel.value.set(1 / fw, 1 / fh);

    this.trail?.dispose();
    const ts = q.trailScale;
    this.trail = st.target(st.pw * ts, st.ph * ts, { type: st.halfType });
    st.clear(this.trail);
    const size = Math.max(1, st.dpr * ts * 1.1);
    this.pointsMat.uniforms.uSize.value = size;
    // 화면 면적 대비 빛의 밀도를 기기와 무관하게 맞춘다 (기준: 1280×800, 10만 개)
    const density = (st.pw * ts * st.ph * ts) / (tw * th * size * size) / 8.3;
    this.pointsMat.uniforms.uBright.value = 0.05 * clamp(density, 0.3, 1.8);
  }

  resize(): void {
    if (this.initialized) this.allocate(false);
  }

  requality(): void {
    if (this.initialized) this.allocate(false);
  }

  enter(_info: EnterInfo): void {
    this.app.input.handler = this;
    this.noise = this.app.audio.noise();
    this.bindTilt();
  }

  leave(): void {
    this.noise?.stop();
    this.noise = null;
    this.last.clear();
    gsap.to(this.tiltBtn, { autoAlpha: 0, duration: 0.4 });
  }

  // ─────────── 기울기 (DeviceOrientation) ───────────
  private bindTilt(): void {
    if (this.tiltBound || typeof DeviceOrientationEvent === 'undefined') return;
    const coarse = matchMedia('(pointer: coarse)').matches;
    if (!coarse) return;
    const DOE = DeviceOrientationEvent as unknown as OrientationPermission;
    const listen = () => {
      if (this.tiltBound) return;
      this.tiltBound = true;
      window.addEventListener('deviceorientation', this.onOrient);
    };
    if (typeof DOE.requestPermission === 'function') {
      // iOS 13+: 사용자 제스처 안에서 권한을 요청해야 한다
      gsap.to(this.tiltBtn, { autoAlpha: 0.75, duration: 1.2, delay: 2.5 });
      const ask = () => {
        DOE.requestPermission!()
          .then((r) => {
            if (r === 'granted') {
              listen();
              this.app.toast('기울이면 흐름이 기웁니다');
            }
          })
          .catch(() => undefined)
          .finally(() => gsap.to(this.tiltBtn, { autoAlpha: 0, duration: 0.5 }));
      };
      this.tiltBtn.onclick = ask;
    } else {
      listen();
    }
  }

  private onOrient = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    // 화면 방향에 맞춰 회전
    const angle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
    let gx = clamp(e.gamma / 40, -1, 1);
    let gy = clamp((e.beta - 35) / 40, -1, 1);
    const a = (-angle * Math.PI) / 180;
    const rx = gx * Math.cos(a) - gy * Math.sin(a);
    const ry = gx * Math.sin(a) + gy * Math.cos(a);
    gx = rx;
    gy = ry;
    // uv 는 위가 +y
    this.gravityTarget.set(gx, -gy);
  };

  // ─────────── 입력 ───────────
  onStrokeStart(s: Stroke): void {
    this.last.set(s.id, s.first);
    haptic(4);
  }

  onStrokeMove(s: Stroke, added: StrokePoint[]): void {
    let a = this.last.get(s.id);
    if (!a) return;
    for (const b of added) {
      if (Math.hypot(b.x - a.x, b.y - a.y) < 3) continue;
      this.carve(a, b);
      a = b;
    }
    this.last.set(s.id, a);
  }

  onStrokeEnd(s: Stroke): void {
    this.last.delete(s.id);
    if (s.points.length > 1) this.app.recorder.record(s, 3, 'flow', this.stage.width, this.stage.height);
  }

  onStrokeCancel(s: Stroke): void {
    this.last.delete(s.id);
  }

  /** 획 → 흐름장: 방향과 속도, 굵기, 색온도 */
  private carve(a: StrokePoint, b: StrokePoint): void {
    const st = this.stage;
    const W = st.width;
    const H = st.height;
    const minDim = Math.min(W, H);
    const ua = new THREE.Vector2(a.x / W, 1 - a.y / H);
    const ub = new THREE.Vector2(b.x / W, 1 - b.y / H);
    const r = ((0.06 + 0.05 * b.width) * minDim) / H;
    const mag = clamp(b.speed, 0.2, 3.2) * 0.2 * (minDim / H);
    const weight = 0.25 + 0.5 * b.intensity;
    this.splat(this.splatLine, ua, ub, r, [b.dx * mag, -b.dy * mag, b.temp, weight]);
    this.wind = Math.max(this.wind, clamp(b.speed / 3));
  }

  private splat(mat: THREE.RawShaderMaterial, a: THREE.Vector2, b: THREE.Vector2, r: number, v: [number, number, number, number]): void {
    const st = this.stage;
    const asp = st.aspect;
    const u = mat.uniforms;
    const pad = r * 2;
    u.uBox.value.set(Math.min(a.x, b.x) - pad / asp, Math.min(a.y, b.y) - pad, Math.max(a.x, b.x) + pad / asp, Math.max(a.y, b.y) + pad);
    u.uA.value.copy(a);
    u.uB.value.copy(b);
    u.uAspect.value = asp;
    u.uRadius.value = r;
    u.uValue.value.set(...v);
    this.splatMesh.material = mat;
    st.draw(this.splatMesh, this.field.read);
  }

  // ─────────── 시뮬레이션 ───────────
  update(dt: number, time: number): void {
    this.time = time;
    this.dt = dt;
    this.frame++;
    const st = this.stage;
    const W = st.width;
    const H = st.height;

    // 머무름: 손가락 둘레로 소용돌이가 짙어진다
    if (this.app.input.handler === this) {
      for (const s of this.app.input.active) {
        const p = s.last;
        if (this.app.input.now() - p.t > 60 && p.speed < 0.25) {
          const c = new THREE.Vector2(p.x / W, 1 - p.y / H);
          const minDim = Math.min(W, H);
          const r = ((0.05 + 0.08 * p.hold) * minDim) / H;
          const spin = (0.6 + 1.4 * p.hold) * dt * 2.2 * (p.temp >= 0 ? 1 : -1);
          this.splat(this.splatSpin, c, c, r, [spin, 0, p.temp, dt * 1.5 * p.intensity]);
          this.wind = Math.max(this.wind, 0.2 + 0.3 * p.hold);
        }
      }
    }

    this.gravity.lerp(this.gravityTarget, 1 - Math.exp(-dt * 3));

    // 흐름장: 천천히 번지고, 오래 기억했다가 잊는다 (τ ≈ 18초)
    this.m.field.uniforms.uField.value = this.field.read.texture;
    this.m.field.uniforms.uDecay.value = Math.exp(-dt / 18);
    st.pass(this.m.field, this.field.write);
    this.field.swap();

    const u = this.m.update.uniforms;
    u.uState.value = this.state.read.texture;
    u.uField.value = this.field.read.texture;
    u.dt.value = Math.min(dt, 1 / 30);
    u.uTime.value = time;
    u.uAspect.value = st.aspect;
    u.uFrame.value = this.frame % 10000;
    st.pass(this.m.update, this.state.write);
    this.state.swap();

    this.wind *= Math.exp(-dt * 2.5);
    this.noise?.set(this.wind * 0.06, 260 + this.wind * 700);
  }

  render(target: THREE.WebGLRenderTarget): void {
    const st = this.stage;
    // 긴 노출: 흐려지는 잔상 위에 새 빛을 더한다
    this.m.fade.uniforms.uFactor.value = Math.exp(-this.dt * (this.app.reducedMotion ? 9 : 3.2));
    st.pass(this.m.fade, this.trail);
    const pu = this.pointsMat.uniforms;
    pu.uState.value = this.state.read.texture;
    pu.uField.value = this.field.read.texture;
    pu.uDt60.value = clamp(this.dt * 60, 0.25, 4);
    st.draw(this.points, this.trail);

    const d = this.m.display.uniforms;
    d.uTrail.value = this.trail.texture;
    d.uAspect.value = st.aspect;
    d.uTime.value = this.time;
    st.pass(this.m.display, target);
  }
}
