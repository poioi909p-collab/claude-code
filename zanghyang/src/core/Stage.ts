import * as THREE from 'three';
import fullscreenVert from '../shaders/fullscreen.vert?raw';
import common from '../shaders/common.glsl?raw';
import type { Quality } from './config';

THREE.ColorManagement.enabled = false;

export type Uniforms = Record<string, THREE.IUniform>;

export interface PassOptions {
  blending?: THREE.Blending;
  /** CustomBlending 일 때 */
  blendSrc?: THREE.BlendingSrcFactor;
  blendDst?: THREE.BlendingDstFactor;
  blendEquation?: THREE.BlendingEquation;
  defines?: Record<string, string | number>;
  /** 공통 노이즈 청크 포함 여부 */
  common?: boolean;
  vertexShader?: string;
  transparent?: boolean;
}

const PRECISION = 'precision highp float;\nprecision highp sampler2D;\n';

export function makeMaterial(fragment: string, uniforms: Uniforms, opts: PassOptions = {}): THREE.RawShaderMaterial {
  const frag = PRECISION + (opts.common === false ? '' : common) + '\n' + fragment;
  const mat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: opts.vertexShader ?? fullscreenVert,
    fragmentShader: frag,
    uniforms,
    ...(opts.defines ? { defines: opts.defines } : {}),
    depthTest: false,
    depthWrite: false,
    transparent: opts.transparent ?? opts.blending !== undefined,
    blending: opts.blending ?? THREE.NoBlending,
  });
  if (opts.blending === THREE.CustomBlending) {
    mat.blendSrc = opts.blendSrc ?? THREE.OneFactor;
    mat.blendDst = opts.blendDst ?? THREE.OneFactor;
    mat.blendEquation = opts.blendEquation ?? THREE.AddEquation;
    mat.blendSrcAlpha = mat.blendSrc;
    mat.blendDstAlpha = mat.blendDst;
    mat.blendEquationAlpha = mat.blendEquation;
  }
  return mat;
}

/** 공통 렌더러: 하나의 WebGL 컨텍스트, 전체화면 패스, 렌더 타깃 헬퍼. */
export class Stage {
  readonly renderer: THREE.WebGLRenderer;
  readonly canvas: HTMLCanvasElement;
  /** CSS 픽셀 */
  width = 1;
  height = 1;
  dpr = 1;
  /** 드로잉 버퍼 픽셀 */
  pw = 1;
  ph = 1;
  /** 렌더 가능한 부동소수 타입 */
  readonly halfType: THREE.TextureDataType;
  readonly floatType: THREE.TextureDataType;
  readonly floatRenderable: boolean;
  quality: Quality;
  /** 성능 적응을 위한 해상도 배율 (dprCap 내에서) */
  dprScale = 1;

  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly quad: THREE.Mesh;
  private readonly resizeHandlers = new Set<(w: number, h: number) => void>();

  constructor(container: HTMLElement, quality: Quality) {
    this.quality = quality;
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      premultipliedAlpha: false,
    });
    this.renderer.autoClear = false;
    this.renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.renderer.setClearColor(0x0b0b0c, 1);
    this.canvas = this.renderer.domElement;
    this.canvas.setAttribute('tabindex', '0');
    container.appendChild(this.canvas);

    const ext = this.renderer.extensions;
    const hasFloat = ext.has('EXT_color_buffer_float');
    const hasHalf = hasFloat || ext.has('EXT_color_buffer_half_float');
    this.floatRenderable = hasFloat;
    this.floatType = hasFloat ? THREE.FloatType : hasHalf ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.halfType = hasHalf ? THREE.HalfFloatType : THREE.UnsignedByteType;

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2));
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    this.quad = new THREE.Mesh(geo);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  get aspect(): number {
    return this.width / this.height;
  }

  resize(): void {
    const w = Math.max(1, Math.round(window.innerWidth));
    const h = Math.max(1, Math.round(window.innerHeight));
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality.dprCap, 2) * this.dprScale;
    if (w === this.width && h === this.height && Math.abs(dpr - this.dpr) < 1e-3) return;
    this.width = w;
    this.height = h;
    this.dpr = Math.max(0.75, dpr);
    this.renderer.setPixelRatio(this.dpr);
    this.renderer.setSize(w, h, true);
    this.pw = Math.round(w * this.dpr);
    this.ph = Math.round(h * this.dpr);
    this.resizeHandlers.forEach((fn) => fn(w, h));
  }

  onResize(fn: (w: number, h: number) => void): () => void {
    this.resizeHandlers.add(fn);
    return () => this.resizeHandlers.delete(fn);
  }

  /** 전체 화면(또는 타깃 전체)에 프래그먼트 셰이더 한 번. */
  pass(material: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.scene, this.camera);
  }

  /** 임의 오브젝트 렌더 (스플랫 쿼드, 파티클, 리본 등). */
  draw(object: THREE.Object3D, target: THREE.WebGLRenderTarget | null): void {
    this.renderer.setRenderTarget(target);
    this.renderer.render(object as THREE.Scene, this.camera);
  }

  clear(target: THREE.WebGLRenderTarget | null, r = 0, g = 0, b = 0, a = 0): void {
    this.renderer.setRenderTarget(target);
    this.renderer.setClearColor(new THREE.Color(r, g, b), a);
    this.renderer.clear(true, false, false);
    this.renderer.setClearColor(0x0b0b0c, 1);
  }

  target(
    w: number,
    h: number,
    opts: { type?: THREE.TextureDataType; filter?: THREE.MagnificationTextureFilter; wrap?: THREE.Wrapping } = {},
  ): THREE.WebGLRenderTarget {
    const filter = opts.filter ?? THREE.LinearFilter;
    const rt = new THREE.WebGLRenderTarget(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), {
      type: opts.type ?? THREE.UnsignedByteType,
      format: THREE.RGBAFormat,
      minFilter: filter,
      magFilter: filter,
      wrapS: opts.wrap ?? THREE.ClampToEdgeWrapping,
      wrapT: opts.wrap ?? THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    });
    return rt;
  }

  /** 짧은 변이 res 가 되도록 화면 비율을 따르는 크기 */
  resFor(res: number): [number, number] {
    const a = this.aspect;
    return a >= 1 ? [Math.round(res * a), res] : [res, Math.round(res / a)];
  }
}

/** 핑퐁 FBO */
export class PingPong {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  constructor(
    stage: Stage,
    public w: number,
    public h: number,
    opts: Parameters<Stage['target']>[2] = {},
  ) {
    this.read = stage.target(w, h, opts);
    this.write = stage.target(w, h, opts);
  }
  swap(): void {
    const t = this.read;
    this.read = this.write;
    this.write = t;
  }
  get texel(): THREE.Vector2 {
    return new THREE.Vector2(1 / this.w, 1 / this.h);
  }
  dispose(): void {
    this.read.dispose();
    this.write.dispose();
  }
}
