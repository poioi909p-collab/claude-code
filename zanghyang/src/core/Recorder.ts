import type { Stroke } from './Input';

/** 한 점: x, y (뷰포트 정규화 0..1), t (획 시작 기준 ms), width, intensity, temp, speed */
export const STRIDE = 7;

export type StrokeKind = 'ink' | 'string' | 'flow';

export interface RecordedStroke {
  room: 1 | 2 | 3;
  kind: StrokeKind;
  /** 세션 기준 시작 ms */
  t0: number;
  /** 지속 ms */
  dur: number;
  /** 기록 당시 화면 비 (w/h) */
  aspect: number;
  /** 기록 당시 화면 높이 (CSS px) */
  vh: number;
  pts: Float32Array;
  /** 현: 음 인덱스 등 */
  note?: number;
  dry?: number;
}

const MAX_STROKES = 600;
const MAX_POINTS = 1200;

/** 1~3실의 모든 스트로크를 타임스탬프와 함께 보관 → 4실에서 재사용. */
export class Recorder {
  readonly strokes: RecordedStroke[] = [];
  private listeners = new Set<() => void>();

  record(stroke: Stroke, room: 1 | 2 | 3, kind: StrokeKind, w: number, h: number, extra: Partial<RecordedStroke> = {}): void {
    if (stroke.cancelled || stroke.points.length === 0) return;
    const src = stroke.points;
    // 다운샘플: 가까운 점은 건너뛰고, 너무 길면 균등 솎아내기
    const kept: number[] = [];
    let lx = -1e9;
    let ly = -1e9;
    let lt = -1e9;
    for (let i = 0; i < src.length; i++) {
      const p = src[i];
      if (i === 0 || i === src.length - 1 || Math.hypot(p.x - lx, p.y - ly) > 1.5 || p.t - lt > 32) {
        kept.push(i);
        lx = p.x;
        ly = p.y;
        lt = p.t;
      }
    }
    const step = Math.max(1, kept.length / MAX_POINTS);
    const n = Math.min(kept.length, MAX_POINTS);
    const pts = new Float32Array(n * STRIDE);
    for (let j = 0; j < n; j++) {
      const p = src[kept[Math.min(kept.length - 1, Math.round(j * step))]];
      const o = j * STRIDE;
      pts[o] = p.x / w;
      pts[o + 1] = p.y / h;
      pts[o + 2] = p.t - stroke.startT;
      pts[o + 3] = p.width;
      pts[o + 4] = p.intensity;
      pts[o + 5] = p.temp;
      pts[o + 6] = p.speed;
    }
    this.strokes.push({
      room,
      kind,
      t0: stroke.startT,
      dur: stroke.last.t - stroke.startT,
      aspect: w / h,
      vh: h,
      pts,
      ...extra,
    });
    if (this.strokes.length > MAX_STROKES) this.strokes.shift();
    this.listeners.forEach((fn) => fn());
  }

  count(room?: number): number {
    return room ? this.strokes.filter((s) => s.room === room).length : this.strokes.length;
  }

  onChange(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}
