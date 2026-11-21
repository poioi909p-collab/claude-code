import type { App } from './app';
import { SEASONS, SEASON_ORDER, SeasonId } from './art/palette';

const ICON = {
  undo: '<svg viewBox="0 0 24 24"><path d="M9 7 4.5 11.5 9 16"/><path d="M5 11.5h9.5a5 5 0 0 1 0 10H12"/></svg>',
  wash: '<svg viewBox="0 0 24 24"><path d="M12 3.2c2.8 3.4 5 6.2 5 9a5 5 0 0 1-10 0c0-2.8 2.2-5.6 5-9Z"/><path d="M3 20.2c1.5 0 1.5-1 3-1s1.5 1 3 1 1.5-1 3-1 1.5 1 3 1 1.5-1 3-1 1.5 1 3 1"/></svg>',
  save: '<svg viewBox="0 0 24 24"><path d="M12 4v10.5"/><path d="m7.5 10.5 4.5 4.5 4.5-4.5"/><path d="M4.5 16.5v2.2c0 .8.7 1.5 1.5 1.5h12c.8 0 1.5-.7 1.5-1.5v-2.2"/></svg>',
  sound:
    '<svg viewBox="0 0 24 24"><path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z"/><g class="on"><path d="M15 9.2a4 4 0 0 1 0 5.6"/><path d="M17.6 7a7 7 0 0 1 0 10"/></g><g class="off"><path d="m15.5 10 4 4m0-4-4 4"/></g></svg>',
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

const SIG_KEY = 'bloom.signature';

function storageGet(k: string): string {
  try {
    return localStorage.getItem(k) ?? '';
  } catch {
    return '';
  }
}
function storageSet(k: string, v: string): void {
  try {
    localStorage.setItem(k, v);
  } catch {
    /* private mode */
  }
}

export class UI {
  private intro: HTMLElement;
  private bar: HTMLElement;
  private seasonBtns = new Map<SeasonId, HTMLButtonElement>();
  private undoBtn: HTMLButtonElement;
  private sheet: HTMLElement;
  private sigInput: HTMLInputElement;
  private toast: HTMLElement;
  private toastTimer = 0;
  private dimTimer = 0;

  constructor(private app: App) {
    // intro
    this.intro = el('div', 'intro');
    this.intro.innerHTML = '<div class="mark">피어나다<span>Bloom</span></div><div class="prompt">무엇이든 그어보세요</div>';
    document.body.appendChild(this.intro);

    // toolbar
    this.bar = el('nav', 'bar');
    this.bar.setAttribute('aria-label', '도구');
    for (const id of SEASON_ORDER) {
      const s = SEASONS[id];
      const b = el('button', 'season', '<i></i>');
      b.style.setProperty('--c', s.dot);
      b.title = `${s.label} 팔레트`;
      b.setAttribute('aria-label', `${s.label} 팔레트`);
      b.setAttribute('aria-pressed', String(id === app.season));
      b.addEventListener('click', () => this.app.setSeason(id));
      this.seasonBtns.set(id, b);
      this.bar.appendChild(b);
    }
    this.bar.appendChild(el('span', 'sep'));
    this.undoBtn = this.button(ICON.undo, '되돌리기', () => app.undo());
    this.undoBtn.disabled = true;
    this.button(ICON.wash, '물로 씻기', () => app.wash());
    this.button(ICON.save, '저장', () => this.toggleSheet());
    const snd = this.button(ICON.sound, '물소리', () => {
      const on = !app.sound.enabled;
      app.sound.setEnabled(on);
      snd.setAttribute('aria-pressed', String(on));
    });
    snd.classList.add('sound');
    snd.setAttribute('aria-pressed', 'false');
    document.body.appendChild(this.bar);

    // save sheet
    this.sheet = el('div', 'sheet');
    this.sheet.innerHTML =
      '<label for="sig">서명 (선택)</label><input id="sig" maxlength="24" autocomplete="off" placeholder="이름 또는 짧은 글" /><div class="row"><button class="cancel">닫기</button><button class="primary">저장하기</button></div>';
    document.body.appendChild(this.sheet);
    this.sigInput = this.sheet.querySelector('input')!;
    this.sigInput.value = storageGet(SIG_KEY);
    this.sheet.querySelector('.cancel')!.addEventListener('click', () => this.toggleSheet(false));
    const go = this.sheet.querySelector('.primary') as HTMLButtonElement;
    go.addEventListener('click', () => void this.save(go));
    this.sigInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') void this.save(go);
      if (e.key === 'Escape') this.toggleSheet(false);
    });

    this.toast = el('div', 'toast');
    document.body.appendChild(this.toast);

    // keyboard shortcuts
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        app.undo();
      }
    });
    // close the sheet when painting resumes
    app.canvas.addEventListener('pointerdown', () => {
      this.toggleSheet(false);
      this.bar.classList.add('dim');
      clearTimeout(this.dimTimer);
    });
    app.canvas.addEventListener('pointerup', () => {
      clearTimeout(this.dimTimer);
      this.dimTimer = window.setTimeout(() => this.bar.classList.remove('dim'), 900);
    });
  }

  private button(icon: string, label: string, fn: () => void): HTMLButtonElement {
    const b = el('button', '', icon);
    b.title = label;
    b.setAttribute('aria-label', label);
    b.addEventListener('click', fn);
    this.bar.appendChild(b);
    return b;
  }

  hideIntro(): void {
    this.intro.classList.add('gone');
    setTimeout(() => this.intro.remove(), 1600);
  }

  setSeason(id: SeasonId): void {
    this.seasonBtns.forEach((b, k) => b.setAttribute('aria-pressed', String(k === id)));
  }

  setUndo(can: boolean): void {
    this.undoBtn.disabled = !can;
  }

  private toggleSheet(open?: boolean): void {
    const o = open ?? !this.sheet.classList.contains('open');
    this.sheet.classList.toggle('open', o);
    if (o) setTimeout(() => this.sigInput.focus({ preventScroll: true }), 50);
    else this.sigInput.blur();
  }

  showToast(msg: string): void {
    this.toast.textContent = msg;
    this.toast.classList.add('show');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 2200);
  }

  private async save(btn: HTMLButtonElement): Promise<void> {
    if (btn.disabled) return;
    btn.disabled = true;
    const sig = this.sigInput.value.trim();
    storageSet(SIG_KEY, sig);
    try {
      const blob = await exportPNG(this.app, sig);
      const name = `bloom-${stamp()}.png`;
      const file = new File([blob], name, { type: 'image/png' });
      const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
      const coarse = window.matchMedia('(pointer: coarse)').matches;
      if (coarse && nav.canShare?.({ files: [file] })) {
        await nav.share({ files: [file], title: '피어나다 Bloom' }).catch(() => download(blob, name));
      } else download(blob, name);
      this.toggleSheet(false);
      this.showToast('저장했어요');
    } catch (err) {
      console.error(err);
      this.showToast('저장하지 못했어요');
    } finally {
      btn.disabled = false;
    }
  }
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
function stamp(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}`;
}

function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** High-resolution PNG with date and an optional small signature. */
export async function exportPNG(app: App, signature: string): Promise<Blob> {
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const { w, h, data } = app.wc.exportPixels(coarse ? 3072 : 4096);
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c2 = cv.getContext('2d')!;
  c2.putImageData(new ImageData(data, w, h), 0, 0);

  const unit = Math.max(w, h) / 100;
  const d = new Date();
  const date = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}.`;
  const hand = '"Nanum Pen Script", "Gowun Batang", serif';
  const serif = '"Gowun Batang", "Nanum Myeongjo", serif';
  try {
    await Promise.all([document.fonts.load(`${Math.round(unit * 2)}px "Nanum Pen Script"`), document.fonts.load(`${Math.round(unit)}px "Gowun Batang"`)]);
  } catch {
    /* fonts are optional */
  }
  const margin = unit * 3.2;
  c2.textAlign = 'right';
  c2.textBaseline = 'alphabetic';
  c2.globalCompositeOperation = 'multiply';
  c2.fillStyle = 'rgba(92, 80, 68, 0.62)';
  c2.font = `${(unit * 0.95).toFixed(1)}px ${serif}`;
  if ('letterSpacing' in c2) (c2 as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${(unit * 0.12).toFixed(1)}px`;
  c2.fillText(date, w - margin, h - margin);
  if (signature) {
    c2.fillStyle = 'rgba(92, 68, 60, 0.75)';
    c2.font = `${(unit * 2.1).toFixed(1)}px ${hand}`;
    if ('letterSpacing' in c2) (c2 as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = '0px';
    c2.save();
    c2.translate(w - margin, h - margin - unit * 1.7);
    c2.rotate(-0.035);
    c2.fillText(signature, 0, 0);
    c2.restore();
  }
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'));
}
