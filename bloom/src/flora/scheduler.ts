import type { Stamp } from '../engine/watercolor';

export type Emit = (s: Stamp) => void;

export interface Job {
  start: number;
  dur: number;
  group: number;
  /**
   * Paint the part of the animation between progress p0 and p1 (0..1).
   * Must be a pure function of (p0, p1) so that jobs can be rewound for undo.
   */
  step(p0: number, p1: number, emit: Emit): void;
  done?: number;
}

/** Progress of every scheduled job at one instant (stored with undo snapshots). */
export interface JobCapture {
  at: number;
  jobs: { job: Job; start: number; done: number }[];
}

/** Time-sequenced painting jobs (growth animations). */
export class Scheduler {
  private jobs: Job[] = [];
  constructor(private emit: Emit) {}

  add(job: Job): void {
    job.done = -1;
    this.jobs.push(job);
  }

  get busy(): boolean {
    return this.jobs.length > 0;
  }

  clear(): void {
    this.jobs = [];
  }

  capture(now: number): JobCapture {
    return { at: now, jobs: this.jobs.map((job) => ({ job, start: job.start, done: job.done ?? -1 })) };
  }

  /** Resume exactly the jobs that were running at capture time, from where they were. */
  rewind(c: JobCapture, now: number): void {
    const shift = now - c.at;
    this.jobs = c.jobs.map(({ job, start, done }) => {
      job.start = start + shift;
      job.done = done;
      return job;
    });
  }

  update(now: number): void {
    if (!this.jobs.length) return;
    const keep: Job[] = [];
    // iterate over a copy: jobs may schedule further jobs
    const list = this.jobs;
    this.jobs = [];
    for (const j of list) {
      if (now < j.start) {
        keep.push(j);
        continue;
      }
      if (j.done! < 0) j.done = 0;
      const p = j.dur <= 0 ? 1 : Math.min((now - j.start) / j.dur, 1);
      if (p > j.done!) {
        j.step(j.done!, p, this.emit);
        j.done = p;
      }
      if (p < 1) keep.push(j);
    }
    this.jobs = keep.concat(this.jobs);
  }
}
