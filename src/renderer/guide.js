// ===== The Tutorial Guide: a short tour, a small help chat on the side, and the Help tab =====
// (Loaded before app.js; everything here runs later, when app.js's helpers exist: S, api, $, $$, esc, icon, toast, modal, go, render…)

const GUIDE_NAME = 'Tutorial Guide';
const GUIDE_LOOKS = [['orb', '#FF6B5B', 'dots', 'smile'], ['pebble', '#4F8BFF', 'ovals', 'none'], ['blob', '#FFB020', 'wide', 'o'], ['bun', '#2FCB7A', 'dots', 'smile'], ['capsule', '#A77BFF', 'ovals', 'none'], ['bean', '#FF7AB6', 'wide', 'o'],
  ['orb', '#FF8A3D', 'ovals', 'o'], ['pebble', '#38BDF8', 'wide', 'smile'], ['blob', '#E879F9', 'dots', 'none'], ['bun', '#F2F2F2', 'ovals', 'o'], ['capsule', '#2DD4BF', 'wide', 'smile'], ['bean', '#A3E635', 'dots', 'none'],
  ['orb', '#6366F1', 'dots', 'none'], ['pebble', '#FB7185', 'dots', 'o'], ['blob', '#6EE7B7', 'ovals', 'smile'], ['bun', '#B07A4F', 'wide', 'none'], ['capsule', '#FACC15', 'dots', 'o'], ['bean', '#5B6275', 'ovals', 'smile']]
  .map(([shape, color, eyes, mouth]) => ({ shape, color, eyes, mouth, extra: 'none' }));
const guideDefaultLook = () => ({ ...GUIDE_LOOKS[1], acc: 'none' });
const guideLook = () => (S.settings.guide && S.settings.guide.character) || guideDefaultLook();
const guideSvg = (size, state) => window.Characters.characterSvg(guideLook(), { size, state });
const calmMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Text that is written out as if typed. Returns a function that shows all of it at once.
function typeText(el, text, cps = 80) {
  el.textContent = '';
  if (calmMotion() || text.length < 3) { el.textContent = text; return () => {}; }
  const node = document.createTextNode('');
  const caret = document.createElement('span');
  caret.className = 'caret';
  el.append(node, caret);
  let i = 0;
  const per = Math.max(1, Math.round(cps / 30));
  const t = setInterval(() => { i = Math.min(text.length, i + per); node.nodeValue = text.slice(0, i); if (i >= text.length) { clearInterval(t); caret.remove(); } }, 33);
  return () => { clearInterval(t); node.nodeValue = text; caret.remove(); };
}


// ---------- text size: five steps on one slider (Settings → General) ----------
const TEXT_BASE = 0.93; // "Average" is a little bigger than before (0.85 was too compact)
const TEXT_SIZES = [['Extra small', 0.85, 'Fits the most on screen'], ['Small', 0.92, 'A little smaller'], ['Average', 1, 'Recommended'], ['Big', 1.15, 'Easier to read'], ['Extra big', 1.3, 'The largest']];
const textSizeIndex = () => { const v = +loadPref('textSize2', 1) || 1; let b = 2, d = 9; TEXT_SIZES.forEach(([, f], i) => { if (Math.abs(f - v) < d) { d = Math.abs(f - v); b = i; } }); return b; };
const tszPos = (i) => `calc(22px + (100% - 44px) * ${i / 4})`;
const textSizeSliderHtml = () => `<div class="tsz2" role="slider" tabindex="0" aria-label="Text size" aria-valuemin="0" aria-valuemax="4" aria-valuenow="${textSizeIndex()}" aria-valuetext="${TEXT_SIZES[textSizeIndex()][0]}">
  <div class="tsz2-head"><span>Text size</span><b class="tsz2-val">${TEXT_SIZES[textSizeIndex()][0]}</b></div>
  <div class="tsz2-ends"><span>Smaller</span><span>Bigger</span></div>
  <div class="tsz2-track">${TEXT_SIZES.map((_, i) => `<i class="tsz2-dot" style="left:${tszPos(i)}"></i>`).join('')}<span class="tsz2-thumb" style="left:${tszPos(textSizeIndex())}"></span></div>
  <div class="tsz2-note"><span>${TEXT_SIZES[textSizeIndex()][2]}</span></div></div>`;
function wireTextSize(root) {
  const el = $('.tsz2', root); if (!el) return;
  const track = $('.tsz2-track', el), thumb = $('.tsz2-thumb', el), val = $('.tsz2-val', el), note = $('.tsz2-note span', el);
  let idx = textSizeIndex(), drag = false;
  const show = (i) => {
    const moved = i !== idx; idx = i;
    thumb.style.left = tszPos(i);
    $$('.tsz2-dot', el).forEach((d, k) => d.classList.toggle('hide', k === i));
    el.setAttribute('aria-valuenow', i); el.setAttribute('aria-valuetext', TEXT_SIZES[i][0]);
    if (moved || !val.dataset.set) { val.dataset.set = '1'; [val, note].forEach((n) => { n.classList.remove('swap'); void n.offsetWidth; n.classList.add('swap'); }); val.textContent = TEXT_SIZES[i][0]; note.textContent = TEXT_SIZES[i][2]; }
  };
  const apply = (i) => { show(i); savePref('textSize2', TEXT_SIZES[i][1]); api.setZoom?.(TEXT_SIZES[i][1] * TEXT_BASE); };
  const at = (e) => { const r = track.getBoundingClientRect(), x = (e.clientX - r.left - 22) / Math.max(1, r.width - 44); return Math.max(0, Math.min(4, Math.round(x * 4))); };
  show(idx);
  track.addEventListener('pointerdown', (e) => { drag = true; track.setPointerCapture(e.pointerId); el.classList.add('drag'); show(at(e)); });
  track.addEventListener('pointermove', (e) => { if (drag) show(at(e)); });
  const end = () => { if (!drag) return; drag = false; el.classList.remove('drag'); apply(idx); };
  track.addEventListener('pointerup', end); track.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => { const d = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[e.key]; if (d) { e.preventDefault(); e.stopPropagation(); apply(Math.max(0, Math.min(4, idx + d))); } });
}

// ---------- how the guide looks (saved; shown in the top-right button and the chat) ----------
let guideSaveTimer = 0;
function saveGuideLook(character, asked) {
  S.settings.guide = { character, asked: asked ?? !!S.settings.guide?.asked };
  $$('#guide-btn').forEach((b) => (b.innerHTML = guideBtnInner()));
  $$('.hc-av').forEach((b) => (b.innerHTML = guideSvg(34, 'none')));
  clearTimeout(guideSaveTimer);
  guideSaveTimer = setTimeout(() => { api.saveGuide(S.settings.guide).catch(() => {}); }, 300);
}
// The same menu as creating a bot (accessories on top, the bot in the middle, looks below), without the name, tag and description.
// There is no name to pick: the guide is always "Tutorial Guide".
function openGuideLook(opts = {}) {
  const ACCS = window.Characters.ACCESSORIES;
  const same = (x, y) => x && y && x.shape === y.shape && String(x.color).toLowerCase() === String(y.color).toLowerCase() && x.eyes === y.eyes && (x.mouth || 'none') === (y.mouth || 'none');
  const g0 = guideLook();
  let bi = Math.max(0, GUIDE_LOOKS.findIndex((l) => same(l, g0)));
  let ai = Math.max(0, ACCS.findIndex((a) => a.id === (g0.acc || 'none')));
  modal(`<h3>${opts.first ? 'Dress up your guide' : 'How the guide looks'}</h3>
    <p class="lead">${opts.first ? 'Pick how I look. ' : ''}You can change this any time in Settings → Help.</p>
    <div class="kart">
      <div class="k-row"><button class="k-arrow" data-k="acc" data-d="-1" title="↑" aria-label="Previous accessory">◀</button><div class="k-strip" id="k-acc"></div><button class="k-arrow" data-k="acc" data-d="1" title="↓" aria-label="Next accessory">▶</button></div>
      <div class="k-stage"><div class="k-glow"></div><div id="be-char"></div><div class="k-label"><b id="k-accname"></b></div>
        <button class="shuffle k-rand" id="be-shuffle" type="button">${icon('shuffle')}Randomize</button></div>
      <div class="k-row"><button class="k-arrow" data-k="bot" data-d="-1" title="←" aria-label="Previous look">◀</button><div class="k-strip" id="k-bot"></div><button class="k-arrow" data-k="bot" data-d="1" title="→" aria-label="Next look">▶</button></div>
      <div class="k-keys"><kbd>←</kbd><kbd>→</kbd> look · <kbd>↑</kbd><kbd>↓</kbd> accessory</div>
    </div>
    <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>`, 'guide-look');
  const current = () => ({ ...GUIDE_LOOKS[bi], acc: ACCS[ai].id });
  const center = (strip) => { const on = strip.querySelector('.on'); if (on) strip.scrollTo({ left: on.offsetLeft - strip.clientWidth / 2 + on.offsetWidth / 2, behavior: calmMotion() ? 'auto' : 'smooth' }); };
  const draw = (pop) => {
    const ch = current();
    $('#k-acc').innerHTML = ACCS.map((a, k) => `<button type="button" class="k-tile${k === ai ? ' on' : ''}" data-ai="${k}" title="${esc(a.name)}">${a.id === 'none' ? `<span class="acc-none">${icon('x')}</span>` : window.Characters.accessorySvg(a.id, 40)}</button>`).join('');
    $$('#k-acc svg.acc-only').forEach((x) => window.Characters.fitAccessory(x));
    $('#k-bot').innerHTML = GUIDE_LOOKS.map((l, k) => `<button type="button" class="k-tile${k === bi ? ' on' : ''}" data-bi="${k}" aria-label="Look ${k + 1}">${window.Characters.characterSvg({ ...l, acc: ch.acc }, { size: 44 })}</button>`).join('');
    $('#k-accname').textContent = ACCS[ai].id === 'none' ? 'No accessory' : ACCS[ai].name;
    $('#be-char').innerHTML = `<span class="${pop ? 'char-pop' : ''}" style="display:inline-block">${window.Characters.characterSvg(ch, { size: 120 })}</span>`;
    center($('#k-acc')); center($('#k-bot'));
    $$('#k-acc [data-ai]').forEach((x) => (x.onclick = () => { ai = +x.dataset.ai; changed(true); }));
    $$('#k-bot [data-bi]').forEach((x) => (x.onclick = () => { bi = +x.dataset.bi; changed(true); }));
  };
  const changed = (pop) => { draw(pop); saveGuideLook(current(), true); };
  const step = (k, d) => { if (k === 'acc') ai = (ai + d + ACCS.length) % ACCS.length; else bi = (bi + d + GUIDE_LOOKS.length) % GUIDE_LOOKS.length; changed(true); };
  $$('.guide-look .k-arrow').forEach((x) => (x.onclick = () => step(x.dataset.k, +x.dataset.d)));
  $('#be-shuffle').onclick = () => { bi = Math.floor(Math.random() * GUIDE_LOOKS.length); ai = Math.floor(Math.random() * ACCS.length); changed(true); };
  const modalEl = $('#modal');
  const onKey = (e) => {
    if (!modalEl.isConnected) return document.removeEventListener('keydown', onKey);
    const m = { ArrowLeft: ['bot', -1], ArrowRight: ['bot', 1], ArrowUp: ['acc', -1], ArrowDown: ['acc', 1] }[e.key];
    if (m) { e.preventDefault(); step(...m); }
  };
  document.addEventListener('keydown', onKey);
  draw(false);
  if (opts.first) saveGuideLook(current(), true); // it was offered once; it is never pushed on you again
}

// ---------- the top-right button opens the help chat ----------
const guideBtnInner = () => `${guideSvg(30)}<i class="guide-q" aria-hidden="true">?</i>`;
const guideBtnHtml = () => `<button class="guide-btn" id="guide-btn" type="button" title="Ask the ${GUIDE_NAME}" aria-label="Ask the ${GUIDE_NAME}" aria-expanded="${$('#helpchat') ? 'true' : 'false'}">${guideBtnInner()}</button>`;
document.addEventListener('click', (e) => { const b = e.target.closest('#guide-btn'); if (b) { e.preventDefault(); toggleHelpChat(); } });

// ---------- the common questions ----------
let helpFaqCache = null;
async function loadFaq() { if (!helpFaqCache) { try { helpFaqCache = await api.helpFaq(); } catch (_) { helpFaqCache = []; } } return helpFaqCache; }

// ---------- a small chat on the side ----------
const HELP_CHAT_KEY = 'helpChat';
function toggleHelpChat() { if ($('#helpchat')) closeHelpChat(); else openHelpChat(); }
function closeHelpChat() {
  const el = $('#helpchat');
  if (!el) return;
  el.classList.remove('on');
  setTimeout(() => el.remove(), 220);
  $$('#guide-btn').forEach((b) => b.setAttribute('aria-expanded', 'false'));
}
async function openHelpChat() {
  if ($('#helpchat')) return;
  const faq = await loadFaq();
  const el = document.createElement('section');
  el.id = 'helpchat'; el.className = 'helpchat';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', `Chat with the ${GUIDE_NAME}`);
  el.innerHTML = `<header class="hc-head"><span class="hc-av">${guideSvg(34, 'none')}</span><div class="hc-t"><b>${GUIDE_NAME}</b><small>Ask how to use Wayzerr</small></div>
      <button class="icon-btn hc-new" type="button" title="Start a new chat" aria-label="Start a new chat">${icon('broom')}</button><button class="icon-btn hc-x" type="button" title="Close" aria-label="Close">${icon('x')}</button></header>
    <div class="hc-body" role="log" aria-live="polite"></div>
    <div class="hc-chips"></div>
    <form class="hc-form"><input class="hc-in" placeholder="Ask a question…" autocomplete="off" spellcheck="false" aria-label="Your question"><button class="hc-send" type="submit" aria-label="Send">${icon('up')}</button></form>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  $$('#guide-btn').forEach((b) => b.setAttribute('aria-expanded', 'true'));
  const body = $('.hc-body', el), chips = $('.hc-chips', el), input = $('.hc-in', el);
  let msgs = loadPref(HELP_CHAT_KEY, []).filter((m) => m && (m.r === 'u' || m.r === 'g') && typeof m.t === 'string').slice(-30);
  let working = false;
  const scroll = () => { body.scrollTop = body.scrollHeight; };
  const bubble = (r, text, cls = '') => { const b = document.createElement('div'); b.className = `hc-msg ${r === 'u' ? 'hc-me' : 'hc-bot'} ${cls}`; b.textContent = text; body.appendChild(b); scroll(); return b; };
  const remember = () => savePref(HELP_CHAT_KEY, msgs.slice(-30));
  const drawChips = () => {
    chips.innerHTML = msgs.length ? '' : faq.slice(0, 4).map((f, i) => `<button type="button" class="ask-chip" data-faq="${i}">${esc(f.q)}</button>`).join('');
    $$('[data-faq]', chips).forEach((b) => (b.onclick = () => { const f = faq[+b.dataset.faq]; if (f) send(f.q); }));
  };
  const draw = () => {
    body.innerHTML = '';
    bubble('g', 'Hi! Ask me anything about using Wayzerr.');
    msgs.forEach((m) => bubble(m.r, m.t));
    drawChips();
  };
  const send = async (text) => {
    const v = String(text || '').trim();
    if (!v || working) return;
    input.value = '';
    const history = msgs.slice(-6);
    msgs.push({ r: 'u', t: v }); bubble('u', v); drawChips();
    const known = faq.find((f) => f.q.toLowerCase() === v.toLowerCase().replace(/\s+/g, ' ')); // a listed question: answered at once, free
    const reply = (t, cls) => { msgs.push({ r: 'g', t }); remember(); const b = bubble('g', '', cls); typeText(b, t); scroll(); };
    if (known) return reply(known.a);
    working = true;
    const wait = document.createElement('div');
    wait.className = 'hc-msg hc-bot hc-wait'; wait.innerHTML = '<span class="ask-dots"><i></i><i></i><i></i></span>';
    body.appendChild(wait); scroll();
    try { const r = await api.helpAsk(v, history); wait.remove(); reply(r.text); }
    catch (e) { wait.remove(); const t = String(e.message || 'Something went wrong. Try again.').replace(/^Error invoking remote method '[^']+': (Error: )?/, ''); remember(); bubble('g', t, 'err'); }
    working = false;
    scroll();
  };
  $('.hc-form', el).onsubmit = (e) => { e.preventDefault(); send(input.value); };
  $('.hc-x', el).onclick = closeHelpChat;
  $('.hc-new', el).onclick = () => { msgs = []; remember(); draw(); input.focus(); };
  el.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); closeHelpChat(); $('#guide-btn')?.focus(); } });
  draw();
  input.focus();
}

// ---------- Settings → Help: kept simple; the guide's look and the tour are tucked away ----------
const faqItem = (f) => `<div class="faq-item"><button class="faq-q" type="button" aria-expanded="false"><span>${esc(f.q)}</span><i aria-hidden="true"></i></button><div class="faq-a"><div><p>${esc(f.a)}</p></div></div></div>`;
async function tabHelp() {
  const faq = await loadFaq();
  if (settingsTab !== 'help' || !$('#set-body')) return;
  $('#set-body').innerHTML = `
    <h1>Help</h1>
    <div class="section-title sm">Common questions</div>
    <div class="card faq">${faq.slice(0, 6).map(faqItem).join('')}<div id="faq-more" hidden>${faq.slice(6).map(faqItem).join('')}</div></div>
    ${faq.length > 6 ? `<button class="btn faq-toggle" id="faq-toggle" type="button">Show more questions</button>` : ''}
    <details class="help-adv" id="help-adv"><summary>Guide settings</summary>
      <div class="card simple">
        <div class="card-row"><div class="grow"><div class="nm">How the guide looks</div></div><button class="btn" id="help-look" type="button">Change</button></div>
        <div class="card-row"><div class="grow"><div class="nm">Show the tour</div></div><button class="btn" id="help-tour" type="button">${icon('play')}Play</button></div>
      </div></details>`;
  $('#set-body').querySelectorAll('.faq').forEach((box) => box.addEventListener('click', (e) => {
    const b = e.target.closest('.faq-q'); if (!b) return;
    const item = b.parentNode, open = !item.classList.contains('open');
    box.querySelectorAll('.faq-item.open').forEach((o) => { if (o !== item) { o.classList.remove('open'); o.firstChild.setAttribute('aria-expanded', 'false'); } });
    item.classList.toggle('open', open); b.setAttribute('aria-expanded', open);
  }));
  const more = $('#faq-more'), tg = $('#faq-toggle');
  if (tg) tg.onclick = () => { more.hidden = !more.hidden; tg.textContent = more.hidden ? 'Show more questions' : 'Show fewer questions'; };
  $('#help-look').onclick = () => openGuideLook();
  $('#help-tour').onclick = () => startTour(true);
}

// ---------- the tour: a few quiet steps ----------
let tour = null;
function tourSteps() {
  const n = (S.settings.userName || '').trim();
  return [
    { id: 'look', say: `Hi${n ? ' ' + n : ''}! I’m your guide. First, how do you want me to look?`, next: 'Choose a look', skip: 'Keep this look', skipNext: true },
    { sel: '#bot-list', say: 'These are your bots. Each one has its own memory, personality and tools, so you can give every bot a job. ＋ makes a new one, and ⋯ edits or deletes it.' },
    { sel: '#composer', say: 'Talk to a bot here. Try “remind me to stretch every day at 5” and it sets up a schedule by itself. ＋ adds photos and files, and the mic lets you speak.' },
    { sel: '#btn-screen', say: 'Every bot has its own computer. Open this screen to watch it browse and click, or ask for something like “download Firefox and open it”.' },
    { sel: '#btn-connectors', say: 'Settings is where you connect your AI and your apps, like Gmail and Calendar, so bots can work with them.' },
    { sel: '#guide-btn', say: 'Questions? Click me any time and ask.' },
    { id: 'bot', say: `Last step: let’s make a bot. Give it a name and a job, like “Inbox helper” or “Homework buddy”. Ready?`, next: 'Make a bot', skip: 'Not now' },
  ];
}
const tourVisible = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth ? r : null; };
function startTour(replay = false) {
  if (tour) return;
  closeHelpChat();
  if (replay && view !== 'chat') { view = 'chat'; closePopover(); render(); }
  const steps = tourSteps();
  const o = document.createElement('div');
  o.id = 'tour'; o.className = 'tour';
  o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Quick tour'); o.setAttribute('aria-modal', 'true');
  o.innerHTML = `<div class="tour-block"></div><div class="tour-spot" id="tour-spot"></div>
    <div class="tour-card" id="tour-card">
      <div class="tour-bot" id="tour-bot"></div>
      <div class="tour-main">
        <div class="tour-say" id="tour-say" aria-live="polite"></div>
        <div id="tour-extra"></div>
        <div class="tour-foot"><span class="tour-dots" aria-hidden="true">${steps.map(() => '<i></i>').join('')}</span><span class="grow"></span><button class="btn ghost sm" id="tour-skip" type="button">Skip</button><button class="btn primary sm" id="tour-next" type="button">Next</button></div>
      </div>
    </div>`;
  document.body.appendChild(o);
  tour = { steps, i: -1, opener: document.activeElement };
  tour.key = (e) => {
    if ($('#modal')) return; // the look menu has its own keys
    if (e.key === 'Escape') { e.preventDefault(); tourEnd(true); }
    else if (e.key === 'ArrowRight') tourNext();
  };
  document.addEventListener('keydown', tour.key);
  tour.resize = () => tourPlace();
  addEventListener('resize', tour.resize);
  $('#tour-skip').onclick = () => { const st = tour && tour.steps[tour.i]; if (st && st.skipNext) { tour.lookDone = true; tourGo(tour.i + 1); } else tourEnd(true); };
  $('#tour-next').onclick = () => tourNext();
  requestAnimationFrame(() => o.classList.add('on'));
  tourGo(0);
}
function tourNext() {
  if (!tour) return;
  const st = tour.steps[tour.i];
  if (st && st.id === 'look' && !tour.lookDone) return tourLook();
  if (tour.i >= tour.steps.length - 1) tourEnd(false); else tourGo(tour.i + 1);
}
// The guide's look is picked in the same menu as making a bot; the tour waits behind it and carries on when it closes.
function tourLook() {
  const o = $('#tour'); if (!o) return;
  tour.lookDone = true; o.style.visibility = 'hidden';
  openGuideLook({ first: true });
  const iv = setInterval(() => { if ($('#modal')) return; clearInterval(iv); if (tour) { o.style.visibility = ''; tourGo(tour.i + 1); } }, 150);
}
function tourGo(i) {
  const t = tour;
  if (!t) return;
  i = Math.max(0, Math.min(t.steps.length - 1, i));
  const st = t.steps[i];
  t.i = i;
  t.cancelType?.();
  $$('#tour-card .tour-dots i').forEach((d, k) => d.classList.toggle('on', k <= i));
  $('#tour-bot').innerHTML = guideSvg(44, 'none');
  const card = $('#tour-card');
  card.classList.remove('pop'); void card.offsetWidth; card.classList.add('pop');
  t.cancelType = typeText($('#tour-say'), st.say, 90);
  $('#tour-extra').innerHTML = st.extra ? st.extra() : '';
  if (st.wire) st.wire();
  $('#tour-skip').textContent = st.skip || 'Skip';
  $('#tour-next').textContent = st.next || (i === t.steps.length - 1 ? 'Done' : 'Next');
  tourPlace();
  const bot = $('#tour-bot .char');
  if (bot && !calmMotion()) window.Characters.play(bot, 'bounce');
  announce?.(st.say);
  $('#tour-next').focus({ preventScroll: true });
}
// The spotlight glides to the thing being explained; the card sits beside it.
function tourPlace() {
  if (!tour) return;
  const st = tour.steps[tour.i];
  const spot = $('#tour-spot'), card = $('#tour-card');
  if (!spot || !card) return;
  const r = st && st.sel ? tourVisible(document.querySelector(st.sel)) : null;
  if (r) {
    const pad = 8;
    spot.style.cssText = `left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;`;
  } else {
    spot.style.cssText = `left:${innerWidth / 2}px;top:${innerHeight / 2}px;width:0px;height:0px;`;
  }
  const cw = card.offsetWidth, ch = card.offsetHeight, m = 16;
  let x = (innerWidth - cw) / 2, y = (innerHeight - ch) / 2;
  if (r) {
    const roomR = innerWidth - r.right, roomL = r.left, roomB = innerHeight - r.bottom, roomT = r.top;
    if (roomR >= cw + m * 2) { x = r.right + m + 8; y = r.top + r.height / 2 - ch / 2; }
    else if (roomL >= cw + m * 2) { x = r.left - cw - m - 8; y = r.top + r.height / 2 - ch / 2; }
    else if (roomB >= ch + m * 2) { y = r.bottom + m + 8; x = r.left + r.width / 2 - cw / 2; }
    else if (roomT >= ch + m * 2) { y = r.top - ch - m - 8; x = r.left + r.width / 2 - cw / 2; }
  }
  x = Math.max(m, Math.min(innerWidth - cw - m, x));
  y = Math.max(m, Math.min(innerHeight - ch - m, y));
  card.style.left = x + 'px'; card.style.top = y + 'px';
}
function tourEnd(skipped) {
  const t = tour;
  if (!t) return;
  tour = null;
  t.cancelType?.();
  document.removeEventListener('keydown', t.key); removeEventListener('resize', t.resize);
  const o = $('#tour');
  o?.classList.remove('on'); o?.classList.add('out');
  setTimeout(() => o?.remove(), 320);
  const last = t.steps[t.i];
  if (last && last.id === 'bot' && !skipped) setTimeout(() => { try { openBotEditor(null, ''); } catch (_) { view = 'new'; render(); } }, 380); // the last step makes you create a bot
  S.settings.tutorialDone = true;
  api.saveProfile({ tutorialDone: true }).catch(() => {});
  try { t.opener?.focus?.(); } catch (_) {}
}
// First run: the tour starts by itself once, after the start page (or after skipping it).
function maybeTour() {
  if (tour || !S?.settings || S.settings.tutorialDone || maybeTour.started) return;
  if (!S.ready && !S.settings.setupSkipped) return;
  maybeTour.started = true;
  setTimeout(() => { if (!S.settings.tutorialDone && !tour && !$('#modal')) startTour(false); else maybeTour.started = false; }, 900);
}
