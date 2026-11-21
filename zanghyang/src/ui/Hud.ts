import gsap from 'gsap';
import { isCoarse } from '../core/config';

const ROMAN = ['', '01', '02', '03', '04'];

/** 거의 숨겨진 UI: 전시실 번호, 다음으로 넘기는 제스처 힌트, 소리 토글 */
export class Hud {
  private root = document.getElementById('hud')!;
  private cur = this.root.querySelector<HTMLElement>('.hud__cur')!;
  private hint = this.root.querySelector<HTMLElement>('.hud__hint')!;
  private next = this.root.querySelector<HTMLButtonElement>('.hud__next')!;
  private sound = this.root.querySelector<HTMLButtonElement>('.hud__sound')!;
  private label = document.getElementById('room-label')!;
  private toastEl = document.getElementById('toast')!;
  private hintTimer: number | undefined;
  private shown = false;

  onNext: (() => void) | null = null;
  onSound: ((on: boolean) => void) | null = null;

  constructor() {
    this.next.addEventListener('click', () => this.onNext?.());
    this.sound.addEventListener('click', () => {
      const on = this.sound.getAttribute('aria-pressed') !== 'true';
      this.setSound(on);
      this.onSound?.(on);
    });
  }

  setSound(on: boolean): void {
    this.sound.setAttribute('aria-pressed', String(on));
  }

  show(): void {
    if (this.shown) return;
    this.shown = true;
    gsap.set(this.root, { visibility: 'visible' });
    gsap.to(this.root, { opacity: 1, duration: 1.6, delay: 1.2, ease: 'sine.out' });
  }

  /** 전시실 입장: 번호 갱신, 이름이 잠깐 떠올랐다 가라앉음, 잠시 뒤 넘김 힌트 */
  enterRoom(index: number, title: string, hanja: string, line: string, total = 4): void {
    this.cur.textContent = ROMAN[index] ?? String(index).padStart(2, '0');
    this.next.disabled = index >= total;
    this.next.classList.remove('is-calling');
    gsap.killTweensOf(this.hint);
    gsap.to(this.hint, { opacity: 0, duration: 0.4 });
    window.clearTimeout(this.hintTimer);

    const num = this.label.querySelector<HTMLElement>('.room-label__num')!;
    const name = this.label.querySelector<HTMLElement>('.room-label__name')!;
    const ln = this.label.querySelector<HTMLElement>('.room-label__line')!;
    num.textContent = `${String(index).padStart(2, '0')} · ${hanja}`;
    name.textContent = title;
    ln.textContent = line;
    gsap.killTweensOf(this.label);
    gsap
      .timeline()
      .fromTo(this.label, { opacity: 0, y: 6 }, { opacity: 1, y: 0, duration: 1.6, delay: 0.9, ease: 'power2.out' })
      .to(this.label, { opacity: 0, y: -4, duration: 2.0, delay: 3.2, ease: 'power2.inOut' });

    if (index < total) {
      this.hintTimer = window.setTimeout(() => this.callNext(), 16000);
    }
  }

  /** 관람객이 충분히 머문 뒤에만 넘김 힌트를 띄운다 */
  callNext(): void {
    if (this.next.disabled) return;
    this.hint.textContent = isCoarse() ? '두 손가락으로 밀어 다음 방' : '→ 키 또는 화살표로 다음 방';
    this.next.classList.add('is-calling');
    gsap.to(this.hint, { opacity: 0.55, duration: 1.8, ease: 'sine.inOut' });
    gsap.to(this.hint, { opacity: 0, duration: 2.0, delay: 9, ease: 'sine.inOut' });
  }

  /** 획을 그리는 동안엔 힌트를 감춘다 */
  quiet(): void {
    if (Number(gsap.getProperty(this.hint, 'opacity')) > 0.01) {
      gsap.to(this.hint, { opacity: 0, duration: 0.6, overwrite: true });
    }
  }

  toast(msg: string, ms = 2600): void {
    this.toastEl.textContent = msg;
    gsap.killTweensOf(this.toastEl);
    gsap
      .timeline()
      .to(this.toastEl, { opacity: 0.85, duration: 0.5, ease: 'sine.out' })
      .to(this.toastEl, { opacity: 0, duration: 0.8, delay: ms / 1000, ease: 'sine.in' });
  }
}
