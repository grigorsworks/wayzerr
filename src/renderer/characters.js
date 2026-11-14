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
  // ---------- the face lives on a ball ----------
  // In the reference video the eyes sit on a ball and the whole face turns with it: the eyes slide toward the edge, get
  // squeezed on the way and tilt. Same here. Each eye is a small patch on a sphere, a face pose (yaw, pitch, roll) rotates
  // the sphere, and the eye is drawn through the 2x2 map of its own patch, so the squeeze and the tilt come out right.
  const RAD = Math.PI / 180;
  function rotZXY(yaw, pitch, roll) { // Rz · Rx · Ry (row-major), the order the video was measured in
    const cy = Math.cos(yaw * RAD), sy = Math.sin(yaw * RAD), cx = Math.cos(pitch * RAD), sx = Math.sin(pitch * RAD), cz = Math.cos(roll * RAD), sz = Math.sin(roll * RAD);
    return [cz * cy - sz * sx * sy, -sz * cx, cz * sy + sz * sx * cy, sz * cy + cz * sx * sy, cz * cx, sz * sy - cz * sx * cy, -cx * sy, sx, cx * cy];
  }
  const mul3 = (A, B) => { const r = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) r.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]); return r; };
  const mulV = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  const faceGeoCache = {};
  function faceGeo(shape) {
    if (faceGeoCache[shape]) return faceGeoCache[shape];
    const [l, r] = WB[shape] || WB.orb, [cx, cy] = CENTER[shape] || CENTER.orb, g = GEO[shape] || GEO.orb, ex = EX[shape] || 13, Rf = (r - l) / 2;
    const patch = (x, y) => {
      const px = (x - cx) / Rf, py = (y - cy) / Rf, p = [px, py, Math.sqrt(Math.max(0.05, 1 - px * px - py * py))];
      const d = -p[1]; // up · p, with up = (0, -1, 0)
      let u = [-d * p[0], -1 - d * p[1], -d * p[2]];
      const n = Math.hypot(u[0], u[1], u[2]); u = [u[0] / n, u[1] / n, u[2] / n];
      const e = [p[1] * u[2] - p[2] * u[1], p[2] * u[0] - p[0] * u[2], p[0] * u[1] - p[1] * u[0]]; // right = p x up
      const det = -e[0] * u[1] + u[0] * e[1];
      return { x, y, p, e, u, inv: [-u[1] / det, u[0] / det, -e[1] / det, e[0] / det] };
    };
    const eyes = [patch(50 - ex, g.eyeY), patch(50 + ex, g.eyeY)];
    eyes.forEach((q) => { q.room = eyeRoom(shape, q, 5.5, 9.5); });
    // any other spot on the face (the mouth, the cheeks) with its own room to move in
    const spots = {};
    const at = (x, y, hw, hh) => { const k = x + ',' + y + ',' + hw + ',' + hh; if (!spots[k]) { const q = patch(x, y); q.room = eyeRoom(shape, q, hw, hh); spots[k] = q; } return spots[k]; };
    return (faceGeoCache[shape] = { cx, cy, Rf, eyes, mid: patch(50, g.eyeY), at });
  }
  // How far an eye may travel from its resting spot, in 36 directions, before its edge would leave the body. Short bodies (pebble,
  // bean, capsule) have little room above and below the eyes, so a big look-up or a jump pose used to push the eyes off the face.
  const ROOM_N = 36;
  function eyeRoom(shape, q, hw, hh) {
    const inside = INSIDE[shape] || INSIDE.orb, out = [];
    for (let k = 0; k < ROOM_N; k++) {
      const a = (k / ROOM_N) * 2 * Math.PI, ca = Math.cos(a), sa = Math.sin(a);
      let lo = 0, hi = 60;
      for (let i = 0; i < 12; i++) {
        const m = (lo + hi) / 2, x = q.x + ca * m, y = q.y + sa * m;
        if (inside(x - hw, y - hh) && inside(x + hw, y - hh) && inside(x - hw, y + hh) && inside(x + hw, y + hh) && inside(x, y - hh) && inside(x, y + hh)) lo = m; else hi = m;
      }
      out.push(lo);
    }
    return out;
  }
  // Pull a point that is further from the resting spot than the room allows back inside, smoothly (no sudden stop).
  function keepInside(q, X, Y) {
    const dx = X - q.x, dy = Y - q.y, r = Math.hypot(dx, dy);
    if (r < 0.01) return [X, Y];
    let f = (Math.atan2(dy, dx) / (2 * Math.PI)) * ROOM_N; if (f < 0) f += ROOM_N;
    const i = Math.floor(f) % ROOM_N, u = f - Math.floor(f), rm = q.room[i] * (1 - u) + q.room[(i + 1) % ROOM_N] * u, k0 = 0.7 * rm;
    if (r <= k0) return [X, Y];
    const s = (k0 + (rm - k0) * Math.tanh((r - k0) / Math.max(0.01, rm - k0))) / r;
    return [q.x + dx * s, q.y + dy * s];
  }
  // The SVG matrix that carries an eye (or the face-wear) from the straight-ahead face to a rotated one. su / sv squash the eye
  // along its own width / height (blinks, the video's small round eye next to a big one).
  function patchMap(geo, q, M, su = 1, sv = 1) {
    const P = mulV(M, q.p), E = mulV(M, q.e), U = mulV(M, q.u);
    const a = su * E[0], b = su * E[1], c = -sv * U[0], d = -sv * U[1];
    const m0 = a * q.inv[0] + c * q.inv[2], m1 = a * q.inv[1] + c * q.inv[3], m2 = b * q.inv[0] + d * q.inv[2], m3 = b * q.inv[1] + d * q.inv[3];
    let X = geo.cx + geo.Rf * P[0], Y = geo.cy + geo.Rf * P[1];
    if (q.room) [X, Y] = keepInside(q, X, Y); // an eye never leaves the face
    const tx = X - (m0 * q.x + m1 * q.y), ty = Y - (m2 * q.x + m3 * q.y);
    return { t: `matrix(${m0.toFixed(4)},${m2.toFixed(4)},${m1.toFixed(4)},${m3.toFixed(4)},${tx.toFixed(3)},${ty.toFixed(3)})`, z: P[2] };
  }
  const FACE_ORIGIN = 'transform-box:view-box;transform-origin:0 0;';
  const fade = (z) => Math.max(0, Math.min(1, (z - 0.02) / 0.22)); // eyes fade out as they go round the edge
  // gaze (-1..1 each way) → face pose. Looking sideways leans the head a little the other way, like the reference does.
  const YAW = 36, PITCH = 30;
  const gazeM = (x, y) => { const yaw = x * YAW; return rotZXY(yaw, -y * PITCH, -0.45 * yaw); };

  // Two pill eyes (or happy / sleepy arcs). Pill eyes also carry the happy arc the video's bounce turns them into.
  function eyesSvg(style, y, ink, ex, shape, P) {
    const sc = Math.min(1, ex / 13), geo = faceGeo(shape), M = gazeM(P.gx, P.gy);
    const eye = (x, side, i) => {
      let s;
      if (style === 'happy') s = `<path d="M${f1(x - 6.5 * sc)} ${y + 4}Q${x} ${y - 7.5} ${f1(x + 6.5 * sc)} ${y + 4}" stroke="${ink}" stroke-width="4.6" fill="none" stroke-linecap="round"/>`;
      else if (style === 'sleepy') s = `<path d="M${f1(x - 6.5 * sc)} ${y - 1.5}Q${x} ${y + 7} ${f1(x + 6.5 * sc)} ${y - 1.5}" stroke="${ink}" stroke-width="4.6" fill="none" stroke-linecap="round"/>`;
      else {
        const [w, h] = style === 'wide' ? [15 * sc, 15] : style === 'ovals' ? [9.5 * sc, 21] : [10 * sc, 15.5];
        s = `<rect class="c-pill" x="${f1(x - w / 2)}" y="${f1(y - h / 2)}" width="${f1(w)}" height="${h}" rx="${f1(w / 2)}" fill="${ink}"/>`
          + `<path class="c-arc" d="M${f1(x - 0.71 * w)} ${f1(y + 0.41 * w)}Q${x} ${f1(y - 1.23 * w)} ${f1(x + 0.71 * w)} ${f1(y + 0.41 * w)}" stroke="${ink}" stroke-width="${f1(0.92 * w)}" fill="none" stroke-linecap="round" opacity="0"/>`;
      }
      const m = patchMap(geo, geo.eyes[i], M), o = fade(m.z);
      return `<g class="c-eye c-eye-${side}" style="${FACE_ORIGIN}transform:${m.t}${o < 1 ? ';opacity:' + o.toFixed(2) : ''}"><g class="c-pupil">${s}</g></g>`;
    };
    return eye(50 - ex, 'l', 0) + eye(50 + ex, 'r', 1);
  }
  const wearStyle = (shape, P) => `${FACE_ORIGIN}transform:${patchMap(faceGeo(shape), faceGeo(shape).mid, gazeM(P.gx, P.gy)).t}`;

  // ---------- mouth and cheeks ----------
  // What makes a Wayzerr bot a Wayzerr bot: a mouth and two soft cheeks that sit on the same ball as the eyes (so they turn, squeeze and
  // fade round the edge together with them). The mouth has moods: it smiles wider when the bot is happy, opens when it talks or puffs up,
  // and goes flat while it thinks.
  // Each style: w = half width, u / d = how far the upper / lower lip sits below the corners (negative = above), cl / cr = corner heights.
  const f2 = (n) => +(+n).toFixed(2);
  const MOUTH = {
    smile: { w: 5.4, u: 3.2, d: 3.2 },
    grin: { w: 6.8, u: 1.0, d: 6.2 },
    o: { w: 3.0, u: -2.8, d: 3.0, o: true },
    smirk: { w: 5.4, u: 2.4, d: 2.4, cl: 1.4, cr: -2.0 },
    cat: { w: 6.4, u: 2.4, d: 2.4, cat: true },
    flat: { w: 4.4, u: 0.3, d: 0.3 },
  };
  const MOUTH_AUTO = ['smile', 'grin', 'smile', 'cat', 'smirk', 'o', 'grin', 'smile'];
  const EYE_BOTTOM = { dots: 7.8, ovals: 10.5, wide: 7.5, happy: 6.4, sleepy: 5.2 }; // how far each eye style reaches below the eye line
  /** The mouth a bot has: its own style if one is set ('off' = none), otherwise one picked from its look, so it never changes. */
  function mouthOf(ch) {
    const m = ch.mouth;
    if (m === 'off') return null;
    if (m && MOUTH[m]) return m;
    const list = ch.eyes === 'happy' ? ['smile', 'grin', 'cat', 'smile'] : ch.eyes === 'sleepy' ? ['flat', 'o', 'smile'] : MOUTH_AUTO;
    return list[hash('m' + ch.shape + ch.color + ch.eyes) % list.length];
  }
  /** Which extras a bot has: soft cheeks, unless the look says 'off' (anything else, including the old 'none', means cheeks). */
  function extraOf(ch) {
    return { cheeks: String(ch.extra || '') !== 'off' };
  }
  const WEAR_BOTTOM = { shades: 8.4, glasses: 10.5 }; // sunglasses and glasses reach lower than the eyes behind them
  function faceLayout(shape, eyes, acc) {
    const g = GEO[shape] || GEO.orb, b = (WB[shape] || WB.orb)[3], ex = EX[shape] || 13;
    const my = f1(Math.min(g.eyeY + Math.max(EYE_BOTTOM[eyes] || 7.8, WEAR_BOTTOM[acc] || 0) + 6, b - 19));
    // room = how far the lower lip may drop below the mouth line before it would leave the body (the notch between the feet)
    return { my, cy: f1(my - 1.5), cx: f1(ex + 8), sc: Math.min(1, ex / 13), room: f1(Math.max(3.4, geo(shape).bottom - my - 2.8)) };
  }
  /** The mouth outline for a smile amount s (1 = the style's own, 0 = flat, 1.8 = beaming), an openness o (0..1) and the room below it. */
  function mouthD(style, sc, s, o, room) {
    const B = MOUTH[style] || MOUTH.smile, f = f2, rm = room > 0 ? room : 99;
    s = Math.max(0, Math.min(1.9, s)); o = Math.max(0, Math.min(1, o));
    if (B.cat) { // :3 — two little arcs
      const w = B.w * sc * (1 + 0.1 * (s - 1) + 0.1 * o), a = Math.min(rm, B.u * s + 2.6 * o);
      return `M${f(-w)} 0Q${f(-w / 2)} ${f(2 * a)} 0 0Q${f(w / 2)} ${f(2 * a)} ${f(w)} 0`;
    }
    const sm = B.o ? 1 : s;
    const w = B.o ? B.w * sc * (1 + 0.4 * o) : B.w * sc * (1 + 0.12 * (s - 1) - 0.15 * o);
    const cl = (B.cl || 0) * sm, cr = (B.cr || 0) * sm, mid = (cl + cr) / 2;
    const ad = Math.min(rm, B.d * sm + (B.o ? 3 : 5.4) * o), au = Math.min(ad, B.u * sm - (B.o ? 2 : 1.3) * o);
    return `M${f(-w)} ${f(cl)}Q0 ${f(2 * au - mid)} ${f(w)} ${f(cr)}Q0 ${f(2 * ad - mid)} ${f(-w)} ${f(cl)}Z`;
  }
  // The mouth and the cheeks sit on the ball through small patches (half width, half height, how far below the mouth line the centre is).
  // Keep them small: a taller patch makes the body's edge push the mouth up into the eyes when the bot looks down.
  const MOUTH_PATCH = [6.5, 3.4, 0];
  const CHEEK_PATCH = [5.4, 3.5];
  const fadeCheek = (z) => Math.max(0, Math.min(1, (z - 0.1) / 0.3)); // cheeks are soft, they go before the edge does
  const facePose = (m, fz = fade) => `${FACE_ORIGIN}transform:${m.t}${fz(m.z) < 1 ? ';opacity:' + fz(m.z).toFixed(2) : ''}`;
  function mouthSvg(shape, style, color, ink, L, M) {
    const fg = faceGeo(shape), m = patchMap(fg, fg.at(50, f1(L.my + MOUTH_PATCH[2]), MOUTH_PATCH[0], MOUTH_PATCH[1]), M);
    const cavity = lumOf(color) < 95 ? shade(color, -0.24) : ink; // the inside of an open mouth
    return `<g class="c-mouth" data-style="${style}" data-y="${L.my}" data-sc="${L.sc.toFixed(2)}" data-room="${L.room}" style="${facePose(m)}"><path class="c-mpath" transform="translate(50 ${L.my})" d="${mouthD(style, L.sc, 1, 0, L.room)}" fill="${MOUTH[style].cat ? 'none' : cavity}" stroke="${ink}" stroke-width="2.9" stroke-linecap="round" stroke-linejoin="round"/></g>`;
  }
  function blushOf(color) {
    const [h, s, l] = toHsl(color);
    return s < 0.2 ? { c: '#FF7C98', o: l > 0.5 ? 0.5 : 0.42 } : { c: fromHsl(h - 8, Math.min(1, s + 0.1), Math.max(0.28, l - 0.16)), o: 0.62 };
  }
  function cheeksSvg(shape, color, L, M) {
    const fg = faceGeo(shape), bl = blushOf(color);
    return [-1, 1].map((sd) => {
      const x = f1(50 + sd * L.cx);
      return `<g class="c-cheek" data-x="${x}" data-y="${L.cy}" data-op="${bl.o}" style="${facePose(patchMap(fg, fg.at(x, L.cy, CHEEK_PATCH[0], CHEEK_PATCH[1]), M), fadeCheek)}"><ellipse cx="${x}" cy="${L.cy}" rx="5.4" ry="3.5" fill="${bl.c}" opacity="${bl.o}"/></g>`;
    }).join('');
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
  function accSvg(acc, shape, eyeY, uidBase, bot, picker, eyes) {
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
        // sits under the mouth, as big as the room between the mouth and the bottom edge allows (it may hang a little over the feet, like a bow at the chin)
        const my = faceLayout(shape, eyes).my, top = my + 5.5, kw = (G.half(Math.min(G.bottom - 10, eyeY + 25)) * 0.95) / 17;
        const k = Math.max(0.62, Math.min(1.45, kw, (G.bottom + 4 - top) / 17)), y = Math.min(top + 8.5 * k, G.bottom + 6.5);
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
    const acc = accSvg(ch.acc, ch.shape, g.eyeY, id, ch.color, false, ch.eyes);
    const mouth = mouthOf(ch), ext = extraOf(ch), L = faceLayout(ch.shape, ch.eyes, ch.acc), M0 = gazeM(P.gx, P.gy);
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
          ${ch.acc === 'bowtie' ? acc.front : ''}
          <g class="c-face">
            <g class="c-look">
              ${ext.cheeks ? cheeksSvg(ch.shape, ch.color, L, M0) : ''}
              <g class="c-eyes">${eyesSvg(ch.eyes, g.eyeY, ink, ex, ch.shape, P)}</g>
              ${mouth ? mouthSvg(ch.shape, mouth, ch.color, ink, L, M0) : ''}
              ${face ?`<g class="c-wear" style="${wearStyle(ch.shape, P)}">${acc.front}</g>` : ''}
            </g>
          </g>
          ${face || ch.acc === 'bowtie' ? '' : acc.front}
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
    const A = acc && acc !== 'none' && !FACEWEAR.has(acc) ? accSvg(acc, shape, (GEO[shape] || GEO.orb).eyeY, uidB, color, false, el.dataset.eyes) : { back: '', front: '' };
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
    return [0, 0];
  }

  // The mouth's mood for each working state: [smile amount, openness]. 1 = the mouth's own smile, 0 = flat.
  const MOUTH_STATE = {
    thinking: (s) => [0.3, 0.04 + 0.04 * Math.sin(s * 2.1)],
    browsing: () => [0.85, 0.1],
    reading: () => [0.85, 0.1],
    typing: (s) => [0.6, 0.1 + 0.1 * Math.max(0, Math.sin(s * 8))],
    working: (s) => [0.75, 0.2 + 0.14 * Math.sin(s * 3.1)],
    remembering: () => [1.5, 0],
    waiting: () => [0.95, 0],
    talking: (s) => [1.1, Math.max(0, Math.min(1, 0.55 + 0.45 * Math.sin(s * 12) * Math.sin(s * 4.7 + 1.3)))], // irregular, like speech
  };
  const MT = [1, 0];
  function mouthTarget(el, now) {
    let s = 1, o = 0;
    const st = stateOf(el), f = st && MOUTH_STATE[st];
    if (f) { const k = Math.min(1, (now - (el._stateT0 || 0)) / 400), v = f(now / 1000); s = 1 + (v[0] - 1) * k; o = v[1] * k; }
    const h = el._moHold; // a little smile or "oh" the bot makes now and then on its own
    if (h && now < h.until) { s = Math.max(s, h.s); o = Math.max(o, h.o); }
    MT[0] = s; MT[1] = o;
    return MT;
  }

  let last = performance.now();
  let eyeTimer = 0, eyeRaf = 0, calmFor = 0;
  const GRACE = 0.3; // seconds of full-speed frames after the last movement, before the loop goes to sleep
  // The eyes only need frames while something moves. Once everything has settled the loop sleeps (a quick check
  // a few times a second) and wakes at once when the mouse moves or a character starts doing something.
  function scheduleEyes(delay) {
    clearTimeout(eyeTimer); cancelAnimationFrame(eyeRaf);
    if (delay) eyeTimer = setTimeout(() => { last = performance.now(); eyeRaf = requestAnimationFrame(eyeLoop); }, delay);
    else eyeRaf = requestAnimationFrame(eyeLoop);
  }
  function wakeEyes() { calmFor = 0; scheduleEyes(0); }
  // Draw the face for rotation M. S = { su:[l,r], sv:[l,r], hap } are the eye shape tweaks (blink, squash, happy arcs).
  function setFace(el, M, S) {
    const N = el._face === undefined ? (el._face = faceNodes(el)) : el._face;
    if (!N) return;
    for (let i = 0; i < 2; i++) {
      const m = patchMap(N.geo, N.geo.eyes[i], M), st = N.eyes[i].style, o = fade(m.z);
      st.transform = m.t;
      st.opacity = o < 1 ? o.toFixed(2) : '';
      // blinks and squashes change the pill itself (it stays a pill, down to a round dot or a dash), not just its scale
      const pill = N.pills[i];
      if (pill) {
        const su = S ? S.su[i] : 1, sv = S ? S.sv[i] : 1, key = su.toFixed(2) + ',' + sv.toFixed(2);
        if (key !== N.pk[i]) {
          N.pk[i] = key;
          const g = N.pg[i], w = g.w * su, h = g.h * sv;
          pill.setAttribute('x', (g.cx - w / 2).toFixed(2)); pill.setAttribute('y', (g.cy - h / 2).toFixed(2));
          pill.setAttribute('width', w.toFixed(2)); pill.setAttribute('height', h.toFixed(2)); pill.setAttribute('rx', (Math.min(w, h) / 2).toFixed(2));
        }
      }
    }
    if (N.wear) { const m = patchMap(N.geo, N.geo.mid, M); N.wear.style.transform = m.t; const o = fade(m.z); N.wear.style.opacity = o < 1 ? o.toFixed(2) : ''; }
    // the mouth and the cheeks ride on the same ball (their mood is drawn by setMood)
    if (N.mouth) { const m = patchMap(N.geo, N.mouth.q, M), o = fade(m.z); N.mouth.g.style.transform = m.t; N.mouth.g.style.opacity = o < 1 ? o.toFixed(2) : ''; }
    for (const Ck of N.cheeks) { const m = patchMap(N.geo, Ck.q, M), o = fadeCheek(m.z); Ck.g.style.transform = m.t; Ck.g.style.opacity = o < 1 ? o.toFixed(2) : ''; }
    setMood(el);
    const h = S && S.hap >= 0.5 ? 1 : 0; // the pill bends into the happy arc within a frame or two, so it switches, no ghost in between
    if (h !== N.hap) { N.hap = h; N.pills.forEach((n) => (n.style.opacity = h ? '0' : '')); N.arcs.forEach((n) => (n.style.opacity = h ? '1' : '0')); }
  }
  // The mouth's shape and the cheeks' glow from el._mx (smile amount s, openness o). Only touches the page when something shows a difference,
  // and never moves the face, so a bot that just smiles costs one attribute write a frame.
  function setMood(el) {
    const N = el._face === undefined ? (el._face = faceNodes(el)) : el._face;
    if (!N) return;
    const E = el._mx || (el._mx = { s: 1, o: 0, vs: 0, vo: 0 });
    if (N.ls !== undefined && Math.abs(E.s - N.ls) < 0.004 && Math.abs(E.o - N.lo) < 0.004) return; // nothing a viewer could see changed
    N.ls = E.s; N.lo = E.o;
    if (N.mouth) {
      const Mo = N.mouth, key = E.s.toFixed(2) + ',' + E.o.toFixed(2);
      if (key !== Mo.key) { Mo.key = key; Mo.path.setAttribute('d', mouthD(Mo.style, Mo.sc, E.s, E.o, Mo.room)); }
    }
    if (N.cheeks.length) {
      const bright = Math.min(1, Math.max(0, E.s - 1) + 0.5 * E.o).toFixed(2); // cheeks glow when the bot is happy
      for (const Ck of N.cheeks) if (bright !== Ck.key) { Ck.key = bright; Ck.e.setAttribute('opacity', (Ck.op * (1 + 0.45 * bright)).toFixed(2)); }
    }
  }
  function faceNodes(el) {
    const eyes = [el.querySelector('.c-eye-l'), el.querySelector('.c-eye-r')];
    if (!eyes[0] || !eyes[1]) return null;
    const pills = [...el.querySelectorAll('.c-pill')];
    const pg = pills.map((r) => { const x = +r.getAttribute('x'), y = +r.getAttribute('y'), w = +r.getAttribute('width'), h = +r.getAttribute('height'); return { cx: x + w / 2, cy: y + h / 2, w, h }; });
    const shape = el.dataset.shape || 'orb', geo = faceGeo(shape), mg = el.querySelector('.c-mouth');
    return {
      geo, eyes, wear: el.querySelector('.c-wear'), pills, pg, pk: ['', ''], arcs: [...el.querySelectorAll('.c-arc')], hap: 0,
      mouth: mg ? { g: mg, path: mg.firstElementChild, q: geo.at(50, f1(+mg.dataset.y + MOUTH_PATCH[2]), MOUTH_PATCH[0], MOUTH_PATCH[1]), sc: +mg.dataset.sc, room: +mg.dataset.room || 0, style: mg.dataset.style, key: '' } : null,
      cheeks: [...el.querySelectorAll('.c-cheek')].map((g) => ({ g, e: g.firstElementChild, q: geo.at(+g.dataset.x, +g.dataset.y, CHEEK_PATCH[0], CHEEK_PATCH[1]), op: +g.dataset.op, key: '' })),
    };
  }

  // One move of the reference video, played frame by frame (30 per second): the body (up/down, squash), the face turning on
  // the ball and the eyes (blink, squash, happy arcs). Each clip starts and ends at rest. A clip is played on top of the
  // bot's own resting gaze, and half of the plays are mirrored, so two bots never move in step.
  // The bot's own resting gaze (and its rotation); re-read when the look changes in the editor.
  function baseOf(el) {
    const k = el.dataset.gx + ',' + el.dataset.gy;
    if (el._bk !== k) { el._bk = k; el._base = [parseFloat(el.dataset.gx) || 0, parseFloat(el.dataset.gy) || 0]; el._restM = gazeM(el._base[0], el._base[1]); }
    return el._base;
  }
  function stepClip(el, now) {
    const C = el._clip, t = ((now - C.t0) / 1000) * 30, n = C.f.length;
    if (t >= n - 1) { endClip(el); return false; }
    const i = t | 0, u = t - i, A = C.f[i], B = C.f[i + 1], g = (k) => A[k] + (B[k] - A[k]) * u, m = C.m, S = C.S;
    baseOf(el);
    const rest = el._restM;
    const M = mul3(rotZXY((g(3) / 10) * m, g(4) / 10, (g(5) / 10) * m), rest);
    const l = m > 0 ? 6 : 8, r = m > 0 ? 8 : 6;
    S.su[0] = g(l) / 100; S.sv[0] = g(l + 1) / 100; S.su[1] = g(r) / 100; S.sv[1] = g(r + 1) / 100;
    S.hap = Math.round(g(10)) / 100;
    // the mouth follows the move: a grin when the eyes turn happy, a little "o" when the body puffs up
    const E = el._mx || (el._mx = { s: 1, o: 0, vs: 0, vo: 0 }), puff = Math.max(0, Math.min(1, (g(1) / 1000) * 11));
    E.s += (1 + 0.85 * S.hap - E.s) * 0.4; E.o += (0.6 * S.hap + 0.75 * puff - E.o) * 0.4; E.vs = E.vo = 0;
    setFace(el, M, S);
    const body = C.body || (C.body = el.querySelector('.c-body'));
    if (body) body.style.transform = `translateY(${((g(0) / 1000) * C.bw).toFixed(2)}px) scale(${(1 + g(1) / 1000).toFixed(4)}, ${(1 + g(2) / 1000).toFixed(4)})`;
    return true;
  }
  function endClip(el) {
    el._clip = null;
    el.classList.remove('perf');
    const body = el.querySelector('.c-body');
    if (body) body.style.transform = '';
    if (el._eye) el._eye.key = ''; // draw the gaze pose again
    if (el._face) el._face.hap = -1; // and put the pill eyes back
  }

  function eyeLoop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (document.hidden) { for (const el of document.querySelectorAll('.char')) if (el._clip) endClip(el); return scheduleEyes(500); } // clips run on the wall clock: drop them instead of freezing half-way
    let moving = false;
    for (const el of document.querySelectorAll('.char')) {
      if (!el.getClientRects().length) continue; // not shown (hidden panel): no work
      if (el._clip && stepClip(el, now)) { moving = true; continue; }
      const B = baseOf(el); // this bot's own resting gaze
      const e = (el._eye ||= { x: B[0], y: B[1], vx: 0, vy: 0, key: '' });
      let [tx, ty] = eyeTarget(el, now);
      tx = tx >= 0 ? B[0] + tx * (1 - B[0]) : B[0] + tx * (1 + B[0]); // 0 = resting gaze, ±1 = the edges
      ty = ty >= 0 ? B[1] + ty * (1 - B[1]) : B[1] + ty * (1 + B[1]);
      // critically-damped spring → smooth, no overshoot, never jumps
      const k = 170, c = 2 * Math.sqrt(k);
      e.vx += (k * (tx - e.x) - c * e.vx) * dt;
      e.vy += (k * (ty - e.y) - c * e.vy) * dt;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // the mouth's mood glides the same way (a softer spring): smile amount s, openness o
      const X = mouthTarget(el, now), E = el._mx || (el._mx = { s: 1, o: 0, vs: 0, vo: 0 }), km = 110, cm = 2 * Math.sqrt(km);
      E.vs += (km * (X[0] - E.s) - cm * E.vs) * dt;
      E.vo += (km * (X[1] - E.o) - cm * E.vo) * dt;
      E.s += E.vs * dt;
      E.o += E.vo * dt;
      if (E.o < 0) { E.o = 0; E.vo = 0; }
      const gk = e.x.toFixed(3) + ',' + e.y.toFixed(3);
      if (gk !== e.key) { e.key = gk; setFace(el, gazeM(e.x, e.y), null); } // the face turned (setFace draws the mood too)
      else setMood(el); // only the smile changed: redraw just the mouth and the cheek glow
      if (Math.abs(tx - e.x) > 0.002 || Math.abs(ty - e.y) > 0.002 || Math.abs(e.vx) > 0.01 || Math.abs(e.vy) > 0.01) moving = true;
      else if (Math.abs(X[0] - E.s) > 0.004 || Math.abs(X[1] - E.o) > 0.004 || Math.abs(E.vs) > 0.02 || Math.abs(E.vo) > 0.02) moving = true;
    }
    if (moving) { calmFor = 0; return scheduleEyes(0); }
    calmFor += dt;
    scheduleEyes(calmFor < GRACE ? 0 : 250);
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
  const CLIPS = {"puff":[[0,0,0,0,0,0,100,100,100,100,0],[0,1,0,0,0,0,100,100,102,100,0],[-2,7,5,3,-2,1,104,100,105,100,0],[-3,9,8,4,-3,0,106,100,106,100,0],[-3,16,8,0,-3,1,106,99,104,99,0],[-3,16,9,0,-2,1,106,99,104,99,0],[-3,17,10,1,-2,2,107,99,107,99,0],[0,18,17,1,1,1,106,99,107,99,0],[0,20,18,1,1,2,106,99,107,99,0],[-3,34,26,0,-3,3,105,101,106,98,0],[-3,35,28,0,-2,2,105,100,103,100,0],[0,36,35,1,1,2,105,100,103,100,0],[0,38,36,0,1,2,104,100,103,100,0],[-3,52,44,0,-3,2,103,99,108,99,0],[-3,52,44,0,-2,1,103,99,108,99,0],[-3,53,45,1,-2,1,103,99,109,99,0],[-3,53,46,1,-2,2,103,99,109,99,0],[0,54,53,1,1,1,102,98,109,99,0],[0,54,53,0,1,1,102,98,109,99,0],[0,55,54,-1,1,2,102,98,108,99,0],[0,56,54,-5,1,2,108,98,106,98,0],[0,56,54,-8,1,2,102,98,104,98,0],[0,63,55,-12,1,6,101,98,106,101,0],[-3,63,61,-18,-3,8,101,97,105,100,0],[-3,70,62,-31,-4,11,101,97,101,100,0],[-3,70,62,-40,-3,13,103,100,107,100,0],[-3,70,62,-49,-4,15,104,100,99,100,0],[-3,70,62,-57,-4,17,104,100,100,100,0],[-3,70,62,-62,-3,21,104,100,106,100,0],[-3,70,62,-67,-4,20,105,101,106,100,0],[-3,70,63,-71,-4,24,107,101,105,97,0],[-3,70,63,-74,-4,25,103,100,106,97,0],[-3,70,63,-77,-4,22,107,100,107,97,0],[-3,70,63,-79,-4,24,108,100,106,97,0],[-3,70,63,-81,-4,26,108,100,105,97,0],[-3,70,63,-82,-3,28,106,86,104,85,0],[-3,70,63,-83,-1,26,103,51,102,50,0],[-3,70,63,-83,-1,26,96,25,100,25,0],[-3,71,63,-83,-1,25,96,24,99,25,0],[-3,71,63,-83,-1,25,102,44,105,44,0],[-3,71,63,-83,-2,25,104,73,104,73,0],[-3,71,63,-83,-3,28,105,95,105,94,0],[-3,71,63,-83,-4,27,105,101,105,97,0],[-3,71,63,-82,-4,27,105,101,105,97,0],[-3,71,63,-81,-4,27,107,101,105,97,0],[-3,71,63,-79,-4,24,108,101,109,97,0],[-3,71,63,-77,-4,22,106,100,107,97,0],[-3,71,63,-74,-4,24,106,100,106,97,0],[-3,71,63,-71,-5,23,106,100,105,97,0],[-3,70,63,-66,-5,19,105,100,107,97,0],[-3,70,63,-62,-5,21,103,100,106,97,0],[-3,70,63,-48,-6,15,105,99,107,98,0],[-3,70,63,-29,-7,11,101,99,105,100,0],[-3,70,63,-9,-8,5,104,100,105,100,0],[-3,70,63,12,-9,-1,107,100,106,100,0],[-3,70,63,24,-10,-5,107,100,106,100,0],[-3,70,63,33,-10,-7,107,100,106,100,0],[-3,70,63,38,-11,-9,107,99,107,100,0],[-3,70,62,42,-11,-10,107,98,106,98,0],[-3,70,62,46,-11,-11,107,98,108,98,0],[-3,70,62,49,-11,-12,107,98,108,98,0],[-3,70,62,52,-11,-13,107,98,106,98,0],[-3,70,62,54,-12,-14,106,98,104,98,0],[-3,64,62,58,-12,-14,107,98,106,98,0],[-3,63,61,59,-12,-12,107,98,106,98,0],[0,60,55,59,-8,-13,107,99,107,99,0],[0,56,54,58,-8,-14,107,99,107,99,0],[0,56,54,58,-8,-13,107,99,107,99,0],[0,55,54,58,-8,-14,107,99,106,99,0],[0,55,53,58,-8,-15,107,99,104,99,0],[0,54,53,57,-8,-14,107,99,105,99,0],[-3,53,46,57,-11,-14,107,99,106,99,0],[-3,52,45,55,-11,-13,107,99,109,99,0],[-3,52,44,53,-11,-12,107,99,109,100,0],[0,38,36,51,-7,-14,106,100,105,101,0],[0,36,35,47,-7,-12,107,101,110,100,0],[-3,35,28,42,-8,-9,106,101,104,101,0],[-3,34,26,38,-9,-8,106,101,107,99,0],[-2,24,22,34,-6,-6,107,101,107,99,0],[0,19,17,27,-4,-5,107,99,109,99,0],[0,18,17,22,-2,-4,107,99,105,99,0],[-3,17,10,16,-6,-3,106,99,108,99,0],[-3,17,9,14,-5,-2,105,99,108,99,0],[-3,16,8,11,-4,-2,107,99,104,99,0],[-3,16,8,8,-4,0,107,99,107,99,0],[-3,16,8,6,-5,0,106,99,106,99,0],[-2,7,5,6,-3,0,104,100,106,100,0],[0,2,0,2,0,0,100,100,102,100,0],[0,0,0,0,0,0,100,100,100,100,0]],"blink":[[0,0,0,0,0,0,100,100,100,100,0],[0,0,0,0,0,0,100,100,102,100,0],[0,0,-1,1,0,0,100,97,105,97,0],[0,1,-1,1,2,-1,99,78,106,78,0],[0,0,-1,2,3,0,101,43,106,45,0],[0,0,-1,2,5,0,99,21,96,21,0],[0,0,-1,2,4,0,100,27,100,28,0],[0,0,-1,1,4,0,103,49,104,48,0],[0,0,-1,1,1,0,100,76,107,75,0],[0,0,-1,1,0,0,100,98,105,98,0],[0,0,0,0,0,0,100,100,102,100,0],[0,0,0,0,0,0,100,100,100,100,0]],"curious":[[0,0,0,0,0,0,100,100,100,100,0],[0,0,0,1,0,-1,100,100,102,100,0],[0,0,-1,5,3,-3,106,101,106,98,0],[0,0,-1,18,9,-16,107,98,105,98,0],[0,0,-1,89,40,-81,108,101,109,100,0],[0,0,-1,168,71,-163,108,101,110,100,0],[0,0,-1,232,92,-233,109,101,111,101,0],[0,0,-1,273,104,-279,111,102,115,100,0],[0,0,-1,300,110,-313,112,101,115,100,0],[0,0,-1,313,113,-330,113,101,119,99,0],[0,0,-1,328,116,-347,112,101,114,99,0],[0,0,-1,331,116,-352,111,101,117,99,0],[0,0,-1,332,116,-353,111,101,118,99,0],[0,0,-1,332,116,-353,111,101,118,99,0],[0,0,-1,331,117,-353,111,101,119,101,0],[0,0,-1,329,121,-352,112,102,118,101,0],[0,0,-1,325,125,-350,113,101,116,99,0],[0,0,-1,319,132,-350,112,102,117,100,0],[0,0,-1,311,140,-348,112,101,115,100,0],[0,0,-1,301,154,-347,112,101,115,99,0],[0,0,-1,289,169,-344,113,102,113,99,0],[0,0,-1,256,212,-330,114,101,115,100,0],[0,0,-1,237,238,-321,115,101,118,101,0],[0,0,-1,223,256,-314,115,102,118,101,0],[0,0,-1,212,270,-307,114,102,115,100,0],[0,0,-1,205,280,-302,113,101,116,101,0],[0,0,-1,201,286,-299,115,102,118,102,0],[0,0,-1,198,290,-298,115,101,117,100,0],[0,0,-1,197,293,-297,115,101,117,101,0],[0,0,-1,196,293,-297,115,101,117,101,0],[0,0,-1,196,294,-297,115,101,117,101,0],[0,0,-1,201,298,-304,110,82,110,81,0],[0,0,-1,208,305,-312,104,45,106,44,0],[0,0,-1,207,306,-313,102,24,97,22,0],[0,0,-1,207,306,-312,104,29,101,29,0],[0,0,-1,207,303,-311,108,50,107,49,0],[0,0,-1,203,300,-306,111,76,111,74,0],[0,0,-1,197,296,-298,114,96,114,94,0],[0,0,-1,196,293,-297,115,101,116,101,0],[0,0,-1,196,293,-297,115,101,116,101,0],[0,0,-1,196,293,-297,115,101,116,101,0],[0,0,-1,196,293,-297,115,101,116,101,0],[0,0,-1,196,293,-297,115,101,116,101,0],[0,0,-1,196,293,-297,115,101,116,101,0],[0,0,-1,196,293,-297,115,101,116,101,0],[0,0,-1,196,293,-297,115,101,116,101,0],[0,0,-1,195,293,-295,114,101,118,101,0],[0,0,-1,192,293,-292,114,101,117,101,0],[0,0,-1,191,291,-291,114,101,116,101,0],[0,0,-1,189,286,-290,114,103,117,102,0],[0,0,-1,184,282,-285,113,100,115,102,0],[0,0,-1,177,274,-276,113,101,116,101,0],[0,0,-1,168,263,-268,112,102,115,101,0],[0,0,-1,148,239,-249,112,102,114,102,0],[0,0,-1,124,209,-226,109,101,112,100,0],[0,0,-1,111,190,-215,108,101,110,101,0],[0,0,-1,81,145,-189,107,101,111,101,0],[0,0,-1,68,126,-178,107,101,111,100,0],[0,0,-1,62,114,-175,107,101,110,101,0],[0,0,-1,55,101,-171,107,101,110,102,0],[0,0,-1,50,92,-166,107,102,111,101,0],[0,0,-1,46,85,-165,106,101,110,101,0],[0,0,-1,41,77,-162,107,101,110,101,0],[0,0,-1,39,72,-160,108,101,111,101,0],[0,0,-1,36,69,-157,106,101,110,101,0],[0,0,-1,35,66,-158,108,101,110,100,0],[0,0,-1,34,63,-159,107,101,109,101,0],[0,0,-1,33,62,-155,106,101,109,101,0],[0,0,-1,32,61,-155,107,101,111,101,0],[0,0,-1,31,60,-155,108,101,110,102,0],[0,0,-1,31,59,-154,107,101,109,102,0],[0,0,-1,31,59,-154,107,101,109,102,0],[0,0,-1,31,59,-154,107,101,109,101,0],[0,0,-1,31,59,-155,107,100,109,100,0],[0,0,-1,31,59,-155,108,99,109,99,0],[0,0,-1,32,59,-155,108,91,107,89,0],[0,0,-1,32,62,-155,107,65,107,65,0],[0,0,-1,32,63,-157,103,32,103,33,0],[0,0,-1,32,63,-156,100,23,99,23,0],[0,0,-1,33,63,-157,102,36,102,35,0],[0,0,-1,33,61,-156,107,59,107,59,0],[0,0,-1,32,59,-155,108,94,109,95,0],[0,0,-1,31,59,-154,108,101,109,102,0],[0,0,-1,31,59,-155,108,97,108,97,0],[0,0,-1,32,59,-155,108,93,107,91,0],[0,0,-1,33,62,-156,107,59,107,59,0],[0,0,-1,32,63,-157,103,27,98,28,0],[0,0,-1,32,63,-156,100,23,99,23,0],[0,0,-1,33,63,-158,103,33,102,33,0],[0,0,-1,33,62,-156,107,59,106,60,0],[0,0,-1,32,60,-156,108,87,107,87,0],[0,0,-1,31,59,-154,108,100,109,100,0],[0,0,-1,31,59,-154,108,101,110,102,0],[0,0,-1,31,58,-153,109,99,112,102,0],[0,0,-1,25,53,-132,121,89,128,105,0],[0,0,-1,22,48,-119,125,83,139,104,0],[0,0,-1,10,27,-64,129,67,163,94,0],[0,0,-1,5,19,-42,130,63,169,90,0],[0,0,-1,2,12,-25,129,61,171,86,0],[0,0,-1,-2,6,-9,128,59,173,83,0],[0,0,-1,-3,4,-2,128,59,172,81,0],[0,0,-1,-4,3,0,128,58,173,81,0],[0,0,-1,-4,2,3,128,58,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,3,128,58,172,82,0],[0,0,-1,-5,1,4,128,59,172,82,0],[0,-1,-2,-6,1,5,127,58,172,81,0],[-1,-1,-5,-7,-1,7,127,58,172,81,0],[-3,-1,-9,-8,-3,10,127,59,172,81,0],[-3,-2,-9,-9,-3,11,127,59,172,80,0],[-3,-9,-10,-6,-3,15,129,59,172,81,0],[-1,-10,-15,-8,-1,18,128,59,171,81,0],[0,-11,-18,-11,0,23,129,59,170,80,0],[-1,-18,-23,-15,-1,31,130,60,170,80,0],[-3,-26,-27,-18,-3,38,130,60,169,80,0],[-1,-32,-33,-22,-2,49,131,60,168,78,0],[-2,-41,-42,-26,-3,62,132,61,167,77,0],[-3,-55,-56,-33,-5,80,133,62,163,75,0],[-1,-78,-78,-47,-5,109,134,62,160,73,0],[-2,-104,-109,-66,-8,148,140,65,150,72,0],[-2,-156,-163,-95,-11,218,148,68,148,69,0],[0,-195,-197,-110,-10,262,153,72,145,67,0],[0,-215,-218,-123,-10,287,154,71,141,65,0],[-1,-231,-233,-132,-15,304,155,73,139,64,0],[1,-244,-245,-136,-12,317,155,74,138,64,0],[1,-253,-254,-140,-13,327,160,75,140,65,0],[-1,-258,-259,-141,-14,334,162,75,140,64,0],[-1,-263,-267,-141,-13,340,164,76,138,63,0],[1,-268,-272,-147,-13,342,161,76,137,64,0],[1,-272,-274,-150,-14,345,160,77,135,63,0],[-1,-273,-279,-151,-17,348,161,75,132,60,0],[-2,-281,-281,-147,-16,351,162,75,135,62,0],[1,-282,-289,-150,-12,355,165,76,137,64,0],[1,-286,-290,-153,-13,356,166,76,137,63,0],[1,-289,-291,-156,-15,357,167,76,136,63,0],[1,-290,-291,-156,-15,358,167,76,135,63,0],[1,-290,-292,-157,-15,358,167,76,135,63,0],[1,-291,-292,-157,-15,358,168,76,133,64,0],[1,-291,-293,-157,-15,359,167,76,133,64,0],[-2,-291,-299,-154,-19,357,166,76,134,62,0],[-2,-298,-299,-150,-16,358,166,77,135,62,0],[-2,-298,-299,-147,-16,355,165,77,136,62,0],[-2,-292,-299,-148,-18,349,161,76,128,60,0],[-2,-292,-299,-145,-17,346,159,76,137,63,0],[-2,-292,-299,-142,-16,340,163,76,139,64,0],[-1,-292,-296,-141,-14,337,162,75,139,64,0],[1,-291,-292,-138,-10,330,160,74,136,62,0],[1,-290,-292,-133,-9,321,161,73,139,64,0],[1,-282,-290,-130,-10,309,154,72,142,66,0],[0,-281,-287,-124,-8,299,153,72,145,67,0],[-1,-272,-276,-113,-9,286,155,72,145,67,0],[1,-259,-264,-106,-6,269,152,72,145,68,0],[1,-243,-253,-99,-5,252,146,71,144,69,0],[1,-225,-220,-81,-1,216,145,68,156,72,0],[0,-198,-200,-58,2,172,139,64,152,72,0],[0,-178,-182,-27,8,109,131,60,165,76,0],[1,-159,-164,26,16,12,122,56,179,86,0],[0,-149,-154,53,21,-46,115,54,190,90,0],[0,-144,-146,65,24,-75,111,52,195,93,0],[0,-143,-145,76,26,-90,111,51,198,94,0],[0,-130,-132,87,27,-121,109,50,198,96,0],[0,-127,-129,98,29,-140,107,49,200,96,0],[0,-126,-128,107,30,-154,106,46,202,97,0],[0,-119,-127,110,31,-167,107,50,202,96,0],[0,-119,-126,119,32,-178,108,49,201,97,0],[0,-118,-125,123,32,-185,107,50,202,96,0],[0,-118,-125,130,32,-194,109,51,201,96,0],[-3,-114,-118,127,29,-197,106,49,200,96,0],[-2,-110,-118,129,31,-205,102,45,199,97,0],[1,-110,-112,135,34,-211,110,48,201,96,0],[1,-110,-111,138,33,-216,108,50,201,95,0],[0,-109,-111,140,34,-219,107,50,200,95,0],[0,-102,-110,138,35,-223,103,48,199,95,0],[0,-101,-109,140,35,-226,103,48,199,96,0],[0,-100,-107,143,36,-228,110,51,200,97,0],[-2,-98,-99,143,32,-230,108,50,199,96,0],[0,-90,-93,142,36,-234,108,48,199,96,0],[0,-82,-90,148,35,-235,109,50,201,96,0],[0,-73,-74,145,36,-236,106,50,198,96,0],[0,-55,-56,147,37,-236,105,49,199,97,0],[-3,-27,-27,145,34,-238,108,48,197,96,0],[1,-7,-3,148,37,-239,102,47,197,96,0],[0,7,1,150,35,-239,106,47,200,97,0],[-2,10,9,151,33,-237,105,49,199,97,0],[0,21,16,153,35,-239,108,49,196,96,0],[0,25,18,159,33,-238,109,50,197,96,0],[0,26,19,163,34,-237,108,50,198,96,0],[0,26,19,169,32,-238,108,50,199,97,0],[0,26,20,176,31,-237,110,50,198,96,0],[0,26,20,184,29,-238,105,47,197,96,0],[0,26,20,195,27,-237,108,50,198,96,0],[-3,26,26,205,22,-235,109,50,196,96,0],[-3,26,26,221,18,-234,109,49,194,95,0],[-3,26,26,242,14,-233,106,49,191,96,0],[-3,26,26,266,10,-230,109,49,187,96,0],[-3,26,26,279,8,-228,107,50,184,96,0],[-1,26,23,276,9,-222,110,53,183,100,0],[0,25,18,249,10,-199,118,62,173,106,0],[0,20,17,195,8,-153,120,76,153,110,0],[-1,13,12,130,3,-98,117,88,134,108,0],[-3,8,7,76,0,-56,113,95,121,105,0],[0,8,0,47,2,-33,110,98,113,101,0],[0,7,-1,27,1,-21,108,101,107,101,0],[0,1,-1,14,1,-9,102,101,106,98,0],[0,0,-1,3,1,-3,105,100,102,100,0],[0,0,0,0,0,0,100,100,101,100,0],[0,0,0,0,0,0,100,100,100,100,0]],"jump":[[0,0,0,0,0,0,100,100,100,100,0],[0,0,0,1,0,-1,100,100,102,100,0],[0,0,-1,2,1,-2,101,100,105,100,0],[0,0,-1,19,9,-16,108,101,107,98,0],[0,0,-1,70,31,-61,108,100,110,100,0],[0,0,-1,137,59,-130,107,102,109,100,0],[0,0,-1,210,85,-209,108,101,110,100,0],[0,0,-1,260,101,-265,110,102,113,101,0],[0,0,-1,289,108,-299,112,102,116,100,0],[0,0,-1,311,112,-326,111,101,114,99,0],[0,0,-1,325,115,-343,114,101,111,99,0],[0,0,-1,330,116,-350,111,101,117,99,0],[0,0,-1,332,116,-353,111,101,118,99,0],[0,0,-1,332,117,-353,111,101,118,99,0],[0,0,-1,331,117,-353,111,101,119,101,0],[0,0,-1,329,121,-352,112,102,118,101,0],[0,0,-1,324,127,-351,114,101,118,100,0],[0,0,-1,319,132,-352,111,102,119,102,0],[0,0,-1,308,144,-346,111,100,113,100,0],[0,0,-1,297,159,-346,110,101,115,99,0],[0,0,-1,278,182,-341,113,103,114,100,0],[0,0,-1,255,212,-330,112,100,119,102,0],[0,0,-1,237,238,-324,111,103,113,99,0],[0,0,-1,223,258,-315,113,102,116,100,0],[0,0,-1,212,271,-306,114,101,115,101,0],[0,0,-1,205,281,-302,113,102,119,102,0],[0,0,-1,201,287,-299,117,103,118,102,0],[0,0,-1,198,291,-298,115,101,117,100,0],[0,0,-1,197,293,-298,114,101,116,101,0],[0,0,-1,196,294,-297,115,101,117,101,0],[0,0,-1,196,294,-297,115,101,117,101,0],[0,0,-1,202,299,-306,112,79,113,79,0],[0,0,-1,208,304,-313,104,45,105,45,0],[0,0,-1,207,306,-313,102,22,97,22,0],[0,0,-1,209,306,-316,103,25,102,27,0],[0,0,-1,209,304,-313,104,45,102,43,0],[0,0,-1,202,299,-306,109,79,113,81,0],[0,0,-1,197,295,-298,114,97,115,95,0],[0,0,-1,197,294,-298,115,101,116,101,0],[0,0,-1,197,294,-298,115,101,116,101,0],[0,0,-1,197,294,-298,115,101,116,101,0],[0,0,-1,197,294,-298,115,101,116,101,0],[0,0,-1,197,294,-298,115,101,116,101,0],[0,0,-1,197,294,-298,115,101,116,101,0],[0,0,-1,197,294,-298,115,101,116,101,0],[0,0,-1,196,294,-297,115,101,117,101,0],[0,0,-1,195,293,-296,114,101,118,100,0],[0,0,-1,193,292,-292,114,101,117,100,0],[0,0,-1,190,290,-290,115,102,118,102,0],[0,0,-1,189,286,-290,114,102,116,101,0],[0,0,-1,186,283,-287,114,100,114,101,0],[0,0,-1,178,277,-278,113,102,116,99,0],[0,0,-1,168,263,-269,112,101,114,101,0],[0,0,-1,153,245,-255,111,101,113,102,0],[0,0,-1,131,217,-232,108,101,112,100,0],[0,0,-1,104,181,-208,108,101,110,101,0],[0,0,-1,84,150,-191,107,100,110,100,0],[0,0,-1,68,126,-178,107,101,111,100,0],[0,0,-1,60,110,-174,108,101,111,101,0],[0,0,-1,53,98,-170,107,101,109,102,0],[0,0,-1,48,89,-165,107,101,111,101,0],[0,0,-1,44,82,-163,105,101,110,102,0],[0,0,-1,41,77,-162,107,100,109,101,0],[0,0,-1,39,72,-159,108,101,111,101,0],[0,0,-1,36,69,-157,106,101,109,101,0],[0,0,-1,35,66,-158,108,101,110,100,0],[0,0,-1,34,63,-158,107,101,109,101,0],[0,0,-1,33,62,-155,106,101,110,101,0],[0,0,-1,32,60,-154,107,101,110,101,0],[0,0,-1,31,60,-154,108,101,109,102,0],[0,0,-1,31,59,-154,108,101,109,102,0],[0,0,-1,31,59,-154,108,101,109,102,0],[0,0,-1,31,59,-154,108,101,109,101,0],[0,0,-1,31,59,-155,108,100,109,100,0],[0,0,-1,31,59,-155,108,100,109,99,0],[0,0,-1,32,59,-156,108,90,107,90,0],[0,0,-1,31,58,-153,107,90,107,90,0],[0,1,-2,28,53,-137,107,91,109,91,0],[-3,9,-8,25,36,-103,107,94,111,92,0],[-3,16,-9,12,22,-63,107,95,109,96,0],[-3,17,-10,9,14,-44,107,95,107,96,0],[-3,18,-10,4,5,-22,108,98,105,98,0],[-3,18,-10,3,2,-11,106,97,105,100,0],[-3,19,-10,1,-1,-5,101,100,108,97,0],[-3,19,-11,1,-3,-1,101,100,107,100,0],[-3,19,-11,0,-4,0,100,100,107,100,0],[0,0,-1,1,1,0,99,100,108,101,0],[0,2,-2,0,0,0,111,95,112,95,0],[9,35,-19,-2,6,-1,143,80,143,80,0],[18,71,-37,-4,24,-5,183,73,184,74,0],[23,90,-47,-4,38,-11,100,100,100,100,100],[22,90,-46,-5,56,-20,100,100,100,100,100],[1,62,-3,-6,67,-27,100,100,100,100,100],[-97,8,87,-8,90,-44,100,100,100,100,100],[-146,0,95,-8,115,-59,100,100,100,100,100],[-162,0,90,-8,144,-80,100,100,100,100,100],[-167,0,81,-7,174,-101,100,100,100,100,100],[-166,0,64,-6,213,-126,100,100,100,100,100],[-162,0,53,-5,236,-140,100,100,100,100,100],[-154,0,37,-4,262,-157,100,100,100,100,100],[-142,0,21,-1,289,-172,100,100,100,100,100],[-133,0,12,0,302,-180,100,100,100,100,100],[-121,0,2,0,311,-185,100,100,100,100,100],[-106,0,-4,1,319,-190,100,100,100,100,100],[-90,0,-7,1,321,-192,100,100,100,100,100],[-71,0,-7,1,321,-193,100,100,100,100,100],[-46,0,-3,0,321,-193,100,100,100,100,100],[-22,0,-3,0,320,-190,100,100,100,100,100],[11,55,-28,1,310,-183,100,100,100,100,100],[0,94,-52,3,304,-172,100,100,100,100,100],[-70,87,-41,6,297,-151,100,100,100,100,100],[-105,68,-23,16,290,-110,100,100,100,100,100],[-126,46,-1,29,280,-57,100,100,100,100,100],[-141,25,19,33,269,-1,100,100,100,100,100],[-155,12,40,45,255,47,100,100,100,100,100],[-161,0,49,49,250,82,220,74,220,75,0],[-162,0,51,53,243,110,215,73,220,75,0],[-157,0,44,57,240,125,217,74,220,75,0],[-148,0,43,60,238,138,219,74,221,76,0],[-134,0,35,62,234,147,218,74,222,76,0],[-108,0,33,64,233,154,201,74,212,76,0],[-72,0,16,66,226,162,169,76,182,80,0],[-14,16,-28,71,220,166,129,84,150,90,0],[-4,19,-48,77,222,162,114,94,129,96,0],[-85,16,6,73,211,164,107,96,117,95,0],[-117,1,35,71,208,166,105,97,111,98,0],[-125,0,44,69,206,162,104,98,108,97,0],[-131,0,45,68,199,159,105,97,108,97,0],[-131,0,45,64,187,151,105,98,107,97,0],[-128,0,48,61,173,139,104,98,107,97,0],[-120,0,48,55,154,124,104,98,107,98,0],[-106,0,48,49,132,106,105,97,106,98,0],[-86,0,45,44,111,86,105,98,108,99,0],[-59,0,45,39,89,68,105,99,104,98,0],[-22,0,43,35,70,54,106,98,104,97,0],[-62,0,19,33,55,42,102,98,97,97,0],[-67,0,7,32,45,32,108,101,105,98,0],[-67,0,-7,31,38,23,100,102,106,98,0],[-65,0,-4,30,32,19,99,100,107,100,0],[-53,0,-2,29,24,13,99,98,100,101,0],[-27,0,-1,28,24,11,107,98,101,98,0],[-31,0,-7,28,20,11,107,98,101,98,0],[-45,0,-2,28,18,7,107,98,105,101,0],[-30,0,-1,27,19,8,107,100,104,99,0],[-5,0,-1,27,17,9,107,98,102,101,0],[1,0,-1,27,17,8,107,98,102,101,0],[1,0,-1,27,16,7,107,98,105,101,0],[1,0,-1,23,15,8,100,98,109,101,0],[1,0,-1,19,12,8,107,101,107,98,0],[1,0,-1,14,8,4,100,101,104,98,0],[1,0,-1,7,4,5,106,98,106,101,0],[0,0,0,1,0,1,102,100,101,100,0],[0,0,0,0,0,0,100,100,100,100,0]],"shrink":[[0,0,0,0,0,0,100,100,100,100,0],[0,0,0,0,0,0,100,100,102,100,0],[0,6,0,4,1,0,104,100,105,100,0],[-3,9,7,4,-3,1,106,100,106,100,0],[-3,16,8,0,-3,1,106,99,106,99,0],[-3,16,8,0,-2,1,106,99,102,99,0],[-3,17,9,0,-2,2,107,99,107,99,0],[-1,17,13,1,-1,2,106,99,107,99,0],[0,19,17,1,1,2,106,99,107,99,0],[-2,27,22,1,-1,3,106,100,105,98,0],[-3,34,27,0,-3,3,105,101,103,99,0],[-1,36,31,1,-1,2,105,100,103,100,0],[0,37,35,1,1,2,104,100,103,100,0],[0,43,37,3,1,2,104,100,103,100,0],[-3,52,44,0,-3,1,103,99,108,99,0],[-3,52,45,1,-2,1,103,99,109,99,0],[-3,53,46,1,-2,1,103,99,109,99,0],[-1,54,50,1,-1,1,103,99,109,99,0],[0,54,53,1,1,1,102,98,109,99,0],[0,55,53,0,1,1,102,98,109,99,0],[0,55,54,-3,1,2,105,98,107,99,0],[0,56,54,-6,1,3,104,98,104,98,0],[0,56,54,-10,1,3,102,98,106,98,0],[-2,63,59,-14,-2,6,101,98,103,101,0],[-3,63,61,-24,-3,9,101,97,103,100,0],[-3,70,62,-37,-4,11,102,97,101,100,0],[-3,70,62,-46,-4,14,103,100,100,100,0],[-3,70,62,-53,-3,19,103,100,106,100,0],[-3,70,62,-59,-4,18,105,100,106,100,0],[-3,70,62,-65,-4,21,106,100,106,100,0],[-3,70,63,-69,-4,22,106,100,100,97,0],[-3,70,63,-72,-4,24,105,100,105,97,0],[-3,70,63,-75,-4,24,107,100,107,97,0],[-3,70,63,-77,-4,23,107,100,106,97,0],[-3,70,63,-80,-4,25,107,100,109,97,0],[-3,70,63,-81,-3,26,106,95,105,97,0],[-3,70,63,-82,-2,27,105,68,98,67,0],[-3,70,63,-83,-1,26,97,32,102,34,0],[-3,70,63,-83,-1,26,96,21,99,23,0],[-3,71,63,-83,-1,26,96,28,100,28,0],[-3,71,63,-83,-1,26,104,52,105,51,0],[-3,71,63,-83,-3,28,104,86,105,85,0],[-3,71,63,-83,-3,27,105,100,105,97,0],[-3,71,63,-82,-3,27,106,101,105,97,0],[-3,71,63,-82,-4,28,106,101,105,97,0],[-3,71,63,-80,-4,25,108,101,104,97,0],[-3,71,63,-78,-4,23,107,101,106,97,0],[-3,71,63,-76,-4,23,107,100,107,97,0],[-3,71,63,-73,-4,24,104,100,105,97,0],[-3,70,63,-69,-5,22,106,100,100,97,0],[-3,70,63,-63,-5,20,105,100,106,97,0],[-3,70,63,-57,-5,19,106,100,103,97,0],[-3,70,63,-44,-6,15,103,97,103,98,0],[-3,70,63,-24,-7,10,101,100,106,100,0],[-3,70,63,7,-9,0,107,100,107,100,0],[-3,70,63,22,-9,-4,102,100,106,100,0],[-3,70,63,29,-10,-6,107,100,106,100,0],[-3,70,63,37,-11,-9,107,98,107,100,0],[-3,70,62,41,-11,-10,107,98,107,99,0],[-3,70,62,46,-11,-10,107,98,107,98,0],[-3,70,62,48,-11,-11,107,98,108,98,0],[-3,70,62,51,-11,-11,106,98,108,98,0],[-3,70,62,52,-11,-13,107,98,105,98,0],[-3,70,62,54,-12,-14,106,98,104,98,0],[-3,63,61,59,-12,-13,107,98,106,98,0],[0,63,55,60,-8,-13,107,99,107,99,0],[0,56,55,57,-8,-14,107,99,107,99,0],[0,56,54,58,-8,-13,107,99,107,99,0],[0,55,54,58,-8,-13,107,99,107,99,0],[0,55,53,58,-8,-14,107,99,105,99,0],[0,54,53,58,-8,-14,107,99,105,99,0],[-1,53,50,57,-10,-14,107,99,105,99,0],[-3,53,46,56,-11,-14,107,99,107,99,0],[-3,52,45,54,-11,-12,107,99,110,99,0],[-2,45,40,52,-9,-13,106,100,107,100,0],[0,37,36,50,-7,-13,107,100,106,100,0],[0,35,35,45,-6,-11,107,101,109,101,0],[-3,34,27,40,-9,-10,106,101,105,101,0],[-3,30,26,36,-8,-6,106,101,108,98,0],[0,20,18,29,-4,-6,106,100,107,99,0],[0,18,17,24,-3,-5,107,99,109,99,0],[0,17,16,17,-2,-3,106,99,108,99,0],[-3,17,10,17,-6,-4,111,99,110,99,0],[-3,17,10,14,-4,0,120,87,124,102,0],[-3,16,8,9,-4,1,126,74,147,100,0],[-3,9,7,7,-4,2,128,68,158,93,0],[0,2,0,1,1,2,129,63,170,88,0],[0,1,-1,-1,1,4,128,60,173,84,0],[0,1,-1,-3,1,2,126,59,172,83,0],[0,0,-1,-3,1,2,127,59,173,82,0],[0,0,-1,-3,1,2,128,59,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,2,129,59,173,82,0],[0,0,-1,-4,1,3,127,58,174,82,0],[0,0,-2,-5,1,4,128,59,172,82,0],[0,-1,-2,-6,1,5,126,58,173,81,0],[0,-1,-2,-7,1,7,127,59,171,80,0],[-3,-1,-9,-8,-3,9,127,59,171,81,0],[-3,-2,-9,-9,-3,11,127,59,172,80,0],[-3,-9,-10,-6,-3,15,129,59,172,81,0],[-1,-10,-15,-8,-1,18,128,59,171,81,0],[0,-11,-18,-11,0,23,128,60,169,80,0],[0,-16,-20,-12,1,30,129,60,171,80,0],[-3,-26,-27,-18,-4,37,131,60,169,79,0],[-2,-32,-33,-22,-2,48,130,60,167,78,0],[-2,-41,-42,-26,-3,62,132,61,167,77,0],[0,-54,-56,-36,-2,78,134,62,160,76,0],[0,-73,-74,-43,-2,106,137,63,161,74,0],[0,-110,-111,-71,-6,155,143,67,152,72,0],[1,-165,-166,-100,-9,227,149,68,147,69,0],[0,-199,-201,-112,-8,267,155,72,144,68,0],[1,-218,-219,-123,-10,290,155,71,144,65,0],[0,-234,-236,-130,-11,303,158,73,143,65,0],[-2,-237,-245,-134,-16,316,154,76,139,65,0],[1,-252,-254,-141,-13,326,155,74,137,65,0],[1,-255,-256,-144,-13,333,162,75,137,65,0],[0,-263,-270,-143,-11,340,164,76,139,64,0],[1,-271,-272,-149,-14,343,159,76,137,64,0],[1,-272,-274,-151,-14,346,161,77,135,63,0],[-2,-273,-281,-150,-18,348,161,74,132,60,0],[-2,-281,-282,-147,-16,352,162,75,134,62,0],[1,-281,-289,-150,-12,355,165,76,137,64,0],[1,-282,-290,-151,-12,357,165,76,137,63,0],[1,-287,-291,-154,-14,358,166,76,138,63,0],[1,-290,-291,-156,-15,358,167,76,135,63,0],[1,-290,-292,-157,-15,358,167,76,135,64,0],[1,-291,-292,-157,-15,358,168,76,133,64,0],[1,-291,-293,-157,-15,358,167,76,133,63,0],[-1,-291,-297,-155,-18,357,166,76,134,62,0],[-2,-298,-299,-149,-16,358,166,77,135,62,0],[-2,-298,-299,-147,-16,354,164,77,137,62,0],[-2,-294,-299,-147,-17,350,163,76,131,61,0],[-2,-292,-299,-145,-17,346,162,76,136,63,0],[-2,-292,-299,-142,-17,342,165,76,138,63,0],[-1,-292,-296,-140,-13,335,162,75,138,63,0],[1,-291,-292,-137,-10,327,160,74,138,64,0],[1,-290,-292,-132,-9,320,160,73,140,65,0],[1,-285,-290,-130,-10,311,156,72,142,66,0],[1,-281,-288,-125,-8,302,153,71,142,67,0],[1,-272,-274,-120,-9,286,153,71,138,67,0],[-2,-262,-263,-102,-9,269,154,72,144,66,0],[0,-238,-252,-96,-4,249,144,70,143,69,0],[1,-225,-220,-81,-1,216,145,68,155,72,0],[0,-198,-200,-57,2,172,138,64,153,72,0],[0,-173,-181,-23,8,98,131,60,165,79,0],[0,-156,-164,26,16,7,121,56,180,85,0],[1,-153,-157,48,20,-32,118,54,188,89,0],[0,-144,-146,65,24,-75,112,52,195,93,0],[-3,-136,-137,81,22,-107,110,50,197,95,0],[1,-128,-130,89,29,-127,109,50,201,96,0],[0,-127,-129,101,29,-144,107,50,200,96,0],[0,-126,-128,109,30,-157,104,46,202,96,0],[0,-119,-126,112,31,-169,107,51,201,96,0],[0,-119,-126,117,31,-177,107,49,202,97,0],[0,-118,-125,124,32,-186,108,49,202,97,0],[-3,-118,-119,127,29,-193,104,48,199,96,0],[-3,-111,-118,125,30,-198,103,48,198,96,0],[-2,-110,-118,129,31,-204,102,45,199,96,0],[1,-110,-112,135,34,-211,110,48,201,96,0],[1,-110,-111,138,33,-216,107,50,201,96,0],[0,-109,-111,141,34,-219,107,49,202,95,0],[0,-102,-110,138,35,-223,102,48,199,96,0],[0,-101,-109,140,35,-226,103,48,199,96,0],[0,-100,-107,143,36,-228,108,50,200,97,0],[-2,-98,-99,143,32,-230,108,50,199,96,0],[0,-90,-92,142,36,-234,108,48,199,96,0],[0,-82,-90,148,35,-235,109,50,201,96,0],[-1,-73,-78,144,35,-236,107,50,199,96,0],[0,-55,-56,147,37,-236,105,49,198,97,0],[-3,-27,-28,145,34,-238,108,48,198,96,0],[1,-8,-3,148,37,-239,107,49,198,96,0],[0,7,1,150,36,-239,106,47,200,97,0],[-2,10,9,151,33,-236,107,49,199,97,0],[0,18,16,151,36,-239,108,50,197,96,0],[0,25,17,158,33,-238,109,50,197,96,0],[0,26,19,163,33,-237,108,50,198,96,0],[0,26,19,169,32,-238,108,50,199,97,0],[0,26,20,175,31,-238,109,49,198,97,0],[0,26,20,182,29,-238,107,48,197,96,0],[0,26,20,193,28,-237,108,49,198,96,0],[-3,26,26,207,21,-235,109,49,194,96,0],[-3,26,26,224,18,-233,107,48,194,95,0],[-3,26,26,240,15,-233,105,49,191,96,0],[-3,26,26,267,11,-230,108,49,191,96,0],[-3,26,26,283,8,-228,107,50,185,95,0],[-1,26,22,280,10,-226,111,51,183,97,0],[0,20,18,254,10,-202,120,62,172,106,0],[0,17,17,194,8,-154,123,78,152,112,0],[-2,12,11,135,3,-104,118,88,135,109,0],[-3,8,7,74,-1,-56,113,95,120,105,0],[0,8,0,47,2,-33,110,98,113,101,0],[0,7,-1,27,1,-19,108,100,111,101,0],[0,0,-1,10,1,-7,101,100,105,99,0],[0,0,0,1,0,-1,101,100,102,100,0],[0,0,0,0,0,0,100,100,100,100,0]],"spin":[[0,0,0,0,0,0,100,100,100,100,0],[0,0,0,0,0,0,100,100,102,100,0],[0,3,-1,-4,3,2,105,100,104,99,0],[0,7,-1,-18,9,6,106,100,104,97,0],[0,0,-1,-35,20,11,104,98,100,99,0],[-5,0,-1,-68,31,23,106,100,102,98,0],[-8,0,-1,-101,46,37,109,100,108,102,0],[-8,0,-1,-129,61,50,109,101,107,100,0],[-8,0,-2,-165,79,67,109,101,107,100,0],[-9,0,-2,-198,93,85,108,100,107,102,0],[-9,3,-1,-215,103,96,108,101,107,100,0],[-9,0,-1,-235,111,108,109,101,107,101,0],[-10,4,-3,-250,118,117,109,100,106,101,0],[-13,0,-7,-267,123,128,110,101,107,102,0],[-13,0,-7,-280,127,136,111,100,107,102,0],[-15,0,-4,-288,128,140,108,102,108,101,0],[-16,6,-1,-292,128,144,111,100,107,101,0],[-16,3,-1,-298,132,149,111,101,106,100,0],[-16,0,-1,-304,134,153,111,101,107,101,0],[-16,-1,-1,-310,136,157,110,99,108,98,0],[-16,-1,-1,-315,141,161,109,76,108,76,0],[-17,-1,-1,-320,144,166,104,39,100,40,0],[-17,-1,-1,-324,146,170,107,21,98,22,0],[-17,-1,-1,-326,145,172,106,36,103,34,0],[-17,-1,-1,-326,144,171,106,60,105,60,0],[-17,-1,-1,-325,142,167,110,88,107,88,0],[-17,-1,-1,-323,138,166,110,101,109,100,0],[-17,-1,-1,-322,137,165,109,101,108,100,0],[-17,-1,-1,-320,133,165,110,101,108,102,0],[-17,-1,-1,-316,126,162,111,101,107,100,0],[-17,-1,-1,-313,121,160,110,101,108,101,0],[-17,-1,-1,-311,117,159,110,100,108,101,0],[-17,-1,-1,-311,116,159,110,100,108,101,0],[-17,-1,-1,-310,116,158,110,100,108,101,0],[-17,-1,-1,-310,116,158,109,100,108,101,0],[-17,-1,-1,-311,116,159,109,100,108,101,0],[-17,-1,-1,-311,116,159,111,100,108,101,0],[-16,-1,-1,-310,116,158,111,100,109,101,0],[-9,-1,-2,-283,108,139,111,100,108,101,0],[0,6,-1,-246,92,109,110,100,107,100,0],[10,0,-1,-197,68,71,109,101,107,101,0],[20,0,-1,-139,39,36,107,99,107,99,0],[28,3,-1,-106,21,16,106,98,103,101,0],[38,0,-1,-60,-2,-7,105,99,108,100,0],[46,0,-1,-23,-19,-23,107,101,108,101,0],[54,7,-1,0,-27,-32,107,100,107,101,0],[56,0,-1,18,-41,-41,107,99,109,101,0],[60,0,-7,35,-47,-44,108,99,108,101,0],[64,0,-1,47,-51,-49,107,100,109,101,0],[65,0,-1,63,-61,-53,107,101,110,101,0],[65,0,-1,74,-68,-53,108,101,111,101,0],[71,0,-3,83,-66,-56,107,101,110,101,0],[73,7,-1,89,-71,-59,107,101,110,101,0],[73,7,-1,96,-75,-60,107,101,111,99,0],[74,7,-1,103,-78,-61,107,99,108,101,0],[74,7,-1,109,-82,-61,107,101,112,101,0],[74,7,-1,113,-85,-63,107,101,111,101,0],[74,7,-1,118,-87,-62,107,101,110,101,0],[78,7,-7,123,-86,-63,107,100,111,101,0],[80,0,-4,123,-85,-65,107,100,111,102,0],[81,0,-1,125,-85,-68,108,102,111,100,0],[82,0,-1,129,-87,-66,107,102,111,100,0],[82,0,-1,130,-88,-66,107,102,111,99,0],[82,0,-1,133,-88,-66,107,102,110,99,0],[82,0,-1,134,-89,-67,107,102,110,99,0],[82,0,-1,135,-90,-68,107,102,111,99,0],[82,0,-1,136,-91,-68,107,102,112,99,0],[82,0,-1,133,-94,-64,107,100,110,101,0],[82,0,-1,126,-105,-54,107,102,112,99,0],[82,0,-1,93,-159,-21,107,99,109,102,0],[82,0,-1,75,-188,-6,107,101,107,99,0],[82,0,-1,65,-206,4,106,100,112,100,0],[82,0,-1,59,-214,5,107,100,110,100,0],[82,0,-1,57,-219,8,100,99,108,99,0],[82,0,-1,55,-224,11,106,100,108,98,0],[82,0,-1,50,-232,9,106,98,114,101,0],[81,0,-1,48,-236,14,99,100,110,99,0],[81,0,-1,47,-240,14,100,99,109,101,0],[78,0,-7,46,-248,16,107,99,109,102,0],[77,0,-5,45,-252,18,107,99,108,99,0],[74,0,-1,41,-258,17,99,99,115,100,0],[74,0,-1,40,-260,18,99,99,115,100,0],[74,0,-1,40,-261,18,100,99,115,100,0],[73,0,-1,40,-261,18,100,99,115,100,0],[73,0,-1,40,-259,19,99,100,115,100,0],[69,0,-7,43,-260,22,106,99,110,100,0],[65,7,-1,39,-260,16,106,99,109,99,0],[64,5,-1,41,-254,17,99,99,110,99,0],[63,0,-1,44,-245,16,104,99,110,101,0],[56,0,-1,50,-239,13,100,98,114,101,0],[53,0,-1,57,-226,11,101,98,110,101,0],[47,0,-1,63,-207,6,106,99,112,100,0],[36,0,-5,77,-185,-1,108,99,108,99,0],[25,4,-4,92,-150,-14,107,100,108,101,0],[19,0,-1,124,-91,-41,108,101,111,101,0],[12,0,-1,171,-13,-91,107,101,111,99,0],[10,4,-1,215,56,-146,108,100,112,100,0],[9,7,-1,246,98,-188,111,100,110,100,0],[6,7,-5,268,122,-216,112,102,113,101,0],[2,0,-1,279,140,-235,114,102,118,100,0],[1,0,-1,293,152,-253,114,101,119,100,0],[1,0,-1,305,164,-271,115,102,118,100,0],[0,0,-2,312,171,-279,116,103,121,99,0],[0,0,-2,318,176,-287,117,102,128,101,0],[0,0,-2,322,180,-292,117,100,130,99,0],[0,0,-1,332,184,-307,111,77,114,74,0],[0,0,-1,342,186,-319,100,38,104,39,0],[0,0,-1,348,183,-322,103,25,107,24,0],[0,0,-1,357,181,-322,101,28,103,30,0],[0,0,-1,363,179,-319,106,53,99,49,0],[0,0,-1,365,177,-308,114,79,128,77,0],[0,0,-1,368,180,-288,120,99,157,94,0],[0,0,-1,379,180,-284,124,103,153,90,0],[0,0,-1,393,176,-285,124,103,166,91,0],[0,0,-1,403,182,-271,130,103,150,82,0],[0,0,-1,417,187,-259,133,102,117,64,0],[0,0,-1,429,197,-240,140,103,93,48,0],[0,0,-1,445,207,-223,100,100,100,100,0],[0,0,-1,515,203,-218,100,100,100,100,0],[0,0,-1,650,194,-207,100,100,100,100,0],[0,0,-1,875,180,-188,100,100,100,100,0],[0,0,-1,1109,166,-169,100,100,100,100,0],[0,0,-1,1378,149,-148,100,100,100,100,0],[0,0,-1,1541,139,-134,100,100,100,100,0],[0,0,-1,1842,121,-110,100,100,100,100,0],[0,0,-1,2135,102,-86,100,100,100,100,0],[0,0,-1,2405,86,-64,100,100,100,100,0],[0,0,-1,2620,72,-47,100,100,100,100,0],[0,0,-1,2709,67,-39,100,100,100,100,0],[0,-1,-1,2748,64,-36,100,100,100,100,0],[0,-1,-1,2814,60,-31,100,100,100,100,0],[0,-1,-1,2892,55,-25,100,100,100,100,0],[0,-1,-1,2947,52,-20,110,88,112,100,0],[0,0,-1,3025,33,-2,119,98,112,100,0],[0,0,-1,3112,28,1,108,98,109,100,0],[0,0,-1,3173,27,-3,108,98,108,99,0],[0,0,-1,3228,26,-6,108,98,108,99,0],[0,0,-1,3264,24,-6,107,98,107,101,0],[0,0,-1,3305,21,-6,108,99,104,101,0],[0,0,-1,3349,18,-7,107,101,107,101,0],[0,0,-1,3376,16,-6,107,101,100,98,0],[0,0,-1,3406,15,-6,104,101,99,97,0],[0,0,-1,3428,13,-7,103,101,103,97,0],[0,0,-1,3452,12,-6,101,101,103,100,0],[0,0,-1,3472,10,-6,102,99,102,101,0],[0,0,-1,3494,8,-4,104,97,104,101,0],[0,0,-1,3510,7,-3,103,97,104,101,0],[0,0,-1,3522,6,-3,102,97,105,99,0],[0,0,-1,3535,6,-2,102,97,103,98,0],[0,0,-1,3546,5,-1,105,97,103,98,0],[0,0,-1,3557,4,-2,104,99,104,98,0],[0,0,-1,3566,3,-1,105,101,105,99,0],[0,0,-1,3576,2,0,101,100,105,101,0],[0,0,-1,3584,2,1,101,100,105,101,0],[0,0,-1,3593,1,-1,101,100,104,100,0],[0,0,0,3599,0,1,102,100,101,100,0],[0,0,0,3600,0,0,100,100,100,100,0]],"bounce":[[0,0,0,0,0,0,100,100,100,100,0],[0,0,0,0,0,0,100,100,102,100,0],[0,0,-1,0,0,0,106,96,104,97,0],[0,1,-1,0,1,1,122,89,125,89,0],[0,9,-2,2,14,-2,165,76,168,76,0],[-3,16,-9,-3,23,-3,100,100,100,100,100],[-3,17,-10,-4,28,-4,100,100,100,100,100],[-3,18,-10,-4,31,-4,100,100,100,100,100],[-3,18,-10,-4,33,-4,100,100,100,100,100],[-3,19,-11,-4,34,-4,100,100,100,100,100],[-3,19,-11,-4,34,-4,100,100,100,100,100],[-3,19,-11,-4,34,-4,100,100,100,100,100],[-1,5,-4,-3,37,-5,100,100,100,100,100],[0,0,-1,-3,38,-5,100,100,100,100,100],[2,10,-6,-3,37,-5,100,100,100,100,100],[11,44,-23,-4,38,-6,100,100,100,100,100],[20,77,-40,-5,41,-8,100,100,100,100,100],[23,92,-48,-5,50,-16,100,100,100,100,100],[5,72,-12,-6,64,-26,100,100,100,100,100],[-48,27,52,-7,79,-37,100,100,100,100,100],[-126,0,98,-8,102,-51,100,100,100,100,100],[-156,0,92,-8,127,-69,100,100,100,100,100],[-165,0,86,-7,159,-90,100,100,100,100,100],[-167,0,79,-6,190,-111,100,100,100,100,100],[-164,0,59,-5,221,-130,100,100,100,100,100],[-159,0,47,-5,247,-147,100,100,100,100,100],[-150,0,30,-3,273,-163,100,100,100,100,100],[-139,0,17,-1,293,-175,100,100,100,100,100],[-128,0,4,-1,307,-183,100,100,100,100,100],[-113,0,-1,1,317,-188,100,100,100,100,100],[-98,0,-5,0,318,-190,100,100,100,100,100],[-76,0,-7,1,321,-193,100,100,100,100,100],[-54,0,-2,0,321,-193,100,100,100,100,100],[-38,0,-4,0,319,-191,100,100,100,100,100],[0,27,-18,5,315,-187,100,100,100,100,100],[32,98,-48,6,303,-179,100,100,100,100,100],[-58,90,-47,3,300,-159,100,100,100,100,100],[-91,81,-36,15,297,-137,100,100,100,100,100],[-117,55,-16,18,287,-86,100,100,100,100,100],[-132,41,10,27,275,-33,100,100,100,100,100],[-148,18,27,37,262,22,100,100,100,100,100],[-158,5,44,48,254,62,160,87,161,88,50],[-162,0,51,51,246,99,220,75,223,77,0],[-160,0,47,55,244,115,219,74,220,76,0],[-154,0,40,58,241,129,222,74,221,75,0],[-140,0,43,60,238,142,219,74,221,76,0],[-121,0,28,63,236,151,212,74,218,76,0],[-99,0,26,65,233,155,195,72,206,77,0],[-53,5,2,67,225,163,158,78,173,84,0],[19,18,-52,76,222,164,121,92,139,95,0],[-48,18,-44,77,219,164,112,97,123,100,0],[-97,6,17,72,213,164,106,97,114,96,0],[-121,1,38,71,206,164,105,97,110,98,0],[-130,0,45,68,201,161,105,98,108,97,0],[-131,0,45,66,194,156,105,97,107,97,0],[-130,0,45,64,184,148,105,98,108,97,0],[-128,0,48,60,168,136,105,98,107,98,0],[-113,0,45,53,146,115,105,97,107,97,0],[-103,0,51,48,126,101,104,98,105,96,0],[-76,0,45,41,97,78,104,97,104,98,0],[-41,0,45,36,80,61,105,98,103,97,0],[-50,0,27,34,64,48,106,96,104,97,0],[-65,0,12,33,51,38,105,98,102,98,0],[-67,0,6,31,41,28,106,98,104,98,0],[-65,0,-4,30,35,21,99,101,106,98,0],[-62,0,-1,29,26,16,99,98,107,101,0],[-40,0,-2,28,24,12,103,98,101,98,0],[-9,0,-2,28,22,10,107,101,101,98,0],[-40,0,-7,28,20,10,108,98,105,98,0],[-42,0,-5,27,19,9,108,100,104,99,0],[-17,0,-2,27,17,7,107,98,105,101,0],[1,0,-1,28,17,9,107,98,101,101,0],[1,0,-1,27,17,8,107,98,103,101,0],[1,0,-1,25,16,7,106,98,105,101,0],[1,0,-1,21,13,8,100,101,108,98,0],[1,0,-1,16,9,4,107,101,103,98,0],[1,0,-1,9,4,4,100,98,106,100,0],[0,0,0,2,1,1,102,100,101,100,0],[0,0,0,0,0,0,100,100,100,100,0]],"lookup":[[0,0,0,0,0,0,100,100,100,100,0],[0,0,0,2,0,-1,102,100,102,100,0],[1,0,-1,5,1,-4,106,101,106,101,0],[1,0,-2,38,16,-31,107,101,107,99,0],[1,0,-1,86,37,-78,107,101,108,101,0],[0,0,-2,166,69,-161,109,101,110,101,0],[0,0,-1,245,95,-248,111,102,112,101,0],[0,0,-1,280,107,-287,111,102,116,100,0],[0,0,-1,305,111,-320,112,102,114,99,0],[0,0,-1,319,114,-336,113,101,115,99,0],[0,0,-1,328,116,-347,112,103,116,101,0],[0,0,-1,331,117,-352,111,101,118,99,0],[0,0,-1,332,116,-353,111,101,118,99,0],[0,0,-1,331,117,-352,111,101,118,99,0],[0,0,-1,331,117,-353,111,101,119,101,0],[0,0,-1,328,121,-352,112,103,118,101,0],[0,0,-1,324,126,-350,111,101,115,99,0],[0,0,-1,318,132,-351,111,102,120,102,0],[0,0,-1,311,141,-347,111,100,115,100,0],[0,0,-1,301,154,-348,112,101,114,99,0],[0,0,-1,283,176,-343,113,102,115,100,0],[0,0,-1,260,206,-332,113,101,115,101,0],[0,0,-1,240,234,-324,115,102,114,99,0],[0,0,-1,227,251,-317,114,101,118,101,0],[0,0,-1,214,268,-308,114,102,115,100,0],[0,0,-1,205,280,-302,114,102,118,102,0],[0,0,-1,200,287,-299,116,103,118,102,0],[0,0,-1,198,291,-298,115,101,117,100,0],[0,0,-1,197,293,-298,115,101,117,101,0],[0,0,-1,197,293,-298,115,101,116,101,0],[0,0,-1,196,294,-297,115,101,117,101,0],[0,0,-1,200,297,-302,112,88,113,88,0],[0,0,-1,208,305,-312,104,45,105,45,0],[0,0,-1,207,306,-313,102,22,97,22,0],[0,0,-1,209,305,-316,103,25,102,27,0],[0,0,-1,208,304,-312,105,43,103,42,0],[0,0,-1,204,300,-308,108,72,110,73,0],[0,0,-1,197,296,-299,114,96,114,94,0],[0,0,-1,196,294,-297,115,101,117,101,0],[0,0,-1,196,294,-297,115,101,117,101,0],[0,0,-1,196,294,-297,115,101,117,101,0],[0,0,-1,196,294,-297,115,101,117,101,0],[0,0,-1,196,294,-297,115,101,117,101,0],[0,0,-1,196,294,-297,115,101,117,101,0],[0,0,-1,196,294,-297,115,101,117,101,0],[0,0,-1,196,293,-297,115,101,116,101,0],[0,0,-1,196,293,-297,114,101,117,101,0],[0,0,-1,193,293,-292,114,101,118,101,0],[0,0,-1,191,291,-291,114,101,116,101,0],[0,0,-1,189,286,-290,114,103,117,102,0],[0,0,-1,185,282,-285,113,100,115,102,0],[0,0,-1,177,274,-276,113,101,116,101,0],[0,0,-1,166,263,-266,111,101,115,101,0],[0,0,-1,151,244,-252,111,101,115,102,0],[0,0,-1,124,209,-226,108,101,111,100,0],[0,0,-1,105,180,-209,108,101,111,100,0],[0,0,-1,81,146,-189,107,100,110,101,0],[0,0,-1,70,127,-181,107,101,110,101,0],[0,0,-1,62,114,-176,107,101,112,101,0],[0,0,-1,55,101,-171,107,101,109,102,0],[0,0,-1,49,92,-166,107,102,111,101,0],[0,0,-1,45,83,-164,107,101,110,101,0],[0,0,-1,42,78,-162,107,101,109,101,0],[0,0,-1,40,73,-161,106,101,110,101,0],[0,0,-1,37,70,-157,106,101,109,101,0],[0,0,-1,35,66,-157,107,101,109,100,0],[0,0,-1,34,63,-159,107,101,109,101,0],[0,0,-1,33,61,-155,106,100,109,101,0],[0,0,-1,32,61,-155,107,101,111,101,0],[0,0,-1,31,60,-154,108,101,109,102,0],[0,0,-1,31,59,-154,108,101,109,102,0],[0,0,-1,31,59,-154,108,101,109,102,0],[0,0,-1,31,59,-154,108,101,109,101,0],[0,0,-1,31,59,-155,108,100,109,100,0],[0,0,-1,31,59,-155,108,99,109,99,0],[0,0,-1,32,59,-155,108,94,108,94,0],[0,0,-1,32,60,-155,107,73,109,74,0],[0,0,-1,32,60,-156,102,38,106,40,0],[0,0,-2,32,55,-154,103,24,105,25,0],[0,0,-2,32,49,-154,105,31,105,31,0],[0,0,-2,30,44,-152,106,62,108,62,0],[1,0,-2,27,37,-151,107,89,107,89,0],[1,0,-1,27,32,-148,107,101,107,100,0],[1,0,-2,28,28,-148,107,100,107,101,0],[1,0,-2,28,23,-147,107,100,107,99,0],[1,0,-1,29,11,-145,107,78,108,77,0],[2,0,-1,30,-9,-140,103,41,107,42,0],[9,0,-1,33,-32,-136,103,24,101,23,0],[9,0,-1,32,-46,-132,103,38,102,38,0],[9,0,-1,32,-56,-131,106,67,107,67,0],[10,0,-2,32,-62,-129,107,90,108,89,0],[10,0,-1,32,-68,-127,107,101,109,100,0],[10,0,-1,31,-72,-127,107,102,109,102,0],[10,0,-1,32,-74,-126,107,101,109,101,0],[10,0,-1,33,-64,-129,107,102,109,102,0],[9,0,-1,36,-32,-136,107,101,109,101,0],[5,0,-7,38,-15,-141,108,102,110,101,0],[2,0,-1,42,-9,-145,107,101,109,100,0],[1,0,-1,50,2,-150,107,102,109,101,0],[1,0,-1,57,9,-154,107,101,108,100,0],[1,0,-2,58,13,-159,107,101,109,101,0],[1,0,-1,43,10,-118,105,101,107,100,0],[0,0,0,15,3,-41,102,100,102,100,0],[0,0,0,0,0,0,100,100,100,100,0]]};
  const ACTIONS = {
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
  };
  // The moves of the reference video (see CLIPS at the end of this file). Each frame is
  // [dy, sx, sy, yaw, pitch, roll, suL, svL, suR, svR, happy]: body up/down and squash, the face turning on the ball, eye squash.
  Object.entries(CLIPS).forEach(([name, f]) => {
    ACTIONS['v_' + name] = {
      d: Math.round(((f.length - 1) / 30) * 1000),
      run(el) {
        const sh = WB[el.dataset.shape] || WB.orb;
        el._clip = { f, t0: performance.now(), m: Math.random() < 0.5 ? -1 : 1, bw: sh[1] - sh[0], S: { su: [1, 1], sv: [1, 1], hap: 0 } };
        el.classList.add('perf');
      },
    };
  });
  // the names the rest of the app calls
  const ALIAS = { lookAround: 'v_puff', glance: 'v_lookup', bounce: 'v_bounce', jump: 'v_bounce', doubleHop: 'v_bounce', tilt: 'v_puff', doubleBlink: 'v_blink', happyHops: 'v_bounce', shyTurn: 'v_lookup', squish: 'v_puff', peek: 'v_lookup', nod: 'v_puff', wiggle: 'v_puff', shimmy: 'v_puff', stretch: 'v_bounce', sleepy: 'v_blink', heartbeat: 'v_puff' };

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
  const IDLE = ['v_puff', 'v_puff', 'v_lookup', 'v_lookup', 'v_bounce', 'v_bounce', 'v_curious', 'v_jump', 'v_shrink', 'v_spin']; // spins only happen when a bot replies

  // ---------- queue ----------
  const isBusy = (el) => !!stateOf(el) || el._wantState !== undefined;
  const GAP = 180; // little rest between queued moves

  function play(el, action) {
    if (!el) return;
    const own = 'acc_' + (el.dataset.acc || '');
    let name = action === 'acc' ? (ACTIONS[own] ? own : null) : ALIAS[action] || action; // 'acc' = this bot's own accessory move
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
    el._nextIdle = performance.now() + (el.offsetWidth >= 60 ? 800 : 2200) + Math.random() * 2400; // a rest, then the next move
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
    addEventListener('mousemove', (e) => { mouse = { x: e.clientX, y: e.clientY, t: performance.now() }; if (calmFor > GRACE) wakeEyes(); });
    document.addEventListener('mouseleave', () => (mouse = null));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Every bot rests for a moment, then does the next move from the video.
    setInterval(() => {
      if (document.hidden) return;
      const now = performance.now();
      for (const c of document.querySelectorAll('.char')) {
        // every bot now and then smiles a little wider (or says "oh") on its own, like it blinks
        if (c._moNext === undefined) c._moNext = now + 2000 + Math.random() * 8000;
        if (now >= c._moNext && !isBusy(c) && !c._playing && c.querySelector('.c-mouth') && visible(c)) {
          const oh = Math.random() < 0.3;
          c._moHold = { s: oh ? 1 : 1.55 + Math.random() * 0.35, o: oh ? 0.4 : Math.random() < 0.4 ? 0.3 : 0, until: now + 800 + Math.random() * 600 };
          c._moNext = now + 6500 + Math.random() * 8500;
          wakeEyes();
        }
        if (c.classList.contains('still') || isBusy(c) || c._playing || !visible(c)) continue; // .still = a bot that only blinks and looks (website cards)
        if (c._nextIdle === undefined) c._nextIdle = now + 400 + Math.random() * 2600;
        if (now >= c._nextIdle) play(c);
      }
    }, 400);
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
  window.Characters = { setFace, rotZXY, mul3, gazeM, accessorySvg, fitAccessory, ACCESSORIES, makeCharacter, characterSvg, COLORS, play, startIdle, setState, ACTIONS, tones, MOUTHS: Object.keys(MOUTH), IDLE };
})();
