// Minimal WebGL2 helpers: programs, render targets, full-screen pass.

export interface Program {
  prog: WebGLProgram;
  u: Record<string, WebGLUniformLocation>;
}

function compile(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    const numbered = src
      .split('\n')
      .map((l, i) => `${String(i + 1).padStart(4)}: ${l}`)
      .join('\n');
    console.error(numbered);
    throw new Error('Shader compile error: ' + log);
  }
  return sh;
}

export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): Program {
  const prog = gl.createProgram()!;
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
  }
  const u: Record<string, WebGLUniformLocation> = {};
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
  for (let i = 0; i < n; i++) {
    const info = gl.getActiveUniform(prog, i)!;
    const name = info.name.replace(/\[0\]$/, '');
    u[name] = gl.getUniformLocation(prog, info.name)!;
  }
  return { prog, u };
}

export interface TexFormat {
  internal: number;
  format: number;
  type: number;
}

export function createTexture(
  gl: WebGL2RenderingContext,
  w: number,
  h: number,
  fmt: TexFormat,
  filter: number = gl.LINEAR,
  wrap: number = gl.CLAMP_TO_EDGE,
): WebGLTexture {
  const t = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  gl.texImage2D(gl.TEXTURE_2D, 0, fmt.internal, w, h, 0, fmt.format, fmt.type, null);
  return t;
}

/** A framebuffer with one or more colour attachments of equal size. */
export class Target {
  fbo: WebGLFramebuffer;
  tex: WebGLTexture[];
  constructor(
    private gl: WebGL2RenderingContext,
    public w: number,
    public h: number,
    fmts: TexFormat[],
    filter: number = gl.LINEAR,
  ) {
    this.fbo = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    this.tex = fmts.map((f, i) => {
      const t = createTexture(gl, w, h, f, filter);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0);
      return t;
    });
    gl.drawBuffers(fmts.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
    const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (status !== gl.FRAMEBUFFER_COMPLETE) {
      throw new Error('Framebuffer incomplete: 0x' + status.toString(16));
    }
  }
  bind(buffers?: number[]): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, this.w, this.h);
    gl.drawBuffers(buffers ?? this.tex.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
  }
  clear(): void {
    const gl = this.gl;
    this.bind();
    for (let i = 0; i < this.tex.length; i++) {
      gl.clearBufferfv(gl.COLOR, i, [0, 0, 0, 0]);
    }
  }
  dispose(): void {
    const gl = this.gl;
    gl.deleteFramebuffer(this.fbo);
    this.tex.forEach((t) => gl.deleteTexture(t));
  }
}

/** Vertex shader for a single full-screen triangle (no buffers needed). */
export const FULLSCREEN_VS = /* glsl */ `#version 300 es
out vec2 vUv;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUv = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

export function drawFullscreen(gl: WebGL2RenderingContext): void {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

export function bindTex(gl: WebGL2RenderingContext, p: Program, name: string, unit: number, tex: WebGLTexture): void {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  const loc = p.u[name];
  if (loc) gl.uniform1i(loc, unit);
}
