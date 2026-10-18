/* Bot characters: simple, original shapes with faces, generated per bot.
   Each character = { shape, color, eyes, extra, mouth }. Rendered as inline SVG
   so they can blink and animate while working. */
(function () {
  // Only soft, round shapes. Older bots with pointy shapes are shown as their round cousin.
  const SHAPES = ['orb', 'pebble', 'blob', 'bun', 'capsule', 'bean'];
  const ROUND = { drop: 'blob', star: 'orb', cat: 'bun', octo: 'pebble', ghost: 'capsule', mushroom: 'bean' };
  const roundShape = (s) => ROUND[s] || (SHAPES.includes(s) ? s : 'orb');
  const COLORS = ['#FF6B5B', '#4F8BFF', '#FFB020', '#2FCB7A', '#A77BFF', '#FF7AB6', '#F2F2F2', '#2DD4BF'];
  const EYES = ['dots', 'ovals', 'wide', 'dots', 'ovals'];
  const EXTRAS = ['none', 'antenna', 'sprout', 'spark', 'none', 'none', 'hat'];
  const MOUTHS = ['none', 'smile', 'none', 'o'];

  // Top of each body (for antenna/sprout), and eye line.
  const GEO = {
    orb: { top: 16, eyeY: 54 },
    pebble: { top: 18, eyeY: 52 },
    drop: { top: 12, eyeY: 60, noExtra: true },
    ghost: { top: 17, eyeY: 48 },
    bun: { top: 26, eyeY: 58, noExtra: true },
    capsule: { top: 12, eyeY: 44 },
    cat: { top: 26, eyeY: 58, noExtra: true },
    mushroom: { top: 16, eyeY: 66, noExtra: true },
    octo: { top: 12, eyeY: 46 },
    star: { top: 10, eyeY: 56, noExtra: true },
    blob: { top: 14, eyeY: 55 },
    bean: { top: 24, eyeY: 57 },
  };

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
    return { shape: pick(r, SHAPES), color, eyes: pick(r, EYES), extra: pick(r, EXTRAS), mouth: pick(r, MOUTHS) };
  }

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const c = (v) => Math.max(0, Math.min(255, Math.round(v + amt * 255)));
    return '#' + [c(n >> 16), c((n >> 8) & 255), c(n & 255)].map((v) => v.toString(16).padStart(2, '0')).join('');
  }

  function bodyPath(shape, fill) {
    switch (shape) {
      case 'orb': return `<circle cx="50" cy="55" r="39" fill="${fill}"/>`;
      case 'blob': return `<path d="M50 14 C74 14 90 30 90 54 C90 78 74 93 50 93 C26 93 10 78 10 54 C10 30 26 14 50 14Z" fill="${fill}"/>`;
      case 'bean': return `<ellipse cx="50" cy="58" rx="42" ry="34" fill="${fill}"/>`;
      case 'pebble': return `<rect x="12" y="18" width="76" height="72" rx="27" fill="${fill}"/>`;
      case 'drop': return `<path d="M50 12 C60 26 88 42 88 63 C88 81 71 92 50 92 C29 92 12 81 12 63 C12 42 40 26 50 12Z" fill="${fill}"/>`;
      case 'ghost': return `<path d="M16 52 C16 32 31 17 50 17 C69 17 84 32 84 52 V86 C84 90 80 91 77 88 L70 82 L62 89 C60 91 57 91 55 89 L50 84 L45 89 C43 91 40 91 38 89 L30 82 L23 88 C20 91 16 90 16 86Z" fill="${fill}"/>`;
      case 'bun': return `<circle cx="27" cy="33" r="11" fill="${fill}"/><circle cx="73" cy="33" r="11" fill="${fill}"/><ellipse cx="50" cy="60" rx="40" ry="31" fill="${fill}"/>`;
      case 'capsule': return `<rect x="20" y="12" width="60" height="80" rx="30" fill="${fill}"/>`;
      case 'cat': return `<path d="M17 44 L20 14 C21 10 25 10 27 12 L42 28 Z" fill="${fill}" stroke="${fill}" stroke-width="6" stroke-linejoin="round"/><path d="M83 44 L80 14 C79 10 75 10 73 12 L58 28 Z" fill="${fill}" stroke="${fill}" stroke-width="6" stroke-linejoin="round"/><path d="M25 18 L28 32 L36 28Z M75 18 L72 32 L64 28Z" fill="#ff9fb8" opacity=".55"/><ellipse cx="50" cy="60" rx="39" ry="32" fill="${fill}"/>`;
      case 'mushroom': return `<rect x="27" y="46" width="46" height="46" rx="18" fill="#F4EADC"/><path d="M8 50 C8 26 27 12 50 12 C73 12 92 26 92 50 C92 55 88 57 83 57 L17 57 C12 57 8 55 8 50Z" fill="${fill}"/><circle cx="30" cy="32" r="6" fill="#fff" opacity=".85"/><circle cx="58" cy="24" r="4.5" fill="#fff" opacity=".85"/><circle cx="74" cy="40" r="5" fill="#fff" opacity=".85"/>`;
      case 'octo': return `<path d="M16 48 C16 28 31 12 50 12 C69 12 84 28 84 48 V70 C84 76 80 78 76 74 C74 84 68 90 63 82 C60 92 54 94 50 84 C46 94 40 92 37 82 C32 90 26 84 24 74 C20 78 16 76 16 70Z" fill="${fill}"/>`;
      case 'star': return `<path d="M50 14 L60.5 37 L85 39.5 L66.5 56 L72 81 L50 68 L28 81 L33.5 56 L15 39.5 L39.5 37Z" fill="${fill}" stroke="${fill}" stroke-width="12" stroke-linejoin="round"/>`;
    }
    return '';
  }

  // Each eye = socket (optional) + pupil group, so pupils can move independently.
  function eyesSvg(style, y, ink) {
    const eye = (x, side) => {
      let socket = '', pupil = '';
      if (style === 'wide') {
        socket = `<circle cx="${x}" cy="${y}" r="9.2" fill="#fff"/>`;
        pupil = `<circle cx="${x}" cy="${y + 0.6}" r="4.8" fill="${ink}"/><circle cx="${x + 1.6}" cy="${y - 1.2}" r="1.6" fill="#fff"/><circle cx="${x - 1.7}" cy="${y + 2.4}" r=".75" fill="#fff" opacity=".7"/>`;
      } else if (style === 'ovals') {
        pupil = `<ellipse cx="${x}" cy="${y}" rx="4.8" ry="7.8" fill="${ink}"/><ellipse cx="${x + 1.5}" cy="${y - 3}" rx="1.5" ry="2.2" fill="#fff" opacity=".92"/><circle cx="${x - 1.6}" cy="${y + 3.6}" r=".8" fill="#fff" opacity=".6"/>`;
      } else {
        pupil = `<circle cx="${x}" cy="${y}" r="6.4" fill="${ink}"/><circle cx="${x + 1.9}" cy="${y - 2.1}" r="2.1" fill="#fff" opacity=".95"/><circle cx="${x - 2.2}" cy="${y + 2.6}" r=".9" fill="#fff" opacity=".6"/>`;
      }
      return `<g class="c-eye c-eye-${side}">${socket}<g class="c-pupil">${pupil}</g></g>`;
    };
    return eye(38, 'l') + eye(62, 'r');
  }

  // ---------- Accessories: separate items you can put on any bot ----------
  // Where they sit on each shape: hat line (y), hat scale (s), side of the head (w), chest (b).
  // The real outline of each body (same numbers as bodyPath), so accessories sit ON the head.
  const rr = (x, y, x0, y0, w, h, r) => { const cx = Math.min(Math.max(x, x0 + r), x0 + w - r), cy = Math.min(Math.max(y, y0 + r), y0 + h - r); return (x - cx) ** 2 + (y - cy) ** 2 <= r * r; };
  const INSIDE = {
    orb: (x, y) => (x - 50) ** 2 + (y - 55) ** 2 <= 39 * 39,
    pebble: (x, y) => rr(x, y, 12, 18, 76, 72, 27),
    blob: (x, y) => Math.abs((x - 50) / 40) ** 2.3 + Math.abs((y - 53.5) / 39.5) ** 2.3 <= 1,
    bun: (x, y) => ((x - 50) / 40) ** 2 + ((y - 60) / 31) ** 2 <= 1,
    capsule: (x, y) => rr(x, y, 20, 12, 60, 80, 30),
    bean: (x, y) => ((x - 50) / 42) ** 2 + ((y - 58) / 34) ** 2 <= 1,
  };
  const CENTER = { orb: [50, 55], pebble: [50, 54], blob: [50, 53.5], bun: [50, 60], capsule: [50, 52], bean: [50, 58] };
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
    tophat: [23, 0.64, 0.8], crown: [19, 0.56, 0.86], beanie: [24, 0.97, 0.97], cap: [20, 0.84, 0.93], party: [13, 0.36, 0.8],
    wizard: [26, 0.8, 0.82], chef: [15, 0.52, 0.86], cowboy: [15, 0.5, 0.9], bunny: [20, 0.6, 0.9],
  };
  // How each bot wears things — a little tilt and shift so it looks worn, not pasted on.
  // [rotate°, shift x, extra scale]
  const WEAR = {
    orb: { _: [-8, -2, 1], party: [12, 3, 1], cap: [-4, -2, 1], cowboy: [-3, 0, 1.04], chef: [-6, -1, 1] },
    pebble: { _: [0, 0, 1.02], cowboy: [0, 0, 1.06], tophat: [-5, -3, 1], party: [-10, -6, 1], wizard: [8, 4, 1] },
    blob: { _: [7, 2, 1], crown: [9, 3, 1], cap: [5, 1, 1], cowboy: [3, 1, 1.04] },
    capsule: { _: [-5, -1, 1.12], beanie: [0, 0, 1.08], party: [10, 2, 1.1], cowboy: [-2, 0, 1.1] },
    bean: { _: [9, 6, 1], beanie: [4, 2, 1], cowboy: [3, 1, 1.06], chef: [8, 5, 1] },
    bun: { _: [0, 0, 1], tophat: [-9, -2, 1.05], crown: [0, 0, 1.05], party: [14, 4, 1.05], wizard: [-10, -2, 1.05], chef: [-4, 0, 1.05], cap: [8, 1, 1.05] },
  };
  const wearOf = (shape, acc) => (WEAR[shape] && (WEAR[shape][acc] || WEAR[shape]._)) || [0, 0, 1];
  function hatPlace(shape, acc) {
    const G = geo(shape), [bw, frac, sink] = HATFIT[acc] || [20, 0.6, 0.85];
    let target = G.upper * frac;
    if (shape === 'bun') target = Math.min(target, acc === 'cowboy' ? 30 : 23); // sit between the ears
    const s = target / bw;
    let y = G.top; while (y < G.bottom && G.half(y) < target * sink) y += 0.25;
    y = Math.min(y + (acc === 'beanie' ? 1.5 : 0.5), (GEO[shape] || GEO.orb).eyeY - (acc === 'beanie' ? 11 + 8 * s : 12)); // never over the eyes
    return { x: 50, y, s };
  }
  // Accessories made for the bot with round ears (ears at 27,33 and 73,33, r 11).
  function bunAcc(acc, id, shadowDef, uidBase) {
    const sh = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#${id}sh)" clip-path="url(#${uidBase}k)"/>`;
    switch (acc) {
      case 'beanie': // pulled over the head, with knitted bumps where the ears are
        return `<g class="c-acc c-acc-beanie"><defs>${grad(id, '#FF8A3D')}${shadowDef}</defs>${sh(50, 47, 40, 5)}
          <path d="M13 45 C11 31 17 20 27 20 C33 20 36 24 38.5 27 C45 24.5 55 24.5 61.5 27 C64 24 67 20 73 20 C83 20 89 31 87 45 Q50 51 13 45Z" fill="url(#${id})"/>
          <path d="M21 26 C24 23 28 22.5 31 24" stroke="#fff" stroke-opacity=".35" stroke-width="2.2" fill="none" stroke-linecap="round"/>
          <path d="M11 41 Q50 47.5 89 41 Q91 45.5 89 50 Q50 56.5 11 50 Q9 45.5 11 41Z" fill="#F4EFE6"/>
          <path d="M18 42.4 v8.6 M26 43.5 v8.6 M34 44.3 v8.6 M42 44.7 v8.6 M50 44.8 v8.6 M58 44.7 v8.6 M66 44.3 v8.6 M74 43.5 v8.6 M82 42.4 v8.6" stroke="#ddd6c8" stroke-width="1.2"/>
          <circle cx="50" cy="23" r="5.5" fill="#F4EFE6"/><circle cx="48.5" cy="21.3" r="1.8" fill="#fff"/></g>`;
      case 'headphones': // ear-muff style: the cups go right over its round ears
        return `<g class="c-acc c-acc-headphones"><defs>${grad(id, '#2a2a36')}</defs>
          <path d="M27 24 C28 8 72 8 73 24" stroke="#23232c" stroke-width="5" fill="none" stroke-linecap="round"/>
          <circle cx="27" cy="33" r="13" fill="url(#${id})"/><circle cx="73" cy="33" r="13" fill="url(#${id})"/>
          <circle cx="27" cy="33" r="7.5" fill="#FF6B5B"/><circle cx="73" cy="33" r="7.5" fill="#FF6B5B"/>
          <circle cx="24.5" cy="30" r="2.2" fill="#fff" opacity=".45"/><circle cx="70.5" cy="30" r="2.2" fill="#fff" opacity=".45"/></g>`;
      case 'headbow': // a bow on its right ear
        return `<g class="c-acc c-acc-headbow" transform="translate(76 25) rotate(24) scale(.82)"><defs>${grad(id, '#FF7AB6')}</defs><path d="M0 0 C-6 -9 -18 -10 -18 -1 C-18 8 -6 7 0 0Z" fill="url(#${id})"/><path d="M0 0 C6 -9 18 -10 18 -1 C18 8 6 7 0 0Z" fill="url(#${id})"/><ellipse cx="0" cy="0" rx="4" ry="4.6" fill="#E9559A"/></g>`;
      case 'flower': // tucked behind its left ear
        return `<g class="c-acc c-acc-flower" transform="translate(21 27) rotate(-15) scale(.85)">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-7.5" rx="5.2" ry="7.5" fill="#fff" transform="rotate(${a})"/>`).join('')}<circle cx="0" cy="0" r="5" fill="#FFB020"/><circle cx="-1.5" cy="-1.5" r="1.6" fill="#FFE07A"/></g>`;
      case 'bunny': // its own ears become long bunny ears
        return `<g class="c-acc c-acc-bunny"><defs>${grad(id, '#F6F6F8')}</defs>
          <g transform="rotate(-14 30 30)"><ellipse cx="30" cy="12" rx="8" ry="20" fill="url(#${id})"/><ellipse cx="30" cy="13" rx="4" ry="14" fill="#FFB3CC"/></g>
          <g transform="rotate(14 70 30)"><ellipse cx="70" cy="12" rx="8" ry="20" fill="url(#${id})"/><ellipse cx="70" cy="13" rx="4" ry="14" fill="#FFB3CC"/></g></g>`;
      case 'cowboy': // the brim rests on top of the ears
        return `<g class="c-acc c-acc-cowboy"><defs>${grad(id, '#C8894E')}${shadowDef}</defs>${sh(50, 27, 34, 5)}<g transform="translate(50 24) rotate(-2) scale(1.32)">${COWBOY(id)}</g></g>`;
    }
    return '';
  }
  const FACEWEAR = new Set(['shades', 'glasses']); // move with the face
  const ACCESSORIES = [
    { id: 'none', name: 'None' },
    { id: 'tophat', name: 'Top hat' }, { id: 'crown', name: 'Crown' }, { id: 'beanie', name: 'Beanie' }, { id: 'cap', name: 'Cap' },
    { id: 'party', name: 'Party hat' }, { id: 'wizard', name: 'Wizard hat' }, { id: 'chef', name: 'Chef hat' }, { id: 'cowboy', name: 'Cowboy hat' },
    { id: 'halo', name: 'Halo' }, { id: 'bunny', name: 'Bunny ears' }, { id: 'headbow', name: 'Hair bow' }, { id: 'flower', name: 'Flower' },
    { id: 'headphones', name: 'Headphones' }, { id: 'shades', name: 'Sunglasses' }, { id: 'glasses', name: 'Glasses' }, { id: 'bowtie', name: 'Bow tie' },
  ];
  // soft 3D fill: light top-left → darker bottom-right, like the bots
  function grad(id, c, dir = 'v') {
    const x2 = dir === 'h' ? '1' : '0.35', y2 = dir === 'h' ? '0' : '1';
    return `<linearGradient id="${id}" x1="0" y1="0" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="${shade(c, 0.2)}"/><stop offset=".55" stop-color="${c}"/><stop offset="1" stop-color="${shade(c, -0.2)}"/></linearGradient>`;
  }
  const gloss = (x, y, rx, ry, rot = -20) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".35" transform="rotate(${rot} ${x} ${y})"/>`;
  const COWBOY = (id) => `<path d="M-17.5 3 L-17.5 -1 C-17.5 -11 -15 -19 -10 -21.5 C-6 -23 -3.5 -19 0 -19 C3.5 -19 6 -23 10 -21.5 C15 -19 17.5 -11 17.5 -1 L17.5 3 Z" fill="url(#${id})"/>
    <path d="M-2 -19 C-1 -15 1 -15 2 -19" stroke="#8a5429" stroke-width="1.4" fill="none" stroke-linecap="round"/>
    <path d="M-17.4 -6.5 C-5 -4.8 5 -4.8 17.4 -6.5 L17.6 -2 C5 -0.4 -5 -0.4 -17.6 -2Z" fill="#4A2A14"/>
    <circle cx="0" cy="-3.6" r="1.9" fill="#F5C24B"/>
    <path d="M-33 -9 C-31 -2 -22 3 0 3 C22 3 31 -2 33 -9 C34 -4 30 6 0 7 C-30 6 -34 -4 -33 -9Z" fill="#9C5E2C"/>
    <path d="M-33 -9 C-30 -3 -20 0.5 0 0.5 C20 0.5 30 -3 33 -9 C31 -2 22 3 0 3 C-22 3 -31 -2 -33 -9Z" fill="#C8894E"/>
    <ellipse cx="-8" cy="-14" rx="2" ry="4.5" fill="#fff" opacity=".22" transform="rotate(12 -8 -14)"/>`;
  function accSvg(acc, shape, eyeY, uidBase) {
    if (!acc || acc === 'none') return '';
    const id = uidBase + 'a';
    const G = geo(shape), P = HATFIT[acc] ? hatPlace(shape, acc) : null;
    const [rot, dx, ks] = wearOf(shape, acc);
    // a soft shadow where the hat touches the head makes it look worn
    const touch = (hw) => P ? `<ellipse cx="${(P.x + dx).toFixed(1)}" cy="${(P.y + 2).toFixed(1)}" rx="${(hw * P.s * ks).toFixed(1)}" ry="${(4 * P.s).toFixed(1)}" fill="url(#${id}sh)" clip-path="url(#${uidBase}k)" transform="rotate(${rot} ${P.x + dx} ${P.y})"/>` : '';
    const shadowDef = `<radialGradient id="${id}sh"><stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>`;
    const hat = (defs, body) => `<g class="c-acc c-acc-${acc}"><defs>${defs}${shadowDef}</defs>${touch((HATFIT[acc] || [20])[0])}<g transform="translate(${(P.x + dx).toFixed(1)} ${P.y.toFixed(1)}) rotate(${rot}) scale(${(P.s * ks).toFixed(3)})">${body}</g></g>`;
    // The bear-eared bot gets its own versions that work with its ears.
    if (shape === 'bun') {
      const bunSpecial = bunAcc(acc, id, shadowDef, uidBase);
      if (bunSpecial) return bunSpecial;
    }
    switch (acc) {
      case 'tophat': return hat(grad(id, '#2a2a36'),
        `<ellipse cx="0" cy="0" rx="23" ry="4.6" fill="#15151c"/><rect x="-14" y="-27" width="28" height="27" rx="4" fill="url(#${id})"/><rect x="-14" y="-9" width="28" height="5.5" fill="#E0445E"/><ellipse cx="0" cy="-27" rx="14" ry="3" fill="#3a3a48"/>${gloss(-8, -19, 2.2, 6, 0)}`);
      case 'crown': return hat(grad(id, '#FFC93C'),
        `<path d="M-19 1 L-21 -17 L-10.5 -9 L0 -22 L10.5 -9 L21 -17 L19 1 Q0 5 -19 1Z" fill="url(#${id})" stroke="#E0A21C" stroke-width="1.6" stroke-linejoin="round"/><circle cx="-21" cy="-18" r="2.6" fill="#FFE07A"/><circle cx="0" cy="-23" r="2.8" fill="#FFE07A"/><circle cx="21" cy="-18" r="2.6" fill="#FFE07A"/><circle cx="-9" cy="-3.5" r="2.4" fill="#FF4D6D"/><circle cx="0" cy="-4" r="2.6" fill="#4F8BFF"/><circle cx="9" cy="-3.5" r="2.4" fill="#2FCB7A"/>${gloss(-12, -9, 2, 5, 10)}`);
      case 'beanie': return hat(grad(id, '#FF8A3D'),
        `<path d="M-23 -3 C-23 -28 23 -28 23 -3 Q0 1 -23 -3Z" fill="url(#${id})"/><path d="M-12 -18 C-8 -22 -2 -23 3 -22" stroke="#fff" stroke-opacity=".3" stroke-width="2.4" fill="none" stroke-linecap="round"/><path d="M-25 -7 Q0 -2 25 -7 Q27 -2 25 3 Q0 8 -25 3 Q-27 -2 -25 -7Z" fill="#F4EFE6"/><path d="M-18 -5.5 v10 M-12 -4.4 v10 M-6 -3.8 v10 M0 -3.6 v10 M6 -3.8 v10 M12 -4.4 v10 M18 -5.5 v10" stroke="#ddd6c8" stroke-width="1.2"/><circle cx="0" cy="-23" r="6" fill="#F4EFE6"/><circle cx="-1.8" cy="-25" r="2" fill="#fff"/>`);
      case 'cap': return hat(grad(id, '#4F8BFF'),
        `<path d="M-20 0 C-20 -22 20 -22 20 0 Q0 4 -20 0Z" fill="url(#${id})"/><path d="M8 -1 C18 -4 32 -3 35 1 C32 4 16 4 6 3 Z" fill="#2F66D8"/><circle cx="0" cy="-16.5" r="2.4" fill="#2F66D8"/><path d="M0 -16 V0" stroke="#2F66D8" stroke-width="1.3" opacity=".6"/>${gloss(-9, -11, 2.4, 5, 20)}`);
      case 'party': return hat(`<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF6B5B"/><stop offset=".25" stop-color="#FF6B5B"/><stop offset=".25" stop-color="#FFB020"/><stop offset=".5" stop-color="#FFB020"/><stop offset=".5" stop-color="#2FCB7A"/><stop offset=".75" stop-color="#2FCB7A"/><stop offset=".75" stop-color="#4F8BFF"/><stop offset="1" stop-color="#4F8BFF"/></linearGradient>`,
        `<g transform="rotate(-10)"><path d="M-13 1 L0 -34 L13 1 Q0 5 -13 1Z" fill="url(#${id})" stroke-linejoin="round"/><circle cx="0" cy="-35" r="5" fill="#fff"/><circle cx="-5" cy="-11" r="1.4" fill="#fff"/><circle cx="4" cy="-20" r="1.2" fill="#fff"/><circle cx="6" cy="-6" r="1.3" fill="#fff"/></g>`);
      case 'wizard': return hat(grad(id, '#6B4DF0'),
        `<ellipse cx="0" cy="0" rx="26" ry="5" fill="#4B32C8"/><path d="M-15 -1 C-12 -14 -6 -26 4 -38 C6 -40 9 -39 8 -36 C6 -26 11 -12 15 -1 Z" fill="url(#${id})"/><path d="M-14 -5 C-4 -2 6 -2 14 -5" stroke="#FFC93C" stroke-width="3" fill="none"/><path d="M-3 -18 l1.4 3 3 1.4 -3 1.4 -1.4 3 -1.4 -3 -3 -1.4 3 -1.4Z" fill="#FFE07A"/><path d="M5 -28 l1 2 2 1 -2 1 -1 2 -1 -2 -2 -1 2 -1Z" fill="#FFE07A"/>`);
      case 'chef': return hat(grad(id, '#ffffff'),
        `<rect x="-15" y="-10" width="30" height="11" rx="3" fill="#F1F1F4"/><path d="M-15 -8 h30" stroke="#dcdce4" stroke-width="1"/><circle cx="-12" cy="-17" r="9" fill="url(#${id})"/><circle cx="12" cy="-17" r="9" fill="url(#${id})"/><circle cx="0" cy="-23" r="11" fill="url(#${id})"/><circle cx="-4" cy="-27" r="3" fill="#fff"/>`);
      case 'cowboy': return hat(grad(id, '#C8894E'), COWBOY(id));
      case 'halo': return `<g class="c-acc c-acc-halo" transform="translate(50 ${(G.top - 9).toFixed(1)}) scale(${Math.min(1.2, (G.upper * 0.55) / 20).toFixed(3)})"><ellipse cx="0" cy="0" rx="20" ry="5.5" fill="none" stroke="#FFE27A" stroke-width="7" opacity=".25"/><ellipse cx="0" cy="0" rx="20" ry="5.5" fill="none" stroke="#FFD23F" stroke-width="3.6"/><ellipse cx="-7" cy="-4" rx="5" ry="1" fill="#fff" opacity=".7"/></g>`;
      case 'bunny': {
        const pts = []; for (let a = -160; a <= -20; a += 10) pts.push(G.edge(a, 1.5));
        const band = 'M' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L');
        const ear = (deg, tilt) => { const [x, y] = G.edge(deg, 3); return `<g transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${tilt})"><ellipse cx="0" cy="-17" rx="7" ry="19" fill="url(#${id})"/><ellipse cx="0" cy="-16" rx="3.6" ry="13" fill="#FFB3CC"/></g>`; };
        const sp = shape === 'capsule' ? 16 : shape === 'bun' ? 14 : 22;
        return `<g class="c-acc c-acc-bunny"><defs>${grad(id, '#F6F6F8')}</defs>${ear(-90 - sp, -12)}${ear(-90 + sp, 12)}<path d="${band}" stroke="#E8E8EE" stroke-width="3.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      }
      case 'headbow': { const [bx, by] = G.edge(shape === 'bun' ? -30 : shape === 'capsule' ? -62 : -52, 2); return `<g class="c-acc c-acc-headbow" transform="translate(${bx.toFixed(1)} ${by.toFixed(1)}) rotate(${shape === 'capsule' ? 28 : 38}) scale(${shape === 'capsule' ? 0.8 : 0.9})"><defs>${grad(id, '#FF7AB6')}</defs><path d="M0 0 C-6 -9 -18 -10 -18 -1 C-18 8 -6 7 0 0Z" fill="url(#${id})"/><path d="M0 0 C6 -9 18 -10 18 -1 C18 8 6 7 0 0Z" fill="url(#${id})"/><ellipse cx="0" cy="0" rx="4" ry="4.6" fill="#E9559A"/>${gloss(-11, -4, 3, 1.6, -10)}${gloss(11, -4, 3, 1.6, 10)}</g>`; }
      case 'flower': { const [fx, fy] = G.edge(shape === 'bun' ? -150 : shape === 'capsule' ? -118 : -128, 3); return `<g class="c-acc c-acc-flower" transform="translate(${fx.toFixed(1)} ${fy.toFixed(1)}) scale(${shape === 'capsule' ? 0.82 : 0.95})">${[0, 72, 144, 216, 288].map((a) => `<ellipse cx="0" cy="-7.5" rx="5.2" ry="7.5" fill="#fff" transform="rotate(${a})"/>`).join('')}<circle cx="0" cy="0" r="5" fill="#FFB020"/><circle cx="-1.5" cy="-1.5" r="1.6" fill="#FFE07A"/></g>`; }
      case 'headphones': {
        const y = Math.max(G.top + 18, eyeY - 6), w = G.half(y) + 3;
        return `<g class="c-acc c-acc-headphones"><defs>${grad(id, '#2a2a36')}</defs><path d="M${50 - w + 4} ${y} C${50 - w + 2} ${G.top - 13} ${50 + w - 2} ${G.top - 13} ${50 + w - 4} ${y}" stroke="#23232c" stroke-width="5" fill="none" stroke-linecap="round"/><rect x="${50 - w - 5}" y="${y - 10}" width="13" height="22" rx="6" fill="url(#${id})"/><rect x="${50 + w - 8}" y="${y - 10}" width="13" height="22" rx="6" fill="url(#${id})"/><rect x="${50 - w + 4}" y="${y - 7}" width="4" height="16" rx="2" fill="#FF6B5B"/><rect x="${50 + w - 8}" y="${y - 7}" width="4" height="16" rx="2" fill="#FF6B5B"/></g>`;
      }
      case 'shades': {
        const y = eyeY;
        const tilt = { blob: -3, bean: 3, orb: -2 }[shape] || 0;
        return `<g class="c-acc c-acc-shades" transform="rotate(${tilt} 50 ${y})"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#3a2d5c"/><stop offset="1" stop-color="#0d0a18"/></linearGradient></defs><path d="M26 ${y - 7} h48" stroke="#111" stroke-width="2.6" stroke-linecap="round"/><rect x="25" y="${y - 8}" width="24" height="16" rx="7" fill="url(#${id})" stroke="#111" stroke-width="1.6"/><rect x="51" y="${y - 8}" width="24" height="16" rx="7" fill="url(#${id})" stroke="#111" stroke-width="1.6"/><path d="M29 ${y - 4} l6 0" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/><path d="M55 ${y - 4} l6 0" stroke="#fff" stroke-opacity=".55" stroke-width="2" stroke-linecap="round"/></g>`;
      }
      case 'glasses': {
        const y = eyeY;
        return `<g class="c-acc c-acc-glasses" fill="none" stroke="#1b1b22" stroke-width="2.4"><circle cx="38" cy="${y}" r="11" fill="#fff" fill-opacity=".12"/><circle cx="62" cy="${y}" r="11" fill="#fff" fill-opacity=".12"/><path d="M47.5 ${y - 2} q2.5 -3 5 0"/><path d="M33 ${y - 6} q3 -2.5 6 -2" stroke="#fff" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/></g>`;
      }
      case 'bowtie': {
        const y = Math.min(G.bottom - 9, eyeY + 27), k = Math.min(1.25, (G.half(y) * 0.8) / 17);
        return `<g class="c-acc c-acc-bowtie" transform="translate(50 ${y.toFixed(1)}) rotate(${(-wearOf(shape, 'bowtie')[0] * 0.6).toFixed(1)}) scale(${k.toFixed(3)})"><defs>${grad(id, '#E0445E')}</defs><path d="M0 0 L-13 -7 C-16 -8 -17 -6 -17 -4 V4 C-17 6 -16 8 -13 7 Z" fill="url(#${id})"/><path d="M0 0 L13 -7 C16 -8 17 -6 17 -4 V4 C17 6 16 8 13 7 Z" fill="url(#${id})"/><rect x="-4" y="-4.5" width="8" height="9" rx="3" fill="#B82F47"/>${gloss(-10, -3, 2.4, 1.2, -15)}</g>`;
      }
    }
    return '';
  }

  function mouthSvg(m, y, ink) {
    if (m === 'smile') return `<path d="M45 ${y + 12} q5 4.5 10 0" stroke="${ink}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    if (m === 'o') return `<ellipse cx="50" cy="${y + 13}" rx="2.6" ry="2.2" fill="${ink}"/>`;
    return '';
  }


  // A small rounded arm with a mitten hand, pointing at `deg` (0 = right, 90 = down).
  function armSvg(deg, base, id) {
    const a = (deg * Math.PI) / 180, cx = 50, cy = 58;
    const x1 = cx + Math.cos(a) * 24, y1 = cy + Math.sin(a) * 24;
    const x2 = cx + Math.cos(a) * 52, y2 = cy + Math.sin(a) * 52;
    const dark = shade(base, -0.16), light = shade(base, 0.16);
    return `<g class="c-arm"><line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${dark}" stroke-width="12" stroke-linecap="round"/>` +
      `<line x1="${x1.toFixed(1)}" y1="${(y1 - 1).toFixed(1)}" x2="${x2.toFixed(1)}" y2="${(y2 - 1).toFixed(1)}" stroke="${base}" stroke-width="8" stroke-linecap="round"/>` +
      `<circle cx="${x2.toFixed(1)}" cy="${y2.toFixed(1)}" r="8" fill="${dark}"/><circle cx="${(x2 - 0.9).toFixed(1)}" cy="${(y2 - 1.1).toFixed(1)}" r="6.4" fill="${light}"/><circle cx="${(x2 - 2).toFixed(1)}" cy="${(y2 - 2.4).toFixed(1)}" r="1.4" fill="#fff" opacity=".55"/></g>`;
  }

  let uid = 0;
  /** Render a character as SVG. opts: { size, state } */
  function characterSvg(ch, opts = {}) {
    ch = ch || makeCharacter('x');
    ch = { ...ch, shape: roundShape(ch.shape), extra: ch.extra === 'bow' ? 'none' : ch.extra };
    const size = opts.size || 36;
    const g = GEO[ch.shape] || GEO.orb;
    const ink = '#161616';
    const id = 'c' + ++uid;
    const delay = -((hash(ch.color + ch.shape + ch.eyes) % 5000) / 1000).toFixed(2);
    const state = opts.state ? ' is-' + opts.state : '';
    const track = size >= 60 ? ' track' : '';
    const base = ch.color;
    // Soft 3D: light from the top-left, a glossy highlight, darker underside, rim light and a contact shadow.
    return `<span class="char${state}${track}" data-eyes="${ch.eyes}" data-shape="${ch.shape}" data-color="${ch.color}" data-acc="${ch.acc || ''}" style="width:${size}px;height:${size}px;--blink-delay:${delay}s">
      <span class="c-swirl c-swirl-a"></span><span class="c-swirl c-swirl-b"></span>
      <span class="c-sparkles"><i></i><i></i><i></i><i></i><i></i><i></i></span>
      <span class="c-trail c-trail-a"></span><span class="c-trail c-trail-b"></span>
      <span class="c-3d"><span class="c-slab"></span>
      <svg class="c-front" style="overflow:visible" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true">
        <defs>
          <radialGradient id="${id}" cx="34%" cy="26%" r="88%">
            <stop offset="0" stop-color="${shade(base, 0.38)}"/>
            <stop offset=".2" stop-color="${shade(base, 0.18)}"/>
            <stop offset=".48" stop-color="${shade(base, 0.0)}"/>
            <stop offset=".78" stop-color="${shade(base, -0.19)}"/>
            <stop offset="1" stop-color="${shade(base, -0.36)}"/>
          </radialGradient>
          <radialGradient id="${id}r" cx="78%" cy="86%" r="45%"><stop offset="0" stop-color="${shade(base, 0.34)}" stop-opacity=".7"/><stop offset="1" stop-color="${shade(base, 0.34)}" stop-opacity="0"/></radialGradient>
          <radialGradient id="${id}b" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ff5a7a" stop-opacity=".55"/><stop offset="1" stop-color="#ff5a7a" stop-opacity="0"/></radialGradient>
          <radialGradient id="${id}h" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity=".85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
          <radialGradient id="${id}o" cx="50%" cy="100%" r="70%"><stop offset="0" stop-color="#000" stop-opacity=".35"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
          <linearGradient id="${id}v" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset=".42" stop-color="#fff" stop-opacity="0"/><stop offset=".6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".55"/></linearGradient>
          <radialGradient id="${id}s" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#000" stop-opacity=".5"/><stop offset="1" stop-color="#000" stop-opacity="0"/></radialGradient>
          <clipPath id="${id}k">${bodyPath(ch.shape, '#000')}</clipPath>
        </defs>
        <ellipse class="c-ground" cx="50" cy="95" rx="34" ry="6" fill="url(#${id}s)"/>
        <g class="c-body"><g class="c-turn">
          ${opts.point != null ? armSvg(opts.point, base, id) : ''}
          ${bodyPath(ch.shape, `url(#${id})`)}
          <g clip-path="url(#${id}k)">
            <ellipse cx="50" cy="96" rx="46" ry="26" fill="url(#${id}o)"/>
            ${opts.flat ? '' : `<ellipse cx="74" cy="84" rx="26" ry="16" fill="url(#${id}r)"/>
            <ellipse class="c-shine" cx="35" cy="29" rx="15" ry="9.5" fill="url(#${id}h)" transform="rotate(-24 35 29)"/>
            <circle cx="29" cy="25" r="3" fill="#fff" opacity=".75"/>
            <ellipse cx="70" cy="30" rx="4" ry="2.2" fill="#fff" opacity=".22" transform="rotate(20 70 30)"/>`}
            ${bodyPath(ch.shape, 'none').replace('fill="none"', `fill="none" stroke="url(#${id}v)" stroke-width="6"`)}
            <ellipse class="c-shade" cx="50" cy="55" rx="46" ry="46" fill="#000" opacity="0"/>
          </g>
          <g class="c-face"${opts.look ? ` transform="translate(${(opts.look[0] * 3).toFixed(2)} ${(opts.look[1] * 2).toFixed(2)})"` : ''}>
            <g class="c-eyes"${opts.look ? ` data-look="1"` : ''}>${opts.look ? eyesSvg(ch.eyes, g.eyeY, ink).replace(/<g class="c-pupil">/g, `<g class="c-pupil" transform="translate(${(opts.look[0] * 2.4).toFixed(2)} ${(opts.look[1] * 2.4).toFixed(2)})">`) : eyesSvg(ch.eyes, g.eyeY, ink)}</g>
            ${mouthSvg(ch.mouth, g.eyeY, ink)}
            <ellipse cx="29" cy="${g.eyeY + 10}" rx="6.5" ry="4" fill="url(#${id}b)" opacity="${ch.mouth !== 'none' ? '.9' : '.6'}"/><ellipse cx="71" cy="${g.eyeY + 10}" rx="6.5" ry="4" fill="url(#${id}b)" opacity="${ch.mouth !== 'none' ? '.9' : '.6'}"/>
            ${FACEWEAR.has(ch.acc) ? accSvg(ch.acc, roundShape(ch.shape), g.eyeY, id) : ''}
          </g>
          ${ch.acc && !FACEWEAR.has(ch.acc) ? accSvg(ch.acc, roundShape(ch.shape), g.eyeY, id) : ''}
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
    // The back of him, seen when he turns around: no face, soft light, a seam down the middle and the same hat.
    const gid = (el.querySelector('.c-front radialGradient') || {}).id || '';
    const acc = el.dataset.acc || '';
    const bid = 'bk' + (gid || Math.random().toString(36).slice(2, 7));
    const back = `<defs><radialGradient id="${bid}" cx="64%" cy="28%" r="88%"><stop offset="0" stop-color="${shade(color, 0.08)}"/><stop offset=".55" stop-color="${shade(color, -0.1)}"/><stop offset="1" stop-color="${shade(color, -0.3)}"/></radialGradient></defs>${bodyPath(shape, `url(#${bid})`)}<ellipse cx="66" cy="30" rx="15" ry="9" fill="#fff" opacity=".28" transform="rotate(24 66 30)"/><path d="M50 24 C46 44 46 66 50 86" stroke="#000" stroke-opacity=".2" stroke-width="1.8" fill="none" stroke-linecap="round"/><ellipse cx="50" cy="92" rx="32" ry="9" fill="#000" opacity=".14"/>${acc && acc !== 'none' ? accSvg(acc, shape, (GEO[shape] || GEO.orb).eyeY, gid) : ''}`;
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
      const e = (el._eye ||= { x: 0, y: 0, vx: 0, vy: 0, px: null });
      const [tx, ty] = eyeTarget(el, now);
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
        el.querySelectorAll('.c-pupil').forEach((n) => (n.style.transform = px));
      }
      if (Math.abs(tx) > 0.001 || Math.abs(ty) > 0.001 || Math.abs(e.vx) > 0.01 || Math.abs(e.vy) > 0.01 || Math.abs(e.x) > 0.002 || Math.abs(e.y) > 0.002) moving = true;
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
  };
  const IDLE = ['lookAround', 'lookAround', 'glance', 'glance', 'bounce', 'tilt', 'doubleBlink', 'doubleHop', 'wiggle', 'jump', 'squish', 'shimmy', 'peek', 'nod', 'happyHops', 'stretch', 'sleepy', 'heartbeat', 'shyTurn']; // spins only happen when a bot replies

  // ---------- queue ----------
  const isBusy = (el) => !!stateOf(el) || el._wantState !== undefined;
  const GAP = 180; // little rest between queued moves

  function play(el, action) {
    if (!el) return;
    const name = action || IDLE[Math.floor(Math.random() * IDLE.length)];
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
    return `<svg class="acc-only" viewBox="0 -30 100 130" width="${size}" height="${size}" aria-hidden="true" style="overflow:visible"><g class="acc-wrap">${accSvg(acc, 'orb', 54, 'ao' + ++uid)}</g></svg>`;
  }
  function fitAccessory(svg, pad = 3) {
    try { const b = svg.querySelector('.acc-wrap').getBBox(); const s = Math.max(b.width, b.height) + pad * 2; svg.setAttribute('viewBox', `${(b.x + b.width / 2 - s / 2).toFixed(1)} ${(b.y + b.height / 2 - s / 2).toFixed(1)} ${s.toFixed(1)} ${s.toFixed(1)}`); } catch (_) {}
  }
  window.Characters = { accessorySvg, fitAccessory, ACCESSORIES, makeCharacter, characterSvg, COLORS, play, startIdle, setState, ACTIONS };
})();
