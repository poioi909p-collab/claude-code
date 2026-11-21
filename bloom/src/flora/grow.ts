import { Shape, Stamp } from '../engine/watercolor';
import type { Scheduler } from './scheduler';
import type { ArtDirector } from '../art/director';
import type { Abs } from '../art/palette';
import { rnd, easeOutCubic, clamp } from '../util/rand';

export interface Ctx {
  sched: Scheduler;
  dir: ArtDirector;
  group: number;
  /** absolute start time (engine clock) */
  t: number;
  /** duration multiplier (reduced motion < 1) */
  speed: number;
  /** narrowest line (css px) the simulation can hold without aliasing */
  minLine: number;
}

export interface GrowOpts {
  /** initial scale (0..1) */
  from?: number;
  /** fraction of pigment laid down at the very end, carrying the rim */
  final?: number;
}

/**
 * Grow one stamp from a small bud to full size over `dur` seconds, painting
 * pigment and water continuously so it blooms into the wet sheet.
 */
export function grow(ctx: Ctx, s: Stamp, delay: number, dur: number, opt: GrowOpts = {}): void {
  const from = opt.from ?? 0.18;
  const finalFrac = opt.final ?? 0.2;
  const seed = s.seed ?? rnd() * 100;
  const rim = s.rim ?? 0;
  const baseK = s.k ?? 1;
  ctx.sched.add({
    start: ctx.t + delay * ctx.speed,
    dur: dur * ctx.speed,
    group: ctx.group,
    step(p0, p1, emit) {
      const e1 = easeOutCubic(p1);
      const sc = from + (1 - from) * e1;
      const dp = p1 - p0;
      const g: Stamp = {
        ...s,
        seed,
        rim: 0,
        len: s.len * sc,
        wid: s.wid * (s.type === Shape.Arc ? 0.35 + 0.65 * e1 : sc),
        k: s.type === Shape.Arc ? baseK * (0.45 + 0.55 * e1) : baseK,
        amount: s.amount * (1 - finalFrac) * dp,
        water: s.water * dp * 0.9,
      };
      emit(g);
      if (p1 >= 1) {
        // the edge that a drying wash leaves behind
        emit({ ...s, seed, rim: rim > 0 ? -rim * 1.9 : 0, amount: s.amount * finalFrac, water: s.water * 0.06, soft: Math.min(s.soft ?? 1.5, 1.0) });
      }
    },
  });
}

/** Paint a stamp instantly at a given delay (e.g. stamen dots). */
export function dot(ctx: Ctx, s: Stamp, delay: number): void {
  ctx.sched.add({
    start: ctx.t + delay * ctx.speed,
    dur: 0,
    group: ctx.group,
    step(_p0, _p1, emit) {
      emit(s);
    },
  });
}

// ---- paths -------------------------------------------------------------------

export interface Pt {
  x: number;
  y: number;
}
export interface PathPt extends Pt {
  s: number;
}

export function toPath(pts: Pt[]): PathPt[] {
  const out: PathPt[] = [];
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    if (i > 0) s += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    out.push({ x: pts[i].x, y: pts[i].y, s });
  }
  return out;
}

export function pathLength(p: PathPt[]): number {
  return p.length ? p[p.length - 1].s : 0;
}

/** Position and tangent angle at arc length s. */
export function pathAt(p: PathPt[], s: number): { x: number; y: number; a: number } {
  if (p.length < 2) return { x: p[0]?.x ?? 0, y: p[0]?.y ?? 0, a: 0 };
  s = clamp(s, 0, p[p.length - 1].s);
  let lo = 0;
  let hi = p.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (p[m].s < s) lo = m;
    else hi = m;
  }
  const a = p[lo];
  const b = p[hi];
  const t = b.s > a.s ? (s - a.s) / (b.s - a.s) : 0;
  // tangent over a slightly wider window for stability
  const i0 = Math.max(0, lo - 3);
  const i1 = Math.min(p.length - 1, hi + 3);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    a: Math.atan2(p[i1].y - p[i0].y, p[i1].x - p[i0].x),
  };
}

/** Resample to even spacing. */
export function resample(p: PathPt[], spacing: number): PathPt[] {
  const L = pathLength(p);
  const out: PathPt[] = [];
  for (let s = 0; s <= L; s += spacing) {
    const q = pathAt(p, s);
    out.push({ x: q.x, y: q.y, s });
  }
  if (L - out[out.length - 1].s > 0.5) out.push({ ...p[p.length - 1], s: L });
  return out;
}

export interface LineOpts {
  w0: number; // width at start (css px)
  w1: number; // width at end
  abs: Abs;
  amount: number; // target concentration along the line
  water: number;
  delay: number;
  dur: number;
  /** optional dry-brush breakup 0..1 */
  ruffle?: number;
}

/** Ease used for line growth and its inverse (to time things along a stem). */
export const lineEase = (p: number): number => 1 - (1 - p) * (1 - p);
export const lineEaseInv = (e: number): number => 1 - Math.sqrt(Math.max(1 - e, 0));

/** Grow a brush line along a path. */
export function growLine(ctx: Ctx, path: PathPt[], o: LineOpts): void {
  const L = pathLength(path);
  if (L < 1) return;
  const spacing = 1.25;
  const seed = rnd() * 100;
  ctx.sched.add({
    start: ctx.t + o.delay * ctx.speed,
    dur: o.dur * ctx.speed,
    group: ctx.group,
    step(p0, p1, emit) {
      const s0 = L * lineEase(p0);
      const s1 = L * lineEase(p1);
      // stateless: dabs sit on a fixed lattice along the path
      let i = p0 <= 0 ? 0 : Math.floor(s0 / spacing) + 1;
      for (; i * spacing <= s1; i++) {
        const next = i * spacing;
        const q = pathAt(path, next);
        const u = next / L;
        // slight swelling and a tapered tip, like a loaded brush
        const taper = Math.min(1, (L - next) / 14 + 0.35) * Math.min(1, next / 6 + 0.6);
        const w = (o.w0 + (o.w1 - o.w0) * u) * taper * (1 + 0.1 * Math.sin(next * 0.03 + seed));
        const r = Math.max(w * 0.5, ctx.minLine * 0.5);
        const k = spacing / (2 * r);
        emit({
          type: Shape.Dab,
          x: q.x,
          y: q.y,
          angle: q.a,
          len: r * 1.1,
          wid: r,
          abs: o.abs,
          amount: o.amount * k * 1.25,
          water: o.water * k * 1.2,
          ruffle: o.ruffle ?? (r < 2.5 ? 0.08 : 0.2),
          soft: Math.min(1.2, r * 0.6),
          seed,
        });
      }
    },
  });
}

/** Generate a gently curving path from a start point and heading. */
export function curvePath(x: number, y: number, a: number, len: number, curl: number, toward?: number): PathPt[] {
  const pts: Pt[] = [{ x, y }];
  const step = 2;
  let ang = a;
  const n = Math.max(2, Math.ceil(len / step));
  const wob = rnd() * 10;
  for (let i = 0; i < n; i++) {
    ang += curl * step + Math.sin(i * 0.08 + wob) * 0.004;
    if (toward !== undefined) ang += angleDiff(toward, ang) * 0.005;
    x += Math.cos(ang) * step;
    y += Math.sin(ang) * step;
    pts.push({ x, y });
  }
  return toPath(pts);
}

export function angleDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
