import { SEASONS, Season, SeasonId, A, Abs, deepen, mixAbs } from './palette';
import { rnd, pick, weighted, chance, clamp, smoothstep, lerp, TAU } from '../util/rand';

export interface FlowerColors {
  main: Abs;
  deep: Abs;
  light: Abs;
  center: Abs;
  /** palette index (-1 for accents) */
  index: number;
}

interface Placed {
  x: number;
  y: number;
  index: number;
}

interface DirectorState {
  grid: Float32Array;
  placed: Placed[];
  used: number[];
  accents: number;
  total: number;
  dominant: number;
}

const CELL = 18;

/**
 * The art director keeps every picture coherent: one seasonal palette, colours
 * that harmonise with what is already on the sheet (mostly analogous, the odd
 * complementary accent), and flower sizes that respect the empty space.
 */
export class ArtDirector {
  season: Season;
  private cols = 1;
  private rows = 1;
  private grid = new Float32Array(1);
  private placed: Placed[] = [];
  private used: number[] = [];
  private accents = 0;
  private total = 0;
  private dominant = -1;

  constructor(
    seasonId: SeasonId,
    private w: number,
    private h: number,
  ) {
    this.season = SEASONS[seasonId];
    this.resize(w, h);
    this.reset();
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    this.cols = Math.ceil(w / CELL) + 1;
    this.rows = Math.ceil(h / CELL) + 1;
    this.grid = new Float32Array(this.cols * this.rows);
  }

  reset(seasonId?: SeasonId): void {
    if (seasonId) this.season = SEASONS[seasonId];
    this.grid.fill(0);
    this.placed = [];
    this.used = this.season.flowers.map(() => 0);
    this.accents = 0;
    this.total = 0;
    this.dominant = -1;
  }

  get isEmpty(): boolean {
    return this.total === 0 && this.placed.length === 0;
  }

  save(): DirectorState & { season: SeasonId } {
    return {
      season: this.season.id,
      grid: this.grid.slice(),
      placed: this.placed.slice(),
      used: this.used.slice(),
      accents: this.accents,
      total: this.total,
      dominant: this.dominant,
    };
  }

  load(s: DirectorState & { season: SeasonId }): void {
    this.season = SEASONS[s.season];
    if (s.grid.length === this.grid.length) this.grid.set(s.grid);
    else this.grid.fill(0);
    this.placed = s.placed.slice();
    this.used = s.used.slice();
    this.accents = s.accents;
    this.total = s.total;
    this.dominant = s.dominant;
  }

  // ---- density -------------------------------------------------------------

  /** Record painted coverage (disc of radius r, weight ~ opacity). */
  mark(x: number, y: number, r: number, weight = 1): void {
    const c0 = Math.max(0, Math.floor((x - r) / CELL));
    const c1 = Math.min(this.cols - 1, Math.floor((x + r) / CELL));
    const r0 = Math.max(0, Math.floor((y - r) / CELL));
    const r1 = Math.min(this.rows - 1, Math.floor((y + r) / CELL));
    const rr = Math.max(r, CELL * 0.5);
    for (let j = r0; j <= r1; j++) {
      for (let i = c0; i <= c1; i++) {
        const cx = (i + 0.5) * CELL;
        const cy = (j + 0.5) * CELL;
        const d = Math.hypot(cx - x, cy - y);
        if (d > rr) continue;
        const k = this.grid[j * this.cols + i] + weight * (1 - d / rr) * 0.9;
        this.grid[j * this.cols + i] = Math.min(k, 1.5);
      }
    }
    this.total += weight;
  }

  /** Average coverage (0 empty … ~1 full) in a disc. */
  density(x: number, y: number, r: number): number {
    let s = 0;
    let n = 0;
    const c0 = Math.floor((x - r) / CELL);
    const c1 = Math.floor((x + r) / CELL);
    const r0 = Math.floor((y - r) / CELL);
    const r1 = Math.floor((y + r) / CELL);
    for (let j = r0; j <= r1; j++) {
      for (let i = c0; i <= c1; i++) {
        const cx = (i + 0.5) * CELL;
        const cy = (j + 0.5) * CELL;
        if (Math.hypot(cx - x, cy - y) > r) continue;
        n++;
        if (i < 0 || j < 0 || i >= this.cols || j >= this.rows) {
          s += 0.6; // off-sheet counts as "occupied" so flowers stay on paper
          continue;
        }
        s += Math.min(this.grid[j * this.cols + i], 1);
      }
    }
    return n ? s / n : 0;
  }

  /** Scale factor for a new element: big in empty areas, small in busy ones. */
  sizeFactor(x: number, y: number, r: number): number {
    const d = this.density(x, y, r * 1.3);
    return lerp(1.18, 0.5, smoothstep(0.08, 0.75, d)) * (0.85 + rnd() * 0.3);
  }

  /** Largest radius (≤ want) that keeps a flower mostly on the sheet. */
  fitRadius(x: number, y: number, want: number): number {
    const m = Math.min(x, y, this.w - x, this.h - y);
    const lim = Math.max(m * 1.25, 14);
    const cap = Math.min(this.w, this.h) * 0.3;
    return clamp(Math.min(want, lim, cap), 10, cap);
  }

  // ---- colour --------------------------------------------------------------

  /**
   * Pick colours for a new flower. `dir` (radians) is the stroke direction,
   * which weakly nudges the hue choice.
   */
  flower(x: number, y: number, dir: number | null = null, allowAccent = true): FlowerColors {
    const fc = this.pickFlower(x, y, dir, allowAccent);
    const k = this.season.strength;
    const sc = (a: Abs): Abs => [a[0] * k, a[1] * k, a[2] * k];
    return { ...fc, main: sc(fc.main), deep: sc(fc.deep), light: sc(fc.light) };
  }

  private pickFlower(x: number, y: number, dir: number | null, allowAccent: boolean): FlowerColors {
    const S = this.season;
    const n = S.flowers.length;

    // occasional complementary accent, never as the first flower
    if (allowAccent && this.placed.length >= 2 && this.accents < 1 + this.placed.length / 6 && chance(0.12)) {
      this.accents++;
      const hex = pick(S.accents);
      const main = A(hex);
      const fc = {
        main,
        deep: deepen(main, 1.5),
        light: main.map((v) => v * 0.55) as Abs,
        center: A(pick(S.centers)),
        index: -1,
      };
      this.placed.push({ x, y, index: -1 });
      return fc;
    }

    const dirIdx = dir === null ? -1 : (((dir % TAU) + TAU) % TAU) / TAU * n;
    // nearest neighbour flower within reach
    let near: Placed | null = null;
    let best = 260;
    for (const p of this.placed) {
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < best && p.index >= 0) {
        best = d;
        near = p;
      }
    }
    const weights: number[] = [];
    for (let i = 0; i < n; i++) {
      let wgt = 0.6;
      if (this.dominant >= 0) {
        const dd = Math.min(Math.abs(i - this.dominant), n - Math.abs(i - this.dominant));
        wgt += 2.2 * Math.exp(-(dd * dd) / 2.5);
      } else wgt += 1;
      if (dirIdx >= 0) {
        const dd = Math.min(Math.abs(i + 0.5 - dirIdx), n - Math.abs(i + 0.5 - dirIdx));
        wgt += 0.9 * Math.exp(-(dd * dd) / 1.5);
      }
      if (near) {
        // neighbours: analogous but not identical
        const dd = Math.min(Math.abs(i - near.index), n - Math.abs(i - near.index));
        wgt *= dd === 0 ? 0.55 : dd === 1 ? 1.5 : dd === 2 ? 1.0 : 0.6;
      }
      weights.push(wgt);
    }
    const idx = weighted(
      Array.from({ length: n }, (_, i) => i),
      weights,
    );
    this.used[idx]++;
    let max = -1;
    this.used.forEach((u, i) => {
      if (u > max) {
        max = u;
        this.dominant = i;
      }
    });
    this.placed.push({ x, y, index: idx });

    const main = A(S.flowers[idx]);
    const nb = A(S.flowers[(idx + (chance(0.5) ? 1 : n - 1)) % n]);
    return {
      main,
      deep: deepen(mixAbs(main, nb, 0.25), 1.55),
      light: mixAbs(main, nb, 0.3).map((v) => v * 0.6) as Abs,
      center: A(pick(S.centers)),
      index: idx,
    };
  }

  leaf(): Abs {
    return A(pick(this.season.leaves));
  }
  leafPair(): [Abs, Abs] {
    const a = A(pick(this.season.leaves));
    const b = A(pick(this.season.leaves));
    return [a, b];
  }
  stem(): Abs {
    return A(pick(this.season.stems));
  }
  berry(): Abs {
    const k = this.season.strength;
    return A(pick(this.season.berries)).map((v) => v * k) as Abs;
  }
  /** Very faint tint for the live water trail. */
  trail(): Abs {
    const S = this.season;
    return mixAbs(A(pick(S.flowers)), A(pick(S.leaves)), 0.5);
  }
}
