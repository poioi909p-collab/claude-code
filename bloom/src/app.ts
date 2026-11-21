import { Watercolor, Shape, Snapshot } from './engine/watercolor';
import { StrokeBuilder } from './input/stroke';
import { classify } from './gesture/classify';
import { ArtDirector } from './art/director';
import type { Abs, SeasonId } from './art/palette';
import { Scheduler, JobCapture } from './flora/scheduler';
import type { Ctx } from './flora/grow';
import { stemFromStroke, flowerFromLoop, grassFromZigzag, fromTap, sprigFromStroke } from './flora/plants';
import { WaterSound } from './audio';
import { clamp } from './util/rand';

interface ActiveStroke {
  sb: StrokeBuilder;
  group: number;
  downAt: number;
  startX: number;
  startY: number;
  moved: boolean;
  holdTime: number;
  tint: Abs;
  lastDab: number;
  pressureSum: number;
  pressureN: number;
}

interface HistoryEntry {
  snap: Snapshot;
  dir: ReturnType<ArtDirector['save']>;
  jobs: JobCapture;
  group: number;
}

export interface AppHooks {
  onFirstTouch?: () => void;
  onSeason?: (s: SeasonId) => void;
  onHistory?: (canUndo: boolean) => void;
}

export class App {
  readonly wc: Watercolor;
  readonly dir: ArtDirector;
  readonly sched: Scheduler;
  readonly sound = new WaterSound();
  private strokes = new Map<number, ActiveStroke>();
  private history: HistoryEntry[] = [];
  private group = 1;
  private lastFrame = performance.now();
  private touched = false;
  reducedMotion = false;
  private maxHistory = 8;
  private running = true;

  constructor(
    readonly canvas: HTMLCanvasElement,
    season: SeasonId,
    private hooks: AppHooks = {},
  ) {
    this.wc = new Watercolor(canvas);
    this.dir = new ArtDirector(season, window.innerWidth, window.innerHeight);
    this.sched = new Scheduler((s) => this.wc.add(s));
    this.resize();
    this.bindInput();
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotion = () => {
      this.reducedMotion = mq.matches;
      this.wc.windAmount = mq.matches ? 0 : 1;
    };
    applyMotion();
    mq.addEventListener?.('change', applyMotion);
    document.addEventListener('visibilitychange', () => {
      this.lastFrame = performance.now();
    });
  }

  start(): void {
    const frame = (t: number) => {
      if (!this.running) return;
      const dt = Math.min((t - this.lastFrame) / 1000, 0.1);
      this.lastFrame = t;
      this.tick(dt);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
  }

  /** Advance one frame (exposed for testing). */
  tick(dt: number): void {
    this.sched.update(this.wc.now + dt);
    this.wc.update(dt);
    this.wc.render();
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w === this.wc.cssW && h === this.wc.cssH) return;
    this.wc.resize(w, h, window.devicePixelRatio || 1);
    this.dir.resize(w, h);
    this.clearHistory();
    this.maxHistory = clamp(Math.floor(96e6 / this.wc.snapshotBytes), 3, 12);
    this.wc.render(true);
  }

  // ---- input -----------------------------------------------------------------

  private bindInput(): void {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e));
    c.addEventListener('pointermove', (e) => this.move(e));
    c.addEventListener('pointerup', (e) => this.up(e));
    c.addEventListener('pointercancel', (e) => this.up(e, true));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private ctxFor(group: number): Ctx {
    return {
      sched: this.sched,
      dir: this.dir,
      group,
      t: this.wc.now,
      speed: this.reducedMotion ? 0.35 : 1,
      minLine: 2.1 / this.wc.simPxPerCss,
    };
  }

  private down(e: PointerEvent): void {
    if (this.wc.washing) return;
    if (e.button > 0) return;
    e.preventDefault();
    this.canvas.setPointerCapture?.(e.pointerId);
    if (!this.touched) {
      this.touched = true;
      this.hooks.onFirstTouch?.();
    }
    const group = this.group++;
    this.pushHistory(group);
    const isPen = e.pointerType === 'pen';
    const st: ActiveStroke = {
      group,
      downAt: e.timeStamp,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      holdTime: 0,
      tint: this.dir.trail(),
      lastDab: -99,
      pressureSum: 0,
      pressureN: 0,
      sb: null as unknown as StrokeBuilder,
    };
    st.sb = new StrokeBuilder(e.clientX, e.clientY, e.timeStamp, e.pressure, isPen, 2, (s) => {
      // live wet trail: mostly water with a whisper of colour
      if (s.s - st.lastDab < 2) return;
      st.lastDab = s.s;
      const hold = clamp(st.holdTime / 0.9, 0, 1);
      const r = clamp(5.2 - s.v / 320, 2.4, 5.2) * (0.9 + 0.3 * hold);
      const k = 2 / (2 * r);
      this.wc.add({
        type: Shape.Dab,
        x: s.x,
        y: s.y,
        len: r,
        wid: r,
        abs: st.tint,
        amount: 0.012 * k * (1 + hold),
        water: 0.3 * k,
        ruffle: 0.35,
        soft: 1.5,
      });
    });
    this.strokes.set(e.pointerId, st);
    this.sound.drop(0.8);
  }

  private move(e: PointerEvent): void {
    const st = this.strokes.get(e.pointerId);
    if (!st) return;
    const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [];
    const list = evs.length ? evs : [e];
    for (const ev of list) {
      if (!st.moved && Math.hypot(ev.clientX - st.startX, ev.clientY - st.startY) > 6) {
        st.moved = true;
        st.holdTime = (ev.timeStamp - st.downAt) / 1000;
      }
      if (st.sb.hasPressure) {
        st.pressureSum += ev.pressure;
        st.pressureN++;
      }
      st.sb.add(ev.clientX, ev.clientY, ev.timeStamp, ev.pressure);
    }
  }

  private up(e: PointerEvent, cancelled = false): void {
    const st = this.strokes.get(e.pointerId);
    if (!st) return;
    this.strokes.delete(e.pointerId);
    st.sb.end(e.timeStamp);
    if (!st.moved) st.holdTime = (e.timeStamp - st.downAt) / 1000;
    if (cancelled && st.sb.length < 6) return;
    const pressure = st.pressureN ? st.pressureSum / st.pressureN : null;
    const g = classify(st.sb.samples, e.timeStamp - st.downAt, st.holdTime, pressure, st.sb.raw);
    const ctx = this.ctxFor(st.group);
    if (location.search.includes('manual')) console.log('gesture', g.kind, Math.round(g.length), g.corners.length, g.turn.toFixed(2));
    switch (g.kind) {
      case 'tap':
        fromTap(ctx, st.startX, st.startY, g);
        break;
      case 'sprig':
        sprigFromStroke(ctx, st.sb.samples, g);
        break;
      case 'circle':
        flowerFromLoop(ctx, g);
        break;
      case 'zigzag':
        grassFromZigzag(ctx, st.sb.samples, g);
        break;
      default:
        stemFromStroke(ctx, st.sb.samples, g);
    }
    this.sound.drop(0.5);
  }

  // ---- history -----------------------------------------------------------------

  private pushHistory(group: number): void {
    // jobs due this frame have not been painted yet; flush them into the
    // snapshot so the captured progress and the captured pixels agree
    this.sched.update(this.wc.now);
    const snap = this.wc.snapshot();
    this.history.push({ snap, dir: this.dir.save(), jobs: this.sched.capture(this.wc.now), group });
    while (this.history.length > this.maxHistory) {
      const old = this.history.shift()!;
      this.wc.release(old.snap);
    }
    this.hooks.onHistory?.(true);
  }

  private clearHistory(): void {
    for (const h of this.history) this.wc.release(h.snap);
    this.history = [];
    this.hooks.onHistory?.(false);
  }

  get canUndo(): boolean {
    return this.history.length > 0;
  }

  undo(): void {
    if (this.wc.washing || this.strokes.size) return;
    const h = this.history.pop();
    if (!h) return;
    // rewind: drop later work, resume what was still blooming back then
    this.sched.rewind(h.jobs, this.wc.now);
    this.wc.restore(h.snap);
    this.wc.release(h.snap);
    const prevSeason = this.dir.season.id;
    this.dir.load(h.dir);
    if (this.dir.season.id !== prevSeason) this.hooks.onSeason?.(this.dir.season.id);
    this.hooks.onHistory?.(this.history.length > 0);
    this.sound.drop(0.4);
  }

  /** Wash everything away; optionally switch season once the sheet is clean. */
  wash(season?: SeasonId): void {
    if (this.wc.washing) return;
    if (this.dir.isEmpty && !this.sched.busy) {
      if (season) {
        this.dir.reset(season);
        this.hooks.onSeason?.(season);
      }
      return;
    }
    this.strokes.clear();
    this.pushHistory(this.group++);
    this.sched.clear();
    this.sound.wash();
    const cx = window.innerWidth / 2;
    const cy = window.innerHeight * 0.55;
    this.wc.washDuration = this.reducedMotion ? 1.6 : 3.2;
    this.wc.wash(
      cx,
      cy,
      () => {
        this.dir.reset(season ?? this.dir.season.id);
        if (season) this.hooks.onSeason?.(season);
      },
      () => {},
    );
  }

  setSeason(s: SeasonId): void {
    if (s === this.dir.season.id) return;
    this.wash(s);
  }

  get season(): SeasonId {
    return this.dir.season.id;
  }
}
