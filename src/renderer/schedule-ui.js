// Schedules: the "Schedule" tab next to a bot's computer, and the calendar window that opens from it.
// A bot can do anything you tell it, at the time you choose, once or on repeat. The rules for "when" live in schedules.js.
(() => {
  const Sch = window.Schedules;
  if (!Sch) return;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const e_ = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const MIN = 60000, DAY = 86400000, HOUR_H = 60;
  const bots = () => (S.personas || []).filter((p) => !p.group);
  const botById = (id) => (S.personas || []).find((p) => p.id === id);
  const colorOf = (p) => { try { return charOf(p).color || '#C97BEA'; } catch (_) { return '#C97BEA'; } };
  const list = () => S.schedules || [];
  const sod = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  const monday = (d) => { const x = sod(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  const t12 = (ts) => new Date(ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const dLong = (ts) => new Date(ts).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ago = (ts) => { const m = Math.round((Date.now() - ts) / MIN); if (m < 1) return 'just now'; if (m < 60) return `${m} min ago`; if (m < 1440) return `${Math.round(m / 60)} h ago`; return dLong(ts) + ', ' + t12(ts); };
  // "in 2 h 14 min", "tomorrow 8:00"
  const until = (ts) => {
    const m = Math.round((ts - Date.now()) / MIN);
    if (m <= 0) return 'now';
    if (m < 60) return `in ${m} min`;
    if (m < 600) return `in ${Math.floor(m / 60)} h ${m % 60 ? (m % 60) + ' min' : ''}`.trim();
    const d = new Date(ts), t = new Date();
    if (sameDay(d, t)) return `today ${t12(ts)}`;
    if (sameDay(d, addDays(t, 1))) return `tomorrow ${t12(ts)}`;
    return `${dLong(ts)} ${t12(ts)}`;
  };
  const when = (s) => (s.next ? `${s.repeatText} · ${until(s.next)}` : `${s.repeatText} · finished`);
  const ic = (d) => `<svg class="i" viewBox="0 0 24 24">${d}</svg>`;
  const ICON = {
    cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>',
    plus: '<path d="M12 5v14M5 12h14"/>', x: '<path d="M6 6l12 12M18 6L6 18"/>',
    pulse: '<path d="M3 12h4l2.5-7 4 14 2.5-7H21"/>', play: '<path d="M7 5l12 7-12 7z"/>',
    comp: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>', moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z"/>',
    send: '<path d="M5 12l14-7-5 14-2.5-5.5z"/>',
  };

  let ui = { tab: 'calendar', range: 'week', anchor: new Date(), bot: 'all' };
  let root = null, sig = '';
  const activeBot = () => { try { return active(); } catch (_) { return null; } };

  // ---------------------------------------------------------------- the tab beside the computer
  window.renderSchedulePane = function renderSchedulePane() {
    const host = $('#scr-pane-schedule');
    if (!host) return;
    const b = activeBot();
    if (!b || b.group) { host.innerHTML = ''; return; }
    const mine = list().filter((s) => s.botId === b.id).sort((x, y) => (x.enabled === false) - (y.enabled === false) || (x.next || 9e15) - (y.next || 9e15));
    const html = `<div class="sp2">
      <div class="sp2-head"><b>Schedule</b><span class="grow"></span><button class="sp2-btn" data-a="cal">Calendar</button><button class="sp2-btn pri" data-a="new">New task</button></div>
      ${mine.length ? `<div class="sp2-list">${mine.map((s) => `<div class="sp2-row${s.enabled === false ? ' off' : ''}">
          <button class="sp2-main" data-a="edit" data-id="${e_(s.id)}"><b>${e_(s.title)}</b><span>${e_(s.enabled === false ? s.repeatText + ' · paused' : when(s))}</span></button>
          <label class="switch"><input type="checkbox" data-a="toggle" data-id="${e_(s.id)}" aria-label="Turn ${e_(s.title)} on or off" ${s.enabled === false ? '' : 'checked'}><span></span></label></div>`).join('')}</div>`
        : `<div class="sp2-empty"><b>No tasks yet</b><p>Add one here, or ask ${e_(b.name)} in the chat, for example “remind me to stretch every day at 5”.</p></div>`}
      <p class="sp2-foot">${S.scheduleAwake === false ? 'Wayzerr has to be open for tasks to run.' : 'Wayzerr keeps this computer awake while tasks are waiting.'}</p></div>`;
    if (host._html === html) return;
    host._html = html; host.innerHTML = html;
  };
  document.addEventListener('click', (ev) => {
    const btn = ev.target.closest('#scr-pane-schedule [data-a]');
    if (!btn || btn.dataset.a === 'toggle') return;
    const a = btn.dataset.a, id = btn.dataset.id, b = activeBot();
    if (a === 'new') openEditor({ botId: b?.id });
    else if (a === 'cal') openCalendar(b?.id);
    else if (a === 'edit') openEditor(list().find((s) => s.id === id));
  });
  document.addEventListener('change', (ev) => {
    const t = ev.target.closest?.('#scr-pane-schedule [data-a=toggle]');
    if (!t) return;
    window.wayzerr.scheduleToggle(t.dataset.id, t.checked).then(refresh).catch((err) => toast(err.message, true));
  });

  // ---------------------------------------------------------------- the calendar window
  window.openCalendar = function openCalendar(botId) {
    if (root) return;
    ui = { ...ui, bot: botId || 'all', anchor: new Date(), tab: 'calendar' };
    root = document.createElement('div');
    root.id = 'sched';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', 'Schedule');
    $('#layer').appendChild(root);
    overlay(+1);
    draw(true);
    requestAnimationFrame(() => root && root.classList.add('in'));
    root.addEventListener('click', onClick);
    root.addEventListener('change', onChange);
    root.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && e.target.matches?.('.sd-quick')) { e.preventDefault(); $('[data-a=quick]', root)?.click(); } });
    root.addEventListener('dragstart', (e) => { const b = e.target.closest?.('.sd-bot'); if (!b) return; e.dataTransfer.setData('text/wayzerr-bot', b.dataset.bot); e.dataTransfer.effectAllowed = 'copy'; drag = b.dataset.bot; b.classList.add('drag'); });
    root.addEventListener('dragend', () => { drag = null; clearDrop(); $$('.sd-bot.drag', root).forEach((x) => x.classList.remove('drag')); });
    root.addEventListener('dragover', (e) => { if (!drag) return; const gc = e.target.closest('.sd-gc'), mc = e.target.closest('.sd-mc'); if (!gc && !mc) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; showDrop(gc, mc, e); });
    root.addEventListener('dragleave', (e) => { if (!e.relatedTarget || !root.contains(e.relatedTarget)) clearDrop(); });
    root.addEventListener('drop', (e) => {
      if (!drag) return; const id = drag || e.dataTransfer.getData('text/wayzerr-bot'); e.preventDefault(); clearDrop(); drag = null;
      const gc = e.target.closest('.sd-gc'), mc = e.target.closest('.sd-mc');
      if (gc) { const d = slotTime(gc, e); openEditor({ botId: id, start: Sch.toStart(d) }); }
      else if (mc) { const d = new Date(+mc.dataset.day); d.setHours(9, 0, 0, 0); openEditor({ botId: id, start: Sch.toStart(d) }); }
    });
  };
  let drag = null;
  function clearDrop() { $$('.sd-ghost', root).forEach((x) => x.remove()); $$('.sd-mc.drop', root).forEach((x) => x.classList.remove('drop')); }
  function slotTime(gc, ev) {
    const r = gc.getBoundingClientRect();
    const mins = Math.max(0, Math.min(23 * 60 + 45, Math.round(((ev.clientY - r.top) / HOUR_H * 60) / 15) * 15));
    const d = new Date(+gc.dataset.day); d.setHours(Math.floor(mins / 60), mins % 60, 0, 0); return d;
  }
  function showDrop(gc, mc, ev) {
    if (mc) { if (!mc.classList.contains('drop')) { clearDrop(); mc.classList.add('drop'); } return; }
    const d = slotTime(gc, ev), top = (d.getHours() * 60 + d.getMinutes()) / 60 * HOUR_H;
    let g = $('.sd-ghost', gc); if (!g) { clearDrop(); g = document.createElement('div'); g.className = 'sd-ghost'; gc.appendChild(g); }
    const b = botById(drag); g.style.top = top + 'px'; g.innerHTML = `<b>${e_(b ? b.name : '')}</b><small>${t12(d.getTime())}</small>`;
  }
  function closeCalendar() {
    if (!root) return;
    const r = root; root = null;
    r.classList.remove('in');
    setTimeout(() => r.remove(), 200);
    overlay(-1);
  }

  const visible = () => list().filter((s) => ui.bot === 'all' || s.botId === ui.bot);
  function rangeOf() {
    if (ui.range === 'day') { const a = sod(ui.anchor); return [a, addDays(a, 1)]; }
    if (ui.range === 'month') { const f = new Date(ui.anchor.getFullYear(), ui.anchor.getMonth(), 1); const a = monday(f); return [a, addDays(a, 42)]; }
    const a = monday(ui.anchor); return [a, addDays(a, 7)];
  }
  function title() {
    const [a, z] = rangeOf(), l = addDays(z, -1);
    if (ui.range === 'day') return a.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    if (ui.range === 'month') return ui.anchor.toLocaleDateString([], { month: 'long', year: 'numeric' });
    const sameM = a.getMonth() === l.getMonth();
    return `${a.toLocaleDateString([], { month: 'short' })} ${a.getDate()} – ${sameM ? '' : l.toLocaleDateString([], { month: 'short' }) + ' '}${l.getDate()}`;
  }
  const events = (from, to) => {
    const out = [];
    for (const s of visible()) { if (s.enabled === false) continue; for (const t of Sch.occurrences(s, from, to, 400)) out.push({ s, t }); }
    return out.sort((x, y) => x.t - y.t);
  };
  const signature = () => JSON.stringify([list(), (S.scheduleLog || []).slice(0, 30), S.scheduleAwake, (S.personas || []).map((p) => p.id + p.name)]);

  function draw(first) {
    if (!root) return;
    const keep = $('.sd-scroll', root)?.scrollTop;
    const cal = ui.tab === 'calendar';
    root.innerHTML = `<div class="sd-win" role="document">
      <div class="sd-head">
        <b>Schedule</b>
        <div class="sd-seg"><button data-a="tab" data-v="calendar" class="${cal ? 'on' : ''}">Calendar</button><button data-a="tab" data-v="logs" class="${cal ? '' : 'on'}">History</button></div>
        <span class="grow"></span>
        ${bots().length > 1 ? `<select class="sd-sel" data-f="bot" aria-label="Show bot"><option value="all">All bots</option>${bots().map((b) => `<option value="${e_(b.id)}"${ui.bot === b.id ? ' selected' : ''}>${e_(b.name)}</option>`).join('')}</select>` : ''}
        <button class="sd-btn pri" data-a="new">New task</button>
        <button class="sd-x" data-a="close" title="Close" aria-label="Close">${ic(ICON.x)}</button>
      </div>
      <div class="sd-body">${cal ? side() : ''}<div class="sd-center">${cal ? bar() + (ui.range === 'month' ? monthView() : gridView()) : logsView()}</div></div>
      <div class="sd-foot"><span>${S.scheduleAwake === false ? 'Tasks only run while Wayzerr is open and the computer is awake.' : 'Wayzerr keeps the computer awake while tasks are waiting.'}</span><button class="sd-link" data-a="awake">${S.scheduleAwake === false ? 'Keep awake' : 'Don’t keep awake'}</button></div>
    </div>`;
    if (first && cal && ui.range !== 'month') { const sc = $('.sd-scroll', root); if (sc) sc.scrollTop = Math.max(0, (new Date().getHours() - 2) * HOUR_H); }
    else if (keep != null) { const sc = $('.sd-scroll', root); if (sc) sc.scrollTop = keep; }
    sig = signature();
  }
  // The bots on the left: add a task for the bot you are chatting with, or drag any bot onto the calendar to give it a task at that time.
  function side() {
    const cur = pickBot(), me = botById(cur);
    const mine = list().filter((s) => s.botId === cur && s.enabled !== false && s.next).sort((a, b) => a.next - b.next).slice(0, 4);
    return `<aside class="sd-side" aria-label="Bots">
      ${me ? `<div class="sd-sec"><div class="sd-st">New task for ${e_(me.name)}</div>
        <textarea class="sd-quick" rows="2" placeholder="What should ${e_(me.name)} do?" data-q="1"></textarea>
        <button class="sd-btn pri sd-wide" data-a="quick">Add task</button>
        ${mine.length ? `<div class="sd-next">${mine.map((s) => `<button data-a="edit" data-id="${e_(s.id)}"><b>${e_(s.title)}</b><span>${e_(until(s.next))}</span></button>`).join('')}</div>` : ''}</div>` : ''}
      <div class="sd-sec"><div class="sd-st">Drag a bot onto the calendar</div>
        <div class="sd-bots">${bots().map((b) => `<div class="sd-bot${b.id === cur ? ' cur' : ''}" draggable="true" data-bot="${e_(b.id)}" title="Drag onto a day or time to give ${e_(b.name)} a task there">${typeof charEl === 'function' ? charEl(b, 32, 'none') : ''}<span>${e_(b.name)}</span></div>`).join('')}</div></div>
    </aside>`;
  }
  function bar() {
    return `<div class="sd-bar"><div class="sd-nav"><button data-a="prev" title="Previous" aria-label="Previous">${ic(ICON.left)}</button><button data-a="next" title="Next" aria-label="Next">${ic(ICON.right)}</button></div><b class="sd-title">${e_(title())}</b><button class="sd-btn" data-a="today">Today</button><span class="grow"></span>
      <div class="sd-seg">${['day', 'week', 'month'].map((r) => `<button data-a="range" data-v="${r}" class="${ui.range === r ? 'on' : ''}">${r[0].toUpperCase() + r.slice(1)}</button>`).join('')}</div></div>`;
  }

  function layout(evs) { // events at the same time sit side by side
    const out = []; let cluster = [], end = 0;
    const flush = () => { const cols = []; for (const ev of cluster) { let c = cols.findIndex((last) => last <= ev.t); if (c < 0) { c = cols.length; cols.push(0); } cols[c] = ev.t + 50 * MIN; ev.col = c; } for (const ev of cluster) { ev.cols = cols.length; out.push(ev); } cluster = []; };
    for (const ev of evs) { if (cluster.length && ev.t >= end) flush(); cluster.push(ev); end = Math.max(end, ev.t + 50 * MIN); }
    flush();
    return out;
  }
  function gridView() {
    const [a, z] = rangeOf(), n = ui.range === 'day' ? 1 : 7, today = new Date();
    const evs = events(a.getTime(), z.getTime());
    let head = '', cols = '';
    for (let i = 0; i < n; i++) {
      const d = addDays(a, i), isT = sameDay(d, today);
      head += `<div class="sd-gh${isT ? ' today' : ''}"><small>${d.toLocaleDateString([], { weekday: 'short' })}</small><b>${d.getDate()}</b></div>`;
      const mine = layout(evs.filter((v) => sameDay(new Date(v.t), d)));
      cols += `<div class="sd-gc${isT ? ' today' : ''}" data-day="${d.getTime()}">${mine.map((v) => {
        const dt = new Date(v.t), top = (dt.getHours() * 60 + dt.getMinutes()) / 60 * HOUR_H, bot = botById(v.s.botId);
        return `<button class="sd-ev${v.t < Date.now() ? ' past' : ''}" data-a="edit" data-id="${e_(v.s.id)}" style="top:${top}px;height:${HOUR_H * .8}px;left:calc(${(v.col / v.cols) * 100}% + 3px);width:calc(${100 / v.cols}% - 6px)"><b>${e_(v.s.title)}</b><small>${t12(v.t)}${ui.bot === 'all' && bot ? ' · ' + e_(bot.name) : ''}</small></button>`;
      }).join('')}${isT ? `<div class="sd-now" style="top:${(today.getHours() * 60 + today.getMinutes()) / 60 * HOUR_H}px"></div>` : ''}</div>`;
    }
    let hrs = '', lines = '';
    for (let h = 0; h < 24; h++) { hrs += `<div class="sd-hr" style="top:${h * HOUR_H}px"><span>${h === 0 ? '' : new Date(2000, 0, 1, h).toLocaleTimeString([], { hour: 'numeric' })}</span></div>`; lines += `<div class="sd-hl" style="top:${h * HOUR_H}px"></div>`; }
    return `<div class="sd-gridwrap"><div class="sd-grid-head" style="grid-template-columns:56px repeat(${n},1fr)"><div></div>${head}</div>
      <div class="sd-scroll"><div class="sd-grid-body" style="grid-template-columns:56px repeat(${n},1fr);height:${24 * HOUR_H}px"><div class="sd-gutter">${hrs}</div>${cols}<div class="sd-hlines">${lines}</div></div></div></div>`;
  }
  function monthView() {
    const [a, z] = rangeOf(), evs = events(a.getTime(), z.getTime()), today = new Date();
    let cells = '';
    for (let i = 0; i < 42; i++) {
      const d = addDays(a, i), mine = evs.filter((v) => sameDay(new Date(v.t), d)), other = d.getMonth() !== ui.anchor.getMonth();
      cells += `<div class="sd-mc${other ? ' other' : ''}${sameDay(d, today) ? ' today' : ''}" data-day="${d.getTime()}" data-month="1"><b>${d.getDate()}</b>${mine.slice(0, 3).map((v) => `<button class="sd-chip" data-a="edit" data-id="${e_(v.s.id)}">${t12(v.t)} ${e_(v.s.title)}</button>`).join('')}${mine.length > 3 ? `<small>+${mine.length - 3} more</small>` : ''}</div>`;
    }
    return `<div class="sd-month"><div class="sd-mh">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((x) => `<span>${x}</span>`).join('')}</div><div class="sd-mg">${cells}</div></div>`;
  }
  function logsView() {
    const log = (S.scheduleLog || []).filter((r) => ui.bot === 'all' || r.botId === ui.bot);
    const lab = { done: 'Done', failed: 'Failed', running: 'Running', missed: 'Missed', stopped: 'Stopped' };
    if (!log.length) return `<div class="sd-empty"><b>Nothing has run yet</b><p>When a task runs, it shows up here.</p></div>`;
    return `<div class="sd-scroll"><div class="sd-logs"><div class="sd-logs-h"><span>Latest runs</span><button class="sd-link" data-a="clearlog">Clear</button></div>${log.map((r) => `<div class="sd-log ${r.status}"><div class="sd-log-main"><b>${e_(r.title)}</b><span>${e_(r.botName || '')} · ${e_(ago(r.ts))}${r.manual ? ' · run by you' : ''}</span>${r.summary ? `<p>${e_(r.summary)}</p>` : ''}${r.error ? `<p class="err">${e_(r.error)}</p>` : ''}</div><i class="sd-st">${lab[r.status] || r.status}</i></div>`).join('')}</div></div>`;
  }

  // ---------------------------------------------------------------- events in the calendar window
  function onClick(ev) {
    if (ev.target === root) return closeCalendar(); // a click on the dimmed background closes it
    const t = ev.target.closest('[data-a]');
    if (!t) { const gc = ev.target.closest('.sd-gc'); if (gc) slotClick(gc, ev); else { const mc = ev.target.closest('.sd-mc'); if (mc) { const d = new Date(+mc.dataset.day); d.setHours(9, 0, 0, 0); openEditor({ botId: pickBot(), start: Sch.toStart(d) }); } } return; }
    const a = t.dataset.a, id = t.dataset.id;
    if (a === 'close') closeCalendar();
    else if (a === 'tab') { ui.tab = t.dataset.v; draw(ui.tab === 'calendar'); }
    else if (a === 'range') { ui.range = t.dataset.v; draw(true); }
    else if (a === 'new') openEditor({ botId: pickBot() });
    else if (a === 'quick') { const q = $('.sd-quick', root); openEditor({ botId: pickBot(), prompt: q ? q.value.trim() : '' }); }
    else if (a === 'prev' || a === 'next') { const k = a === 'next' ? 1 : -1; ui.anchor = ui.range === 'month' ? new Date(ui.anchor.getFullYear(), ui.anchor.getMonth() + k, 1) : addDays(ui.anchor, k * (ui.range === 'day' ? 1 : 7)); draw(); }
    else if (a === 'today') { ui.anchor = new Date(); draw(true); }
    else if (a === 'edit') openEditor(list().find((s) => s.id === id));
    else if (a === 'awake') window.wayzerr.scheduleAwake(S.scheduleAwake === false).then(refresh);
    else if (a === 'clearlog') window.wayzerr.scheduleLogClear().then(refresh);
  }
  function onChange(ev) {
    if (ev.target.dataset.f === 'bot') { ui.bot = ev.target.value; draw(); }
  }
  const pickBot = () => (ui.bot !== 'all' && botById(ui.bot) ? ui.bot : (activeBot() && !activeBot().group ? activeBot().id : bots()[0]?.id));
  function slotClick(gc, ev) {
    const r = gc.getBoundingClientRect();
    const mins = Math.max(0, Math.min(23 * 60 + 45, Math.round(((ev.clientY - r.top) / HOUR_H * 60) / 15) * 15));
    const d = new Date(+gc.dataset.day); d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    openEditor({ botId: pickBot(), start: Sch.toStart(d) });
  }

  // ---------------------------------------------------------------- make / change a schedule
  const DAYN = [['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6], ['Sun', 0]];
  window.openScheduleEditor = openEditor;
  function openEditor(src = {}) {
    const old = src && src.id ? src : null;
    if (!bots().length) return toast('Make a bot first.', true);
    const startD = Sch.parseStart(src.start) || (() => { const d = new Date(Date.now() + HOUR_H * MIN); d.setMinutes(0, 0, 0); return d; })();
    const rep = src.repeat || { type: 'none' };
    const s = { id: old?.id, botId: src.botId || bots()[0].id, title: src.title || '', prompt: src.prompt || '', useComputer: !!src.useComputer, enabled: src.enabled !== false, rep };
    const days = new Set(rep.days && rep.days.length ? rep.days : [startD.getDay()]);
    modal(`<h3>${old ? 'Edit task' : 'New task'}</h3>
      <label class="f">What should the bot do?</label><textarea id="se-prompt" rows="3" placeholder="Send me a message to pack my bags">${e_(s.prompt)}</textarea>
      ${bots().length > 1 ? `<label class="f">Bot</label><select id="se-bot">${bots().map((b) => `<option value="${e_(b.id)}"${b.id === s.botId ? ' selected' : ''}>${e_(b.name)}</option>`).join('')}</select>` : `<input type="hidden" id="se-bot" value="${e_(s.botId)}">`}
      <div class="se-row"><div><label class="f">Date</label><input id="se-date" type="date" value="${toLocalInput(startD)}"></div><div><label class="f">Time</label><input id="se-time" type="time" value="${pad(startD.getHours())}:${pad(startD.getMinutes())}"></div></div>
      <label class="f">Repeat</label>
      <select id="se-rep"><option value="none">Never</option><option value="daily">Every day</option><option value="weekdays">Every weekday</option><option value="weekly">Every week on…</option><option value="monthly">Every month</option><option value="interval">Every few minutes or hours…</option></select>
      <div id="se-days" class="se-days hidden">${DAYN.map(([n, v]) => `<button type="button" class="dchip${days.has(v) ? ' on' : ''}" data-d="${v}">${n}</button>`).join('')}</div>
      <div id="se-int" class="se-row hidden"><div><label class="f">Every</label><input id="se-every" type="number" min="1" max="999" value="${rep.every || 30}"></div><div><label class="f">&nbsp;</label><select id="se-unit"><option value="minutes">minutes</option><option value="hours">hours</option></select></div></div>
      <label class="se-check"><input type="checkbox" id="se-comp"${s.useComputer ? ' checked' : ''}><span>Use its own computer <small>It turns on by itself, so the first step takes about 30 seconds.</small></span></label>
      <div class="hint">Wayzerr has to be open at that time.</div>
      <div class="modal-actions">${old ? `<button class="btn danger-t" id="se-del">Delete</button><button class="btn" id="se-run">Run now</button>` : ''}<span class="grow"></span><button class="btn" data-close>Cancel</button><button class="btn primary" id="se-save">${old ? 'Save' : 'Add task'}</button></div>
      <div class="cmp-err" id="se-err"></div>`, 'se-modal');
    $('#se-rep').value = rep.type || 'none';
    if (rep.unit) $('#se-unit').value = rep.unit;
    const show = () => { const v = $('#se-rep').value; $('#se-days').classList.toggle('hidden', v !== 'weekly'); $('#se-int').classList.toggle('hidden', v !== 'interval'); };
    show(); $('#se-rep').onchange = show;
    $$('#se-days .dchip').forEach((b) => (b.onclick = () => b.classList.toggle('on')));
    const read = () => {
      const v = $('#se-rep').value;
      return {
        id: old?.id, botId: $('#se-bot').value, title: old ? old.title : '', prompt: $('#se-prompt').value, useComputer: $('#se-comp').checked, enabled: old ? old.enabled !== false : true,
        start: `${$('#se-date').value}T${$('#se-time').value || '09:00'}`,
        repeat: v === 'weekly' ? { type: 'weekly', days: $$('#se-days .dchip.on').map((b) => +b.dataset.d) } : v === 'interval' ? { type: 'interval', every: +$('#se-every').value, unit: $('#se-unit').value } : { type: v },
      };
    };
    $('#se-save').onclick = async () => {
      try { await window.wayzerr.scheduleSave(read()); closeModal(); await refresh(); toast(old ? 'Saved.' : 'Scheduled.'); }
      catch (e) { $('#se-err').textContent = e.message || String(e); }
    };
    if (old) {
      $('#se-del').onclick = () => confirmBox('Delete this task?', `“${old.title}” will not run again.`, 'Delete', async () => { await window.wayzerr.scheduleDelete(old.id); await refresh(); });
      $('#se-run').onclick = async () => { try { await window.wayzerr.scheduleRun(old.id); closeModal(); toast('Started. See Run logs for the result.'); setTimeout(refresh, 600); } catch (e) { $('#se-err').textContent = e.message || String(e); } };
    }
    setTimeout(() => $('#se-prompt')?.focus(), 60);
  }

  async function refresh() { try { S = await api.getState(); } catch (_) { return; } if (root) draw(); window.renderSchedulePane(); }

  // ---------------------------------------------------------------- keep what is on screen fresh
  setInterval(() => {
    if (document.hidden) return;
    try { window.renderSchedulePane(); } catch (_) {}
    if (root && signature() !== sig) draw();
  }, 1500);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root && !$('#modal')) closeCalendar(); });
})();
