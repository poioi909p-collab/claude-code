import type * as THREE from 'three';
import gsap from 'gsap';
import { Room, type AppContext } from './Room';
import { makeMaterial } from '../core/Stage';
import type { Stroke } from '../core/Input';
import frag from '../shaders/entrance.frag?raw';

/** 0 · 입구 — 검은 화면, 명조 타이틀, 한 줄. 첫 터치에 먹이 번지며 입장. */
export class EntranceRoom extends Room {
  readonly index = 0;
  readonly title = '잔향';
  readonly hanja = '殘響';
  readonly line = '화면을 만져보세요';
  grain = 0.055;
  vignette = 0.3;
  onEnter: ((x: number, y: number) => void) | null = null;
  private mat!: THREE.RawShaderMaterial;
  private entered = false;
  private el = document.getElementById('entrance')!;

  constructor(app: AppContext) {
    super(app);
  }

  protected init(): void {
    this.mat = makeMaterial(frag, {
      uTime: { value: 0 },
      uAspect: { value: 1 },
      uFade: { value: 0 },
    });
    gsap.to(this.mat.uniforms.uFade, { value: 1, duration: 6, ease: 'sine.inOut', delay: 0.6 });
  }

  /** 타이틀이 먹처럼 배어 나온다 */
  intro(): void {
    const chars = this.el.querySelectorAll<HTMLElement>('.entrance__ko > span');
    const han = this.el.querySelector<HTMLElement>('.entrance__han')!;
    const hint = this.el.querySelector<HTMLElement>('.entrance__hint')!;
    const reduced = this.app.reducedMotion;
    const tl = gsap.timeline({ delay: 0.5 });
    tl.fromTo(
      chars,
      { opacity: 0, filter: reduced ? 'blur(0px)' : 'blur(14px)', y: reduced ? 0 : 6 },
      { opacity: 1, filter: 'blur(0px)', y: 0, duration: reduced ? 0.8 : 2.6, ease: 'power2.out', stagger: 0.55 },
    )
      .fromTo(han, { opacity: 0, letterSpacing: '1.6em' }, { opacity: 0.5, letterSpacing: '1.1em', duration: 2.2, ease: 'power2.out' }, '-=1.6')
      .to(hint, { opacity: 0.5, duration: 1.4, ease: 'sine.out', onComplete: () => hint.classList.add('is-breathing') }, '-=0.8');
  }

  onStrokeStart(s: Stroke): void {
    if (this.entered) return;
    this.entered = true;
    const p = s.first;
    this.onEnter?.(p.x, p.y);
  }

  /** 입장: 글자가 먹물처럼 풀어지며 사라진다 */
  dissolve(): void {
    const chars = this.el.querySelectorAll<HTMLElement>('.entrance__ko > span');
    const rest = this.el.querySelectorAll<HTMLElement>('.entrance__han, .entrance__hint');
    const hint = this.el.querySelector<HTMLElement>('.entrance__hint')!;
    hint.classList.remove('is-breathing');
    gsap.killTweensOf([...chars, ...rest]);
    gsap.to(rest, { opacity: 0, duration: 0.6, ease: 'power1.out' });
    gsap.to(chars, {
      opacity: 0,
      filter: this.app.reducedMotion ? 'blur(0px)' : 'blur(18px)',
      scale: this.app.reducedMotion ? 1 : 1.06,
      duration: 1.5,
      ease: 'power2.in',
      stagger: 0.12,
      onComplete: () => {
        this.el.style.display = 'none';
      },
    });
  }

  update(_dt: number, time: number): void {
    this.mat.uniforms.uTime.value = time;
    this.mat.uniforms.uAspect.value = this.app.stage.aspect;
  }

  render(target: THREE.WebGLRenderTarget): void {
    this.app.stage.pass(this.mat, target);
  }
}
