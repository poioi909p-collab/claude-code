import { clamp, lerp, smoothstep } from './config';

/**
 * 전 실 공통 입력 매핑
 *  - 속도 → 굵기 (빠를수록 가늘게, 붓처럼)
 *  - 누른 시간 / 압력 → 진하기
 *  - 방향 → 색온도 (오른쪽·위로 갈수록 따뜻하게, 왼쪽·아래로 갈수록 차갑게)
 */
export interface StrokePoint {
  /** CSS px */
  x: number;
  y: number;
  /** 세션 시작 기준 ms */
  t: number;
  /** 0..1 실효 압력 */
  pressure: number;
  /** 화면/초 (짧은 변 기준 정규화 속도) */
  speed: number;
  /** 정규화 굵기 배율 (~0.25..1.3) */
  width: number;
  /** 진하기 0..1 */
  intensity: number;
  /** 색온도 -1(차가움)..1(따뜻함) */
  temp: number;
  /** 단위 방향 */
  dx: number;
  dy: number;
  /** 머무름 0..1 */
  hold: number;
  /** 획 시작부터 누적 길이 (CSS px) */
  dist: number;
}

export class Stroke {
  static nextId = 1;
  readonly id = Stroke.nextId++;
  readonly points: StrokePoint[] = [];
  ended = false;
  cancelled = false;
  /** 실별 메타데이터 (현: 음 높이, 튕김 여부 등) */
  meta: Record<string, unknown> = {};
  constructor(
    readonly pointerId: number,
    readonly pointerType: string,
    readonly startT: number,
  ) {}
  get last(): StrokePoint {
    return this.points[this.points.length - 1];
  }
  get first(): StrokePoint {
    return this.points[0];
  }
  get duration(): number {
    return this.last.t - this.startT;
  }
  get length(): number {
    return this.last.dist;
  }
  get isTap(): boolean {
    return this.duration < 260 && this.length < 12;
  }
}

export interface InputHandler {
  onStrokeStart?(s: Stroke): void;
  onStrokeMove?(s: Stroke, added: StrokePoint[]): void;
  onStrokeEnd?(s: Stroke): void;
  onStrokeCancel?(s: Stroke): void;
}

interface Tracker {
  stroke: Stroke;
  speed: number;
  dx: number;
  dy: number;
  temp: number;
  hold: number;
  realPressure: boolean;
  pressure: number;
  lastT: number;
  startX: number;
  startY: number;
}

const WARM = { x: Math.SQRT1_2, y: -Math.SQRT1_2 };

export class Input {
  handler: InputHandler | null = null;
  enabled = true;
  /** 두 손가락 가로 밀기 → 전시실 이동 */
  onNavigate: ((dir: 1 | -1) => void) | null = null;
  /** 첫 상호작용(오디오 잠금 해제 등) */
  onFirstGesture: (() => void) | null = null;
  readonly t0 = performance.now();
  private readonly trackers = new Map<number, Tracker>();
  private minDim = 1;
  private navLocked = false;

  constructor(private readonly el: HTMLElement) {
    el.addEventListener('pointerdown', this.down, { passive: false });
    el.addEventListener('pointermove', this.move, { passive: false });
    el.addEventListener('pointerup', this.up);
    el.addEventListener('pointercancel', this.cancel);
    el.addEventListener('lostpointercapture', this.up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS 의 스크롤/줌 제스처 억제
    el.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
    el.addEventListener('gesturestart', (e) => e.preventDefault());
    this.measure();
    window.addEventListener('resize', () => this.measure());
  }

  private measure() {
    this.minDim = Math.max(1, Math.min(window.innerWidth, window.innerHeight));
  }

  now(): number {
    return performance.now() - this.t0;
  }

  get active(): Stroke[] {
    return [...this.trackers.values()].map((t) => t.stroke);
  }

  private firstDone = false;
  private down = (e: PointerEvent) => {
    e.preventDefault();
    if (!this.firstDone) {
      this.firstDone = true;
      this.onFirstGesture?.();
    }
    if (!this.enabled) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    try {
      this.el.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    const ts = e.timeStamp - this.t0;
    const t = Number.isFinite(ts) && ts > 0 && ts <= this.now() + 50 ? ts : this.now();
    const stroke = new Stroke(e.pointerId, e.pointerType, t);
    const realPressure =
      e.pointerType === 'pen' || (e.pressure > 0 && e.pressure !== 0.5 && e.pressure !== 1);
    const tr: Tracker = {
      stroke,
      speed: 0,
      dx: 1,
      dy: 0,
      temp: 0,
      hold: 0,
      realPressure,
      pressure: realPressure ? e.pressure : 0.5,
      lastT: t,
      startX: e.clientX,
      startY: e.clientY,
    };
    this.trackers.set(e.pointerId, tr);
    stroke.points.push(this.sample(tr, e.clientX, e.clientY, t, tr.pressure, 0));
    this.handler?.onStrokeStart?.(stroke);
    if (this.trackers.size === 2) this.navLocked = false;
  };

  private move = (e: PointerEvent) => {
    const tr = this.trackers.get(e.pointerId);
    if (!tr) return;
    e.preventDefault();
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const list = evs.length ? evs : [e];
    const added: StrokePoint[] = [];
    for (const ev of list) {
      const p = this.advance(tr, ev.clientX, ev.clientY, ev.pressure, ev.timeStamp - this.t0);
      if (p) added.push(p);
    }
    if (added.length) this.handler?.onStrokeMove?.(tr.stroke, added);
    this.checkNavigate();
  };

  private advance(tr: Tracker, x: number, y: number, pressure: number, ts: number): StrokePoint | null {
    const s = tr.stroke;
    const last = s.last;
    // 이벤트 타임스탬프로 속도를 잰다 (프레임이 밀려도 정확하게)
    const now = this.now();
    const t = Math.max(Number.isFinite(ts) && ts > 0 && ts <= now + 50 ? ts : now, last.t + 0.5);
    const ddx = x - last.x;
    const ddy = y - last.y;
    const d = Math.hypot(ddx, ddy);
    if (d < 0.35) return null;
    const dt = Math.max(1, t - tr.lastT);
    tr.lastT = t;
    const inst = ((d / dt) * 1000) / this.minDim; // 화면/초
    const k = 1 - Math.exp(-dt / 38);
    tr.speed = lerp(tr.speed, inst, k);
    const kd = 1 - Math.exp(-dt / 30);
    tr.dx = lerp(tr.dx, ddx / d, kd);
    tr.dy = lerp(tr.dy, ddy / d, kd);
    const n = Math.hypot(tr.dx, tr.dy) || 1;
    tr.dx /= n;
    tr.dy /= n;
    const warm = tr.dx * WARM.x + tr.dy * WARM.y;
    tr.temp = lerp(tr.temp, warm, 1 - Math.exp(-dt / 140));
    if (tr.realPressure && pressure > 0) tr.pressure = lerp(tr.pressure, pressure, 0.5);
    // 움직이면 머무름이 풀린다
    tr.hold *= Math.exp(-dt / (tr.speed > 0.4 ? 260 : 900));
    const p = this.sample(tr, x, y, t, tr.pressure, last.dist + d);
    s.points.push(p);
    return p;
  }

  private sample(tr: Tracker, x: number, y: number, t: number, pressure: number, dist: number): StrokePoint {
    const pr = tr.realPressure ? clamp(pressure) : 0.5;
    const speedK = smoothstep(0.1, 3.4, tr.speed);
    const width = lerp(1.15, 0.46, speedK) * lerp(0.72, 1.28, pr);
    const press = tr.realPressure ? Math.pow(pr, 0.85) : 0;
    const intensity = clamp(0.22 + 0.78 * Math.max(press, tr.hold, tr.realPressure ? 0 : 0.22));
    return {
      x,
      y,
      t,
      pressure: pr,
      speed: tr.speed,
      width,
      intensity,
      temp: clamp(tr.temp, -1, 1),
      dx: tr.dx,
      dy: tr.dy,
      hold: tr.hold,
      dist,
    };
  }

  /** 매 프레임: 멈춰 누르고 있는 시간을 진하기로 누적 */
  update(dtMs: number): void {
    const now = this.now();
    for (const tr of this.trackers.values()) {
      const idle = now - tr.lastT;
      if (idle > 40) {
        tr.speed *= Math.exp(-dtMs / 60);
        tr.hold = tr.hold + (1 - tr.hold) * (1 - Math.exp(-dtMs / 1100));
        const last = tr.stroke.last;
        last.hold = tr.hold;
        last.speed = tr.speed;
        const press = tr.realPressure ? Math.pow(tr.pressure, 0.85) : 0;
        last.intensity = clamp(0.22 + 0.78 * Math.max(press, tr.hold));
      }
    }
  }

  private up = (e: PointerEvent) => {
    const tr = this.trackers.get(e.pointerId);
    if (!tr) return;
    this.trackers.delete(e.pointerId);
    tr.stroke.ended = true;
    this.handler?.onStrokeEnd?.(tr.stroke);
  };

  private cancel = (e: PointerEvent) => {
    const tr = this.trackers.get(e.pointerId);
    if (!tr) return;
    this.trackers.delete(e.pointerId);
    tr.stroke.cancelled = true;
    tr.stroke.ended = true;
    this.handler?.onStrokeCancel?.(tr.stroke);
  };

  /** 진행 중인 모든 획 취소 (전시실 전환 시) */
  cancelAll(): void {
    for (const [id, tr] of this.trackers) {
      tr.stroke.cancelled = true;
      tr.stroke.ended = true;
      this.handler?.onStrokeCancel?.(tr.stroke);
      try {
        this.el.releasePointerCapture(id);
      } catch {
        /* noop */
      }
    }
    this.trackers.clear();
  }

  private checkNavigate() {
    if (this.navLocked || this.trackers.size !== 2 || !this.onNavigate) return;
    const [a, b] = [...this.trackers.values()];
    if (a.stroke.pointerType !== 'touch' || b.stroke.pointerType !== 'touch') return;
    const ax = a.stroke.last.x - a.startX;
    const bx = b.stroke.last.x - b.startX;
    const ay = a.stroke.last.y - a.startY;
    const by = b.stroke.last.y - b.startY;
    const th = window.innerWidth * 0.14;
    if (Math.sign(ax) === Math.sign(bx) && Math.abs(ax) > th && Math.abs(bx) > th * 0.6) {
      if (Math.abs(ax + bx) > 1.6 * Math.abs(ay + by)) {
        this.navLocked = true;
        const dir: 1 | -1 = ax + bx < 0 ? 1 : -1; // 왼쪽으로 밀면 다음
        this.cancelAll();
        this.onNavigate(dir);
      }
    }
  }
}
