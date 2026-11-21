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
  const d = document.createElement('div');
  d.className = 'fallback';
  d.innerHTML = '이 브라우저에서는 수채 물감이 번지지 않아요.<br/>WebGL2를 지원하는 브라우저에서 열어 주세요.';
  document.body.appendChild(d);
}
