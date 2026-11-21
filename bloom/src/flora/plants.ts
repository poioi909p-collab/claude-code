import { Ctx, PathPt, pathAt, pathLength, growLine, lineEaseInv, curvePath, toPath, resample, Pt } from './grow';
import { leaf, cosmos, anemone, tulip, bud, spray, rose, peony, wildflower, scatter, berries, bigFlower } from './flowers';
import type { Gesture } from '../gesture/classify';
import type { StrokeSample } from '../input/stroke';
import { Abs, mixAbs } from '../art/palette';
import { rnd, range, chance, clamp, weighted, irange, lerp, TAU } from '../util/rand';

interface StemOpts {
  depth: number;
  delay: number;
  w0: number;
  w1: number;
  stem: Abs;
  intensity: number;
  dir: number | null;
  budget: { branches: number };
}

/**
 * Grow a stem along `path` with leaves and side branches (a small stochastic
 * L-system: F → F[+B]F[-L]…), finishing in a flower or bud at the tip.
 */
function growStem(ctx: Ctx, path: PathPt[], o: StemOpts): void {
  const L = pathLength(path);
  if (L < 8) return;
  const dur = clamp(L / 430, 0.45, 1.6) * (o.depth ? 0.85 : 1);
  growLine(ctx, path, {
    w0: o.w0,
    w1: o.w1,
    abs: o.stem,
    amount: 1.6 + 0.35 * o.intensity,
    water: 0.26,
    delay: o.delay,
    dur,
  });
  for (let s = 0; s < L; s += 30) ctx.dir.mark(pathAt(path, s).x, pathAt(path, s).y, 12, 0.12);

  const timeAt = (s: number) => o.delay + dur * lineEaseInv(clamp(s / L, 0, 1));

  // nodes along the stem
  let side = chance(0.5) ? 1 : -1;
  let s = L * range(0.14, 0.26) + 8;
  const spacing = clamp(L * 0.15, 36, 80);
  const stopAt = L - Math.max(26, L * 0.1);
  const leafColors = ctx.dir.leafPair();
  while (s < stopAt) {
    const q = pathAt(path, s);
    const u = s / L;
    const remaining = L - s;
    const canBranch = o.depth < 2 && remaining > 70 && o.budget.branches > 0 && L > 140;
    if (canBranch && chance(o.depth === 0 ? 0.42 : 0.25)) {
      o.budget.branches--;
      const ang = q.a + side * range(0.45, 0.85);
      const bl = Math.min(remaining * range(0.35, 0.6) + 20, 200) * ctx.dir.sizeFactor(q.x, q.y, 40);
      // bend gently away from the parent so branches never cross it
      const curl = side * range(-0.0008, 0.0025);
      const bp = curvePath(q.x, q.y, ang, bl, curl, q.a);
      growStem(ctx, bp, {
        ...o,
        depth: o.depth + 1,
        delay: timeAt(s),
        w0: lerp(o.w0, o.w1, u) * 0.8,
        w1: Math.max(o.w1 * 0.75, 1.6),
      });
    } else {
      const sz = lerp(50, 26, u) * clamp(o.w0 / 3.8, 0.8, 1.2) * (o.depth ? 0.75 : 1) * ctx.dir.sizeFactor(q.x, q.y, 30);
      const la = q.a + side * range(0.5, 0.95);
      const w = lerp(o.w0, o.w1, u) * 0.4;
      leaf(
        ctx,
        q.x + Math.cos(la) * w,
        q.y + Math.sin(la) * w,
        la,
        sz,
        sz * range(0.34, 0.44),
        chance(0.5) ? leafColors[0] : leafColors[1],
        leafColors[1],
        timeAt(s),
        0.55,
      );
      // sometimes a pair (opposite leaves)
      if (chance(0.18)) {
        const la2 = q.a - side * range(0.5, 0.9);
        leaf(ctx, q.x, q.y, la2, sz * 0.8, sz * 0.32, leafColors[0], leafColors[1], timeAt(s) + 0.08, 0.5);
      }
    }
    side = -side;
    s += spacing * range(0.75, 1.3);
  }

  // the tip
  const tip = pathAt(path, L);
  const tEnd = o.delay + dur * 0.92;
  const fc = ctx.dir.flower(tip.x, tip.y, o.dir);
  const fac = ctx.dir.sizeFactor(tip.x, tip.y, 50);
  if (o.depth === 0) {
    const R0 = clamp(L * 0.1 + 16, 22, 62) * fac * (0.9 + 0.3 * o.intensity);
    const R = ctx.dir.fitRadius(tip.x, tip.y, R0);
    const kind = weighted(['cosmos', 'anemone', 'tulip', 'rose', 'spray', 'peony'], [3, 2.2, 2.2, 1.4, 1, 1]);
    const cxp = tip.x + Math.cos(tip.a) * R * 0.32;
    const cyp = tip.y + Math.sin(tip.a) * R * 0.32;
    switch (kind) {
      case 'cosmos':
        cosmos(ctx, cxp, cyp, R, fc, tEnd);
        break;
      case 'anemone':
        anemone(ctx, cxp, cyp, R, fc, tEnd, false);
        break;
      case 'rose':
        rose(ctx, cxp, cyp, R * 0.9, fc, tEnd);
        break;
      case 'peony':
        peony(ctx, cxp, cyp, R, fc, tEnd);
        break;
      case 'spray':
        spray(ctx, tip.x, tip.y, tip.a, R * 0.9, fc, tEnd);
        break;
      default:
        tulip(ctx, tip.x, tip.y, tip.a, R * 1.15, fc, tEnd);
    }
  } else {
    const size = clamp(L * 0.12 + 10, 12, 30) * fac;
    const r = rnd();
    if (r < 0.45) bud(ctx, tip.x, tip.y, tip.a, size, fc, tEnd);
    else if (r < 0.8) cosmos(ctx, tip.x + Math.cos(tip.a) * size * 0.3, tip.y + Math.sin(tip.a) * size * 0.3, size * 0.9, fc, tEnd);
    else spray(ctx, tip.x, tip.y, tip.a, size, fc, tEnd);
  }
}

/** Long, gentle stroke → a stem with leaves, branches and flowers. */
export function stemFromStroke(ctx: Ctx, samples: StrokeSample[], g: Gesture): void {
  const pts: Pt[] = samples.map((s) => ({ x: s.x, y: s.y }));
  const path = resample(toPath(pts), 2);
  // slow strokes give a fuller brush
  const w0 = clamp(4.2 - g.speed / 400, 2.4, 3.8) * (0.9 + 0.25 * g.intensity);
  growStem(ctx, path, {
    depth: 0,
    delay: 0,
    w0,
    w1: Math.max(w0 * 0.55, 1.7),
    stem: ctx.dir.stem(),
    intensity: g.intensity,
    dir: g.dir,
    budget: { branches: irange(1, 3) + (g.length > 450 ? 1 : 0) },
  });
}

/** Closed loop → one big flower filling the loop. */
export function flowerFromLoop(ctx: Ctx, g: Gesture): void {
  const fac = ctx.dir.sizeFactor(g.cx, g.cy, g.radius);
  const want = g.radius * lerp(1.05, 0.8, 1 - clamp(fac, 0.5, 1.15) / 1.15) * (0.95 + 0.15 * g.intensity);
  const R = ctx.dir.fitRadius(g.cx, g.cy, Math.max(want, 22));
  const fc = ctx.dir.flower(g.cx, g.cy, g.dir);
  bigFlower(ctx, g.cx, g.cy, R, fc, 0.05);
}

/** Fast zigzag → a tuft of grass blades and leaves. */
export function grassFromZigzag(ctx: Ctx, samples: StrokeSample[], g: Gesture): void {
  // principal axis of the scribble; blades rise perpendicular to it (toward screen-up)
  let mx = 0,
    my = 0;
  for (const s of samples) {
    mx += s.x;
    my += s.y;
  }
  mx /= samples.length;
  my /= samples.length;
  let sxx = 0,
    syy = 0,
    sxy = 0;
  for (const s of samples) {
    const dx = s.x - mx,
      dy = s.y - my;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const axis = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  let ux = -Math.sin(axis),
    uy = Math.cos(axis);
  if (uy > 0) {
    ux = -ux;
    uy = -uy;
  }
  // bias "up" toward the screen's up so tufts don't grow sideways
  const upA = Math.atan2(uy, ux);
  const up = upA + angleDiffLocal(-Math.PI / 2, upA) * 0.5;
  ux = Math.cos(up);
  uy = Math.sin(up);
  const ax = Math.cos(axis),
    ay = Math.sin(axis);

  // ground line = lowest projection; peaks = the corners that reach up
  let lo = Infinity,
    hi = -Infinity,
    amin = Infinity,
    amax = -Infinity;
  for (const s of samples) {
    const h = (s.x - mx) * ux + (s.y - my) * uy;
    const a = (s.x - mx) * ax + (s.y - my) * ay;
    lo = Math.min(lo, h);
    hi = Math.max(hi, h);
    amin = Math.min(amin, a);
    amax = Math.max(amax, a);
  }
  const height = Math.max(hi - lo, 24);
  const peaks: { a: number; h: number }[] = [];
  for (const k of [0, ...g.corners, samples.length - 1]) {
    const s = samples[k];
    const h = (s.x - mx) * ux + (s.y - my) * uy;
    if (h > lo + height * 0.45) peaks.push({ a: (s.x - mx) * ax + (s.y - my) * ay, h: h - lo });
  }
  if (peaks.length < 2) peaks.push({ a: (amin + amax) / 2, h: height });
  // fill in a few shorter blades between peaks
  const extra = Math.max(2, Math.round(peaks.length * 0.8));
  for (let i = 0; i < extra; i++) peaks.push({ a: range(amin, amax), h: height * range(0.35, 0.7) });
  peaks.sort((p, q) => p.a - q.a);

  const [c1, c2] = ctx.dir.leafPair();
  const span = amax - amin;
  let t = 0;
  for (const p of peaks) {
    // bases gather toward the middle of the tuft
    const ba = p.a * 0.55 + range(-4, 4);
    const bx = mx + ax * ba + ux * lo;
    const by = my + ay * ba + uy * lo;
    const tx = mx + ax * p.a + ux * (lo + p.h);
    const ty = my + ay * p.a + uy * (lo + p.h);
    const len = Math.hypot(tx - bx, ty - by) * range(0.95, 1.08);
    const ang = Math.atan2(ty - by, tx - bx);
    leaf(
      ctx,
      bx,
      by,
      ang,
      len,
      clamp(len * range(0.08, 0.12), 4.5, 11),
      chance(0.55) ? c1 : c2,
      mixAbs(c1, c2, 0.5),
      t,
      0.5,
      { k: 0.55, e: 0.85, bend: range(-0.12, 0.12) * (p.a > 0 ? 1 : -1), vein: 0, water: 0.26 },
    );
    t += 0.05;
  }
  // a couple of broader leaves at the ground for body
  for (let i = 0; i < irange(1, 3); i++) {
    const ba = range(-0.3, 0.3) * span;
    const bx = mx + ax * ba + ux * lo;
    const by = my + ay * ba + uy * lo;
    const a = up + range(-0.9, 0.9);
    const len = clamp(height * range(0.3, 0.45), 14, 40);
    leaf(ctx, bx, by, a, len, len * 0.38, c2, c1, t + i * 0.08, 0.5);
  }
  if (chance(0.5)) {
    const p = peaks.reduce((m, q) => (q.h > m.h ? q : m), peaks[0]);
    const x = mx + ax * p.a + ux * (lo + p.h);
    const y = my + ay * p.a + uy * (lo + p.h);
    const fc = ctx.dir.flower(x, y, g.dir, false);
    spray(ctx, x, y, up, range(10, 16), fc, t + 0.3);
  }
}

function angleDiffLocal(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Tap → small wildflower, petals drifting, or berries. */
export function fromTap(ctx: Ctx, x: number, y: number, g: Gesture): void {
  const fac = ctx.dir.sizeFactor(x, y, 24);
  const R = ctx.dir.fitRadius(x, y, (17 + 18 * g.intensity) * fac + range(0, 6));
  const season = ctx.dir.season.id;
  const r = rnd();
  if (g.intensity > 0.6) {
    const fc = ctx.dir.flower(x, y, null);
    wildflower(ctx, x, y, R * 1.25, fc);
  } else if (r < 0.58) {
    const fc = ctx.dir.flower(x, y, null);
    wildflower(ctx, x, y, R, fc);
  } else if (r < 0.82) {
    const fc = ctx.dir.flower(x, y, null, false);
    scatter(ctx, x, y, R * 1.6, fc);
  } else if (season === 'autumn' || season === 'winter' || chance(0.5)) {
    berries(ctx, x, y, R * 1.1);
  } else {
    const fc = ctx.dir.flower(x, y, null);
    spray(ctx, x, y, rnd() * TAU, R, fc);
  }
}

/** Short flick → a little sprig: tiny stem, a leaf or two and a bud. */
export function sprigFromStroke(ctx: Ctx, samples: StrokeSample[], g: Gesture): void {
  const pts: Pt[] = samples.map((s) => ({ x: s.x, y: s.y }));
  let path = resample(toPath(pts), 2);
  // extend short flicks a little so the sprig has room
  const L = pathLength(path);
  const end = pathAt(path, L);
  if (L < 40) {
    const ext = curvePath(end.x, end.y, end.a, 40 - L, range(-0.004, 0.004));
    path = toPath([...path, ...ext.slice(1)]);
  }
  const stem = ctx.dir.stem();
  const L2 = pathLength(path);
  const dur = 0.5;
  growLine(ctx, path, { w0: 3.2, w1: 2, abs: stem, amount: 0.8, water: 0.5, delay: 0, dur });
  const [c1, c2] = ctx.dir.leafPair();
  const q = pathAt(path, L2 * 0.45);
  const side = chance(0.5) ? 1 : -1;
  leaf(ctx, q.x, q.y, q.a + side * 0.7, 18, 7, c1, c2, dur * 0.5, 0.45);
  if (chance(0.6)) leaf(ctx, q.x, q.y, q.a - side * 0.6, 14, 5.5, c2, c1, dur * 0.6, 0.45);
  const tip = pathAt(path, L2);
  const fc = ctx.dir.flower(tip.x, tip.y, g.dir);
  if (chance(0.55)) bud(ctx, tip.x, tip.y, tip.a, range(12, 17), fc, dur);
  else cosmos(ctx, tip.x + Math.cos(tip.a) * 5, tip.y + Math.sin(tip.a) * 5, range(12, 17), fc, dur);
}

export { peony, rose, anemone };
