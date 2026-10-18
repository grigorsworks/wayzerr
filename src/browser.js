// The bots' own built-in browser: a Chromium view shown in the "Screen" panel.
// Uses a persistent profile, so logins stay between sessions and are separate
// from the user's normal browser.
const { WebContentsView, session } = require('electron');

const HOME = 'https://duckduckgo.com/';
const MAX_TEXT = 12000;

const SNAPSHOT_JS = `(() => {
  const VIEW = !!window.__nxViewOnly; window.__nxViewOnly = false;
  document.querySelectorAll('[data-pid]').forEach((e) => e.removeAttribute('data-pid'));
  const sel = 'a[href],button,input:not([type=hidden]),textarea,select,[role=button],[role=link],[role=tab],[role=menuitem],[role=checkbox],[contenteditable=true],summary';
  const out = [];
  let n = 0;
  for (const el of document.querySelectorAll(sel)) {
    if (out.length >= 150) break;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    if (r.width < 2 || r.height < 2 || st.visibility === 'hidden' || st.display === 'none') continue;
    if (VIEW && (r.bottom < 0 || r.top > innerHeight || r.right < 0 || r.left > innerWidth)) continue;
    const id = ++n;
    el.setAttribute('data-pid', id);
    const tag = el.tagName.toLowerCase();
    const isPw = tag === 'input' && el.type === 'password';
    const label = (isPw ? (el.getAttribute('aria-label') || el.placeholder || el.name || 'password') : (el.getAttribute('aria-label') || el.innerText || el.value || el.placeholder || el.title || el.name || ''))
      .trim().replace(/\\s+/g, ' ').slice(0, 80);
    let extra = '';
    if (tag === 'a') {
      let h = el.href;
      try { const u = new URL(h); if (u.searchParams.get('uddg')) h = u.searchParams.get('uddg'); } catch (e) {}
      extra = ' -> ' + h.replace(/^https?:\\/\\/(www\\.)?/, '').slice(0, VIEW ? 70 : 110);
    }
    if (tag === 'input') extra = ' type=' + (el.type || 'text');
    out.push('[' + id + '] ' + tag + extra + ' "' + label + '"');
  }
  const text = VIEW ? '' : (document.body ? document.body.innerText : '').replace(/\\n{3,}/g, '\\n\\n').replace(/[ \\t]{2,}/g, ' ');
  const canvas = [...document.querySelectorAll('canvas,svg')].reduce((a, c) => { const q = c.getBoundingClientRect(); if (q.width < 200 || q.height < 150) return a; return a + Math.max(0, Math.min(q.right, innerWidth) - Math.max(q.left, 0)) * Math.max(0, Math.min(q.bottom, innerHeight) - Math.max(q.top, 0)); }, 0) / (innerWidth * innerHeight);
  return { title: document.title, url: location.href, text, elements: out.join('\\n'), canvas };
})()`;

// Finds text on the page like a person would (buttons, menus, words inside documents and slides, field contents).
const FIND_JS = (q, nth) => `(() => {
  const Q0 = ${JSON.stringify(String(q || ''))};
  const norm = (s) => String(s || '').replace(/\\s+/g, ' ').trim().toLowerCase();
  const Q = norm(Q0); if (!Q) return null;
  const vis = (el) => { if (!el || !el.getBoundingClientRect) return false; const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) return false; const st = getComputedStyle(el); return st.visibility !== 'hidden' && st.display !== 'none' && st.opacity !== '0'; };
  const inView = (r) => r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
  const hits = [];
  for (const el of document.querySelectorAll('input:not([type=hidden]):not([type=password]),textarea')) {
    if (!vis(el)) continue; const v = String(el.value || ''); const i = v.toLowerCase().indexOf(Q0.toLowerCase());
    if (i >= 0) hits.push({ kind: 'input', el, start: i, end: i + Q0.length, exact: norm(v) === Q });
  }
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let t = w.nextNode(); t; t = w.nextNode()) {
    const v = t.textContent; if (!v || v.length > 200000) continue;
    const i = v.toLowerCase().indexOf(Q0.toLowerCase()); if (i < 0) continue;
    const p = t.parentElement; if (!vis(p) || p.closest('script,style,noscript')) continue;
    hits.push({ kind: 'text', node: t, el: p, start: i, end: i + Q0.length, exact: norm(v) === Q });
  }
  if (!hits.length) for (const el of document.querySelectorAll('[aria-label],[title],[placeholder],[data-tooltip],img[alt]')) {
    const v = el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('data-tooltip') || el.getAttribute('alt') || '';
    if (vis(el) && norm(v).includes(Q)) hits.push({ kind: 'el', el, exact: norm(v) === Q });
  }
  if (!hits.length) { let best = null; for (const el of document.querySelectorAll('body *')) { if (!vis(el)) continue; const it = norm(el.innerText || el.textContent || ''); if (it.includes(Q) && (!best || (el.textContent || '').length < (best.textContent || '').length)) best = el; } if (best) hits.push({ kind: 'el', el: best, exact: false }); }
  if (!hits.length) return null;
  const rectOf = (h) => { if (h.kind === 'text') { const r = document.createRange(); r.setStart(h.node, h.start); r.setEnd(h.node, h.end); return r.getBoundingClientRect(); } return h.el.getBoundingClientRect(); };
  hits.sort((a, b) => (b.exact - a.exact) || (inView(rectOf(b)) - inView(rectOf(a))));
  const h = hits[Math.min(hits.length - 1, Math.max(0, ${Number(nth) || 1} - 1))];
  let r = rectOf(h);
  if (!inView(r)) { (h.el || h.node.parentElement).scrollIntoView({ block: 'center', inline: 'center' }); r = rectOf(h); }
  window.__nxHit = h;
  let a = null, b = null;
  if (h.kind === 'text') { const rg = document.createRange(); rg.setStart(h.node, h.start); rg.setEnd(h.node, h.end); const rs = rg.getClientRects(); const f = rs[0] || r, l = rs[rs.length - 1] || r; a = { x: Math.round(f.left + 1), y: Math.round(f.top + f.height / 2) }; b = { x: Math.round(l.right - 1), y: Math.round(l.top + l.height / 2) }; }
  const editable = h.kind === 'input' || !!(h.el && h.el.closest('[contenteditable=""],[contenteditable=true]'));
  return { kind: h.kind, editable, x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2), a, b, count: hits.length, tag: (h.el || {}).tagName };
})()`;

// Watches clicks, typing and Enter in the page while the user teaches a skill.
// Passwords and card numbers are never recorded, only that a secret field was filled.
const RECORDER_JS = `(() => {
  if (window.__nxRec) return; window.__nxRec = 1;
  const clean = (t) => String(t || '').replace(/\\s+/g, ' ').trim().slice(0, 80);
  const labelOf = (el) => {
    if (!el) return '';
    if (el.id) { const l = document.querySelector('label[for="' + CSS.escape(el.id) + '"]'); if (l) return clean(l.innerText); }
    const wrap = el.closest('label'); if (wrap && clean(wrap.innerText)) return clean(wrap.innerText);
    return clean(el.getAttribute('aria-label') || el.placeholder || el.title || el.name || el.id || el.type || el.tagName.toLowerCase());
  };
  const what = (el) => clean(el.getAttribute('aria-label') || el.innerText || el.value || el.title || el.alt || (el.querySelector && el.querySelector('img[alt]') && el.querySelector('img[alt]').alt) || '');
  const secret = (el) => el.type === 'password' || /cc-|one-time-code|password/i.test(el.autocomplete || '') || /card.?num|cvv|cvc|iban|ssn|passw/i.test((el.name || '') + ' ' + (el.id || ''));
  const say = (o) => console.log('__nxrec__' + JSON.stringify(o));
  const onClick = (e) => {
    const el = e.target.closest('a,button,[role=button],[role=link],[role=tab],[role=menuitem],[role=option],[role=checkbox],summary,label,input[type=submit],input[type=button],input[type=checkbox],input[type=radio],select') || e.target;
    if (/^(INPUT|TEXTAREA)$/.test(el.tagName) && !/submit|button|checkbox|radio/.test(el.type)) return;
    const w = what(el); if (!w) return;
    say({ t: 'click', what: w, kind: el.tagName === 'A' ? 'link' : /checkbox|radio/.test(el.type || el.getAttribute('role') || '') ? 'checkbox' : 'button' });
  };
  const onChange = (e) => {
    const el = e.target; if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
    if (/checkbox|radio|submit|button|file|hidden/.test(el.type)) return;
    const sec = secret(el);
    say({ t: 'type', field: labelOf(el), secret: sec, value: sec ? null : String(el.tagName === 'SELECT' ? (el.options[el.selectedIndex] || {}).text : el.value).slice(0, 200) });
  };
  const onKey = (e) => { if (e.key === 'Enter' && /^(INPUT)$/.test(e.target.tagName)) { const sec = secret(e.target); say({ t: 'enter', field: labelOf(e.target), value: sec ? null : String(e.target.value || '').slice(0, 200) }); } };
  document.addEventListener('click', onClick, true); document.addEventListener('change', onChange, true); document.addEventListener('keydown', onKey, true);
  window.__nxRecOff = () => { document.removeEventListener('click', onClick, true); document.removeEventListener('change', onChange, true); document.removeEventListener('keydown', onKey, true); window.__nxRec = 0; };
})()`;

// One recorded step, in plain words.
function describeStep(st) {
  if (!st) return '';
  const q = (x) => '"' + String(x || '').replace(/"/g, "'") + '"';
  if (st.t === 'go') return (st.start ? 'Start at ' : 'Go to ') + st.url + (st.title ? ` (${st.title})` : '');
  if (st.t === 'click') return `Click the ${st.kind || 'button'} ${q(st.what)}` + (st.leadsTo ? ` (opens ${st.leadsTo})` : '');
  if (st.t === 'type') return (st.secret ? `Fill in ${q(st.field)} with your saved password from Passwords` : st.value ? `Type ${q(st.value)} into ${q(st.field)}` : `Clear ${q(st.field)}`) + (st.enter ? ' and press Enter' : '') + (st.leadsTo ? ` (opens ${st.leadsTo})` : '');
  if (st.t === 'enter') return `Press Enter in ${q(st.field)}` + (st.leadsTo ? ` (opens ${st.leadsTo})` : '');
  return '';
}

class BotBrowser {
  constructor(getWin, onState, id) {
    this.getWin = getWin;
    this.onState = onState;
    this.id = id;
    this.view = null;
    this.mode = 'hidden'; // 'full' = shown in the full-screen overlay; 'hidden' = off-screen, previewed as a live thumbnail
    this.rect = { x: 0, y: 0, width: 1280, height: 800 };
    this.hasPage = false;
    this.thumbTimer = null;
  }

  ensure() {
    if (this.view) return this.view.webContents;
    // Look like normal Chrome so sites (e.g. Google sign-in) treat it as a regular browser.
    const ses = session.fromPartition('persist:persona-browser');
    // Electron allows EVERY permission a web page asks for unless a handler says otherwise (the handlers in main.js only cover Wayzerr's own window).
    // A site a bot visits gets no camera, microphone, location, notifications, MIDI, USB/serial/HID, screen sharing or clipboard reading.
    if (!ses.wzPermissions) {
      ses.wzPermissions = true;
      const ALLOWED = new Set(['fullscreen', 'pointerLock', 'clipboard-sanitized-write', 'storage-access', 'top-level-storage-access']);
      ses.setPermissionRequestHandler((_wc, perm, cb) => cb(ALLOWED.has(perm)));
      ses.setPermissionCheckHandler((_wc, perm) => ALLOWED.has(perm));
      ses.setDevicePermissionHandler(() => false);
      ses.setDisplayMediaRequestHandler((_req, cb) => cb({}));
    }
    ses.setUserAgent(`Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`);
    const view = new WebContentsView({
      webPreferences: { partition: 'persist:persona-browser', sandbox: true, contextIsolation: true },
    });
    this.view = view;
    const wc = view.webContents;
    view.setBackgroundColor('#ffffff');
    wc.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) wc.loadURL(url); // pop-ups open in the same tab; never file:// or other schemes
      return { action: 'deny' };
    });
    wc.on('will-navigate', (e, url) => { if (!/^(https?:|about:blank|data:text\/html)/i.test(url)) e.preventDefault(); });
    wc.setBackgroundThrottling(false);
    const push = () => this.emit();
    ['did-navigate', 'did-navigate-in-page', 'page-title-updated', 'did-start-loading', 'did-stop-loading'].forEach((e) => wc.on(e, push));
    wc.on('did-stop-loading', () => setTimeout(() => this.thumb(), 300));
    // A bot working in the background must never take the keyboard away from you
    // (e.g. while you're typing to another bot). Only the browser you're looking at gets focus.
    wc.on('focus', () => this.giveBackFocus());
    const win = this.getWin();
    this.giveBackFocusSoon(win);
    win.contentView.addChildView(view);
    this.apply();
    this.giveBackFocusSoon(win);
    return wc;
  }

  giveBackFocus() {
    if (this.mode === 'full') return;
    const w = this.getWin();
    if (!w || w.isDestroyed()) return;
    setImmediate(() => { try { if (this.mode !== 'full' && !w.webContents.isFocused()) w.webContents.focus(); } catch (_) {} });
  }
  giveBackFocusSoon(w) {
    try { if (w && !w.isDestroyed() && w.webContents.isFocused()) { this._hadFocus = true; setTimeout(() => this.giveBackFocus(), 50); } } catch (_) {}
  }

  // ---------- Teach a skill: record what the user does in this browser ----------
  startTeach() {
    const wc = this.ensure();
    this.teach = { steps: [], at: Date.now() };
    const add = (st) => {
      const T = this.teach; if (!T) return;
      const last = T.steps[T.steps.length - 1];
      st.ts = Date.now();
      if (st.t === 'type' && last && last.t === 'type' && last.field === st.field) { T.steps[T.steps.length - 1] = st; return this.teachEmit(); }
      if (st.t === 'enter' && last && last.t === 'type' && last.field === st.field) { last.enter = true; if (st.value && last.value == null && !last.secret) last.value = st.value; return this.teachEmit(); }
      if (st.t === 'enter' && st.value != null) st = { t: 'type', field: st.field, value: st.value, enter: true, ts: st.ts };
      if (st.t === 'go') {
        if (last && last.t === 'go' && last.url === st.url) return;
        if (last && (last.t === 'click' || last.enter || last.t === 'enter') && st.ts - last.ts < 4000) { last.leadsTo = st.title || st.url; return this.teachEmit(); }
      }
      T.steps.push(st);
      this.teachEmit();
    };
    this._teachAdd = add;
    if (!this._teachHooked) {
      this._teachHooked = true;
      wc.on('console-message', (e, level, message) => {
        const msg = typeof message === 'string' ? message : e?.message || '';
        if (!this.teach || !msg.startsWith('__nxrec__')) return;
        try { this._teachAdd(JSON.parse(msg.slice(9))); } catch (_) {}
      });
      wc.on('did-finish-load', () => { if (this.teach) this.injectRecorder(); });
      wc.on('did-navigate', (_e, url) => { if (this.teach && /^https?:/.test(url)) setTimeout(() => this._teachAdd({ t: 'go', url, title: wc.getTitle() }), 400); });
    }
    const url = wc.getURL();
    if (/^https?:/.test(url)) add({ t: 'go', url, title: wc.getTitle(), start: true });
    this.injectRecorder();
    return this.teach;
  }
  teachEmit() { this.onTeach?.({ personaId: this.id, count: this.teach ? this.teach.steps.length : 0, last: this.teach ? describeStep(this.teach.steps[this.teach.steps.length - 1]) : '' }); }
  injectRecorder() { this.view?.webContents.executeJavaScript(RECORDER_JS, true).catch(() => {}); }
  stopTeach() {
    const T = this.teach; this.teach = null;
    this.view?.webContents.executeJavaScript('window.__nxRecOff && window.__nxRecOff()', true).catch(() => {});
    return T ? T.steps : [];
  }

  state() {
    const wc = this.view?.webContents;
    if (!wc || !this.hasPage) return { hasPage: false };
    return {
      hasPage: true,
      url: wc.getURL(),
      title: wc.getTitle(),
      loading: wc.isLoading(),
      canGoBack: wc.navigationHistory.canGoBack(),
      canGoForward: wc.navigationHistory.canGoForward(),
    };
  }
  emit() {
    this.onState({ personaId: this.id, ...this.state() });
  }

  // b = { mode: 'full' | 'hidden', x, y, width, height }
  setBounds(b) {
    if (!b) return;
    this.mode = b.mode === 'full' ? 'full' : 'hidden';
    if (b.width > 50 && b.height > 50) this.rect = { x: Math.round(b.x || 0), y: Math.round(b.y || 0), width: Math.round(b.width), height: Math.round(b.height) };
    this.apply();
  }
  apply() {
    if (!this.view) return;
    this.view.setBounds(this.rect);
    this.view.setVisible(this.mode === 'full' && this.hasPage);
  }

  // Live preview for the Screen card.
  setThumbs(on) {
    clearInterval(this.thumbTimer);
    this.thumbTimer = on ? setInterval(() => this.thumb(), 1200) : null;
    if (on) this.thumb();
  }
  async thumb() {
    if (!this.view || !this.hasPage || this.mode === 'full' || this.thumbBusy) return;
    this.thumbBusy = true;
    try {
      const img = await this.view.webContents.capturePage();
      if (!img.isEmpty()) {
        const small = img.resize({ width: 720 });
        const win = this.getWin();
        if (win && !win.isDestroyed()) win.webContents.send('browser-thumb', { personaId: this.id, data: 'data:image/jpeg;base64,' + small.toJPEG(72).toString('base64') });
      }
    } catch (_) {
      /* page may be mid-navigation */
    } finally {
      this.thumbBusy = false;
    }
  }

  async load(url) {
    const wc = this.ensure();
    this.hasPage = true;
    this.apply();
    this.emit();
    try {
      await Promise.race([wc.loadURL(url), sleep(20000)]);
    } catch (e) {
      // ERR_ABORTED happens on redirects; the page usually still loads.
      if (!/ERR_ABORTED/.test(e.message)) throw new Error('Could not open the page: ' + e.message.split('\n')[0]);
    }
    await this.settle();
  }

  async settle(ms = 700) {
    const wc = this.view.webContents;
    const start = Date.now();
    while (wc.isLoading() && Date.now() - start < 15000) await sleep(200);
    await sleep(ms);
    this.emit();
  }

  async nav(action, url) {
    const wc = this.ensure();
    if (action === 'back' && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack();
    else if (action === 'forward' && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward();
    else if (action === 'reload') wc.reload();
    else if (action === 'go' && url) await this.load(normalizeUrl(url));
    else if (action === 'home') await this.load(HOME);
    this.emit();
  }

  async snapshot() {
    const wc = this.view.webContents;
    return wc.executeJavaScript(SNAPSHOT_JS, true);
  }

  async readPage(part = 1, find) {
    const s = await this.snapshot();
    // Only the parts about these words (much shorter than the whole page).
    if (find) {
      const words = String(find).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const paras = s.text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
      const hits = paras.map((p, i) => ({ i, n: words.filter((w) => p.toLowerCase().includes(w)).length })).filter((h) => h.n).sort((a, b) => b.n - a.n).slice(0, 12).sort((a, b) => a.i - b.i);
      const els = s.elements.split('\n').filter((l) => words.some((w) => l.toLowerCase().includes(w))).slice(0, 40);
      if (hits.length || els.length) return `URL: ${s.url}\nTitle: ${s.title}\n\n--- Parts about "${find}" ---\n${hits.map((h) => paras[h.i].slice(0, 600)).join('\n…\n') || '(no text matches)'}\n\n--- Matching buttons, links and fields ---\n${els.join('\n') || '(none)'}`;
    }
    const parts = Math.max(1, Math.ceil(s.text.length / MAX_TEXT));
    part = Math.min(Math.max(1, Number(part) || 1), parts);
    let text = s.text.slice((part - 1) * MAX_TEXT, part * MAX_TEXT);
    if (parts > 1) text = `(Page text part ${part} of ${parts}${part < parts ? ` — call browser_read with part ${part + 1} for the rest` : ' — the end'})\n` + text;
    return `URL: ${s.url}\nTitle: ${s.title}\n\n--- Page text ---\n${text}\n\n--- Interactive elements (use their [id] with browser_click / browser_type) ---\n${s.elements || '(none)'}`;
  }

  async elementPoint(id) {
    const wc = this.view.webContents;
    const p = await wc.executeJavaScript(`(() => {
      const el = document.querySelector('[data-pid="${Number(id)}"]');
      if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'center' });
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`, true);
    if (!p) throw new Error(`Element [${id}] not found. Call browser_read again to get fresh ids.`);
    await sleep(150);
    return p;
  }

  async click(id) {
    const wc = this.view.webContents;
    this.selPending = false;
    this.clickedAt = Date.now();
    const { x, y } = await this.elementPoint(id);
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
    await sleep(500);
    await this.settle(600);
  }

  // What kind of field is this? (used to stop bots typing passwords themselves)
  async fieldInfo(id) {
    try {
      const pick = id == null ? 'document.activeElement' : `document.querySelector('[data-pid="${Number(id)}"]')`;
      return await this.view.webContents.executeJavaScript(`(() => { const el = ${pick}; if (!el) return null; return { tag: el.tagName.toLowerCase(), type: (el.type || '').toLowerCase(), name: (el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('autocomplete') || '') + ' ' + (el.getAttribute('aria-label') || '') + ' ' + (el.placeholder || '') }; })()`, true);
    } catch (_) { return null; }
  }

  // Put text in. Editors like Google Slides and Docs ignore a highlight when text is pasted in, so a
  // highlighted piece is first removed with a real Backspace — then the new text goes in its place.
  // "Select everything in the box" is only safe right after clicking into a box — in Slides, doing it
  // with nothing open would select every shape on the slide.
  async selectBox() {
    if (this.googleEditor()) throw new Error('In Google Docs/Slides, replace a box\'s text with browser_replace_text: find its current words (you can see them in the screenshot) and replace them with the new text. For an empty box, double-click it and just type.');
    if (!this.clickedAt || Date.now() - this.clickedAt > 30000) throw new Error('First double-click the text box you want to change (e.g. {"double_click":"Click to add title"} or the words in it), then set its text.');
    await this.key('Cmd+A');
  }
  // Put text in. Editors like Google Slides and Docs ignore a highlight when text is pasted in, so outside
  // Google's editors the highlighted piece is first removed with a real Backspace. Inside Google Docs/Slides
  // that is not safe (it can delete slides), so there text is changed with Find and replace instead.
  async insert(text) {
    const wc = this.view.webContents;
    if (this.selPending) {
      this.selPending = false;
      if (this.googleEditor()) throw new Error('In Google Docs/Slides, change existing text with browser_replace_text (find the old words, replace them with the new ones; "" deletes them). Typing into an empty box after double-clicking it is fine.');
      await this.key('Backspace', 1, true); await sleep(80);
    }
    if (String(text)) await wc.insertText(String(text));
    this.selPending = false;
  }
  async type(id, text, submit, keep) {
    const wc = this.view.webContents;
    if (id != null) {
      await this.click(id);
      if (!keep) await wc.executeJavaScript(`(() => {
        const el = document.querySelector('[data-pid="${Number(id)}"]');
        if (!el) return;
        el.focus();
        if (el.select) el.select(); else document.execCommand('selectAll');
      })()`, true);
      await wc.insertText(String(text));
    } else await this.insert(text);
    if (submit) {
      await sleep(150);
      wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      wc.sendInputEvent({ type: 'char', keyCode: '\r' });
      wc.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
      await sleep(600);
      await this.settle(600);
    }
  }

  // Scrolls like a person with a mouse wheel — so it also works inside boxes that scroll on their own
  // (Google Docs/Slides, Drive and Classroom file viewers, chats, side panels). Falls back to scrolling by script.
  async scroll({ direction = 'down', amount = 'page', id, x, y } = {}) {
    const wc = this.view.webContents;
    const pt = id != null ? await this.elementPoint(id) : x != null && y != null ? { x: Math.round(x * (this.shotScale || 1)), y: Math.round(y * (this.shotScale || 1)) } : null;
    const info = await wc.executeJavaScript(`(() => {
      const vw = innerWidth, vh = innerHeight;
      const scrollable = (el) => { const st = getComputedStyle(el); return /(auto|scroll|overlay)/.test(st.overflowY + st.overflowX) && (el.scrollHeight > el.clientHeight + 20 || el.scrollWidth > el.clientWidth + 20); };
      let box = null;
      ${pt ? `let el = document.elementFromPoint(${pt.x}, ${pt.y}); while (el && el !== document.body && !scrollable(el)) el = el.parentElement; if (el && el !== document.body) box = el;` : ''}
      if (!box) {
        const docScroll = document.scrollingElement.scrollHeight > vh + 20;
        let best = null, bestA = docScroll ? vw * vh * 0.5 : 0;
        for (const el of document.querySelectorAll('body *')) {
          if (!scrollable(el)) continue;
          const r = el.getBoundingClientRect();
          const a = Math.max(0, Math.min(r.right, vw) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
          if (a > bestA) { best = el; bestA = a; }
        }
        box = best;
      }
      window.__nxBox = box;
      const r = box ? box.getBoundingClientRect() : { left: 0, top: 0, width: vw, height: vh };
      const cx = Math.round(Math.max(0, r.left) + Math.min(r.width, vw) / 2), cy = Math.round(Math.max(0, r.top) + Math.min(r.height, vh) / 2);
      const s = box || document.scrollingElement;
      return { x: ${pt ? pt.x : 'cx'}, y: ${pt ? pt.y : 'cy'}, h: Math.min(r.height, vh), w: Math.min(r.width, vw), top: s.scrollTop, left: s.scrollLeft };
    })()`, true);
    const horiz = direction === 'left' || direction === 'right';
    const sign = direction === 'up' || direction === 'left' ? -1 : 1;
    const dist = amount === 'top' || amount === 'bottom' ? 1e6 : amount === 'small' ? 200 : Math.max(200, Math.round((horiz ? info.w : info.h) * 0.85));
    const ticks = Math.min(60, Math.ceil(dist / 120));
    wc.sendInputEvent({ type: 'mouseMove', x: info.x, y: info.y });
    for (let i = 0; i < ticks; i++) {
      wc.sendInputEvent({ type: 'mouseWheel', x: info.x, y: info.y, deltaX: horiz ? -120 * sign : 0, deltaY: horiz ? 0 : -120 * sign, canScroll: true });
      if (i % 6 === 5) await sleep(30);
    }
    await sleep(450);
    // If the wheel did nothing (some pages ignore it), scroll by script.
    const after = await wc.executeJavaScript(`(() => {
      const s = window.__nxBox || document.scrollingElement;
      const before = ${horiz ? info.left : info.top};
      let now = ${horiz ? 's.scrollLeft' : 's.scrollTop'};
      if (Math.abs(now - before) < 2) {
        const d = ${amount === 'top' ? '-1e7' : amount === 'bottom' ? '1e7' : sign * dist};
        if (${horiz}) s.scrollLeft += ${amount === 'top' || amount === 'bottom' ? 'd' : 'd'}; else s.scrollTop += d;
        if (!window.__nxBox) window.scrollBy(${horiz} ? d : 0, ${horiz} ? 0 : d);
        now = ${horiz ? 's.scrollLeft' : 's.scrollTop'};
      }
      const max = ${horiz ? 's.scrollWidth - s.clientWidth' : 's.scrollHeight - s.clientHeight'};
      return { now: Math.round(now), max: Math.round(max), inBox: !!window.__nxBox };
    })()`, true).catch(() => ({ now: 0, max: 0 }));
    await this.settle(400);
    const pct = after.max > 0 ? Math.round((after.now / after.max) * 100) : 100;
    const where = after.max <= 0 ? 'this part does not scroll' : after.now >= after.max - 2 ? 'at the very end' : after.now <= 2 ? 'at the very top' : `${pct}% of the way down`;
    return `Scrolled ${direction}${after.inBox ? ' inside the scrolling box' : ''} — now ${where}.\n\n--- What's on screen now ---\n${await this.visibleText()}`;
  }

  // Text that is on screen right now (also inside boxes that scroll on their own).
  async visibleText() {
    return this.view.webContents.executeJavaScript(`(() => {
      const vw = innerWidth, vh = innerHeight, out = []; let n = 0;
      const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const rg = document.createRange();
      for (let t = w.nextNode(); t && n < 6000; t = w.nextNode()) {
        const s = t.textContent.replace(/\\s+/g, ' ').trim(); if (!s) continue;
        rg.selectNodeContents(t); const r = rg.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw || !r.width) continue;
        const p = t.parentElement; if (p && getComputedStyle(p).visibility === 'hidden') continue;
        out.push(s); n += s.length + 1;
      }
      return out.join('\\n') || '(no text on screen — it may be a picture or a drawn document; use browser_screenshot to look at it)';
    })()`, true).catch(() => '');
  }

  // Click at a spot on the last screenshot (for things without an [id], like canvases, slides, maps).
  async clickAt(x, y, double) {
    const wc = this.view.webContents;
    this.selPending = false;
    this.clickedAt = Date.now();
    const k = this.shotScale || 1, X = Math.round(x * k), Y = Math.round(y * k);
    wc.sendInputEvent({ type: 'mouseMove', x: X, y: Y });
    const n = double ? 2 : 1;
    for (let i = 1; i <= n; i++) { wc.sendInputEvent({ type: 'mouseDown', x: X, y: Y, button: 'left', clickCount: i }); wc.sendInputEvent({ type: 'mouseUp', x: X, y: Y, button: 'left', clickCount: i }); }
    await sleep(500);
    await this.settle(600);
  }

  // Drag from one spot to another on the screenshot (move a picture, select text, resize).
  async drag(x1, y1, x2, y2) {
    const wc = this.view.webContents, k = this.shotScale || 1;
    const a = { x: Math.round(x1 * k), y: Math.round(y1 * k) }, b = { x: Math.round(x2 * k), y: Math.round(y2 * k) };
    wc.sendInputEvent({ type: 'mouseMove', ...a });
    wc.sendInputEvent({ type: 'mouseDown', ...a, button: 'left', clickCount: 1 });
    for (let i = 1; i <= 10; i++) { wc.sendInputEvent({ type: 'mouseMove', x: Math.round(a.x + (b.x - a.x) * i / 10), y: Math.round(a.y + (b.y - a.y) * i / 10), modifiers: ['leftButtonDown'] }); await sleep(20); }
    wc.sendInputEvent({ type: 'mouseUp', ...b, button: 'left', clickCount: 1 });
    await sleep(400);
  }

  // Press keys: "Enter", "Tab", "Escape", "Delete", "Backspace", arrows, "PageDown", or shortcuts like "Cmd+A", "Ctrl+Z", "Cmd+Shift+V".
  // Google Docs/Slides/Sheets draw their own content: there Backspace, Delete, select-all and cut can hit
  // whole slides or shapes instead of text. Bots change text there only through Find and replace.
  googleEditor() { try { const u = new URL(this.view.webContents.getURL()); return (u.hostname === 'docs.google.com' || (process.env.WAYZERR_FAKE_GDOCS && u.port === '8799')) && /^\/(presentation|document|spreadsheets)\//.test(u.pathname); } catch (_) { return false; } }
  async key(combo, times = 1, internal) {
    const k0 = String(combo || '').replace(/\s+/g, '').toLowerCase();
    if (!internal && this.googleEditor() && /^(backspace|delete|del)$|^(cmd|command|meta|ctrl|control)\+(a|x|backspace|delete)$/.test(k0)) {
      throw new Error('Blocked in Google Docs/Slides: Backspace, Delete, select-all and cut can remove whole slides there. To change or delete text use browser_replace_text (it uses Find and replace). To delete a slide use the menu (right-click the slide → Delete) — only if the user asked.');
    }
    const wc = this.view.webContents;
    const selectsAll = /^(cmd|command|meta|ctrl|control)\+a$/i.test(String(combo || '').replace(/\s+/g, ''));
    const parts = String(combo || '').split('+').map((x) => x.trim()).filter(Boolean);
    const MOD = { cmd: 'meta', command: 'meta', meta: 'meta', ctrl: 'control', control: 'control', shift: 'shift', alt: 'alt', option: 'alt' };
    const mods = parts.slice(0, -1).map((m) => MOD[m.toLowerCase()]).filter(Boolean);
    let k = parts[parts.length - 1] || '';
    const NAMES = { enter: 'Return', return: 'Return', esc: 'Escape', escape: 'Escape', tab: 'Tab', delete: 'Delete', del: 'Delete', backspace: 'Backspace', up: 'Up', down: 'Down', left: 'Left', right: 'Right', arrowup: 'Up', arrowdown: 'Down', arrowleft: 'Left', arrowright: 'Right', pagedown: 'PageDown', pageup: 'PageUp', home: 'Home', end: 'End', space: 'Space' };
    k = NAMES[k.toLowerCase()] || (k.length === 1 ? k.toLowerCase() : k);
    const macMods = process.platform === 'darwin' ? mods : mods.map((m) => (m === 'meta' ? 'control' : m));
    for (let i = 0; i < Math.min(50, Math.max(1, times)); i++) {
      wc.sendInputEvent({ type: 'keyDown', keyCode: k, modifiers: macMods });
      if (!macMods.some((m) => m === 'meta' || m === 'control') && (k.length === 1 || k === 'Return' || k === 'Space')) wc.sendInputEvent({ type: 'char', keyCode: k === 'Return' ? '\r' : k === 'Space' ? ' ' : k, modifiers: macMods });
      wc.sendInputEvent({ type: 'keyUp', keyCode: k, modifiers: macMods });
      await sleep(40);
    }
    await sleep(300);
    this.selPending = selectsAll;
  }

  // ----- simple, person-like actions on text (no coordinates needed) -----
  async findText(text, nth) {
    const f = await this.view.webContents.executeJavaScript(FIND_JS(text, nth), true).catch(() => null);
    if (!f) throw new Error(`Couldn't find "${String(text).slice(0, 60)}" on the page. Take a browser_screenshot to see what's there (it may be drawn as a picture — then use browser_click_at).`);
    await sleep(120);
    return f;
  }
  async mouse(x, y, clicks = 1) {
    const wc = this.view.webContents;
    this.selPending = false;
    this.clickedAt = Date.now();
    wc.sendInputEvent({ type: 'mouseMove', x, y });
    for (let i = 1; i <= clicks; i++) { wc.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: i }); wc.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: i }); }
  }
  // Click something by what it says ("Insert", "New slide", "Click to add title", "Replace all").
  async clickText(text, clicks = 1, nth) {
    const f = await this.findText(text, nth);
    await this.mouse(f.x, f.y, clicks);
    await sleep(350); await this.settle(350);
    return f;
  }
  // Highlight exactly this text, like dragging over it with the mouse — then typing replaces it and Delete removes it.
  async selectText(text, nth) {
    const wc = this.view.webContents;
    const f = await this.findText(text, nth);
    if (f.kind === 'input') {
      await this.mouse(f.x, f.y, 1);
      await wc.executeJavaScript(`(() => { const h = window.__nxHit; h.el.focus(); h.el.setSelectionRange(h.start, h.end); })()`, true);
    } else if (f.a && f.b) {
      // drag across the words (works in editors that handle their own selection, like Slides and Docs)…
      wc.sendInputEvent({ type: 'mouseMove', x: f.a.x, y: f.a.y });
      wc.sendInputEvent({ type: 'mouseDown', x: f.a.x, y: f.a.y, button: 'left', clickCount: 1 });
      for (let i = 1; i <= 6; i++) { wc.sendInputEvent({ type: 'mouseMove', x: Math.round(f.a.x + (f.b.x - f.a.x) * i / 6), y: Math.round(f.a.y + (f.b.y - f.a.y) * i / 6), modifiers: ['leftButtonDown'] }); await sleep(15); }
      wc.sendInputEvent({ type: 'mouseUp', x: f.b.x, y: f.b.y, button: 'left', clickCount: 1 });
      await sleep(120);
      // …and set the page selection too (plain editable pages)
      await wc.executeJavaScript(`(() => { const h = window.__nxHit; if (!h || h.kind !== 'text') return; const s = getSelection(); if (s.toString().trim().toLowerCase() === h.node.textContent.slice(h.start, h.end).trim().toLowerCase()) return; const r = document.createRange(); r.setStart(h.node, h.start); r.setEnd(h.node, h.end); s.removeAllRanges(); s.addRange(r); })()`, true).catch(() => {});
    } else {
      await this.mouse(f.x, f.y, 2);
    }
    await sleep(150);
    this.selPending = f.kind !== 'input'; // inputs replace a highlight by themselves
    return f;
  }
  // Replace text: highlight it and type over it. In Google Docs/Slides, if the words aren't readable on the page,
  // use the app's own Find and replace.
  async replaceText(find, replace, all) {
    const host = (() => { try { return new URL(this.view.webContents.getURL()).hostname; } catch (_) { return ''; } })();
    let found = null;
    if (this.googleEditor()) return this.googleFindReplace(find, replace);
    if (!all) found = await this.findText(find).catch(() => null);
    if (found) {
      await this.selectText(find);
      await this.guardTyping();
      if (String(replace) === '') { if (this.selPending || found.kind === 'input') await this.key('Backspace'); this.selPending = false; } else if (found.kind === 'input') await this.view.webContents.insertText(String(replace)); else await this.insert(replace);
      await sleep(250);
      return `Replaced "${String(find).slice(0, 60)}"${replace === '' ? ' (deleted it)' : ` with "${String(replace).slice(0, 60)}"`}.`;
    }
    if (/docs\.google\.com/.test(host)) return this.googleFindReplace(find, replace);
    if (all) {
      const n = await this.view.webContents.executeJavaScript(`(() => { let n = 0; const f = ${JSON.stringify(String(find))}, r = ${JSON.stringify(String(replace))};
        for (const el of document.querySelectorAll('input:not([type=password]),textarea')) { if (el.value.includes(f)) { el.focus(); el.value = el.value.split(f).join(r); el.dispatchEvent(new Event('input', { bubbles: true })); n++; } }
        return n; })()`, true).catch(() => 0);
      if (n) return `Replaced in ${n} field(s).`;
    }
    throw new Error(`Couldn't find "${String(find).slice(0, 60)}" on the page.`);
  }
  async googleFindReplace(find, replace) {
    const wc = this.view.webContents;
    const open = async () => {
      await this.key('Escape', 1, true);
      await this.key('Cmd+Shift+H', 1, true);
      await sleep(800);
      let has = await wc.executeJavaScript(`!![...document.querySelectorAll('[role=dialog]')].find((d) => /replace/i.test(d.innerText || '') && d.getBoundingClientRect().width > 0)`, true).catch(() => false);
      if (!has) { // open it from the menu instead: Edit → Find and replace
        try { await this.clickText('Edit'); await this.clickText('Find and replace'); await sleep(700); } catch (_) {}
        has = await wc.executeJavaScript(`!![...document.querySelectorAll('[role=dialog]')].find((d) => /replace/i.test(d.innerText || '') && d.getBoundingClientRect().width > 0)`, true).catch(() => false);
      }
      return has;
    };
    if (!(await open())) throw new Error("Couldn't open Find and replace. Take a browser_screenshot; for an empty box, double-click it and type.");
    const ok = await wc.executeJavaScript(`(() => {
      const dlg = [...document.querySelectorAll('[role=dialog]')].find((d) => /replace/i.test(d.innerText || '') && d.getBoundingClientRect().width > 0);
      const ins = [...dlg.querySelectorAll('input[type=text],input:not([type])')].filter((i) => i.getBoundingClientRect().width > 0);
      if (ins.length < 2) return 'no-fields';
      const set = (el, v) => { el.focus(); el.select(); document.execCommand('insertText', false, v); if (el.value !== v) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); } };
      set(ins[0], ${JSON.stringify(String(find))}); set(ins[1], ${JSON.stringify(String(replace))});
      const btn = [...dlg.querySelectorAll('[role=button],button')].find((b) => /^replace all$/i.test((b.innerText || b.getAttribute('aria-label') || '').trim()));
      if (!btn) return 'no-button';
      const r = btn.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`, true).catch((e) => 'error ' + e.message);
    if (typeof ok === 'string') { await this.key('Escape', 1, true); throw new Error(`Couldn't use Find and replace (${ok}). Take a browser_screenshot; for an empty box, double-click it and type.`); }
    await this.mouse(ok.x, ok.y, 1); // a real click on "Replace all"
    await sleep(700);
    const said = await wc.executeJavaScript(`(() => { const d = [...document.querySelectorAll('[role=dialog]')].find((d) => /replace/i.test(d.innerText || '')); return d ? (d.innerText.match(/(\\d+|no)[^\\n]*(replaced|found|result)[^\\n]*/i) || [''])[0] : ''; })()`, true).catch(() => '');
    await this.key('Escape', 1, true);
    return `Used Find and replace: "${String(find).slice(0, 60)}" → "${String(replace).slice(0, 60)}"${said ? ` (Google says: ${said})` : ''}. Every match in the file was changed — check the screenshot.`;
  }

  // Never type secrets: not into password or card fields, and not into the email/username box of a sign-in form.
  async guardTyping() {
    const bad = await this.view.webContents.executeJavaScript(`(() => {
      const el = document.activeElement; if (!el) return '';
      const t = (el.type || '').toLowerCase(), meta = ((el.name || '') + ' ' + (el.id || '') + ' ' + (el.getAttribute('autocomplete') || '') + ' ' + (el.getAttribute('aria-label') || '')).toLowerCase();
      if (t === 'password') return 'password';
      if (/cc-|card|cvc|cvv|security.?code/.test(meta)) return 'card';
      if (/^(email|text|tel)$/.test(t) && /email|user|login|identifier/.test(meta) && document.querySelector('input[type=password]')) return 'login';
      return '';
    })()`, true).catch(() => '');
    if (bad) throw new Error(bad === 'card' ? 'Blocked: never type card details yourself. Use cards_list and cards_fill.' : 'Blocked: never type passwords or login details yourself. Use logins_list → logins_fill, or logins_request.');
  }

  // Several steps in one go — much faster than one tool call per click.
  async doSteps(steps = []) {
    const log = [];
    for (let i = 0; i < Math.min(steps.length, 40); i++) {
      const s = steps[i] || {};
      const k = Object.keys(s).find((x) => x !== 'nth' && x !== 'times');
      const v = s[k];
      try {
        if (k === 'open') { await this.load(normalizeUrl(v)); log.push(`opened ${v}`); }
        else if (k === 'click' || k === 'double_click' || k === 'triple_click') {
          const n = k === 'click' ? 1 : k === 'double_click' ? 2 : 3;
          if (typeof v === 'number') { if (n === 1) await this.click(v); else { const p = await this.elementPoint(v); await this.mouse(p.x, p.y, n); await sleep(300); } }
          else await this.clickText(v, n, s.nth);
          log.push(`${k.replace('_', ' ')} "${v}"`);
        } else if (k === 'click_at') { await this.clickAt(Number(v[0]), Number(v[1]), !!s.double); log.push(`clicked at ${v}`); }
        else if (k === 'select') { await this.selectText(v, s.nth); log.push(`highlighted "${String(v).slice(0, 40)}"`); }
        else if (k === 'replace') { log.push(await this.replaceText(v.find, v.with ?? v.replace ?? '', !!v.all)); }
        else if (k === 'type') { await this.guardTyping(); await this.insert(v); await sleep(150); log.push(`typed ${String(v).length} characters`); }
        else if (k === 'set_box_text') { await this.guardTyping(); await this.selectBox(); await this.insert(v); await sleep(150); log.push('replaced the text in the box'); }
        else if (k === 'key') { await this.key(v, Number(s.times) || 1); log.push(`pressed ${v}${s.times > 1 ? ' ×' + s.times : ''}`); }
        else if (k === 'scroll') { await this.scroll({ direction: v }); log.push(`scrolled ${v}`); }
        else if (k === 'wait') { await sleep(Math.min(5000, Number(v) || 500)); log.push('waited'); }
        else throw new Error(`unknown step "${k}"`);
      } catch (e) {
        log.push(`✗ step ${i + 1} (${k}) failed: ${e.message}`);
        break;
      }
    }
    await this.settle(300);
    return log;
  }

  // What the page looks like now, as text: what's on screen + the buttons/fields there (with ids).
  // Much cheaper than a picture. A picture is only added where text can't show the page:
  // Google Docs/Slides/Sheets, drawing apps, maps, or pages that are mostly a canvas.
  async outline(note) {
    let s = { url: this.view.webContents.getURL(), title: '', elements: '', canvas: 0 };
    try { await this.view.webContents.executeJavaScript('window.__nxViewOnly = true', true); s = await this.snapshot(); } catch (_) {}
    const seen = (await this.visibleText()).slice(0, 2500);
    const host = (() => { try { return new URL(s.url).hostname; } catch (_) { return ''; } })();
    const visual = this.googleEditor() || /(^|\.)(canva\.com|figma\.com|miro\.com|photopea\.com|excalidraw\.com|tldraw\.com)$/.test(host) || /google\.[a-z.]+\/maps|maps\.google/.test(s.url) || s.canvas > 0.45 || seen.replace(/\s/g, '').length < 40;
    const text = `${note}\n\nNow on: ${s.title ? s.title + ' — ' : ''}${s.url}\n--- On screen ---\n${seen || '(no text)'}\n--- Buttons, links and fields on screen (use the [id]) ---\n${s.elements || '(none)'}`;
    if (this.lean !== false && !visual) return text + '\n(No screenshot, to save usage: this text shows the page. Call browser_screenshot only if you really need to see the layout or a picture.)';
    return { text: text + '\n(Screenshot below.)', image: await this.screenshot() };
  }

  async screenshot() {
    const img = await this.view.webContents.capturePage();
    // 1024 px wide: still sharp enough to read, and about a third cheaper for the AI than 1100+.
    const small = img.getSize().width > 1024 ? img.resize({ width: 1024 }) : img;
    // Clicks use page coordinates: remember how the screenshot maps onto the page.
    const cssW = await this.view.webContents.executeJavaScript('innerWidth', true).catch(() => small.getSize().width);
    this.shotScale = cssW / small.getSize().width;
    return 'data:image/jpeg;base64,' + small.toJPEG(70).toString('base64');
  }

  // ----- Tool entry point -----
  async run(tool, args) {
    switch (tool) {
      case 'browser_search': {
        await this.load('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(String(args.query || '')));
        return this.readPage();
      }
      case 'browser_open':
        await this.load(normalizeUrl(args.url));
        return this.readPage();
      case 'browser_read':
        this.need();
        return this.readPage(args.part, args.find);
      case 'browser_click':
        this.need();
        if (args.id == null && args.text) {
          await this.clickText(args.text, Math.min(3, Number(args.clicks) || 1), args.nth);
          return this.outline(`Clicked "${args.text}".`);
        }
        if (Number(args.clicks) > 1) { const p = await this.elementPoint(args.id); await this.mouse(p.x, p.y, Math.min(3, Number(args.clicks))); await sleep(400); return 'Clicked ' + args.clicks + ' times.'; }
        await this.click(args.id);
        return 'Clicked. Now on: ' + this.view.webContents.getURL() + '\n\n' + (await this.readPage());
      case 'browser_select_text':
        this.need();
        await this.selectText(args.text, args.nth);
        return 'Highlighted "' + String(args.text).slice(0, 60) + '". Now browser_type (without an id) replaces it, or browser_key Delete removes it.';
      case 'browser_replace_text':
        this.need();
        return this.outline(await this.replaceText(args.find, args.replace ?? '', !!args.all));
      case 'browser_do': {
        this.need();
        const log = await this.doSteps(Array.isArray(args.steps) ? args.steps : []);
        return this.outline(`Steps:\n- ${log.join('\n- ')}`);
      }
      case 'browser_type':
        this.need();
        if (args.id == null && args.replace) { await this.selectBox(); }
        await this.type(args.id ?? null, args.text ?? '', !!args.submit, !!args.keep);
        if (args.submit) return 'Typed and submitted.\n\n' + (await this.readPage());
        // Typing where the cursor is (slides, docs, editors): show what it looks like now, so the bot never types the same thing twice.
        if (args.id == null) return this.outline('Typed. Check how it looks now before doing anything else, and never type the same text again if it is already there.');
        return 'Typed.';
      case 'browser_scroll':
        this.need();
        return this.scroll(args);
      case 'browser_click_at':
        this.need();
        await this.clickAt(Number(args.x), Number(args.y), !!args.double);
        return 'Clicked at ' + args.x + ',' + args.y + '. Take a browser_screenshot to see the result.';
      case 'browser_drag':
        this.need();
        await this.drag(Number(args.x1), Number(args.y1), Number(args.x2), Number(args.y2));
        return 'Dragged.';
      case 'browser_key':
        this.need();
        await this.key(args.keys, Number(args.times) || 1);
        return 'Pressed ' + args.keys + (Number(args.times) > 1 ? ' ×' + args.times : '') + '.';
      case 'browser_back':
        this.need();
        await this.nav('back');
        await this.settle();
        return this.readPage();
      case 'browser_screenshot':
        this.need();
        return { text: 'Screenshot taken; it is attached below.', image: await this.screenshot() };
      default:
        throw new Error('Unknown browser tool');
    }
  }
  need() {
    if (!this.view || !this.hasPage) throw new Error('No page is open yet. Use browser_open or browser_search first.');
  }
}

function normalizeUrl(u) {
  u = String(u || '').trim();
  if (!u) throw new Error('No URL given.');
  if (!/^https?:\/\//i.test(u)) {
    if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(u)) u = 'https://' + u;
    else u = 'https://duckduckgo.com/?q=' + encodeURIComponent(u);
  }
  const parsed = new URL(u);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Only http/https pages can be opened.');
  return parsed.toString();
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const BROWSER_TOOLS = [
  ['browser_search', 'Search the web in your browser. Returns the results page (titles, snippets, links with ids).', { query: { type: 'string' } }, ['query']],
  ['browser_open', 'Open a web page (URL) in your browser and return its text and interactive elements.', { url: { type: 'string' } }, ['url']],
  ['browser_read', 'Read the page: text + numbered buttons/links/fields. find = only the parts about these words (cheaper). Long pages come in parts (part: 2, 3…).', { find: { type: 'string' }, part: { type: 'integer' } }, []],
  ['browser_click', 'Click by [id] or by the words on it (text: "Insert", "Share"). clicks: 2 = double-click, 3 = triple-click.', { id: { type: 'integer' }, text: { type: 'string' }, clicks: { type: 'integer' }, nth: { type: 'integer', description: 'if the words appear more than once, which one (1 = first)' } }, []],
  ['browser_select_text', 'Highlight exact words (in pages, docs, slides, fields). Then browser_type (no id) replaces them or browser_key Delete removes them.', { text: { type: 'string' }, nth: { type: 'integer' } }, ['text']],
  ['browser_replace_text', 'Change words in one step (replace "" deletes). all=true = every occurrence (Google Docs/Slides: uses Find and replace).', { find: { type: 'string' }, replace: { type: 'string' }, all: { type: 'boolean' } }, ['find', 'replace']],
  ['browser_do', 'Several steps in ONE call, then the page as text (a screenshot only in drawn editors like Google Slides). Each step one action: {"click":"Insert"|12}, {"double_click":"…"}, {"triple_click":"…"}, {"click_at":[x,y]}, {"select":"words"}, {"type":"text"}, {"set_box_text":"…"}, {"replace":{"find":"old","with":"new"}}, {"key":"Cmd+B","times":2}, {"scroll":"down"}, {"wait":500}, {"open":"https://…"}. Stops at the first failed step.', { steps: { type: 'array', items: { type: 'object' } } }, ['steps']],
  ['browser_type', 'Type text into field [id] (replaces its text unless keep=true), or without id where the cursor is (replace=true = replace the whole box). submit=true presses Enter. Type each text ONCE.', { id: { type: 'integer' }, text: { type: 'string' }, submit: { type: 'boolean' }, keep: { type: 'boolean', description: 'add to the existing text instead of replacing it' }, replace: { type: 'boolean', description: 'no id: replace everything in the box the cursor is in' } }, ['text']],
  ['browser_scroll', 'Scroll the page or a scrolling box (docs, PDFs, viewers, chats). Returns the text on screen and how far down you are ("at the very end" = done).', { direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] }, amount: { type: 'string', enum: ['small', 'page', 'top', 'bottom'], description: 'default page' }, id: { type: 'integer', description: 'scroll inside this element' }, x: { type: 'number', description: 'or scroll at this spot of the last screenshot' }, y: { type: 'number' } }, []],
  ['browser_click_at', 'Click at x,y of the last screenshot (things with no [id]: slides, canvases, maps). double=true double-clicks.', { x: { type: 'number' }, y: { type: 'number' }, double: { type: 'boolean' } }, ['x', 'y']],
  ['browser_drag', 'Drag from (x1,y1) to (x2,y2) on the last screenshot — move or resize things, select text.', { x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' } }, ['x1', 'y1', 'x2', 'y2']],
  ['browser_key', 'Press a key or shortcut (Enter, Tab, Escape, Delete, arrows, PageDown, Cmd+Z, Cmd+B, Cmd+M…). times repeats it.', { keys: { type: 'string' }, times: { type: 'integer' } }, ['keys']],
  ['browser_back', 'Go back to the previous page.', {}, []],
  ['browser_screenshot', 'See the page as a picture (costs more than text — only for layout, pictures, slides or drawn things; x/y for click_at come from it).', {}, []],
].map(([name, description, properties, required]) => ({ name, description, parameters: { type: 'object', properties, required } }));

module.exports = { describeStep, BotBrowser, BROWSER_TOOLS };
