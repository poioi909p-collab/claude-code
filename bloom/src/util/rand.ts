// Small random helpers. Seeded from crypto so no two sessions match.

let state = (crypto.getRandomValues(new Uint32Array(1))[0] ^ Date.now()) >>> 0 || 1;

/** xorshift32 */
export function rnd(): number {
  state ^= state << 13;
  state >>>= 0;
  state ^= state >>> 17;
  state ^= state << 5;
  state >>>= 0;
  return state / 4294967296;
}

export const range = (a: number, b: number): number => a + (b - a) * rnd();
export const irange = (a: number, b: number): number => Math.floor(range(a, b + 1));
export const chance = (p: number): boolean => rnd() < p;
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(rnd() * arr.length)];
/** Roughly normal, mean 0, sd 1 (Irwin–Hall with 3 terms). */
export const gauss = (): number => (rnd() + rnd() + rnd() - 1.5) * 2;
export const jitter = (v: number, f: number): number => v * (1 + (rnd() * 2 - 1) * f);

export function weighted<T>(items: readonly T[], weights: readonly number[]): T {
  let sum = 0;
  for (const w of weights) sum += w;
  let r = rnd() * sum;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

export const clamp = (v: number, a: number, b: number): number => Math.min(Math.max(v, a), b);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const TAU = Math.PI * 2;
