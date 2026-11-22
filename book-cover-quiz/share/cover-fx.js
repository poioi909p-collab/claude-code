/*!
 * cover-fx.js v1.0 — 책 표지 변형 효과 엔진
 * - 의존성 없음, 빌드 불필요. <script src="cover-fx.js"></script> 로 넣으면 window.CoverFX 가 생깁니다.
 * - file:// 에서도 동작합니다 (getImageData 를 쓰지 않음).
 *
 *   const fx = CoverFX.create(document.getElementById('box'), { src: 'cover.jpg', effect: 'shuffle' });
 *   fx.next(); fx.prev(); fx.reveal(); fx.reset(); fx.goTo(n);
 *   fx.setEffect('invert', { rainbow: 0.4 }); fx.setImage('other.jpg'); fx.setRegions([{x,y,w,h}]);
 *   fx.stage; fx.stages; fx.revealed;
 *   CoverFX.register('myfx', { label, desc, stages, init, render });
 */
(function (global) {
  'use strict';

  // ───────────────────────── 수학 · 이징 ─────────────────────────
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const seg = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const stagger = (u, k, spread) => clamp((u - k * spread) / (1 - spread), 0, 1);
  const Ease = {
    linear: (t) => t,
    in: (t) => t * t * t,
    out: (t) => 1 - Math.pow(1 - t, 3),
    inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    outBack: (t) => {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
  };

  function rng(seed) {
    let a = seed >>> 0 || 1;
    return function () {
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffled(n, r) {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }
  // list 의 원소를 섞되 가능한 한 제자리에 남지 않게 한다. 결과[k] = list[k] 가 갈 새 값.
  function derange(list, r) {
    if (list.length < 2) return list.slice();
    for (let tries = 0; tries < 60; tries++) {
      const p = shuffled(list.length, r).map((i) => list[i]);
      if (p.every((v, i) => v !== list[i])) return p;
    }
    return list.slice(1).concat(list[0]);
  }

  // ───────────────────────── 캔버스 도우미 ─────────────────────────
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(w));
    c.height = Math.max(1, Math.round(h));
    return c;
  }
  const _tmp = [null, null];
  function tmpCanvas(i, w, h) {
    let c = _tmp[i];
    if (!c) c = _tmp[i] = makeCanvas(w, h);
    if (c.width < w || c.height < h) {
      c.width = Math.max(c.width, w);
      c.height = Math.max(c.height, h);
    }
    return c;
  }
  // 반씩 줄여가며 축소 (모자이크 색이 평균에 가깝게 나오도록)
  function shrink(src, sx, sy, sw, sh, tw, th) {
    tw = Math.max(1, Math.round(tw));
    th = Math.max(1, Math.round(th));
    let cur = src, cx = sx, cy = sy, cw = sw, ch = sh, idx = 0;
    for (;;) {
      const half = cw / 2 >= tw && ch / 2 >= th;
      const nw = half ? Math.ceil(cw / 2) : tw;
      const nh = half ? Math.ceil(ch / 2) : th;
      const dst = tmpCanvas(idx, nw, nh);
      const d = dst.getContext('2d');
      d.clearRect(0, 0, dst.width, dst.height);
      d.imageSmoothingEnabled = true;
      d.drawImage(cur, cx, cy, cw, ch, 0, 0, nw, nh);
      cur = dst; cx = 0; cy = 0; cw = nw; ch = nh; idx ^= 1;
      if (!half) return cur;
    }
  }
  /** 모자이크: 작게 줄였다가 계단 모양으로 확대 */
  function pixelate(ctx, src, sx, sy, sw, sh, dx, dy, dw, dh, block) {
    if (!(block > 1.01)) { ctx.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh); return; }
    const tw = Math.max(1, Math.round(dw / block));
    const th = Math.max(1, Math.round(dh / block));
    const small = shrink(src, sx, sy, sw, sh, tw, th);
    const prev = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(small, 0, 0, tw, th, dx, dy, dw, dh);
    ctx.imageSmoothingEnabled = prev;
  }
  /** 색 반전: difference 합성으로 흰색을 칠한다 (a=0~1) */
  function invert(ctx, x, y, w, h, a) {
    if (!(a > 0.001)) return;
    ctx.save();
    ctx.globalCompositeOperation = 'difference';
    ctx.globalAlpha = Math.min(1, a);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  /** 무지개 색조 덧씌우기 (phase 가 바뀌면 색이 돈다) */
  function rainbow(ctx, x, y, w, h, phase, a, mode) {
    if (!(a > 0.001)) return;
    ctx.save();
    ctx.globalCompositeOperation = mode || 'color';
    ctx.globalAlpha = Math.min(1, a);
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    for (let i = 0; i <= 6; i++) {
      const hue = ((phase * 360 + i * 60) % 360 + 360) % 360;
      g.addColorStop(i / 6, 'hsl(' + hue + ',100%,55%)');
    }
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, h);
    ctx.restore();
  }
  /** 전환 중 대각선으로 지나가는 빛 */
  function sweep(ctx, x, y, w, h, p, a) {
    const s = Math.sin(Math.PI * p) * (a == null ? 1 : a);
    if (s <= 0.01) return;
    const L = Math.hypot(w, h);
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(0.45);
    const bx = lerp(-L * 0.75, L * 0.75, p), bw = L * 0.16;
    const g = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, 'rgba(255,255,255,' + (0.42 * s).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.fillRect(-L, -L, 2 * L, 2 * L);
    ctx.restore();
  }
  /** 원형 전환 테두리 빛 */
  function ring(ctx, cx, cy, r, u, w, h) {
    const s = Math.sin(Math.PI * u);
    if (s <= 0.01) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
    ctx.beginPath(); ctx.arc(cx, cy, Math.max(1, r), 0, Math.PI * 2);
    ctx.lineWidth = Math.max(2, w * 0.018);
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.85 * s).toFixed(3) + ')';
    ctx.shadowColor = 'rgba(255,240,200,0.9)';
    ctx.shadowBlur = w * 0.05;
    ctx.stroke();
    ctx.restore();
  }
  function roundRect(g, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  const Helpers = { clamp, lerp, seg, stagger, Ease, rng, shuffled, derange, makeCanvas, pixelate, invert, rainbow, sweep, ring, roundRect };

  // ───────────────────────── 이미지 로딩 ─────────────────────────
  function loadSource(src) {
    return new Promise((resolve, reject) => {
      if (src == null || src === '') return reject(new Error('no source'));
      if (typeof Blob !== 'undefined' && src instanceof Blob) {
        const url = URL.createObjectURL(src);
        return loadSource(url).then(resolve, reject);
      }
      if (typeof src === 'string') {
        const img = new Image();
        img.decoding = 'async';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error('load failed: ' + src));
        img.src = src;
        return;
      }
      if (typeof HTMLImageElement !== 'undefined' && src instanceof HTMLImageElement) {
        if (src.complete && src.naturalWidth) return resolve(src);
        src.addEventListener('load', () => resolve(src), { once: true });
        src.addEventListener('error', () => reject(new Error('load failed')), { once: true });
        return;
      }
      // canvas, ImageBitmap, video 등 drawImage 가능한 것
      resolve(src);
    });
  }
  function sizeOf(img) {
    return {
      w: img.naturalWidth || img.videoWidth || img.width,
      h: img.naturalHeight || img.videoHeight || img.height,
    };
  }

  // ───────────────────────── 임시 표지 ─────────────────────────
  function hashHue(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return Math.abs(h) % 360;
  }
  function wrapText(g, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';
    const pushLong = (w) => {
      let cur = '';
      for (const ch of w) {
        if (g.measureText(cur + ch).width > maxW && cur) { lines.push(cur); cur = ch; } else cur += ch;
      }
      return cur;
    };
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (g.measureText(test).width <= maxW) line = test;
      else {
        if (line) lines.push(line);
        line = g.measureText(w).width > maxW ? pushLong(w) : w;
      }
    }
    if (line) lines.push(line);
    return lines;
  }
  /** 이미지가 없을 때 쓰는 임시 표지. 반환값은 canvas. 제목은 titleRegion 안쪽에 그린다. */
  function placeholder(o) {
    o = o || {};
    const w = o.width || 600, h = o.height || 880;
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const hue = o.hue != null ? o.hue : hashHue(String(o.title || ''));
    const r = rng(hue * 7919 + 13);
    const bg = g.createLinearGradient(0, 0, w, h);
    bg.addColorStop(0, 'hsl(' + hue + ',55%,22%)');
    bg.addColorStop(1, 'hsl(' + ((hue + 50) % 360) + ',70%,52%)');
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    // 큰 원 (달)
    g.fillStyle = 'hsla(' + ((hue + 180) % 360) + ',90%,75%,0.85)';
    g.beginPath(); g.arc(w * (0.3 + r() * 0.4), h * 0.55, w * 0.22, 0, Math.PI * 2); g.fill();
    // 흩어진 도형
    for (let i = 0; i < 26; i++) {
      g.fillStyle = 'hsla(' + ((hue + r() * 160) % 360) + ',85%,' + (45 + r() * 35) + '%,' + (0.25 + r() * 0.5) + ')';
      const x = r() * w, y = h * 0.35 + r() * h * 0.6, s = w * (0.02 + r() * 0.08);
      g.beginPath();
      if (i % 3 === 0) { g.moveTo(x, y - s); g.lineTo(x + s, y + s); g.lineTo(x - s, y + s); g.closePath(); }
      else g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
    }
    // 산 실루엣
    g.fillStyle = 'hsla(' + hue + ',50%,12%,0.9)';
    g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += w / 8) g.lineTo(x, h * (0.78 + r() * 0.12));
    g.lineTo(w, h); g.closePath(); g.fill();
    // 제목
    const T = placeholder.titleRegion;
    const title = String(o.title || '임시 표지');
    let fs = w * 0.12;
    g.textAlign = 'center'; g.textBaseline = 'middle';
    let lines;
    for (;;) {
      g.font = '900 ' + fs + 'px "Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
      lines = wrapText(g, title, w * T.w * 0.92);
      if (lines.length * fs * 1.15 <= h * T.h * 0.78 || fs < 14) break;
      fs *= 0.9;
    }
    g.fillStyle = '#fff';
    g.shadowColor = 'rgba(0,0,0,0.5)'; g.shadowBlur = fs * 0.2;
    const top = h * (T.y + T.h * 0.42) - ((lines.length - 1) * fs * 1.15) / 2;
    lines.forEach((ln, i) => g.fillText(ln, w / 2, top + i * fs * 1.15));
    if (o.sub) {
      g.font = '600 ' + w * 0.04 + 'px sans-serif';
      g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText(String(o.sub), w / 2, h * (T.y + T.h * 0.9));
    }
    g.shadowBlur = 0;
    g.font = '700 ' + w * 0.032 + 'px sans-serif';
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText('임시 표지 · PLACEHOLDER', w / 2, h * 0.955);
    return c;
  }
  placeholder.titleRegion = { x: 0.06, y: 0.06, w: 0.88, h: 0.26 };

  // ───────────────────────── 효과 레지스트리 ─────────────────────────
  const EFFECTS = Object.create(null);
  const ORDER = [];
  function register(name, def) {
    if (!name || !def || typeof def.render !== 'function') throw new Error('CoverFX.register: render 함수가 필요합니다');
    if (def.stages == null) def.stages = 3;
    if (!EFFECTS[name]) ORDER.push(name);
    EFFECTS[name] = def;
    return def;
  }
  function stagesOf(def, opts) {
    const s = typeof def.stages === 'function' ? def.stages(opts) : def.stages;
    return Math.max(1, s | 0);
  }
  function effects() {
    return ORDER.map((n) => {
      const d = EFFECTS[n];
      return { name: n, label: d.label || n, desc: d.desc || '', stages: stagesOf(d, Object.assign({}, d.defaults)) };
    });
  }

  // ───────────────────────── 엔진 ─────────────────────────
  class Engine {
    constructor(el, o) {
      if (typeof el === 'string') el = document.querySelector(el);
      if (!el) throw new Error('CoverFX: 컨테이너를 찾을 수 없습니다');
      this.el = el;
      this.o = Object.assign(
        { duration: 1000, padding: 0.03, regions: [], protect: true, flourish: true, background: null, dprMax: 2.5 },
        o || {}
      );
      if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
      const c = (this.canvas = document.createElement('canvas'));
      c.className = 'coverfx-canvas';
      Object.assign(c.style, { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', display: 'block' });
      el.appendChild(c);
      this.ctx = c.getContext('2d');
      this.value = 0; this.target = 0; this.anim = null; this.raf = 0;
      this.t0 = performance.now();
      this.img = null; this.rect = null; this.dpr = 1;
      this._tick = this._tick.bind(this);
      this._ro = new ResizeObserver(() => this._resize());
      this._ro.observe(el);
      this._constructing = true;
      this.setEffect(this.o.effect || ORDER[0], this.o.opts);
      this._constructing = false;
      this.ready = this.o.src != null ? this.setImage(this.o.src) : Promise.resolve(false);
      // 생성 직후 onChange 를 한 번 알린다 (create() 가 반환된 뒤에)
      Promise.resolve().then(() => this._emit());
    }

    // ── 상태 ──
    get stages() { return this._stages; }
    get stage() { return this.target; }
    get revealed() { return this.target >= this._stages; }
    get busy() { return !!this.anim; }
    get effect() { return this.name; }
    get label() { return this.def.label || this.name; }
    get desc() { return this.def.desc || ''; }

    // ── 단계 이동 ──
    goTo(n, opt) {
      opt = opt || {};
      n = clamp(Math.round(n), 0, this._stages);
      if (n === this.target && !opt.instant) return false;
      const from = this.value;
      this.target = n;
      if (opt.instant) { this.value = n; this.anim = null; }
      else {
        const dist = Math.abs(n - from);
        const dur = (opt.duration || this.o.duration) * clamp(0.6 + 0.4 * dist, 0.6, 2.2);
        this.anim = { from, to: n, start: performance.now(), dur };
      }
      this._emit();
      this._kick();
      return true;
    }
    next(o) { return this.goTo(this.target + 1, o); }
    prev(o) { return this.goTo(this.target - 1, o); }
    reveal(o) { return this.goTo(this._stages, o); }
    reset(o) { return this.goTo(0, o); }

    // ── 설정 ──
    setEffect(name, opts) {
      const def = EFFECTS[name];
      if (!def) throw new Error('CoverFX: 알 수 없는 효과 "' + name + '" (가능: ' + ORDER.join(', ') + ')');
      this.name = name;
      this.def = def;
      this.opts = Object.assign({}, def.defaults || {}, opts || {});
      this._stages = stagesOf(def, this.opts);
      this.seed = this.opts.seed != null ? this.opts.seed : (Math.random() * 2147483647) | 0;
      this.state = def.init ? def.init({ opts: this.opts, rand: rng(this.seed), stages: this._stages }) || {} : {};
      this.value = 0; this.target = 0; this.anim = null;
      this._emit();
      this._kick();
      return this;
    }
    setImage(src) {
      const tok = (this._tok = (this._tok || 0) + 1);
      return loadSource(src).then(
        (img) => {
          if (tok !== this._tok) return false;
          this._useImage(img);
          return true;
        },
        (err) => {
          if (tok !== this._tok) return false;
          console.warn('CoverFX: 이미지를 불러오지 못했습니다 →', src);
          this._useImage(placeholder({ title: '이미지를 불러올 수 없음', sub: String(src).slice(-36) }));
          if (this.o.onError) this.o.onError(err);
          return false;
        }
      );
    }
    setRegions(regions) {
      this.o.regions = Array.isArray(regions) ? regions : [];
      this._buildProtected();
      this._kick();
      return this;
    }
    setOptions(o) {
      Object.assign(this.o, o || {});
      this._build();
      this._kick();
      return this;
    }
    /** 컨테이너 기준 표지 위치(CSS px). 영역 지정 UI 등에 사용 */
    coverRect() {
      const r = this.rect;
      if (!r) return null;
      const k = 1 / this.dpr;
      return { x: r.x * k, y: r.y * k, w: r.w * k, h: r.h * k };
    }
    destroy() {
      this._ro.disconnect();
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.canvas.remove();
    }

    // ── 내부 ──
    _useImage(img) {
      this.img = img;
      const s = sizeOf(img);
      this.iw = s.w || 1; this.ih = s.h || 1;
      // 컨테이너 높이가 0 이면 표지 비율로 높이를 만든다 (div 하나만 줘도 동작하도록)
      if (this.el.clientHeight < 4 || this._autoAspect) {
        this._autoAspect = true;
        this.el.style.aspectRatio = this.iw + ' / ' + this.ih;
      }
      this._resize();
    }
    _resize() {
      const cw = this.el.clientWidth, ch = this.el.clientHeight;
      const dpr = Math.min(this.o.dprMax, window.devicePixelRatio || 1);
      const W = Math.max(1, Math.round(cw * dpr)), H = Math.max(1, Math.round(ch * dpr));
      if (this.canvas.width !== W || this.canvas.height !== H) { this.canvas.width = W; this.canvas.height = H; }
      this.dpr = dpr;
      this._build();
      this._draw(performance.now(), this.anim ? null : 1);
    }
    _build() {
      if (!this.img) return;
      const W = this.canvas.width, H = this.canvas.height;
      const pad = Math.round(Math.min(W, H) * this.o.padding);
      const aw = W - 2 * pad, ah = H - 2 * pad;
      if (aw < 4 || ah < 4) { this.rect = null; return; }
      const s = Math.min(aw / this.iw, ah / this.ih);
      const w = Math.max(1, Math.round(this.iw * s)), h = Math.max(1, Math.round(this.ih * s));
      this.rect = { x: Math.round((W - w) / 2), y: Math.round((H - h) / 2), w, h };
      let clear = this.clearSrc;
      if (!clear || clear.width !== w || clear.height !== h) clear = makeCanvas(w, h);
      const c = clear.getContext('2d');
      c.clearRect(0, 0, w, h);
      c.imageSmoothingEnabled = true;
      c.imageSmoothingQuality = 'high';
      c.drawImage(this.img, 0, 0, w, h);
      this.clearSrc = clear;
      this._buildProtected();
    }
    _regionsPx() {
      const r = this.rect;
      if (!r) return [];
      return (this.o.regions || [])
        .filter((q) => q && q.w > 0 && q.h > 0)
        .map((q) => ({
          x: Math.round(q.x * r.w), y: Math.round(q.y * r.h),
          w: Math.max(1, Math.round(q.w * r.w)), h: Math.max(1, Math.round(q.h * r.h)),
        }));
    }
    // 제목 보호용 원본: 제목 영역만 굵은 모자이크로 덮은 사본
    _buildProtected() {
      const r = this.rect;
      const regs = this._regionsPx();
      if (!r || !this.clearSrc || !regs.length) { this.protSrc = null; return; }
      let p = this.protSrc;
      if (!p || p.width !== r.w || p.height !== r.h) p = makeCanvas(r.w, r.h);
      const c = p.getContext('2d');
      c.clearRect(0, 0, r.w, r.h);
      c.drawImage(this.clearSrc, 0, 0);
      for (const g of regs) {
        const b = Math.max(g.h / 3, r.w * 0.045);
        pixelate(c, this.clearSrc, g.x, g.y, g.w, g.h, g.x, g.y, g.w, g.h, b);
      }
      this.protSrc = p;
    }
    _src(t) {
      if (!this.protSrc || !this.o.protect || this.def.protect === false) return this.clearSrc;
      const S = this._stages;
      const k = seg(t, S - 1, S);
      if (k <= 0) return this.protSrc;
      if (k >= 1) return this.clearSrc;
      let m = this.mixSrc;
      if (!m || m.width !== this.clearSrc.width || m.height !== this.clearSrc.height) m = this.mixSrc = makeCanvas(this.clearSrc.width, this.clearSrc.height);
      const c = m.getContext('2d');
      c.globalAlpha = 1;
      c.clearRect(0, 0, m.width, m.height);
      c.drawImage(this.protSrc, 0, 0);
      c.globalAlpha = k;
      c.drawImage(this.clearSrc, 0, 0);
      c.globalAlpha = 1;
      return m;
    }
    _animated() {
      const a = this.def.animated;
      if (!a) return false;
      return typeof a === 'function' ? !!a(this.value, this.opts, this._stages) : this.value < this._stages;
    }
    _kick() {
      if (!this.raf) this.raf = requestAnimationFrame(this._tick);
    }
    _tick(now) {
      this.raf = 0;
      let p = 1;
      if (this.anim) {
        const a = this.anim;
        p = clamp((now - a.start) / a.dur, 0, 1);
        this.value = lerp(a.from, a.to, Ease.inOut(p));
        if (p >= 1) {
          this.value = a.to;
          this.anim = null;
          if (this.o.onSettle) this.o.onSettle(this._info());
        }
      }
      this._draw(now, p);
      if (this.anim || this._animated()) this._kick();
    }
    _draw(now, p) {
      const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = true;
      ctx.clearRect(0, 0, W, H);
      if (this.o.background) { ctx.fillStyle = this.o.background; ctx.fillRect(0, 0, W, H); }
      const r = this.rect;
      if (!r || !this.clearSrc) return;
      const S = this._stages, t = this.value;
      // 공개 완료 상태: 원본을 그대로 (픽셀 단위로 동일)
      if (t >= S && !this.anim) { ctx.drawImage(this.clearSrc, r.x, r.y); return; }
      const s = {
        ctx, t, stages: S, w: r.w, h: r.h,
        src: this._src(t), clear: this.clearSrc,
        time: ((now || performance.now()) - this.t0) / 1000,
        state: this.state, opts: this.opts, regions: this._regionsPx(),
        bounds: { x: -r.x, y: -r.y, w: W, h: H }, dpr: this.dpr, p: p == null ? 1 : p, H: Helpers,
      };
      ctx.save();
      ctx.translate(r.x, r.y);
      try { this.def.render(ctx, s); }
      catch (e) { console.error('CoverFX render error', e); ctx.drawImage(this.clearSrc, 0, 0); }
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      if (this.o.flourish && this.anim && p != null && p < 1) sweep(ctx, r.x, r.y, r.w, r.h, p, 1);
    }
    _info() {
      return { stage: this.target, stages: this._stages, revealed: this.revealed, effect: this.name };
    }
    _emit() {
      if (this._constructing) return;
      const info = this._info();
      if (this.o.onChange) this.o.onChange(info);
      try { this.el.dispatchEvent(new CustomEvent('coverfx:change', { detail: info })); } catch (e) { /* noop */ }
    }
  }

  // ═════════════════════════ 기본 효과들 ═════════════════════════

  // 1) 제목 가리기 ── ① 가림막 ② 제목 모자이크 → 공개
  function makePanel(w, h) {
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const r = Math.min(w, h) * 0.12;
    roundRect(g, 0, 0, w, h, r);
    g.save();
    g.clip();
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#2e0b63');
    gr.addColorStop(0.5, '#8e24aa');
    gr.addColorStop(1, '#e0306f');
    g.fillStyle = gr;
    g.fillRect(0, 0, w, h);
    const lw = Math.max(3, Math.min(w, h) * 0.07);
    g.globalAlpha = 0.13;
    g.strokeStyle = '#fff';
    g.lineWidth = lw;
    g.beginPath();
    for (let k = -h; k < w + h; k += lw * 3) { g.moveTo(k, -2); g.lineTo(k - h, h + 2); }
    g.stroke();
    g.globalAlpha = 1;
    const n = clamp(Math.round((w / h) * 1.1), 1, 6);
    const fs = Math.min(h * 0.72, (w / n) * 0.9);
    g.font = '900 ' + fs + 'px "Black Han Sans", "Noto Sans KR", sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(255,214,79,0.9)';
    g.shadowBlur = fs * 0.25;
    g.fillStyle = '#ffd54f';
    for (let k = 0; k < n; k++) g.fillText('?', (w * (k + 0.5)) / n, h * 0.54);
    g.restore();
    const bw = Math.max(2, Math.min(w, h) * 0.045);
    roundRect(g, bw / 2, bw / 2, w - bw, h - bw, r);
    g.lineWidth = bw;
    g.strokeStyle = '#ffe082';
    g.stroke();
    return c;
  }
  register('titlemask', {
    label: '제목 가리기',
    desc: '제목은 가림막 뒤에 숨었어요. 그림만 보고 맞혀 보세요!',
    stages: 2,
    protect: false, // 자체적으로 제목 영역을 다룬다
    defaults: { block: 0.035, defaultRegion: { x: 0.06, y: 0.05, w: 0.88, h: 0.24 } },
    render(ctx, s) {
      const { w, h, t } = s;
      const src = s.clear;
      ctx.drawImage(src, 0, 0);
      let regs = s.regions;
      if (!regs.length) {
        const d = s.opts.defaultRegion;
        regs = [{ x: d.x * w, y: d.y * h, w: d.w * w, h: d.h * h }];
      }
      const a = seg(t, 0, 1), b = seg(t, 1, 2);
      const b1 = Math.max(2, w * s.opts.block);
      const steps = 6;
      const q = Math.min(1, Math.floor(b * steps + 1e-6) / steps);
      const block = q >= 1 ? 1 : b1 * Math.pow(1 - q, 1.6);
      const pop = 1 + 0.07 * Math.sin(Math.PI * b);
      if (a > 0) {
        for (const g of regs) {
          if (block <= 1.2) continue;
          ctx.save();
          ctx.translate(g.x + g.w / 2, g.y + g.h / 2);
          ctx.scale(pop, pop);
          ctx.translate(-(g.x + g.w / 2), -(g.y + g.h / 2));
          pixelate(ctx, src, g.x, g.y, g.w, g.h, g.x, g.y, g.w, g.h, block);
          ctx.restore();
        }
      }
      if (a < 1) {
        if (!s.state.panels) s.state.panels = {};
        regs.forEach((g, i) => {
          const pad = Math.round(w * 0.012);
          const x = g.x - pad, y = g.y - pad, pw = g.w + pad * 2, ph = g.h + pad * 2;
          const key = pw + 'x' + ph + ':' + i;
          const pc = s.state.panels[key] || (s.state.panels[key] = makePanel(pw, ph));
          if (a <= 0) { ctx.drawImage(pc, x, y); return; }
          const hw = pw / 2;
          for (const side of [-1, 1]) {
            const cx = x + (side < 0 ? hw / 2 : hw * 1.5), cy = y + ph / 2;
            const dx = side * a * pw * 0.7;
            const dy = -Math.sin(a * Math.PI) * ph * 0.7 + a * a * h * 0.35;
            ctx.save();
            ctx.globalAlpha = 1 - seg(a, 0.55, 1);
            ctx.translate(cx + dx, cy + dy);
            ctx.rotate(side * a * 0.9);
            ctx.scale(1 + a * 0.25, 1 + a * 0.25);
            ctx.drawImage(pc, side < 0 ? 0 : hw, 0, hw, ph, -hw / 2, -ph / 2, hw, ph);
            ctx.restore();
          }
        });
      }
    },
  });

  // 2) 조각 재배치 ── ① 섞임+회전+일부 반전 ② 회전 풀림 ③ 절반 제자리 → 공개
  register('shuffle', {
    label: '조각 재배치',
    desc: '표지가 조각조각 흩어졌어요. 조각들이 제자리를 찾아갑니다!',
    stages: 3,
    defaults: { grid: 5, invert: 0.3, rotate: true },
    init({ opts, rand }) {
      const n = Math.max(2, opts.grid | 0), N = n * n;
      const pos0 = shuffled(N, rand);
      for (let i = 0; i < N; i++) {
        if (pos0[i] === i) {
          const j = (i + 1 + Math.floor(rand() * (N - 1))) % N;
          const tmp = pos0[i]; pos0[i] = pos0[j]; pos0[j] = tmp;
        }
      }
      const rot = [], inv = [], delay = [];
      for (let i = 0; i < N; i++) {
        rot.push(opts.rotate ? (rand() < 0.12 ? 0 : 1 + Math.floor(rand() * 3)) : 0);
        inv.push(rand() < opts.invert);
        delay.push(rand());
      }
      const order = shuffled(N, rand);
      const half = Math.floor(N / 2);
      const A = new Array(N).fill(false);
      order.slice(0, half).forEach((i) => (A[i] = true));
      const Bs = order.slice(half);
      const Bslots = derange(Bs, rand);
      const pos2 = Array.from({ length: N }, (_, i) => i);
      Bs.forEach((pi, k) => (pos2[pi] = Bslots[k]));
      return { n, N, pos0, pos2, rot, inv, delay, A };
    },
    render(ctx, s) {
      const { w, h, t, src, state: st } = s;
      const n = st.n, pw = w / n, ph = h / n;
      const s1 = seg(t, 0, 1), s2 = seg(t, 1, 2), s3 = seg(t, 2, 3);
      ctx.save();
      ctx.globalAlpha = 1 - s3;
      ctx.fillStyle = 'rgba(10,8,30,0.92)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      const gap = Math.max(1, w * 0.008) * (1 - s3);
      const items = [];
      for (let i = 0; i < st.N; i++) {
        const d = st.delay[i];
        const r1 = Ease.outBack(stagger(s1, d, 0.45));
        const u2 = Ease.inOut(stagger(s2, d, 0.45));
        const u3 = Ease.inOut(stagger(s3, d, 0.45));
        let from, to, u;
        if (s3 > 0 && !st.A[i]) { from = st.pos2[i]; to = i; u = u3; }
        else { from = st.pos0[i]; to = st.pos2[i]; u = u2; }
        const fx = ((from % n) + 0.5) * pw, fy = (Math.floor(from / n) + 0.5) * ph;
        const tx = ((to % n) + 0.5) * pw, ty = (Math.floor(to / n) + 0.5) * ph;
        const fly = from !== to ? Math.sin(Math.PI * u) : 0;
        items.push({
          i, fly,
          cx: lerp(fx, tx, u),
          cy: lerp(fy, ty, u) - fly * h * 0.08,
          sc: 1 + fly * 0.35,
          ang: st.rot[i] * (Math.PI / 2) * (1 - r1) + fly * 0.5 * (i % 2 ? 1 : -1),
          invA: st.inv[i] ? 1 - (st.A[i] ? u2 : u3) : 0,
        });
      }
      items.sort((a, b) => a.fly - b.fly);
      for (const it of items) {
        const sx = (it.i % n) * pw, sy = Math.floor(it.i / n) * ph;
        const c = Math.abs(Math.cos(it.ang)), sn = Math.abs(Math.sin(it.ang));
        const fit = Math.min(pw / (pw * c + ph * sn), ph / (pw * sn + ph * c));
        const dw = pw - gap, dh = ph - gap;
        ctx.save();
        ctx.translate(it.cx, it.cy);
        ctx.rotate(it.ang);
        ctx.scale(it.sc * fit, it.sc * fit);
        if (it.fly > 0.05) { ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 24 * s.dpr * it.fly; }
        ctx.drawImage(src, sx, sy, pw, ph, -dw / 2, -dh / 2, dw, dh);
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        invert(ctx, -dw / 2, -dh / 2, dw, dh, it.invA);
        ctx.restore();
      }
    },
  });

  // 3) 색상 반전 ── ① 반전+좌우반전+무지개+약한 모자이크 ② 카드 뒤집기로 방향 복귀 → 공개(원형으로 색 복원)
  register('invert', {
    label: '색상 반전',
    desc: '색도 방향도 뒤집혔어요. 무지개빛 너머의 진짜 표지는?',
    stages: 2,
    defaults: { mosaic: 0.014, rainbow: 0.38, speed: 0.12 },
    animated: (t) => t < 1,
    render(ctx, s) {
      const { w, h, t, src } = s;
      const a = seg(t, 0, 1), b = seg(t, 1, 2);
      const sx = -Math.cos(Math.PI * a);
      const lift = 1 + 0.12 * Math.sin(Math.PI * a);
      const R = (Math.hypot(w, h) / 2) * b * 1.02;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(sx * lift, lift);
      ctx.translate(-w / 2, -h / 2);
      const blk = w * s.opts.mosaic * (1 - a);
      if (blk > 1.5) pixelate(ctx, src, 0, 0, w, h, 0, 0, w, h, blk);
      else ctx.drawImage(src, 0, 0);
      if (b < 1) {
        ctx.save();
        if (b > 0) {
          ctx.beginPath();
          ctx.rect(0, 0, w, h);
          ctx.arc(w / 2, h / 2, R, 0, Math.PI * 2, true);
          ctx.clip('evenodd');
        }
        invert(ctx, 0, 0, w, h, 1);
        ctx.restore();
      }
      rainbow(ctx, 0, 0, w, h, s.time * s.opts.speed, s.opts.rainbow * (1 - a));
      const shade = 1 - Math.abs(sx);
      if (shade > 0.01) {
        ctx.fillStyle = 'rgba(0,0,0,' + (0.55 * shade).toFixed(3) + ')';
        ctx.fillRect(0, 0, w, h);
      }
      ctx.restore();
      if (b > 0 && b < 1) ring(ctx, w / 2, h / 2, R, b, w, h);
    },
  });

  // 4) 흔들리는 띠 ── ① 띠 순서 섞임 + 큰 물결 ② 띠 제자리 + 약한 물결 → 공개
  register('strips', {
    label: '흔들리는 띠',
    desc: '표지가 세로 띠로 잘려 뒤섞이고 잔잔하게 일렁여요.',
    stages: 2,
    defaults: { count: 12, amp: 0.04, amp1: 0.012, speed: 0.22 },
    animated: (t, o, S) => t < S,
    init({ opts, rand }) {
      const n = Math.max(2, opts.count | 0);
      const perm = derange(Array.from({ length: n }, (_, i) => i), rand);
      const ph = [], delay = [];
      for (let i = 0; i < n; i++) { ph.push(rand() * Math.PI * 2); delay.push(rand()); }
      return { n, perm, ph, delay };
    },
    render(ctx, s) {
      const { w, h, t, src, state: st, time } = s;
      const n = st.n;
      const a = seg(t, 0, 1), b = seg(t, 1, 2);
      const amp = lerp(lerp(s.opts.amp, s.opts.amp1, a), 0, b) * h;
      ctx.save();
      ctx.globalAlpha = 1 - b;
      ctx.fillStyle = 'rgba(10,8,30,0.88)';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
      const gap = w * 0.006 * (1 - b);
      const order = [];
      for (let i = 0; i < n; i++) order.push(i);
      const us = order.map((i) => Ease.inOut(stagger(a, st.delay[i], 0.4)));
      order.sort((x, y) => Math.sin(Math.PI * us[x]) - Math.sin(Math.PI * us[y]));
      for (const i of order) {
        const x0 = Math.round((i * w) / n), sw = Math.round(((i + 1) * w) / n) - x0;
        const u = us[i];
        const fx = Math.round((st.perm[i] * w) / n);
        const x = lerp(fx, x0, u);
        const lift = Math.sin(Math.PI * u);
        const phase = time * s.opts.speed * Math.PI * 2 + i * 0.75 + st.ph[i] * 0.3;
        const dy = amp * Math.sin(phase) - lift * h * 0.05;
        const rot = (amp / h) * 0.25 * Math.cos(phase);
        const sc = 1 + lift * 0.08;
        ctx.save();
        ctx.translate(x + sw / 2, h / 2 + dy);
        ctx.rotate(rot);
        ctx.scale(sc, sc);
        if (lift > 0.05) { ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 18 * s.dpr * lift; }
        ctx.drawImage(src, x0, 0, sw, h, -sw / 2 + gap / 2, -h / 2, Math.max(1, sw - gap), h);
        ctx.restore();
      }
    },
  });

  // 5) (예비) 모자이크 ── 블록이 점점 작아짐, 원형으로 번지며 전환
  register('mosaic', {
    label: '모자이크',
    desc: '커다란 픽셀 속에 숨은 표지. 점점 선명해집니다.',
    stages: (o) => (o.blocks || []).length || 3,
    defaults: { blocks: [10, 20, 40] },
    render(ctx, s) {
      const { w, h, t, src } = s;
      const S = s.stages;
      const lvl = (k) => (k >= S ? 1 : w / s.opts.blocks[k]);
      const drawLvl = (k) => {
        const b = lvl(k);
        if (b > 1.2) pixelate(ctx, src, 0, 0, w, h, 0, 0, w, h, b);
        else ctx.drawImage(src, 0, 0);
      };
      const i = Math.min(Math.floor(t), S - 1), u = t - i;
      const pop = 1 + 0.04 * Math.sin(Math.PI * u);
      const R = (Math.hypot(w, h) / 2) * u * 1.02;
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.scale(pop, pop);
      ctx.translate(-w / 2, -h / 2);
      drawLvl(i);
      if (u > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, Math.max(0.5, R), 0, Math.PI * 2);
        ctx.clip();
        drawLvl(i + 1);
        ctx.restore();
        ring(ctx, w / 2, h / 2, R, u, w, h);
      }
      ctx.restore();
    },
  });

  // 6) (예비) 손전등 ── 어둠 속을 움직이는 빛, 단계마다 빛이 커짐
  register('spotlight', {
    label: '손전등',
    desc: '어둠 속을 헤매는 손전등. 빛이 비추는 곳을 잘 보세요!',
    stages: (o) => (o.radius || []).length || 3,
    defaults: { radius: [0.13, 0.2, 0.3], dim: 0.96, speed: 0.11, count: 1 },
    animated: (t, o, S) => t < S,
    init({ rand }) {
      const ph = [];
      for (let i = 0; i < 12; i++) ph.push(rand() * Math.PI * 2);
      return { ph };
    },
    render(ctx, s) {
      const { w, h, t, src, state: st, time } = s;
      const S = s.stages, R0 = s.opts.radius, D = Math.hypot(w, h);
      ctx.drawImage(src, 0, 0);
      const i = Math.min(Math.floor(t), S - 1), u = t - i;
      const rA = R0[i], rB = i + 1 >= S ? 1.3 : R0[i + 1];
      const r = lerp(rA, rB, u) * D * (1 + 0.15 * Math.sin(Math.PI * u));
      const fade = seg(t, S - 1, S);
      let L = st.layer;
      if (!L || L.width !== w || L.height !== h) L = st.layer = makeCanvas(w, h);
      const g = L.getContext('2d');
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(4,3,12,' + s.opts.dim + ')';
      g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-out';
      const sp = s.opts.speed * Math.PI * 2;
      const pts = [];
      for (let k = 0; k < Math.max(1, s.opts.count | 0); k++) {
        let cx = w * (0.5 + 0.36 * Math.sin(time * sp + st.ph[k * 2]));
        let cy = h * (0.5 + 0.38 * Math.sin(time * sp * 0.71 + st.ph[k * 2 + 1]));
        cx = lerp(cx, w / 2, fade); cy = lerp(cy, h / 2, fade);
        const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, 'rgba(0,0,0,1)');
        gr.addColorStop(0.72, 'rgba(0,0,0,0.96)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fill();
        pts.push([cx, cy]);
      }
      g.globalCompositeOperation = 'source-over';
      ctx.save();
      ctx.globalAlpha = 1 - fade;
      ctx.drawImage(L, 0, 0);
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.22 * (1 - fade);
      for (const [cx, cy] of pts) {
        const gr = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
        gr.addColorStop(0, 'rgba(255,230,160,1)');
        gr.addColorStop(1, 'rgba(255,230,160,0)');
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    },
  });

  // 7) (예비) 초근접 줌 ── 아주 가까이에서 시작해 점점 멀어짐
  register('zoom', {
    label: '초근접 줌',
    desc: '표지의 아주 작은 부분부터! 점점 멀어지며 전체가 드러나요.',
    stages: (o) => (o.zoom || []).length || 3,
    defaults: { zoom: [6, 3, 1.7], focus: null, rotate: 20, drift: 0.06 },
    animated: (t, o, S) => t < S,
    init({ opts, rand }) {
      return { f: opts.focus || { x: 0.3 + rand() * 0.4, y: 0.35 + rand() * 0.35 }, ph: rand() * 6.28 };
    },
    render(ctx, s) {
      const { w, h, t, src, state: st, time } = s;
      const S = s.stages, Z = s.opts.zoom;
      const zAt = (k) => (k >= S ? 1 : Z[k]);
      const i = Math.min(Math.floor(t), S - 1), u = t - i;
      const z = Math.exp(lerp(Math.log(zAt(i)), Math.log(zAt(i + 1)), u));
      const m = Z[0] > 1 ? (z - 1) / (Z[0] - 1) : 0;
      const dr = s.opts.drift * m;
      let fx = (st.f.x + dr * Math.sin(time * 0.37 + st.ph)) * w;
      let fy = (st.f.y + dr * Math.cos(time * 0.29 + st.ph)) * h;
      const hw = w / 2 / z, hh = h / 2 / z;
      fx = clamp(fx, hw, w - hw);
      fy = clamp(fy, hh, h - hh);
      const rot = ((s.opts.rotate * Math.PI) / 180) * m;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      ctx.fillStyle = '#0a0818';
      ctx.fillRect(0, 0, w, h);
      ctx.translate(w / 2, h / 2);
      ctx.rotate(rot);
      ctx.scale(z, z);
      ctx.translate(-fx, -fy);
      ctx.drawImage(src, 0, 0);
      ctx.restore();
    },
  });

  // 8) (예비) 타일 뒤집기 ── 번호판이 하나씩 뒤집히며 표지가 드러남 (제목 칸은 마지막에)
  const TILE_COLORS = [['#3b1a7a', '#6a2fc2'], ['#1c2f7a', '#2f5ad0']];
  function tileLayout(s) {
    const st = s.state;
    const cols = Math.max(2, s.opts.cols | 0);
    const rows = Math.max(2, Math.round((cols * s.h) / s.w));
    const key = s.w + 'x' + s.h + ':' + s.regions.map((g) => [g.x, g.y, g.w, g.h].join(',')).join('|');
    if (st.key === key) return st;
    const N = cols * rows, tw = s.w / cols, th = s.h / rows;
    const pr = [];
    for (let i = 0; i < N; i++) {
      const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
      let title = 0;
      for (const g of s.regions) {
        const ox = Math.min(x + tw, g.x + g.w) - Math.max(x, g.x);
        const oy = Math.min(y + th, g.y + g.h) - Math.max(y, g.y);
        if (ox > 0 && oy > 0 && ox * oy > tw * th * 0.12) title = 1;
      }
      pr.push({ i, p: rng(st.seed + i * 7919)() + title * 2 });
    }
    pr.sort((a, b) => a.p - b.p);
    const S = s.stages, open = s.opts.open;
    const openAt = new Array(N), delay = new Array(N);
    pr.forEach((o, rank) => {
      const f = rank / N;
      let k = 0;
      while (k < S && !(f < open[Math.min(k, open.length - 1)])) k++;
      openAt[o.i] = k;
      delay[o.i] = rng(st.seed + i2(o.i))();
    });
    function i2(v) { return v * 104729 + 17; }
    Object.assign(st, { key, cols, rows, N, tw, th, openAt, delay });
    return st;
  }
  register('tiles', {
    label: '타일 뒤집기',
    desc: '번호판이 하나씩 뒤집히며 표지가 드러나요. 제목 칸은 맨 마지막에!',
    stages: (o) => (o.open || []).length || 3,
    defaults: { cols: 5, open: [0.22, 0.42, 0.65] },
    init({ rand }) { return { seed: (rand() * 1e9) | 0 }; },
    render(ctx, s) {
      const st = tileLayout(s);
      const { w, t, src } = s;
      const { cols, tw, th, N } = st;
      const gap = Math.max(1, w * 0.005);
      const fs = Math.min(tw, th) * 0.42;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '400 ' + fs + 'px "Black Han Sans", "Noto Sans KR", sans-serif';
      for (let i = 0; i < N; i++) {
        const k = st.openAt[i];
        const f = k === 0 ? 1 : Ease.inOut(stagger(seg(t, k - 1, k), st.delay[i], 0.55));
        const x = (i % cols) * tw, y = Math.floor(i / cols) * th;
        const sx = Math.cos(Math.PI * f);
        if (Math.abs(sx) < 0.01) continue;
        const lift = 1 + 0.12 * Math.sin(Math.PI * f);
        ctx.save();
        ctx.translate(x + tw / 2, y + th / 2);
        ctx.scale(Math.abs(sx) * lift, lift);
        if (sx > 0) {
          const c = TILE_COLORS[((i % cols) + Math.floor(i / cols)) % 2];
          const g = ctx.createLinearGradient(0, -th / 2, 0, th / 2);
          g.addColorStop(0, c[1]); g.addColorStop(1, c[0]);
          ctx.fillStyle = g;
          roundRect(ctx, -tw / 2 + gap / 2, -th / 2 + gap / 2, tw - gap, th - gap, Math.min(tw, th) * 0.08);
          ctx.fill();
          ctx.lineWidth = Math.max(1, gap * 0.8);
          ctx.strokeStyle = 'rgba(255,224,130,0.7)';
          ctx.stroke();
          ctx.fillStyle = '#ffd54f';
          ctx.fillText(String(i + 1), 0, fs * 0.04);
        } else {
          ctx.drawImage(src, x, y, tw, th, -tw / 2, -th / 2, tw, th);
        }
        const shade = 1 - Math.abs(sx);
        if (shade > 0.02) {
          ctx.fillStyle = 'rgba(0,0,0,' + (0.45 * shade).toFixed(3) + ')';
          ctx.fillRect(-tw / 2, -th / 2, tw, th);
        }
        ctx.restore();
      }
    },
  });

  // 9) (예비) 복권 긁기 ── 은박을 긁어낸 자리로 표지가 보임
  function makeFoil(w, h) {
    const c = makeCanvas(w, h), g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, w, h);
    gr.addColorStop(0, '#e9ecf2'); gr.addColorStop(0.35, '#a8afbd'); gr.addColorStop(0.6, '#dfe3ea'); gr.addColorStop(1, '#8f97a6');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    const r = rng(4242);
    for (let i = 0; i < (w * h) / 900; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.35)' : 'rgba(60,66,80,0.18)';
      g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
    }
    const fs = w * 0.09;
    g.font = '400 ' + fs + 'px "Black Han Sans", "Noto Sans KR", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.save(); g.translate(w / 2, h / 2); g.rotate(-0.35);
    g.fillStyle = 'rgba(70,76,92,0.16)';
    for (let yy = -h; yy < h; yy += fs * 1.8) for (let xx = -w; xx < w; xx += fs * 4.2) g.fillText('?  ★', xx + (yy / (fs * 1.8)) % 2 * fs, yy);
    g.restore();
    g.fillStyle = 'rgba(55,60,75,0.55)';
    g.font = '400 ' + w * 0.075 + 'px "Black Han Sans", "Noto Sans KR", sans-serif';
    g.fillText('긁어서 확인하세요!', w / 2, h * 0.93);
    g.lineWidth = Math.max(2, w * 0.012);
    g.strokeStyle = '#d4a52b';
    g.strokeRect(g.lineWidth / 2, g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
    return c;
  }
  register('scratch', {
    label: '복권 긁기',
    desc: '은박을 긁어낼수록 표지가 보여요. 어디를 긁을지는 운!',
    stages: (o) => (o.strokes || []).length || 3,
    defaults: { strokes: [3, 4, 5], width: 0.075 },
    init({ opts, rand }) {
      const groups = opts.strokes.map((n) => {
        const list = [];
        for (let k = 0; k < n; k++) {
          const cx = 0.12 + rand() * 0.76, cy = 0.1 + rand() * 0.8, ang = rand() * Math.PI;
          const len = 0.24 + rand() * 0.2, zig = 5 + Math.floor(rand() * 4), amp = 0.05 + rand() * 0.05;
          const pts = [];
          for (let j = 0; j <= zig; j++) {
            const along = -len / 2 + (len * j) / zig, side = (j % 2 ? 1 : -1) * amp * (0.6 + rand() * 0.6);
            pts.push([Math.cos(ang) * along - Math.sin(ang) * side, Math.sin(ang) * along + Math.cos(ang) * side]);
          }
          list.push({ cx, cy, pts });
        }
        return list;
      });
      return { groups };
    },
    render(ctx, s) {
      const { w, h, t, src, state: st } = s;
      const S = s.stages;
      ctx.drawImage(src, 0, 0);
      if (!st.foil || st.foil.width !== w || st.foil.height !== h) { st.foil = makeFoil(w, h); st.layer = makeCanvas(w, h); }
      const g = st.layer.getContext('2d');
      g.globalCompositeOperation = 'source-over';
      g.clearRect(0, 0, w, h);
      g.drawImage(st.foil, 0, 0);
      g.globalCompositeOperation = 'destination-out';
      g.lineCap = 'round'; g.lineJoin = 'round';
      g.lineWidth = w * s.opts.width;
      g.strokeStyle = '#000';
      const tips = [];
      st.groups.forEach((list, gi) => {
        if (gi >= S) return;
        const prog = gi === 0 ? 1 : seg(t, gi - 1, gi);
        list.forEach((sk, k) => {
          const u = Ease.inOut(stagger(prog, k / Math.max(1, list.length), 0.6));
          if (u <= 0) return;
          const P = sk.pts.map(([dx, dy]) => [sk.cx * w + dx * w, sk.cy * h + dy * w]);
          let total = 0;
          for (let j = 1; j < P.length; j++) total += Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]);
          let left = total * u;
          g.beginPath(); g.moveTo(P[0][0], P[0][1]);
          let tip = P[0];
          for (let j = 1; j < P.length && left > 0; j++) {
            const d = Math.hypot(P[j][0] - P[j - 1][0], P[j][1] - P[j - 1][1]);
            const q = Math.min(1, left / d);
            tip = [lerp(P[j - 1][0], P[j][0], q), lerp(P[j - 1][1], P[j][1], q)];
            g.lineTo(tip[0], tip[1]);
            left -= d;
          }
          g.stroke();
          if (u < 1) tips.push(tip);
        });
      });
      g.globalCompositeOperation = 'source-over';
      const fade = seg(t, S - 1, S);
      ctx.save();
      ctx.globalAlpha = 1 - fade;
      ctx.translate(0, -fade * h * 0.08);
      ctx.drawImage(st.layer, 0, 0);
      ctx.restore();
      // 긁는 동전
      for (const [x, y] of tips) {
        const r = w * 0.045;
        ctx.save();
        ctx.translate(x, y); ctx.rotate(-0.5);
        const cg = ctx.createRadialGradient(-r * 0.3, -r * 0.3, r * 0.1, 0, 0, r);
        cg.addColorStop(0, '#fff3c4'); cg.addColorStop(0.6, '#f2c14e'); cg.addColorStop(1, '#b8860b');
        ctx.fillStyle = cg;
        ctx.shadowColor = 'rgba(0,0,0,0.45)'; ctx.shadowBlur = r * 0.6;
        ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#8a6200';
        ctx.font = '700 ' + r * 1.1 + 'px sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('₩', 0, r * 0.05);
        ctx.restore();
      }
    },
  });

  // 10) (예비) 블라인드 ── 블라인드 틈새로 엿보기, 단계마다 더 열림
  register('blinds', {
    label: '블라인드',
    desc: '블라인드 틈새로 엿보기. 단계마다 조금씩 더 열려요.',
    stages: (o) => (o.open || []).length || 3,
    defaults: { count: 10, open: [0.14, 0.3, 0.52] },
    render(ctx, s) {
      const { w, h, t, src } = s;
      const S = s.stages, open = s.opts.open, n = Math.max(2, s.opts.count | 0), bh = h / n;
      ctx.drawImage(src, 0, 0);
      const i = Math.min(Math.floor(t), S - 1), u = t - i;
      const from = open[i], to = i + 1 >= S ? 1 : open[i + 1];
      const fade = seg(t, S - 1, S);
      for (let k = 0; k < n; k++) {
        const uk = Ease.inOut(stagger(u, k / n, 0.5));
        const o = lerp(from, to, uk);
        const thick = bh * (1 - o);
        if (thick < 0.5) continue;
        const y = k * bh + (bh - thick) / 2;
        const g = ctx.createLinearGradient(0, y, 0, y + thick);
        g.addColorStop(0, '#fbf8f1'); g.addColorStop(0.45, '#e3ddd0'); g.addColorStop(1, '#b7ae9c');
        ctx.fillStyle = g;
        ctx.fillRect(0, y, w, thick);
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(0, y + thick, w, Math.min(bh * 0.06, (bh - thick) / 2));
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.fillRect(0, y, w, Math.max(1, thick * 0.06));
      }
      ctx.save();
      ctx.globalAlpha = 0.75 * (1 - fade);
      ctx.fillStyle = '#9a917f';
      for (const fx of [0.2, 0.8]) ctx.fillRect(w * fx - w * 0.003, 0, w * 0.006, h);
      ctx.restore();
    },
  });

  // 11) (예비) 뿌연 안개 ── 흐리고 색이 빠진 표지가 점점 선명해짐
  const FILTER_OK = (() => {
    try { const c = document.createElement('canvas').getContext('2d'); c.filter = 'blur(2px)'; return c.filter === 'blur(2px)'; }
    catch (e) { return false; }
  })();
  register('fog', {
    label: '뿌연 안개',
    desc: '뿌연 안개 속의 표지. 안개가 걷히며 색과 모양이 살아나요.',
    stages: (o) => (o.blur || []).length || 3,
    defaults: { blur: [0.04, 0.018, 0.007], sat: [0.4, 0.7, 0.95], haze: [0.22, 0.12, 0.05] },
    animated: (t, o, S) => t < S,
    init({ rand }) {
      const blobs = [];
      for (let k = 0; k < 4; k++) blobs.push({ x: rand(), y: rand(), r: 0.35 + rand() * 0.3, sp: 0.02 + rand() * 0.03, ph: rand() * 6.28 });
      return { blobs };
    },
    render(ctx, s) {
      const { w, h, t, src, state: st, time } = s;
      const S = s.stages, o = s.opts;
      const i = Math.min(Math.floor(t), S - 1), u = t - i;
      const val = (arr, fin) => lerp(arr[i], i + 1 >= S ? fin : arr[i + 1], u);
      const r = val(o.blur, 0) * w, sat = val(o.sat, 1), haze = val(o.haze, 0);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, w, h); ctx.clip();
      if (FILTER_OK) {
        ctx.filter = 'blur(' + r.toFixed(2) + 'px) saturate(' + sat.toFixed(3) + ')';
        const m = r * 2;
        ctx.drawImage(src, -m, -m, w + 2 * m, h + 2 * m);
        ctx.filter = 'none';
      } else {
        const k = Math.max(1, r / 1.5);
        if (k > 1.2) {
          const small = shrink(src, 0, 0, w, h, w / k, h / k);
          ctx.imageSmoothingEnabled = true;
          ctx.drawImage(small, 0, 0, Math.round(w / k), Math.round(h / k), 0, 0, w, h);
        } else ctx.drawImage(src, 0, 0);
        if (sat < 0.999) {
          ctx.globalCompositeOperation = 'saturation';
          ctx.globalAlpha = 1 - sat;
          ctx.fillStyle = '#808080';
          ctx.fillRect(0, 0, w, h);
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
        }
      }
      if (haze > 0.005) {
        ctx.fillStyle = 'rgba(225,230,242,' + haze.toFixed(3) + ')';
        ctx.fillRect(0, 0, w, h);
        for (const b of st.blobs) {
          const bx = (b.x + 0.15 * Math.sin(time * b.sp * 6.28 + b.ph)) * w;
          const by = (b.y + 0.1 * Math.cos(time * b.sp * 5 + b.ph)) * h;
          const br = b.r * w;
          const g = ctx.createRadialGradient(bx, by, 0, bx, by, br);
          g.addColorStop(0, 'rgba(240,243,250,' + (haze * 1.4).toFixed(3) + ')');
          g.addColorStop(1, 'rgba(240,243,250,0)');
          ctx.fillStyle = g;
          ctx.fillRect(0, 0, w, h);
        }
      }
      ctx.restore();
    },
  });

  // ───────────────────────── 공개 API ─────────────────────────
  const CoverFX = {
    version: '1.0.0',
    create: (container, opts) => new Engine(container, opts),
    register,
    effects,
    get: (name) => EFFECTS[name] || null,
    has: (name) => !!EFFECTS[name],
    placeholder,
    helpers: Helpers,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CoverFX;
  global.CoverFX = CoverFX;
})(typeof window !== 'undefined' ? window : this);
