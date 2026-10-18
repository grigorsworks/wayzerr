// Every bot's own Linux computer. On systems where computers run, this replaces the browser: the Screen panel shows
// the selected bot's desktop live, and clicking it opens the full desktop (you can click and type in it too).
(() => {
  const box = document.getElementById('cmp-box'), fs = document.getElementById('cmp-fs'), view = document.getElementById('cmp-view');
  if (!box) return;
  const $ = (s) => document.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const mb = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : Math.round(n / 1e6) + ' MB');
  let touchTimer = null, rfb = null, supported = false, st = null, working = '', last = '', botId = '', plan = null, planAt = 0, bUse = null, bUseAt = 0, bLast = '';
  const thumbs = {}; // personaId -> latest picture of that bot's desktop

  const bot = () => { try { return active(); } catch (_) { return null; } }; // the window may still be loading
  window.desktopMode = () => supported;

  window.wayzerr.onComputerProgress(() => draw());
  window.wayzerr.onComputerThumb(({ personaId, data }) => {
    thumbs[personaId] = data;
    const b = bot();
    if (b && b.id === personaId && supported) { const img = $('#scr-thumb'); img.src = data; img.classList.remove('hidden'); $('#scr-empty').classList.add('hidden'); }
  });

  const declined = () => loadPref('computerDeclined', false); // the user pressed "Don't download"
  window.computerRedraw = () => { last = ''; draw(); window.renderDesktop?.(); };
  const setup = () => (st?.setup?.active ? st.setup : null);
  const pct = (s) => (s.total ? Math.round((s.done / s.total) * 100) : 0);

  // The Screen panel: the selected bot's desktop instead of a web page.
  window.renderDesktop = function renderDesktop() {
    const b = bot();
    if (!b || b.group) return;
    const name = b.name;
    $('#scr-title').textContent = `${name}'s computer`;
    const img = $('#scr-thumb'), empty = $('#scr-empty');
    if (st && !st.supported) { // a system without bot computers (an Intel Mac): the browser works as everywhere
      img.classList.add('hidden'); empty.classList.remove('hidden', 'off'); empty.textContent = 'Not available here';
      $('#scr-caption').textContent = `${name}'s computer`; $('#scr-sub').textContent = 'Bots use their browser on this computer';
      $('#scr-live').classList.add('hidden'); const pr = $('#scr-progress'); if (pr) pr.classList.remove('on');
      return;
    }
    const t = st?.running ? thumbs[b.id] : null;
    if (t) img.src = t;
    img.classList.toggle('hidden', !t);
    empty.classList.toggle('hidden', !!t);
    const s = setup();
    const installed = !!(st && st.engine && st.base);
    const usingMine = S.settings.computerTarget === 'mine' && S.settings.myMac && S.settings.myMac.supported;
    empty.textContent = s ? `Getting ${name}'s computer ready… ${pct(s)}%` : st && !installed ? 'No computer yet' : st?.running ? 'Looking at the screen…' : '';
    empty.classList.toggle('off', !st?.running && !s && installed); // switched off: just black
    if (usingMine) { empty.textContent = ''; empty.classList.add('off'); img.classList.add('hidden'); $('#scr-caption').textContent = `Bots are using ${S.settings.myComputerName || 'My Mac'}`; $('#scr-sub').textContent = 'They ask you before each use'; return; }
    $('#scr-caption').textContent = !installed ? `${name} has no computer yet` : st?.running ? `${name}'s computer is on` : `${name}'s computer is off`;
    $('#scr-sub').textContent = !installed ? declined() ? 'You can download it later in Settings → Computer' : 'Download it below to give every bot one' : st?.running ? 'Click to open the desktop' : 'It turns on by itself when a bot needs it';
    $('#scr-live').classList.toggle('hidden', !busy_());
    const prog = $('#scr-progress'); if (prog) prog.classList.toggle('on', !!s || !!working);
  };
  // "Live" badge: the bot is working on its computer right now
  const busy_ = () => { try { const e = [...busy_map().entries()].find(([id, v]) => id === bot()?.id && ['browsing', 'reading', 'typing'].includes(v.activity)); return !!e; } catch (_) { return false; } };
  const busy_map = () => busy; // the app's own list of what each bot is doing

  // The first time (on a Mac that can run computers), say what the two extras are, how big, and why you would want them.
  let nudged = false;
  async function nudge() {
    if (nudged || (typeof tour !== 'undefined' && tour) || loadPref('computerAsked', false) || !supported || (st.engine && st.base) || !S.ready || (S.account && S.account.required && !S.account.signedIn) || $('#modal') || (S.personas || []).length === 0) return;
    nudged = true;
    loadPlan();
    for (let i = 0; i < 20 && !plan; i++) await new Promise((r) => setTimeout(r, 250));
    if ($('#modal') || document.querySelector('.lg-card') || (S.account && S.account.required && !S.account.signedIn)) { nudged = false; return; } // not while the sign-in screen is up
    const total = plan?.total ? mbs(plan.total) : guessSize();
    modal(`<h3>Give your bots a computer</h3>
      <p class="lead">Every bot gets its own computer. ${esc(total)}, downloaded once.</p>
      <div class="modal-actions"><button class="btn" id="nd-no">Don't download</button><button class="btn primary" id="nd-comp">Download</button></div>`, 'nd-modal');
    savePref('computerAsked', true);
    $('#nd-comp').onclick = () => { closeModal(); act('install', bot() || {}); window.setScreen?.(true); window.setScrTab?.('computer'); };
    $('#nd-no').onclick = () => { closeModal(); act('decline', bot() || {}); };
  }

  async function refresh() {
    const b = bot();
    try { st = await window.wayzerr.computerStatus(b ? b.id : 'none'); } catch (_) { return; }
    const was = supported; supported = !!st.supported;
    if (supported && !was) { document.body.classList.add('desktop-mode'); window.renderBrowserState?.(); }
    botId = b?.id || '';
    nudge().catch(() => {});
    window.renderDesktop();
    draw();
  }

  // The box under the screen: setup progress, power, delete.
  function draw() {
    const b = bot();
    if (!b || b.group || !st) { box.innerHTML = ''; return; }
    let body;
    const s = setup();
    const mine = S.settings.computerTarget === 'mine', myName = S.settings.myComputerName || 'My Mac', pm = S.settings.myMac || {};
    // Which computer bots use: their own or yours (the same choice is in Settings → Computer)
    const sw = pm.supported ? `<div class="seg cmp-sw" id="cmp-target"><button data-t="bot" class="${mine ? '' : 'on'}">Bot's own</button><button data-t="mine" class="${mine ? 'on' : ''}">${esc(myName)}</button></div>` : '';
    if (mine && pm.supported) {
      const need = [pm.screen !== 'granted' && 'see the screen', !pm.accessibility && 'click and type'].filter(Boolean);
      const html2 = `<div class="cmp-t">Computer</div>${sw}<p>Bots are working on <b>${esc(myName)}</b>, your own computer. They ask you before each use, and the Stop button stops them.</p>${need.length ? `<p class="cmp-bad">Wayzerr is not allowed to ${need.join(' or ')} yet.</p><button class="btn sm primary" data-a="perm">Allow in Settings</button>` : '<p class="ok-t">Ready</p>'}`;
      if (html2 !== last) { last = html2; box.innerHTML = html2; }
      return;
    }
    if (st.supported && declined() && !(st.engine && st.base) && !setup() && !working) { box.innerHTML = ''; last = ''; return; } // said no: the computer card goes away (Settings → Computer brings it back)
    if (!st.supported) body = `<p>A computer for each bot needs an Apple silicon Mac, a Windows PC or a Linux computer, so it isn't available on this one. The browser below works here, and bots can use it for reading pages, clicking and forms.</p>`;
    else if (working) body = `<p>${esc(working)}</p>`;
    else if (s) body = `<p>Getting computers ready in the background: ${s.step === 'engine' ? 'engine' : 'Linux system'} ${mb(s.done)} of ${mb(s.total)}. One time only; every bot gets its own computer from this.</p>`;
    else if (st.needsQemu && st.base) body = `<p>One more thing: this computer needs the virtual machine program (QEMU), which Linux installs from its software sources. Open a terminal and run this once, then press Check again:</p><p><code>${esc(st.qemuHint || 'sudo apt install qemu-system-x86 qemu-utils')}</code></p><button class="btn sm primary" data-a="recheck">Check again</button>`;
    else if (!st.engine || !st.base) {
      loadPlan();
      const total = plan?.total ? mbs(plan.total) : guessSize();
      body = `${st.setup?.error ? `<p class="cmp-bad">${esc(st.setup.error)}</p>` : ''}
        <div class="cmp-size"><strong>${esc(total)}</strong><span>download, one time</span></div>
        ${st.needsQemu ? `<p>You will also need the virtual machine program: <code>${esc(st.qemuHint || 'sudo apt install qemu-system-x86 qemu-utils')}</code></p>` : ''}
        <button class="btn sm primary" data-a="install">Download ${esc(total)}</button> <button class="btn sm" data-a="decline">Don't download</button>`;
    }
    else if (!st.running) body = `<p>${st.diskSize ? `${esc(b.name)}'s computer uses ${mb(st.diskSize)}.` : `${esc(b.name)} has its own computer, ready to turn on.`}</p><button class="btn sm primary" data-a="start">Turn on</button>${st.diskSize ? ' <button class="btn sm" data-a="delete">Reset</button>' : ''}`;
    else body = `<p>${esc(b.name)}'s computer is on. ${esc(b.name)} can use it, and so can you.</p><button class="btn sm primary" data-a="open">Open desktop</button> <button class="btn sm" data-a="stop">Turn off</button>`;
    const slowNote = st.slow && st.supported && !st.needsQemu && !loadPref('slowNoteOk', false) ? (/^win32/.test(st.system || '')
      ? `<p class="cmp-bad">This PC doesn't let Wayzerr use Windows' own virtualization, so the bot's computer runs in slow mode: it works, but it takes a few minutes to start and feels slow. For full speed, turn on "Windows Hypervisor Platform" (press the Windows key, type "Turn Windows features on or off", tick Windows Hypervisor Platform, then restart) and make sure virtualization is on in the BIOS/UEFI settings.</p>`
      : `<p class="cmp-bad">This computer can't use hardware virtualization (KVM), so the bot's computer runs in slow mode: it works, but it takes a few minutes to start and feels slow. For full speed, turn on virtualization in the BIOS/UEFI settings and add yourself to the kvm group (sudo usermod -aG kvm $USER, then log out and in).</p>`) : '';
    const html = `<div class="cmp-t">Computer</div>${sw}${body}${slowNote ? slowNote + '<button class="btn sm" data-a="okslow">OK</button>' : ''}<div class="cmp-err" id="cmp-err"></div>`;
    if (html !== last) { last = html; box.innerHTML = html; }
  }

  const mbs = (n) => Math.round(n / 1048576).toLocaleString('en-US') + ' MB';
  const guessSize = () => (/^win32/.test(st?.system || '') ? 'about 580 MB' : st?.system === 'linux-x64' ? 'about 530 MB' : 'about 1 GB'); // shown only until the real size arrives from the update server
  const gb = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : Math.round(n / 1e6) + ' MB');
  function loadPlan() { if (plan && Date.now() - planAt < 600000) return; planAt = Date.now(); window.wayzerr.computerPlan().then((p) => { if (p) { plan = p; last = ''; draw(); } }).catch(() => {}); }

  // The browser under the desktop: built into Wayzerr, so it adds nothing to download.
  window.renderBrowserBox = function renderBrowserBox() {
    const box2 = document.getElementById('brw-box');
    if (!box2) return;
    const b = bot();
    if (!b || b.group) { box2.innerHTML = ''; return; }
    const on = !!(S.connectors && S.connectors.browser && S.connectors.browser.enabled);
    if (on && (bUse === null || Date.now() - bUseAt > 30000)) { bUseAt = Date.now(); window.wayzerr.browserUsage().then((n) => { bUse = n; bLast = ''; window.renderBrowserBox(); }).catch(() => {}); }
    const body = on
      ? `<div class="brw-info"><p><b>On.</b> Built into Wayzerr, so there is nothing to download. Saved sign-ins and cookies use ${bUse === null ? 'a little room' : esc(gb(bUse))} on this computer.</p><div><button class="btn sm" data-b="off">Turn off</button> ${bUse > 0 ? '<button class="btn sm" data-b="clear">Sign out of all sites</button>' : ''}</div></div>`
      : `<div class="brw-info"><div class="cmp-size"><strong>0 MB</strong><span>to download</span></div><p>The browser is part of Wayzerr itself, so turning it on takes a second and adds nothing to the download. It only stores what you sign in to, usually 20 to 60 MB.</p><div class="cmp-why"><b>Why you would want it:</b> it is quick (no 30 second start) for reading pages, clicking through sites, filling in forms and signing in with your saved logins. Use the computer when a task needs real software; use the browser for the web.</div><button class="btn sm primary" data-b="on">Turn on browser</button></div>`;
    const html = `<div class="cmp-t">Browser</div>${body}<div class="cmp-err" id="brw-err"></div>`;
    if (html !== bLast) { bLast = html; box2.innerHTML = html; }
  };
  document.addEventListener('click', async (ev) => {
    const a = ev.target.closest('#brw-box [data-b]')?.dataset.b;
    if (!a) return;
    try {
      if (a === 'on' || a === 'off') { S = await window.wayzerr.updateConnector({ key: 'browser', patch: { enabled: a === 'on' } }); bLast = ''; window.renderBrowserBox(); }
      else if (a === 'clear') { await window.wayzerr.clearBrowserData(); bUse = 0; bLast = ''; window.renderBrowserBox(); }
    } catch (e) { const el = document.getElementById('brw-err'); if (el) el.textContent = e.message || String(e); }
  });
  const fail = (e) => { const el = document.getElementById('cmp-err'); if (el) el.textContent = e.message || String(e); };
  box.addEventListener('click', async (ev) => {
    const t = ev.target.closest('[data-t]')?.dataset.t;
    if (t) { S = await window.wayzerr.saveProfile({ computerTarget: t }); last = ''; draw(); window.renderDesktop?.(); return; }
    if (ev.target.closest('[data-a="perm"]')) { go('settings', 'computer'); return; }
    const a = ev.target.closest('[data-a]')?.dataset.a;
    const b = bot();
    if (!a || !b) return;
    await act(a, b);
  });

  async function act(a, b) {
    try {
      if (a === 'recheck') { last = ''; await refresh(); }
      else if (a === 'decline') { savePref('computerDeclined', true); last = ''; draw(); window.renderDesktop?.(); }
      else if (a === 'okslow') { savePref('slowNoteOk', true); last = ''; draw(); }
      else if (a === 'install') { savePref('computerDeclined', false); working = 'Downloading…'; draw(); await window.wayzerr.computerInstall(); working = ''; }
      else if (a === 'start') { working = 'Turning on…'; draw(); await window.wayzerr.computerStart(b.id); working = ''; await refresh(); await openIt(b); }
      else if (a === 'open') await openIt(b);
      else if (a === 'stop') await window.wayzerr.computerStop(b.id);
      else if (a === 'delete' && confirm(`Reset ${b.name}'s computer? Everything ${b.name} installed or saved on it (not the shared files) is erased.`)) await window.wayzerr.computerDelete(b.id);
    } catch (e) { working = ''; last = ''; await refresh(); fail(e); return; }
    working = ''; setTimeout(refresh, a === 'stop' ? 1500 : 0);
  }


  // The bot's mouse: a pointer that glides over the small screen and the full-screen computer, with a ring where it clicks.
  const ptrEls = new Map();
  let ptrTimer = null;
  function ptrEl(host) {
    let e = ptrEls.get(host);
    if (!e || !host.contains(e)) { e = document.createElement('div'); e.className = 'bot-ptr'; e.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M4 2l15 9-6.5 1.6L9.5 19z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg><i></i>'; host.appendChild(e); ptrEls.set(host, e); }
    return e;
  }
  function placePtr(host, rectOf, p) {
    const e = ptrEl(host), hr = host.getBoundingClientRect(), r = rectOf.getBoundingClientRect();
    if (!r.width || !p.w) return;
    e.style.transform = `translate(${r.left - hr.left + (p.x / p.w) * r.width}px, ${r.top - hr.top + (p.y / p.h) * r.height}px)`;
    e.classList.add('on');
    if (p.down) { e.classList.remove('click'); void e.offsetWidth; e.classList.add('click'); }
  }
  window.wayzerr.onComputerPointer((p) => {
    if (p.personaId !== botId) return;
    const card = document.getElementById('scr-card'); if (card && !card.closest('.hidden')) placePtr(card, card, p);
    if (!fs.classList.contains('hidden')) { const cv = view.querySelector('canvas'); if (cv) placePtr(view, cv, p); }
    clearTimeout(ptrTimer); ptrTimer = setTimeout(() => ptrEls.forEach((e) => e.classList.remove('on')), 25000);
  });

  // Clicking the screen card
  window.openDesktop = async function openDesktop() {
    if (S.settings.computerTarget === 'mine' && S.settings.myMac && S.settings.myMac.supported) return; // bots are on your own computer
    const b = bot();
    if (!b || !st) return;
    if (!st.engine || !st.base) return; // still being set up
    await act(st.running ? 'open' : 'start', b);
  };

  async function openIt(b) {
    const s = await window.wayzerr.computerStatus(b.id);
    if (!s.running) throw new Error('The computer is not on.');
    document.getElementById('cmp-name').textContent = b.name + "'s computer";
    fs.classList.remove('hidden');
    view.innerHTML = '';
    const RFB = window.NoVNC.default;
    rfb = new RFB(view, `ws://127.0.0.1:${s.port}/${s.token}`);
    rfb.scaleViewport = true;
    rfb.resizeSession = false;
    rfb.focus();
    clearInterval(touchTimer); touchTimer = setInterval(() => window.wayzerr.computerTouch(b.id).catch(() => {}), 60000); // watching keeps it on
  }
  document.getElementById('cmp-close').onclick = () => { clearInterval(touchTimer); try { rfb?.disconnect(); } catch (_) {} rfb = null; fs.classList.add('hidden'); view.innerHTML = ''; };

  setInterval(() => { if (!document.hidden) refresh(); }, 2500);
  refresh();
})();
