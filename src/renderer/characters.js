/* Bot characters: one simple Wayzerr bot — a soft gradient dome standing on two feet, with two pill eyes —
   in six proportions. Each character = { shape, color, eyes, extra, mouth, acc }. Rendered as inline SVG so the
   eyes can look around and the body can animate. Accessories are separate items drawn in the same flat gradient
   style, fitted to the real outline of each body, and each one has its own little move (see MOVES below). */
(function () {
  const SHAPES = ['orb', 'pebble', 'blob', 'bun', 'capsule', 'bean'];
  const ROUND = { drop: 'blob', star: 'orb', cat: 'bun', octo: 'pebble', ghost: 'capsule', mushroom: 'bean' };
  const roundShape = (s) => ROUND[s] || (SHAPES.includes(s) ? s : 'orb');
  const COLORS = ['#FF8A2B', '#4F8BFF', '#2FCB7A', '#FF7AB6', '#FFB020', '#2DD4BF', '#F2F2F2', '#4A4A54'];
  const EYES = ['dots', 'ovals', 'wide', 'dots', 'ovals', 'happy'];
  const f1 = (n) => +(+n).toFixed(1);
  const okHex = (c) => (/^#[0-9a-f]{6}$/i.test(c || '') ? c : COLORS[0]);

  function hash(str) {
    let h = 2166136261;
    for (const ch of String(str)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
    return h;
  }
  function rng(seed) {
    let s = seed || 1;
    return () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
  }
  function pick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

  function makeCharacter(seedText, usedColors = []) {
    const r = rng(hash(seedText) + 7);
    let color = pick(r, COLORS);
    // Prefer a color no other bot uses yet.
    const free = COLORS.filter((c) => !usedColors.includes(c));
    if (free.length && usedColors.includes(color)) color = free[Math.floor(r() * free.length)];
    return { shape: pick(r, SHAPES), color, eyes: pick(r, EYES), extra: 'none', mouth: 'none' };
  }

  function shade(hex, amt) {
    const n = parseInt(okHex(hex).slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
    return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  function toHsl(hex) {
    const n = parseInt(okHex(hex).slice(1), 16), r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
    if (!d) return [0, 0, l];
    const s = d / (1 - Math.abs(2 * l - 1));
    const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [h * 60, s, l];
  }
  function fromHsl(h, s, l) {
    h = ((h % 360) + 360) % 360; s = Math.max(0, Math.min(1, s)); l = Math.max(0, Math.min(1, l));
    const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
    const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
    return '#' + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, '0')).join('');
  }
  // light (top right) → the colour → shadow (bottom left): the same three-step gradient as the logo
  function tones(hex) {
    hex = okHex(hex);
    const [h, s, l] = toHsl(hex);
    return [fromHsl(h + 1, s, l + (l < 0.4 ? 0.15 : 0.2)), hex, fromHsl(h - 3, s * 0.92, l - (l > 0.85 ? 0.14 : 0.17))];
  }
  const lumOf = (hex) => { const n = parseInt(okHex(hex).slice(1), 16); return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255); };

  // ---------- the body ----------
  // The Wayzerr bot: a dome standing on two feet (the notch between them is the W). [left, right, top, bottom, shoulders]
  // "orb" is the logo itself; the others are the same bot in other proportions.
  const WB = { orb: [10, 90, 12, 90, 0.75], blob: [14, 86, 6, 92, 0.8], pebble: [6, 94, 22, 90, 0.72], bean: [6, 94, 30, 90, 0.7], capsule: [20, 80, 6, 92, 0.8], bun: [10, 90, 16, 90, 0.98] };
  function wPath(shape) {
    const [l, r, t, b, q] = WB[shape] || WB.orb, w = r - 50, s = w / 40, k = w * q, m = t + (b - t) * 0.5, u = t + (b - t) * 0.333, f = f1;
    return `M50 ${t}C${f(50 + k)} ${t} ${r} ${f(u)} ${r} ${f(m)}V${b - 16}C${r} ${b - 7} ${f(r - 6 * s)} ${b} ${f(r - 15 * s)} ${b}C${f(r - 24 * s)} ${b} ${f(r - 28 * s)} ${b - 6} ${f(r - 32 * s)} ${b - 10}Q50 ${b - 16} ${f(l + 32 * s)} ${b - 10}C${f(l + 28 * s)} ${b - 6} ${f(l + 24 * s)} ${b} ${f(l + 15 * s)} ${b}C${f(l + 6 * s)} ${b} ${l} ${b - 7} ${l} ${b - 16}V${f(m)}C${l} ${f(u)} ${f(50 - k)} ${t} 50 ${t}Z`;
  }
  const shapeDs = (shape) => [wPath(shape)];
  const bodyPath = (shape, fill) => `<path d="${wPath(WB[shape] ? shape : 'orb')}" fill="${fill}"/>`;
  // eye line, half the distance between the eyes, and the middle of each body
  const GEO = {}, EX = {}, CENTER = {};
  Object.keys(WB).forEach((k) => { const [, r, t, b] = WB[k]; GEO[k] = { top: t, eyeY: f1(t + (b - t) * 0.415) }; EX[k] = f1((r - 50) * 0.3 + 1); CENTER[k] = [50, f1(t + (b - t) * 0.5 + 1)]; });

  // Every bot leans a little and has its own resting gaze, so no two look the same: [tilt°, gaze x]
  const STYLE = { orb: [-8, 0.5], pebble: [5, -0.45], blob: [-4, 0.3], bun: [3, -0.25], capsule: [7, 0.4], bean: [-6, -0.4] };
  function personality(ch) {
    const v = hash(ch.shape + ch.color + ch.eyes), [t, g] = STYLE[ch.shape] || STYLE.orb;
    return { tilt: f1(t + ((v % 7) - 3) * 0.7), gx: +Math.max(-0.7, Math.min(0.7, g + (((v >> 5) % 5) - 2) * 0.07)).toFixed(2), gy: +((((v >> 9) % 3) - 1) * 0.06).toFixed(2) };
  }
  // The whole face glides toward where it looks and squeezes a little, like a face on a ball turning;
  // the far eye gets narrower. Used for the resting gaze here and every frame by the eye loop below.
  const lookT = (x, y) => `translate(${(x * 9).toFixed(2)}px, ${(y * 6).toFixed(2)}px) scale(${(1 - 0.14 * Math.min(1, Math.abs(x))).toFixed(3)}, ${(1 - 0.05 * Math.abs(y)).toFixed(3)})`;
  const eyeSx = (x, side) => { const far = Math.min(1, Math.max(0, side === 'r' ? x : -x)), near = Math.min(1, Math.max(0, side === 'r' ? -x : x)); return `scaleX(${(1 - 0.26 * far + 0.05 * near).toFixed(3)})`; };

  // Two pill eyes (or happy / sleepy arcs). Each eye = a group with a moving pupil group inside.
  function eyesSvg(style, y, ink, ex, gx, gy) {
    const sc = Math.min(1, ex / 13), R = style === 'wide' ? 3.6 : 2.6;
    const eye = (x, side) => {
      let s;
      if (style === 'happy') s = `<path d="M${f1(x - 6.5 * sc)} ${y + 4}Q${x} ${y - 7.5} ${f1(x + 6.5 * sc)} ${y + 4}" stroke="${ink}" stroke-width="4.6" fill="none" stroke-linecap="round"/>`;
      else if (style === 'sleepy') s = `<path d="M${f1(x - 6.5 * sc)} ${y - 1.5}Q${x} ${y + 7} ${f1(x + 6.5 * sc)} ${y - 1.5}" stroke="${ink}" stroke-width="4.6" fill="none" stroke-linecap="round"/>`;
      else { const [w, h] = style === 'wide' ? [15 * sc, 15] : style === 'ovals' ? [9.5 * sc, 21] : [10 * sc, 15.5]; s = `<rect x="${f1(x - w / 2)}" y="${f1(y - h / 2)}" width="${f1(w)}" height="${h}" rx="${f1(w / 2)}" fill="${ink}"/>`; }
      return `<g class="c-eye c-eye-${side}" style="transform:${eyeSx(gx, side)}"><g class="c-pupil" style="transform:translate(${(gx * R).toFixed(2)}px, ${(gy * R * 0.8).toFixed(2)}px)">${s}</g></g>`;
    };
    return eye(50 - ex, 'l') + eye(50 + ex, 'r');
  }

  // ---------- Accessories: separate items you can put on any bot ----------
  // The real outline of each body, so accessories sit ON the head.
  const _ctx = document.createElement('canvas').getContext('2d');
  const _paths = {};
  const INSIDE = {};
  Object.keys(WB).forEach((k) => { _paths[k] = shapeDs(k).map((d) => new Path2D(d)); INSIDE[k] = (x, y) => _paths[k].some((p) => _ctx.isPointInPath(p, x, y)); });
  const geoCache = {};
  function geo(shape) {
    if (geoCache[shape]) return geoCache[shape];
    const inside = INSIDE[shape] || INSIDE.orb;
    const half = (y) => { if (!inside(50, y)) return 0; let lo = 0, hi = 50; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (inside(50 + m, y)) lo = m; else hi = m; } return lo; };
    let top = 0; while (top < 100 && !inside(50, top)) top += 0.25;
    let bottom = 100; while (bottom > 0 && !inside(50, bottom)) bottom -= 0.25;
    const [cx, cy] = CENTER[shape] || CENTER.orb;
    // point on the outline in direction `deg` from the centre (0 = right, -90 = up)
    const edge = (deg, inset = 0) => { const a = (deg * Math.PI) / 180; let lo = 0, hi = 60; for (let i = 0; i < 18; i++) { const m = (lo + hi) / 2; if (inside(cx + Math.cos(a) * m, cy + Math.sin(a) * m)) lo = m; else hi = m; } const r = lo - inset; return [cx + Math.cos(a) * r, cy + Math.sin(a) * r]; };
    const upper = half(top + (bottom - top) * 0.35);
    return (geoCache[shape] = { half, top, bottom, edge, upper, cx, cy });
  }
  // Each hat: its half-width at the base (in its own drawing), how wide it should be compared with the head,
  // and how far down it goes (1 = pulled down until it's as wide as the head there).
  const HATFIT = {
    tophat: [23, 0.78, 0.8], crown: [19, 0.66, 0.86], beanie: [24, 0.97, 0.97], cap: [20, 0.84, 0.93], party: [13, 0.44, 0.8],
    wizard: [26, 0.82, 0.82], chef: [15, 0.62, 0.86], cowboy: [15, 0.52, 0.9],
  };
  // How each bot wears things — a little tilt and shift so it looks worn, not pasted on. [rotate°, shift x, extra scale]
  const WEAR = {
    orb: { _: [-4, -1, 1], party: [8, 2, 1], cap: [-2, -1, 1], cowboy: [-2, 0, 1.03], chef: [-3, 0, 1] },
    pebble: { _: [0, 0, 1.02], cowboy: [0, 0, 1.05], tophat: [-3, -2, 1], party: [-6, -3, 1], wizard: [5, 2, 1] },
    blob: { _: [4, 1, 1], crown: [5, 2, 1], cap: [3, 1, 1], cowboy: [2, 1, 1.03] },
    capsule: { _: [-3, -1, 1.1], beanie: [0, 0, 1.06], party: [6, 1, 1.08], cowboy: [-1, 0, 1.08] },
    bean: { _: [5, 3, 1], beanie: [2, 1, 1], cowboy: [2, 1, 1.05], chef: [4, 3, 1] },
    bun: { _: [0, 0, 1], tophat: [-4, -1, 1.02], crown: [0, 0, 1.02], party: [8, 2, 1.02], wizard: [-5, -1, 1.02], chef: [-2, 0, 1.02], cap: [4, 1, 1.02] },
  };
  const wearOf = (shape, acc) => (WEAR[shape] && (WEAR[shape][acc] || WEAR[shape]._)) || [0, 0, 1];
  function hatPlace(shape, acc) {
    const G = geo(shape), [bw, frac, sink] = HATFIT[acc] || [20, 0.6, 0.85];
    const target = G.upper * frac, s = target / bw;
    let y = G.top; while (y < G.bottom && G.half(y) < target * sink) y += 0.25;
    y = Math.min(y + (acc === 'beanie' ? 1.5 : 0.5), (GEO[shape] || GEO.orb).eyeY - (acc === 'beanie' ? 11 + 8 * s : 12.5)); // never over the eyes
    return { x: 50, y, s };
  }
  const FACEWEAR = new Set(['shades', 'glasses']); // move with the face
  const ACCESSORIES = [
    { id: 'none', name: 'None' },
    { id: 'tophat', name: 'Top hat' }, { id: 'crown', name: 'Crown' }, { id: 'beanie', name: 'Beanie' }, { id: 'cap', name: 'Cap' },
    { id: 'party', name: 'Party hat' }, { id: 'wizard', name: 'Wizard hat' }, { id: 'chef', name: 'Chef hat' }, { id: 'cowboy', name: 'Cowboy hat' },
    { id: 'halo', name: 'Halo' }, { id: 'bunny', name: 'Bunny ears' }, { id: 'headbow', name: 'Hair bow' }, { id: 'flower', name: 'Flower' },
    { id: 'headphones', name: 'Headphones' }, { id: 'shades', name: 'Sunglasses' }, { id: 'glasses', name: 'Glasses' }, { id: 'bowtie', name: 'Bow tie' },
  ];
  // Accessory colours: light (top right) → colour → shadow, like the bots. Hand-picked so they stay clean.
  const PAL = {
    ink: ['#4A4A58', '#2A2A33', '#121217'], cream: ['#FFFFFF', '#F7F2EA', '#D9CFBF'], gold: ['#FFE9A8', '#FFC93C', '#E39A12'],
    brown: ['#D8A06A', '#B87A40', '#7C4A22'], dkbrown: ['#7A4A2A', '#4F2D17', '#2E1809'], red: ['#FF9486', '#EE4B3E', '#B2281F'],
    blue: ['#9DBBFF', '#4F7DFF', '#2A47C4'], indigo: ['#A99BFF', '#5B4BEA', '#33269F'], green: ['#93E8AE', '#32C06E', '#198548'],
    pink: ['#FFB8D3', '#FF6FA3', '#D2336F'], orange: ['#FFC48F', '#FF8A2B', '#C94F08'],
  };
  // The accent colour of an accessory is picked to stand out from the bot wearing it (orange on a blue bot, blue on an orange one…).
  const PH = { orange: 26, blue: 222, pink: 335, green: 145 };
  function accentFor(hex) {
    const [h, s] = toHsl(hex);
    if (s < 0.18) return 'orange';
    const dist = (a, b) => { const d = Math.abs(a - b) % 360; return d > 180 ? 360 - d : d; };
    return ['orange', 'blue', 'pink', 'green'].find((n) => dist(h, PH[n]) > 55) || 'blue';
  }
  // closed polygon with rounded corners (per-point radius optional as p[2])
  const rpoly = (pts, r = 2) => {
    const n = pts.length; let d = '';
    pts.forEach((p, i) => {
      const a = pts[(i + n - 1) % n], b = pts[(i + 1) % n], rad = p[2] == null ? r : p[2];
      const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]), ra = Math.min(rad, la / 2), rb = Math.min(rad, lb / 2);
      d += `${i ? 'L' : 'M'}${f1(p[0] + ((a[0] - p[0]) / la) * ra)} ${f1(p[1] + ((a[1] - p[1]) / la) * ra)}Q${p[0]} ${p[1]} ${f1(p[0] + ((b[0] - p[0]) / lb) * rb)} ${f1(p[1] + ((b[1] - p[1]) / lb) * rb)}`;
    });
    return d + 'Z';
  };
  const starD = (x, y, r) => `M${x} ${f1(y - r)}Q${f1(x + r * 0.16)} ${f1(y - r * 0.16)} ${f1(x + r)} ${y}Q${f1(x + r * 0.16)} ${f1(y + r * 0.16)} ${x} ${f1(y + r)}Q${f1(x - r * 0.16)} ${f1(y + r * 0.16)} ${f1(x - r)} ${y}Q${f1(x - r * 0.16)} ${f1(y - r * 0.16)} ${x} ${f1(y - r)}Z`;
  const O = (o = '50% 100%') => `style="transform-box:fill-box;transform-origin:${o}"`; // pivot for an animated part
  const HID = (o = '50% 50%') => `style="opacity:0;transform-box:fill-box;transform-origin:${o}"`; // hidden effect, shown by its move
  const sp = (x, y, r, fill = '#fff') => `<path class="sp" d="${starD(x, y, r)}" fill="${fill}" ${HID()}/>`; // sparkle

  /** The accessory as { back, front } SVG: `back` goes behind the body (ears), `front` on top. `bot` = body colour (accents adapt to it). */
  function accSvg(acc, shape, eyeY, uidBase, bot, picker) {
    const none = { back: '', front: '' };
    if (!acc || acc === 'none') return none;
    bot = okHex(bot);
    const id = uidBase + 'a', G = geo(shape), ex = EX[shape] || 13;
    const ac = accentFor(bot), neu = lumOf(bot) < 120 ? 'cream' : 'ink';
    const gd = (n, pal, box) => {
      const [a, b, c] = PAL[pal];
      const co = box ? `gradientUnits="userSpaceOnUse" x1="${box[0]}" y1="${box[1]}" x2="${box[2]}" y2="${box[3]}"` : 'x1="1" y1="0" x2="0" y2="1"';
      return `<linearGradient id="${id}${n}" ${co}><stop offset="0" stop-color="${a}"/><stop offset=".55" stop-color="${b}"/><stop offset="1" stop-color="${c}"/></linearGradient>`;
    };
    const u = (n) => `url(#${id}${n})`;
    const shadowDef = `<radialGradient id="${id}sh"><stop offset="0" stop-color="#000" stop-opacity=".26"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
    const P = HATFIT[acc] ? hatPlace(shape, acc) : null;
    const [rot, dx, ks] = wearOf(shape, acc);
    // a soft shadow where the hat touches the head makes it look worn
    const touch = (hw) => (picker || !P ? '' : `<ellipse class="ts" cx="${f1(P.x + dx)}" cy="${f1(P.y + 2)}" rx="${f1(hw * P.s * ks)}" ry="${f1(4 * P.s)}" fill="url(#${id}sh)" clip-path="url(#${uidBase}k)" transform="rotate(${rot} ${f1(P.x + dx)} ${f1(P.y)})"/>`);
    const hat = (defs, body, fx = '') => ({ back: '', front: `<g class="c-acc c-acc-${acc}"><defs>${defs}${shadowDef}</defs>${touch((HATFIT[acc] || [20])[0])}<g transform="translate(${f1(P.x + dx)} ${f1(P.y)}) rotate(${rot}) scale(${(P.s * ks).toFixed(3)})"><g class="am" ${O()}>${body}</g>${fx}</g></g>` });
    const item = (tf, defs, body, fx = '', pivot = '50% 50%') => ({ back: '', front: `<g class="c-acc c-acc-${acc}"><defs>${defs}</defs><g transform="${tf}"><g class="am" ${O(pivot)}>${body}</g>${fx}</g></g>` });
    switch (acc) {
      case 'tophat': return hat(gd(1, neu) + gd(2, ac),
        `<rect x="-23" y="-3.4" width="46" height="6.8" rx="3.4" fill="${u(1)}"/><path d="M-14 -2V-25Q-14 -28.5 -10.5 -28.5H10.5Q14 -28.5 14 -25V-2Z" fill="${u(1)}"/><rect x="-14" y="-11.5" width="28" height="6.2" fill="${u(2)}"/>`,
        sp(9, -31, 5));
      case 'crown': {
        const cr = rpoly([[-19, 1.5, 3], [-21.5, -17, 2.2], [-10.5, -9.5, 1.6], [0, -24, 2.4], [10.5, -9.5, 1.6], [21.5, -17, 2.2], [19, 1.5, 3]]);
        return hat(gd(1, 'gold') + gd(2, ac) + `<clipPath id="${id}c"><path d="${cr}"/></clipPath>`,
          `<path d="${cr}" fill="${u(1)}"/><rect x="-22" y="-5.2" width="44" height="7" fill="${PAL.gold[2]}" opacity=".4" clip-path="url(#${id}c)"/><g clip-path="url(#${id}c)"><path class="glint" d="M-5 -27H0L-6 3H-11Z" fill="#fff" opacity="0"/></g><circle class="gem" cx="-9" cy="-2.6" r="2" fill="${PAL.cream[0]}" ${O('50% 50%')}/><circle class="gem" cx="0" cy="-2.6" r="2.5" fill="${u(2)}" ${O('50% 50%')}/><circle class="gem" cx="9" cy="-2.6" r="2" fill="${PAL.cream[0]}" ${O('50% 50%')}/>`,
          sp(0, -27, 5));
      }
      case 'beanie': return hat(gd(1, ac) + gd(2, 'cream'),
        `<path d="M-23 -1C-23 -29 23 -29 23 -1Z" fill="${u(1)}"/><rect x="-25" y="-8" width="50" height="11" rx="5" fill="${u(2)}"/><path d="M-17 -6.6V.6M-11 -6.9V.9M-5 -7V1M1 -7V1M7 -7V1M13 -6.9V.9M19 -6.6V.6" stroke="#000" stroke-opacity=".1" stroke-width="1.4" stroke-linecap="round"/><circle class="pom" cx="0" cy="-27.6" r="6" fill="${u(2)}" ${O()}/>`);
      case 'cap': return hat(gd(1, ac),
        `<rect class="pv" x="-35" y="-22" width="70" height="26" fill="none"/><path d="M-20 0C-20 -24 20 -24 20 0Z" fill="${u(1)}"/><path d="M7 -2C17 -6 31 -5.5 35 -.8C35 3 29 4.2 22 4.2L6 3.2Z" fill="${PAL[ac][2]}"/><circle cx="0" cy="-17.6" r="2.3" fill="${PAL[ac][2]}"/><path d="M0 -16.6C-1 -11 -1 -5 0 0" stroke="#000" stroke-opacity=".14" stroke-width="1.3" fill="none"/>`);
      case 'party': {
        const cone = rpoly([[-13, 1, 3], [0, -34, 2.4], [13, 1, 3]]);
        const cols = [ac, 'gold', 'pink', 'blue', 'green', 'orange', 'gold', ac];
        const conf = cols.map((c) => `<g transform="translate(0 -35)"><rect class="cf" x="-1.6" y="-1.6" width="3.2" height="3.2" rx=".8" fill="${PAL[c][1]}" ${HID()}/></g>`).join('');
        return hat(gd(1, ac) + gd(2, 'cream') + `<clipPath id="${id}c"><path d="${cone}"/></clipPath>`,
          `<path d="${cone}" fill="${u(1)}"/><g clip-path="url(#${id}c)" fill="#fff" opacity=".92"><path d="M-14 -7L14 -17V-12.5L-14 -2.5Z"/><path d="M-14 -20L14 -30V-25.5L-14 -15.5Z"/></g><circle class="pom" cx="0" cy="-34.6" r="4.6" fill="${u(2)}" ${O()}/>`, conf);
      }
      case 'wizard': return hat(gd(1, 'indigo') + gd(2, 'gold'),
        `<ellipse cx="0" cy="0" rx="26" ry="5.4" fill="${PAL.indigo[2]}"/><path class="cone" d="M-15 -1C-13.5 -14 -7 -27 3 -37C6 -40 10.5 -38 9.2 -34C7.6 -24 11.5 -12 15 -1Z" fill="${u(1)}" ${O()}/><path d="M-14.4 -5.6Q0 -2 14.4 -5.6L15 -1.4Q0 2.2 -15 -1.4Z" fill="${u(2)}"/><path class="star" d="${starD(-1, -19, 5)}" fill="${PAL.gold[0]}" ${O('50% 50%')}/>`,
        sp(12, -34, 4) + sp(-12, -26, 3.2) + sp(6, -42, 3));
      case 'chef': return hat(gd(1, 'cream', [15, -34, -15, 2]),
        `<rect x="-15" y="-10" width="30" height="11" rx="3.5" fill="${u(1)}"/><g class="puffs" ${O()}><circle cx="-11" cy="-17" r="8.2" fill="${u(1)}"/><circle cx="11" cy="-17" r="8.2" fill="${u(1)}"/><circle cx="0" cy="-23" r="10" fill="${u(1)}"/></g><path d="M-15 -6.5H15" stroke="#000" stroke-opacity=".08" stroke-width="1.2"/>`,
        `<g transform="translate(-7 -33)"><circle class="st" r="3.4" fill="#fff" ${HID()}/></g><g transform="translate(7 -35)"><circle class="st" r="2.8" fill="#fff" ${HID()}/></g>`);
      case 'cowboy': return hat(gd(1, 'brown') + gd(2, 'gold'),
        `<path d="M-15 3.6V-8C-15 -17 -12 -22 -8 -23C-5 -23.6 -3.6 -19.6 0 -19.6C3.6 -19.6 5 -23.6 8 -23C12 -22 15 -17 15 -8V3.6Z" fill="${u(1)}"/><path d="M-15 -8.2H15V-3.8H-15Z" fill="${PAL.dkbrown[1]}"/><rect x="-2.6" y="-8.8" width="5.2" height="5.4" rx="1.4" fill="${u(2)}"/><path d="M-34 -8.5C-32 -1 -22 3.6 0 3.6C22 3.6 32 -1 34 -8.5C35.6 -2 31 7.4 0 7.6C-31 7.4 -35.6 -2 -34 -8.5Z" fill="${PAL.brown[2]}"/><path d="M-34 -8.5C-31 -2.4 -21 .6 0 .6C21 .6 31 -2.4 34 -8.5C32 -1 22 3.6 0 3.6C-22 3.6 -32 -1 -34 -8.5Z" fill="${u(1)}"/>`,
        sp(30, -4, 4.4));
      case 'halo': {
        const s = Math.min(1.2, (G.upper * 0.55) / 20);
        return { back: '', front: `<g class="c-acc c-acc-halo"><defs>${gd(1, 'gold')}</defs><g transform="translate(50 ${f1(G.top - 9)}) scale(${s.toFixed(3)})"><g class="am" ${O('50% 50%')}><ellipse class="glow" cx="0" cy="0" rx="20" ry="5.5" fill="none" stroke="${PAL.gold[0]}" stroke-width="8" opacity=".28" ${O('50% 50%')}/><ellipse cx="0" cy="0" rx="20" ry="5.5" fill="none" stroke="${u(1)}" stroke-width="3.6"/></g>${sp(-10, -4, 3.6)}${sp(11, 3, 3)}</g></g>` };
      }
      case 'bunny': { // long ears coming out from behind its head
        const spread = shape === 'capsule' ? 17 : shape === 'bun' ? 20 : 24;
        const ear = (deg, tilt, cls) => { const [x, y] = G.edge(deg, 5); return `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${tilt})"><g class="am ${cls}" ${O()}><rect x="-7.5" y="-37" width="15" height="40" rx="7.5" fill="${u(1)}"/><rect x="-3.6" y="-31" width="7.2" height="27" rx="3.6" fill="${u(2)}"/></g></g>`; };
        return { back: `<g class="c-acc c-acc-bunny"><defs>${gd(1, 'cream')}${gd(2, 'pink')}</defs>${ear(-90 - spread, -9, 'am-l')}${ear(-90 + spread, 9, 'am-r')}</g>`, front: '' };
      }
      case 'headbow': {
        const [bx, by] = G.edge(shape === 'bun' ? -34 : shape === 'capsule' ? -62 : -52, 2), k = shape === 'capsule' ? 1 : 1.15;
        return item(`translate(${f1(bx)} ${f1(by)}) rotate(${shape === 'capsule' ? 28 : 36}) scale(${k})`, gd(1, ac),
          `<path d="M0 0C-5 -9 -17 -10.5 -17.5 -1C-18 8 -6 7.5 0 0Z" fill="${u(1)}"/><path d="M0 0C5 -9 17 -10.5 17.5 -1C18 8 6 7.5 0 0Z" fill="${u(1)}"/><path d="M-1.6 2L-7 12.5L-2.6 11L0 4Z" fill="${PAL[ac][2]}"/><path d="M1.6 2L7 12.5L2.6 11L0 4Z" fill="${PAL[ac][2]}"/><rect x="-3.6" y="-4.2" width="7.2" height="8.4" rx="3" fill="${PAL[ac][2]}"/>`,
          sp(-14, -9, 3.6) + sp(14, -8, 3));
      }
      case 'flower': {
        const [fx, fy] = G.edge(shape === 'bun' ? -148 : shape === 'capsule' ? -118 : -128, 3), k = shape === 'capsule' ? 1 : 1.18;
        const pal = lumOf(bot) > 205 || ac === 'pink' ? 'pink' : 'cream';
        const petals = [0, 72, 144, 216, 288].map((a) => `<circle cx="${f1(Math.sin((a * Math.PI) / 180) * 7.4)}" cy="${f1(-Math.cos((a * Math.PI) / 180) * 7.4)}" r="5.6" fill="${u(1)}"/>`).join('');
        return item(`translate(${f1(fx)} ${f1(fy)}) scale(${k})`, gd(1, pal, [8, -12, -8, 12]) + gd(2, 'gold'),
          `${petals}<circle cx="0" cy="0" r="4.6" fill="${u(2)}"/>`, sp(-11, -11, 3.4) + sp(12, 8, 3));
      }
      case 'headphones': {
        const y = Math.max(G.top + 18, eyeY - 6), w = G.half(y) + 3;
        return item('translate(0 0)', gd(1, neu) + gd(2, ac),
          `<path class="band" d="M${f1(50 - w + 4)} ${f1(y)}C${f1(50 - w + 2)} ${f1(G.top - 13)} ${f1(50 + w - 2)} ${f1(G.top - 13)} ${f1(50 + w - 4)} ${f1(y)}" stroke="${PAL[ac][1]}" stroke-width="4.6" fill="none" stroke-linecap="round"/><g class="am-l" ${O('50% 50%')}><rect x="${f1(50 - w - 7)}" y="${f1(y - 12)}" width="15.5" height="25" rx="7" fill="${u(1)}"/><rect x="${f1(50 - w - 2.2)}" y="${f1(y - 7.5)}" width="4.6" height="16" rx="2.3" fill="${u(2)}"/></g><g class="am-r" ${O('50% 50%')}><rect x="${f1(50 + w - 8.5)}" y="${f1(y - 12)}" width="15.5" height="25" rx="7" fill="${u(1)}"/><rect x="${f1(50 + w - 6.8)}" y="${f1(y - 7.5)}" width="4.6" height="16" rx="2.3" fill="${u(2)}"/></g>`,
          `<g transform="translate(${f1(50 + w + 2)} ${f1(y - 8)})"><g class="note" ${HID()}><ellipse cx="0" cy="0" rx="2.8" ry="2.1" fill="${PAL[ac][1]}" transform="rotate(-20)"/><path d="M2.4 -.6V-10Q5.6 -9 6 -5.6" stroke="${PAL[ac][1]}" stroke-width="1.5" fill="none" stroke-linecap="round"/></g></g><g transform="translate(${f1(50 + w + 6)} ${f1(y - 10)})"><g class="note" ${HID()}><ellipse cx="0" cy="0" rx="2.2" ry="1.7" fill="${PAL.gold[1]}" transform="rotate(-20)"/><path d="M1.9 -.5V-8Q4.4 -7.2 4.7 -4.6" stroke="${PAL.gold[1]}" stroke-width="1.3" fill="none" stroke-linecap="round"/></g></g>`);
      }
      case 'shades': {
        const y = eyeY, lw = Math.min(25, 2 * ex - 1.5), lh = 22, x1 = 50 - ex - lw / 2, x2 = 50 + ex - lw / 2;
        return item('translate(0 0)', gd(1, 'ink'),
          `<rect x="${f1(x1)}" y="${f1(y - lh / 2)}" width="${f1(lw)}" height="${lh}" rx="8" fill="${u(1)}"/><rect x="${f1(x2)}" y="${f1(y - lh / 2)}" width="${f1(lw)}" height="${lh}" rx="8" fill="${u(1)}"/><rect x="${f1(x1 - 1.5)}" y="${f1(y - lh / 2 - 1.2)}" width="${f1(x2 + lw - x1 + 3)}" height="3.2" rx="1.6" fill="${PAL.ink[2]}"/><path class="gl" d="M${f1(x1 + 4)} ${f1(y - 6)}h5l-3.6 10h-5Z" fill="#fff" opacity=".34"/><path class="gl" d="M${f1(x2 + 4)} ${f1(y - 6)}h5l-3.6 10h-5Z" fill="#fff" opacity=".34"/>`);
      }
      case 'glasses': {
        const y = eyeY, r = Math.min(12, ex - 1.6);
        return item('translate(0 0)', '',
          `<g fill="none" stroke="${PAL.ink[1]}" stroke-width="2.4" stroke-linecap="round"><circle cx="${f1(50 - ex)}" cy="${y}" r="${f1(r)}" fill="#fff" fill-opacity=".14"/><circle cx="${f1(50 + ex)}" cy="${y}" r="${f1(r)}" fill="#fff" fill-opacity=".14"/><path d="M${f1(50 - ex + r)} ${y - 1}Q50 ${y - 4.5} ${f1(50 + ex - r)} ${y - 1}"/><path d="M${f1(50 - ex - r)} ${y - 1}l-5 -2M${f1(50 + ex + r)} ${y - 1}l5 -2"/></g><path class="gl" d="M${f1(50 - ex - r * 0.55)} ${f1(y - r * 0.55)}q3 -3 6.5 -2.4" stroke="#fff" stroke-opacity=".8" stroke-width="1.8" fill="none" stroke-linecap="round"/>`);
      }
      case 'bowtie': {
        const y = Math.min(G.bottom - 10, eyeY + 25), k = Math.min(1.45, (G.half(y) * 0.95) / 17);
        return item(`translate(50 ${f1(y)}) rotate(${(-wearOf(shape, 'bowtie')[0] * 0.6).toFixed(1)}) scale(${k.toFixed(3)})`, gd(1, ac),
          `<path d="${rpoly([[0, 0, 1], [-15.5, -8.5, 2.6], [-15.5, 8.5, 2.6]])}" fill="${u(1)}"/><path d="${rpoly([[0, 0, 1], [15.5, -8.5, 2.6], [15.5, 8.5, 2.6]])}" fill="${u(1)}"/><rect x="-4.2" y="-5" width="8.4" height="10" rx="3" fill="${PAL[ac][2]}"/>`);
      }
    }
    return none;
  }

  let uid = 0;
  /** Render a character as SVG. opts: { size, state } */
  function characterSvg(ch, opts = {}) {
    ch = ch || makeCharacter('x');
    ch = { ...ch, shape: roundShape(ch.shape), color: okHex(ch.color) };
    const size = opts.size || 36;
    const g = GEO[ch.shape] || GEO.orb, ex = EX[ch.shape] || 13, [, r, t, b] = WB[ch.shape] || WB.orb;
    const [c1, c2, c3] = tones(ch.color);
    const ink = lumOf(ch.color) < 95 ? '#ffffff' : '#1A1008';
    const id = 'c' + ++uid;
    const P = personality(ch);
    const delay = -((hash(ch.color + ch.shape + ch.eyes) % 5000) / 1000).toFixed(2);
    const state = opts.state ? ' is-' + opts.state : '';
    const track = size >= 60 ? ' track' : '';
    const face = FACEWEAR.has(ch.acc);
    const acc = accSvg(ch.acc, ch.shape, g.eyeY, id, ch.color);
    return `<span class="char${state}${track}" data-eyes="${ch.eyes}" data-shape="${ch.shape}" data-color="${ch.color}" data-acc="${ch.acc || ''}" data-uid="${id}" data-gx="${P.gx}" data-gy="${P.gy}" style="width:${size}px;height:${size}px;--blink-delay:${delay}s;rotate:${P.tilt}deg;transform-origin:50% 90%">
      <span class="c-swirl c-swirl-a"></span><span class="c-swirl c-swirl-b"></span>
      <span class="c-sparkles"><i></i><i></i><i></i><i></i><i></i><i></i></span>
      <span class="c-trail c-trail-a"></span><span class="c-trail c-trail-b"></span>
      <span class="c-3d"><span class="c-slab"></span>
      <svg class="c-front" style="overflow:visible" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
        <defs>
          <linearGradient id="${id}g" gradientUnits="userSpaceOnUse" x1="${r}" y1="${t}" x2="${100 - r}" y2="${b}"><stop offset="0" stop-color="${c1}"/><stop offset=".55" stop-color="${c2}"/><stop offset="1" stop-color="${c3}"/></linearGradient>
          <clipPath id="${id}k">${bodyPath(ch.shape, '#000')}</clipPath>
        </defs>
        <ellipse class="c-ground" cx="50" cy="95" rx="32" ry="4.5" fill="#000" opacity=".22"/>
        <g class="c-body"><g class="c-turn">
          ${acc.back}
          ${bodyPath(ch.shape, `url(#${id}g)`)}
          <g class="c-face">
            <g class="c-look" style="transform-origin:50px 54px;transform:${lookT(P.gx, P.gy)}">
              <g class="c-eyes">${eyesSvg(ch.eyes, g.eyeY, ink, ex, P.gx, P.gy)}</g>
              ${face ? acc.front : ''}
            </g>
          </g>
          ${face ? '' : acc.front}
        </g></g>
        <g class="c-dots"><circle cx="80" cy="14" r="4"/><circle cx="90" cy="6" r="2.6"/></g>
        <g class="c-fx"><circle class="c-puff c-puff-l" cx="30" cy="92" r="6.5"/><circle class="c-puff c-puff-r" cx="70" cy="92" r="6.5"/></g>
      </svg>
      </span>
    </span>`;
  }

  // ===========================================================================
  // Animation system
  //  • Eyes: one smooth, spring-driven controller for every character. Every
  //    look, mouse-follow and "working" eye pattern is just a *target*; pupils
  //    always glide there, so they can never teleport.
  //  • Moves (bounce, jump, 3D spin…): queued one at a time per character,
  //    each starting and ending in the idle pose, with ease-in/ease-out.
  //  • Working states (thinking, browsing…): wait for the current move to
  //    finish, then blend in; blend back out when done.
  // ===========================================================================
  const EASE = 'cubic-bezier(.45,.05,.25,1)';
  const SPRING = 'cubic-bezier(.34,1.56,.64,1)';
  const parts = (el) => ({
    d3: el.querySelector('.c-3d'),
    body: el.querySelector('.c-body'),
    turn: el.querySelector('.c-turn'),
    face: el.querySelector('.c-face'),
    eyes: el.querySelector('.c-eyes'),
    eyeL: el.querySelector('.c-eye-l'),
    eyeR: el.querySelector('.c-eye-r'),
    shine: el.querySelector('.c-shine'),
    shade: el.querySelector('.c-shade'),
    puffL: el.querySelector('.c-puff-l'),
    puffR: el.querySelector('.c-puff-r'),
    swirlA: el.querySelector('.c-swirl-a'),
    swirlB: el.querySelector('.c-swirl-b'),
    sparkles: el.querySelector('.c-sparkles'),
    slab: el.querySelector('.c-slab'),
    slabLayers: el.querySelector('.c-slab'),
    trailA: el.querySelector('.c-trail-a'),
    trailB: el.querySelector('.c-trail-b'),
  });

  // Give the character real thickness for 3D moves: a stack of darker silhouettes
  // behind the front, so it looks solid (not paper-thin) when it turns or spins.
  function ensureSlab(el, p) {
    if (!p.slab || p.slab.childElementCount) return;
    const size = el.offsetWidth || 40;
    const layers = size >= 60 ? 26 : 12; // many thin slices side by side read as one smooth solid body
    const depth = Math.max(6, size * 0.34);
    const color = el.dataset.color || '#888';
    const shape = roundShape(el.dataset.shape || 'orb');
    let html = '';
    for (let i = 1; i <= layers; i++) {
      const k = i / layers; // 0 = just behind the face, 1 = the very back
      const sc = 1 - 0.13 * Math.pow(k, 2); // the body narrows toward the back, so the sides look rounded
      html += `<svg viewBox="0 0 100 100" style="transform: translateZ(${(-depth * k).toFixed(2)}px) scale(${sc.toFixed(3)})">${bodyPath(shape, shade(color, -0.05 - 0.2 * Math.sqrt(k)))}</svg>`;
    }
    // The back of him, seen when he turns around: no face, the same gradient a little darker, and the same hat.
    const uidB = 'bk' + (el.dataset.uid || Math.random().toString(36).slice(2, 7));
    const acc = el.dataset.acc || '';
    const [, br, bt, bb] = WB[shape] || WB.orb;
    const [k1, k2, k3] = tones(shade(color, -0.1));
    const A = acc && acc !== 'none' && !FACEWEAR.has(acc) ? accSvg(acc, shape, (GEO[shape] || GEO.orb).eyeY, uidB, color) : { back: '', front: '' };
    const back = `<defs><linearGradient id="${uidB}g" gradientUnits="userSpaceOnUse" x1="${br}" y1="${bt}" x2="${100 - br}" y2="${bb}"><stop offset="0" stop-color="${k1}"/><stop offset=".55" stop-color="${k2}"/><stop offset="1" stop-color="${k3}"/></linearGradient><clipPath id="${uidB}k">${bodyPath(shape, '#000')}</clipPath></defs>${A.back}${bodyPath(shape, `url(#${uidB}g)`)}${A.front}`;
    html += `<svg class="c-back" viewBox="0 0 100 100" style="transform: translateZ(${(-depth - 0.4).toFixed(2)}px) scale(0.87) rotateY(180deg)">${back}</svg>`;
    p.slab.innerHTML = html;
    // turn around the middle of his body, not around his face
    p.d3.style.transformOrigin = `50% 58% ${(-depth / 2).toFixed(1)}px`;
  }
  const anim = (node, frames, duration, easing = EASE) => node && node.animate(frames, { duration, easing });
  // The 3D slab lives outside the SVG, so when the body hops during a spin we move the slab with it
  // (SVG units → pixels), otherwise a dark block would peek out behind the character.
  function mirrorBody(el, p, frames, duration, easing) {
    if (!p.slab) return;
    const k = (el.offsetWidth || 40) / 100;
    anim(p.slab, frames.map((f) => ({ ...f, transform: String(f.transform).replace(/translateY\((-?[\d.]+)px\)/, (_, n) => `translateY(${(+n * k).toFixed(2)}px)`) })), duration, easing);
  }
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ---------- eyes ----------
  const eyeRange = (el) => (el.dataset.eyes === 'wide' ? 3.6 : 2.6);
  // Timed look sequence: pts = [[x, y, offset], …] in -1..1 units; always ends at 0,0.
  function lookSeq(el, pts, duration) {
    el._look = { t0: performance.now(), duration, pts };
  }
  function seqAt(seq, now) {
    const t = Math.min(1, (now - seq.t0) / seq.duration);
    const pts = seq.pts;
    for (let i = 1; i < pts.length; i++) {
      if (t <= pts[i][2]) {
        const a = pts[i - 1], b = pts[i];
        const k = easeInOut((t - a[2]) / Math.max(1e-6, b[2] - a[2]));
        return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
      }
    }
    return [0, 0];
  }
  // Eye patterns while working (x, y in -1..1).
  const PATTERNS = {
    thinking: (s) => [0.7 * Math.sin(s * 0.9), -0.75 + 0.2 * Math.sin(s * 1.7)],
    browsing: (s) => { const p = (s * 0.55) % 1; const x = p < 0.8 ? -0.9 + 1.8 * easeInOut(p / 0.8) : 0.9 - 1.8 * easeInOut((p - 0.8) / 0.2); return [x, 0.15 + 0.1 * Math.sin(s * 0.6)]; },
    reading: (s) => PATTERNS.browsing(s),
    typing: (s) => [0.25 * Math.sin(s * 5), 0.85],
    working: (s) => [0.25 * Math.sin(s * 5), 0.7],
    remembering: (s) => [-0.8 + 0.1 * Math.sin(s * 2), -0.85],
    waiting: (s) => [0, 0.3 * Math.sin(s * 1.2)],
  };
  let mouse = null;
  const stateOf = (el) => (el.className.match(/\bis-(\w+)/) || [])[1] || null;

  function eyeTarget(el, now) {
    if (el._look) {
      if (now - el._look.t0 >= el._look.duration) el._look = null;
      else return seqAt(el._look, now);
    }
    const st = stateOf(el);
    if (st && PATTERNS[st]) {
      const k = Math.min(1, (now - (el._stateT0 || 0)) / 400); // ease into the pattern
      const [x, y] = PATTERNS[st](now / 1000);
      return [x * k, y * k];
    }
    if (mouse && el.classList.contains('track') && !el._playing) {
      const r = el.getBoundingClientRect();
      const dx = mouse.x - (r.left + r.width / 2), dy = mouse.y - (r.top + r.height * 0.52);
      const dist = Math.hypot(dx, dy);
      if (dist < 420 && now - mouse.t < 4000) {
        const k = Math.min(1, dist / 200);
        return [(dx / (dist || 1)) * k, (dy / (dist || 1)) * k];
      }
    }
    if (el.classList.contains('track') && !el._playing) { // idle: a living gaze, drifting to a new spot every few seconds, then back to the middle
      const I = (el._idle ||= { t: now + 800 + Math.random() * 1500, x: 0, y: 0 });
      if (now >= I.t) {
        const away = I.x === 0 && I.y === 0 && Math.random() < 0.7;
        I.x = away ? (Math.random() * 2 - 1) * 0.75 : 0; I.y = away ? (Math.random() * 2 - 1) * 0.45 : 0;
        I.t = now + (away ? 900 + Math.random() * 1600 : 2000 + Math.random() * 3500);
      }
      return [I.x, I.y];
    }
    return [0, 0];
  }

  let last = performance.now();
  let eyeTimer = 0, eyeRaf = 0, calmFor = 0;
  // The eyes only need frames while something moves. Once everything has settled the loop sleeps (a quick check
  // a few times a second) and wakes at once when the mouse moves or a character starts doing something.
  function scheduleEyes(delay) {
    clearTimeout(eyeTimer); cancelAnimationFrame(eyeRaf);
    if (delay) eyeTimer = setTimeout(() => { last = performance.now(); eyeRaf = requestAnimationFrame(eyeLoop); }, delay);
    else eyeRaf = requestAnimationFrame(eyeLoop);
  }
  function wakeEyes() { calmFor = 0; scheduleEyes(0); }
  function eyeLoop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.hidden) return scheduleEyes(500);
    let moving = false;
    for (const el of document.querySelectorAll('.char')) {
      const B = (el._base ||= [parseFloat(el.dataset.gx) || 0, parseFloat(el.dataset.gy) || 0]); // this bot's own resting gaze
      const e = (el._eye ||= { x: B[0], y: B[1], vx: 0, vy: 0, px: null });
      let [tx, ty] = eyeTarget(el, now);
      tx = tx >= 0 ? B[0] + tx * (1 - B[0]) : B[0] + tx * (1 + B[0]); // 0 = resting gaze, ±1 = the edges
      ty = ty >= 0 ? B[1] + ty * (1 - B[1]) : B[1] + ty * (1 + B[1]);
      // critically-damped spring → smooth, no overshoot, never jumps
      const k = 170, c = 2 * Math.sqrt(k);
      e.vx += (k * (tx - e.x) - c * e.vx) * dt;
      e.vy += (k * (ty - e.y) - c * e.vy) * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      const R = eyeRange(el);
      const px = `translate(${(e.x * R).toFixed(2)}px, ${(e.y * R * 0.8).toFixed(2)}px)`;
      if (px !== e.px) {
        e.px = px;
        const N = (el._n ||= { pupils: [...el.querySelectorAll('.c-pupil')], look: el.querySelector('.c-look'), l: el.querySelector('.c-eye-l'), r: el.querySelector('.c-eye-r') });
        N.pupils.forEach((n) => (n.style.transform = px));
        // the whole face glides across the body toward where it looks and the far eye narrows, like a face turning
        if (N.look) N.look.style.transform = lookT(e.x, e.y);
        if (N.l) N.l.style.transform = eyeSx(e.x, 'l');
        if (N.r) N.r.style.transform = eyeSx(e.x, 'r');
      }
      if (Math.abs(tx - e.x) > 0.002 || Math.abs(ty - e.y) > 0.002 || Math.abs(e.vx) > 0.01 || Math.abs(e.vy) > 0.01) moving = true;
    }
    if (moving) { calmFor = 0; return scheduleEyes(0); }
    calmFor += dt;
    scheduleEyes(calmFor < 0.8 ? 0 : 250);
  }


  // ---------- 3D helpers ----------
  // Sample a rotateY sweep into keyframes, hiding the face and moving the shine/shade
  // as the character turns, so it reads as a solid 3D object.
  function spinFrames(fromDeg, toDeg, steps, ease = easeInOut) {
    const out = { d3: [], face: [], shine: [], shade: [], slab: [] };
    for (let i = 0; i <= steps; i++) {
      const o = i / steps;
      const deg = fromDeg + (toDeg - fromDeg) * ease(o);
      const rad = (deg * Math.PI) / 180;
      const front = Math.cos(rad) > 0.05;
      out.d3.push({ transform: `rotateY(${deg}deg)`, offset: o });
      out.face.push({ opacity: front ? 1 : 0, transform: `translateX(${(Math.sin(rad) * 7).toFixed(2)}px)`, offset: o });
      out.shine.push({ transform: `translateX(${(-Math.sin(rad) * 22).toFixed(2)}px)`, offset: o });
      out.shade.push({ opacity: (0.18 * Math.abs(Math.sin(rad))).toFixed(3), offset: o });
      out.slab.push({ opacity: (Math.cos(rad) > 0 ? Math.min(1, Math.abs(Math.sin(rad)) * 5) : 1).toFixed(3), offset: o });
    }
    return out;
  }
  function runSpin(p, fromDeg, toDeg, D, steps = 48, el) {
    if (el) ensureSlab(el, p);
    const f = spinFrames(fromDeg, toDeg, steps);
    anim(p.d3, f.d3, D, 'linear');
    anim(p.face, f.face, D, 'linear');
    anim(p.shine, f.shine, D, 'linear');
    anim(p.shade, f.shade, D, 'linear');
    if (p.slabLayers) anim(p.slabLayers, f.slab, D, 'linear');
  }

  // ---------- moves (each starts and ends in the idle pose) ----------
  const ACTIONS = {
    lookAround: { d: 2200, run(el) { lookSeq(el, [[0, 0, 0], [-1, 0, 0.18], [-1, 0, 0.42], [1, -0.4, 0.6], [1, -0.4, 0.84], [0, 0, 1]], 2200); } },
    glance: { d: 1400, run(el) { const a = Math.random() * Math.PI * 2, x = Math.cos(a), y = Math.sin(a) * 0.7; lookSeq(el, [[0, 0, 0], [x, y, 0.22], [x, y, 0.74], [0, 0, 1]], 1400); } },
    bounce: {
      d: 900,
      run(el, p) {
        anim(p.body, [
          { transform: 'translateY(0) scale(1, 1)', offset: 0 },
          { transform: 'translateY(0) scale(1.08, .9)', offset: 0.18 },
          { transform: 'translateY(-16px) scale(.95, 1.07)', offset: 0.45 },
          { transform: 'translateY(0) scale(1.1, .88)', offset: 0.72 },
          { transform: 'translateY(0) scale(.98, 1.02)', offset: 0.86 },
          { transform: 'translateY(0) scale(1, 1)', offset: 1 },
        ], 900, 'ease-in-out');
        lookSeq(el, [[0, 0, 0], [0, -1, 0.35], [0, -1, 0.5], [0, 0.3, 0.75], [0, 0, 1]], 900);
      },
    },
    jump: {
      d: 1150,
      run(el, p) {
        const D = 1150;
        anim(p.body, [
          { transform: 'translateY(0) scale(1, 1)', offset: 0 },
          { transform: 'translateY(2px) scale(1.14, .82)', offset: 0.2, easing: 'cubic-bezier(.2,.9,.3,1)' },
          { transform: 'translateY(-36px) scale(.9, 1.12)', offset: 0.44, easing: 'ease-out' },
          { transform: 'translateY(-40px) scale(1, 1)', offset: 0.54, easing: 'ease-in' },
          { transform: 'translateY(0) scale(1.16, .8)', offset: 0.78, easing: 'ease-out' },
          { transform: 'translateY(0) scale(.96, 1.05)', offset: 0.9 },
          { transform: 'translateY(0) scale(1, 1)', offset: 1 },
        ], D, 'linear');
        anim(p.eyes, [{ transform: 'scaleY(1)', offset: 0 }, { transform: 'scaleY(1)', offset: 0.36 }, { transform: 'scaleY(.3)', offset: 0.44 }, { transform: 'scaleY(.3)', offset: 0.6 }, { transform: 'scaleY(1)', offset: 0.7 }, { transform: 'scaleY(1)', offset: 1 }], D);
        lookSeq(el, [[0, 0, 0], [0, 0.6, 0.18], [0, -1, 0.4], [0, -1, 0.6], [0, 0, 0.85], [0, 0, 1]], D);
        [[p.puffL, -1], [p.puffR, 1]].forEach(([n, d]) => n && n.animate([
          { transform: 'translate(0,0) scale(.4)', opacity: 0, offset: 0 },
          { transform: 'translate(0,0) scale(.4)', opacity: 0, offset: 0.77 },
          { transform: 'translate(0,0) scale(.8)', opacity: 0.8, offset: 0.8 },
          { transform: `translate(${d * 14}px,-4px) scale(1.4)`, opacity: 0, offset: 1 },
        ], { duration: D, easing: 'ease-out' }));
      },
    },
    spinRainbow: {
      d: 1000,
      run(el, p) {
        // Super-fast double 3D spin; a rainbow trail whips around with it like it's
        // spinning so fast it leaves a mini rainbow behind.
        const D = 1000;
        const dir = Math.random() < 0.5 ? 1 : -1;
        runSpin(p, 0, dir * 720, D, 80, el);
        const hopFr = [
          { transform: 'translateY(0px) scale(1, 1)', offset: 0 },
          { transform: 'translateY(2px) scale(1.06, .94)', offset: 0.1 },
          { transform: 'translateY(-12px) scale(1, 1)', offset: 0.4 },
          { transform: 'translateY(-12px) scale(1, 1)', offset: 0.7 },
          { transform: 'translateY(0px) scale(1.08, .92)', offset: 0.9 },
          { transform: 'translateY(0px) scale(1, 1)', offset: 1 },
        ];
        anim(p.body, hopFr, D, 'ease-in-out');
        mirrorBody(el, p, hopFr, D, 'ease-in-out');
        // trails follow the spin angle exactly (same easing), so they move *with* the bot
        const trail = (n, lift, phase, scale, maxOp) => {
          if (!n) return;
          const frames = [];
          for (let i = 0; i <= 40; i++) {
            const o = i / 40;
            const deg = dir * 720 * easeInOut(o) + phase;
            const op = o < 0.12 ? (o / 0.12) * maxOp : o > 0.82 ? ((1 - o) / 0.18) * maxOp : maxOp;
            frames.push({ transform: `translateY(${lift}px) rotateX(74deg) rotateZ(${deg}deg) scale(${scale})`, opacity: op.toFixed(3), offset: o });
          }
          n.animate(frames, { duration: D, easing: 'linear' });
        };
        const size = el.offsetWidth || 40;
        trail(p.trailA, -size * 0.02, 0, 1, 1);
        trail(p.trailB, -size * 0.2, 150, 0.8, 0.8);
        if (p.sparkles) p.sparkles.animate([
          { opacity: 0, transform: 'rotate(0deg) scale(.6)', offset: 0 },
          { opacity: 1, transform: `rotate(${dir * 240}deg) scale(1)`, offset: 0.3 },
          { opacity: 1, transform: `rotate(${dir * 560}deg) scale(1.15)`, offset: 0.75 },
          { opacity: 0, transform: `rotate(${dir * 720}deg) scale(1.5)`, offset: 1 },
        ], { duration: D, easing: 'ease-out' });
      },
    },
    doubleHop: {
      d: 1100,
      run(el, p) {
        const hop = (o, h) => [
          { transform: 'translateY(0) scale(1.06, .93)', offset: o },
          { transform: `translateY(-${h}px) scale(.97, 1.04)`, offset: o + 0.12 },
          { transform: 'translateY(0) scale(1.06, .93)', offset: o + 0.24 },
        ];
        anim(p.body, [{ transform: 'translateY(0) scale(1, 1)', offset: 0 }, ...hop(0.05, 10), ...hop(0.45, 8), { transform: 'translateY(0) scale(1, 1)', offset: 1 }], 1100, 'ease-in-out');
      },
    },
    tilt: {
      d: 1600,
      run(el, p) {
        const d = Math.random() < 0.5 ? -1 : 1;
        anim(p.turn, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${d * 9}deg)`, offset: 0.3 }, { transform: `rotate(${d * 9}deg)`, offset: 0.7 }, { transform: 'rotate(0deg)' }], 1600);
        lookSeq(el, [[0, 0, 0], [d * 0.6, -0.8, 0.3], [d * 0.6, -0.8, 0.7], [0, 0, 1]], 1600);
      },
    },
    doubleBlink: { d: 700, run(el, p) { anim(p.eyes, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.1)', offset: 0.15 }, { transform: 'scaleY(1)', offset: 0.3 }, { transform: 'scaleY(.1)', offset: 0.45 }, { transform: 'scaleY(1)', offset: 0.6 }, { transform: 'scaleY(1)' }], 700); } },
    wiggle: { d: 700, run(el, p) { anim(p.turn, [0, 1, 2, 3, 4, 5, 6].map((i) => ({ transform: `rotate(${i === 0 || i === 6 ? 0 : i % 2 ? 6 : -6}deg)` })), 700, 'ease-in-out'); } },
    // ---- more flat (2D) moves: only sliding, squashing and tilting, nothing that turns in 3D ----
    squish: {
      d: 1100,
      run(el, p) {
        anim(p.body, [
          { transform: 'translateY(0) scale(1, 1)', offset: 0 },
          { transform: 'translateY(3px) scale(1.14, .84)', offset: 0.25 },
          { transform: 'translateY(0) scale(.94, 1.08)', offset: 0.5 },
          { transform: 'translateY(1px) scale(1.05, .96)', offset: 0.72 },
          { transform: 'translateY(0) scale(1, 1)', offset: 1 },
        ], 1100, 'ease-in-out');
        anim(p.eyes, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.35)', offset: 0.25 }, { transform: 'scaleY(1)', offset: 0.5 }, { transform: 'scaleY(1)' }], 1100);
      },
    },
    shimmy: {
      d: 1200,
      run(el, p) {
        const f = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ transform: `translateX(${i === 0 || i === 8 ? 0 : i % 2 ? 7 : -7}px) rotate(${i === 0 || i === 8 ? 0 : i % 2 ? 3 : -3}deg)`, offset: i / 8 }));
        anim(p.body, f, 1200, 'ease-in-out');
        lookSeq(el, [[0, 0, 0], [0.8, -0.3, 0.2], [-0.8, -0.3, 0.5], [0.8, -0.3, 0.75], [0, 0, 1]], 1200);
      },
    },
    peek: {
      d: 1700,
      run(el, p) {
        const d = Math.random() < 0.5 ? -1 : 1;
        anim(p.body, [
          { transform: 'translate(0, 0) scale(1)', offset: 0 },
          { transform: `translate(${d * 10}px, 7px) scale(.9) rotate(${d * 8}deg)`, offset: 0.25 },
          { transform: `translate(${d * 10}px, 7px) scale(.9) rotate(${d * 8}deg)`, offset: 0.6 },
          { transform: 'translate(0, -5px) scale(1.06, 1.1)', offset: 0.8 },
          { transform: 'translate(0, 0) scale(1)', offset: 1 },
        ], 1700, 'ease-in-out');
        lookSeq(el, [[0, 0, 0], [-d, 0.2, 0.25], [-d, 0.2, 0.6], [0, -0.6, 0.8], [0, 0, 1]], 1700);
      },
    },
    nod: {
      d: 1000,
      run(el, p) {
        const dip = (o) => [{ transform: 'translateY(0) scaleY(1)', offset: o }, { transform: 'translateY(4px) scaleY(.94)', offset: o + 0.12 }, { transform: 'translateY(0) scaleY(1)', offset: o + 0.24 }];
        anim(p.body, [{ transform: 'translateY(0) scaleY(1)', offset: 0 }, ...dip(0.1), ...dip(0.45), { transform: 'translateY(0) scaleY(1)', offset: 1 }], 1000, 'ease-in-out');
        lookSeq(el, [[0, 0, 0], [0, 0.7, 0.2], [0, 0, 0.35], [0, 0.7, 0.55], [0, 0, 1]], 1000);
      },
    },
    happyHops: {
      d: 1500,
      run(el, p) {
        const hop = (o, h, w) => [
          { transform: 'translateY(0) scale(1.08, .92)', offset: o, easing: 'ease-out' },
          { transform: `translateY(-${h}px) scale(.96, 1.06)`, offset: o + w / 2, easing: 'ease-in' },
          { transform: 'translateY(0) scale(1.08, .92)', offset: o + w },
        ];
        anim(p.body, [{ transform: 'translateY(0) scale(1, 1)', offset: 0 }, ...hop(0.04, 18, 0.32), ...hop(0.36, 11, 0.28), ...hop(0.64, 6, 0.24), { transform: 'translateY(0) scale(1, 1)', offset: 1 }], 1500, 'linear');
        anim(p.eyes, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.3)', offset: 0.1 }, { transform: 'scaleY(.3)', offset: 0.85 }, { transform: 'scaleY(1)' }], 1500);
      },
    },
    stretch: {
      d: 1800,
      run(el, p) {
        anim(p.body, [
          { transform: 'translateY(0) scale(1, 1)', offset: 0 },
          { transform: 'translateY(3px) scale(1.1, .88)', offset: 0.25 },
          { transform: 'translateY(-5px) scale(.9, 1.2)', offset: 0.5 },
          { transform: 'translateY(-5px) scale(.9, 1.2)', offset: 0.68 },
          { transform: 'translateY(0) scale(1.04, .97)', offset: 0.88 },
          { transform: 'translateY(0) scale(1, 1)', offset: 1 },
        ], 1800, 'ease-in-out');
        anim(p.eyes, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.2)', offset: 0.4 }, { transform: 'scaleY(.2)', offset: 0.7 }, { transform: 'scaleY(1)' }], 1800);
      },
    },
    sleepy: {
      d: 2600,
      run(el, p) {
        anim(p.body, [
          { transform: 'translateY(0) scale(1, 1)', offset: 0 },
          { transform: 'translateY(4px) scale(1.04, .95)', offset: 0.35 },
          { transform: 'translateY(4px) scale(1.04, .95)', offset: 0.65 },
          { transform: 'translateY(-4px) scale(.96, 1.06)', offset: 0.82 },
          { transform: 'translateY(0) scale(1, 1)', offset: 1 },
        ], 2600, 'ease-in-out');
        anim(p.eyes, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(.25)', offset: 0.35 }, { transform: 'scaleY(.25)', offset: 0.6 }, { transform: 'scaleY(1)', offset: 0.75 }, { transform: 'scaleY(.2)', offset: 0.82 }, { transform: 'scaleY(1)' }], 2600);
        lookSeq(el, [[0, 0, 0], [0, 0.8, 0.3], [0, 0.8, 0.62], [0, -0.3, 0.8], [0, 0, 1]], 2600);
      },
    },
    heartbeat: {
      d: 1300,
      run(el, p) {
        anim(p.body, [
          { transform: 'scale(1)', offset: 0 }, { transform: 'scale(1.09)', offset: 0.15 }, { transform: 'scale(.98)', offset: 0.3 },
          { transform: 'scale(1.09)', offset: 0.45 }, { transform: 'scale(1)', offset: 0.7 }, { transform: 'scale(1)', offset: 1 },
        ], 1300, 'ease-in-out');
      },
    },
    shyTurn: {
      d: 1900,
      run(el, p) {
        const d = Math.random() < 0.5 ? -1 : 1;
        anim(p.turn, [{ transform: 'rotate(0deg)' }, { transform: `rotate(${d * 7}deg)`, offset: 0.25 }, { transform: `rotate(${d * 7}deg)`, offset: 0.7 }, { transform: 'rotate(0deg)' }], 1900, 'ease-in-out');
        anim(p.body, [{ transform: 'translate(0,0) scale(1)' }, { transform: `translate(${-d * 5}px, 3px) scale(.94)`, offset: 0.3 }, { transform: `translate(${-d * 5}px, 3px) scale(.94)`, offset: 0.7 }, { transform: 'translate(0,0) scale(1)' }], 1900, 'ease-in-out');
        lookSeq(el, [[0, 0, 0], [d, 0.6, 0.25], [d, 0.6, 0.7], [0, 0, 1]], 1900);
      },
    },
    waddle: { // a little waddling walk on the spot
      d: 2000,
      run(el, p) {
        const n = 6, rot = [], hop = [], d = Math.random() < 0.5 ? -1 : 1;
        for (let i = 0; i <= n; i++) {
          const o = i / n, ends = i === 0 || i === n, s = ends ? 0 : i % 2 ? 1 : -1;
          rot.push({ transform: `rotate(${s * 5}deg)`, offset: o });
          hop.push({ transform: `translate(${s * 2.5}px, ${ends ? 0 : -2.5}px)`, offset: o });
        }
        anim(p.turn, rot, 2000, 'ease-in-out');
        anim(p.body, hop, 2000, 'ease-in-out');
        lookSeq(el, [[0, 0, 0], [d * 0.8, 0, 0.15], [d * 0.8, 0, 0.85], [0, 0, 1]], 2000);
      },
    },
  };

  // ---------- accessory moves: every accessory does its own little trick ----------
  // Each one animates parts of its own drawing (.am = the whole item, plus .sp sparkles, .cf confetti …) together with a
  // matching move of the body and the eyes. They start and end at rest, like every other move.
  const fx = (n, frames, D, o = {}) => n && n.animate(frames, { duration: D, easing: EASE, fill: 'backwards', ...o });
  const twinkle = (n, delay = 0, D = 700) => fx(n, [{ opacity: 0, transform: 'scale(.2) rotate(0deg)' }, { opacity: 1, transform: 'scale(1.15) rotate(55deg)', offset: 0.45 }, { opacity: 0, transform: 'scale(.2) rotate(110deg)' }], D, { delay });
  const REST = 'translateY(0) scale(1, 1)';
  const bodyKf = (p, D, frames) => anim(p.body, frames.map(([o, t]) => ({ transform: t, offset: o })), D, 'ease-in-out');
  const bow = (amt, a, b) => [[0, REST], [a, `translateY(${amt}px) scale(1.03, .96)`], [b, `translateY(${amt}px) scale(1.03, .96)`], [Math.min(1, b + 0.25), REST], [1, REST]];
  const MOVES = {
    cowboy: [1900, (el, p, q) => { // tips the hat
      bodyKf(p, 1900, bow(3, 0.38, 0.62));
      fx(q('.am'), [{ transform: 'translate(0, 0) rotate(0deg)' }, { transform: 'translate(0, -1.5px) rotate(-5deg)', offset: 0.18 }, { transform: 'translate(2px, 3px) rotate(13deg)', offset: 0.38 }, { transform: 'translate(2px, 3px) rotate(13deg)', offset: 0.64 }, { transform: 'translate(0, -1px) rotate(-3deg)', offset: 0.84 }, { transform: 'translate(0, 0) rotate(0deg)' }], 1900);
      twinkle(q('.sp'), 820);
      lookSeq(el, [[0, 0, 0], [0.3, 0.5, 0.3], [0.3, 0.5, 0.65], [0, 0, 1]], 1900);
    }],
    tophat: [2000, (el, p, q) => { // lifts the hat off, bows, puts it back
      bodyKf(p, 2000, bow(4, 0.34, 0.62));
      fx(q('.am'), [{ transform: 'translate(0, 0) rotate(0deg)' }, { transform: 'translate(0, 2px) rotate(0deg)', offset: 0.14 }, { transform: 'translate(-3px, -17px) rotate(-14deg)', offset: 0.36, easing: 'ease-out' }, { transform: 'translate(-3px, -17px) rotate(-14deg)', offset: 0.64 }, { transform: 'translate(0, 1px) rotate(0deg)', offset: 0.84, easing: 'ease-in' }, { transform: 'translate(0, -1px) rotate(0deg)', offset: 0.92 }, { transform: 'translate(0, 0) rotate(0deg)' }], 2000);
      twinkle(q('.sp'), 700);
      fx(q('.ts'), [{ opacity: 1 }, { opacity: 0, offset: 0.3 }, { opacity: 0, offset: 0.7 }, { opacity: 1 }], 2000);
      lookSeq(el, [[0, 0, 0], [0, 0.7, 0.3], [0, 0.7, 0.62], [0, -0.3, 0.8], [0, 0, 1]], 2000);
    }],
    crown: [1800, (el, p, q, qa) => { // a shine sweeps over it and the gems twinkle
      fx(q('.am'), [{ transform: 'translateY(0)' }, { transform: 'translateY(-3px)', offset: 0.25 }, { transform: 'translateY(0)', offset: 0.5 }, { transform: 'translateY(-1.5px)', offset: 0.7 }, { transform: 'translateY(0)' }], 1800);
      fx(q('.glint'), [{ opacity: 0, transform: 'translateX(0)' }, { opacity: 0.75, transform: 'translateX(8px)', offset: 0.15 }, { opacity: 0.75, transform: 'translateX(26px)', offset: 0.7 }, { opacity: 0, transform: 'translateX(34px)' }], 1100, { delay: 250 });
      qa('.gem').forEach((g, i) => fx(g, [{ transform: 'scale(1)' }, { transform: 'scale(1.7)', offset: 0.4 }, { transform: 'scale(1)' }], 600, { delay: 450 + i * 160 }));
      twinkle(q('.sp'), 600);
      bodyKf(p, 1800, [[0, REST], [0.25, 'translateY(-3px) scale(.98, 1.03)'], [0.5, REST], [1, REST]]);
      lookSeq(el, [[0, 0, 0], [0, -0.8, 0.3], [0, -0.8, 0.6], [0, 0, 1]], 1800);
    }],
    beanie: [1700, (el, p, q) => { // hops, and the pom-pom swings
      bodyKf(p, 1700, [[0, REST], [0.12, 'translateY(1px) scale(1.05, .93)'], [0.28, 'translateY(-9px) scale(.96, 1.06)'], [0.46, 'translateY(0) scale(1.07, .9)'], [0.6, 'translateY(-5px) scale(.98, 1.03)'], [0.76, 'translateY(0) scale(1.04, .95)'], [1, REST]]);
      fx(q('.pom'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-24deg)', offset: 0.2 }, { transform: 'rotate(20deg)', offset: 0.4 }, { transform: 'rotate(-13deg)', offset: 0.58 }, { transform: 'rotate(7deg)', offset: 0.78 }, { transform: 'rotate(0deg)' }], 1700);
      fx(q('.am'), [{ transform: 'translateY(0) scale(1, 1)' }, { transform: 'translateY(2px) scale(1.03, .95)', offset: 0.46 }, { transform: 'translateY(-1px) scale(.99, 1.02)', offset: 0.62 }, { transform: 'translateY(0) scale(1, 1)' }], 1700);
      lookSeq(el, [[0, 0, 0], [0, -0.7, 0.25], [0, 0.2, 0.5], [0, 0, 1]], 1700);
    }],
    cap: [1700, (el, p, q) => { // flips the cap around, then back
      const kf = [{ transform: 'scaleX(1)', offset: 0 }];
      const half = (sign, a, b) => { for (let i = 0; i <= 8; i++) { const o = i / 8, ang = o * Math.PI; kf.push({ transform: `translateY(${(-Math.sin(ang) * 7).toFixed(2)}px) scaleX(${(sign * Math.cos(ang)).toFixed(3)})`, offset: a + (b - a) * o }); } };
      half(1, 0.04, 0.34); kf.push({ transform: 'translateY(0) scaleX(-1)', offset: 0.7 }); half(-1, 0.7, 0.96); kf.push({ transform: 'scaleX(1)', offset: 1 });
      fx(q('.am'), kf, 1700, { easing: 'linear' });
      bodyKf(p, 1700, [[0, REST], [0.12, 'translateY(1px) scale(1.04, .95)'], [0.22, 'translateY(-4px) scale(.97, 1.04)'], [0.34, REST], [0.7, REST], [0.82, 'translateY(-4px) scale(.97, 1.04)'], [0.94, REST], [1, REST]]);
      lookSeq(el, [[0, 0, 0], [0.5, -0.2, 0.3], [0.5, -0.2, 0.7], [0, 0, 1]], 1700);
    }],
    party: [1900, (el, p, q, qa) => { // pop: it shakes and throws confetti
      bodyKf(p, 1900, [[0, REST], [0.1, 'translateY(1px) scale(1.06, .92)'], [0.24, 'translateY(-14px) scale(.94, 1.1)'], [0.42, 'translateY(0) scale(1.08, .9)'], [0.56, REST], [1, REST]]);
      fx(q('.am'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-9deg)', offset: 0.12 }, { transform: 'rotate(8deg)', offset: 0.26 }, { transform: 'rotate(-5deg)', offset: 0.4 }, { transform: 'rotate(3deg)', offset: 0.55 }, { transform: 'rotate(0deg)', offset: 0.7 }, { transform: 'rotate(0deg)' }], 1900);
      qa('.cf').forEach((c, i) => {
        const a = ((-150 + i * 17.1) * Math.PI) / 180, v = 20 + (i % 3) * 8, dx = Math.cos(a) * v * 1.3, dy = Math.sin(a) * v;
        fx(c, [{ opacity: 0, transform: 'translate(0, 0) scale(.5) rotate(0deg)' }, { opacity: 1, transform: `translate(${(dx * 0.2).toFixed(1)}px, ${(dy * 0.2).toFixed(1)}px) scale(.8) rotate(40deg)`, offset: 0.08 }, { opacity: 1, transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(1) rotate(${180 + i * 40}deg)`, offset: 0.45 }, { opacity: 0, transform: `translate(${(dx * 1.25).toFixed(1)}px, ${(dy + 30).toFixed(1)}px) scale(.8) rotate(${360 + i * 50}deg)` }], 1000, { delay: 330 + i * 25 });
      });
      lookSeq(el, [[0, 0, 0], [0, -0.9, 0.3], [0, -0.9, 0.55], [0, 0, 1]], 1900);
    }],
    wizard: [2000, (el, p, q, qa) => { // the tip sways, the star glows, sparkles pop
      fx(q('.am'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-6deg) translateY(-2px)', offset: 0.22 }, { transform: 'rotate(5deg) translateY(-2px)', offset: 0.45 }, { transform: 'rotate(-3deg)', offset: 0.7 }, { transform: 'rotate(0deg)' }], 2000);
      fx(q('.cone'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(7deg)', offset: 0.3 }, { transform: 'rotate(-6deg)', offset: 0.5 }, { transform: 'rotate(4deg)', offset: 0.7 }, { transform: 'rotate(0deg)' }], 2000);
      fx(q('.star'), [{ transform: 'scale(1) rotate(0deg)' }, { transform: 'scale(1.5) rotate(90deg)', offset: 0.35 }, { transform: 'scale(1) rotate(180deg)', offset: 0.7 }, { transform: 'scale(1) rotate(180deg)' }], 2000);
      qa('.sp').forEach((s, i) => twinkle(s, 450 + i * 300, 800));
      bodyKf(p, 2000, [[0, REST], [0.2, 'translateY(1px) scale(1.02, .98)'], [0.5, REST], [1, REST]]);
      lookSeq(el, [[0, 0, 0], [0.2, -0.9, 0.3], [-0.2, -0.9, 0.55], [0, 0, 1]], 2000);
    }],
    chef: [1700, (el, p, q, qa) => { // the hat puffs up and lets off steam
      fx(q('.puffs'), [{ transform: 'scale(1, 1)' }, { transform: 'scale(1.04, .86)', offset: 0.18 }, { transform: 'scale(.95, 1.2)', offset: 0.4 }, { transform: 'scale(1.03, .96)', offset: 0.6 }, { transform: 'scale(1, 1)' }], 1700);
      fx(q('.am'), [{ transform: 'translateY(0)' }, { transform: 'translateY(1.5px)', offset: 0.18 }, { transform: 'translateY(-2px)', offset: 0.4 }, { transform: 'translateY(0)', offset: 0.65 }, { transform: 'translateY(0)' }], 1700);
      qa('.st').forEach((s, i) => fx(s, [{ opacity: 0, transform: 'translate(0, 0) scale(.6)' }, { opacity: 0.9, transform: `translate(${i ? 2 : -2}px, -6px) scale(.9)`, offset: 0.2 }, { opacity: 0.7, transform: `translate(${i ? 3 : -3}px, -12px) scale(1.1)`, offset: 0.55 }, { opacity: 0, transform: `translate(${i ? 5 : -5}px, -22px) scale(1.5)` }], 1000, { delay: 450 + i * 180 }));
      bodyKf(p, 1700, [[0, REST], [0.2, 'translateY(3px) scale(1.04, .94)'], [0.45, 'translateY(-3px) scale(.97, 1.05)'], [0.7, REST], [1, REST]]);
      lookSeq(el, [[0, 0, 0], [0, -0.8, 0.3], [0, 0, 0.7], [0, 0, 1]], 1700);
    }],
    halo: [2400, (el, p, q, qa) => { // floats and glows
      fx(q('.am'), [{ transform: 'translateY(0)' }, { transform: 'translateY(-5px)', offset: 0.3 }, { transform: 'translateY(0)', offset: 0.55 }, { transform: 'translateY(-3px)', offset: 0.78 }, { transform: 'translateY(0)' }], 2400);
      fx(q('.glow'), [{ opacity: 0.28, transform: 'scale(1)' }, { opacity: 0.75, transform: 'scale(1.1, 1.5)', offset: 0.35 }, { opacity: 0.28, transform: 'scale(1)', offset: 0.7 }, { opacity: 0.28 }], 2400);
      qa('.sp').forEach((s, i) => twinkle(s, 400 + i * 700, 800));
      bodyKf(p, 2400, [[0, REST], [0.3, 'translateY(-1px) scale(.99, 1.01)'], [1, REST]]);
      lookSeq(el, [[0, 0, 0], [0, -0.9, 0.25], [0.5, -0.8, 0.5], [-0.3, -0.8, 0.7], [0, 0, 1]], 2400);
    }],
    bunny: [1900, (el, p, q) => { // one ear flops down, the other twitches, then both perk up
      fx(q('.am-l'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(5deg)', offset: 0.12 }, { transform: 'rotate(-50deg)', offset: 0.34 }, { transform: 'rotate(-50deg)', offset: 0.58 }, { transform: 'rotate(8deg)', offset: 0.76 }, { transform: 'rotate(-3deg)', offset: 0.88 }, { transform: 'rotate(0deg)' }], 1900);
      fx(q('.am-r'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(6deg)', offset: 0.2 }, { transform: 'rotate(-4deg)', offset: 0.4 }, { transform: 'rotate(7deg)', offset: 0.6 }, { transform: 'rotate(-2deg)', offset: 0.8 }, { transform: 'rotate(0deg)' }], 1900);
      bodyKf(p, 1900, [[0, REST], [0.34, 'translateY(0) scale(1.03, .97)'], [0.5, 'translateY(-8px) scale(.96, 1.05)'], [0.66, 'translateY(0) scale(1.06, .93)'], [0.8, REST], [1, REST]]);
      lookSeq(el, [[0, 0, 0], [-0.8, -0.8, 0.3], [-0.8, -0.8, 0.6], [0, 0, 1]], 1900);
    }],
    headbow: [1500, (el, p, q, qa) => { // flutters
      fx(q('.am'), [{ transform: 'scale(1) rotate(0deg)' }, { transform: 'scale(1.2) rotate(-12deg)', offset: 0.25 }, { transform: 'scale(.96) rotate(10deg)', offset: 0.5 }, { transform: 'scale(1.1) rotate(-6deg)', offset: 0.72 }, { transform: 'scale(1) rotate(0deg)' }], 1500);
      qa('.sp').forEach((s, i) => twinkle(s, 300 + i * 260));
      bodyKf(p, 1500, [[0, REST], [0.2, 'translateY(1px) scale(1.04, .95)'], [0.4, 'translateY(-5px) scale(.97, 1.04)'], [0.6, REST], [1, REST]]);
      lookSeq(el, [[0, 0, 0], [0.7, -0.4, 0.3], [0.7, -0.4, 0.6], [0, 0, 1]], 1500);
    }],
    flower: [1900, (el, p, q, qa) => { // spins open
      fx(q('.am'), [{ transform: 'rotate(0deg) scale(1)' }, { transform: 'rotate(-30deg) scale(.88)', offset: 0.15 }, { transform: 'rotate(380deg) scale(1.25)', offset: 0.7 }, { transform: 'rotate(360deg) scale(1)' }], 1900, { easing: 'cubic-bezier(.5,0,.3,1)' });
      qa('.sp').forEach((s, i) => twinkle(s, 800 + i * 250));
      bodyKf(p, 1900, [[0, REST], [0.3, 'translateY(0) scale(1.02, .98)'], [0.7, 'translateY(-3px) scale(.99, 1.02)'], [1, REST]]);
      lookSeq(el, [[0, 0, 0], [-0.7, -0.5, 0.3], [-0.7, -0.5, 0.7], [0, 0, 1]], 1900);
    }],
    headphones: [2400, (el, p, q, qa) => { // bops to the beat, notes float out
      const beat = (n, o) => fx(n, [{ transform: 'scale(1)' }, { transform: 'scale(1.14)', offset: 0.15 }, { transform: 'scale(1)', offset: 0.5 }, { transform: 'scale(1)' }], 600, { delay: o });
      [0, 600, 1200, 1800].forEach((o) => { beat(q('.am-l'), o); beat(q('.am-r'), o); });
      anim(p.turn, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-3deg)', offset: 0.25 }, { transform: 'rotate(3deg)', offset: 0.5 }, { transform: 'rotate(-3deg)', offset: 0.75 }, { transform: 'rotate(0deg)' }], 2400, 'ease-in-out');
      const kf = []; [0, 0.25, 0.5, 0.75].forEach((o) => kf.push([o, REST], [o + 0.04, 'translateY(2.5px) scale(1.03, .96)'], [o + 0.12, REST])); kf.push([1, REST]);
      bodyKf(p, 2400, kf);
      qa('.note').forEach((n, i) => fx(n, [{ opacity: 0, transform: 'translate(0, 0) scale(.6)' }, { opacity: 1, transform: 'translate(5px, -9px) scale(1)', offset: 0.25 }, { opacity: 0, transform: 'translate(11px, -24px) scale(1)' }], 1300, { delay: 300 + i * 700 }));
      lookSeq(el, [[0, 0, 0], [0.4, 0.2, 0.3], [-0.4, 0.2, 0.6], [0, 0, 1]], 2400);
    }],
    shades: [2300, (el, p, q, qa) => { // takes them off — and drops them back on
      fx(q('.am'), [{ transform: 'translateY(0)', opacity: 1 }, { transform: 'translateY(-4px)', opacity: 1, offset: 0.1 }, { transform: 'translateY(-34px)', opacity: 0, offset: 0.24, easing: 'ease-in' }, { transform: 'translateY(-34px)', opacity: 0, offset: 0.46 }, { transform: 'translateY(1.5px)', opacity: 1, offset: 0.62, easing: 'cubic-bezier(.5,0,1,.6)' }, { transform: 'translateY(-3px)', opacity: 1, offset: 0.72 }, { transform: 'translateY(0)', opacity: 1, offset: 0.8 }, { transform: 'translateY(0)', opacity: 1 }], 2300);
      qa('.gl').forEach((g, i) => fx(g, [{ opacity: 0, transform: 'translateX(0)' }, { opacity: 0.9, transform: 'translateX(5px)', offset: 0.3 }, { opacity: 0, transform: 'translateX(12px)' }], 600, { delay: 1850 + i * 80 }));
      bodyKf(p, 2300, [[0, REST], [0.6, REST], [0.66, 'translateY(3px) scale(1.04, .95)'], [0.8, REST], [1, REST]]);
      lookSeq(el, [[0, 0, 0], [0, -0.8, 0.12], [0, 0.2, 0.45], [0, 0, 0.7], [0, 0, 1]], 2300);
    }],
    glasses: [1800, (el, p, q, qa) => { // pushes them up its nose, a glint
      fx(q('.am'), [{ transform: 'translateY(0) rotate(0deg)' }, { transform: 'translateY(-2.6px) rotate(-3deg)', offset: 0.2 }, { transform: 'translateY(-2.6px) rotate(-3deg)', offset: 0.5 }, { transform: 'translateY(.6px) rotate(0deg)', offset: 0.68 }, { transform: 'translateY(0) rotate(0deg)' }], 1800);
      qa('.gl').forEach((g) => fx(g, [{ opacity: 0, transform: 'translateX(0)' }, { opacity: 1, transform: 'translateX(4px)', offset: 0.4 }, { opacity: 0, transform: 'translateX(9px)' }], 700, { delay: 900 }));
      anim(p.eyes, [{ transform: 'scaleY(1)' }, { transform: 'scaleY(1)', offset: 0.55 }, { transform: 'scaleY(.1)', offset: 0.62 }, { transform: 'scaleY(1)', offset: 0.7 }, { transform: 'scaleY(1)' }], 1800);
      lookSeq(el, [[0, 0, 0], [0, 0.4, 0.2], [0, 0.4, 0.5], [0, 0, 0.8], [0, 0, 1]], 1800);
    }],
    bowtie: [1500, (el, p, q) => { // spins like a propeller
      const f = [{ transform: 'scaleX(1)', offset: 0 }];
      for (let i = 0; i <= 12; i++) { const o = i / 12; f.push({ transform: `scaleX(${Math.cos(o * Math.PI * 2).toFixed(3)})`, offset: 0.12 + 0.62 * o }); }
      f.push({ transform: 'scaleX(1)', offset: 1 });
      fx(q('.am'), f, 1500, { easing: 'linear' });
      bodyKf(p, 1500, [[0, REST], [0.1, 'translateY(1px) scale(1.04, .95)'], [0.3, 'translateY(-4px) scale(.97, 1.04)'], [0.5, REST], [1, REST]]);
      lookSeq(el, [[0, 0, 0], [0, 0.8, 0.2], [0, 0.8, 0.7], [0, 0, 1]], 1500);
    }],
  };
  Object.entries(MOVES).forEach(([id, [d, fn]]) => {
    ACTIONS['acc_' + id] = { d, run(el, p) { fn(el, p, (s) => el.querySelector('.c-front ' + s), (s) => [...el.querySelectorAll('.c-front ' + s)]); } };
  });
  const IDLE = ['lookAround', 'lookAround', 'glance', 'glance', 'bounce', 'tilt', 'doubleBlink', 'doubleHop', 'wiggle', 'jump', 'squish', 'shimmy', 'peek', 'nod', 'happyHops', 'stretch', 'sleepy', 'heartbeat', 'shyTurn', 'waddle']; // spins only happen when a bot replies

  // ---------- queue ----------
  const isBusy = (el) => !!stateOf(el) || el._wantState !== undefined;
  const GAP = 180; // little rest between queued moves

  function play(el, action) {
    if (!el) return;
    const own = 'acc_' + (el.dataset.acc || '');
    let name = action === 'acc' ? (ACTIONS[own] ? own : null) : action; // 'acc' = this bot's own accessory move
    if (!name) name = ACTIONS[own] && Math.random() < 0.4 ? own : IDLE[Math.floor(Math.random() * IDLE.length)];
    if (!ACTIONS[name]) return;
    wakeEyes();
    if (el._playing) {
      if (!el._queue) el._queue = name; // queue at most one next move
      return;
    }
    if (isBusy(el)) return;
    el._playing = true;
    ACTIONS[name].run(el, parts(el));
    setTimeout(() => finish(el), ACTIONS[name].d + GAP);
  }
  function finish(el) {
    el._playing = false;
    // A working state was requested during the move → blend into it now.
    if (el._wantState !== undefined) {
      const s = el._wantState;
      el._wantState = undefined;
      el._queue = null;
      applyState(el, s);
      return;
    }
    const next = el._queue;
    el._queue = null;
    if (next) play(el, next);
  }

  // ---------- working states ----------
  const ANIMATED = '.c-body, .c-turn, .c-face';
  function applyState(el, state) {
    wakeEyes();
    const cur = stateOf(el);
    if (cur === state) return;
    // freeze the current body pose and ease it back to idle, then start the next loop
    [...el.querySelectorAll(ANIMATED)].forEach((n) => {
      const t = getComputedStyle(n).transform;
      if (t && t !== 'none') n.animate([{ transform: t }, { transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.3,.7,.3,1)' });
    });
    if (cur) el.classList.remove('is-' + cur);
    el._stateT0 = performance.now();
    if (state) {
      const token = (el._stateToken = (el._stateToken || 0) + 1);
      el._wantState = state; // counts as busy while blending in
      setTimeout(() => {
        if (el._stateToken !== token) return;
        el._wantState = undefined;
        el.classList.add('is-' + state);
        el._stateT0 = performance.now();
      }, 280);
    }
  }
  function setState(el, state) {
    if (!el) return;
    state = state || null;
    if (el._playing) { el._wantState = state; return; } // wait for the current move to finish
    if (stateOf(el) === state && el._wantState === undefined) return;
    el._stateToken = (el._stateToken || 0) + 1;
    el._wantState = undefined;
    wakeEyes();
    applyState(el, state);
  }

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  };

  let started = false;
  function startIdle() {
    if (started) return;
    started = true;
    requestAnimationFrame(eyeLoop);
    addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY, t: performance.now() }; if (calmFor > 0.8) wakeEyes(); });
    document.addEventListener('mouseleave', () => (mouse = null));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Every so often, one or two visible idle characters do something.
    setInterval(() => {
      if (document.hidden) return;
      const chars = [...document.querySelectorAll('.char')].filter((c) => !isBusy(c) && !c._playing && visible(c));
      if (!chars.length) return;
      const big = chars.filter((c) => c.offsetWidth >= 60);
      const pool = big.length && Math.random() < 0.6 ? big : chars;
      play(pool[Math.floor(Math.random() * pool.length)]);
      if (chars.length > 3 && Math.random() < 0.3) play(chars[Math.floor(Math.random() * chars.length)]);
    }, 2000);
  }

  // Just the accessory on its own (for pickers). The caller can tighten the viewBox with fitAccessory().
  function accessorySvg(acc, size = 44) {
    if (!acc || acc === 'none') return '';
    const a = accSvg(acc, 'orb', GEO.orb.eyeY, 'ao' + ++uid, '#F2F2F2', true);
    return `<svg class="acc-only" viewBox="0 -30 100 130" width="${size}" height="${size}" aria-hidden="true" style="overflow:visible"><g class="acc-wrap">${a.back}${a.front}</g></svg>`;
  }
  function fitAccessory(svg, pad = 3) {
    try { const b = svg.querySelector('.acc-wrap').getBBox(); const s = Math.max(b.width, b.height) + pad * 2; svg.setAttribute('viewBox', `${(b.x + b.width / 2 - s / 2).toFixed(1)} ${(b.y + b.height / 2 - s / 2).toFixed(1)} ${s.toFixed(1)} ${s.toFixed(1)}`); } catch (_) {}
  }
  window.Characters = { accessorySvg, fitAccessory, ACCESSORIES, makeCharacter, characterSvg, COLORS, play, startIdle, setState, ACTIONS, tones };
})();
