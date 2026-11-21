/**
 * 프레임 시간 감시 — 지속적으로 느리면 해상도를 낮춘다 (모바일 60fps 목표).
 */
export class PerfMonitor {
  avg = 16.7;
  private slowFor = 0;
  private cooldown = 3000;
  onSlow: (() => void) | null = null;

  tick(dtMs: number): void {
    if (dtMs > 200) return; // 탭 전환 등은 무시
    this.avg += (dtMs - this.avg) * 0.05;
    if (this.cooldown > 0) {
      this.cooldown -= dtMs;
      return;
    }
    if (this.avg > 21.5) this.slowFor += dtMs;
    else this.slowFor = Math.max(0, this.slowFor - dtMs * 0.5);
    if (this.slowFor > 2200) {
      this.slowFor = 0;
      this.cooldown = 4000;
      this.onSlow?.();
    }
  }

  /** 전환 직후처럼 일시적 부하가 큰 순간 */
  grace(ms = 2500): void {
    this.cooldown = Math.max(this.cooldown, ms);
    this.slowFor = 0;
  }

  get fps(): number {
    return 1000 / this.avg;
  }
}
