import './style.css';
import { App } from './app';
import { UI } from './ui';
import type { SeasonId } from './art/palette';

function initialSeason(): SeasonId {
  const m = new Date().getMonth();
  return m >= 2 && m <= 4 ? 'spring' : m >= 5 && m <= 7 ? 'summer' : m >= 8 && m <= 10 ? 'autumn' : 'winter';
}

const canvas = document.getElementById('c') as HTMLCanvasElement;
let ui: UI | null = null;

try {
  const app = new App(canvas, initialSeason(), {
    onFirstTouch: () => ui?.hideIntro(),
    onSeason: (s) => ui?.setSeason(s),
    onHistory: (can) => ui?.setUndo(can),
  });
  ui = new UI(app);
  ui.setUndo(app.canUndo);

  let rt = 0;
  window.addEventListener('resize', () => {
    clearTimeout(rt);
    rt = window.setTimeout(() => app.resize(), 180);
  });

  // ?manual disables the frame loop (used by automated screenshot checks)
  if (!location.search.includes('manual')) app.start();
  (window as unknown as { bloom: App }).bloom = app;
} catch (err) {
  console.error(err);
  showFallback(err);
}

// When the browser drops the GPU context (e.g. after backgrounding a phone),
// start over cleanly instead of leaving a blank sheet.
canvas.addEventListener('webglcontextlost', (e) => e.preventDefault());
canvas.addEventListener('webglcontextrestored', () => location.reload());

function showFallback(err: unknown): void {
  canvas.style.display = 'none';
  const d = document.createElement('div');
  d.className = 'fallback';
  const msg = document.createElement('p');
  msg.innerHTML = '이 브라우저에서는 수채 물감이 번지지 않아요.<br/>Safari나 Chrome에서 직접 열어 보세요.';
  const detail = document.createElement('p');
  detail.className = 'detail';
  let renderer = '';
  try {
    const g = document.createElement('canvas').getContext('webgl');
    const ext = g?.getExtension('WEBGL_debug_renderer_info');
    renderer = g ? String(g.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : g.RENDERER)) : 'no webgl';
  } catch {
    renderer = '?';
  }
  detail.textContent = `${err instanceof Error ? err.message : String(err)} · ${renderer} · ${navigator.userAgent}`;
  const wrap = document.createElement('div');
  wrap.append(msg, detail);
  d.appendChild(wrap);
  document.body.appendChild(d);
}
