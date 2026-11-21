import { absorbance } from '../engine/watercolor';

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export interface Season {
  id: SeasonId;
  label: string;
  /** colour of the little UI dot */
  dot: string;
  /** main flower hues, ordered so neighbours are analogous */
  flowers: string[];
  /** complementary accent hues, used sparingly */
  accents: string[];
  /** flower centres / stamens */
  centers: string[];
  leaves: string[];
  stems: string[];
  /** small fruit / berries (tap variant) */
  berries: string[];
  /** pigment concentration multiplier: deep palettes need more paint */
  strength: number;
}

export const SEASONS: Record<SeasonId, Season> = {
  spring: {
    id: 'spring',
    label: '봄',
    dot: '#EBA3B5',
    flowers: ['#F4B3C2', '#EE9AB0', '#E78AA3', '#F2BFCB', '#DDA0C4', '#C9A5DA'],
    accents: ['#F1CF6A', '#9DC3DE'],
    centers: ['#E2A93B', '#D2734A', '#C44D58'],
    leaves: ['#9CC05C', '#86AF4E', '#B3CF72', '#7EA65A'],
    stems: ['#7E9C48', '#8DAA55'],
    berries: ['#E06C8C', '#C98BD0'],
    strength: 1.15,
  },
  summer: {
    id: 'summer',
    label: '여름',
    dot: '#F0806E',
    flowers: ['#F48A78', '#F27064', '#FF9C80', '#F6B18A', '#EC5F73', '#F7A3A0'],
    accents: ['#2A9D8F', '#38A9C2'],
    centers: ['#F2C14E', '#B9462E', '#6E3B2A'],
    leaves: ['#3E9A82', '#2F8C78', '#5DAA86', '#6FB07A'],
    stems: ['#3E7E68', '#4F8B6B'],
    berries: ['#E8505F', '#2A9D8F'],
    strength: 1.1,
  },
  autumn: {
    id: 'autumn',
    label: '가을',
    dot: '#9E2E4A',
    flowers: ['#8E2443', '#A8344E', '#B9533A', '#C47A35', '#D19A40', '#9A3A5E'],
    accents: ['#4F6E8A', '#5D4D86'],
    centers: ['#3B2618', '#D9A441', '#6A2A1C'],
    leaves: ['#748739', '#8D8A3A', '#A57A30', '#5F7436'],
    stems: ['#5D6A33', '#6E6B35'],
    berries: ['#8E1F35', '#C0632F'],
    strength: 1.5,
  },
  winter: {
    id: 'winter',
    label: '겨울',
    dot: '#3E4C86',
    flowers: ['#33407A', '#46599A', '#6D80B5', '#8C9AC4', '#A7B0BE', '#BBC6D6'],
    accents: ['#A72A3E', '#C4A253'],
    centers: ['#C4A253', '#1E2446', '#A72A3E'],
    leaves: ['#5F7C70', '#7A9387', '#4C675F', '#8CA197'],
    stems: ['#566A60', '#62756A'],
    berries: ['#A72A3E', '#33407A'],
    strength: 1.25,
  },
};

export const SEASON_ORDER: SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];

export type Abs = [number, number, number];

const absCache = new Map<string, Abs>();
export function A(hex: string): Abs {
  let a = absCache.get(hex);
  if (!a) {
    a = absorbance(hex);
    absCache.set(hex, a);
  }
  return a;
}

export function mixAbs(a: Abs, b: Abs, t: number): Abs {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Scale the absorbance spectrum toward its own peak — a "deeper" shade of the same pigment. */
export function deepen(a: Abs, k: number): Abs {
  const m = Math.max(a[0], a[1], a[2]);
  return a.map((v) => v * (1 + (k - 1) * (0.5 + 0.5 * (v / m)))) as Abs;
}
