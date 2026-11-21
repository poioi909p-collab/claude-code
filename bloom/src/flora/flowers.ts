import { Shape } from '../engine/watercolor';
import type { FlowerColors } from '../art/director';
import { Abs, mixAbs, deepen, A } from '../art/palette';
import { Ctx, grow, dot } from './grow';
import { rnd, range, irange, chance, pick, jitter, TAU } from '../util/rand';


/** Leaves peeking out from behind a big flower. */
function backLeaves(ctx: Ctx, x: number, y: number, R: number, delay: number): void {
  const n = irange(1, 3);
  const base = rnd() * TAU;
  for (let i = 0; i < n; i++) {
    const a = base + (i / n) * TAU * range(0.55, 0.9) + range(-0.3, 0.3);
    const len = R * range(0.7, 1.0);
    const r0 = R * 0.72;
    const [c1, c2] = ctx.dir.leafPair();
    const bx = x + Math.cos(a) * r0;
    const by = y + Math.sin(a) * r0;
    leaf(ctx, bx, by, a + range(-0.25, 0.25), len, len * range(0.36, 0.46), c1, c2, delay + i * 0.12);
  }
}

export function leaf(
  ctx: Ctx,
  x: number,
  y: number,
  a: number,
  len: number,
  wid: number,
  c1: Abs,
  c2: Abs,
  delay: number,
  dur = 0.6,
  shape: { k?: number; e?: number; bend?: number; vein?: number; water?: number } = {},
): void {
  const bend = shape.bend ?? range(-0.12, 0.12);
  grow(
    ctx,
    {
      type: Shape.Leaf,
      x,
      y,
      angle: a,
      len,
      wid,
      k: shape.k ?? range(0.85, 1.1),
      e: shape.e ?? range(0.7, 0.95),
      abs: c1,
      amount: range(0.6, 0.8),
      water: shape.water ?? 0.42,
      rim: 0.35,
      grad: range(-0.4, 0.3),
      ruffle: 0.04,
      notch: shape.vein ?? (len > 24 ? range(0.12, 0.25) : 0),
      bend,
      soft: 1.4,
    },
    delay,
    dur,
  );
  // variegation dropped in while wet
  if (len > 18 && chance(0.75)) {
    const side = chance(0.5) ? 1 : -1;
    grow(
      ctx,
      {
        type: Shape.Leaf,
        x: x + Math.cos(a) * len * 0.08,
        y: y + Math.sin(a) * len * 0.08,
        angle: a + side * 0.06,
        len: len * 0.7,
        wid: wid * 0.5,
        k: shape.k ?? 0.8,
        e: 0.8,
        abs: c2,
        amount: range(0.25, 0.4),
        water: 0.2,
        bend,
        soft: 2.5,
      },
      delay + dur * 0.5,
      dur * 0.6,
    );
  }
  ctx.dir.mark(x + Math.cos(a) * len * 0.5, y + Math.sin(a) * len * 0.5, len * 0.5, 0.35);
}

function stamens(ctx: Ctx, x: number, y: number, r0: number, r1: number, n: number, c: Abs, size: number, delay: number): void {
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const r = range(r0, r1);
    dot(
      ctx,
      {
        type: Shape.Dab,
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        len: size * range(0.7, 1.2),
        wid: size * range(0.7, 1.1),
        angle: a,
        abs: c,
        amount: range(0.5, 0.9),
        water: 0.12,
        ruffle: 0.3,
        soft: 0.9,
      },
      delay + range(0, 0.25),
    );
  }
}

// ---------------------------------------------------------------------------

export function peony(ctx: Ctx, x: number, y: number, R: number, fc: FlowerColors, delay = 0): number {
  backLeaves(ctx, x, y, R, delay);
  const rot0 = rnd() * TAU;
  // outer: broad ruffled petals, alternating light and mid values
  const n = irange(6, 8);
  for (let i = 0; i < n; i++) {
    const a = rot0 + (i / n) * TAU + range(-0.16, 0.16);
    const len = R * range(0.6, 0.74);
    const off = R * 0.3;
    grow(
      ctx,
      {
        type: Shape.Petal,
        x: x + Math.cos(a) * off,
        y: y + Math.sin(a) * off,
        angle: a + range(-0.12, 0.12),
        len,
        wid: len * range(0.95, 1.15),
        k: range(1.15, 1.4),
        e: range(0.36, 0.46),
        abs: mixAbs(fc.light, fc.main, i % 2 ? 0.25 : 0.6),
        amount: jitter(0.42, 0.12),
        water: 0.5,
        rim: 0.8,
        grad: range(-0.7, -0.3),
        ruffle: range(0.16, 0.26),
        soft: 1.5,
      },
      delay + 0.45 + i * 0.05,
      range(0.9, 1.15),
    );
  }
  // middle: cupped crescents opening outward
  const m = irange(5, 7);
  for (let i = 0; i < m; i++) {
    const t = i / m;
    grow(
      ctx,
      {
        type: Shape.Arc,
        x: x + range(-1, 1) * R * 0.03,
        y: y + range(-1, 1) * R * 0.03,
        angle: rot0 + 0.4 + t * TAU + range(-0.25, 0.25),
        len: R * range(0.3, 0.42),
        wid: R * range(0.14, 0.2),
        k: range(0.7, 1.0),
        e: 0.7,
        abs: mixAbs(fc.main, fc.deep, 0.25 + 0.2 * (i % 2)),
        amount: jitter(0.55, 0.12),
        water: 0.42,
        rim: 0.9,
        ruffle: 0.12,
        soft: 1.3,
      },
      delay + 0.2 + i * 0.06,
      0.85,
    );
  }
  // heart: small deep curls
  for (let i = 0; i < 4; i++) {
    grow(
      ctx,
      {
        type: Shape.Arc,
        x,
        y,
        angle: rot0 + i * 1.9 + range(-0.3, 0.3),
        len: R * range(0.08, 0.17),
        wid: R * range(0.06, 0.09),
        k: range(1.0, 1.5),
        e: 0.7,
        abs: fc.deep,
        amount: 0.8,
        water: 0.3,
        rim: 0.6,
        ruffle: 0.1,
        soft: 1.1,
      },
      delay + i * 0.08,
      0.7,
    );
  }
  stamens(ctx, x, y, R * 0.03, R * 0.12, irange(4, 8), fc.center, Math.max(1.6, R * 0.025), delay + 1.2);
  ctx.dir.mark(x, y, R, 1);
  return delay + 1.8;
}

export function rose(ctx: Ctx, x: number, y: number, R: number, fc: FlowerColors, delay = 0): number {
  backLeaves(ctx, x, y, R, delay);
  const rot0 = rnd() * TAU;
  const turns = irange(6, 8);
  // tight spiral of crescents from the heart outward
  for (let k = 0; k < turns; k++) {
    const t = k / (turns - 1);
    const col = mixAbs(fc.deep, fc.main, Math.min(t * 1.3, 1));
    grow(
      ctx,
      {
        type: Shape.Arc,
        x: x + range(-1, 1) * R * 0.02,
        y: y + range(-1, 1) * R * 0.02,
        angle: rot0 + k * 2.35 + range(-0.2, 0.2),
        len: R * (0.1 + 0.07 * k) * range(0.92, 1.08),
        wid: R * (0.07 + 0.02 * k),
        k: range(1.0, 1.45) + t * 0.3,
        e: 0.75,
        abs: col,
        amount: 0.85 - 0.3 * t,
        water: 0.55,
        rim: 0.4,
        ruffle: 0.06,
        soft: 1.3,
      },
      delay + k * 0.09,
      0.8,
    );
  }
  // open outer petals
  const n = irange(5, 6);
  for (let i = 0; i < n; i++) {
    const a = rot0 + (i / n) * TAU + range(-0.2, 0.2);
    const len = R * range(0.5, 0.6);
    const off = R * 0.38;
    grow(
      ctx,
      {
        type: Shape.Petal,
        x: x + Math.cos(a) * off,
        y: y + Math.sin(a) * off,
        angle: a,
        len,
        wid: len * range(1.2, 1.45),
        k: 1.05,
        e: 0.38,
        abs: mixAbs(fc.main, fc.light, 0.35),
        amount: jitter(0.4, 0.15),
        water: 0.5,
        rim: 0.85,
        grad: -0.35,
        ruffle: 0.1,
        soft: 1.6,
      },
      delay + 0.55 + i * 0.05,
      1.0,
    );
  }
  ctx.dir.mark(x, y, R, 1);
  return delay + 1.6;
}

export function anemone(ctx: Ctx, x: number, y: number, R: number, fc: FlowerColors, delay = 0, leaves = true): number {
  if (leaves) backLeaves(ctx, x, y, R, delay);
  const n = irange(5, 7);
  const rot0 = rnd() * TAU;
  const two = R > 30 && chance(0.6);
  for (let ring = two ? 1 : 0; ring >= 0; ring--) {
    for (let i = 0; i < n; i++) {
      const a = rot0 + (i + ring * 0.5) * (TAU / n) + range(-0.12, 0.12);
      const len = R * (ring ? 0.62 : 0.8) * range(0.9, 1.08);
      grow(
        ctx,
        {
          type: Shape.Petal,
          x: x + Math.cos(a) * R * 0.06,
          y: y + Math.sin(a) * R * 0.06,
          angle: a,
          len,
          wid: len * range(0.85, 1.0),
          k: range(1.4, 1.7),
          e: range(0.4, 0.5),
          abs: ring ? fc.main : mixAbs(fc.light, fc.main, 0.5),
          amount: jitter(ring ? 0.5 : 0.42, 0.1) * (i % 2 ? 0.75 : 1.12),
          water: 0.52,
          rim: 0.85,
          grad: range(-0.7, -0.3),
          ruffle: range(0.06, 0.12),
          soft: 1.6,
        },
        delay + (ring ? 0 : 0.2) + i * 0.06,
        range(0.95, 1.25),
      );
    }
  }
  // dark velvety heart that bleeds a little into the wet petals
  const heart = mixAbs(A('#2C2542'), fc.deep, 0.25);
  grow(
    ctx,
    { type: Shape.Dab, x, y, len: R * 0.15, wid: R * 0.14, abs: heart, amount: 1.25, water: 0.35, ruffle: 0.5, rim: 0.3, soft: 1.5 },
    delay + 0.75,
    0.5,
  );
  stamens(ctx, x, y, R * 0.18, R * 0.3, irange(12, 18), heart, Math.max(1.3, R * 0.022), delay + 1.05);
  ctx.dir.mark(x, y, R, 1);
  return delay + 1.6;
}

/** Cosmos / cherry blossom: notched petals around a golden eye. */
export function cosmos(ctx: Ctx, x: number, y: number, R: number, fc: FlowerColors, delay = 0, petals?: number): number {
  const n = petals ?? (ctx.dir.season.id === 'spring' ? 5 : irange(6, 8));
  const rot0 = rnd() * TAU;
  const sakura = n === 5;
  for (let i = 0; i < n; i++) {
    const a = rot0 + (i / n) * TAU + range(-0.1, 0.1);
    const len = R * range(0.78, 0.92);
    grow(
      ctx,
      {
        type: Shape.Petal,
        x: x + Math.cos(a) * R * 0.08,
        y: y + Math.sin(a) * R * 0.08,
        angle: a,
        len,
        wid: len * (sakura ? range(0.75, 0.9) : range(0.42, 0.55)),
        k: sakura ? 1.45 : 1.7,
        e: sakura ? 0.5 : 0.6,
        abs: mixAbs(fc.main, fc.light, range(0, 0.5)),
        amount: jitter(0.5, 0.1) * (i % 2 ? 0.8 : 1.1),
        water: 0.48,
        rim: 0.8,
        grad: sakura ? -0.5 : 0.2,
        ruffle: 0.1,
        notch: sakura ? range(0.12, 0.18) : range(0.06, 0.12),
        soft: 1.3,
      },
      delay + i * 0.07,
      range(0.8, 1.05),
    );
  }
  grow(
    ctx,
    { type: Shape.Dab, x, y, len: R * 0.13, wid: R * 0.13, abs: fc.center, amount: 0.9, water: 0.3, ruffle: 0.5, soft: 1.2 },
    delay + 0.5,
    0.4,
  );
  stamens(ctx, x, y, R * 0.08, R * 0.22, irange(5, 9), deepen(fc.center, 1.4), Math.max(1.2, R * 0.03), delay + 0.8);
  ctx.dir.mark(x, y, R, 0.9);
  return delay + 1.2;
}

/** Side-view cup (tulip / bell) opening along `a`. */
export function tulip(ctx: Ctx, x: number, y: number, a: number, size: number, fc: FlowerColors, delay = 0): number {
  // three pointed petals: two at the sides, a lighter one in front
  const parts = [
    { da: -0.3, len: 1.0, wid: 0.5, col: mixAbs(fc.main, fc.deep, 0.5), amt: 0.7, t: 0, bend: 0.06 },
    { da: 0.3, len: 1.0, wid: 0.5, col: mixAbs(fc.main, fc.deep, 0.35), amt: 0.66, t: 0.06, bend: -0.06 },
    { da: 0, len: 0.9, wid: 0.56, col: mixAbs(fc.main, fc.light, 0.3), amt: 0.5, t: 0.22, bend: 0 },
  ];
  for (const p of parts) {
    grow(
      ctx,
      {
        type: Shape.Petal,
        x: x + Math.cos(a) * size * 0.05,
        y: y + Math.sin(a) * size * 0.05,
        angle: a + p.da + range(-0.05, 0.05),
        len: size * p.len,
        wid: size * p.wid,
        k: 1.0,
        e: 0.78,
        abs: p.col,
        amount: jitter(p.amt, 0.1),
        water: 0.48,
        rim: 0.9,
        grad: -0.5,
        ruffle: 0.05,
        bend: p.bend,
        soft: 1.3,
      },
      delay + p.t,
      0.9,
    );
  }
  // small sepal cradle
  const g = ctx.dir.leaf();
  for (const sd of [-1, 1]) {
    grow(
      ctx,
      { type: Shape.Leaf, x, y, angle: a + sd * 0.9, len: size * 0.28, wid: size * 0.12, k: 0.8, e: 0.8, abs: g, amount: 0.7, water: 0.25, soft: 1 },
      delay + 0.3,
      0.5,
    );
  }
  ctx.dir.mark(x + Math.cos(a) * size * 0.5, y + Math.sin(a) * size * 0.5, size * 0.6, 0.8);
  return delay + 1.1;
}

export function bud(ctx: Ctx, x: number, y: number, a: number, size: number, fc: FlowerColors, delay = 0): number {
  for (let i = 0; i < 2; i++) {
    grow(
      ctx,
      {
        type: Shape.Petal,
        x,
        y,
        angle: a + (i ? 0.16 : -0.12),
        len: size * (i ? 1.15 : 1.3),
        wid: size * 0.7,
        k: 0.85,
        e: 0.7,
        abs: i ? fc.deep : fc.main,
        amount: i ? 0.75 : 0.65,
        water: 0.45,
        rim: 0.8,
        grad: 0.4,
        ruffle: 0.05,
        soft: 1.2,
      },
      delay + i * 0.15,
      0.7,
    );
  }
  const g = ctx.dir.leaf();
  for (const s of [-1, 1]) {
    grow(
      ctx,
      { type: Shape.Leaf, x, y, angle: a + s * 0.5, len: size * 0.75, wid: size * 0.24, k: 0.8, e: 0.8, abs: g, amount: 0.8, water: 0.3, rim: 0.5, soft: 1 },
      delay + 0.25,
      0.5,
    );
  }
  ctx.dir.mark(x, y, size * 0.7, 0.5);
  return delay + 0.9;
}

/** Baby's-breath style spray of tiny dots. */
export function spray(ctx: Ctx, x: number, y: number, a: number, size: number, fc: FlowerColors, delay = 0): number {
  const n = irange(7, 13);
  for (let i = 0; i < n; i++) {
    const aa = a + range(-1.1, 1.1);
    const r = size * Math.sqrt(rnd()) * 0.9;
    grow(
      ctx,
      {
        type: Shape.Dab,
        x: x + Math.cos(aa) * r,
        y: y + Math.sin(aa) * r,
        len: range(3, 5.5),
        wid: range(2.8, 5),
        abs: chance(0.7) ? fc.main : fc.deep,
        amount: range(0.65, 0.95),
        water: 0.4,
        rim: 0.5,
        ruffle: 0.35,
        soft: 1,
      },
      delay + i * 0.06,
      0.45,
    );
  }
  ctx.dir.mark(x, y, size, 0.5);
  return delay + n * 0.06 + 0.5;
}

/** A small wildflower for taps; size scales with hold time. */
export function wildflower(ctx: Ctx, x: number, y: number, R: number, fc: FlowerColors, delay = 0): number {
  const kind = pick(['five', 'five', 'cosmos', 'anemone']);
  if (kind === 'cosmos') return cosmos(ctx, x, y, R, fc, delay);
  if (kind === 'anemone' && R > 16) return anemone(ctx, x, y, R, fc, delay, false);
  const n = 5;
  const rot0 = rnd() * TAU;
  for (let i = 0; i < n; i++) {
    const a = rot0 + (i / n) * TAU + range(-0.15, 0.15);
    const len = R * range(0.7, 0.85);
    grow(
      ctx,
      {
        type: Shape.Petal,
        x: x + Math.cos(a) * R * 0.06,
        y: y + Math.sin(a) * R * 0.06,
        angle: a,
        len,
        wid: len * range(0.75, 0.95),
        k: 1.4,
        e: 0.5,
        abs: mixAbs(fc.main, fc.light, range(0, 0.4)),
        amount: jitter(0.65, 0.12) * (i % 2 ? 0.85 : 1.05),
        water: 0.45,
        rim: 0.75,
        grad: -0.3,
        ruffle: 0.08,
        notch: chance(0.3) ? 0.1 : 0,
        soft: 1.2,
      },
      delay + i * 0.06,
      0.75,
    );
  }
  dot(ctx, { type: Shape.Dab, x, y, len: R * 0.16, wid: R * 0.15, abs: fc.center, amount: 0.9, water: 0.2, ruffle: 0.4, soft: 1 }, delay + 0.55);
  ctx.dir.mark(x, y, R, 0.7);
  return delay + 0.9;
}

/** A handful of loose petals drifting in the wind. */
export function scatter(ctx: Ctx, x: number, y: number, size: number, fc: FlowerColors, delay = 0): number {
  const n = irange(3, 6);
  const drift = rnd() * TAU;
  for (let i = 0; i < n; i++) {
    const d = (i - n / 2) * size * 0.8 + range(-4, 4);
    const px = x + Math.cos(drift) * d + range(-1, 1) * size * 0.5;
    const py = y + Math.sin(drift) * d + range(-1, 1) * size * 0.5;
    const len = size * range(0.45, 0.7) * (1 - (Math.abs(i - n / 2) / n) * 0.5);
    grow(
      ctx,
      {
        type: Shape.Petal,
        x: px,
        y: py,
        angle: rnd() * TAU,
        len,
        wid: len * range(0.6, 0.8),
        k: 1.3,
        e: 0.55,
        abs: mixAbs(fc.main, fc.light, range(0.1, 0.5)),
        amount: range(0.6, 0.8),
        water: 0.42,
        rim: 0.9,
        notch: ctx.dir.season.id === 'spring' ? 0.14 : 0,
        bend: range(-0.15, 0.15),
        soft: 1.1,
      },
      delay + i * 0.1,
      0.6,
    );
  }
  ctx.dir.mark(x, y, size, 0.35);
  return delay + n * 0.1 + 0.6;
}

export function berries(ctx: Ctx, x: number, y: number, size: number, delay = 0): number {
  const c = ctx.dir.berry();
  const n = irange(3, 7);
  for (let i = 0; i < n; i++) {
    const a = rnd() * TAU;
    const r = size * Math.sqrt(rnd()) * 0.42;
    const br = range(0.2, 0.28) * size;
    grow(
      ctx,
      {
        type: Shape.Dab,
        x: x + Math.cos(a) * r,
        y: y + Math.sin(a) * r,
        len: br,
        wid: br * range(0.9, 1),
        abs: c,
        amount: range(0.8, 1.1),
        water: 0.5,
        rim: 0.7,
        grad: 0.6,
        ruffle: 0.15,
        soft: 1,
      },
      delay + i * 0.08,
      0.5,
    );
  }
  ctx.dir.mark(x, y, size, 0.4);
  return delay + n * 0.08 + 0.5;
}

/** Choose a big flower for a closed loop. */
export function bigFlower(ctx: Ctx, x: number, y: number, R: number, fc: FlowerColors, delay = 0): number {
  const f = pick([peony, rose, anemone]);
  return f(ctx, x, y, R, fc, delay);
}
