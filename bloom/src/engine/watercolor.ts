import { createProgram, drawFullscreen, bindTex, FULLSCREEN_VS, Program, Target, TexFormat } from '../gl/gl';
import { PAPER_FS } from './shaders/paper';
import { SIM_FS, COPY3_FS } from './shaders/sim';
import { STAMP_FS, STAMP_VS } from './shaders/stamp';
import { DISPLAY_FS } from './shaders/display';

export const FLOATS_PER_STAMP = 20;

export const enum Shape {
  Dab = 0,
  Petal = 1,
  Leaf = 2,
  Arc = 3,
}

/** A single brush impression in css px. Optional fields fall back to sane defaults. */
export interface Stamp {
  type: Shape;
  x: number;
  y: number;
  angle?: number;
  len: number;
  wid: number;
  k?: number; // profile skew (petal/leaf), half-span (arc)
  e?: number; // roundness exponent
  abs: readonly [number, number, number];
  amount: number;
  water: number;
  seed?: number;
  rim?: number;
  grad?: number;
  ruffle?: number;
  notch?: number;
  bend?: number;
  soft?: number;
}

const COPY_SHIFT_FS = /* glsl */ `#version 300 es
precision highp float;
in vec2 vUv;
uniform sampler2D uA;
uniform sampler2D uB;
uniform sampler2D uC;
uniform vec2 uScale;
uniform vec2 uOffset;
layout(location = 0) out vec4 oA;
layout(location = 1) out vec4 oB;
layout(location = 2) out vec4 oC;
void main() {
  vec2 uv = vUv * uScale + uOffset;
  float inside = step(0.0, uv.x) * step(0.0, uv.y) * step(uv.x, 1.0) * step(uv.y, 1.0);
  oA = texture(uA, uv) * inside;
  oB = texture(uB, uv) * inside;
  oC = texture(uC, uv) * inside;
}`;

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

export interface Snapshot {
  target: Target;
}

export class Watercolor {
  readonly gl: WebGL2RenderingContext;
  cssW = 1;
  cssH = 1;
  dpr = 1;
  dispW = 1;
  dispH = 1;
  simW = 1;
  simH = 1;
  simPxPerCss = 0.5;

  private fmtState: TexFormat;
  private paper!: Target;
  private states: Target[] = [];
  private cur = 0;
  private snapPool: Target[] = [];

  private pSim: Program;
  private pStamp: Program;
  private pDisplay: Program;
  private pPaper: Program;
  private pCopy: Program;
  private pCopyShift: Program;

  private stampVao: WebGLVertexArrayObject;
  private instBuf: WebGLBuffer;
  private instCap = 0;
  private pending = new Float32Array(FLOATS_PER_STAMP * 256);
  private pendingCount = 0;

  private paperSeed: [number, number] = [Math.random() * 1000, Math.random() * 1000];
  private stepAccum = 0;
  private time = 0;
  /** time (s, engine clock) until which the sheet is assumed wet */
  private wetUntil = 0;
  private dirty = true;

  windAmount = 1;
  readonly paperColor: [number, number, number];

  // wash animation state
  private washT = -1;
  private washCenter: [number, number] = [0.5, 0.5];
  private washDone: (() => void) | null = null;
  private washMid: (() => void) | null = null;
  private washMidFired = false;
  washDuration = 3.2;

  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;

    const hasFloat = !!gl.getExtension('EXT_color_buffer_float');
    const hasHalf = !!gl.getExtension('EXT_color_buffer_half_float');
    gl.getExtension('OES_texture_float_linear');
    this.fmtState =
      hasFloat || hasHalf
        ? { internal: gl.RGBA16F, format: gl.RGBA, type: gl.HALF_FLOAT }
        : { internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE };

    this.pSim = createProgram(gl, FULLSCREEN_VS, SIM_FS);
    this.pStamp = createProgram(gl, STAMP_VS, STAMP_FS);
    this.pDisplay = createProgram(gl, FULLSCREEN_VS, DISPLAY_FS);
    this.pPaper = createProgram(gl, FULLSCREEN_VS, PAPER_FS);
    this.pCopy = createProgram(gl, FULLSCREEN_VS, COPY3_FS);
    this.pCopyShift = createProgram(gl, FULLSCREEN_VS, COPY_SHIFT_FS);

    // Instanced quad for stamps.
    this.stampVao = gl.createVertexArray()!;
    gl.bindVertexArray(this.stampVao);
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.instBuf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    for (let i = 0; i < 5; i++) {
      gl.enableVertexAttribArray(1 + i);
      gl.vertexAttribPointer(1 + i, 4, gl.FLOAT, false, FLOATS_PER_STAMP * 4, i * 16);
      gl.vertexAttribDivisor(1 + i, 1);
    }
    gl.bindVertexArray(null);

    const pc = [0xf4, 0xef, 0xe6].map((v) => srgbToLinear(v / 255));
    this.paperColor = [pc[0], pc[1], pc[2]];
  }

  get now(): number {
    return this.time;
  }

  /** (Re)allocate for a new canvas size. Keeps the painting anchored top-left. */
  resize(cssW: number, cssH: number, dpr: number): void {
    const gl = this.gl;
    const oldCss = [this.cssW, this.cssH];
    this.cssW = cssW;
    this.cssH = cssH;
    this.dpr = Math.min(dpr, 2);
    this.dispW = Math.max(1, Math.round(cssW * this.dpr));
    this.dispH = Math.max(1, Math.round(cssH * this.dpr));
    this.canvas.width = this.dispW;
    this.canvas.height = this.dispH;

    // Simulation at half the display resolution, capped for big screens.
    // On 1x screens half-res would be 2 css px per cell, which aliases thin
    // stems, so it never drops below 0.7 cells per css px (pixel budget allowing).
    let s = Math.max(0.5 * this.dpr, 0.7);
    const maxPx = 1.15e6;
    if (cssW * cssH * s * s > maxPx) s = Math.sqrt(maxPx / (cssW * cssH));
    this.simPxPerCss = s;
    const simW = Math.max(2, Math.round(cssW * s));
    const simH = Math.max(2, Math.round(cssH * s));

    // Paper at display resolution.
    this.paper?.dispose();
    this.paper = this.makePaper(this.dispW, this.dispH, this.dpr);

    const old = this.states.length ? this.states[this.cur] : null;
    const fmts = [this.fmtState, this.fmtState, this.fmtState];
    const next = [new Target(gl, simW, simH, fmts), new Target(gl, simW, simH, fmts)];
    next.forEach((t) => t.clear());
    if (old) {
      // copy old painting, anchored at the top-left in css space
      next[0].bind();
      gl.disable(gl.BLEND);
      const p = this.pCopyShift;
      gl.useProgram(p.prog);
      bindTex(gl, p, 'uA', 0, old.tex[0]);
      bindTex(gl, p, 'uB', 1, old.tex[1]);
      bindTex(gl, p, 'uC', 2, old.tex[2]);
      gl.uniform2f(p.u.uScale, cssW / oldCss[0], cssH / oldCss[1]);
      gl.uniform2f(p.u.uOffset, 0, 1 - cssH / oldCss[1]);
      drawFullscreen(gl);
    }
    this.states.forEach((t) => t.dispose());
    this.states = next;
    this.cur = 0;
    this.simW = simW;
    this.simH = simH;
    this.snapPool.forEach((t) => t.dispose());
    this.snapPool = [];
    this.dirty = true;
  }

  private makePaper(w: number, h: number, pxPerCss: number): Target {
    const gl = this.gl;
    const t = new Target(gl, w, h, [{ internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE }]);
    t.bind();
    gl.disable(gl.BLEND);
    gl.useProgram(this.pPaper.prog);
    gl.uniform1f(this.pPaper.u.uPxPerCss, pxPerCss);
    gl.uniform2f(this.pPaper.u.uSeed, this.paperSeed[0], this.paperSeed[1]);
    drawFullscreen(gl);
    return t;
  }

  /** Queue a stamp to be painted on the next frame. */
  add(s: Stamp): void {
    if (this.pendingCount * FLOATS_PER_STAMP >= this.pending.length) {
      const n = new Float32Array(this.pending.length * 2);
      n.set(this.pending);
      this.pending = n;
    }
    const a = this.pending;
    const o = this.pendingCount * FLOATS_PER_STAMP;
    a[o + 0] = s.x;
    a[o + 1] = s.y;
    a[o + 2] = s.angle ?? 0;
    a[o + 3] = s.type;
    a[o + 4] = s.len;
    a[o + 5] = s.wid;
    a[o + 6] = s.k ?? 1;
    a[o + 7] = s.e ?? 0.6;
    a[o + 8] = s.abs[0];
    a[o + 9] = s.abs[1];
    a[o + 10] = s.abs[2];
    a[o + 11] = s.amount;
    a[o + 12] = s.water;
    a[o + 13] = s.seed ?? Math.random() * 100;
    a[o + 14] = s.rim ?? 0;
    a[o + 15] = s.grad ?? 0;
    a[o + 16] = s.ruffle ?? 0;
    a[o + 17] = s.notch ?? 0;
    a[o + 18] = s.bend ?? 0;
    a[o + 19] = s.soft ?? 1.5;
    this.pendingCount++;
    // the wettest stamp can take a while to dry
    this.wetUntil = Math.max(this.wetUntil, this.time + 9);
  }

  get isActive(): boolean {
    return this.pendingCount > 0 || this.time < this.wetUntil || this.washT >= 0 || this.dirty;
  }

  private flushStamps(): void {
    if (!this.pendingCount) return;
    const gl = this.gl;
    const st = this.states[this.cur];
    st.bind([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.NONE]);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.blendEquation(gl.FUNC_ADD);
    gl.useProgram(this.pStamp.prog);
    gl.uniform2f(this.pStamp.u.uCss, this.cssW, this.cssH);
    gl.uniform1f(this.pStamp.u.uMinSoft, 1.1 / this.simPxPerCss);
    gl.bindVertexArray(this.stampVao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instBuf);
    const data = this.pending.subarray(0, this.pendingCount * FLOATS_PER_STAMP);
    if (this.instCap < this.pendingCount) {
      this.instCap = Math.max(this.pendingCount, 512);
      gl.bufferData(gl.ARRAY_BUFFER, this.instCap * FLOATS_PER_STAMP * 4, gl.DYNAMIC_DRAW);
    }
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.pendingCount);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
    this.pendingCount = 0;
  }

  private simStep(dt: number): void {
    const gl = this.gl;
    const src = this.states[this.cur];
    const dst = this.states[1 - this.cur];
    dst.bind();
    gl.disable(gl.BLEND);
    const p = this.pSim;
    gl.useProgram(p.prog);
    bindTex(gl, p, 'uWater', 0, src.tex[0]);
    bindTex(gl, p, 'uWet', 1, src.tex[1]);
    bindTex(gl, p, 'uDry', 2, src.tex[2]);
    bindTex(gl, p, 'uPaper', 3, this.paper.tex[0]);
    gl.uniform2f(p.u.uTexel, 1 / this.simW, 1 / this.simH);
    gl.uniform1f(p.u.uDt, dt);
    gl.uniform1f(p.u.uDw, 0.15);
    gl.uniform1f(p.u.uCap, 0.1);
    gl.uniform1f(p.u.uDp, 0.06);
    gl.uniform1f(p.u.uSpreadT, 0.42);
    gl.uniform1f(p.u.uEvap, 0.13);
    gl.uniform1f(p.u.uEvapEdge, 0.9);
    gl.uniform1f(p.u.uDep, 0.05);
    gl.uniform1f(p.u.uDepThin, 1.6);
    gl.uniform1f(p.u.uGran, 0.12);
    gl.uniform1f(p.u.uLift, 0.03);
    gl.uniform1f(p.u.uAspect, this.cssW / this.cssH);
    gl.uniform1f(p.u.uTime, this.time);
    const wash = this.washUniforms();
    gl.uniform3f(p.u.uWash, wash[0], wash[1], wash[2]);
    gl.uniform2f(p.u.uWashCenter, this.washCenter[0], this.washCenter[1]);
    gl.uniform1f(p.u.uWashDry, wash[3]);
    drawFullscreen(gl);
    this.cur = 1 - this.cur;
  }

  private washUniforms(): [number, number, number, number] {
    if (this.washT < 0) return [0, 0, 0, 0];
    const t = this.washT * (3.2 / this.washDuration);
    const aspect = this.cssW / this.cssH;
    const maxR = Math.hypot(Math.max(aspect, 1) * 1.0, 1.0) + 0.3;
    const k = Math.min(t / 1.4, 1);
    const front = (1 - Math.pow(1 - k, 3)) * maxR;
    const lift = t < 1.8 ? 2.2 : 0;
    const fade = smooth(0.5, 1.9, t) * 2.6;
    const dry = smooth(1.9, 2.8, t) * 1.2;
    return [Math.max(front, 0.0001), lift, fade, dry];
  }

  /** Advance the simulation by dt seconds of wall time. */
  update(dt: number): void {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    if (this.washT >= 0) {
      this.washT += dt;
      if (!this.washMidFired && this.washT * (3.2 / this.washDuration) > 1.9) {
        this.washMidFired = true;
        this.washMid?.();
      }
      if (this.washT >= this.washDuration) {
        this.washT = -1;
        this.states.forEach((t) => t.clear());
        const cb = this.washDone;
        this.washDone = null;
        this.dirty = true;
        cb?.();
      }
    }
    if (!this.isActive) return;
    this.flushStamps();
    const rate = this.simPxPerCss > 0.75 ? 180 : 120;
    const h = 1 / rate;
    this.stepAccum += dt;
    let n = 0;
    // cap work per frame: on a slow device the paint simply dries a bit slower
    const maxSteps = rate > 150 ? 4 : 3;
    while (this.stepAccum >= h && n < maxSteps) {
      this.simStep(h);
      this.stepAccum -= h;
      n++;
    }
    if (n === maxSteps) this.stepAccum = 0;
  }

  /** Composite to screen. Returns false when nothing needed drawing. */
  render(force = false): boolean {
    if (!force && !this.isActive) return false;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.dispW, this.dispH);
    this.drawDisplay(this.paper, 0, this.windAmount);
    this.dirty = false;
    return true;
  }

  private drawDisplay(paper: Target, hq: number, wind: number): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    const p = this.pDisplay;
    const st = this.states[this.cur];
    gl.useProgram(p.prog);
    bindTex(gl, p, 'uWater', 0, st.tex[0]);
    bindTex(gl, p, 'uWet', 1, st.tex[1]);
    bindTex(gl, p, 'uDry', 2, st.tex[2]);
    bindTex(gl, p, 'uPaper', 3, paper.tex[0]);
    gl.uniform2f(p.u.uSimSize, this.simW, this.simH);
    gl.uniform2f(p.u.uPaperTexel, 1 / paper.w, 1 / paper.h);
    gl.uniform3f(p.u.uPaperColor, this.paperColor[0], this.paperColor[1], this.paperColor[2]);
    gl.uniform1f(p.u.uTime, this.time);
    gl.uniform1f(p.u.uWind, wind * 0.0016);
    gl.uniform1f(p.u.uHQ, hq);
    gl.uniform1f(p.u.uAspect, this.cssW / this.cssH);
    let fade = 0;
    if (this.washT >= 0) fade = smooth(2.2, 3.15, this.washT * (3.2 / this.washDuration));
    gl.uniform1f(p.u.uFade, fade);
    drawFullscreen(gl);
  }

  /** Wash the sheet clean. `mid` fires once the paint has mostly dissolved. */
  wash(cx: number, cy: number, mid?: () => void, done?: () => void): void {
    this.washT = 0;
    this.washMidFired = false;
    this.washCenter = [cx / this.cssW, 1 - cy / this.cssH];
    this.washMid = mid ?? null;
    this.washDone = done ?? null;
    this.pendingCount = 0;
    this.wetUntil = Math.max(this.wetUntil, this.time + this.washDuration + 1);
  }

  get washing(): boolean {
    return this.washT >= 0;
  }

  clearNow(): void {
    this.states.forEach((t) => t.clear());
    this.pendingCount = 0;
    this.dirty = true;
  }

  // ---- snapshots (undo) ----------------------------------------------------

  get snapshotBytes(): number {
    return this.simW * this.simH * 8 * 3;
  }

  snapshot(): Snapshot {
    this.flushStamps();
    const gl = this.gl;
    const t = this.snapPool.pop() ?? new Target(gl, this.simW, this.simH, [this.fmtState, this.fmtState, this.fmtState], gl.NEAREST);
    this.copyInto(this.states[this.cur], t);
    return { target: t };
  }

  restore(s: Snapshot): void {
    this.pendingCount = 0;
    if (s.target.w !== this.simW || s.target.h !== this.simH) return;
    this.copyInto(s.target, this.states[this.cur]);
    this.wetUntil = Math.max(this.wetUntil, this.time + 9);
    this.dirty = true;
  }

  release(s: Snapshot): void {
    if (s.target.w === this.simW && s.target.h === this.simH && this.snapPool.length < 4) this.snapPool.push(s.target);
    else s.target.dispose();
  }

  private copyInto(src: Target, dst: Target): void {
    const gl = this.gl;
    dst.bind();
    gl.disable(gl.BLEND);
    const p = this.pCopy;
    gl.useProgram(p.prog);
    bindTex(gl, p, 'uA', 0, src.tex[0]);
    bindTex(gl, p, 'uB', 1, src.tex[1]);
    bindTex(gl, p, 'uC', 2, src.tex[2]);
    drawFullscreen(gl);
  }

  // ---- export ---------------------------------------------------------------

  /** Render the painting at high resolution and return RGBA rows (top-down). */
  exportPixels(maxSide: number): { w: number; h: number; data: Uint8ClampedArray<ArrayBuffer> } {
    const gl = this.gl;
    const limit = Math.min(maxSide, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number);
    const scale = Math.min(limit / Math.max(this.cssW, this.cssH), Math.max(3, this.dpr * 1.5));
    const w = Math.round(this.cssW * scale);
    const h = Math.round(this.cssH * scale);
    const paper = this.makePaper(w, h, scale);
    const out = new Target(gl, w, h, [{ internal: gl.RGBA8, format: gl.RGBA, type: gl.UNSIGNED_BYTE }]);
    out.bind();
    this.drawDisplay(paper, 1, 0);
    const buf = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    paper.dispose();
    out.dispose();
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const flipped = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
    const row = w * 4;
    for (let y = 0; y < h; y++) flipped.set(buf.subarray((h - 1 - y) * row, (h - y) * row), y * row);
    this.dirty = true;
    return { w, h, data: flipped };
  }
}

function smooth(a: number, b: number, x: number): number {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
}

/** Convert an sRGB hex colour to absorbance (−ln of linear reflectance). */
export function absorbance(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return c.map((v) => -Math.log(Math.min(Math.max(srgbToLinear(v / 255), 0.012), 0.985))) as [number, number, number];
}
