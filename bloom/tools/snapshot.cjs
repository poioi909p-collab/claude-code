// Aesthetic self-check: paints a small composition through real pointer
// events and saves "wet" and "dry" screenshots.
//
//   npm run dev            # in another terminal
//   node tools/snapshot.cjs [outDir] [season]
//
// Uses the `?manual` URL flag, which stops the frame loop so the
// simulation can be stepped deterministically from the script.
const { chromium } = require('playwright');

const OUT = process.argv[2] || '.';
const SEASON = process.argv[3] || 'spring';
const URL = process.env.BLOOM_URL || 'http://localhost:5173/?manual';

(async () => {
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
  const page = await browser.newPage({ viewport: { width: 1000, height: 660 } });
  page.on('pageerror', (e) => console.log('pageerror:', e.message));
  page.on('console', (m) => m.text().startsWith('gesture') && console.log(m.text()));
  await page.goto(URL);
  await page.waitForTimeout(800);
  await page.evaluate((s) => window.bloom.dir.reset(s), SEASON);

  const advance = async (sec) => {
    while (sec > 0) {
      const c = Math.min(sec, 1);
      sec -= c;
      await page.evaluate((c) => {
        for (let i = 0; i < Math.round(c * 60); i++) window.bloom.tick(1 / 60);
        window.bloom.wc.gl.finish();
      }, c);
    }
  };
  const stroke = async (pts, ms = 14) => {
    await page.mouse.move(...pts[0]);
    await page.mouse.down();
    for (const p of pts.slice(1)) {
      await page.mouse.move(p[0], p[1], { steps: 2 });
      await page.waitForTimeout(ms);
    }
    await page.mouse.up();
  };
  const line = (x0, y0, x1, y1, n, wob = 0, ph = 0) =>
    Array.from({ length: n + 1 }, (_, i) => {
      const t = i / n;
      return [x0 + (x1 - x0) * t + Math.sin(t * 5 + ph) * wob, y0 + (y1 - y0) * t];
    });
  const loop = (cx, cy, r, n = 32) => Array.from({ length: n + 1 }, (_, i) => [cx + Math.cos((i / n) * 6.283) * r, cy + Math.sin((i / n) * 6.283) * r * 0.95]);

  await stroke(line(300, 640, 330, 230, 30, 25));
  await advance(0.4);
  await stroke(line(520, 650, 610, 150, 34, 30, 2));
  await advance(0.4);
  await stroke(loop(160, 200, 85));
  await advance(0.5);
  await stroke(loop(800, 190, 70));
  await advance(0.5);
  const zz = [];
  for (let i = 0; i <= 10; i++) zz.push([60 + i * 16, i % 2 ? 560 : 640]);
  await stroke(zz, 8);
  for (const [x, y] of [[420, 120], [700, 470], [930, 420], [90, 420]]) {
    await page.mouse.click(x, y);
    await advance(0.12);
  }
  await advance(2.2);
  await page.screenshot({ path: `${OUT}/bloom-${SEASON}-wet.png`, timeout: 120000 });
  await advance(9);
  await page.screenshot({ path: `${OUT}/bloom-${SEASON}-dry.png`, timeout: 120000 });
  await browser.close();
})();
