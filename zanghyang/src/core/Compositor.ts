import * as THREE from 'three';
import gsap from 'gsap';
import { Stage, makeMaterial } from './Stage';
import frag from '../shaders/composite.frag?raw';
import { prefersReducedMotion } from './config';

/**
 * 전시실은 각자 cur 타깃에 그리고, 컴포지터가 화면에 합성한다.
 * 전환 시 이전 프레임을 prev 로 고정하고 먹이 스며드는 마스크로 디졸브.
 */
export class Compositor {
  cur: THREE.WebGLRenderTarget;
  prev: THREE.WebGLRenderTarget;
  readonly material: THREE.RawShaderMaterial;
  transitioning = false;
  private tween: gsap.core.Tween | null = null;

  constructor(private readonly stage: Stage) {
    this.cur = stage.target(stage.pw, stage.ph);
    this.prev = stage.target(stage.pw, stage.ph);
    this.material = makeMaterial(frag, {
      tCur: { value: this.cur.texture },
      tPrev: { value: this.prev.texture },
      uProgress: { value: 0 },
      uMode: { value: 0 },
      uTime: { value: 0 },
      uGrain: { value: 0.05 },
      uGrainSpeed: { value: prefersReducedMotion() ? 0 : 24 },
      uAspect: { value: stage.aspect },
      uDpr: { value: stage.dpr },
      uVignette: { value: 0.14 },
      uOrigin: { value: new THREE.Vector2(0.5, 0.5) },
      uSeed: { value: Math.random() * 10 },
    });
    stage.onResize(() => {
      this.cur.setSize(stage.pw, stage.ph);
      this.prev.setSize(stage.pw, stage.ph);
      this.material.uniforms.uAspect.value = stage.aspect;
      this.material.uniforms.uDpr.value = stage.dpr;
    });
  }

  set grain(v: number) {
    this.material.uniforms.uGrain.value = v;
  }
  set vignette(v: number) {
    this.material.uniforms.uVignette.value = v;
  }

  /** 현재 화면을 prev 로 고정하고 전환 시작. origin: 0..1 (y 위쪽이 1) */
  transition(origin: { x: number; y: number }, duration: number, onDone?: () => void): void {
    const t = this.prev;
    this.prev = this.cur;
    this.cur = t;
    const u = this.material.uniforms;
    u.tCur.value = this.cur.texture;
    u.tPrev.value = this.prev.texture;
    u.uOrigin.value.set(origin.x, origin.y);
    u.uSeed.value = Math.random() * 10;
    const reduced = prefersReducedMotion();
    u.uMode.value = reduced ? 2 : 1;
    u.uProgress.value = 0;
    this.transitioning = true;
    this.tween?.kill();
    this.tween = gsap.to(u.uProgress, {
      value: 1,
      duration: reduced ? Math.min(0.6, duration) : duration,
      ease: reduced ? 'none' : 'power1.inOut',
      onComplete: () => {
        u.uMode.value = 0;
        this.transitioning = false;
        onDone?.();
      },
    });
  }

  render(time: number): void {
    this.material.uniforms.uTime.value = time;
    this.stage.pass(this.material, null);
  }
}
