import type { StrokeSample } from '../input/stroke';

export type GestureKind = 'tap' | 'sprig' | 'circle' | 'zigzag' | 'stem';

export interface Gesture {
  kind: GestureKind;
  length: number;
  duration: number; // s
  speed: number; // css px / s
  /** net signed turning (radians) */
  turn: number;
  /** centroid and mean radius for loops */
  cx: number;
  cy: number;
  radius: number;
  /** overall direction start → end */
  dir: number;
  /** indices of sharp corners (zigzag) */
  corners: number[];
  /** 0..1 pressure / hold intensity */
  intensity: number;
  bbox: { x0: number; y0: number; x1: number; y1: number };
}

function angDiff(a: number, b: number): number {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

type P = { x: number; y: number };

/** Ramer–Douglas–Peucker simplification. */
function rdp(pts: P[], eps: number): P[] {
  if (pts.length < 3) return pts.slice();
  const a = pts[0];
  const b = pts[pts.length - 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  let best = -1;
  let bi = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = Math.abs((pts[i].x - a.x) * dy - (pts[i].y - a.y) * dx) / len;
    if (d > best) {
      best = d;
      bi = i;
    }
  }
  if (best <= eps) return [a, b];
  const l = rdp(pts.slice(0, bi + 1), eps);
  const r = rdp(pts.slice(bi), eps);
  return l.slice(0, -1).concat(r);
}

/** Sharp reversals on the raw polyline, mapped to sample indices. */
function rawCorners(raw: P[], samples: StrokeSample[]): number[] {
  const poly = rdp(raw, 6);
  const out: number[] = [];
  for (let i = 1; i < poly.length - 1; i++) {
    const p = poly[i - 1],
      q = poly[i],
      r = poly[i + 1];
    const l1 = Math.hypot(q.x - p.x, q.y - p.y);
    const l2 = Math.hypot(r.x - q.x, r.y - q.y);
    if (l1 < 18 || l2 < 18) continue;
    const turn = Math.abs(angDiff(Math.atan2(r.y - q.y, r.x - q.x), Math.atan2(q.y - p.y, q.x - p.x)));
    if (turn < 1.9) continue;
    let bi = 0;
    let bd = Infinity;
    for (let k = 0; k < samples.length; k++) {
      const d = Math.hypot(samples[k].x - q.x, samples[k].y - q.y);
      if (d < bd) {
        bd = d;
        bi = k;
      }
    }
    if (!out.length || bi > out[out.length - 1] + 4) out.push(bi);
  }
  return out;
}

/**
 * Classify a finished stroke from simple geometric features.
 * `holdTime` is the dwell before the pointer started moving (s).
 */
export function classify(
  samples: StrokeSample[],
  durationMs: number,
  holdTime: number,
  pressure: number | null,
  raw: P[] = [],
): Gesture {
  const n = samples.length;
  const first = samples[0];
  const last = samples[n - 1];
  const length = last.s;
  const duration = Math.max(durationMs / 1000, 0.016);
  const speed = length / duration;

  let x0 = Infinity,
    y0 = Infinity,
    x1 = -Infinity,
    y1 = -Infinity,
    cx = 0,
    cy = 0;
  for (const s of samples) {
    x0 = Math.min(x0, s.x);
    y0 = Math.min(y0, s.y);
    x1 = Math.max(x1, s.x);
    y1 = Math.max(y1, s.y);
    cx += s.x;
    cy += s.y;
  }
  cx /= n;
  cy /= n;
  let radius = 0;
  for (const s of samples) radius += Math.hypot(s.x - cx, s.y - cy);
  radius /= n;
  const diag = Math.hypot(x1 - x0, y1 - y0);

  // turning measured over ~8px windows
  const W = 4;
  let turn = 0;
  let prevA: number | null = null;
  const dirs: number[] = [];
  for (let i = W; i < n; i += W) {
    const a = Math.atan2(samples[i].y - samples[i - W].y, samples[i].x - samples[i - W].x);
    dirs.push(a);
    if (prevA !== null) turn += angDiff(a, prevA);
    prevA = a;
  }

  // sharp corners: direction reverses across a short span
  const corners: number[] = [];
  const span = 3; // in dir units (~12-24px)
  for (let i = span; i < dirs.length - span; i++) {
    const d = Math.abs(angDiff(dirs[i + span - 1], dirs[i - span]));
    if (d > 1.9) {
      const idx = i * W;
      if (!corners.length || idx - corners[corners.length - 1] > span * W * 2) corners.push(idx);
      else if (d > 2.2) corners[corners.length - 1] = idx;
    }
  }

  if (raw.length > 2) {
    const rc = rawCorners(raw, samples);
    if (rc.length > corners.length) corners.splice(0, corners.length, ...rc);
  }

  const chord = Math.hypot(last.x - first.x, last.y - first.y);
  const dir = Math.atan2(last.y - first.y, last.x - first.x);

  const intensityHold = Math.min(holdTime / 0.9, 1);
  const intensity = pressure !== null ? Math.max(pressure, intensityHold * 0.8) : intensityHold;

  let kind: GestureKind;
  if (length < 14) kind = 'tap';
  else if (length < 50) kind = 'sprig';
  else if (corners.length >= 3 || (corners.length >= 2 && speed > 700)) kind = 'zigzag';
  else if (
    length > 70 &&
    Math.abs(turn) > Math.PI * 1.45 &&
    (chord < Math.max(36, length * 0.22) || (Math.abs(turn) > Math.PI * 1.85 && chord < diag * 0.7)) &&
    (x1 - x0) / Math.max(y1 - y0, 1) < 3.2 &&
    (y1 - y0) / Math.max(x1 - x0, 1) < 3.2
  )
    kind = 'circle';
  else kind = 'stem';

  return { kind, length, duration, speed, turn, cx, cy, radius, dir, corners, intensity, bbox: { x0, y0, x1, y1 } };
}
