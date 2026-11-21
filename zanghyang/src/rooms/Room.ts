import type * as THREE from 'three';
import type { Stage } from '../core/Stage';
import type { Input, InputHandler, Stroke, StrokePoint } from '../core/Input';
import type { AudioEngine } from '../core/AudioEngine';
import type { Recorder } from '../core/Recorder';

export interface AppContext {
  stage: Stage;
  input: Input;
  audio: AudioEngine;
  recorder: Recorder;
  reducedMotion: boolean;
  /** 화면 하단 토스트 */
  toast(msg: string, ms?: number): void;
}

export interface EnterInfo {
  /** 입장 지점 (CSS px) — 입구에서 처음 만진 자리 등 */
  x?: number;
  y?: number;
  from: number;
}

export abstract class Room implements InputHandler {
  abstract readonly index: number;
  /** 한글 이름 / 한자 / 한 줄 */
  abstract readonly title: string;
  abstract readonly hanja: string;
  abstract readonly line: string;
  /** 컴포지터 그레인 세기 (밝은 종이엔 약간 더) */
  grain = 0.05;
  vignette = 0.14;
  protected initialized = false;

  constructor(protected readonly app: AppContext) {}

  ensureInit(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.init();
  }

  protected abstract init(): void;
  enter(_info: EnterInfo): void {}
  leave(): void {}
  abstract update(dt: number, time: number): void;
  abstract render(target: THREE.WebGLRenderTarget): void;
  resize(_w: number, _h: number): void {}
  /** 품질 단계가 바뀌었을 때 버퍼 재구성 */
  requality(): void {}
  onStrokeStart?(s: Stroke): void;
  onStrokeMove?(s: Stroke, added: StrokePoint[]): void;
  onStrokeEnd?(s: Stroke): void;
  onStrokeCancel?(s: Stroke): void;
}
