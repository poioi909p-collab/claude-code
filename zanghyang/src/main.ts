import './style.css';
import gsap from 'gsap';
import { Stage } from './core/Stage';
import { Input } from './core/Input';
import { AudioEngine } from './core/AudioEngine';
import { Recorder } from './core/Recorder';
import { Compositor } from './core/Compositor';
import { PerfMonitor } from './core/PerfMonitor';
import { detectQuality, downgrade, prefersReducedMotion } from './core/config';
import { haptic } from './core/haptics';
import { Hud } from './ui/Hud';
import type { AppContext, Room } from './rooms/Room';
import { EntranceRoom } from './rooms/EntranceRoom';
import { InkRoom } from './rooms/InkRoom';

const TOTAL = 4;

class Exhibition {
  readonly stage: Stage;
  readonly input: Input;
  readonly audio = new AudioEngine();
  readonly recorder = new Recorder();
  readonly compositor: Compositor;
  readonly perf = new PerfMonitor();
  readonly hud = new Hud();
  readonly ctx: AppContext;
  rooms: Room[] = [];
  private current: Room;
  private time = 0;
  private last = performance.now();
  private busy = false;
  private fpsEl: HTMLElement | null = null;

  constructor() {
    const container = document.getElementById('stage')!;
    this.stage = new Stage(container, detectQuality());
    this.input = new Input(this.stage.canvas);
    this.compositor = new Compositor(this.stage);
    this.ctx = {
      stage: this.stage,
      input: this.input,
      audio: this.audio,
      recorder: this.recorder,
      reducedMotion: prefersReducedMotion(),
      toast: (m, ms) => this.hud.toast(m, ms),
    };

    const entrance = new EntranceRoom(this.ctx);
    this.rooms = [entrance, new InkRoom(this.ctx)];
    this.current = entrance;
    entrance.ensureInit();
    entrance.intro();
    this.input.handler = entrance;
    entrance.onEnter = (x, y) => {
      entrance.dissolve();
      this.audio.bell();
      this.goTo(1, { x, y }, 3.0);
      this.hud.show();
    };

    this.bindGlobal();
    this.stage.onResize((w, h) => this.rooms.forEach((r) => r.resize(w, h)));
    if (!new URLSearchParams(location.search).has('fixed')) this.perf.onSlow = () => this.degrade();
    this.hud.setSound(this.audio.enabled);

    if (new URLSearchParams(location.search).has('fps')) {
      this.fpsEl = document.createElement('div');
      this.fpsEl.style.cssText =
        'position:fixed;top:8px;left:8px;font:10px/1.4 monospace;color:#EDE8DF;mix-blend-mode:difference;pointer-events:none;z-index:9;white-space:pre';
      document.body.appendChild(this.fpsEl);
    }

    if (import.meta.env.DEV) (window as unknown as { __app: unknown }).__app = this;
    requestAnimationFrame(this.frame);
  }

  private bindGlobal(): void {
    // 오디오 잠금 해제 — 터치는 pointerup/touchend 에서만 사용자 활성화로 인정되는 브라우저가 있다
    const unlock = () => this.audio.unlock();
    this.input.onFirstGesture = unlock;
    window.addEventListener('pointerup', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('keydown', unlock);

    this.input.onNavigate = (dir) => this.step(dir, dir > 0 ? { x: this.stage.width * 0.92, y: this.stage.height * 0.5 } : undefined);
    this.hud.onNext = () => this.step(1, { x: this.stage.width - 40, y: this.stage.height - 30 });
    this.hud.onSound = (on) => {
      this.audio.unlock();
      this.audio.setEnabled(on);
    };

    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (this.current.index === 0) {
        if (e.key === 'Enter' || e.key === ' ') {
          (this.current as EntranceRoom).onStrokeStart?.({ first: { x: this.stage.width / 2, y: this.stage.height / 2 } } as never);
        }
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'PageDown') this.step(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') this.step(-1);
      else if (e.key === 'm' || e.key === 'M') {
        this.audio.setEnabled(!this.audio.enabled);
        this.hud.setSound(this.audio.enabled);
      }
    });

    // 트랙패드 가로 스와이프
    let acc = 0;
    let cool = 0;
    window.addEventListener(
      'wheel',
      (e) => {
        if (this.current.index === 0) return;
        const now = performance.now();
        if (now < cool) return;
        if (Math.abs(e.deltaX) < Math.abs(e.deltaY)) return;
        acc += e.deltaX;
        if (Math.abs(acc) > 160) {
          cool = now + 1400;
          this.step(acc > 0 ? 1 : -1);
          acc = 0;
        }
      },
      { passive: true },
    );
    document.addEventListener('visibilitychange', () => {
      this.last = performance.now();
    });
  }

  private step(dir: 1 | -1, origin?: { x: number; y: number }): void {
    const next = this.current.index + dir;
    if (next < 1 || next > TOTAL) return;
    this.goTo(next, origin);
  }

  goTo(index: number, origin?: { x: number; y: number }, duration = 2.3): void {
    const room = this.rooms[index];
    if (!room || this.busy || room === this.current) return;
    this.busy = true;
    const from = this.current.index;
    this.input.cancelAll();
    this.input.enabled = false;
    this.current.leave();

    room.ensureInit();
    this.current = room;
    room.enter({ x: origin?.x, y: origin?.y, from });

    const o = origin ?? { x: this.stage.width * 0.5, y: this.stage.height * 0.5 };
    this.compositor.transition({ x: o.x / this.stage.width, y: 1 - o.y / this.stage.height }, duration, () => {
      this.busy = false;
    });
    gsap.to(this.compositor.material.uniforms.uGrain, { value: room.grain, duration });
    gsap.to(this.compositor.material.uniforms.uVignette, { value: room.vignette, duration });
    gsap.delayedCall(duration * 0.5, () => {
      this.input.enabled = true;
    });
    if (from !== 0) this.audio.swell(duration);
    this.hud.enterRoom(index, room.title, room.hanja, room.line, TOTAL);
    this.perf.grace(duration * 1000 + 1500);
    haptic(12, 0);
  }

  /** 지속적으로 느리면: 해상도 → 품질 단계 순으로 낮춘다 */
  private degrade(): void {
    const st = this.stage;
    if (st.dprScale > 0.72 && Math.min(window.devicePixelRatio, st.quality.dprCap) * st.dprScale > 1.01) {
      st.dprScale = Math.max(0.7, st.dprScale - 0.15);
      st.resize();
      return;
    }
    const q = downgrade(st.quality);
    if (!q) return;
    st.quality = q;
    st.dprScale = 1;
    st.resize();
    this.rooms.forEach((r) => r.requality());
  }

  private frame = (now: number) => {
    requestAnimationFrame(this.frame);
    const dtMs = Math.min(100, Math.max(0, now - this.last));
    this.last = now;
    const dt = dtMs / 1000;
    this.time += dt;
    this.perf.tick(dtMs);
    this.input.update(dtMs);
    if (this.input.active.length) this.hud.quiet();

    this.current.update(dt, this.time);
    this.current.render(this.compositor.cur);
    this.compositor.render(this.time);

    if (this.fpsEl && Math.floor(this.time * 4) !== Math.floor((this.time - dt) * 4)) {
      const st = this.stage;
      this.fpsEl.textContent = `${this.perf.fps.toFixed(0)} fps · ${st.quality.tier} · dpr ${st.dpr.toFixed(2)} · ${st.pw}×${st.ph}`;
    }
  };
}

function boot(): void {
  try {
    new Exhibition();
  } catch (err) {
    console.error(err);
    document.body.innerHTML =
      '<p style="position:fixed;inset:0;display:grid;place-items:center;font-family:serif;letter-spacing:.2em;color:#EDE8DF;background:#0B0B0C;text-align:center;line-height:2">이 전시는 WebGL2 를 지원하는 브라우저가 필요합니다.<br><small style="opacity:.5">' +
      String((err as Error).message ?? err) +
      '</small></p>';
  }
}

boot();
