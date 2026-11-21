/** 모바일 햅틱 — 아주 미세하게, 과도한 호출은 걸러낸다. */
let last = 0;
const supported = typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export function haptic(ms = 6, minGap = 45): void {
  if (!supported) return;
  const now = performance.now();
  if (now - last < minGap) return;
  last = now;
  try {
    navigator.vibrate(Math.max(1, Math.round(ms)));
  } catch {
    /* noop */
  }
}
