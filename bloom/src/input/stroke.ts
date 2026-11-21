// Pointer stroke capture: One Euro filtering + centripetal Catmull-Rom,
// resampled to evenly spaced samples.

class LowPass {
  private y = 0;
  private init = false;
  filter(x: number, a: number): number {
    if (!this.init) {
      this.y = x;
      this.init = true;
    } else this.y = a * x + (1 - a) * this.y;
    return this.y;
  }
  get value(): number {
    return this.y;
  }
}

/** One Euro filter (Casiez et al. 2012). */
export class OneEuro {
  private x = new LowPass();
  private dx = new LowPass();
  private lastT = -1;
  private lastRaw = 0;
  constructor(
    private minCutoff = 1.6,
    private beta = 0.04,
    private dCutoff = 8.0,
  ) {}
  private alpha(cutoff: number, dt: number): number {
    const tau = 1 / (2 * Math.PI * cutoff);
    return 1 / (1 + tau / dt);
  }
  filter(v: number, t: number): number {
    if (this.lastT < 0) {
      this.lastT = t;
      this.lastRaw = v;
      this.dx.filter(0, 1);
      return this.x.filter(v, 1);
    }
    // floor dt: coalesced events can share a timestamp
    const dt = Math.max((t - this.lastT) / 1000, 1 / 240);
    this.lastT = t;
    const d = (v - this.lastRaw) / dt;
    this.lastRaw = v;
    const ed = this.dx.filter(d, this.alpha(this.dCutoff, dt));
    const cutoff = this.minCutoff + this.beta * Math.abs(ed);
    return this.x.filter(v, this.alpha(cutoff, dt));
  }
}

export interface StrokeSample {
  x: number;
  y: number;
  t: number; // ms
  p: number; // pressure 0..1
  v: number; // speed css px / s
  s: number; // arc length from the start
}

interface Ctrl {
  x: number;
  y: number;
  t: number;
  p: number;
}

export class StrokeBuilder {
  readonly samples: StrokeSample[] = [];
  /** unfiltered input positions (for corner detection) */
  readonly raw: { x: number; y: number }[] = [];
  private ctrl: Ctrl[] = [];
  private fx = new OneEuro();
  private fy = new OneEuro();
  private arc = 0;
  private carry = 0;
  private speed = 0;
  readonly startTime: number;
  endTime = 0;
  rawPressure = 0;
  readonly hasPressure: boolean;

  constructor(
    x: number,
    y: number,
    t: number,
    pressure: number,
    hasPressure: boolean,
    private spacing = 2,
    private onSample?: (s: StrokeSample) => void,
  ) {
    this.startTime = t;
    this.hasPressure = hasPressure;
    this.raw.push({ x, y });
    const c = { x: this.fx.filter(x, t), y: this.fy.filter(y, t), t, p: pressure };
    this.ctrl.push(c);
    this.emit({ x: c.x, y: c.y, t, p: pressure, v: 0, s: 0 });
  }

  get length(): number {
    return this.arc;
  }
  get last(): StrokeSample {
    return this.samples[this.samples.length - 1];
  }

  add(x: number, y: number, t: number, pressure: number): void {
    this.rawPressure = pressure;
    const lr = this.raw[this.raw.length - 1];
    if (Math.hypot(x - lr.x, y - lr.y) > 1) this.raw.push({ x, y });
    const fx = this.fx.filter(x, t);
    const fy = this.fy.filter(y, t);
    const prev = this.ctrl[this.ctrl.length - 1];
    const dist = Math.hypot(fx - prev.x, fy - prev.y);
    if (dist < 0.75) return;
    const dt = Math.max((t - prev.t) / 1000, 1e-3);
    const inst = dist / dt;
    this.speed = this.speed === 0 ? inst : this.speed * 0.7 + inst * 0.3;
    this.ctrl.push({ x: fx, y: fy, t, p: pressure });
    const n = this.ctrl.length;
    if (n >= 3) {
      const p0 = this.ctrl[Math.max(n - 4, 0)];
      this.segment(p0, this.ctrl[n - 3], this.ctrl[n - 2], this.ctrl[n - 1]);
    }
  }

  end(t: number): void {
    this.endTime = t;
    const n = this.ctrl.length;
    if (n >= 2) {
      const a = this.ctrl[Math.max(n - 3, 0)];
      const b = this.ctrl[n - 2];
      const c = this.ctrl[n - 1];
      this.segment(a, b, c, c);
    }
  }

  private emit(s: StrokeSample): void {
    this.samples.push(s);
    this.onSample?.(s);
  }

  /** Emit evenly spaced samples along the centripetal Catmull-Rom p1→p2. */
  private segment(p0: Ctrl, p1: Ctrl, p2: Ctrl, p3: Ctrl): void {
    const steps = Math.max(2, Math.ceil(Math.hypot(p2.x - p1.x, p2.y - p1.y) / 1));
    let px = p1.x;
    let py = p1.y;
    const t01 = Math.pow(Math.hypot(p1.x - p0.x, p1.y - p0.y), 0.5) || 1e-3;
    const t12 = Math.pow(Math.hypot(p2.x - p1.x, p2.y - p1.y), 0.5) || 1e-3;
    const t23 = Math.pow(Math.hypot(p3.x - p2.x, p3.y - p2.y), 0.5) || 1e-3;
    // tangents (Barry–Goldman form converted to Hermite)
    const m1x = (p1.x - p0.x) / t01 - (p2.x - p0.x) / (t01 + t12) + (p2.x - p1.x) / t12;
    const m1y = (p1.y - p0.y) / t01 - (p2.y - p0.y) / (t01 + t12) + (p2.y - p1.y) / t12;
    const m2x = (p2.x - p1.x) / t12 - (p3.x - p1.x) / (t12 + t23) + (p3.x - p2.x) / t23;
    const m2y = (p2.y - p1.y) / t12 - (p3.y - p1.y) / (t12 + t23) + (p3.y - p2.y) / t23;
    const ax = m1x * t12;
    const ay = m1y * t12;
    const bx = m2x * t12;
    const by = m2y * t12;
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const u2 = u * u;
      const u3 = u2 * u;
      const h00 = 2 * u3 - 3 * u2 + 1;
      const h10 = u3 - 2 * u2 + u;
      const h01 = -2 * u3 + 3 * u2;
      const h11 = u3 - u2;
      const x = h00 * p1.x + h10 * ax + h01 * p2.x + h11 * bx;
      const y = h00 * p1.y + h10 * ay + h01 * p2.y + h11 * by;
      let d = Math.hypot(x - px, y - py);
      // walk along the chord, emitting at fixed spacing
      while (this.carry + d >= this.spacing) {
        const need = this.spacing - this.carry;
        const f = need / d;
        const sx = px + (x - px) * f;
        const sy = py + (y - py) * f;
        this.arc += this.spacing;
        const tt = p1.t + (p2.t - p1.t) * u;
        this.emit({ x: sx, y: sy, t: tt, p: p1.p + (p2.p - p1.p) * u, v: this.speed, s: this.arc });
        px = sx;
        py = sy;
        d = Math.hypot(x - px, y - py);
        this.carry = 0;
      }
      this.carry += d;
      px = x;
      py = y;
    }
  }
}
