/** 디자인 시스템 — 색은 세 가지뿐. */
export const PALETTE = {
  ink: '#0B0B0C',
  paper: '#EDE8DF',
  vermilion: '#D9481C',
} as const;

export const rgb = (hex: string): [number, number, number] => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

export type Tier = 'high' | 'mid' | 'low';

export interface Quality {
  tier: Tier;
  /** devicePixelRatio 상한 (절대 상한 2) */
  dprCap: number;
  /** 유체 속도장 해상도 (짧은 변) */
  simRes: number;
  /** 먹(염료) 해상도 (짧은 변) */
  dyeRes: number;
  pressureIters: number;
  /** 파티클 상태 텍스처 크기 → 개수 = w*h */
  particleTex: [number, number];
  /** 흐름 잔상 버퍼 배율 (화면 픽셀 대비) */
  trailScale: number;
  /** 포스터 긴 변 픽셀 */
  posterLong: number;
}

export const isCoarse = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export const prefersReducedMotion = (): boolean =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

const TIERS: Record<Tier, Omit<Quality, 'tier'>> = {
  high: {
    dprCap: 2,
    simRes: 192,
    dyeRes: 1024,
    pressureIters: 22,
    particleTex: [320, 320], // 102,400
    trailScale: 1,
    posterLong: 2400,
  },
  mid: {
    dprCap: 2,
    simRes: 128,
    dyeRes: 720,
    pressureIters: 16,
    particleTex: [256, 256], // 65,536
    trailScale: 0.75,
    posterLong: 2000,
  },
  low: {
    dprCap: 1.5,
    simRes: 96,
    dyeRes: 512,
    pressureIters: 12,
    particleTex: [224, 224], // 50,176
    trailScale: 0.6,
    posterLong: 1600,
  },
};

export function detectQuality(): Quality {
  const coarse = isCoarse();
  const minSide = Math.min(screen.width, screen.height);
  const cores = navigator.hardwareConcurrency || 4;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  let tier: Tier = 'high';
  if (coarse || minSide < 600) tier = 'mid';
  if ((coarse && (cores <= 4 || mem <= 2)) || mem <= 1) tier = 'low';
  const forced = new URLSearchParams(location.search).get('q') as Tier | null;
  if (forced && forced in TIERS) tier = forced;
  return { tier, ...TIERS[tier] };
}

export function downgrade(q: Quality): Quality | null {
  if (q.tier === 'high') return { tier: 'mid', ...TIERS.mid };
  if (q.tier === 'mid') return { tier: 'low', ...TIERS.low };
  return null;
}

export const clamp = (v: number, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smoothstep = (a: number, b: number, v: number) => {
  const t = clamp((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
