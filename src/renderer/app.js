// Which computer this is (shortcut labels and installer names).
const IS_MAC = /Mac/i.test(navigator.platform || navigator.userAgent);
const IS_WIN = /Win/i.test(navigator.platform || navigator.userAgent);
const MOD = IS_MAC ? '⌘' : 'Ctrl';
const INSTALLER = IS_MAC ? 'Wayzerr.dmg' : IS_WIN ? 'Wayzerr Setup (.exe)' : 'Wayzerr AppImage';
const USAGE_DS = {
  low: 'Uses as little of your AI plan or credits as possible: short answers, less thinking, a small model for chit-chat, fewer saved memories. Chats are never shortened by themselves.',
  balanced: 'Saves usage without making bots worse: they only load the tools a task needs and reuse what the AI already read.',
  max: 'Always sends everything (all tools, the whole chat). Uses the most.',
};
const INSTALLER_EXT = IS_MAC ? '.dmg' : IS_WIN ? '.exe' : '.AppImage or .deb';
/* Wayzerr — renderer UI */
const api = window.wayzerr;
const { makeCharacter, characterSvg } = window.Characters;

let S = null; // state from the main process
let view = 'chat'; // chat | new | connectors | settings
const busy = new Map(); // personaId -> { activity, text }
let chatError = null;
let mounted = null; // { id, count } of the chat currently in the DOM
let screenOpen = loadPref('screenOpen', false);
let browserSt = { hasPage: false };
let overlayCount = 0;
const seenRows = new Set();

// ---------- icons ----------
const I = {
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="M9.5 4v16"/>',
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h6M12 16v4"/>',
  back: '<path d="m15 18-6-6 6-6"/>',
  fwd: '<path d="m9 18 6-6-6-6"/>',
  reload: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  collapse: '<path d="m6 17 5-5-5-5M13 17l5-5-5-5"/>',
  up: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  mic: '<rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  micOff: '<path d="m3 3 18 18"/><path d="M9 9v3a3 3 0 0 0 5 2.1M15 10V6a3 3 0 0 0-5.9-.7"/><path d="M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3"/>',
  wave: '<path d="M3 10v4M7.5 6v12M12 3v18M16.5 7v10M21 10v4"/>',
  speaker: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12"/>',
  speakerOff: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m16 9 5 6M21 9l-5 6"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>',
  lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  shuffle: '<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 6 1V5a3 3 0 0 0-3-1zM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-6 1"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/>',
  broom: '<path d="M19 3 9 13M7 14l3 3-4 4H3v-3z"/>',
  compact: '<path d="M4 12h16M12 3v6M9 6l3 3 3-3M12 21v-6M9 18l3-3 3 3"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.8"/><path d="m21 15-5-5L5 21"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  file: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 13h6M9 17h6"/>',
  chev: '<path d="m7 10 5 5 5-5"/>',
  pin: '<path d="M12 17v5M8 3h8l-1.2 6.2L18 13H6l3.2-3.8z"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  login: '<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  more: '<circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/>',
  cloud: '<path d="M7 18a4.5 4.5 0 0 1-.6-8.96A6 6 0 0 1 18 8.5a4.5 4.5 0 0 1-.5 9.5z"/>',
  apps: '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1.1 1-1.1 1.7M12 17h.01"/>',
  play: '<path d="M7 4.5v15l12-7.5z"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  clip: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4h6v3H9z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  doc: '<path d="M14 3H6v18h12V7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  connectors: '<circle cx="12" cy="12" r="2.6"/><circle cx="12" cy="4" r="1.8"/><circle cx="19.5" cy="16.5" r="1.8"/><circle cx="4.5" cy="16.5" r="1.8"/><path d="M12 5.8v3.6M13.9 13.6l3.9 2.1M10.1 13.6l-3.9 2.1"/>',
  phone: '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18.5h2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  puzzle: '<path d="M9 4a2 2 0 0 1 4 0v2h4v4h-2a2 2 0 0 0 0 4h2v4h-4v-2a2 2 0 0 0-4 0v2H5v-4h2a2 2 0 0 0 0-4H5V6h4z"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  cookie: '<path d="M12 3a9 9 0 1 0 9 9 3 3 0 0 1-3-3 3 3 0 0 1-3-3 3 3 0 0 1-3-3z"/><circle cx="9" cy="10" r="1"/><circle cx="14" cy="15" r="1"/><circle cx="9" cy="15" r="1"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  finger: '<path d="M6.5 6.5A8 8 0 0 1 20 12v1M4 10a8 8 0 0 1 .8-2.4M4 14v-2M8 20a12 12 0 0 1-1.6-4M12 12v2a8 8 0 0 0 1.5 5M8.4 9.5A4 4 0 0 1 16 12v2.5M17.5 19a12 12 0 0 0 .5-2.5"/>',
  group: '<circle cx="9" cy="8" r="3"/><path d="M3 20a6 6 0 0 1 12 0M16 11a3 3 0 1 0 0-6M21 20a6 6 0 0 0-4-5.6"/>',
};
const icon = (n) => `<svg class="i" viewBox="0 0 24 24">${I[n]}</svg>`;

const BUILTIN_ICON = { browser: 'compass', team: 'group', logins: 'key', files: 'folder', clipboard: 'clip', notifications: 'bell', open: 'external', web: 'doc' };
function siteLogo(key, cls = '', letter = '?') {
  const src = key && ICONS[key];
  return src ? `<img class="logo ${cls}" src="${src}" alt="">` : `<span class="prov-badge ${cls} b-custom" data-logo="${esc(key || '')}" data-cls="${cls}">${esc(String(letter || '?')[0].toUpperCase())}</span>`;
}

// ---------- helpers ----------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const bots = () => S.personas;
const active = () => S.personas.find((p) => p.id === S.activePersonaId) || null;
const tagOf = (p) => p.tag ?? p.tagline ?? '';
const descOf = (p) => p.description ?? p.personality ?? '';
const charOf = (p) => p.character || makeCharacter(p.id + p.name);
function loadPref(k, d) { try { const v = localStorage.getItem('wayzerr.' + k) ?? localStorage.getItem('persona.' + k); return v === null || v === undefined ? d : JSON.parse(v); } catch (_) { return d; } }
function savePref(k, v) { try { localStorage.setItem('wayzerr.' + k, JSON.stringify(v)); } catch (_) {} }

function groupAvatar(p, size) {
  const mem = (p.members || []).map((id) => S.personas.find((x) => x.id === id)).filter(Boolean).slice(0, 3);
  const s = Math.round(size * (mem.length > 2 ? 0.58 : 0.66));
  const pos = mem.length > 2 ? [[0, 0], [size - s, size * 0.12], [(size - s) / 2, size - s]] : [[0, 0], [size - s, size - s]];
  return `<span class="grp-av" style="width:${size}px;height:${size}px">${mem.map((m, i) => `<span style="left:${pos[i][0]}px;top:${pos[i][1]}px">${characterSvg(charOf(m), { size: s })}</span>`).join('')}</span>`;
}
function charEl(p, size, state) {
  if (p.group) return groupAvatar(p, size);
  const st = state === 'none' ? null : state || busy.get(p.id)?.activity;
  return characterSvg(charOf(p), { size, state: st });
}

function toast(msg, isErr = false) {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast' + (isErr ? ' err' : '');
  t.textContent = msg;
  t.setAttribute('role', isErr ? 'alert' : 'status');
  document.body.appendChild(t);
  setTimeout(() => { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3200);
}

async function run(fn) {
  try {
    const r = await fn();
    if (r && r.personas) { S = r; render(); }
    return r;
  } catch (e) {
    toast(e.message, true);
    throw e;
  }
}

function md(text) {
  let s = esc(text);
  const blocks = [];
  s = s.replace(/```([a-zA-Z0-9+#_-]*)\n?([\s\S]*?)```/g, (_, lang, code) => { blocks.push({ lang, code }); return `\u0000${blocks.length - 1}\u0000`; });
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/[ \t]+$/gm, '');
  // Clean look: a bold or # line on its own becomes a small section title; bold inside sentences is dropped.
  s = s.replace(/^(?:#{1,4} +(.+?)|\*\*([^*\n]+?):?\*\*:?)$/gm, (_, a, b) => `\u0001${(a || b).replace(/\*\*/g, '').replace(/:$/, '')}\u0001`);
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '$1');
  s = s.replace(/(^|[^*\w])[*_]([^*_\n]+)[*_](?![\w*])/g, '$1<em>$2</em>');
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, t, u) => `<a href="${u}" target="_blank"${t.length <= 28 ? ' class="src"' : ''}>${t}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, '$1<a href="$2" target="_blank">$2</a>');
  // A short line with no end punctuation right before a list is its title.
  {
    const L = s.split('\n'), isItem = (l) => /^\s*(?:[-*] |\d+\. )/.test(l || '');
    for (let i = 0; i < L.length; i++) {
      const l = L[i].trim();
      if (!l || isItem(l) || l.includes('\u0001') || l.length > 48 || /[.!?:,;]$/.test(l)) continue;
      const n = L[i + 1]?.trim() ? i + 1 : i + 2;
      if (isItem(L[n])) { L[i] = `\u0001${l}\u0001`; if (n === i + 2) L.splice(i + 1, 1); }
    }
    s = L.join('\n');
  }
  // lists
  s = s.replace(/(?:^|\n)((?:[-*] .+(?:\n|$))+)/g, (m, block) => '\n<ul>' + block.trim().split('\n').map((l) => `<li>${l.replace(/^[-*] /, '')}</li>`).join('') + '</ul>\n');
  s = s.replace(/(?:^|\n)((?:\d+\. .+(?:\n|$))+)/g, (m, block) => '\n<ol>' + block.trim().split('\n').map((l) => `<li>${l.replace(/^\d+\. /, '')}</li>`).join('') + '</ol>\n');
  s = s.replace(/\u0001([^\u0001]+)\u0001\n?/g, '\n\n<div class="md-h">$1</div>\n\n');
  s = s.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean).map((p) => (/^<(ul|ol|div)/.test(p) ? p : `<p>${p.replace(/\n/g, '<br>')}</p>`)).join('');
  s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<div class="codebox"><pre><code>${blocks[i].code}</code></pre><div class="code-bar"><span class="code-lang">${blocks[i].lang || 'code'}</span><button type="button" class="code-copy">Copy</button></div></div>`);
  return s;
}
const plain = (t) => String(t || '').replace(/[*_`#>\[\]]/g, '').replace(/\(https?:[^)]+\)/g, '').replace(/\s+/g, ' ').trim();

function fmtTime(ts) {
  const d = new Date(ts);
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today ' + t;
  if (d.toDateString() === y.toDateString()) return 'Yesterday ' + t;
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + t;
}

// ---------- light / dark ----------
const darkMQ = window.matchMedia('(prefers-color-scheme: dark)');
function isLight() { const t = S?.settings?.theme || 'system'; return t === 'light' || (t === 'system' && !darkMQ.matches); }
function applyTheme() { document.documentElement.classList.toggle('light', isLight()); }
darkMQ.addEventListener?.('change', () => { applyTheme(); if (typeof render === 'function' && S) render(); });

// ---------- unsent messages are kept per bot ----------
const composerDrafts = loadPref('drafts', {});
function setDraft(id, text) { if (text && text.trim()) composerDrafts[id] = text; else delete composerDrafts[id]; savePref('drafts', composerDrafts); }
const getDraft = (id) => composerDrafts[id] || '';
let draftSaveTimer = 0;
const saveDraftSoon = (id, text) => { clearTimeout(draftSaveTimer); draftSaveTimer = setTimeout(() => setDraft(id, text), 300); };
function stashDraft() {
  const box = $('#composer-input');
  if (mounted && box) setDraft(mounted.id, box.value);
  if (S?.personas) for (const id of Object.keys(composerDrafts)) if (!S.personas.some((p) => p.id === id)) delete composerDrafts[id];
}

// ---------- render root ----------// ---------- render root ----------
function render() {
  applyTheme();
  stashDraft();
  const needsTerms = !!(S.settings.terms && !S.settings.terms.accepted);
  const needsLogin = !!(S.account && S.account.required) && !S.account.signedIn;
  const needsSetup = !S.ready && !S.settings.setupSkipped;
  $('#sidebar').classList.toggle('hidden', needsTerms || needsLogin || needsSetup);
  $('#screen').classList.toggle('hidden', needsTerms || needsLogin || needsSetup);
  if (needsTerms) { mounted = null; return renderTerms(); }
  if (needsLogin) { mounted = null; return renderLogin(); }
  $('#main').dataset.lg = '';
  if (needsSetup) { mounted = null; return renderSetup(); }
  maybeTour();
  renderSidebar();
  updateConnBadge();
  renderBrowserState();
  // Group chats are just bots talking — no browser screen there.
  $('#screen').classList.toggle('away', view === 'settings' || view === 'talk' || (view === 'chat' && !!active()?.group));
  syncScreen();
  if (view === 'talk') { mounted = null; return renderTalk(); }
  if (view === 'connectors') { view = 'settings'; settingsTab = 'connectors'; }
  if (view === 'settings') { mounted = null; return renderSettings(); }
  if (view === 'new') { mounted = null; return renderNew(); }
  const p = active();
  if (!p) { mounted = null; return renderNew(); }
  renderChat(p);
}

// ---------- sidebar ----------
function lastMessage(p) {
  const msgs = (S.chats[p.id] || []).filter((m) => m.role !== 'activity' && m.role !== 'card');
  return msgs[msgs.length - 1];
}
// Pinned bots stay at the top (in the order you pinned them); the rest are newest first.
let pins = loadPref('pins', []);
const isPinned = (id) => pins.includes(id);
function togglePin(id) { pins = isPinned(id) ? pins.filter((x) => x !== id) : [...pins, id]; savePref('pins', pins); renderSidebar(); }
function sortedBots() {
  const recent = (p) => lastMessage(p)?.ts || p.created || 0;
  return [...bots()].sort((a, b) => {
    const pa = pins.indexOf(a.id), pb = pins.indexOf(b.id);
    if (pa >= 0 && pb >= 0) return pa - pb;
    if (pa >= 0) return -1;
    if (pb >= 0) return 1;
    return recent(b) - recent(a);
  });
}
// Keyed update: rows (and their characters) are reused, so animations never jump.
function renderSidebar() {
  const list = $('#bot-list');
  const sorted = sortedBots();
  if (!sorted.length) {
    list.innerHTML = `<div class="side-empty">No bots yet.<br>Press ＋ New bot to create one.</div>`;
    return;
  }
  list.querySelector('.side-empty')?.remove();
  const keep = new Set(sorted.map((p) => p.id));
  $$('.row', list).forEach((r) => { if (!keep.has(r.dataset.id)) r.remove(); });
  sorted.forEach((p, i) => {
    const b = busy.get(p.id);
    const last = lastMessage(p);
    const look = JSON.stringify([p.name, tagOf(p), charOf(p), isPinned(p.id)]);
    let row = list.querySelector(`.row[data-id="${p.id}"]`);
    if (!row || row.dataset.look !== look) {
      const fresh = document.createElement('button');
      fresh.className = 'row' + (seenRows.has(p.id) ? '' : ' row-enter');
      fresh.dataset.id = p.id;
      fresh.dataset.look = look;
      fresh.title = p.name;
      fresh.innerHTML = `${charEl(p, 40, b?.activity || 'none')}<div class="meta"><div class="top"><span class="nm">${esc(p.name)}</span>${isPinned(p.id) ? `<span class="pin-ic" title="Pinned">${icon('pin')}</span>` : ''}${tagOf(p) ? `<span class="chip">${esc(tagOf(p))}</span>` : ''}</div><div class="pv"></div></div><span class="row-more" role="button" tabindex="0" title="Edit or delete" aria-label="Options for ${esc(p.name)}">${icon('more')}</span>`;
      fresh.onclick = () => openChat(p.id);
      const dots = fresh.querySelector('.row-more');
      const menu = (e) => { e.preventDefault(); e.stopPropagation(); rowMenu(p, dots); };
      dots.onclick = menu;
      dots.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') menu(e); };
      fresh.oncontextmenu = menu; // right-click works too
      if (row) row.replaceWith(fresh); else list.appendChild(fresh);
      row = fresh;
      seenRows.add(p.id);
    }
    // position (only move when the order actually changed)
    if (list.children[i] !== row) list.insertBefore(row, list.children[i] || null);
    row.classList.toggle('active', p.id === S.activePersonaId && view === 'chat');
    window.Characters.setState(row.querySelector('.char'), b?.activity || null);
    row.classList.toggle('unread', isUnread(p));
    const pv = row.querySelector('.pv');
    const text = b ? liveLabel(p, b) + '…' : last ? (last.from ? last.from.name + ': ' : last.role === 'user' ? 'You: ' : '') + (last.image ? '🖼️ Picture' : plain(last.content) || (last.attachments?.length ? '📎 Attachment' : '')) : descOf(p) || 'New bot';
    const dr = !b && !(p.id === S.activePersonaId && view === 'chat') ? getDraft(p.id) : '';
    const shown = dr ? 'Draft: ' + dr.replace(/\s+/g, ' ').trim() : text;
    pv.classList.toggle('draft', !!dr);
    if (pv.textContent !== shown) pv.textContent = shown;
    pv.classList.toggle('live', !!b);
    pv.classList.toggle('shimmer', !!b);
  });
}
// ----- unread: a blue dot until you open the chat -----
const seenLocal = {};
const seenAt = (id) => Math.max(seenLocal[id] || 0, (S.seen || {})[id] || 0);
const fromBot = (m) => m.role === 'assistant' || m.role === 'card' || (m.role === 'user' && m.from) || (m.role === 'activity' && m.kind === 'botmsg');
function isUnread(p) {
  if (p.id === S.activePersonaId && view === 'chat') return false;
  const list = S.chats[p.id] || [];
  for (let i = list.length - 1; i >= 0; i--) { const m = list[i]; if (!fromBot(m)) { if (m.role === 'user') return false; continue; } return (m.ts || 0) > seenAt(p.id); }
  return false;
}
function markSeen(id) {
  if (!id) return;
  const last = Math.max(0, ...(S.chats[id] || []).map((m) => m.ts || 0));
  if (seenAt(id) >= last && seenLocal[id]) return;
  seenLocal[id] = Math.max(Date.now(), last);
  api.markSeen?.(id).catch(() => {});
}
function openChat(id) {
  view = 'chat';
  chatError = null;
  run(() => api.setActive(id));
}

// ---------- terms (before first use, and again when the Terms change) ----------
const LEGAL_URL = 'https://wayzerr.com/';
const MIN_AGE = 16;
const legalLinks = () => `<a href="#" data-legal="terms">Terms of Service</a>`; // add the Privacy Policy link here when that page is published
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('[data-legal]');
  if (a) { e.preventDefault(); api.openExternal(LEGAL_URL + a.dataset.legal).catch(() => {}); }
});
function renderTerms() {
  if ($('#main .tm-card')) return;
  $('#main').dataset.lg = '';
  $('#main').innerHTML = `
    <div class="setup"><div class="setup-card lg-card tm-card">
      <div class="lg-brand"><img class="lg-dark" src="../icon.png" alt="" width="26" height="26"><img class="lg-light" src="../icon-light.png" alt="" width="26" height="26"><span>Wayzerr</span></div>
      <h1>Before you start</h1>
      <p class="lead">Please read and agree to how Wayzerr works.</p>
      <ul class="tm-list">
        <li><b>Bots act for you.</b> They can browse, use your connected apps and, if you allow it, send, buy, post or delete things. You are responsible for what they do, so check what they ask to do before you approve it.</li>
        <li><b>AI can be wrong.</b> Don’t rely on answers for medical, legal, financial or safety decisions without checking.</li>
        <li><b>Your data goes where you send it.</b> Chats and logins stay on this computer. Messages go to the AI you pick, and your account is only your email address.</li>
      </ul>
      <label class="f" for="tm-age">1. How old are you?</label>
      <input id="tm-age" type="number" inputmode="numeric" min="1" max="120" autocomplete="off" />
      <div class="lg-err tm-agerr" role="alert"></div>
      <label class="tm-agree"><input type="checkbox" id="tm-ok" disabled><span>2. I agree to the ${legalLinks()}.</span></label>
      <div class="lg-row"><button class="btn ghost" id="tm-quit" type="button">Quit</button><button class="btn primary" id="tm-go" type="button" disabled>Agree and continue</button></div>
      <div class="lg-err" role="alert"></div>
    </div></div>`;
  const ok = $('#tm-ok'), go = $('#tm-go'), age = $('#tm-age');
  const ageOk = () => { const n = parseInt(age.value, 10); return n >= MIN_AGE && n <= 120; };
  const update = () => {
    const n = parseInt(age.value, 10);
    $('.tm-agerr').textContent = age.value !== '' && n < MIN_AGE ? `Sorry, Wayzerr is for people aged ${MIN_AGE} and over.` : '';
    ok.disabled = !ageOk(); if (ok.disabled) ok.checked = false;
    go.disabled = !(ageOk() && ok.checked);
  };
  age.oninput = update; ok.onchange = update;
  $('#tm-quit').onclick = () => api.quitApp().catch(() => {});
  go.onclick = async () => {
    if (!ok.checked || !ageOk()) return; // only the yes/no is kept, never the exact age
    go.disabled = true;
    try { S = await api.acceptTerms(); render(); } catch (e) { go.disabled = false; $('.tm-card .lg-err').textContent = e.message || 'Something went wrong. Try again.'; }
  };
  age.focus();
}

// ---------- setup (first run) ----------
// First screen: pick how your bots think. Cloud = sign in with a plan you already have (easiest),
// API key = paste a key from a provider. Both forms stay in the page, so nothing typed is lost when you switch.
// First thing a new install shows: log in or sign up on the website, then come back here.
function renderLogin() {
  const A = S.account || {};
  if ($('.nd-modal')) { closeModal(); savePref('computerAsked', false); } // the computer offer must not sit on top of the sign-in screen; it comes back after sign-in
  const key = JSON.stringify([A.flow, A.error]);
  if ($('#main').dataset.lg === key && $('#main .lg-card')) return;
  $('#main').dataset.lg = key;
  const waiting = A.flow
    ? `<div class="lg-wait"><span class="lg-spin"></span><div><b>Waiting for you in the browser</b><span>Finish signing in there, and Wayzerr will open by itself.</span></div></div>
       <div class="lg-row"><button class="btn" id="lg-again" type="button">Open the browser again</button><button class="btn ghost" id="lg-cancel" type="button">Cancel</button></div>`
    : `<button id="lg-go" class="btn primary lg-btn" type="button">Continue in browser</button>`;
  $('#main').innerHTML = `
    <div class="setup"><div class="setup-card lg-card">
      <div class="lg-brand"><img class="lg-dark" src="../icon.png" alt="" width="26" height="26"><img class="lg-light" src="../icon-light.png" alt="" width="26" height="26"><span>Wayzerr</span></div>
      <h1>Sign in to Wayzerr</h1>
      <p class="lead">Sign in or create an account in your browser. You only need to do this once on this computer.</p>
      ${waiting}
      <div class="lg-err" role="alert">${esc(A.error || '')}</div>
      <p class="lg-fine">Your chats and saved passwords stay on this computer. Your account is only your email address. ${legalLinks()}</p>
    </div></div>`;
  const go = $('#lg-go');
  if (go) go.onclick = async () => { go.disabled = true; go.textContent = 'Opening your browser…'; try { await api.accountStart(); } catch (e) { go.disabled = false; go.textContent = 'Continue in browser'; $('.lg-err').textContent = e.message; } };
  const again = $('#lg-again');
  if (again) again.onclick = () => api.openExternal(A.flow.url).catch(() => {});
  const cancel = $('#lg-cancel');
  if (cancel) cancel.onclick = () => api.accountSigninCancel().catch(() => {});
}

function renderSetup() {
  const demo = ['a', 'bb', 'ccc', 'dddd', 'eeeee'].map((s, i) => `<span style="animation-delay:${i * 80}ms">${characterSvg(makeCharacter('demo' + s), { size: 44 })}</span>`).join('');
  const T = S.providerTypes;
  const firstCloud = Object.keys(T).find((k) => T[k].account) || 'openai';
  let mode = 'cloud';
  const picked = { cloud: firstCloud, api: 'openai' };
  $('#main').innerHTML = `
    <div class="setup"><div class="setup-card">
      <div class="setup-chars">${demo}</div>
      <h1>Welcome to Wayzerr</h1>
      <p class="lead">${S.account && S.account.signedIn ? 'You are signed in. ' : ''}Two quick things: choose a username, then connect the AI your bots will think with.</p>
      <label class="f">Choose a username <span>(what your bots call you)</span></label>
      <input id="su-name" placeholder="Your name" value="${esc(S.settings.userName || ((S.account && S.account.email) || '').split('@')[0])}" autocomplete="off" maxlength="40" />
      <div class="su-modes" role="radiogroup" aria-label="How your bots think">
        <button type="button" class="su-mode on" role="radio" aria-checked="true" data-mode="cloud">
          <span class="su-m-t">${icon('cloud')}<b>Cloud</b><i>Easiest</i></span>
          <span class="su-m-d">Sign in with your Claude, ChatGPT or Gemini plan, or connect your own server. No key to copy for plans.</span>
        </button>
        <button type="button" class="su-mode" role="radio" aria-checked="false" tabindex="-1" data-mode="api">
          <span class="su-m-t">${icon('key')}<b>API key</b></span>
          <span class="su-m-d">Paste a key from OpenAI, Anthropic, Google… You pay per use.</span>
        </button>
      </div>
      <div id="su-cloud"></div><div id="su-api" class="hidden"></div>
      <div class="su-actions">
        <button id="su-skip" class="btn ghost" type="button">Skip for now</button>
        <button id="su-go" class="btn primary">Connect</button>
      </div>
      <p class="su-note">${icon('lock')}<span>Your chats and saved passwords stay on this computer. Your messages go only to the AI you pick. Details are in Settings → General → Privacy.</span></p>
      <p class="su-note">${icon('info')}<span>Signing in with a plan uses that company’s own app on this computer. Check that your plan’s terms allow this; if you are unsure, use an API key.</span></p>
    </div></div>`;
  const label = () => {
    const go = $('#su-go');
    if (!go || go.disabled) return;
    go.textContent = mode === 'cloud' && T[picked.cloud]?.account ? `Sign in with ${T[picked.cloud]?.name || 'your account'}` : 'Connect';
  };
  const forms = {
    cloud: providerForm($('#su-cloud'), firstCloud, null, false, (t) => t.account || t === T.custom, (ty) => { picked.cloud = ty; label(); }),
    api: providerForm($('#su-api'), 'openai', null, false, (t) => !t.account, (ty) => { picked.api = ty; label(); }),
  };
  label();
  const setMode = (m) => {
    if ($('#su-go').disabled || mode === m) return; // not while signing in
    mode = m;
    $$('.su-mode').forEach((x) => { const on = x.dataset.mode === m; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); x.tabIndex = on ? 0 : -1; });
    $('#su-cloud').classList.toggle('hidden', m !== 'cloud');
    $('#su-api').classList.toggle('hidden', m !== 'api');
    label();
  };
  $$('.su-mode').forEach((b) => (b.onclick = () => { setMode(b.dataset.mode); if (b.dataset.mode === 'api') $('#pf-key', $('#su-api'))?.focus(); }));
  $('.su-modes').addEventListener('keydown', (e) => {
    if (!/^Arrow(Left|Right|Up|Down)$/.test(e.key)) return;
    e.preventDefault();
    setMode(mode === 'cloud' ? 'api' : 'cloud');
    $('.su-mode.on')?.focus();
  });
  $('#su-api').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'pf-key') $('#su-go').click(); });
  $('#su-cloud').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'pf-key') $('#su-go').click(); });
  $('#su-skip').onclick = async () => {
    if ($('#su-go').disabled) return;
    if (!$('#su-name').value.trim()) { $('#su-name').focus(); return toast('Choose a username first.', true); }
    try { S = await api.saveProfile({ userName: $('#su-name').value, setupSkipped: true }); } catch (e) { return toast(e.message, true); }
    updateMe();
    view = 'chat';
    render();
  };
  $('#su-go').onclick = async () => {
    const btn = $('#su-go');
    if (btn.disabled) return;
    if (!$('#su-name').value.trim()) { $('#su-name').focus(); return toast('Choose a username first.', true); }
    btn.disabled = true; $('#su-skip').disabled = true; btn.textContent = mode === 'cloud' && T[picked.cloud]?.account ? 'Waiting for sign-in…' : 'Connecting…';
    try {
      await api.saveProfile({ userName: $('#su-name').value });
      S = await forms[mode].save();
      updateMe();
      // Land in a real chat with a first bot, not on an empty list.
      if (!(S.personas || []).length) {
        try { S = await api.savePersona({ name: 'Buddy', tag: 'Helper', description: 'A friendly, clear helper for questions, ideas, writing and planning.', character: makeCharacter('buddy') }); } catch (_) { /* the empty list still works */ }
      }
      toast('Connected. Say hi!');
      view = 'chat';
      render();
    } catch (e) {
      if (e.message !== 'Cancelled') toast(e.message, true);
      btn.disabled = false; $('#su-skip').disabled = false; label();
    }
  };
}

// Reusable "pick provider + paste key" form.
function providerForm(root, type = 'openai', existing = null, locked = false, filter = null, onChange = null, primary = null) {
  const T = S.providerTypes;
  let showAll = !primary || !primary.includes(type), lastType = null;
  const draw = () => {
    const t = T[type];
    onChange?.(type);
    const keepKey = lastType === type ? $('#pf-key', root)?.value : '';
    lastType = type;
    root.classList.toggle('pf-compact', !!filter);
    const keys = Object.keys(T).filter((k) => !filter || filter(T[k]));
    const shown = showAll ? keys : keys.filter((k) => primary.includes(k));
    root.innerHTML = `
      ${existing || locked ? '' : `${filter ? '' : '<label class="f">AI provider</label>'}
      <div class="prov-grid">${shown.map((k) => [k, T[k]]).map(([k, v]) => `<button class="prov-tile${k === type ? ' on' : ''}" data-t="${k}">${logoFor(k, 'md')}<span class="pt-text"><span class="pt-nm">${esc(v.name.replace(/ \(.*\)/, ''))}</span><span class="pt-sub">${esc(v.sub)}</span></span>${k === type ? `<span class="pt-check">${icon('check')}</span>` : ''}</button>`).join('')}${shown.length < keys.length ? `<button type="button" class="prov-tile prov-more" data-more="1"><span class="pt-text"><span class="pt-nm">More…</span></span></button>` : ''}</div>`}
      ${t.account ? `<div class="acct-note">${logoFor(type, 'md')}<div><strong>Connect with your ${esc(t.name)} account</strong><br><span>Your browser opens so you can sign in — no API key needed. Uses your ${esc(t.name)} plan.</span></div></div><div id="pf-acct"></div>` : ''}
      ${t.account ? '' : t.needsKey || type === 'custom' ? `<label class="f">API key ${t.needsKey ? '' : '<span>(if needed)</span>'}</label>
      <input id="pf-key" type="password" autocomplete="off" placeholder="${existing?.hasKey ? 'Saved: ' + esc(existing.keyPreview) + ' — paste to replace' : 'Paste your ' + esc(t.name.replace(/ \(.*\)/, '')) + ' API key'}" />` : ''}
      ${t.account ? '' : t.keyUrl ? `<div class="hint">Get a key: <a href="${t.keyUrl}" target="_blank">${esc(t.keyUrl.replace(/^https:\/\//, ''))}</a>. Keys are stored encrypted on this computer.</div>` : ''}
      ${t.account ? '' : `<details ${type === 'custom' ? 'open' : ''}><summary>API address</summary>
        <input id="pf-base" style="margin-top:8px" value="${esc(existing?.baseUrl || t.baseUrl)}" placeholder="https://…/v1" />
      </details>`}`;
    $$('.prov-tile', root).forEach((b) => (b.onclick = () => { if (b.dataset.more) { showAll = true; draw(); return; } type = b.dataset.t; draw(); }));
    if (keepKey) { const kf = $('#pf-key', root); if (kf) kf.value = keepKey; }
  };
  draw();
  return {
    value: () => ({ id: existing?.id, type, apiKey: $('#pf-key', root)?.value.trim() || '', baseUrl: $('#pf-base', root)?.value.trim() || '' }),
    save: () => (T[type].account ? connectAccount(type, $('#pf-acct', root)) : api.saveProvider({ id: existing?.id, type, apiKey: $('#pf-key', root)?.value.trim() || '', baseUrl: $('#pf-base', root)?.value.trim() || '' })),
  };
}

// "Connect" with your Claude / ChatGPT account: installs the helper once, opens sign-in, waits.
let acctBox = null;
// While a sign-in is running, a small bar with Cancel stays on screen, wherever you are in the app (even if you closed the window it started from).
function signinBar(on, type) {
  let bar = $('#signin-bar');
  if (!on) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'signin-bar'; bar.className = 'signin-bar'; bar.setAttribute('role', 'status'); document.body.appendChild(bar); }
  bar.innerHTML = `<span class="acct-spin"></span><span class="sb-t" id="sb-t">Signing in to ${esc(S.providerTypes[type]?.name || 'your account')}…</span><button class="btn sm" id="sb-cancel" type="button">Cancel</button>`;
  $('#sb-cancel').onclick = () => { $('#sb-t').textContent = 'Cancelling…'; api.accountCancel().catch(() => {}); };
}
async function connectAccount(type, box) {
  const t = S.providerTypes[type];
  acctBox = box;
  signinBar(true, type);
  if (box) {
    box.innerHTML = `<div class="acct-flow">
      <div class="acct-step"><span class="acct-spin"></span><span id="acct-text">Getting ready…</span></div>
      <div class="acct-extra hidden" id="acct-extra">
        <a href="#" id="acct-open" class="hidden" target="_blank">Didn't open? Open the sign-in page ↗</a>
        <div class="acct-code hidden" id="acct-code"><input placeholder="Paste the code from the sign-in page" autocomplete="off"><button class="btn sm primary">Send</button></div>
        <a href="#" id="acct-term">Sign in using Terminal instead</a>
        <a href="#" id="acct-cancel">Cancel</a>
      </div></div>`;
    $('#acct-term', box).onclick = (e) => { e.preventDefault(); api.accountTerminal(type); $('#acct-text', box).textContent = 'Finish signing in using the Terminal window — Wayzerr connects by itself.'; };
    $('#acct-cancel', box).onclick = (e) => { e.preventDefault(); api.accountCancel(); };
    $('#acct-code button', box).onclick = () => { const i = $('#acct-code input', box); if (i.value.trim()) { api.accountCode(i.value.trim()); i.value = ''; $('#acct-text', box).textContent = 'Checking the code…'; } };
  }
  try {
    const st = await api.accountConnect(type);
    S = st;
    toast(`${t.name} connected`);
    return st;
  } catch (e) {
    if (box) box.innerHTML = e.message === 'Cancelled' ? '' : `<div class="acct-err">${esc(e.message)}</div>`;
    throw e;
  } finally {
    acctBox = null;
    signinBar(false);
  }
}
api.onAccountProgress((p) => {
  if (p.text) { const sb = $('#sb-t'); if (sb && !/Cancelling/.test(sb.textContent)) sb.textContent = p.text; }
  const box = acctBox;
  if (!box) return;
  if (p.text) { const el = $('#acct-text', box); if (el) el.textContent = p.text; }
  if (p.waiting || p.url || p.needsCode) $('#acct-extra', box)?.classList.remove('hidden');
  if (p.url) { const a = $('#acct-open', box); if (a) { a.href = p.url; a.classList.remove('hidden'); } }
  if (p.needsCode) $('#acct-code', box)?.classList.remove('hidden');
  if (p.done) box.querySelector('.acct-flow')?.classList.add('done');
  if (p.command) { const c = $('#si-cmd-text', box); if (c) { c.textContent = p.command; $('#si-term', box)?.classList.remove('hidden'); } }
  if (p.failed) $('#si-term', box)?.classList.remove('hidden');
});

// ---------- credits used (counted by Wayzerr on this computer) ----------
// Cloud plans don't share their limits, so this shows what you've used through Wayzerr: messages,
// tokens (a "~" means guessed from text length) and, when the app reports it, the price at API rates.
const fmtN = (n) => {
  n = Math.max(0, Math.round(+n || 0));
  if (n < 1000) return String(n);
  const units = ['k', 'M', 'B'];
  let i = 0, v = n / 1000;
  while (v >= 999.5 && i < units.length - 1) { v /= 1000; i++; } // 999,999 reads "1M", not "1000k"
  return (v < 10 ? v.toFixed(1) : v.toFixed(0)).replace(/\.0$/, '') + units[i];
};
// What the AI is holding for this chat right now (like Claude's context meter): the size of the last reply's input and output,
// or, right after Compact, the size of the short note plus the last messages.
function chatContext(p) {
  const list = S.chats[p.id] || [];
  for (let i = list.length - 1; i >= 0; i--) {
    const m = list[i];
    if (m.role === 'activity' && Number.isFinite(m.ctx)) return { n: m.ctx, est: true };
    if (m.role === 'assistant' && m.use && ((m.use.in || 0) + (m.use.ca || 0) + (m.use.out || 0)) > 0) return { n: (m.use.in || 0) + (m.use.ca || 0) + (m.use.out || 0), est: !!m.use.est };
  }
  return null;
}
// A blue dot says: this chat has got big, compacting would save tokens.
const compactAdvised = (p) => { const c = chatContext(p); return !!c && !c.est && c.n >= 200000; };
// Today's tokens for the AI(s) this chat uses (the count starts again at midnight).
function tokensToday(p) {
  const sel = p.group ? null : currentSel(p);
  const provs = p.group ? S.providers : sel ? S.providers.filter((x) => x.id === sel.providerId) : [];
  const t = provs.map((x) => useOf(S.usageToday, x.id));
  return { tokens: t.reduce((n, u) => n + u.tokens, 0), cached: t.reduce((n, u) => n + u.cached, 0), n: t.reduce((n, u) => n + u.n, 0), name: p.group ? 'all your AIs' : provs[0]?.name || 'this AI', prov: provs[0] };
}
// The two buttons under the line in the bot menu: tokens and Compact.
function tokButtons(p) {
  const c = S.settings.showTokens === true ? chatContext(p) : null;
  const t = tokensToday(p);
  const left = new Date(); left.setHours(24, 0, 0, 0);
  const h = Math.max(1, Math.round((left - Date.now()) / 3600000));
  const tip = `Chat size: what the AI holds for this chat right now${c ? ` (about ${c.n.toLocaleString('en-US')} tokens)` : ''}. It includes the AI’s own built-in instructions, and it drops when you compact. Today: ${t.name} used ${t.tokens.toLocaleString('en-US')} tokens${t.cached ? ` (plus ${fmtN(t.cached)} re-read from cache)` : ''}, counted by Wayzerr. The daily count starts again at midnight (in about ${h} h); your plan’s own limit resets on its own schedule.`;
  return `<hr class="acts-sep">${S.settings.showTokens === true ? `<button class="btn sm acts-wide" data-a="tok" title="${esc(tip)}">${icon('cloud')}<span>${c ? `Chat size ${c.est ? '~' : ''}${fmtN(c.n)}` : 'Chat size –'} · today ${fmtN(t.tokens)}</span></button>` : ''}<button class="btn sm acts-wide" data-a="compact" title="${compactAdvised(p) ? 'Recommended: this chat has got big. ' : ''}Fold the old messages into a short note, so each message uses far fewer tokens. Your messages stay on screen.">${icon('compact')}Compact chat${compactAdvised(p) ? '<i class="advise-dot" aria-label="Recommended"></i>' : ''}</button>`;
}
// Fold a chat's old messages into a short note, so every following message re-reads far less.
async function compactNow(p) {
  const smart = S.settings.smartCompact !== false && !p.group;
  if (smart) toast('Compacting… the AI is writing a short note');
  try {
    const r = await api.compactChat(p.id, smart);
    S = r.state; render();
    const msg = r.folded ? `Compacted: ${r.folded} earlier ${r.folded === 1 ? 'message' : 'messages'} folded into ${r.smart ? 'an AI-written note' : 'a short note'} (about ${fmtN(r.before)} → ${fmtN(r.after)} tokens to re-read${r.used ? `; the note cost about ${fmtN(r.used)} tokens` : ''})` : 'Nothing to compact yet — this chat is already short';
    toast(msg); announce?.(msg);
  } catch (e) { toast(e.message, true); }
}
const useOf = (map, id) => {
  const r = (map && map[id]) || {};
  return { n: Math.max(0, +r.requests || 0), cached: Math.max(0, +r.cached || 0), tokens: Math.max(0, (+r.input || 0) + (+r.output || 0)), cost: Math.max(0, +r.cost || 0), est: (+r.estimated || 0) > 0 };
};
const OFFICIAL_USAGE = {
  'claude-account': 'https://claude.ai/settings/usage',
  'cursor-account': 'https://cursor.com/dashboard',
  'copilot-account': 'https://github.com/settings/copilot',
  'openrouter-account': 'https://openrouter.ai/credits',
  openrouter: 'https://openrouter.ai/credits',
};
function usageBlock(p, unit = 'messages') {
  const day = useOf(S.usageToday, p.id), mon = useOf(S.usage, p.id), all = useOf(S.usageTotal, p.id);
  const week = ((S.usageWeek || {})[p.id] || []).concat([0, 0, 0, 0, 0, 0, 0]).slice(0, 7);
  const top = Math.max(1, ...week);
  const dayName = (i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return i === 6 ? 'Today' : d.toLocaleDateString([], { weekday: 'short' }); };
  const one = unit.replace(/s$/, '');
  const row = (l, u) => `<tr><th scope="row">${l}</th><td>${fmtN(u.n)}</td><td class="t">${u.tokens ? (u.est ? '~' : '') + fmtN(u.tokens) : '–'}</td></tr>`;
  const link = OFFICIAL_USAGE[p.type];
  const used = all.n || mon.n || day.n;
  return `<div class="usage">
    <div class="us-head"><span class="us-title">Credits used</span>
      <span class="us-bars" role="img" aria-label="${unit} per day, last 7 days: ${week.join(', ')}">${week.map((v, i) => `<i class="${v ? '' : 'z'}" style="height:${v ? Math.max(14, Math.round((v / top) * 100)) : 14}%" title="${dayName(i)}: ${v} ${v === 1 ? one : unit}"></i>`).join('')}</span></div>
    ${used ? `<table class="us-table"><thead><tr><th></th><td>${unit}</td><td class="t">tokens</td></tr></thead><tbody>${row('Today', day)}${row('This month', mon)}${row('All time', all.n >= mon.n ? all : mon)}</tbody></table>
      ${mon.cost ? `<div class="us-foot">≈ $${mon.cost.toFixed(2)} this month at API prices</div>` : ''}`
      : `<div class="us-empty">Nothing used yet. Your count starts with your first message.</div>`}
    ${p.type.startsWith('openrouter') ? `<div class="us-credit" data-credit="${p.id}">Checking your credit…</div>` : ''}
    <div class="us-foot">Counted by Wayzerr on this computer.${link ? ` Official numbers: <a href="${link}" target="_blank" rel="noopener">${esc(link.replace(/^https:\/\//, '').split('/')[0])} ↗</a>` : ''}</div>
  </div>`;
}
// One quiet line for the model menu: what this provider has used this month.
function useLine(p) {
  const m = useOf(S.usage, p.id), unit = p.account ? 'message' : 'request';
  return `<div class="mp-use" title="Counted by Wayzerr on this computer">${icon(p.account ? 'cloud' : 'key')}<span>${m.n ? `${fmtN(m.n)} ${unit}${m.n === 1 ? '' : 's'} this month${m.tokens ? ` · ${m.est ? '~' : ''}${fmtN(m.tokens)} tokens` : ''}` : 'Nothing used yet this month'}</span></div>`;
}
// OpenRouter is the one provider that tells us your real credit balance.
const creditCache = {};
function hydrateCredits() {
  $$('[data-credit]').forEach((el) => {
    const id = el.dataset.credit;
    if (!id) return;
    const show = (c) => {
      const e = document.querySelector(`[data-credit="${id}"]`);
      if (!e) return;
      if (!c || !isFinite(c.left)) { e.remove(); return; }
      e.innerHTML = `Credit left: <b>$${Math.max(0, c.left).toFixed(2)}</b> <span>of $${(+c.total || 0).toFixed(2)}</span>`;
    };
    const hit = creditCache[id];
    if (hit && Date.now() - hit.at < 60000) return show(hit.value);
    api.providerCredits(id).then((c) => { creditCache[id] = { at: Date.now(), value: c }; show(c); }).catch(() => show(null));
  });
}

// ---------- new chat ("To:") ----------
function renderNew() {
  $('#main').innerHTML = `
    <div class="to-bar view-fade"><span class="lbl">To:</span><input id="to-q" placeholder="Search or create Bots" autocomplete="off" /><button class="icon-btn" id="to-close" title="Close">${icon('x')}</button></div>
    <div id="to-list-wrap"></div>
    <div style="flex:1"></div>
    <div class="composer"><div class="composer-inner"><button class="c-btn c-plus" disabled aria-label="Add photos and files">${icon('plus')}</button><textarea rows="1" placeholder="Message Bot" disabled></textarea></div></div>`;
  let sel = 0;
  const draw = () => {
    const q = $('#to-q').value.trim().toLowerCase();
    const items = [{ kind: 'create' }, { kind: 'group' }, ...bots().filter((p) => !q || (p.name + ' ' + tagOf(p) + ' ' + descOf(p)).toLowerCase().includes(q)).map((p) => ({ kind: 'bot', p }))];
    sel = Math.min(sel, items.length - 1);
    $('#to-list-wrap').innerHTML = `<div class="to-list">${items.map((it, i) => it.kind === 'create'
      ? `<button class="opt${i === sel ? ' sel' : ''}" data-i="${i}"><span class="ic">${icon('plus')}</span>${q ? `Create “${esc($('#to-q').value.trim())}”` : 'Create new Bot'}</button>`
      : it.kind === 'group' ? `<button class="opt${i === sel ? ' sel' : ''}" data-i="${i}"><span class="ic">${icon('group')}</span>New group chat<span class="right">Several bots in one chat</span></button>`
      : `<button class="opt${i === sel ? ' sel' : ''}" data-i="${i}">${charEl(it.p, 28)}${esc(it.p.name)}<span class="right">${(S.chats[it.p.id] || []).length ? 'Open chat' : 'New chat'}</span></button>`).join('')}</div>`;
    const choose = (i) => {
      const it = items[i];
      if (it.kind === 'create') openBotEditor(null, $('#to-q').value.trim());
      else if (it.kind === 'group') openGroupEditor(null);
      else openChat(it.p.id);
    };
    $$('.opt').forEach((b) => { b.onclick = () => choose(+b.dataset.i); b.onmouseenter = () => { sel = +b.dataset.i; $$('.opt').forEach((o) => o.classList.toggle('sel', o === b)); }; });
    $('#to-q').onkeydown = (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, items.length - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter') choose(sel);
      else if (e.key === 'Escape') closeNew();
    };
  };
  $('#to-q').oninput = () => { sel = 0; draw(); };
  $('#to-close').onclick = closeNew;
  draw();
  $('#to-q').focus();
}
function closeNew() {
  view = 'chat';
  if (!active() && !bots().length) return render();
  render();
}

// ---------- chat ----------
function renderChat(p) {
  selectScreen(p.id);
  markSeen(p.id);
  const msgs = S.chats[p.id] || [];
  if (!mounted || mounted.id !== p.id || !$('#messages') || msgs.length < mounted.count) mountChat(p);
  else appendMessages(p);
  updateLive(p);
  updateHead(p);
}

// Ideas for a new chat: one tap sends a question, the others start a sentence for you to finish.
function starterList(p) {
  if (p.group) return [['Say hi to everyone', 'Hi everyone! What can each of you help me with?', true]];
  return [
    ['What can you do?', 'What can you help me with?', true],
    ['Explain something simply', 'Explain this in simple words: ', false],
    ['Summarize some text', 'Summarize this for me: ', false],
    ['Help me plan', 'Help me plan ', false],
  ];
}
const starterHtml = (p) => `<div class="starters" role="group" aria-label="Ideas to start with">${starterList(p).map(([l], i) => `<button type="button" class="starter" data-i="${i}">${esc(l)}</button>`).join('')}</div>`;

function mountChat(p) {
  const draft = mounted && mounted.id === p.id ? $('#composer-input')?.value || '' : getDraft(p.id);
  $('#main').innerHTML = `
    <div class="chat-head"><div class="head-fade"></div>
      <button class="bot-pill" id="bot-pill"></button>
      <div class="head-right">${guideBtnHtml()}${p.group ? '' : `<button class="icon-btn ${screenOpen ? 'on' : ''}" id="btn-screen" title="Show screen">${icon('monitor')}</button>`}</div>
    </div>
    <div class="messages" id="messages" role="region" aria-label="Conversation" tabindex="0"><div class="msg-col" id="msg-col"></div></div>
    <div class="composer" id="composer"><div class="composer-inner">
      <div class="tray hidden" id="tray"></div>
      <div class="c-row">
        <button class="c-btn c-plus" id="btn-plus" title="Add photos, files and more">${icon('plus')}</button>
        <textarea id="composer-input" rows="1" placeholder="${p.group ? `Message ${esc(p.name)} — @name to ask one bot` : `Message ${esc(p.name)}`}"></textarea>
        <button class="model-chip" id="model-chip" title="Switch model"></button>
        <button class="c-btn c-mic" id="mic" title="Talk instead of typing" aria-label="Speech to text">${icon('mic')}</button>
        ${TALK_MODE ? `<button class="c-btn c-talk" id="talk-btn" title="Talk mode — have a spoken conversation" aria-label="Talk mode">${icon('wave')}</button>` : ''}
        <button class="c-btn c-send" id="send" title="Send">${icon('up')}</button>
      </div>
    </div><div class="drop-hint">Drop files to attach</div></div>
    <input type="file" id="file-input" multiple class="hidden" />`;
  mounted = { id: p.id, count: 0 };
  const msgs = S.chats[p.id] || [];
  if (!msgs.length) {
    $('#msg-col').innerHTML = `<div class="chat-empty">${`<span class="char-shadow char-pop">${charEl(p, 96)}</span>`}<h2>${esc(p.name)}</h2><p>${esc(descOf(p) || tagOf(p) || 'Say hi! I’ll figure out the rest.')}</p>${starterHtml(p)}</div>`;
    $('#messages').style.display = 'flex';
    $('#msg-col').style.cssText = 'flex:1;display:flex;';
  } else {
    appendMessages(p, false);
  }
  const input = $('#composer-input');
  input.value = draft;
  autosize(input);
  input.focus();
  $$('.starter').forEach((b) => (b.onclick = () => {
    const [, text, sendNow] = starterList(p)[+b.dataset.i];
    if (sendNow) return send(p, { text });
    input.value = text; autosize(input); syncSend(p); input.focus(); input.setSelectionRange(text.length, text.length);
  }));
  input.oninput = () => { autosize(input); syncSend(p); saveDraftSoon(p.id, input.value); };
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(p); }
    else if (e.key === 'ArrowUp' && !input.value && !e.isComposing) { // bring back your last message to fix it or send it again
      const last = [...(S.chats[p.id] || [])].reverse().find((m) => m.role === 'user' && !m.from && m.content);
      if (last) { e.preventDefault(); input.value = last.content; autosize(input); syncSend(p); input.setSelectionRange(input.value.length, input.value.length); }
    }
  };
  input.onpaste = (e) => {
    const files = [...(e.clipboardData?.files || [])];
    if (files.length) { e.preventDefault(); addFiles(p, files); }
  };
  const comp = $('#composer');
  comp.ondragover = (e) => { e.preventDefault(); comp.classList.add('dragging'); };
  comp.ondragleave = (e) => { if (!comp.contains(e.relatedTarget)) comp.classList.remove('dragging'); };
  comp.ondrop = (e) => { e.preventDefault(); comp.classList.remove('dragging'); addFiles(p, [...e.dataTransfer.files]); };
  $('#file-input').onchange = (e) => { addFiles(p, [...e.target.files]); e.target.value = ''; };
  $('#send').onclick = () => (busy.has(p.id) ? api.stopTurn(p.id) : send(p));
  $('#bot-pill').onclick = (e) => openProfile(p, e.currentTarget);
  if ($('#btn-screen')) $('#btn-screen').onclick = () => setScreen(!screenOpen);
  $('#btn-plus').onclick = (e) => openMenu(e.currentTarget, [
    ['image', 'Add photos & files', () => $('#file-input').click()],
    ...(p.group ? [] : [['camera', 'Screenshot of the Screen', () => attachScreenshot(p)]]),
    '-',
    ...(p.group ? [] : [['monitor', screenOpen ? 'Hide screen' : 'Show screen', () => setScreen(!screenOpen)]]),
    ['connectors', 'Connectors', () => go('settings', 'connectors')],
    ['edit', `Edit ${p.name}`, () => openBotEditor(p)],
    ...(!p.group && Object.keys(p.cliSessions || {}).some((k) => !k.includes('@') && !k.includes('#')) ? [['external', 'Open cloud chat', async () => { try { await api.openCloudChat(p.id); toast('Opened in Terminal — this is the same chat, in the AI’s own app'); } catch (e) { toast(e.message, true); } }]] : []),
  ], 'up');
  $('#model-chip').onclick = (e) => openModelPicker(p, e.currentTarget);
  $('#mic').onclick = () => toggleVoice(p);
  if ($('#talk-btn')) $('#talk-btn').onclick = () => startTalk(p);
  updateModelChip(p);
  if (p.group) $('#model-chip')?.classList.add('hidden');
  drawTray(p);
  syncSend(p);
  const box = $('#messages');
  box.style.scrollBehavior = 'auto';
  box.scrollTop = box.scrollHeight;
  box.style.scrollBehavior = '';
}

// ----- speech to text: click the mic, talk, click again — your words land in the message box -----
let voice = null; // { rec, start, timer, cancel, p }
const MIC_DENIED = 'Wayzerr isn’t allowed to use the microphone. Turn it on in your computer’s privacy settings (Microphone), then try again.';
async function toggleVoice(p) {
  if (voice) return stopVoice(false);
  const mic = $('#mic');
  try {
    const engines = await api.voiceAvailable();
    if (!engines.length) return toast('The voice engine is missing. Reinstall Wayzerr to use your voice.', true);
    if (engines[0] === 'On this computer') api.voiceWarm(); // loads the on-device engine while you talk
    if (!(await api.voiceMic())) return toast(MIC_DENIED, true);
    const v = voice = { start: Date.now(), p, rec: null, timer: null };
    v.rec = await WzTalk.record({ deviceId: loadPref('micDevice', ''), onLevel: (l) => { const d = $('#mic .rec-dot'); if (d) d.style.transform = `scale(${(1 + l * 1.6).toFixed(2)})`; } });
    if (voice !== v) return v.rec.stop(true);
    mic.classList.add('rec'); mic.title = 'Stop and turn into text';
    mic.innerHTML = `<span class="rec-dot"></span><span class="rec-time" id="rec-time">0:00</span>`;
    v.timer = setInterval(() => {
      const s = Math.floor((Date.now() - v.start) / 1000), t = $('#rec-time');
      if (t) t.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (s >= 300) stopVoice(false); // 5 minutes at most
    }, 250);
  } catch (e) {
    voice = null; resetMic();
    toast(/denied|not allowed|permission/i.test(e.message) ? MIC_DENIED : /not found|no device|requested device/i.test(e.message) ? 'No microphone found. Plug one in or pick another in Settings → Voice.' : e.message, true);
  }
}
function stopVoice(cancel) {
  const v = voice; if (!v) return;
  voice = null; clearInterval(v.timer);
  if (!v.rec) return resetMic();
  finishVoice(v, cancel);
}
function resetMic() { const m = $('#mic'); if (m) { m.classList.remove('rec', 'busy'); m.disabled = false; m.title = 'Talk instead of typing'; m.innerHTML = icon('mic'); } }
async function finishVoice(v, cancel) {
  const got = await v.rec.stop(cancel);
  if (cancel || !got) return resetMic();
  const mic = $('#mic');
  if (mic) { mic.classList.remove('rec'); mic.classList.add('busy'); mic.disabled = true; mic.innerHTML = '<span class="acct-spin"></span>'; }
  try {
    const { text } = await api.voiceTranscribe({ data: WzTalk.b64(got.wav), mime: 'audio/wav' });
    if (!text) toast("I didn't catch any words. Try again a little closer to the mic.", true);
    else {
      const input = $('#composer-input');
      if (input && mounted?.id === v.p.id) { input.value = (input.value.trim() ? input.value.replace(/\s*$/, ' ') : '') + text; autosize(input); syncSend(v.p); input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
    }
  } catch (e) { toast(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); }
  resetMic();
}
document.addEventListener('keydown', (e) => { if (voice && e.key === 'Escape') { e.preventDefault(); stopVoice(true); } });

// ----- talk mode: a spoken conversation. It listens, sends what you say, reads the answer aloud, then listens again -----
const TALK_MODE = false; // Talk mode is built but switched off for now
let talk = null;
async function startTalk(p) {
  if (talk) return;
  if (!window.WzTalk?.supported()) return toast('Talk mode needs a microphone, and this computer doesn’t seem to have one.', true);
  if (busy.has(p.id)) return toast(`${p.name} is still answering. Try again in a moment.`, true);
  if (voice) stopVoice(true);
  try {
    const engines = await api.voiceAvailable();
    if (!engines.length) return toast('The voice engine is missing. Reinstall Wayzerr to use your voice.', true);
    if (engines[0] === 'On this computer') api.voiceWarm();
    if (!(await api.voiceMic())) return toast('Wayzerr isn’t allowed to use the microphone. Turn it on in System Settings → Privacy & Security → Microphone.', true);
  } catch (e) { return toast(e.message, true); }
  if (talk) return;
  WzTalk.prime();
  const t = talk = { p, state: 'starting', speaker: loadPref('talkSpeaker', true) !== false, voiceName: loadPref('talkVoice', ''), mic: null, muted: false, speech: null, working: false, key: null };
  const el = document.createElement('div');
  el.className = 'overlay talk-ov'; el.id = 'talk';
  el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-label', `Talk with ${p.name}`);
  el.innerHTML = `<div class="talk-card">
    <button class="talk-x" data-act="end" title="End talk mode (Esc)" aria-label="End talk mode">${icon('x')}</button>
    <div class="talk-stage" id="talk-stage" data-s="starting" style="--tc:${esc((!p.group && charOf(p).color) || '#6aa3ff')}"><span class="talk-ring"></span><span class="talk-ring r2"></span><span class="talk-bot" id="talk-bot"></span></div>
    <div class="talk-status" id="talk-status" aria-live="polite"></div>
    <div class="talk-sub" id="talk-sub"></div>
    <div class="talk-line you" id="talk-you"></div>
    <div class="talk-line bot" id="talk-reply"></div>
    <div class="talk-controls">
      <button class="talk-ctl" data-act="mute" id="talk-mute" title="Turn the microphone off">${icon('mic')}</button>
      <button class="talk-main" data-act="main" id="talk-main" disabled>Listening</button>
      <button class="talk-ctl" data-act="speaker" id="talk-spk" title="Read answers aloud"></button>
    </div>
    <div class="talk-foot"><select id="talk-voice" class="hidden" aria-label="Voice"></select><span id="talk-hint">Just talk. ${esc(p.name)} answers when you pause. Space sends now, Esc ends.</span></div>
  </div>`;
  $('#layer').appendChild(el); overlay(+1); t.el = el;
  api.talkActive(true).catch(() => {});
  const stage = $('#talk-stage', el);
  const q = (id) => $('#' + id, el);
  const setSpk = () => { q('talk-spk').innerHTML = icon(t.speaker ? 'speaker' : 'speakerOff'); q('talk-spk').classList.toggle('off', !t.speaker); q('talk-spk').title = t.speaker ? 'Answers are read aloud (click to turn off)' : 'Answers are only shown (click to read aloud)'; };
  setSpk();
  const label = { starting: 'Getting the mic ready…', listening: 'Listening…', hearing: 'Hearing you…', transcribing: 'Writing that down…', thinking: `${p.name} is thinking…`, speaking: `${p.name} is talking…`, muted: 'Microphone is off' };
  const mainFor = { hearing: ['Send now', true], speaking: ['Skip', true], thinking: ['Stop', true], transcribing: ['Please wait', false] };
  t.set = (st, sub) => {
    t.state = st; stage.dataset.s = st;
    q('talk-status').textContent = label[st] || '';
    q('talk-sub').textContent = sub || '';
    const m = mainFor[st] || [st === 'muted' ? 'Mic is off' : st === 'starting' ? 'Starting' : 'Listening', false];
    q('talk-main').textContent = m[0]; q('talk-main').disabled = !m[1];
    q('talk-bot').innerHTML = charEl(p, 124, st === 'thinking' || st === 'transcribing' ? 'thinking' : 'none');
    if (st !== 'listening' && st !== 'hearing') stage.style.setProperty('--lvl', '0');
  };
  t.back = (sub, delay) => { // go back to listening (unless the mic is switched off)
    if (talk !== t) return;
    t.working = false;
    if (t.muted) { t.mic.pause(); return t.set('muted', sub); }
    t.mic.resume(delay); t.set('listening', sub);
  };
  t.set('starting');
  el.onclick = (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const act = b.dataset.act;
    if (act === 'end') endTalk();
    else if (act === 'main') talkMain(t);
    else if (act === 'speaker') { t.speaker = !t.speaker; savePref('talkSpeaker', t.speaker); setSpk(); if (!t.speaker) WzTalk.stopSpeaking(); }
    else if (act === 'mute') {
      if (!t.mic) return;
      t.muted = !t.muted; b.innerHTML = icon(t.muted ? 'micOff' : 'mic'); b.classList.toggle('off', t.muted); b.title = t.muted ? 'Turn the microphone on' : 'Turn the microphone off';
      if (t.muted && !t.working) { t.mic.pause(); t.set('muted'); } else if (!t.muted && !t.working) t.back('', 0);
    }
  };
  t.key = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); endTalk(); }
    else if (e.key === ' ' && !/^(SELECT|BUTTON)$/.test(document.activeElement?.tagName || '')) { e.preventDefault(); talkMain(t); }
  };
  document.addEventListener('keydown', t.key, true);
  WzTalk.ready().then((all) => { // a voice picker, only the voices in your language
    if (talk !== t || !all.length) return;
    const lang = (navigator.language || 'en').slice(0, 2).toLowerCase();
    const mine = all.filter((v) => String(v.lang || '').toLowerCase().startsWith(lang)).sort((a, b) => a.name.localeCompare(b.name));
    if (mine.length < 2) return;
    const sel = q('talk-voice');
    sel.innerHTML = `<option value="">Automatic voice</option>` + mine.map((v) => `<option value="${esc(v.name)}"${v.name === t.voiceName ? ' selected' : ''}>${esc(v.name)}</option>`).join('');
    sel.classList.remove('hidden'); q('talk-hint').classList.add('hidden');
    sel.onchange = () => { t.voiceName = sel.value; savePref('talkVoice', t.voiceName); };
  });
  try {
    t.mic = await WzTalk.listen({
      onLevel: (l) => { if (talk === t && (t.state === 'listening' || t.state === 'hearing')) stage.style.setProperty('--lvl', l.toFixed(2)); },
      onStart: () => { if (talk === t && t.state === 'listening') t.set('hearing'); },
      onPhrase: (ph) => talkPhrase(t, ph),
      onError: (e) => toast(e.message || String(e), true),
    });
  } catch (e) {
    endTalk();
    return toast(/denied|not allowed|permission/i.test(e.message) ? 'Wayzerr isn’t allowed to use the microphone. Turn it on in System Settings → Privacy & Security → Microphone.' : `Couldn’t open the microphone: ${e.message}`, true);
  }
  if (talk !== t) return t.mic.close();
  t.back('Say something whenever you like.', 0);
}
function talkMain(t) {
  if (talk !== t) return;
  if (t.state === 'hearing') t.mic.flush();
  else if (t.state === 'speaking') WzTalk.stopSpeaking();
  else if (t.state === 'thinking') api.stopTurn(t.p.id);
}
async function talkPhrase(t, ph) {
  if (talk !== t || t.working) return;
  t.working = true; t.mic.pause(); t.set('transcribing');
  const q = (id) => $('#' + id, t.el);
  let text = '';
  try {
    const r = await api.voiceTranscribe({ data: WzTalk.b64(ph.wav), mime: 'audio/wav' });
    text = String(r.text || '').trim();
  } catch (e) { return t.back(String(e.message || e).replace(/^Error invoking remote method '[^']+': (Error: )?/, '').slice(0, 140), 300); }
  if (talk !== t) return;
  if (WzTalk.junk(text, ph.ms)) return t.back('I didn’t catch that. Go ahead.', 200);
  q('talk-you').textContent = text; q('talk-reply').textContent = '';
  // send it like a typed message and wait for the whole answer
  const p = t.p;
  t.set('thinking');
  chatError = null;
  await send(p, { text });
  if (talk !== t) return;
  const all = S.chats[p.id] || [];
  let from = all.length - 1;
  while (from >= 0 && !(all[from].role === 'user' && !all[from].from)) from--; // everything after your last message is the answer
  const fresh = all.slice(from + 1).filter((m) => m.role === 'assistant' && m.content && !m.image).map((m) => m.content);
  if (!fresh.length) return t.back(chatError ? String(chatError).slice(0, 140) : 'No answer this time.', 300);
  const reply = fresh.join('\n\n');
  q('talk-reply').textContent = WzTalk.clean(reply).slice(0, 260) + (WzTalk.clean(reply).length > 260 ? '…' : '');
  if (!t.speaker) return t.back('', 200);
  t.set('speaking');
  t.speech = WzTalk.speak(reply, { voice: t.voiceName, volume: loadPref('talkVolume', 1) });
  const how = await t.speech.done;
  if (talk !== t) return;
  if (how === 'unavailable') { t.speaker = false; q('talk-spk').innerHTML = icon('speakerOff'); q('talk-spk').classList.add('off'); return t.back('This computer has no voice to read with, so answers are only shown.', 200); }
  t.back('', 500);
}
function endTalk() {
  const t = talk; if (!t) return;
  talk = null;
  document.removeEventListener('keydown', t.key, true);
  try { WzTalk.stopSpeaking(); } catch (_) {}
  try { t.mic?.close(); } catch (_) {}
  api.talkActive(false).catch(() => {});
  t.el.classList.add('closing'); overlay(-1);
  setTimeout(() => t.el.remove(), 180);
}

// ----- attachments -----
const pending = {}; // personaId -> [{ type: 'image'|'file', name, dataUrl?, text? }]
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|xml|html?|css|js|ts|jsx|tsx|py|rb|go|rs|java|c|cpp|h|swift|kt|sql|yaml|yml|toml|ini|log|srt|vtt|rtf)$/i;

async function addFiles(p, files) {
  const list = (pending[p.id] ||= []);
  for (const f of files) {
    if (list.length >= 12) { toast('Up to 12 attachments per message.', true); break; }
    try {
      if (f.type.startsWith('image/')) list.push({ type: 'image', name: f.name || 'image.png', dataUrl: await shrinkImage(f) });
      else if (f.type.startsWith('text/') || TEXT_EXT.test(f.name) || f.type === 'application/json') {
        if (f.size > 400_000) { toast(`${f.name} is too big (max 400 KB of text).`, true); continue; }
        list.push({ type: 'file', name: f.name, text: (await f.text()).slice(0, 60000) });
      } else if (/pdf/.test(f.type) || /\.pdf$/i.test(f.name)) {
        if (f.size > 60 * 1024 * 1024) { toast(`${f.name} is too big (max 60 MB).`, true); continue; }
        toast(`Reading ${f.name}…`);
        const r = await readPdf(f);
        list.push({ type: 'file', name: f.name, text: r.text.slice(0, 600000), pages: r.pages, pdf: true });
        for (const im of r.images) { if (list.length >= 12) break; list.push({ type: 'image', name: im.name, dataUrl: im.dataUrl }); }
        if (r.scanned) toast(`${f.name} looks scanned — your bot gets pictures of the first ${r.images.length} page${r.images.length === 1 ? '' : 's'}.`);
      }
      else toast(`Can’t attach ${f.name} — images and text files only.`, true);
    } catch (e) {
      toast(`Couldn’t read ${f.name}.`, true);
    }
  }
  drawTray(p);
  syncSend(p);
  $('#composer-input')?.focus();
}

// PDFs: the text of every page (read on this computer), plus pictures of the pages when the PDF is
// scanned or mostly pictures — so the AI can read it either way.
let pdfjsLib = null;
async function readPdf(file) {
  if (!pdfjsLib) { pdfjsLib = await import('./vendor/pdf.min.mjs'); pdfjsLib.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', location.href).href; }
  const doc = await pdfjsLib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pages = doc.numPages, upto = Math.min(pages, 500);
  let text = '', chars = 0;
  for (let i = 1; i <= upto; i++) {
    const pg = await doc.getPage(i);
    const tc = await pg.getTextContent();
    const t = tc.items.map((it) => (it.str || '') + (it.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    chars += t.length;
    text += `\n\n[Page ${i}]\n${t}`;
  }
  if (pages > upto) text += `\n\n[… pages ${upto + 1}–${pages} were not read]`;
  const scanned = chars < 60 * upto;
  const images = [];
  if (scanned) {
    for (let i = 1; i <= Math.min(pages, 6); i++) {
      const pg = await doc.getPage(i);
      const v0 = pg.getViewport({ scale: 1 });
      const vp = pg.getViewport({ scale: Math.min(2, 1400 / v0.width) });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: g, viewport: vp }).promise;
      images.push({ name: `${file.name} — page ${i}`, dataUrl: c.toDataURL('image/jpeg', 0.82) });
    }
  }
  doc.destroy();
  return { text: `(PDF, ${pages} page${pages === 1 ? '' : 's'})${text}`, pages, images, scanned };
}

function shrinkImage(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      const g = c.getContext('2d');
      g.fillStyle = '#fff';
      g.fillRect(0, 0, c.width, c.height);
      g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = url;
  });
}

async function attachScreenshot(p) {
  try {
    const dataUrl = await api.browserScreenshot();
    (pending[p.id] ||= []).push({ type: 'image', name: 'Screen.jpg', dataUrl });
    drawTray(p);
    syncSend(p);
  } catch (e) {
    toast(e.message, true);
  }
}

function drawTray(p) {
  const tray = $('#tray');
  if (!tray) return;
  const list = pending[p.id] || [];
  tray.classList.toggle('hidden', !list.length);
  tray.innerHTML = list.map((a, i) => a.type === 'image'
    ? `<div class="att img anim-pop"><img src="${a.dataUrl}" alt=""><button class="att-x" data-i="${i}" title="Remove">${icon('x')}</button></div>`
    : `<div class="att file anim-pop"><span class="att-ic">${icon('file')}</span><span class="att-nm">${esc(a.name)}</span><button class="att-x" data-i="${i}" title="Remove">${icon('x')}</button></div>`).join('');
  $$('.att-x', tray).forEach((b) => (b.onclick = () => { list.splice(+b.dataset.i, 1); drawTray(p); syncSend(p); }));
}

function attachmentsHtml(atts) {
  if (!atts?.length) return '';
  return `<div class="msg-atts">${atts.map((a) => a.type === 'image'
    ? `<img class="msg-img" src="${a.dataUrl}" alt="${esc(a.name)}">`
    : `<div class="att file"><span class="att-ic">${icon('file')}</span><span class="att-nm">${esc(a.name)}</span></div>`).join('')}</div>`;
}

// ----- model picker -----
function currentSel(p) {
  const sel = p.model && S.providers.find((x) => x.id === p.model.providerId) ? p.model : S.settings.defaultModel;
  return sel || null;
}
function modelLabel(sel) {
  if (!sel) return 'Choose model';
  const prov = S.providers.find((x) => x.id === sel.providerId);
  const m = prov?.models.find((x) => x.id === sel.model);
  return m?.name || sel.model;
}
function updateModelChip(p) {
  const chip = $('#model-chip');
  const sel = currentSel(p), prov = sel && S.providers.find((x) => x.id === sel.providerId);
  if (chip) chip.innerHTML = `${prov ? logoFor(prov.type, 'xs') : ''}<span>${esc(modelLabel(sel))}</span>${prov ? (prov.account ? '<span class="tag-acct sm">CLOUD</span>' : '<span class="tag-api sm">API</span>') : ''}${icon('chev')}`;
}
function suggestedModels(prov) {
  const bad = /(\d{4}-?\d{2}-?\d{2}|preview|exp\b|-exp|audio|tts|search|embed|instruct|vision-|latest$)/i;
  const good = prov.models.filter((m) => !bad.test(m.id));
  return (good.length ? good : prov.models).slice(0, 6);
}
function openModelPicker(p, anchor) {
  const T = S.providerTypes;
  const cur = currentSel(p);
  const curProv = cur && S.providers.find((x) => x.id === cur.providerId);
  let scope = p.model ? 'bot' : 'all';
  let item = curProv ? 'p:' + curProv.id : S.providers[0] ? 'p:' + S.providers[0].id : 't:openai';
  let showAll = false;
  const rail = () => {
    const added = S.providers;
    const addedTypes = new Set(added.map((x) => x.type));
    const cloudT = Object.keys(T).filter((t) => t !== 'custom' && !addedTypes.has(t));
    const btn = (key, type, title, dot) => `<button class="mp-r${item === key ? ' on' : ''}" data-item="${key}" title="${esc(title)}">${logoFor(type, 'rl')}${dot ? '<i class="mp-dot"></i>' : ''}</button>`;
    const apps = mcpApps();
    const abtn = (a) => `<button class="mp-r${item === 'a:' + a.id ? ' on' : ''}" data-item="a:${a.id}" title="${esc(a.name)} — connected by MCP">${siteLogo(a.domain, 'rl', a.name)}<i class="mp-dot mcp"></i></button>`;
    const acct = (t) => !!T[t]?.account;
    return `<div class="mp-lbl">Cloud</div>
      ${added.filter((x) => acct(x.type)).map((x) => btn('p:' + x.id, x.type, x.name + ' — your account', false)).join('')}
      ${cloudT.filter(acct).map((t) => btn('t:' + t, t, T[t].name + ' — sign in with your account', true)).join('')}
      <div class="mp-lbl">API</div>
      ${added.filter((x) => !acct(x.type)).map((x) => btn('p:' + x.id, x.type, x.name, false)).join('')}
      ${cloudT.filter((t) => !acct(t)).map((t) => btn('t:' + t, t, T[t].name + ' — not connected', true)).join('')}
`;
  };
  const pop = openPopover(`<div class="mp"><div class="mp-rail" id="mp-rail"></div><div class="mp-main" id="mp-main"></div></div>`, anchor, 'up-right');
  pop.querySelector('.mp').addEventListener('apps', () => draw());
  if (!appsCache) api.aiApps().then((l) => { appsCache = l; draw(); }).catch(() => {});
  const draw = () => {
    $('#mp-rail').innerHTML = rail();
    $$('.mp-r', pop).forEach((b) => (b.onclick = () => { item = b.dataset.item; showAll = false; draw(); }));
    const main = $('#mp-main');
    if (item.startsWith('a:')) {
      const a = (appsCache || []).find((x) => 'a:' + x.id === item);
      if (!a) {
        main.innerHTML = `<div class="mp-connect">
          <span class="mp-big-ic">${icon('apps')}</span>
          <h4>Connect an AI app by MCP</h4>
          <p>Let Claude, Cursor, Codex and other AI apps use your bots. Connected apps show up here with an <span class="tag-mcp">MCP</span> badge.</p>
          <button class="btn sm primary" id="mp-apps">Open AI apps</button></div>`;
        $('#mp-apps').onclick = () => { closePopover(); connTab = 'apps'; go('settings', 'connectors'); };
        return;
      }
      const hasAnthropic = S.providers.some((x) => x.type === 'anthropic');
      main.innerHTML = `<div class="mp-connect">
        ${siteLogo(a.domain, 'xl', a.name)}
        <h4>${esc(a.name)} <span class="tag-mcp">MCP</span></h4>
        <p><span class="status ok">● Connected by MCP</span>${a.lastSeen ? ' · used ' + agoText(a.lastSeen) : ' · not used yet'}</p>
        <p class="mp-explain">${esc(a.name)} can list your bots, message them and create new ones. That's the MCP connection — it works in ${esc(a.name)}, not here.<br><br>Replies <em>inside Wayzerr</em> come from an <span class="tag-api">API</span> model.${a.id.startsWith('claude') && !hasAnthropic ? ' Want Claude to think for this bot too? Add an Anthropic key.' : ''}</p>
        <div class="row-flex" style="gap:8px;margin-top:8px">
          ${a.id.startsWith('claude') && !hasAnthropic ? '<button class="btn sm primary" id="mp-claude-api">Use Claude by API</button>' : ''}
          <button class="btn sm" id="mp-manage">Manage</button>
        </div></div>`;
      $('#mp-manage').onclick = () => { closePopover(); connTab = 'apps'; go('settings', 'connectors'); };
      $('#mp-claude-api')?.addEventListener('click', () => { item = 't:anthropic'; draw(); });
      return;
    }
    if (item.startsWith('t:') && T[item.slice(2)]?.account) {
      const type = item.slice(2), t = T[type];
      const bp0 = S.personas.find((x) => x.id === p.id) || p;
      const eff = scope === 'bot' ? bp0.effort || S.settings.defaultEffort || 'default' : S.settings.defaultEffort || 'default';
      const app = { 'claude-account': 'Claude Code', 'chatgpt-account': 'Codex', 'gemini-account': 'Gemini CLI', 'copilot-account': 'Copilot CLI', 'cursor-account': 'Cursor CLI', 'augment-account': 'Auggie', 'amp-account': 'Amp CLI' }[type] || t.name;
      main.innerHTML = `
        <div class="mp-seg"><button class="${scope === 'bot' ? 'on' : ''}" data-scope="bot">Only ${esc(bp0.name)}</button><button class="${scope === 'all' ? 'on' : ''}" data-scope="all">All bots (default)</button></div>
        <div class="mp-hint">${scope === 'bot' ? 'Other bots keep their own model.' : 'Every bot without its own pick uses this.'}</div>
        <div class="mp-sep"></div>
        <div class="mp-head">
          <div class="grow"><div class="mp-title">${esc(t.name)}</div></div>
          <button class="icon-btn" id="mp-check-top" title="Check account">${icon('reload')}</button>
          <span class="mp-pill warn">Sign-in required</span>
        </div>
        <div class="mp-acct-row"><span>Account:</span><select class="mp-select" disabled><option>${esc(t.name)}</option></select></div>
        <div class="mp-sub" style="margin:8px 2px 12px">Choose a model for ${scope === 'bot' ? esc(bp0.name) : 'all bots'}.</div>
        <div class="si-card" id="si-card">
          <p>Sign in to ${app} on this computer with your own ${esc(t.name)} subscription. Open ${{ 'claude-account': "Anthropic's", 'chatgpt-account': "OpenAI's", 'gemini-account': "Google's", 'copilot-account': "GitHub's", 'cursor-account': "Cursor's", 'augment-account': "Augment's", 'amp-account': "Amp's" }[type] || 'the'} sign-in page in your browser, sign in, then paste the code it shows you here. No terminal and no password sharing.</p>
          <button class="si-btn" id="si-go">${icon('login')}Sign in to ${esc(t.name)}</button>
          <div class="si-flow hidden" id="si-flow">
            <div class="acct-step"><span class="acct-spin"></span><span id="acct-text">Getting ready…</span></div>
            <a href="#" id="acct-open" class="hidden" target="_blank">Open the sign-in page again ↗</a>
            <div class="acct-code" id="acct-code"><input placeholder="Paste the code from the sign-in page" autocomplete="off"><button class="btn sm primary">Submit</button></div>
          </div>
        </div>
        <div class="si-term hidden" id="si-term">
          <p>If the browser sign-in doesn't work, run this exact command in Terminal, finish signing in, then click <strong>Check account</strong>.</p>
          <div class="si-cmd"><code id="si-cmd-text"></code><button class="icon-btn" id="si-copy" title="Copy">${icon('copy')}</button></div>
          <button class="btn sm" id="si-check">Check account</button>
        </div>
        <div class="mp-hint center" id="si-models">${type === 'claude-account' || type === 'gemini-account' ? '4 models' : 'Your plan’s models'} will appear after setup.</div>
        <div class="mp-lbl2">Effort</div>
        <div class="mp-effort">${[['fast', '⚡ Fast'], ['default', 'Default'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'X-High'], ['max', 'Max']].map(([e, l]) => `<button class="${eff === e ? 'on' : ''}" data-effort="${e}">${l}</button>`).join('')}</div>`;
      $$('[data-scope]', main).forEach((b) => (b.onclick = () => { scope = b.dataset.scope; draw(); }));
      $$('[data-effort]', main).forEach((b) => (b.onclick = async () => { S = await api.setBotEffort({ personaId: p.id, effort: b.dataset.effort, all: scope === 'all' }); draw(); }));
      const showCmd = (cmd) => { if (!cmd) return; $('#si-cmd-text', main).textContent = cmd; $('#si-term', main).classList.remove('hidden'); };
      api.accountInfo(type).then((i) => showCmd(i.command)).catch(() => {});
      const connected = () => { const np = S.providers.find((x) => x.type === type); if (np) { item = 'p:' + np.id; render(); draw(); } };
      const check = async (btn) => {
        if (btn) { btn.disabled = true; }
        try {
          const r = await api.accountCheck(type);
          if (r.loggedIn) { S = r.state; toast(`${t.name} connected`); return connected(); }
          toast(r.installed ? `Not signed in yet — finish signing in first.` : `Click “Sign in to ${t.name}” first.`, true);
        } catch (e) { toast(e.message, true); }
        if (btn) btn.disabled = false;
      };
      $('#si-check').onclick = (e) => check(e.currentTarget);
      $('#mp-check-top').onclick = (e) => check(e.currentTarget);
      $('#si-copy').onclick = () => { const tx = document.createElement('textarea'); tx.value = $('#si-cmd-text', main).textContent; document.body.appendChild(tx); tx.select(); document.execCommand('copy'); tx.remove(); toast('Command copied'); };
      $('#acct-code button', main).onclick = () => { const i = $('#acct-code input', main); if (i.value.trim()) { api.accountCode(i.value.trim()); i.value = ''; $('#acct-text', main).textContent = 'Checking the code…'; } };
      $('#acct-code input', main).onkeydown = (e) => { if (e.key === 'Enter') $('#acct-code button', main).click(); };
      $('#si-go').onclick = async () => {
        $('#si-go').classList.add('hidden');
        $('#si-flow').classList.remove('hidden');
        acctBox = main;
        try {
          S = await api.accountConnect(type);
          toast(`${t.name} connected`);
          connected();
        } catch (e) {
          if (e.message !== 'Cancelled' && $('#acct-text', main)) { $('#acct-text', main).textContent = e.message; main.querySelector('.acct-spin')?.classList.add('stop'); }
          $('#si-go')?.classList.remove('hidden');
        } finally { acctBox = null; }
      };
      return;
    }
    if (item.startsWith('t:')) {
      const type = item.slice(2), t = T[type];
      main.innerHTML = `<div class="mp-connect">
        ${logoFor(type, 'xl')}
        <h4>${esc(t.name)}</h4><p>${esc(t.sub)}</p>
        ${t.needsKey ? `<input id="mp-key" type="password" placeholder="Paste your ${esc(t.name.replace(/ \(.*\)/, ''))} API key" autocomplete="off" />` : ''}
        <div class="row-flex" style="justify-content:space-between;width:100%;margin-top:12px">
          <a href="${t.keyUrl}" target="_blank">${t.needsKey ? 'Get a key ↗' : 'Download ↗'}</a>
          <button class="btn sm primary" id="mp-conn">Connect</button>
        </div></div>`;
      $('#mp-conn').onclick = async (e) => {
        e.target.disabled = true; e.target.textContent = 'Connecting…';
        try {
          S = await api.saveProvider({ type, apiKey: $('#mp-key')?.value.trim() || '', baseUrl: t.baseUrl });
          const np = S.providers.find((x) => x.type === type);
          item = 'p:' + np.id;
          render(); draw();
        } catch (err) { toast(err.message, true); e.target.disabled = false; e.target.textContent = 'Connect'; }
      };
      return;
    }
    const prov = S.providers.find((x) => 'p:' + x.id === item);
    if (!prov) { item = 't:openai'; return draw(); }
    const q = ($('#mp-q')?.value || '').trim().toLowerCase();
    const bp = S.personas.find((x) => x.id === p.id) || p;
    const sel = scope === 'bot' ? currentSel(bp) : S.settings.defaultModel;
    const effort = scope === 'bot' ? bp.effort || S.settings.defaultEffort || 'default' : S.settings.defaultEffort || 'default';
    const sug = suggestedModels(prov);
    const list = q ? prov.models.filter((m) => (m.id + ' ' + m.name).toLowerCase().includes(q)) : showAll ? prov.models : sug;
    const row = (m) => {
      const on = sel && sel.providerId === prov.id && sel.model === m.id;
      const isDef = S.settings.defaultModel?.providerId === prov.id && S.settings.defaultModel?.model === m.id;
      return `<button class="mp-m${on ? ' on' : ''}" data-m="${esc(m.id)}"><span class="pm-name">${esc(m.name || m.id)}</span>${isDef ? '<span class="chip">Default</span>' : ''}${on ? icon('check') : ''}</button>`;
    };
    main.innerHTML = `
      <div class="mp-seg"><button class="${scope === 'bot' ? 'on' : ''}" data-scope="bot">Only ${esc(bp.name)}</button><button class="${scope === 'all' ? 'on' : ''}" data-scope="all">All bots (default)</button></div>
      <div class="mp-hint">${scope === 'bot' ? 'Other bots keep their own model.' : 'Every bot without its own pick uses this.'}</div>
      <div class="mp-sep"></div>
      <div class="mp-head">
        <div class="grow"><div class="mp-title">${esc(prov.name)} ${prov.account ? '<span class="tag-acct">CLOUD</span>' : '<span class="tag-api">API</span>'}</div><div class="mp-sub">${prov.models.length} models · ${scope === 'bot' ? 'Choose a model for ' + esc(bp.name) + '.' : 'Choose the default model.'}</div></div>
        <button class="icon-btn" id="mp-refresh" title="Refresh models">${icon('reload')}</button>
        <span class="mp-pill">${prov.account ? 'Signed in' : prov.hasKey ? esc(prov.keyPreview) : 'No key'}</span>
      </div>
      ${prov.account ? `<div class="mp-acct-row"><span>Account:</span><select class="mp-select" disabled><option>${esc(prov.keyPreview)}</option></select></div>` : ''}
      ${useLine(prov)}
      <div class="mp-search">${icon('search')}<input id="mp-q" placeholder="Search models" value="${esc(q)}" autocomplete="off"></div>
      <div class="mp-lbl2">${q ? 'Results' : showAll ? 'All models' : 'Suggested'}</div>
      <div class="mp-list">${list.map(row).join('') || '<div class="picker-more">No models found.</div>'}
        ${!q && !showAll && prov.models.length > sug.length ? `<button class="mp-more" id="mp-all">Show all ${prov.models.length} models</button>` : ''}</div>
      <div class="mp-lbl2">Effort</div>
      <div class="mp-effort">${[['fast', '⚡ Fast'], ['default', 'Default'], ['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['xhigh', 'X-High'], ['max', 'Max']].map(([e, l]) => `<button class="${effort === e ? 'on' : ''}" data-effort="${e}">${l}</button>`).join('')}</div>
      <div class="mp-hint" style="margin-top:6px">⚡ Fast = quickest replies (thinks less). Higher effort thinks longer (only some models support it).</div>`;
    $$('[data-scope]', main).forEach((b) => (b.onclick = () => { scope = b.dataset.scope; draw(); }));
    $$('.mp-m', main).forEach((b) => (b.onclick = async () => {
      const s2 = { providerId: prov.id, model: b.dataset.m };
      if (scope === 'bot') await run(() => api.setBotModel({ personaId: p.id, sel: s2 }));
      else { await run(() => api.setDefaultModel(s2)); await run(() => api.setBotModel({ personaId: p.id, sel: null })); }
      closePopover();
      updateModelChip(active());
    }));
    $$('[data-effort]', main).forEach((b) => (b.onclick = async () => { S = await api.setBotEffort({ personaId: p.id, effort: b.dataset.effort, all: scope === 'all' }); draw(); }));
    $('#mp-all')?.addEventListener('click', () => { showAll = true; draw(); });
    $('#mp-refresh').onclick = async (e) => { e.currentTarget.classList.add('spin'); try { S = await api.refreshModels(prov.id); } catch (err) { toast(err.message, true); } draw(); };
    const qi = $('#mp-q');
    qi.oninput = () => { const pos = qi.selectionStart; draw(); const n = $('#mp-q'); n.focus(); n.setSelectionRange(pos, pos); };
  };
  draw();
}

function updateHead(p) {
  const pill = $('#bot-pill');
  if (!pill) return;
  const state = busy.get(p.id)?.activity || null;
  const rec = compactAdvised(p);
  const look = p.id + JSON.stringify([p.name, charOf(p), rec]);
  if (pill.dataset.look !== look) {
    pill.innerHTML = `${charEl(p, 28, state || 'none')}${esc(p.name)}${rec ? '<i class="advise-dot" title="Compacting this chat is recommended — click the name, then Compact chat"></i>' : ''}`;
    pill.dataset.look = look;
  } else window.Characters.setState(pill.querySelector('.char'), state);
}

function appendMessages(p, animate = true) {
  const col = $('#msg-col');
  const msgs = S.chats[p.id] || [];
  if (mounted.count === 0 && msgs.length) { col.innerHTML = ''; col.style.cssText = ''; $('#messages').style.display = ''; }
  const live = $('#live');
  const err = $('#chat-error');
  err?.remove();
  let stagger = 0;
  for (let i = mounted.count; i < msgs.length; i++) {
    const m = msgs[i];
    const prev = msgs[i - 1];
    const frag = document.createElement('div');
    frag.style.display = 'contents';
    let html = '';
    if (m.ts && (!prev || !prev.ts || m.ts - prev.ts > 30 * 60 * 1000)) html += `<div class="sep">${fmtTime(m.ts)}</div>`;
    const a = animate ? ' anim-in' : '';
    // Several bot messages in a row pop in one after another, like a WhatsApp chat.
    const delay = animate && (m.role === 'assistant' || m.role === 'card') ? ` style="animation-delay:${(stagger++ * 0.55).toFixed(2)}s"` : '';
    if (m.role === 'activity' && m.kind === 'botmsg') {
      // In a group, bots talking to each other is already right there in the chat.
      if (p.group && !m.at && !m.toGroup) { html += ''; }
      else {
        const tb = S.personas.find((x) => x.id === m.toId) || { id: m.toId, name: m.to };
        const who = p.group && m.fromId ? `${esc(m.from)} messaged` : 'Messaged';
        // Posting in a group: show the bots it talked to, not the whole group.
        let targets = [tb];
        if (m.toGroup) {
          const ids = [...new Set((m.thread || []).map((t) => t.id).filter((id) => id && id !== m.fromId))];
          if (!ids.length) { const txt = (m.thread?.[0]?.text || '').toLowerCase(); S.personas.filter((x) => !x.group && x.id !== m.fromId && txt.includes('@' + x.name.toLowerCase())).forEach((x) => ids.push(x.id)); }
          const bs = ids.map((id) => S.personas.find((x) => x.id === id)).filter(Boolean);
          if (bs.length) targets = bs;
        }
        const shown = targets.slice(0, 3).map((b) => `${charEl(b, 18, 'none')}<b style="color:${nameColor(b)}">${esc(b.name)}</b>`).join('<span class="tl-sep">,</span>');
        const more = targets.length > 3 ? `<span>+${targets.length - 3}</span>` : '';
        html += `<button class="activity talk-line${a}" id="tl-${esc(m.ts)}" data-p="${m.pending ? 1 : 0}" ${m.toGroup ? `data-open="${esc(m.toId)}" title="Open ${esc(tb.name)}"` : `data-talk="${esc(m.fromId)}|${esc(m.toId)}"`}><span>${who}</span>${shown}${more}${m.pending ? '<span class="tl-dots"><i></i><i></i><i></i></span>' : ''}</button>`;
      }
    } else if (m.role === 'user' && m.from && m.from.id && S.personas.some((x) => x.id === m.from.id)) {
      const fb = S.personas.find((x) => x.id === m.from.id);
      html += `<button class="activity talk-line${a}" data-talk="${esc(fb.id)}|${esc(p.id)}"><span>Message from</span>${charEl(fb, 18, 'none')}<b style="color:${nameColor(fb)}">${esc(fb.name)}</b></button>`;
    } else if (m.role === 'activity' && (m.kind === 'compact' || /^Chat compacted:/.test(m.content || ''))) {
      // you can always see where the chat was compressed (the details with token counts only if you switched them on)
      const n = (/(\d[\d,]*) earlier/.exec(m.content || '') || [])[1];
      html += `<div class="compact-sep${a}" title="${esc(S.settings.showTokens === true ? m.content || '' : 'Older messages were folded into a short note so replies stay fast and cheap. The last messages are kept word for word.')}"><span>${icon('compact')}Chat compressed${n ? ` · ${esc(n)} earlier messages folded into a note` : ''}</span></div>`;
    } else if (m.role === 'activity') { const t = String(m.content || '').replace(/(^|\s*·\s*)Thought for [\dms ]+$/, '').trim(); if (t) html += `<div class="activity${a}">${charEl(p, 16, 'none')}<span>${esc(t)}</span></div>`; }
    else if (m.role === 'thought') { if (String(m.content || '').trim()) html += `<details class="thought${a}"><summary>${charEl(p, 16, 'none')}<span>Thought process</span><i class="chev" aria-hidden="true"></i></summary><div class="thought-body">${esc(String(m.content).trim())}</div></details>`; }
    else if (m.role === 'card') html += cardHtml(p, m, a, delay);
    else if (m.role === 'assistant' && p.group && m.bot) {
      const b = S.personas.find((x) => x.id === m.bot) || { id: m.bot, name: m.botName || 'Bot' };
      const same = prev && prev.role === 'assistant' && prev.bot === m.bot;
      html += `<div class="msg assistant grp${same ? ' cont' : ''}${a}"${delay} data-i="${i}"><div class="g-who">${same ? '' : charEl(b, 26, 'none')}</div><div class="in-stack">${same ? '' : `<div class="g-name" style="color:${nameColor(b, true)}">${esc(b.name)}</div>`}${botBody(m)}</div>${m.image ? '' : msgTools(i, false)}</div>`;
    }
    else if (m.role === 'assistant') html += `<div class="msg assistant${a}"${delay} data-i="${i}">${botBody(m)}${m.image ? '' : msgTools(i, false)}</div>`;
    else if (m.from) {
      const fb = S.personas.find((x) => x.id === m.from.id);
      html += `<div class="msg incoming${a}"><div class="in-stack"><div class="in-from">${fb ? charEl(fb, 18, 'none') : icon('plug')}<span>From <strong>${esc(m.from.name)}</strong></span></div><div class="bubble">${md(m.content)}</div></div></div>`;
    }
    else html += `<div class="msg user${a}" data-i="${i}">${msgTools(i, true)}<div class="u-stack">${m.scheduled ? `<div class="sch-tag">${icon('bell')}Scheduled · ${esc(m.scheduled.title || 'task')}</div>` : ''}${attachmentsHtml(m.attachments)}${m.content ? `<div class="bubble">${esc(m.content).replace(/\n/g, '<br>')}</div>` : ''}</div></div>`;
    frag.innerHTML = html;
    col.insertBefore(frag, live || null);
    if (animate && m.role === 'assistant' && m.ts && Date.now() - m.ts < 15000) announce(`${p.group && m.botName ? m.botName : p.name}: ${m.image ? 'made a picture' : plain(m.content).slice(0, 600)}`);
    if (animate && m.role === 'assistant' && !m.image && m.ts && Date.now() - m.ts < 15000 && Date.now() - (lastDraftAt.get(p.id) || 0) > 8000) typeIn(frag.querySelector('.bubble'));
  }
  mounted.count = msgs.length;
  loadImages(col);
  // Cards change state (waiting → submitted, pending → connected): refresh the ones that did.
  for (const m of msgs) {
    if (m.role !== 'card') continue;
    const el = document.getElementById('card-' + m.id);
    if (el && el.dataset.status !== (m.status || '')) { const t = document.createElement('div'); t.innerHTML = cardHtml(p, m, ' anim-in', ''); el.replaceWith(t.firstElementChild); }
  }
  // "Messaged Calendar bot ···" — the dots go when the answer is in.
  for (const m of msgs) if (m.kind === 'botmsg' && !m.pending) { const el = document.getElementById('tl-' + m.ts); if (el && el.dataset.p === '1') { el.dataset.p = '0'; el.querySelector('.tl-dots')?.remove(); } }
  checkAppCards(p);
  if (chatError) {
    const e = document.createElement('div');
    e.id = 'chat-error'; e.className = 'error-line anim-in'; e.setAttribute('role', 'alert'); e.innerHTML = `<span>${esc(chatError)}</span> <button type="button" class="err-retry">Try again</button>`;
    col.appendChild(e);
  }
  scrollDown();
}

// ---------- pictures the bots made ----------
function botBody(m) {
  if (m.image) {
    const via = String(m.image.via || ''), free = /free/i.test(via);
    const cap = !via ? '' : free ? `<div class="img-via warn" title="${esc(m.image.skipped ? 'Why: ' + m.image.skipped : 'Connect an image AI (OpenAI, Gemini…) in Settings → AI & apps for better pictures.')}">Free service · lower quality</div>` : `<div class="img-via">Made with ${esc(via)}</div>`;
    return `<div class="bubble img-bubble"><img class="gen-img" data-imgid="${esc(m.image.id)}" alt="${esc(m.image.prompt || 'Picture')}" title="${esc(m.image.prompt || '')}">${cap}</div>`;
  }
  return `<div class="bubble">${chips(md(m.content))}${useHtml(m)}</div>`;
}
// Under each reply: what it used (tokens are the pieces of text the AI reads and writes) and how long it took.
function useHtml(m) {
  const u = m.use;
  if (!u || S.settings.showTokens !== true) return '';
  const bits = [];
  if ((u.in || 0) + (u.out || 0) > 0) bits.push(`${u.est ? '~' : ''}${fmtN(u.in)} in · ${fmtN(u.out)} out tokens`);
  if (u.ca > 0) bits.push(`${fmtN(u.ca)} re-read from cache`);
  if (u.ms > 0) bits.push(u.ms < 1000 ? `${u.ms} ms` : `${(u.ms / 1000).toFixed(1)}s`);
  if (u.cost > 0) bits.push(`≈ $${u.cost.toFixed(u.cost < 0.01 ? 4 : 2)} at API prices`);
  if (!bits.length) return '';
  const tip = `${u.si ? `Wayzerr’s own instructions this time: about ${u.si.toLocaleString('en-US')} tokens. ` : ''}Tokens are the pieces of text the AI reads (in) and writes (out). “Re-read from cache” is the earlier conversation and the AI’s own built-in instructions, which it reads again on every message; that is cheaper than new text. Use Compact to shrink it. ${u.calls > 1 ? `This answer took ${u.calls} AI calls because it used tools. ` : ''}${u.est ? 'Estimated: this AI doesn’t report exact numbers.' : ''}`;
  return `<div class="use-line" title="${esc(tip)}">${bits.join(' · ')}</div>`;
}
// "Used in this chat" for the profile card.
function chatUse(p) {
  if (S.settings.showTokens !== true) return '';
  const list = (S.chats[p.id] || []).filter((m) => m.use);
  if (!list.length) return '';
  const tin = list.reduce((n, m) => n + (m.use.in || 0), 0), tout = list.reduce((n, m) => n + (m.use.out || 0), 0);
  const est = list.some((m) => m.use.est);
  return `<p class="pf-use">${icon('cloud')}<span>Used in this chat: ${list.length} ${list.length === 1 ? 'reply' : 'replies'} · ${est ? '~' : ''}${fmtN(tin + tout)} tokens (${fmtN(tin)} in, ${fmtN(tout)} out)</span></p>`;
}
const imgCache = {};
function loadImages(root) {
  $$('img.gen-img:not([src])', root).forEach(async (img) => {
    const id = img.dataset.imgid;
    try { imgCache[id] ||= await api.imageGet(id); } catch (_) {}
    if (imgCache[id]) { img.src = imgCache[id]; img.onload = () => scrollDown(); } else img.replaceWith(Object.assign(document.createElement('div'), { className: 'img-gone', textContent: 'Picture no longer available' }));
  });
}
// Click any picture in a chat: it opens full screen. ← → move between the chat's pictures, click to zoom, Save keeps it.
function openViewer(start) {
  const list = $$('#messages img.gen-img[src], #messages img.msg-img').filter((x) => x.src);
  let i = Math.max(0, list.indexOf(start));
  const o = document.createElement('div');
  o.className = 'iv-full';
  o.innerHTML = `<div class="iv-bar"><div class="iv-cap"></div><button class="iv-btn" id="iv-rot" title="Turn the picture">↻ Turn</button><button class="iv-btn" id="iv-copy">${icon('copy')}Copy</button><button class="iv-btn" id="iv-save">${icon('download')}Save</button><button class="iv-btn iv-x" id="iv-close" title="Close (Esc)">✕</button></div>
    <div class="iv-stage"><img class="iv-img" alt=""></div>
    <button class="iv-nav iv-prev" title="Previous">‹</button><button class="iv-nav iv-next" title="Next">›</button>`;
  o.setAttribute('role', 'dialog'); o.setAttribute('aria-modal', 'true'); o.setAttribute('aria-label', 'Picture viewer');
  const opener = document.activeElement;
  document.body.appendChild(o);
  o.querySelector('#iv-close').focus();
  const img = o.querySelector('.iv-img'), stage = o.querySelector('.iv-stage');
  let rot = 0;
  const turn = () => {
    const side = rot % 180 !== 0;
    img.style.transform = rot ? `rotate(${rot}deg)` : '';
    img.style.maxWidth = side ? `${stage.clientHeight - 36}px` : ''; img.style.maxHeight = side ? `${stage.clientWidth - 140}px` : '';
  };
  const show = () => {
    const el = list[i];
    img.src = el.src; stage.classList.remove('zoom'); rot = 0; turn();
    o.querySelector('.iv-cap').textContent = el.alt || '';
    o.querySelector('.iv-prev').hidden = i === 0; o.querySelector('.iv-next').hidden = i >= list.length - 1;
  };
  const close = () => { document.removeEventListener('keydown', key, true); o.remove(); try { opener?.focus?.(); } catch (_) {} };
  const go = (d) => { if (list[i + d]) { i += d; show(); } };
  const key = (e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } else if (e.key === 'ArrowLeft') go(-1); else if (e.key === 'ArrowRight') go(1); else if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); } };
  const save = async () => {
    const el = list[i];
    try { el.dataset.imgid ? await api.imageSave(el.dataset.imgid) : await api.imageSaveData({ dataUrl: el.src, name: el.alt }); toast('Saved in Downloads'); } catch (err) { toast(err.message, true); }
  };
  const copy = async () => {
    const el = list[i];
    try {
      let url = el.src;
      if (!url.startsWith('data:')) url = await new Promise(async (res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(await (await fetch(url)).blob()); });
      await api.imageCopy({ dataUrl: url });
      toast('Picture copied. Paste it into a document or chat.');
    } catch (err) { toast(err.message || 'Couldn’t copy the picture. Use Save instead.', true); }
  };
  document.addEventListener('keydown', key, true);
  o.querySelector('#iv-copy').onclick = copy;
  o.querySelector('#iv-close').onclick = close;
  o.querySelector('#iv-save').onclick = save;
  o.querySelector('#iv-rot').onclick = () => { rot = (rot + 90) % 360; stage.classList.remove('zoom'); turn(); };
  o.querySelector('.iv-prev').onclick = () => go(-1);
  o.querySelector('.iv-next').onclick = () => go(1);
  stage.onclick = (e) => { if (e.target === img) { if (!rot) stage.classList.toggle('zoom'); } else close(); };
  show();
}
document.addEventListener('click', (e) => {
  const img = e.target.closest('img.gen-img, img.msg-img');
  if (img?.src && img.closest('#messages')) openViewer(img);
});

// ---------- message actions: copy · restart from here · edit ----------
function msgTools(i, isUser) {
  return `<div class="msg-tools">
    <button data-mact="copy" data-i="${i}" title="Copy">${icon('copy')}</button>
    <button data-mact="restart" data-i="${i}" title="Restart the conversation from here">${icon('reload')}</button>
    ${isUser ? `<button data-mact="edit" data-i="${i}" title="Edit">${icon('edit')}</button>` : ''}
  </div>`;
}
document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-mact]');
  if (!b) return;
  const p = active();
  if (!p) return;
  const i = +b.dataset.i;
  const msgs = S.chats[p.id] || [];
  const m = msgs[i];
  if (!m) return;
  if (b.dataset.mact === 'copy') {
    const text = m.content || '';
    try { await navigator.clipboard.writeText(text); } catch (_) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    b.innerHTML = icon('check'); setTimeout(() => (b.innerHTML = icon('copy')), 1200);
    return;
  }
  if (busy.has(p.id)) return toast(`Wait for ${p.name} to finish first.`, true);
  if (b.dataset.mact === 'restart') {
    const later = msgs.length - i - 1;
    confirmBox('Restart from here?', m.role === 'user' ? `Everything after this message is removed and ${p.name} answers it again.` : `The ${later} message${later === 1 ? '' : 's'} after this one ${later === 1 ? 'is' : 'are'} removed.`, 'Restart', async () => {
      if (m.role === 'user') {
        S = await api.truncateChat({ personaId: p.id, index: i });
        mounted = null; render();
        await send(p, { text: m.content, attachments: m.attachments });
      } else {
        S = await api.truncateChat({ personaId: p.id, index: i + 1 });
        mounted = null; render();
      }
    });
    return;
  }
  if (b.dataset.mact === 'edit') {
    const row = b.closest('.msg');
    const bubble = row.querySelector('.bubble');
    if (!bubble || row.querySelector('.edit-box')) return;
    const box = document.createElement('div');
    box.className = 'edit-box';
    box.innerHTML = `<textarea rows="1"></textarea><div class="edit-actions"><button class="btn sm" data-edit-cancel>Cancel</button><button class="btn sm primary" data-edit-send>Send</button></div>`;
    bubble.replaceWith(box);
    const ta = box.querySelector('textarea');
    ta.value = m.content || '';
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    const fit = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 260) + 'px'; };
    fit(); ta.oninput = fit;
    const cancel = () => { mounted = null; render(); };
    const go = async () => {
      const text = ta.value.trim();
      if (!text) return;
      S = await api.truncateChat({ personaId: p.id, index: i });
      mounted = null; render();
      await send(p, { text, attachments: m.attachments });
    };
    box.querySelector('[data-edit-cancel]').onclick = cancel;
    box.querySelector('[data-edit-send]').onclick = go;
    ta.onkeydown = (ev) => { if (ev.key === 'Enter' && !ev.shiftKey) { ev.preventDefault(); go(); } else if (ev.key === 'Escape') cancel(); };
  }
});

// ---------- opening links: Wayzerr's browser or yours (asked once, then remembered) ----------
function openLink(url, mode) {
  const p = active();
  if (mode === 'app' && p && !p.group) {
    setScreen(true);
    api.browserNav({ action: 'go', url }).catch(() => api.openExternal(url));
  } else api.openExternal(url);
}
function askLink(url) {
  let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (_) {}
  const o = modal(`<h3>Open this link?</h3>
    <p class="lead" style="word-break:break-all">${esc(host)}</p>
    <div class="link-choices">
      <button class="link-opt" data-lo="app">${icon('monitor')}<span><b>In Wayzerr</b><small>Opens in the bot's browser, next to the chat</small></span></button>
      <button class="link-opt" data-lo="browser">${icon('external')}<span><b>In your browser</b><small>Safari, Chrome or whichever you use</small></span></button>
    </div>
    <label class="cl-check" style="margin-top:14px"><input type="checkbox" id="lo-remember" checked><span>Remember my choice</span></label>
    <div class="hint" style="margin-top:6px">You can change this anytime in Settings → Browser &amp; data.</div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button></div>`, 'link-modal');
  $$('[data-lo]', o).forEach((b) => (b.onclick = async () => {
    const mode = b.dataset.lo;
    if ($('#lo-remember').checked) { try { S = await api.setLinkOpen(mode); } catch (_) {} }
    closeModal(); openLink(url, mode);
  }));
}
document.addEventListener('click', (e) => {
  const a = e.target.closest('#messages a[href], .bt-thread a[href]');
  if (!a || !/^https?:/i.test(a.getAttribute('href') || '')) return;
  e.preventDefault();
  const url = a.getAttribute('href');
  const mode = S.settings.linkOpen || 'ask';
  if (mode === 'ask') askLink(url); else openLink(url, mode);
}, true);

// ---------- bot-to-bot conversations ----------
// A bot's colour, for its name and @mentions (white bots get a soft grey label).
function nameColor(b, label) {
  let c = '#9aa0a6';
  try { c = charOf(b).color || c; } catch (_) {}
  const n = parseInt(String(c).slice(1), 16);
  if (Number.isNaN(n)) return 'var(--text-2)';
  const r = n >> 16, g = (n >> 8) & 255, bl = n & 255;
  const sat = Math.max(r, g, bl) - Math.min(r, g, bl);
  if (sat < 40) return label ? 'var(--muted)' : 'var(--text)';
  const lum = (0.3 * r + 0.59 * g + 0.11 * bl) / 255;
  if (isLight()) return lum > 0.55 ? `color-mix(in srgb, ${c} 55%, black)` : c;
  return lum < 0.35 ? `color-mix(in srgb, ${c} 60%, white)` : c;
}
// Bot names in a message become little chips: the bot's face + its name in its colour.
function chips(html) {
  const list = (S.personas || []).filter((x) => !x.group && x.name && x.name.trim().length >= 3).sort((a, b) => b.name.length - a.name.length);
  if (!list.length) return html;
  const rx = new RegExp('@(' + list.map((x) => x.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')).join('|') + ')(?![\\wÀ-ɏ])', 'gi');
  let skip = 0;
  return html.split(/(<[^>]+>)/).map((part) => {
    if (part.startsWith('<')) { if (/^<(a|code|pre)\b/i.test(part)) skip++; else if (/^<\/(a|code|pre)>/i.test(part)) skip = Math.max(0, skip - 1); return part; }
    if (skip) return part;
    return part.replace(rx, (all, nm, off, str) => {
      if (off > 0 && /[\wÀ-ɏ]/.test(str[off - 1])) return all;
      const b = list.find((x) => x.name.trim().toLowerCase().replace(/\s+/g, ' ') === nm.toLowerCase().replace(/\s+/g, ' '));
      return b ? `<span class="bchip" data-open="${esc(b.id)}">${characterSvg(charOf(b), { size: 16 })}<b style="color:${nameColor(b)}">${esc(b.name)}</b></span>` : all;
    });
  }).join('');
}
// Everything two bots said to each other, oldest first.
function talkBetween(a, b) {
  const groups = new Set(S.personas.filter((x) => x.group).map((x) => x.id));
  const seen = new Set(), out = [];
  for (const [key, list] of Object.entries(S.chats || {})) {
    if (groups.has(key)) continue;
    for (const m of list) {
      if (m.role !== 'activity' || m.kind !== 'botmsg' || m.toGroup) continue;
      if (!((m.fromId === a && m.toId === b) || (m.fromId === b && m.toId === a))) continue;
      const k = m.fromId + ':' + m.ts; if (seen.has(k)) continue; seen.add(k);
      (m.thread || []).forEach((t, i) => out.push({ id: t.id, who: t.who, text: t.text, ts: t.ts || (i ? m.ts + 1 : m.at || m.ts) }));
    }
  }
  return out.sort((x, y) => x.ts - y.ts);
}
let talkPair = null, talkBack = null;
function openTalk(a, b) { talkBack = S.activePersonaId; talkPair = [a, b]; view = 'talk'; closePopover(); render(); }
function renderTalk() {
  const [a, b] = talkPair || [];
  const who = (id) => S.personas.find((x) => x.id === id) || { id, name: 'Bot' };
  const A = who(a), B = who(b);
  const msgs = talkBetween(a, b);
  let html = '', prev = null;
  for (const m of msgs) {
    if (!prev || m.ts - prev.ts > 30 * 60 * 1000) html += `<div class="sep">${fmtTime(m.ts)}</div>`;
    const bb = who(m.id), same = prev && prev.id === m.id && m.ts - prev.ts < 30 * 60 * 1000;
    html += `<div class="msg assistant grp${same ? ' cont' : ''}"><div class="g-who">${same ? '' : charEl(bb, 26, 'none')}</div><div class="in-stack">${same ? '' : `<div class="g-name" style="color:${nameColor(bb, true)}">${esc(bb.name)}</div>`}<div class="bubble">${chips(md(m.text))}</div></div></div>`;
    prev = m;
  }
  const waiting = [A, B].find((x) => busy.has(x.id) && msgs.length && msgs[msgs.length - 1].id !== x.id);
  if (waiting) html += `<div class="live">${charEl(waiting, 26, 'typing')}<span class="shimmer">${esc(waiting.name)} is working on it…</span></div>`;
  if (!msgs.length) html = `<div class="p-empty" style="margin:auto">These bots haven't talked yet.</div>`;
  else html += `<div class="talk-note">Private messages between bots are deleted after 1 day.</div>`;
  const box = $('#messages');
  const atEnd = !box || box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const keep = box && renderTalk.key === a + b ? box.scrollTop : null;
  renderTalk.key = a + b;
  $('#main').innerHTML = `
    <div class="chat-head"><div class="head-fade"></div>
      <div class="bot-pill talk-pill"><span class="tp-b" data-open="${esc(A.id)}">${charEl(A, 28, 'none')}${esc(A.name)}</span><span class="tp-x">⇄</span><span class="tp-b" data-open="${esc(B.id)}">${charEl(B, 28, 'none')}${esc(B.name)}</span></div>
      <div class="head-right">${guideBtnHtml()}<button class="icon-btn" id="talk-close" title="Close">${icon('x')}</button></div>
    </div>
    <div class="messages" id="messages"><div class="msg-col" id="msg-col">${html}</div></div>`;
  $('#talk-close').onclick = () => { view = 'chat'; if (talkBack && talkBack !== S.activePersonaId) openChat(talkBack); else render(); };
  const nb = $('#messages');
  nb.scrollTop = keep != null && !atEnd ? keep : nb.scrollHeight;
}
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-talk]');
  if (t) { const [a, b] = t.dataset.talk.split('|'); return openTalk(a, b); }
  const o = e.target.closest('[data-open]');
  if (o && S.personas.some((x) => x.id === o.dataset.open)) { if (o.closest('#set-body, .modal')) return; openChat(o.dataset.open); }
});

// Who's typing in a group chat.
function liveLabel(p, b) {
  if (!p.group || !b.botName) return b.text;
  return /^(thinking|typing)$/.test(b.activity) && /^(Thinking|Typing|Writing)/i.test(b.text || 'Thinking') ? `${b.botName} is typing` : `${b.botName}: ${b.text}`;
}

// ---------- chat cards ----------
function cardHtml(p, m, a, delay) {
  if (m.kind === 'choice') {
    const live = m.status === 'waiting' && busy.has(p.id);
    const picked = m.picked || [];
    const opts = (m.options || []).map((o) => `<button type="button" class="co-opt${picked.includes(o) ? ' on' : ''}" name="pick" value="${esc(o)}"${live ? '' : ' disabled'}>${m.multi ? `<span class="co-box">${icon('check')}</span>` : ''}<span>${esc(o)}</span></button>`).join('');
    if (live) return `<form class="card-msg cm-choice${a}" id="card-${m.id}" data-status="waiting" data-choice="${m.id}" data-multi="${m.multi ? 1 : ''}"${delay} autocomplete="off">
        <div class="co-q">${esc(m.question)}</div>
        ${m.multi ? '<div class="co-hint">Pick one or more</div>' : ''}
        <div class="co-opts">${opts}</div>
        <div class="co-own"><input name="typed" type="text" placeholder="Or type your own…" spellcheck="true"><button type="submit" class="co-send" title="Send">${icon('up')}</button></div>
        <div class="co-foot"><button type="button" class="co-skip" data-choice-skip="${m.id}">Skip</button>${m.multi ? '<button type="submit" class="btn sm primary">Done</button>' : ''}</div>
      </form>`;
    return `<div class="card-msg cm-choice done${a}" id="card-${m.id}" data-status="${esc(m.status || '')}"${delay}>
        <div class="co-q">${esc(m.question)}</div>
        <div class="co-opts">${opts}</div>
        ${m.typed ? `<div class="co-typed">${icon('edit')}<span>${esc(m.typed)}</span></div>` : ''}
        ${m.status === 'cancelled' ? '<div class="co-hint">Skipped</div>' : m.status === 'waiting' ? '<div class="co-hint">Not answered</div>' : ''}
      </div>`;
  }
  if (m.kind === 'app') {
    const on = m.status === 'connected' || composioLinked?.includes(m.slug);
    return `<div class="card-msg cm-app${a}" id="card-${m.id}" data-status="${esc(m.status || '')}"${delay}>
      ${siteLogo(appDomain(m.slug), 'xl', m.name)}
      <div class="cm-text"><div class="cm-nm">${esc(m.name)}</div><div class="cm-ds">${esc(m.desc || '')}</div></div>
      ${on ? `<span class="cm-done">${icon('check')}Connected</span>` : m.status === 'declined' || S.appsDeclined?.includes(m.slug) ? `<span class="cm-off">Won't ask again</span>` : `<div class="cm-acts"><button class="cm-btn" data-auth="${esc(m.slug)}" data-card="${m.id}">Authorize</button><button class="cm-no" data-decline="${esc(m.slug)}" data-card="${m.id}" title="Your bots won't ask to connect it again">Can't connect</button></div>`}
    </div>`;
  }
  if (m.kind === 'login') {
    if (m.status === 'waiting' && busy.has(p.id)) {
      const needU = m.ask !== 'password', needP = m.ask !== 'username';
      return `<form class="card-msg cm-login${a}" id="card-${m.id}" data-status="waiting" data-login="${m.id}"${delay} autocomplete="off">
        <div class="cl-head">${siteLogo(m.url || m.site, 'lg', m.site)}<div class="cm-text"><div class="cm-nm">Log in to ${esc(m.site)}</div><div class="cm-ds">Typed straight into the page — ${esc(p.name)} never sees it.</div></div></div>
        ${savedLoginsFor(m).length ? `<div class="cl-saved"><div class="cl-sv-h">${icon('key')}Use a saved login${S.touchId ? ' · Touch ID' : ''}</div>${savedLoginsFor(m).map((v) => `<button type="button" class="cl-sv" data-use-login="${esc(v.id)}" data-card="${m.id}">${siteLogo(v.site || v.name, '', v.name)}<span class="cl-sv-t"><b>${esc(v.name)}</b>${v.username ? `<small>${esc(v.username)}</small>` : ''}</span>${S.touchId ? `<span class="cl-sv-f" title="Touch ID">${icon('finger')}</span>` : ''}</button>`).join('')}<div class="cl-or">or type it</div></div>` : ''}
        ${needU ? `<label class="cl-f">Email or username<input name="username" type="text" autocomplete="username" spellcheck="false" placeholder="you@example.com"></label>` : ''}
        ${needP ? `<label class="cl-f">Password<span class="cl-pw"><input name="password" type="password" autocomplete="current-password" placeholder="••••••••"><button type="button" class="cl-eye" title="Show">${icon('eye')}</button></span></label>` : ''}
        <div class="cl-save"><label class="cl-check"><input type="checkbox" name="save" checked><span>Save to Passwords</span></label>
          <select name="perm" class="mini"><option value="always">Always allow</option><option value="ask">Always ask</option></select></div>
        <div class="cl-actions"><button type="button" class="btn sm" data-login-cancel="${m.id}">Cancel</button><button type="submit" class="btn sm primary">Log in</button></div>
      </form>`;
    }
    const ok = m.status === 'submitted';
    return `<div class="card-msg login-done${a}" id="card-${m.id}" data-status="${esc(m.status || '')}"${delay}>
      <div class="cm-text"><div class="cm-nm">${esc(m.site)} login</div><div class="cm-ds">${ok ? `Filled into the page. Secret values were never shown to your bot.${m.saved ? ` Saved to Passwords (${m.perm === 'ask' ? 'always ask' : 'always allow'}).` : ''}` : 'Cancelled.'}</div></div>
      ${ok ? `<span class="cm-done">${icon('check')}Submitted</span>` : '<span class="cm-off">Cancelled</span>'}
    </div>`;
  }
  return '';
}
// Saved logins offered on a "Log in to …" card: the ones for this site first.
function savedLoginsFor(m) {
  const all = (S.vault || []).filter((v) => v.hasPassword || v.username);
  let host = ''; try { host = new URL(m.url).hostname.replace(/^www\./, ''); } catch (_) {}
  const k = (v) => { const t = `${v.site} ${v.name}`.toLowerCase(); return (host && t.includes(host.split('.').slice(-2, -1)[0] || host)) || t.includes(String(m.site || '').toLowerCase().split(' ')[0]) ? 0 : 1; };
  return all.slice().sort((a, b) => k(a) - k(b)).slice(0, 4);
}
function checkAppCards(p) {
  const pending = (S.chats[p.id] || []).filter((m) => m.role === 'card' && m.kind === 'app' && m.status !== 'connected');
  if (!pending.length || checkAppCards.busy || Date.now() - (checkAppCards.t || 0) < 6000) return;
  checkAppCards.busy = true; checkAppCards.t = Date.now();
  api.composioApps().then((l) => {
    composioLinked = l;
    for (const m of pending) if (l.includes(m.slug)) api.cardUpdate({ personaId: p.id, id: m.id, patch: { status: 'connected' } }).then((st) => { S = st; render(); });
  }).catch(() => {}).finally(() => { checkAppCards.busy = false; });
}
document.addEventListener('click', async (e) => {
  const und = e.target.closest('[data-undecline]');
  if (und) { S = await api.appDecline({ slug: und.dataset.undecline, undo: true }); toast('Bots may ask to connect it again'); renderSettings(); return; }
  const dec = e.target.closest('[data-decline]');
  if (dec) {
    const p = active();
    S = await api.appDecline({ slug: dec.dataset.decline, personaId: p?.id, id: dec.dataset.card });
    render(); toast("Got it. Your bots won't ask to connect it again, and will use the browser instead");
    return;
  }
  const auth = e.target.closest('[data-auth]');
  if (auth) {
    auth.disabled = true; auth.textContent = 'Opening…';
    try { await api.composioLink(auth.dataset.auth); auth.textContent = 'Waiting…'; toast('Sign in using your browser, then come back to Wayzerr'); }
    catch (err) { toast(err.message, true); auth.disabled = false; auth.textContent = 'Authorize'; }
    return;
  }
  const eye = e.target.closest('.cl-eye');
  if (eye) { const i = eye.parentElement.querySelector('input'); i.type = i.type === 'password' ? 'text' : 'password'; return; }
  const opt = e.target.closest('form.cm-choice .co-opt');
  if (opt && !opt.disabled) {
    const c = opt.closest('form');
    if (c.dataset.multi) { opt.classList.toggle('on'); return; }
    opt.classList.add('on');
    c.querySelectorAll('input, button').forEach((x) => (x.disabled = true));
    api.cardSubmit({ cardId: c.dataset.choice, data: { picked: [opt.value], typed: '' } });
    return;
  }
  const skip = e.target.closest('[data-choice-skip]');
  if (skip) { skip.closest('form').querySelectorAll('input, button').forEach((x) => (x.disabled = true)); api.cardSubmit({ cardId: skip.dataset.choiceSkip, data: { cancel: true } }); return; }
  const use = e.target.closest('[data-use-login]');
  if (use) {
    const form = use.closest('form');
    use.disabled = true;
    const r = await api.cardUseLogin({ cardId: use.dataset.card, loginId: use.dataset.useLogin }).catch(() => ({ ok: false }));
    if (r?.ok) form?.querySelectorAll('input, button, select').forEach((x) => (x.disabled = true));
    else { use.disabled = false; if (r?.cancelled) toast('Touch ID was cancelled. Try again, or type it in.', true); }
    return;
  }
  const cancel = e.target.closest('[data-login-cancel]');
  if (cancel) { api.cardSubmit({ cardId: cancel.dataset.loginCancel, data: { cancel: true } }); return; }
});
document.addEventListener('submit', (e) => {
  const c = e.target.closest('[data-choice]');
  if (c) {
    e.preventDefault();
    const typed = c.querySelector('[name=typed]').value.trim();
    const picked = c.dataset.multi ? [...c.querySelectorAll('.co-opt.on')].map((b) => b.value) : [];
    if (!picked.length && !typed) return toast(c.dataset.multi ? 'Pick an option or type your own.' : 'Tap an option or type your own.', true);
    c.querySelectorAll('input, button').forEach((x) => (x.disabled = true));
    api.cardSubmit({ cardId: c.dataset.choice, data: { picked, typed } });
    return;
  }
  const f = e.target.closest('[data-login]');
  if (!f) return;
  e.preventDefault();
  const fd = new FormData(f);
  const data = { username: fd.get('username') || '', password: fd.get('password') || '', save: !!fd.get('save'), perm: fd.get('perm') || 'always' };
  if (!data.username && !data.password) return toast('Type your login first.', true);
  f.querySelectorAll('input, button, select').forEach((x) => (x.disabled = true));
  api.cardSubmit({ cardId: f.dataset.login, data });
});
document.addEventListener('change', (e) => {
  const cb = e.target.closest('.cl-check input');
  if (cb) cb.closest('.cl-save').querySelector('select').style.visibility = cb.checked ? 'visible' : 'hidden';
});
addEventListener('focus', () => { const p = active(); if (p && view === 'chat') checkAppCards(p); });

function updateLive(p) {
  const col = $('#msg-col');
  if (!col) return;
  const b = busy.get(p.id);
  let live = $('#live');
  if (!b) { live?.remove(); $('#maker')?.remove(); $('#live-think')?.remove(); syncSend(p); return; }
  if (!live) {
    if (col.querySelector('.chat-empty')) { col.innerHTML = ''; col.style.cssText = ''; $('#messages').style.display = ''; }
    live = document.createElement('div');
    live.id = 'live'; live.className = 'live';
    col.appendChild(live);
  }
  const state = b.activity;
  const who = p.group && b.botId ? S.personas.find((x) => x.id === b.botId) : null;
  const key = who ? who.id : p.id;
  if (!live.querySelector('.char') || live.dataset.who !== key) { live.dataset.who = key; delete live.dataset.think; live.innerHTML = `${charEl(who || p, 26, state)}<span class="shimmer" id="live-text"></span>`; }
  else window.Characters.setState(live.querySelector('.char'), state);
  $('#live-text').textContent = liveLabel(p, b) + '…';
  if (!live.dataset.think) {
    live.dataset.think = '1'; live.setAttribute('role', 'button'); live.tabIndex = 0; live.title = 'Click to see what it is thinking';
    live.insertAdjacentHTML('beforeend', '<i class="chev" aria-hidden="true"></i>');
    const tog = () => { thinkOpen = !thinkOpen; drawThink(active()); };
    live.onclick = tog; live.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tog(); } };
  }
  live.classList.toggle('open', thinkOpen);
  drawThink(p);
  syncMaker(b);
  if (!live.querySelector('.live-time')) live.insertAdjacentHTML('beforeend', '<span class="live-time" id="live-time"></span>');
  tickLive();
  syncSend(p);
  drawDraft(p);
  scrollDown();
}

// What the bot is thinking right now: its own reasoning when the model shares it, plus the steps it has taken this turn.
const thinks = new Map(); // personaId -> { done: [earlier rounds], cur: this round's reasoning, steps: [what it did] }
let thinkOpen = false;
function noteThink(id, patch) {
  const t = thinks.get(id) || { done: [], cur: '', steps: [] };
  if (patch.thinking !== undefined) { if (patch.thinking.length < t.cur.length && t.cur) t.done.push(t.cur); if (patch.thinking) t.cur = patch.thinking; }
  if (patch.step && t.steps[t.steps.length - 1] !== patch.step) t.steps.push(patch.step);
  if (t.steps.length > 40) t.steps.splice(0, t.steps.length - 40);
  thinks.set(id, t);
}
function drawThink(p) {
  const col = $('#msg-col'); if (!col || !p) return;
  let el = $('#live-think');
  if (!thinkOpen || !busy.get(p.id)) { el?.remove(); return; }
  const t = thinks.get(p.id) || { done: [], cur: '', steps: [] };
  const reasoning = [...t.done, t.cur].filter(Boolean).join('\n\n');
  const html = `<div class="think-h">What ${esc(p.name)} is thinking</div>${reasoning ? `<div class="think-t">${esc(reasoning)}</div>` : `<div class="think-n">This AI doesn’t share its thoughts word for word. Here is what ${esc(p.name)} has done so far:</div>`}${t.steps.length ? `<ul class="think-s">${t.steps.slice(-8).map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
  if (!el) { el = document.createElement('div'); el.id = 'live-think'; el.className = 'think-panel'; const live = $('#live'); live ? live.after(el) : col.appendChild(el); }
  if (el._html !== html) { const box = $('#messages'); const stick = box && box.scrollHeight - box.scrollTop - box.clientHeight < 80; el.innerHTML = html; el._html = html; const tt = el.querySelector('.think-t'); if (tt) tt.scrollTop = tt.scrollHeight; if (stick && box) box.scrollTop = box.scrollHeight; }
}

// While a picture or video is being made: a placeholder with a little Pong game against the computer (no AI needed).
function syncMaker(b) {
  const making = /^Making the (picture|video)/i.test(b?.text || '');
  let m = $('#maker');
  if (!making) { m?.remove(); return; }
  if (m) return;
  const what = /video/i.test(b.text) ? 'video' : 'picture';
  m = document.createElement('div');
  m.id = 'maker'; m.className = 'maker';
  m.innerHTML = `<div class="maker-row"><div class="maker-frame" role="img" aria-label="Your ${what} is being made"><i></i></div>
    <div class="maker-side"><div class="maker-t">Making your ${what}…</div><div class="maker-s">This can take a minute or two. It appears here when it is ready.</div>
    <button class="btn sm" id="maker-play" type="button">Play Pong while you wait</button></div></div><div class="maker-game hidden" id="maker-game"></div>`;
  ($('#live') || $('#msg-col')).after(m);
  $('#maker-play').onclick = () => { const g = $('#maker-game'); g.classList.remove('hidden'); $('#maker-play').remove(); pongGame(g); scrollDown(); };
  scrollDown();
}
// Pong against the computer: first to 5. Mouse, touch or ↑ ↓ keys.
function pongGame(host) {
  host.innerHTML = '<canvas width="360" height="210" tabindex="0" role="img" aria-label="Pong. Move the mouse or press the up and down arrow keys to move your paddle. First to 5 wins."></canvas><div class="maker-s">First to 5 wins. Move the mouse or press ↑ ↓. Click to restart.</div>';
  const c = host.querySelector('canvas'), g = c.getContext('2d');
  const W = 360, H = 210, PW = 7, PH = 44, PX = 14;
  let py = H / 2, cy = H / 2, bx = W / 2, by = H / 2, vx = 3, vy = 1.6, ps = 0, cs = 0, over = '', key = 0, last = 0;
  const serve = (dir) => { bx = W / 2; by = H / 2; vx = 3 * dir; vy = (Math.random() * 2 - 1) * 2.2; };
  const move = (clientY) => { const r = c.getBoundingClientRect(); py = ((clientY - r.top) * H) / (r.height || H); };
  c.addEventListener('mousemove', (e) => move(e.clientY));
  c.addEventListener('touchmove', (e) => { e.preventDefault(); move(e.touches[0].clientY); }, { passive: false });
  c.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') { key = -1; e.preventDefault(); } else if (e.key === 'ArrowDown') { key = 1; e.preventDefault(); } });
  c.addEventListener('keyup', () => { key = 0; });
  c.addEventListener('click', () => { c.focus(); if (over) { ps = cs = 0; over = ''; serve(1); } });
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const frame = (now) => {
    if (!c.isConnected) return;
    const dt = last ? clamp((now - last) / 16.7, 0.2, 3) : 1;
    last = now;
    if (!over) {
      py = clamp(py + key * 4.5 * dt, PH / 2, H - PH / 2);
      py = clamp(py, PH / 2, H - PH / 2);
      cy += clamp(by - cy, -2.4 * dt, 2.4 * dt); // the computer is a little slower than the ball, so you can win
      cy = clamp(cy, PH / 2, H - PH / 2);
      bx += vx * dt; by += vy * dt;
      if (by < 4 || by > H - 4) { vy = -vy; by = clamp(by, 4, H - 4); }
      if (vx < 0 && bx < PX + PW + 4 && bx > PX && Math.abs(by - py) < PH / 2 + 4) { vx = Math.min(7, -vx * 1.07); vy += ((by - py) / PH) * 3; bx = PX + PW + 4; }
      if (vx > 0 && bx > W - PX - PW - 4 && bx < W - PX && Math.abs(by - cy) < PH / 2 + 4) { vx = -Math.min(7, vx * 1.07); vy += ((by - cy) / PH) * 3; bx = W - PX - PW - 4; }
      if (bx < 0) { cs++; serve(1); } else if (bx > W) { ps++; serve(-1); }
      if (ps >= 5) over = 'You win!'; else if (cs >= 5) over = 'Computer wins';
    }
    g.fillStyle = '#111'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#333'; for (let y = 6; y < H; y += 16) g.fillRect(W / 2 - 1, y, 2, 8);
    g.fillStyle = '#fff'; g.fillRect(PX, py - PH / 2, PW, PH); g.fillRect(W - PX - PW, cy - PH / 2, PW, PH); g.fillRect(bx - 4, by - 4, 8, 8);
    g.font = '600 22px system-ui, sans-serif'; g.textAlign = 'center'; g.fillText(ps, W / 2 - 40, 30); g.fillText(cs, W / 2 + 40, 30);
    if (over) { g.font = '600 20px system-ui, sans-serif'; g.fillText(over, W / 2, H / 2 + 6); g.font = '13px system-ui, sans-serif'; g.fillStyle = '#aaa'; g.fillText('Click to play again', W / 2, H / 2 + 28); }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

// How long the bot has been working on this reply, counting up every second.
const elapsed = (ms) => { const s = Math.floor(ms / 1000); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };
function tickLive() {
  const el = $('#live-time'), p = active();
  const b = p && busy.get(p.id);
  if (!el || !b) return;
  el.textContent = elapsed(Date.now() - (b.since || Date.now()));
}
setInterval(tickLive, 250);

function scrollDown() {
  const box = $('#messages');
  if (box) requestAnimationFrame(() => { box.scrollTop = box.scrollHeight; });
}
function autosize(t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 220) + 'px'; }
function syncSend(p) {
  const b = $('#send');
  if (!b) return;
  if (busy.has(p.id)) {
    b.className = 'c-btn c-stop'; b.innerHTML = '<span></span>'; b.title = 'Stop'; b.disabled = false;
  } else {
    b.className = 'c-btn c-send'; b.innerHTML = icon('up'); b.title = 'Send';
    b.disabled = !$('#composer-input')?.value.trim() && !(pending[p.id] || []).length;
  }
}

async function send(p, preset) {
  const input = $('#composer-input');
  const text = preset ? preset.text : input.value.trim();
  const attachments = preset ? preset.attachments || [] : pending[p.id] || [];
  if ((!text && !attachments.length) || busy.has(p.id)) return;
  if (!preset) {
    input.value = '';
    setDraft(p.id, '');
    autosize(input);
    pending[p.id] = [];
    drawTray(p);
  }
  chatError = null;
  (S.chats[p.id] ||= []).push({ role: 'user', content: text, attachments, ts: Date.now() });
  busy.set(p.id, { activity: 'thinking', text: 'Thinking', since: Date.now() });
  renderChat(p);
  renderSidebar();
  try {
    await api.sendMessage({ personaId: p.id, text, attachments });
  } catch (e) {
    chatError = e.message;
  } finally {
    busy.delete(p.id);
    S = await api.getState();
    render();
  }
}

// ---------- profile popover / menus ----------
function openPopover(html, anchor, place = 'down', cls = '') {
  closePopover();
  const bd = document.createElement('div');
  bd.className = 'pop-backdrop';
  const pop = document.createElement('div');
  pop.className = 'popover ' + cls;
  pop.innerHTML = html;
  $('#layer').append(bd, pop);
  const r = anchor.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  let left = Math.min(Math.max(12, r.left + r.width / 2 - w / 2), innerWidth - w - 12);
  if (place === 'up-left') left = Math.max(12, r.left);
  if (place === 'up') left = Math.max(12, r.left);
  if (place === 'up-right') left = Math.max(12, r.right - w);
  pop.style.left = left + 'px';
  pop.style.top = (place.startsWith('up') ? r.top - h - 10 : r.bottom + 10) + 'px';
  pop.style.transformOrigin = place === 'up-right' ? 'bottom right' : place.startsWith('up') ? 'bottom left' : 'top center';
  bd.onclick = closePopover;
  overlay(+1);
  return pop;
}
function closePopover() {
  const had = $('.popover');
  $$('.pop-backdrop, .popover').forEach((e) => e.remove());
  if (had) overlay(-1);
}
function openMenu(anchor, items, place = 'up') {
  const pop = openPopover(`<div class="menu" role="menu">${items.map((it, i) => (it === '-' ? '<div class="sepline" role="separator"></div>' : `<button data-i="${i}" role="menuitem">${icon(it[0])}${esc(it[1])}</button>`)).join('')}</div>`, anchor, place);
  const opener = document.activeElement;
  $$('button', pop).forEach((b) => (b.onclick = () => { closePopover(); try { opener?.focus?.(); } catch (_) {} items[+b.dataset.i][2](); }));
  const btns = $$('button', pop);
  btns[0]?.focus();
  pop.addEventListener('keydown', (e) => {
    const i = btns.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    else if (e.key === 'Home') { e.preventDefault(); btns[0].focus(); }
    else if (e.key === 'End') { e.preventDefault(); btns[btns.length - 1].focus(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closePopover(); try { opener?.focus?.(); } catch (_) {} }
  });
}
// The ⋯ next to a bot in the sidebar: edit it, clear its chat, or delete it.
function rowMenu(p, anchor) {
  const g = !!p.group;
  openMenu(anchor, [
    ['edit', g ? 'Edit group' : 'Edit bot', () => (g ? openGroupEditor(p) : openBotEditor(p))],
    ['pin', isPinned(p.id) ? 'Unpin from top' : 'Pin to top', () => togglePin(p.id)],
    ['copy', 'Copy chat', () => copyChat(p)],
    ['compact', 'Compact chat', () => compactNow(p)],
    ['broom', 'Clear chat', () => confirmBox(`Clear the chat with ${p.name}?`, g ? 'The bots and their memories stay.' : 'Memories are kept.', 'Clear', () => run(() => api.clearChat(p.id)))],
    '-',
    ['trash', g ? 'Delete group' : 'Delete bot', () => confirmBox(g ? `Delete the group ${p.name}?` : `Delete ${p.name}?`, g ? 'Only the group chat is deleted — the bots stay.' : 'Its chat and memories will be deleted too.', 'Delete', () => { seenRows.delete(p.id); return run(() => api.deletePersona(p.id)); })],
  ], 'down');
}
function openGroupEditor(g) {
  const list = S.personas.filter((p) => !p.group);
  const chosen = new Set(g ? g.members : []);
  modal(`<h3>${g ? 'Edit group' : 'New group chat'}</h3>
    <p class="lead">Pick the bots for this chat. Everyone answers — or @mention one bot to ask just them. Bots can talk to each other with @names too.</p>
    <label class="f">Group name</label><input id="g-name" placeholder="e.g. Team, Study group" value="${esc(g?.name || '')}">
    <label class="f">Bots</label>
    <div class="g-pick">${list.map((p) => `<button type="button" class="g-bot ${chosen.has(p.id) ? 'on' : ''}" data-gb="${p.id}">${charEl(p, 30, 'none')}<span>${esc(p.name)}</span><i>${icon('check')}</i></button>`).join('') || '<p class="hint">Make a couple of bots first.</p>'}</div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="g-save">${g ? 'Save' : 'Create group'}</button></div>`);
  $$('[data-gb]').forEach((b) => (b.onclick = () => { const id = b.dataset.gb; chosen.has(id) ? chosen.delete(id) : chosen.add(id); b.classList.toggle('on', chosen.has(id)); }));
  $('#g-save').onclick = async () => {
    if (chosen.size < 2) return toast('Pick at least 2 bots.', true);
    try { await run(() => api.saveGroup({ id: g?.id, name: $('#g-name').value, members: [...chosen] })); closeModal(); view = 'chat'; render(); } catch (_) {}
  };
}
function openProfile(p, anchor) {
  if (p.group) {
    const mem = (p.members || []).map((id) => S.personas.find((x) => x.id === id)).filter(Boolean);
    const pop = openPopover(`<div class="profile">
      <span class="char-pop">${groupAvatar(p, 88)}</span>
      <h3>${esc(p.name)}<span class="chip">Group</span></h3>
      <p>${mem.map((m) => esc(m.name)).join(', ')}</p>
      ${chatUse(p)}
      <div class="acts">
        <button class="btn sm" data-a="edit">${icon('edit')}Edit group</button>
        <button class="btn sm" data-a="copy">${icon('copy')}Copy chat</button>
        <button class="btn sm" data-a="clear">${icon('broom')}Clear chat</button>
        <button class="btn sm danger" data-a="del">${icon('trash')}Delete</button>
        ${tokButtons(p)}
      </div></div>`, anchor, 'down');
    pop.querySelector('[data-a=edit]').onclick = () => { closePopover(); openGroupEditor(p); };
    pop.querySelector('[data-a=compact]').onclick = () => { closePopover(); compactNow(p); };
    pop.querySelector('[data-a=tok]')?.addEventListener('click', () => { closePopover(); connTab = tokensToday(p).prov && !tokensToday(p).prov.account ? 'api' : 'cloud'; go('settings', 'connectors'); });
    pop.querySelector('[data-a=copy]').onclick = () => { closePopover(); copyChat(p); };
    pop.querySelector('[data-a=clear]').onclick = () => { closePopover(); confirmBox(`Clear the ${p.name} chat?`, 'The bots and their memories stay.', 'Clear', () => run(() => api.clearChat(p.id))); };
    pop.querySelector('[data-a=del]').onclick = () => { closePopover(); confirmBox(`Delete the group ${p.name}?`, 'Only the group chat is deleted — the bots stay.', 'Delete', () => { seenRows.delete(p.id); return run(() => api.deletePersona(p.id)); }); };
    return;
  }
  const n = (S.memories[p.id] || []).length;
  const pop = openPopover(`<div class="profile">
      <span class="char-shadow char-pop">${charEl(p, 88)}</span>
      <h3>${esc(p.name)}${tagOf(p) ? `<span class="chip">${esc(tagOf(p))}</span>` : ''}</h3>
      <p>${esc(descOf(p) || 'No description — the name decides who it is.')}</p>
      ${chatUse(p)}
      <div class="acts">
        <button class="btn sm" data-a="edit">${icon('edit')}Edit</button>
        <button class="btn sm" data-a="copy">${icon('copy')}Copy chat</button>
        <button class="btn sm" data-a="clear">${icon('broom')}Clear chat</button>
        <button class="btn sm danger" data-a="del">${icon('trash')}Delete</button>
        ${tokButtons(p)}
      </div></div>`, anchor, 'down');
  pop.querySelector('[data-a=edit]').onclick = () => { closePopover(); openBotEditor(p); };
  pop.querySelector('[data-a=compact]').onclick = () => { closePopover(); compactNow(p); };
  pop.querySelector('[data-a=tok]')?.addEventListener('click', () => { closePopover(); connTab = tokensToday(p).prov && !tokensToday(p).prov.account ? 'api' : 'cloud'; go('settings', 'connectors'); });
    pop.querySelector('[data-a=copy]').onclick = () => { closePopover(); copyChat(p); };
  pop.querySelector('[data-a=clear]').onclick = () => { closePopover(); confirmBox(`Clear the chat with ${p.name}?`, 'Memories are kept.', 'Clear', () => run(() => api.clearChat(p.id))); };
  pop.querySelector('[data-a=del]').onclick = () => { closePopover(); confirmBox(`Delete ${p.name}?`, 'Its chat and memories will be deleted too.', 'Delete', () => { seenRows.delete(p.id); return run(() => api.deletePersona(p.id)); }); };
}

// Search this chat: type, then ↑/↓ or Enter to jump between messages that match.
function openChatSearch(p) {
  $('#chat-find')?.remove();
  const bar = document.createElement('div');
  bar.id = 'chat-find'; bar.className = 'chat-find';
  bar.innerHTML = `${icon('search')}<input placeholder="Search this chat" autocomplete="off" spellcheck="false"><span class="cf-n"></span><button class="icon-btn" data-f="-1" title="Previous (↑)">↑</button><button class="icon-btn" data-f="1" title="Next (↓ or Enter)">↓</button><button class="icon-btn" data-f="x" title="Close (Esc)">${icon('x')}</button>`;
  ($('#main') || document.body).appendChild(bar);
  const input = bar.querySelector('input'), count = bar.querySelector('.cf-n');
  let hits = [], at = -1;
  const clear = () => $$('#messages .msg.cf-hit, #messages .msg.cf-on').forEach((m) => m.classList.remove('cf-hit', 'cf-on'));
  const show = () => {
    $$('#messages .msg.cf-on').forEach((m) => m.classList.remove('cf-on'));
    if (at < 0 || !hits[at]) { count.textContent = input.value.trim() ? 'No matches' : ''; return; }
    hits[at].classList.add('cf-on'); hits[at].scrollIntoView({ block: 'center', behavior: 'smooth' });
    count.textContent = `${at + 1} of ${hits.length}`;
  };
  const find = () => {
    clear();
    const q = input.value.trim().toLowerCase();
    hits = q ? $$('#messages .msg').filter((m) => m.textContent.toLowerCase().includes(q)) : [];
    hits.forEach((m) => m.classList.add('cf-hit'));
    at = hits.length ? hits.length - 1 : -1; // start with the newest
    show();
  };
  const step = (d) => { if (!hits.length) return; at = (at + d + hits.length) % hits.length; show(); };
  const close = () => { clear(); bar.remove(); };
  input.oninput = find;
  input.onkeydown = (e) => { if (e.key === 'Escape') close(); else if (e.key === 'Enter' || e.key === 'ArrowUp') { e.preventDefault(); step(-1); } else if (e.key === 'ArrowDown') { e.preventDefault(); step(1); } };
  bar.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => (b.dataset.f === 'x' ? close() : step(+b.dataset.f))));
  input.focus();
}

// ---------- modal system ----------
function modal(html, cls = '') {
  closeModal(true);
  const o = document.createElement('div');
  o.className = 'overlay';
  o.id = 'modal';
  o.innerHTML = `<div class="modal ${cls}">${html}</div>`;
  o.onmousedown = (e) => { if (e.target === o) closeModal(); };
  $('#layer').appendChild(o);
  $$('[data-close]', o).forEach((b) => (b.onclick = () => closeModal()));
  overlay(+1);
  o.setAttribute('role', 'dialog');
  o.setAttribute('aria-modal', 'true');
  const head = o.querySelector('h3, h2');
  if (head) { head.id = head.id || 'dlg-title'; o.setAttribute('aria-labelledby', head.id); } else o.setAttribute('aria-label', o.querySelector('#be-name') ? 'Bot details' : 'Dialog');
  o._opener = document.activeElement;
  setTimeout(() => { if (!o.contains(document.activeElement)) (o.querySelector('input, textarea, select') || o.querySelector('.btn.primary') || o.querySelector(FOCUSABLE))?.focus(); }, 40);
  o.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...o.querySelectorAll(FOCUSABLE)].filter((x) => x.getBoundingClientRect().width > 0);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  return o;
}
function closeModal(instant) {
  const o = $('#modal');
  if (!o) return;
  o.id = '';
  overlay(-1);
  if (instant) return o.remove();
  const back = o._opener;
  o.classList.add('closing');
  setTimeout(() => { o.remove(); if (back && back.isConnected && !$('#modal') && !$('.popover')) try { back.focus(); } catch (_) {} }, 170);
}
function confirmBox(title, text, okLabel, onOk) {
  modal(`<h3>${esc(title)}</h3><p class="lead">${esc(text)}</p><div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="cb-ok">${esc(okLabel)}</button></div>`);
  $('#cb-ok').onclick = async () => { closeModal(); await onOk(); };
}
function overlay(delta) {
  overlayCount = Math.max(0, overlayCount + delta);
  syncScreen();
}

// ---------- create / edit bot ----------
function openBotEditor(p, presetName = '') {
  const isNew = !p;
  const d = p ? { ...p } : { name: presetName };
  const used = bots().map((b) => String(charOf(b).color || '').toLowerCase());
  // The 18 bots to choose from (bottom row) and the 16 accessories (top row) — like picking a kart.
  const R_ = '#FF6B5B', B_ = '#4F8BFF', Y_ = '#FFB020', G_ = '#2FCB7A', P_ = '#A77BFF', K_ = '#FF7AB6', W_ = '#F2F2F2', T_ = '#2DD4BF';
  // 18 bots, each its own colour
  const LOOKS = [['orb', R_, 'dots', 'smile'], ['pebble', B_, 'ovals', 'none'], ['blob', Y_, 'wide', 'o'], ['bun', G_, 'dots', 'smile'], ['capsule', P_, 'ovals', 'none'], ['bean', K_, 'wide', 'o'],
    ['orb', '#FF8A3D', 'ovals', 'o'], ['pebble', '#38BDF8', 'wide', 'smile'], ['blob', '#E879F9', 'dots', 'none'], ['bun', W_, 'ovals', 'o'], ['capsule', T_, 'wide', 'smile'], ['bean', '#A3E635', 'dots', 'none'],
    ['orb', '#6366F1', 'dots', 'none'], ['pebble', '#FB7185', 'dots', 'o'], ['blob', '#6EE7B7', 'ovals', 'smile'], ['bun', '#B07A4F', 'wide', 'none'], ['capsule', '#FACC15', 'dots', 'o'], ['bean', '#5B6275', 'ovals', 'smile']]
    .map(([shape, color, eyes, mouth]) => ({ shape, color, eyes, mouth, extra: 'none' }));
  const ACCS = window.Characters.ACCESSORIES;
  const sameLook = (x, y) => x && y && x.shape === y.shape && String(x.color).toLowerCase() === String(y.color).toLowerCase() && x.eyes === y.eyes && (x.mouth || 'none') === (y.mouth || 'none');
  const pickRandom = () => {
    const free = LOOKS.map((l, i) => i).filter((i) => !used.includes(LOOKS[i].color.toLowerCase()));
    const pool = free.length ? free : LOOKS.map((l, i) => i);
    return { bi: pool[Math.floor(Math.random() * pool.length)], ai: Math.floor(Math.random() * ACCS.length) };
  };
  let bi, ai;
  if (p) { const c = charOf(p); bi = LOOKS.findIndex((l) => sameLook(l, c)); ai = Math.max(0, ACCS.findIndex((a) => a.id === (c.acc || 'none'))); }
  else ({ bi, ai } = pickRandom()); // a new bot starts already randomized
  let ch = bi >= 0 ? { ...LOOKS[bi], acc: ACCS[ai].id } : { ...charOf(p), acc: ACCS[ai].id };
  modal(`
    <div class="kart">
      <div class="k-row"><button class="k-arrow" data-k="acc" data-d="-1" title="↑">◀</button><div class="k-strip" id="k-acc"></div><button class="k-arrow" data-k="acc" data-d="1" title="↓">▶</button></div>
      <div class="k-stage"><div class="k-glow"></div><div id="be-char"></div><div class="k-label"><b id="k-accname"></b></div>
        <button class="shuffle k-rand" id="be-shuffle">${icon('shuffle')}Randomize</button></div>
      <div class="k-row"><button class="k-arrow" data-k="bot" data-d="-1" title="←">◀</button><div class="k-strip" id="k-bot"></div><button class="k-arrow" data-k="bot" data-d="1" title="→">▶</button></div>
      <div class="k-keys"><kbd>←</kbd><kbd>→</kbd> bot · <kbd>↑</kbd><kbd>↓</kbd> accessory</div>
    </div>
    <label class="f">Name</label>
    <input id="be-name" value="${esc(d.name)}" placeholder="e.g. Research bot" />
    <label class="f">Tag <span>(optional)</span></label>
    <input id="be-tag" value="${esc(tagOf(d))}" placeholder="e.g. Research" />
    <label class="f">Description <span>(optional)</span></label>
    <textarea id="be-desc" rows="3" placeholder="What should it do? e.g. Finds sources, summarises debates and builds briefing notes.">${esc(descOf(d))}</textarea>
    <div class="hint">The name and description decide who the bot is — “Research bot” becomes a research expert.</div>
    <div class="modal-actions">
      <button class="btn" data-close>Cancel</button>
      <button class="btn primary" id="be-save">${isNew ? 'Create' : 'Save'}</button>
    </div>`);
  const center = (strip) => { const on = strip.querySelector('.on'); if (on) strip.scrollTo({ left: on.offsetLeft - strip.clientWidth / 2 + on.offsetWidth / 2, behavior: 'smooth' }); };
  const draw = (pop) => {
    ch = bi >= 0 ? { ...LOOKS[bi], acc: ACCS[ai].id } : { ...ch, acc: ACCS[ai].id };
    $('#k-acc').innerHTML = ACCS.map((a, i) => `<button class="k-tile${i === ai ? ' on' : ''}" data-ai="${i}" title="${esc(a.name)}">${a.id === 'none' ? `<span class="acc-none">${icon('x')}</span>` : window.Characters.accessorySvg(a.id, 40)}</button>`).join('');
    $$('#k-acc svg.acc-only').forEach((x) => window.Characters.fitAccessory(x));
    $('#k-bot').innerHTML = LOOKS.map((l, i) => `<button class="k-tile${i === bi ? ' on' : ''}" data-bi="${i}">${characterSvg({ ...l, acc: ch.acc }, { size: 44 })}</button>`).join('');
    $('#k-accname').textContent = ACCS[ai].id === 'none' ? 'No accessory' : ACCS[ai].name;
    $('#be-char').innerHTML = `<span class="${pop ? 'char-pop' : ''}" style="display:inline-block">${characterSvg(ch, { size: 120 })}</span>`;
    center($('#k-acc')); center($('#k-bot'));
    $$('#k-acc [data-ai]').forEach((x) => (x.onclick = () => { ai = +x.dataset.ai; draw(true); }));
    $$('#k-bot [data-bi]').forEach((x) => (x.onclick = () => { bi = +x.dataset.bi; draw(true); }));
  };
  const step = (k, d) => { if (k === 'acc') ai = (ai + d + ACCS.length) % ACCS.length; else bi = ((bi < 0 ? 0 : bi) + d + LOOKS.length) % LOOKS.length; draw(true); };
  $$('.k-arrow').forEach((x) => (x.onclick = () => step(x.dataset.k, +x.dataset.d)));
  const modalEl = $('#modal');
  const onKey = (e) => {
    if (!modalEl.isConnected || modalEl.id !== 'modal') return document.removeEventListener('keydown', onKey);
    const el = document.activeElement;
    if (/INPUT|TEXTAREA/.test(el?.tagName || '') && el.value) return; // arrows move the cursor while typing
    const m = { ArrowLeft: ['bot', -1], ArrowRight: ['bot', 1], ArrowUp: ['acc', -1], ArrowDown: ['acc', 1] }[e.key];
    if (m) { e.preventDefault(); step(...m); }
  };
  document.addEventListener('keydown', onKey);
  const reroll = () => { ({ bi, ai } = pickRandom()); draw(true); };
  $('#be-shuffle').onclick = reroll;
  draw(false);
  $('#be-name').focus();
  $('#be-name').onkeydown = (e) => { if (e.key === 'Enter') $('#be-save').click(); };
  $('#be-save').onclick = async () => {
    const name = $('#be-name').value.trim();
    if (!name) return toast('Give your bot a name first.', true);
    const out = { ...d, name, tag: $('#be-tag').value.trim(), description: $('#be-desc').value.trim(), character: ch };
    delete out.tagline; delete out.personality; delete out.emoji; delete out.color;
    view = 'chat';
    closeModal();
    await run(() => api.savePersona(out));
  };
}

function openMemories(p) {
  const mems = S.memories[p.id] || [];
  modal(`
    <h3>What ${esc(p.name)} remembers</h3>
    <p class="lead">Saved automatically when you share something important.</p>
    ${mems.length ? mems.map((m) => `<div class="mem-item"><div class="grow">${esc(m.text)}</div><button class="btn sm danger" data-mid="${m.id}">Delete</button></div>`).join('') : '<p class="hint">Nothing yet.</p>'}
    <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>`);
  $$('[data-mid]').forEach((b) => (b.onclick = async () => { await run(() => api.deleteMemory({ personaId: p.id, memoryId: b.dataset.mid })); openMemories(p); }));
}

// ---------- search palette ----------
// Messages anywhere in your chats that contain the words you typed (newest first).
function searchMessages(q) {
  const needle = q.toLowerCase(), out = [];
  for (const p of S.personas) {
    const list = S.chats[p.id] || [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if ((m.role !== 'user' && m.role !== 'assistant') || !m.content) continue;
      const text = plain(m.content), at = text.toLowerCase().indexOf(needle);
      if (at >= 0) out.push({ p, i, m, at, text });
    }
  }
  return out.sort((a, b) => (b.m.ts || 0) - (a.m.ts || 0)).slice(0, 8);
}
function jumpToMessage(personaId, index) {
  openChat(personaId);
  setTimeout(() => {
    const el = document.querySelector(`#msg-col .msg[data-i="${index}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center' });
    el.classList.add('cf-on');
    setTimeout(() => el.classList.remove('cf-on'), 2400);
  }, 450);
}
// The whole conversation as plain text you can paste into an email or a document.
async function copyChat(p) {
  const msgs = (S.chats[p.id] || []).filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content);
  if (!msgs.length) return toast('Nothing to copy yet.', true);
  const me = (S.settings.userName || '').trim() || 'You';
  const text = `${p.name}\n\n` + msgs.map((m) => `${m.role === 'user' ? (m.from?.name || me) : (m.botName || p.name)} (${m.ts ? new Date(m.ts).toLocaleString() : ''}):\n${m.content.replace(/\*\*([^*\n]+)\*\*/g, '$1')}`).join('\n\n') + '\n';
  try { await navigator.clipboard.writeText(text); }
  catch (_) { const t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  toast(`Copied ${msgs.length} message${msgs.length === 1 ? '' : 's'}. Paste them anywhere.`);
}

function openPalette() {
  if ($('#palette')) return;
  closePopover();
  const o = document.createElement('div');
  o.className = 'overlay'; o.id = 'palette'; o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Search');
  o.style.placeItems = 'start center';
  o.style.paddingTop = '14vh';
  o.innerHTML = `<div class="palette"><div class="search">${icon('search')}<input id="pal-q" placeholder="Search bots and messages" autocomplete="off" /></div><div class="list" id="pal-list"></div></div>`;
  $('#layer').appendChild(o);
  overlay(+1);
  let sel = 0;
  const close = () => { o.classList.add('closing'); o.id = ''; overlay(-1); setTimeout(() => o.remove(), 170); };
  o.onmousedown = (e) => { if (e.target === o) close(); };
  const draw = () => {
    const q = $('#pal-q').value.trim().toLowerCase();
    const items = bots().filter((p) => !q || (p.name + ' ' + tagOf(p) + ' ' + descOf(p)).toLowerCase().includes(q));
    const hits = q.length >= 2 ? searchMessages(q) : [];
    const total = items.length + hits.length;
    sel = Math.max(0, Math.min(sel, total - 1));
    const snip = (h) => { const t = h.text, n = q.length, from = Math.max(0, h.at - 28); return `${h.m.role === 'user' ? 'You: ' : ''}${from > 0 ? '…' : ''}${esc(t.slice(from, h.at))}<mark>${esc(t.slice(h.at, h.at + n))}</mark>${esc(t.slice(h.at + n, h.at + n + 70))}${t.length > h.at + n + 70 ? '…' : ''}`; };
    const botHtml = items.map((p, i) => `<button class="p-item${i === sel ? ' sel' : ''}" data-id="${p.id}">${charEl(p, 30)}<div class="meta"><div class="top">${esc(p.name)}${tagOf(p) ? `<span class="chip">${esc(tagOf(p))}</span>` : ''}</div><div class="ds">${esc(descOf(p) || plain(lastMessage(p)?.content) || '')}</div></div></button>`).join('');
    const msgHtml = hits.length ? `<div class="p-sec">In your chats</div>` + hits.map((h, j) => `<button class="p-item p-msg${items.length + j === sel ? ' sel' : ''}" data-id="${h.p.id}" data-mi="${h.i}">${charEl(h.p, 30)}<div class="meta"><div class="top">${esc(h.p.name)}<span class="p-when">${esc(fmtTime(h.m.ts))}</span></div><div class="ds">${snip(h)}</div></div></button>`).join('') : '';
    $('#pal-list').innerHTML = total ? botHtml + msgHtml : `<div class="p-empty">Nothing matches. <a href="#" id="pal-create">Create a bot called “${esc($('#pal-q').value.trim())}”</a></div>`;
    $$('.p-item', o).forEach((b, i) => {
      b.onclick = () => { close(); if (b.dataset.mi !== undefined) jumpToMessage(b.dataset.id, +b.dataset.mi); else openChat(b.dataset.id); };
      b.onmouseenter = () => { sel = i; $$('.p-item', o).forEach((x) => x.classList.toggle('sel', x === b)); };
    });
    $$('.p-item', o)[sel]?.scrollIntoView({ block: 'nearest' });
    const c = $('#pal-create');
    if (c) c.onclick = (e) => { e.preventDefault(); close(); openBotEditor(null, $('#pal-q').value.trim()); };
    $('#pal-q').onkeydown = (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(sel + 1, total - 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(sel - 1, 0); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && total) { $$('.p-item', o)[sel]?.click(); }
      else if (e.key === 'Escape') close();
    };
  };
  $('#pal-q').oninput = () => { sel = 0; draw(); };
  draw();
  $('#pal-q').focus();
}

// ---------- screen (built-in browser) ----------
// The panel shows a live thumbnail of the bots' browser. Clicking it expands
// into a full-window, interactive browser (the real Chromium view).
let fsOpen = false;
let lastThumb = null;
const thumbs = {}; // personaId -> latest screen thumbnail
let screenFor = null;
async function selectScreen(id) {
  if (!id || screenFor === id) return;
  screenFor = id;
  lastThumb = thumbs[id] || null;
  const img = $('#scr-thumb');
  if (lastThumb) img.src = lastThumb;
  try { browserSt = await api.browserSelect(id); } catch (_) { browserSt = { hasPage: false }; }
  renderBrowserState();
  syncScreen();
}

let scrTab = 'computer';
function setScrTab(t) {
  scrTab = t === 'schedule' ? 'schedule' : 'computer';
  savePref('scrTab', scrTab);
  $$('#scr-tabs button').forEach((b) => { const on = b.dataset.t === scrTab; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); });
  $('#scr-pane-computer').classList.toggle('hidden', scrTab !== 'computer');
  $('#scr-pane-schedule').classList.toggle('hidden', scrTab !== 'schedule');
  if (scrTab === 'schedule') window.renderSchedulePane?.();
}
function setScreen(open) {
  screenOpen = open;
  savePref('screenOpen', open);
  $('#screen').classList.toggle('open', open);
  $('#btn-screen')?.classList.toggle('on', open);
  syncScreen();
}

function fsRect() {
  const top = 56;
  return { x: 12, y: top, width: innerWidth - 24, height: innerHeight - top - 12 };
}

let syncQueued = false;
function syncScreen() {
  if (syncQueued) return;
  syncQueued = true;
  requestAnimationFrame(() => {
    syncQueued = false;
    const r = fsRect();
    const showFull = fsOpen && overlayCount === 0 && !$('#fs').classList.contains('animating');
    api.browserBounds({ mode: showFull ? 'full' : 'hidden', x: r.x + 1, y: r.y + 1, width: r.width - 2, height: r.height - 2 });
    const thumbs = screenOpen && !fsOpen && view !== 'settings' && !(view === 'chat' && active()?.group) && !$('#sidebar').classList.contains('hidden');
    if (thumbs !== syncScreen.thumbs) { syncScreen.thumbs = thumbs; api.browserThumbs(thumbs); }
  });
}

function renderBrowserState() {
  // Every system looks the same: the computer on top and the browser in its own card under it. Where the computer
  // isn't available (an Intel Mac) its card says so, and the browser works as everywhere.
  const px = 'brw';
  $('#tab-computer').textContent = 'Computer';
  $('#brw-sec').classList.remove('hidden');
  window.renderDesktop?.();
  const st = browserSt;
  const p = active();
  const host = st.hasPage ? hostOf(st.url) : '';
  $(`#${px}-empty`).classList.toggle('hidden', !!st.hasPage);
  $(`#${px}-thumb`).classList.toggle('hidden', !st.hasPage || !lastThumb);
  $(`#${px}-progress`).classList.toggle('on', !!st.loading);
  $('#fs-progress').classList.toggle('on', !!st.loading);
  $('#scr-title').textContent = p ? `${p.name}'s computer` : 'Screen';
  $(`#${px}-caption`).textContent = st.hasPage ? st.title || 'Loading…' : p ? `${p.name}'s browser` : 'Browser';
  $(`#${px}-sub`).textContent = host || 'Click to open the browser';
  window.renderBrowserBox?.();
  window.renderSchedulePane?.(); // the Schedule tab follows the selected bot
  const url = $('#fs-url');
  if (document.activeElement !== url) url.value = st.hasPage ? st.url || '' : '';
  $('#fs-lock').innerHTML = st.hasPage && /^https:/.test(st.url || '') ? icon('lock') : icon('globe');
  $('#fs-back').disabled = !st.canGoBack;
  $('#fs-fwd').disabled = !st.canGoForward;
  // "Live" badge + status when a bot is using the browser
  const b = [...busy.entries()].find(([id, v]) => id === screenFor && ['browsing', 'reading', 'typing'].includes(v.activity));
  $(`#${px}-live`).classList.toggle('hidden', !b);
  const fsS = $('#fs-status');
  if (b) {
    const bot = S.personas.find((x) => x.id === b[0]);
    if (bot) {
      fsS.innerHTML = `${charEl(bot, 22)}<span class="shimmer">${esc(b[1].text)}…</span>`;
      fsS.classList.remove('hidden');
    }
  } else fsS.classList.add('hidden');
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (_) { return ''; } };

// Smoothly grow the thumbnail into the full-screen browser (and back).
function flyGhost(fromRect, toRect, onDone) {
  const g = document.createElement('div');
  g.className = 'fs-ghost';
  if (lastThumb && browserSt.hasPage) g.style.backgroundImage = `url(${lastThumb})`;
  Object.assign(g.style, { left: toRect.x + 'px', top: toRect.y + 'px', width: toRect.width + 'px', height: toRect.height + 'px' });
  const sx = fromRect.width / toRect.width, sy = fromRect.height / toRect.height;
  g.style.transform = `translate(${fromRect.x - toRect.x}px, ${fromRect.y - toRect.y}px) scale(${sx}, ${sy})`;
  document.body.appendChild(g);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    g.style.transform = 'none';
    g.style.borderRadius = '14px';
  }));
  setTimeout(() => { onDone?.(); setTimeout(() => g.remove(), 90); }, 380);
  return g;
}

function openFullScreen(cardSel, browserToo) {
  if (typeof cardSel !== 'string') cardSel = '#scr-card';
  if (!browserToo) return window.desktopMode?.() ? window.openDesktop?.() : toast('A computer for each bot is coming to this system in a later version. The browser works already: click it below.');
  if (fsOpen) return;
  const card = $('#brw-card').getBoundingClientRect();
  const from = card.width > 20 ? { x: card.left, y: card.top, width: card.width, height: card.height } : { x: innerWidth / 2 - 100, y: innerHeight / 2 - 60, width: 200, height: 120 };
  fsOpen = true;
  const fs = $('#fs');
  fs.classList.remove('hidden', 'closing');
  fs.classList.add('animating');
  syncScreen();
  flyGhost(from, fsRect(), () => { fs.classList.remove('animating'); syncScreen(); });
}

function closeFullScreen() {
  if (!fsOpen) return;
  fsOpen = false;
  const fs = $('#fs');
  fs.classList.add('animating');
  syncScreen(); // hides the real view; the ghost takes its place
  const card = $('#brw-card').getBoundingClientRect();
  const to = screenOpen && card.width > 20 ? { x: card.left, y: card.top, width: card.width, height: card.height } : { x: innerWidth - 60, y: 40, width: 40, height: 25 };
  const full = fsRect();
  const g = document.createElement('div');
  g.className = 'fs-ghost';
  if (lastThumb && browserSt.hasPage) g.style.backgroundImage = `url(${lastThumb})`;
  Object.assign(g.style, { left: full.x + 'px', top: full.y + 'px', width: full.width + 'px', height: full.height + 'px', borderRadius: '14px' });
  document.body.appendChild(g);
  fs.classList.add('closing');
  requestAnimationFrame(() => requestAnimationFrame(() => {
    g.style.transform = `translate(${to.x - full.x}px, ${to.y - full.y}px) scale(${to.width / full.width}, ${to.height / full.height})`;
    g.style.opacity = screenOpen ? '1' : '0';
  }));
  setTimeout(() => {
    g.remove();
    fs.classList.add('hidden');
    fs.classList.remove('closing', 'animating');
    syncScreen();
  }, 380);
}

function initScreen() {
  $('#fs-back').innerHTML = icon('back');
  $('#fs-fwd').innerHTML = icon('fwd');
  $('#fs-reload').innerHTML = icon('reload');
  $('#scr-close').innerHTML = icon('collapse');
  $('#scr-expand').innerHTML = `${icon('expand')}<span>Full screen</span>`;
  $('#scr-empty').innerHTML = `${icon('monitor')}<div>Nothing open yet</div>`;
  $('#fs-back').onclick = () => api.browserNav({ action: 'back' });
  $('#fs-fwd').onclick = () => api.browserNav({ action: 'forward' });
  $('#fs-reload').onclick = () => api.browserNav({ action: 'reload' });
  $('#fs-done').onclick = () => { if (teaching) return toast('Save or cancel the skill you are teaching first.', true); closeFullScreen(); };
  $('#fs-teach').innerHTML = `${icon('sparkle')}Teach a skill`;
  $('#fs-teach').onclick = () => startTeaching();
  $('#teach-cancel').onclick = async () => { await api.teachStop({}).catch(() => {}); setTeaching(false); toast('Stopped teaching'); };
  $('#teach-done').onclick = () => finishTeaching();
  $('#scr-close').onclick = () => setScreen(false);
  $('#scr-card').onclick = () => openFullScreen('#scr-card');
  $('#brw-card').onclick = () => openFullScreen('#brw-card', true);
  $('#brw-expand').innerHTML = `${icon('expand')}<span>Full screen</span>`;
  $('#brw-empty').innerHTML = `${icon('globe')}<div>Browser is not open</div>`;
  $$('#scr-tabs button').forEach((b) => (b.onclick = () => setScrTab(b.dataset.t)));
  setScrTab(loadPref('scrTab', 'computer'));
  $('#fs-url').onkeydown = (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) { api.browserNav({ action: 'go', url: e.target.value.trim() }).catch((err) => toast(err.message, true)); e.target.blur(); }
  };
  $('#screen').classList.toggle('open', screenOpen);
  addEventListener('resize', syncScreen);
  api.onBrowserThumb(({ personaId, data }) => {
    thumbs[personaId] = data;
    if (personaId !== screenFor) return;
    lastThumb = data;
    const img = $('#brw-thumb');
    img.src = data;
    img.classList.toggle('hidden', !browserSt.hasPage);
  });
  renderBrowserState();
  syncScreen();
}
// ---------- settings hub (General · Connectors & API keys · Browser & data) ----------
let settingsTab = 'general';
function go(v, tab) { view = v; if (tab) settingsTab = tab; closePopover(); render(); }
function permSelect(id, value) {
  return `<select class="mini" data-perm="${id}"><option value="ask" ${value !== 'always' ? 'selected' : ''}>Ask first time</option><option value="always" ${value === 'always' ? 'selected' : ''}>Always allowed</option></select>`;
}
const stripStatus = ({ status, ...rest }) => rest;

const PRESETS = [
  { key: 'brave', domain: 'brave.com', name: 'Brave Search', icon: '🦁', desc: 'Web, news and image search.', args: ['-y', '@brave/brave-search-mcp-server'], env: [['BRAVE_API_KEY', 'Brave Search API key']], keyUrl: 'https://brave.com/search/api/' },
  { key: 'tavily', domain: 'tavily.com', name: 'Tavily', icon: '🔎', desc: 'AI-friendly web search and page extraction.', args: ['-y', 'tavily-mcp'], env: [['TAVILY_API_KEY', 'Tavily API key']], keyUrl: 'https://app.tavily.com' },
  { key: 'firecrawl', domain: 'firecrawl.dev', name: 'Firecrawl', icon: '🔥', desc: 'Turn whole websites into clean text.', args: ['-y', 'firecrawl-mcp'], env: [['FIRECRAWL_API_KEY', 'Firecrawl API key']], keyUrl: 'https://www.firecrawl.dev/app/api-keys' },
  { key: 'notion', domain: 'notion.so', name: 'Notion', icon: '📝', desc: 'Read and write pages in your Notion.', args: ['-y', '@notionhq/notion-mcp-server'], env: [['NOTION_TOKEN', 'Notion integration token']], keyUrl: 'https://www.notion.so/profile/integrations' },
  { key: 'context7', domain: 'context7.com', name: 'Context7', icon: '📚', desc: 'Up-to-date docs for code libraries.', args: ['-y', '@upstash/context7-mcp'], env: [] },
  { key: 'memory', domain: 'modelcontextprotocol.io', name: 'Knowledge memory', icon: '🧠', desc: 'A shared knowledge graph all bots can use.', args: ['-y', '@modelcontextprotocol/server-memory'], env: [] },
  { key: 'thinking', domain: 'modelcontextprotocol.io', name: 'Step-by-step thinking', icon: '🪜', desc: 'Helps bots reason through hard problems.', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'], env: [] },
];

function renderSettings() {
  const keepScroll = $('#set-page')?.scrollTop || 0;
  const sameTab = renderSettings.lastTab === settingsTab;
  renderSettings.lastTab = settingsTab;
  const SUB = { tools: ['puzzle', 'Skills', 'What your bots can do'], passwords: ['key', 'Passwords & cards', 'Logins and cards your bots use'], notify: ['bell', 'Notifications', 'When a bot finishes'], voice: ['mic', 'Voice', 'Microphone, language and names'], phone: ['phone', 'Phone', 'Use Wayzerr on your phone'], browser: ['globe', 'Browser & apps', 'Browser or app connection, links, website data'], computer: ['monitor', 'Computer', 'Which computer bots use: theirs or yours'] };
  const tabs = [
    ['general', 'gear', 'General', 'You, skills, passwords, phone…'],
    ['connectors', 'plug', 'AI & apps', 'ChatGPT, Claude, Gmail…'],
    ['help', 'help', 'Help', 'Tour, questions, your guide'],
  ];
  const navOn = SUB[settingsTab] ? 'general' : settingsTab;
  $('#main').innerHTML = `
    <div class="chat-head"><div class="head-fade"></div><div class="head-right">${guideBtnHtml()}<button class="icon-btn" id="pg-close" title="Close">${icon('x')}</button></div></div>
    <div class="settings">
      <nav class="set-nav">
        <div class="set-title">Settings</div>
        <div class="set-search">${icon('search')}<input id="set-q" placeholder="Search settings" autocomplete="off" spellcheck="false" value="${esc(renderSettings.q || '')}"></div>
        ${tabs.map(([k, ic, l, d]) => `<button class="set-tab${navOn === k ? ' on' : ''}" data-tab="${k}">${icon(ic)}<span class="st-l"><b>${l}</b><small>${d}</small></span></button>`).join('')}
      </nav>
      <div class="page" id="set-page"><div class="page-inner">${SUB[settingsTab] ? `<button class="set-back" id="set-back">${icon('back')}General</button>` : ''}<div id="set-body"></div></div></div>
    </div>`;
  $('#pg-close').onclick = () => go('chat');
  $$('.set-tab').forEach((b) => (b.onclick = () => { renderSettings.q = ''; settingsTab = b.dataset.tab; renderSettings(); }));
  $('#set-back')?.addEventListener('click', () => { settingsTab = 'general'; renderSettings(); });
  renderSettings.SUB = SUB;
  wireSettingsSearch();
  if (renderSettings.q) return drawSettingsResults(renderSettings.q);
  ({ general: tabGeneral, connectors: tabConnectors, tools: tabConnectors, passwords: tabPasswords, notify: tabNotify, voice: tabVoice, phone: tabPhone, browser: tabBrowser, computer: tabComputer, help: tabHelp })[settingsTab]();
  if (sameTab && keepScroll) { const pg = $('#set-page'); pg.style.animation = 'none'; pg.scrollTop = keepScroll; }
}

// ----- search in settings -----
const SETTINGS_INDEX = [
  ['Which computer bots use', 'computer mac my computer bot computer own linux control screen click type name rename use', 'computer', 'Which computer do bots use?'],
  ['Delete account', 'delete account erase remove everything data reset start over wipe', 'general', 'Delete account'],
  ['Help, tour and questions', 'help tour tutorial guide questions faq ask how to use replay show me around', 'help'],
  ['Your guide: change its look and name', 'guide tutorial bot look skin name customise customize accessory', 'help'],
  ['Your name', 'name profile what bots call me', 'general'],
  ['Default AI', 'model default ai brain which ai', 'general'],
  ['Language', 'language reply answer english spanish español catalan idioma russian', 'general'],
  ['Appearance', 'dark light mode theme appearance colour color night', 'general'],
  ['Updates', 'update version check restart new', 'general', 'Wayzerr'],
  ['Install an update from a file', 'dmg file update install manual', 'general', 'Install an update'],
  ['Skills', 'skills tools abilities what bots can do', 'tools'],
  ['Passwords & accounts', 'password account login sign in google account school', 'passwords', 'Saved accounts'],
  ['Payment cards', 'card cards payment pay visa buy', 'passwords', 'Cards'],
  ['Notifications', 'notification notify alert done finished', 'notify'],
  ['Voice: microphone, language and names', 'voice microphone mic speech text talk dictate whisper language accent names words input device level', 'voice'],
  ['Phone', 'phone iphone mobile qr connect', 'phone'],
  ['Save usage: low, balanced or max', 'usage tokens limit cost cheap save plan credits low balanced max', 'general', 'AI usage'],
  ['Show tokens used per chat', 'tokens show hide usage numbers credits chat size per reply counter', 'general', 'Show tokens used per chat'],
  ['Your apps: connections or browser', 'connection connections browser apps slides gmail classroom use my apps', 'general', 'Your apps'],
  ['Opening links in chats', 'links open browser', 'browser', 'Opening links'],
  ['Sign out of all sites', 'cookies clear browser data sign out', 'browser', 'Sign out of all sites'],
  ['Text size', 'text size bigger larger font zoom read easier big letters accessibility eyes', 'general'],
  ['Privacy', 'privacy data private where information goes stored computer tracking telemetry logos pictures free service google composio duckduckgo', 'general', 'Privacy'],
  ['Credits used', 'credits usage used how much tokens messages cost spend spent limit quota plan cloud count', 'connectors', null, 'cloud'],
  ['API keys', 'api key openai anthropic claude gemini grok xai openrouter groq mistral deepseek', 'connectors', null, 'api'],
  ['Sign in with ChatGPT, Claude, Gemini…', 'sign in account chatgpt claude gemini cursor copilot amp augment plan cloud', 'connectors', null, 'cloud'],
  ['Any cloud server', 'server custom openai compatible company', 'connectors', 'Any cloud server', 'cloud'],
  ['Your apps (Gmail, Classroom, Slides…)', 'apps connectors gmail classroom drive docs slides sheets calendar slack notion whatsapp instagram linkedin outlook github connection browser switch', 'connectors', null, 'conn'],
];
const SEARCH_STOP = new Set(['the', 'a', 'an', 'my', 'to', 'how', 'do', 'i', 'change', 'set', 'turn', 'on', 'off', 'of', 'for', 'and', 'in', 'is', 'can', 'where', 'what']);
function editDist1(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, diff = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++diff > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return diff + (a.length - i) + (b.length - j) <= 1;
}
function searchSettings(q) {
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const split = (s) => s.split(/[^a-z0-9Ѐ-ӿ]+/).filter(Boolean);
  let words = split(norm(q));
  const kept = words.filter((w) => !SEARCH_STOP.has(w));
  if (kept.length) words = kept;
  if (!words.length) return [];
  return SETTINGS_INDEX.map((it) => {
    const title = norm(it[0]), kw = norm(it[1]), toks = split(kw), tt = split(title);
    let score = 0, hits = 0;
    for (const w of words) {
      let s = 0;
      if (tt.includes(w)) s = 6;
      else if (tt.some((t) => t.startsWith(w))) s = 5;
      else if (title.includes(w)) s = 4;
      else if (toks.includes(w)) s = 3;
      else if (toks.some((t) => t.startsWith(w))) s = 2.5;
      else if (w.length > 2 && kw.includes(w)) s = 1.5;
      else if (w.length > 3 && [...tt, ...toks].some((t) => editDist1(w, t))) s = 1;
      if (s) { hits++; score += s; }
    }
    if (words.length > 1 && hits === words.length) score += 3;
    return { it, score, hits };
  }).filter((x) => x.hits > 0).sort((a, b) => b.score - a.score).map((x) => x.it);
}
function settingsWhere(it) {
  return { general: 'General', tools: 'General → Skills', passwords: 'General → Passwords & cards', notify: 'General → Notifications', phone: 'General → Phone', browser: 'General → Browser & apps', connectors: 'AI & apps' + (it[4] ? ' → ' + { api: 'API', cloud: 'Cloud', conn: 'Connectors' }[it[4]] : '') }[it[2]];
}
function drawSettingsResults(q) {
  const list = searchSettings(q);
  drawSettingsResults.list = list; drawSettingsResults.sel = 0;
  const tips = ['dark mode', 'update', 'password', 'Gmail', 'API key', 'phone'];
  $('#set-body').innerHTML = `<h1>Search</h1>${list.length ? `<p class="hint">${list.length} result${list.length > 1 ? 's' : ''} · ↑ ↓ to move, Enter to open, Esc to clear</p><div class="card simple set-links">${list.map((it, i) => `<button class="card-row set-link${i === 0 ? ' sel' : ''}" data-res="${i}"><span class="sl-ic">${icon('search')}</span><div class="grow"><div class="nm">${esc(it[0])}</div><div class="ds">${esc(settingsWhere(it))}</div></div><span class="sl-go">›</span></button>`).join('')}</div>` : `<p class="lead">Nothing found for “${esc(q)}”. Try one of these:</p><div class="row-flex" style="gap:8px;flex-wrap:wrap">${tips.map((t) => `<button class="btn" data-tip="${esc(t)}">${esc(t)}</button>`).join('')}</div>`}`;
  $$('[data-res]').forEach((b) => (b.onclick = () => openSettingsItem(list[+b.dataset.res])));
  $$('[data-tip]').forEach((b) => (b.onclick = () => { const qi = $('#set-q'); qi.value = b.dataset.tip; renderSettings.q = b.dataset.tip; drawSettingsResults(b.dataset.tip); qi.focus(); }));
}
function moveSettingsSel(d) {
  const btns = $$('[data-res]'); if (!btns.length) return;
  drawSettingsResults.sel = (drawSettingsResults.sel + d + btns.length) % btns.length;
  btns.forEach((b, i) => b.classList.toggle('sel', i === drawSettingsResults.sel));
  btns[drawSettingsResults.sel].scrollIntoView({ block: 'nearest' });
}
function openSettingsItem(it) {
  renderSettings.q = '';
  settingsTab = it[2];
  if (it[4]) connTab = it[4];
  renderSettings();
  const label = (it[3] || it[0]).toLowerCase();
  setTimeout(() => {
    const el = [...document.querySelectorAll('#set-body .nm, #set-body h1, #set-body h2, #set-body .section-title, #set-body summary, #set-body .at-nm, #set-body .us-title, #set-body .cloud-card .nm')].find((x) => x.textContent.trim().toLowerCase().startsWith(label));
    if (!el) return;
    el.closest('details')?.setAttribute('open', '');
    const row = el.closest('.card-row, .card, .cloud-card, details, .app-cell') || el;
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    row.classList.add('found'); setTimeout(() => row.classList.remove('found'), 1800);
  }, 80);
}
function wireSettingsSearch() {
  const q = $('#set-q'); if (!q) return;
  if (renderSettings.q) { q.focus(); q.setSelectionRange(q.value.length, q.value.length); }
  q.oninput = () => {
    renderSettings.q = q.value.trim();
    if (renderSettings.q) drawSettingsResults(renderSettings.q);
    else { renderSettings(); $('#set-q')?.focus(); }
  };
  q.onkeydown = (e) => {
    if (e.key === 'Escape') { q.value = ''; const had = renderSettings.q; renderSettings.q = ''; if (had) { renderSettings(); $('#set-q')?.focus(); } else q.blur(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); moveSettingsSel(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); moveSettingsSel(-1); }
    else if (e.key === 'Enter') { const it = (drawSettingsResults.list || [])[drawSettingsResults.sel || 0]; if (it) openSettingsItem(it); }
  };
}

function modelOptions(sel) {
  return S.providers.map((p) => `<optgroup label="${esc(p.name)}">${p.models.map((m) => `<option value="${p.id}|${esc(m.id)}" ${sel && sel.providerId === p.id && sel.model === m.id ? 'selected' : ''}>${esc(m.name || m.id)}</option>`).join('')}</optgroup>`).join('');
}

const LANGS = [['auto', 'Same as my message'], ['English', 'English'], ['Español', 'Español'], ['Català', 'Català'], ['Русский', 'Русский'], ['Français', 'Français'], ['Deutsch', 'Deutsch'], ['Italiano', 'Italiano'], ['Português', 'Português'], ['Nederlands', 'Nederlands'], ['Polski', 'Polski'], ['Українська', 'Українська'], ['Türkçe', 'Türkçe'], ['العربية', 'العربية'], ['中文', '中文'], ['日本語', '日本語'], ['한국어', '한국어']];
function tabGeneral() {
  const up = updateInfo?.update;
  $('#set-body').innerHTML = `
    <h1>General</h1>
    <div class="card simple">
      <div class="card-row"><div class="grow"><div class="nm">Account</div><div class="ds">Signed in as <b style="color:var(--text)">${esc((S.account && S.account.email) || '')}</b></div></div><button class="btn" id="acct-out">Sign out</button></div>
      <div class="card-row"><div class="grow"><div class="nm">Your name</div><div class="ds">What your bots call you.</div></div><input id="st-name" class="mid" value="${esc(S.settings.userName)}" placeholder="Your name" /></div>
      <div class="card-row"><div class="grow"><div class="nm">Default AI</div><div class="ds">For bots without their own AI picked.</div></div><select id="st-default" class="mid">${modelOptions(S.settings.defaultModel)}</select></div>
      <div class="card-row"><div class="grow"><div class="nm">Language</div><div class="ds">What language your bots answer in. (Wayzerr's own menus are in English.)</div></div><select id="st-lang" class="mid">${LANGS.map(([v, l]) => `<option value="${v}" ${(S.settings.replyLanguage || 'auto') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="card-row"><div class="grow"><div class="nm">Wayzerr ${esc(S.version)}</div><div class="ds" id="up-status">${up ? `Version ${esc(up.version)} is ready.` : 'Updates install by themselves when you restart.'}</div></div>
        ${up ? '<button class="btn primary" id="up-install">Restart to update</button>' : '<button class="btn" id="up-check">Check for updates</button>'}</div>
      <div class="card-row"><div class="grow"><div class="nm">Preview the update alert <span class="tmp-tag">Temporary</span></div><div class="ds">Plays how the update alert looks. Nothing is installed.</div></div><button class="btn" id="up-preview">Play</button></div>
    </div>
    <div class="card simple">
      <div class="card-row"><div class="grow"><div class="nm">AI usage</div><div class="ds" id="usage-ds">${USAGE_DS[S.settings.usageMode || 'balanced']}</div></div>
        <div class="seg" id="gen-usage">${[['low', 'Low'], ['balanced', 'Balanced'], ['max', 'Max']].map(([v, l]) => `<button data-v="${v}" class="${(S.settings.usageMode || 'balanced') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
      <div class="card-row"><div class="grow"><div class="nm">Show tokens used per chat</div><div class="ds">Shows each reply’s tokens and the chat’s size. New replies only; off hides them everywhere.</div></div>
        <label class="switch"><input type="checkbox" id="st-showtokens" aria-label="Show tokens used per chat" ${S.settings.showTokens === true ? 'checked' : ''}><span></span></label></div>
      <div class="card-row"><div class="grow"><div class="nm">Your apps</div><div class="ds">How bots use Gmail, Classroom, Slides, Drive and your other apps. You can always tell a bot otherwise in a chat (“use your browser”).</div></div>
        <div class="seg" id="gen-apps-via">${[['connector', 'Connections'], ['browser', 'Browser']].map(([v, l]) => `<button data-v="${v}" class="${(S.settings.appsVia || 'connector') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    </div>
    <div class="card simple">
      <div class="card-row"><div class="grow"><div class="nm">Text size</div><div class="ds">${MOD} and + / − do the same.</div></div>
        <div class="seg" id="st-textsize">${TEXT_SIZES.map(([name], i) => `<button data-i="${i}" title="${name}" class="${textSizeIndex() === i ? 'on' : ''}">${['XS', 'S', 'M', 'L', 'XL'][i]}</button>`).join('')}</div></div>
      <div class="card-row"><div class="grow"><div class="nm">Appearance</div><div class="ds">Light, dark, or the same as your computer.</div></div>
        <div class="seg" id="st-theme">${[['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button data-theme="${v}" class="${(S.settings.theme || 'system') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    </div>
    <div class="section-title sm">Privacy</div>
    <div class="card simple" id="privacy-card">
      <div class="card-row"><div class="grow"><div class="nm">Where your information goes</div>
        <div class="ds">Chats, memories and logins stay on this computer (logins are encrypted). Your Wayzerr account is only your email address, and there are no usage statistics. Messages go to the AI you picked; connected apps go through Composio; web search uses DuckDuckGo.</div></div></div>
      <div class="card-row"><div class="grow"><div class="nm">Free picture service</div><div class="ds">With no picture AI connected, bots use a free online service. It receives your picture description.</div></div>
        <label class="switch"><input type="checkbox" id="pv-free" ${S.settings.freeImages !== false ? 'checked' : ''}><span></span></label></div>
      <div class="card-row"><div class="grow"><div class="nm">Download logos online</div><div class="ds">Logos come from Google’s icon service, which sees the site names. Off shows letters.</div></div>
        <label class="switch"><input type="checkbox" id="pv-icons" ${S.settings.onlineIcons !== false ? 'checked' : ''}><span></span></label></div>
    </div>
    <div class="card simple"><div class="card-row"><div class="grow"><div class="nm">Legal</div><div class="ds">${legalLinks()}</div></div></div></div>
    <div class="section-title sm">Account</div>
    <div class="card simple" id="account-card">
      <div class="card-row"><div class="grow"><div class="nm">Delete account</div><div class="ds">Erases all your bots, chats, saved logins and keys from this computer.</div></div><button class="btn danger" id="st-delete" type="button">Delete…</button></div>
    </div>
    <div class="card simple set-links">
      ${Object.entries(renderSettings.SUB || {}).map(([k, [ic, l, d]]) => `<button class="card-row set-link" data-sub="${k}"><span class="sl-ic">${icon(ic)}</span><div class="grow"><div class="nm">${l}</div><div class="ds">${d}</div></div><span class="sl-go">›</span></button>`).join('')}
    </div>
    <details class="adv"><summary>Advanced</summary>
      <div class="card">
        <div class="card-row"><div class="grow"><div class="nm">Install an update from a file</div><div class="ds">Pick a Wayzerr ${INSTALLER_EXT} you downloaded.</div></div><button class="btn" id="up-file">${icon('download')}Choose file…</button></div>
        ${updateInfo?.downloadsBlocked ? `<div class="hint">Your computer isn’t letting Wayzerr look in Downloads, so use Choose file… and pick the ${INSTALLER_EXT}.</div>` : ''}
        <div id="pub-box"></div>
        <label class="f">Update server</label>
        <input id="up-feed" placeholder="https://…/latest.json" value="${esc(S.updateFeed)}" />
        <div class="kbd-list" style="margin-top:14px"><span><kbd>${MOD}</kbd><kbd>K</kbd> Search bots and messages</span><span><kbd>${MOD}</kbd><kbd>N</kbd> New chat</span><span><kbd>${MOD}</kbd><kbd>1</kbd>–<kbd>9</kbd> Jump to a bot</span><span><kbd>${MOD}</kbd><kbd>,</kbd> Settings</span><span><kbd>${MOD}</kbd><kbd>F</kbd> Search settings</span><span><kbd>⇧</kbd><kbd>↵</kbd> New line</span><span><kbd>↑</kbd> Bring back your last message</span></div>
      </div>
    </details>`;
  $$('.set-link').forEach((b) => (b.onclick = () => { settingsTab = b.dataset.sub; renderSettings(); }));
  $('#st-showtokens').onchange = async (e) => { S = await api.saveProfile({ showTokens: e.target.checked }); render(); toast(e.target.checked ? 'Token numbers are shown on new replies' : 'Token numbers are hidden in every chat'); };
  const so = $('#acct-out'); if (so) so.onclick = async () => { if (!confirm('Sign out of Wayzerr? Your bots and chats stay on this computer.')) return; try { S = await api.accountLogout(); render(); } catch (e) { toast(e.message, true); } };
  $$('#gen-usage button').forEach((b) => (b.onclick = async () => { S = await api.setUsageMode(b.dataset.v); $$('#gen-usage button').forEach((x) => x.classList.toggle('on', x === b)); $('#usage-ds').textContent = USAGE_DS[b.dataset.v]; toast({ low: 'Bots will use as little of your AI plan as they can', balanced: 'Bots will save usage without cutting quality', max: 'Bots will always send everything (uses the most)' }[b.dataset.v]); }));
  $$('#gen-apps-via button').forEach((b) => (b.onclick = async () => { S = await api.setAppsVia(b.dataset.v); $$('#gen-apps-via button').forEach((x) => x.classList.toggle('on', x === b)); toast(b.dataset.v === 'browser' ? 'Bots will use your apps in their browser' : 'Bots will always use your app connections'); }));
  $$('#st-theme button').forEach((b) => (b.onclick = async () => { S = await api.setTheme(b.dataset.theme); applyTheme(); $$('#st-theme button').forEach((x) => x.classList.toggle('on', x === b)); }));
  const saveName = async () => { const v = $('#st-name').value.trim(); if (v === (S.settings.userName || '')) return; await run(() => api.saveProfile({ userName: v })); updateMe(); toast('Saved'); };
  wireTextSize($('#set-body'));
  $$('#st-textsize button').forEach((b) => (b.onclick = () => {
    const f = TEXT_SIZES[+b.dataset.i][1];
    savePref('textSize2', f); api.setZoom?.(f * TEXT_BASE);
    $$('#st-textsize button').forEach((x) => x.classList.toggle('on', x === b));
  }));
  $('#pv-free').onchange = async (e) => { S = await api.saveProfile({ freeImages: e.target.checked }); toast(e.target.checked ? 'Free picture service is on' : 'Picture descriptions now stay on your connected AI only'); };
  $('#st-delete').onclick = () => openDeleteAccount();
  $('#pv-icons').onchange = async (e) => { S = await api.saveProfile({ onlineIcons: e.target.checked }); toast(e.target.checked ? 'Logos will be downloaded online' : 'No more logo downloads. New logos show as letters.'); };
  $('#st-name').onblur = saveName;
  $('#st-name').onkeydown = (e) => { if (e.key === 'Enter') e.target.blur(); };
  $('#up-install')?.addEventListener('click', installUpdate);
  drawPublish();
  $('#up-file').onclick = async () => { try { const r = await api.updateFromFile(); if (r) toast('Updating — Wayzerr will restart…'); } catch (e) { toast(e.message, true); } };
  $('#up-preview')?.addEventListener('click', () => playUpdateAlert());
  $('#up-check')?.addEventListener('click', async (e) => {
    e.target.disabled = true; e.target.textContent = 'Checking…';
    try {
      updateInfo = await api.updateCheck();
      showUpdatePill();
      if (updateInfo.update) renderSettings();
      else { $('#up-status').textContent = "You're up to date."; e.target.disabled = false; e.target.textContent = 'Check for updates'; }
    } catch (err) { toast(err.message, true); e.target.disabled = false; e.target.textContent = 'Check for updates'; }
  });
  $('#up-feed').onchange = async (e) => { await run(() => api.updateFeed(e.target.value)); toast('Saved'); };
  $('#st-lang').onchange = async (e) => { S = await api.saveProfile({ replyLanguage: e.target.value }); toast(e.target.value === 'auto' ? 'Bots answer in the language you write in' : `Bots will answer in ${e.target.value}`); };
  $('#st-default').onchange = (e) => { const [providerId, ...m] = e.target.value.split('|'); run(() => api.setDefaultModel({ providerId, model: m.join('|') })); toast('Default AI updated'); };
}

const POPULAR_NAME = { gmail: 'Gmail', googleclassroom: 'Google Classroom', googlecalendar: 'Google Calendar', googledrive: 'Google Drive', googlesheets: 'Google Sheets', googledocs: 'Google Docs', slack: 'Slack', notion: 'Notion', whatsapp: 'WhatsApp', instagram: 'Instagram', linkedin: 'LinkedIn', outlook: 'Outlook', github: 'GitHub', teams: 'Microsoft Teams', microsoftteams: 'Microsoft Teams' };
function tabConnectors() {
  const c = S.connectors;
  const tabs = [['api', 'key', 'API'], ['cloud', 'cloud', 'Cloud'], ['conn', 'connectors', 'Connectors']];
  const toolsPage = settingsTab === 'tools';
  if (!toolsPage && !tabs.some((t) => t[0] === connTab)) connTab = 'api';
  const addedTypes = new Set(S.providers.map((p) => p.type));
  const bodies = {
    api: `
      <p class="hint sec-hint">Connect an AI with an API key. You pay the provider for what you use. Pick a model per bot from the menu next to the send button.</p>
      <div class="plist">
      ${S.providers.filter((p) => !p.account).map((p) => `
        <div class="prow">
          ${logoFor(p.type, 'md')}
          <div class="grow"><div class="nm">${esc(p.name)}${S.settings.defaultModel?.providerId === p.id ? '<span class="chip">Default</span>' : ''}</div>
            <div class="ds">${p.hasKey ? esc(p.keyPreview) + ' · ' : ''}${p.models.length} model${p.models.length === 1 ? '' : 's'}${useOf(S.usage, p.id).n ? ` · ${fmtN(useOf(S.usage, p.id).n)} requests this month${useOf(S.usage, p.id).tokens ? ` · ${useOf(S.usage, p.id).est ? '~' : ''}${fmtN(useOf(S.usage, p.id).tokens)} tokens` : ''}` : ''}</div>
            ${p.type === 'openrouter' ? `<div class="us-credit" data-credit="${p.id}">Checking your credit…</div>` : ''}</div>
          <span class="status ok">●</span>
          <button class="icon-btn" data-prov-menu="${p.id}" title="More">${icon('more')}</button>
        </div>`).join('') || '<div class="empty-mini">No API key added yet — pick a provider below.</div>'}
      </div>
      <div class="section-title sm">Add a provider</div>
      <div class="ptiles">
        ${Object.entries(S.providerTypes).filter(([t, x]) => !x.account && (!addedTypes.has(t) || t === 'custom')).map(([t, x]) => `<button class="ptile" data-add-type="${t}">${logoFor(t, 'lg')}<span class="at-text"><span class="at-nm">${esc(x.name.replace(/ \(.*\)/, ''))}${x.local ? ' <em>Local</em>' : ''}</span><span class="at-ds">${esc(x.sub)}</span></span><span class="at-go">Connect</span></button>`).join('')}
      </div>`,
    apps: `
      <p class="hint sec-hint">Use your bots from other AI apps. Connect adds Wayzerr to that app in one click — then quit and reopen the app. Bots and chats still show up here.</p>
      <div id="apps-grid" class="agrid"><div class="hint">Loading…</div></div>
      <div class="card" id="mcp-card" style="margin-top:14px"><div class="hint">Loading…</div></div>`,
    cloud: `
      <p class="hint sec-hint">Sign in with the AI plan you already pay for — no API key. Your bots then think with Claude, ChatGPT, Gemini, Cursor, Copilot and more.</p>
      <div class="cloud-grid">
        ${Object.entries(S.providerTypes).filter(([, x]) => x.account).map(([t, x]) => {
          const p = S.providers.find((y) => y.type === t);
          return `<div class="cloud-card ${p ? 'ok' : ''}" data-cloud="${t}">
            <div class="cloud-top">${logoFor(t, 'lg')}<div class="grow"><div class="nm">${esc(x.name)}</div><div class="ds">${p ? '<span class="status ok">● Signed in</span> · ' + esc(p.keyPreview) : esc(x.sub)}</div></div></div>
            ${p ? `<div class="ds cloud-models">${p.models.length} model${p.models.length === 1 ? '' : 's'} · ${esc(p.models.slice(0, 3).map((m) => m.name).join(', '))}${p.models.length > 3 ? '…' : ''}</div>
              <div class="cloud-actions"><button class="btn sm" data-cloud-usage="${p.id}">${icon('chart')}Usage</button><button class="btn sm" data-cloud-refresh="${p.id}">Refresh</button><button class="btn sm danger" data-cloud-del="${p.id}">Sign out of Wayzerr</button></div>`
            : `<button class="si-btn" data-cloud-go="${t}">${icon('login')}Sign in to ${esc(x.name)}</button><div class="cloud-flow" id="cf-${t}"></div>`}
          </div>`;
        }).join('')}
        ${S.providers.filter((p) => p.type === 'custom').map((p) => `<div class="cloud-card ok">
            <div class="cloud-top"><span class="srv-ic">${icon('cloud')}</span><div class="grow"><div class="nm">${esc(p.name)}</div><div class="ds"><span class="status ok">● Connected</span> · ${esc(p.baseUrl.replace(/^https?:\/\//, ''))}</div></div></div>
            <div class="ds cloud-models">${p.models.length} model${p.models.length === 1 ? '' : 's'} · ${esc(p.models.slice(0, 3).map((m) => m.name || m.id).join(', '))}${p.models.length > 3 ? '…' : ''}</div>
            <div class="cloud-actions"><button class="btn sm" data-cloud-usage="${p.id}">${icon('chart')}Usage</button><button class="btn sm" data-cloud-refresh="${p.id}">Refresh</button><button class="btn sm danger" data-cloud-del="${p.id}">Remove</button></div>
          </div>`).join('')}
        <div class="cloud-card srv-add">
          <div class="cloud-top"><span class="srv-ic">${icon('cloud')}</span><div class="grow"><div class="nm">Any cloud server</div><div class="ds">Your company's AI, a server you rent, Together, Fireworks, vLLM, LiteLLM… anything that talks like OpenAI.</div></div></div>
          <button class="si-btn" id="srv-add">${icon('plus')}Connect a server</button>
        </div>
      </div>`,
    conn: `
    ${composioCard()}
    ${(S.appsDeclined || []).length ? `<div class="card" style="margin-top:14px"><h2>Apps your bots won't ask about</h2><div class="hint" style="margin:2px 0 8px">You said these can't be connected (for example a school account). Bots use the browser for them instead.</div>
      ${S.appsDeclined.map((slug) => `<div class="card-row">${siteLogo(appDomain(slug), 'md', slug)}<div class="grow"><div class="nm">${esc(POPULAR_NAME[slug] || slug)}</div></div><button class="btn sm" data-undecline="${esc(slug)}">Ask again</button></div>`).join('')}</div>` : ''}
`,
    more: `
    <div class="section-title sm">More connectors</div>
    <p class="hint sec-hint">One click to connect — Wayzerr downloads what it needs by itself. Some services just need you to paste a key.</p>
    <div class="cgrid">
      ${PRESETS.map((pr) => {
        const srv = S.customServers.find((x) => x.preset === pr.key || (!x.preset && x.name === pr.name));
        const st = srv ? (!srv.enabled ? 'off' : srv.status.connected ? 'ok' : srv.status.error ? 'bad' : 'wait') : 'none';
        return `<div class="ccard ${st}" data-card="${pr.key}">
          <div class="ccard-top">${siteLogo(pr.domain, 'md', pr.name)}<div class="grow"><div class="g-nm">${esc(pr.name)}</div><div class="g-ds">${esc(pr.desc)}</div></div></div>
          ${st === 'none' ? `
            ${pr.env.map(([k, label]) => `<input type="password" class="ckey" data-env="${k}" placeholder="${esc(label)}" autocomplete="off" />`).join('')}
            <div class="ccard-actions">${pr.keyUrl ? `<a href="${pr.keyUrl}" target="_blank">Get key ↗</a>` : '<span class="muted">No key needed</span>'}<button class="btn sm primary" data-connect="${pr.key}">Connect</button></div>`
          : `<div class="ccard-actions">
              ${st === 'ok' ? `<span class="status ok">● Connected · ${srv.status.tools.length} tools</span>` : st === 'wait' ? '<span class="status shimmer">Connecting…</span>' : st === 'off' ? '<span class="status">Paused</span>' : `<span class="status bad" title="${esc(srv.status.error)}">Couldn’t connect</span>`}
              <span style="flex:1"></span>
              ${st === 'bad' ? `<button class="btn sm" data-retry="${srv.id}">Retry</button>` : ''}
              ${pr.env.length ? `<button class="btn sm" data-srv-edit="${srv.id}">Key</button>` : ''}
              <button class="btn sm" data-srv-del="${srv.id}">Disconnect</button>
            </div>`}
        </div>`;
      }).join('')}
      <div class="ccard"><div class="ccard-top"><span class="tile-ic">${icon('globe')}</span><div class="grow"><div class="g-nm">Online MCP server</div><div class="g-ds">Paste a server link and API key.</div></div></div><div class="ccard-actions"><span style="flex:1"></span><button class="btn sm" data-custom="url">Add</button></div></div>
      <div class="ccard"><div class="ccard-top"><span class="tile-ic">${icon('puzzle')}</span><div class="grow"><div class="g-nm">Any MCP server</div><div class="g-ds">Paste an “npx …” command.</div></div></div><div class="ccard-actions"><span style="flex:1"></span><button class="btn sm" data-custom="cmd">Add</button></div></div>
      <div class="ccard feature"><div class="ccard-top"><span class="tile-ic">${icon('download')}</span><div class="grow"><div class="g-nm">Browse all connectors</div><div class="g-ds">Search thousands of connectors and add them in one click.</div></div></div><div class="ccard-actions"><span style="flex:1"></span><button class="btn sm primary" id="open-registry">Browse</button></div></div>
    </div>
    ${S.customServers.filter((x) => !x.composio && !PRESETS.some((pr) => x.preset === pr.key || (!x.preset && x.name === pr.name))).map((s) => `
      <div class="card">
        <div class="card-row">
          <div class="ic">${s.logo ? siteLogo(s.logo, 'lg', s.name) : icon(s.url ? 'globe' : 'puzzle')}</div>
          <div class="grow"><div class="nm">${esc(s.name)}</div><div class="ds">${esc(s.url || (s.command + ' ' + (s.args || []).join(' ')))}</div></div>
          <label class="toggle"><input type="checkbox" data-srv-toggle="${s.id}" ${s.enabled ? 'checked' : ''}><span></span></label>
        </div>
        <div class="card-extra">
          ${!s.enabled ? '<span class="status">Off</span>' : s.status.connected ? `<span class="status ok">Connected · ${s.status.tools.length} tools</span>` : s.status.error ? `<span class="status bad" title="${esc(s.status.error)}">${esc(s.status.error.slice(0, 70))}</span>` : '<span class="status">Connecting…</span>'}
          <span style="flex:1"></span>${permSelect('custom:' + s.id, s.permission)}
          <button class="btn sm" data-srv-edit="${s.id}">Settings</button>
          <button class="btn sm danger" data-srv-del="${s.id}">Remove</button>
        </div>
      </div>`).join('')}`,
    builtin: `
    <p class="hint sec-hint">Tools built into Wayzerr. Each asks once — choose <strong>Always allow</strong> and it won't ask again.</p>
    <div class="plist">
    ${Object.entries(c).map(([k, m]) => `
      <div class="prow col">
        <div class="prow-top">
          <div class="ic">${icon(BUILTIN_ICON[k] || 'plug')}</div>
          <div class="grow"><div class="nm">${esc(m.name)}</div><div class="ds">${esc(m.description)}</div></div>
          <label class="toggle"><input type="checkbox" data-toggle="${k}" ${m.enabled ? 'checked' : ''}><span></span></label>
        </div>
        ${m.enabled || k === 'files' ? `<div class="prow-extra">
          ${k === 'files' ? `<span>One folder shared by all your bots: <strong style="color:var(--text)">Wayzerr Files</strong> (in your home folder)</span><button class="btn sm" id="choose-folder">Open</button>` : ''}
          <span style="flex:1"></span>${m.enabled ? permSelect(k, m.permission) : ''}
        </div>` : ''}
      </div>`).join('')}
    </div>
    <div class="section-title sm">Skills</div>
    <p class="hint sec-hint">Expert instructions your bots load when a task needs them. Add any skill with the same command other AI apps use.</p>
    <div class="plist" id="skills-box"><div class="empty-mini">Loading…</div></div>
    <div class="skill-add"><input id="sk-cmd" placeholder="npx skills add owner/repo --skill name" autocomplete="off"><button class="btn primary" id="sk-add">Add skill</button></div>
    </div>`,
  };
  if (toolsPage) {
    const PLAIN = { browser: 'Open websites, click and type for you', logins: 'Sign in with your saved logins and pay with your cards', files: 'Read and save files in one folder all your bots share' };
    $('#set-body').innerHTML = `<h1>Skills</h1>
      <p class="lead">What your bots know how to do.</p>
      <div class="card simple">
        <div class="card-row"><div class="grow"><div class="nm">Teach a new skill</div><div class="ds">Open a bot's screen, go full screen and click <b>Teach a skill</b>. Do the task once and your bots can repeat it.</div></div></div>
      </div>
      <div class="section-title sm">Your skills</div>
      <div class="plist" id="skills-box"><div class="empty-mini">Loading…</div></div>
      <div class="section-title sm">Your bots can</div>
      <div class="card simple">
        ${Object.entries(c).filter(([k]) => PLAIN[k]).map(([k, m]) => `<div class="card-row"><div class="ic">${icon(BUILTIN_ICON[k] || 'plug')}</div><div class="grow"><div class="nm">${esc(m.name)}</div><div class="ds">${esc(PLAIN[k] || m.description)}${k === 'files' && m.enabled ? ' · <b>Wayzerr Files</b>' : ''}</div></div>${k === 'files' && m.enabled ? `<button class="btn sm" id="choose-folder">Open folder</button>` : ''}<label class="switch"><input type="checkbox" data-toggle="${k}" ${m.enabled ? 'checked' : ''}><span></span></label></div>`).join('')}
      </div>
      <details class="adv"><summary>Advanced</summary>
        <p class="hint sec-hint">Add a skill made for other AI apps:</p>
        <div class="skill-add"><input id="sk-cmd" placeholder="npx skills add owner/repo --skill name" autocomplete="off"><button class="btn primary" id="sk-add">Add skill</button></div>
        ${bodies.more}
      </details>`;
  } else $('#set-body').innerHTML = `
    <h1>Connections</h1>
    <div class="conn-sum">
      <span class="${S.providers.some((p) => !p.account) ? 'on' : ''}"><span class="tag-api">API</span>${S.providers.filter((p) => !p.account).length ? S.providers.filter((p) => !p.account).length + ' connected' : 'Not connected'}</span>
      <span class="${S.providers.some((p) => p.account) ? 'on' : ''}"><span class="tag-acct">CLOUD</span>${S.providers.some((p) => p.account) ? esc(S.providers.filter((p) => p.account).map((p) => p.name).join(', ')) : 'Not connected'}</span>
      <span class="${composioLinked?.length ? 'on' : ''}"><span class="tag-conn">APPS</span>${composioLinked?.length ? esc(composioLinked.map(appName).join(', ')) : 'None yet'}</span>
    </div>
    <div class="seg-tabs">${tabs.map(([k, ic, label]) => `<button class="${connTab === k ? 'on' : ''}" data-ctab="${k}">${icon(ic)}${label}</button>`).join('')}</div>
    <div class="ctab-body">${bodies[connTab]}</div>`;
  $$('[data-ctab]').forEach((b) => (b.onclick = () => { connTab = b.dataset.ctab; tabConnectors(); $('#set-body').closest('.set-main, .settings, main')?.scrollTo?.(0, 0); }));
  $$('[data-ctab-go]').forEach((b) => (b.onclick = () => { connTab = b.dataset.ctabGo; tabConnectors(); }));
  $$('[data-cloud-go]').forEach((b) => (b.onclick = async () => {
    const type = b.dataset.cloudGo, box = $('#cf-' + type);
    b.classList.add('hidden');
    box.innerHTML = `<div class="si-flow"><div class="acct-step"><span class="acct-spin"></span><span id="acct-text">Getting ready…</span></div>
      <a href="#" id="acct-open" class="hidden" target="_blank">Open the sign-in page again ↗</a>
      <div class="acct-code" id="acct-code"><input placeholder="Paste the code from the sign-in page" autocomplete="off"><button class="btn sm primary">Submit</button></div>
      <div class="si-term hidden" id="si-term"><p>If the browser sign-in doesn't work, run this in Terminal, then click Check account:</p><div class="si-cmd"><code id="si-cmd-text"></code></div><button class="btn sm" id="si-check">Check account</button></div></div>`;
    $('#acct-code button', box).onclick = () => { const i = $('#acct-code input', box); if (i.value.trim()) { api.accountCode(i.value.trim()); i.value = ''; $('#acct-text', box).textContent = 'Checking the code…'; } };
    $('#si-check', box).onclick = async () => { const r = await api.accountCheck(type); if (r.loggedIn) { S = r.state; render(); } else toast('Not signed in yet.', true); };
    acctBox = box;
    try { S = await api.accountConnect(type); toast(`${S.providerTypes[type].name} connected`); render(); }
    catch (e) { if (e.message !== 'Cancelled') { const t = $('#acct-text', box); if (t) t.textContent = e.message; } b.classList.remove('hidden'); }
    finally { acctBox = null; }
  }));
  $('#srv-add')?.addEventListener('click', openServerConnect);
  hydrateCredits();
  $$('[data-cloud-usage]').forEach((b) => (b.onclick = () => {
    const p = S.providers.find((x) => x.id === b.dataset.cloudUsage);
    if (!p) return;
    modal(`<h3>${esc(p.name)} usage</h3>${usageBlock(p, p.account ? 'messages' : 'requests')}<div class="modal-actions"><button class="btn primary" data-close>Close</button></div>`, 'usage-modal');
    hydrateCredits();
  }));
  $$('[data-cloud-refresh]').forEach((b) => (b.onclick = async () => { b.disabled = true; try { await run(() => api.refreshModels(b.dataset.cloudRefresh)); toast('Updated'); } catch (_) {} b.disabled = false; }));
  $$('[data-cloud-del]').forEach((b) => (b.onclick = () => confirmBox('Sign out of Wayzerr?', 'Bots using this switch to your default model. You stay signed in to the app itself.', 'Sign out', () => run(() => api.removeProvider(b.dataset.cloudDel)))));
  if (S.composio && composioLinked === null) { composioLinked = []; api.composioApps().then((l) => { composioLinked = l; if (view === 'settings') tabConnectors(); }).catch(() => {}); }
  $$('[data-add-type]').forEach((b) => (b.onclick = () => openProviderModal(null, b.dataset.addType)));
  $$('[data-prov-menu]').forEach((b) => (b.onclick = () => {
    const p = S.providers.find((x) => x.id === b.dataset.provMenu);
    openMenu(b, [
      ['reload', 'Refresh models', async () => { try { await run(() => api.refreshModels(p.id)); toast('Model list updated'); } catch (_) {} }],
      ['star', 'Make default', async () => { const m = S.settings.defaultModel?.providerId === p.id ? S.settings.defaultModel.model : (p.models[0]?.id); if (m) { await run(() => api.setDefaultModel({ providerId: p.id, model: m })); toast(`${p.name} is now the default`); } }],
      ['key', 'Change key', () => openProviderModal(p)],
      '-',
      ['trash', 'Remove', () => confirmBox(`Remove ${p.name}?`, 'Its API key is deleted from this computer. Bots using its models switch to your default model.', 'Remove', () => run(() => api.removeProvider(p.id)))],
    ], 'down');
  }));
  $$('[data-toggle]').forEach((t) => (t.onchange = () => {
    const key = t.dataset.toggle;
    run(() => api.updateConnector({ key, patch: { enabled: t.checked } }));
  }));
  const cf = $('#choose-folder');
  if (cf) cf.onclick = () => run(() => api.openFilesFolder());
  $$('[data-perm]').forEach((sel) => (sel.onchange = () => {
    const id = sel.dataset.perm;
    if (id.startsWith('custom:')) {
      const s = S.customServers.find((x) => 'custom:' + x.id === id);
      run(() => api.saveServer({ ...stripStatus(s), permission: sel.value }));
    } else run(() => api.updateConnector({ key: id, patch: { permission: sel.value } }));
  }));
  $$('[data-srv-toggle]').forEach((t) => (t.onchange = () => {
    const s = S.customServers.find((x) => x.id === t.dataset.srvToggle);
    run(() => api.saveServer({ ...stripStatus(s), enabled: t.checked }));
  }));
  $$('[data-srv-edit]').forEach((b) => (b.onclick = () => openServerEditor(S.customServers.find((x) => x.id === b.dataset.srvEdit))));
  $$('[data-srv-del]').forEach((b) => (b.onclick = () => confirmBox('Remove this connector?', 'Its API key is deleted too.', 'Remove', () => run(() => api.deleteServer(b.dataset.srvDel)))));
  $$('[data-custom]').forEach((b) => (b.onclick = () => openServerEditor(null, b.dataset.custom)));
  const orb = $('#open-registry'); if (orb) orb.onclick = openRegistry;
  $$('[data-connect]').forEach((b) => (b.onclick = async () => {
    const pr = PRESETS.find((x) => x.key === b.dataset.connect);
    const card = b.closest('.ccard');
    const env = {};
    for (const i of $$('[data-env]', card)) {
      if (!i.value.trim()) { i.focus(); return toast(`Paste your ${pr.name} key first.`, true); }
      env[i.dataset.env] = i.value.trim();
    }
    card.classList.add('busy');
    b.disabled = true;
    b.textContent = 'Connecting…';
    card.querySelector('.ccard-actions').insertAdjacentHTML('afterbegin', '<span class="status shimmer" style="flex:1">Downloading & connecting — first time takes a moment…</span>');
    try {
      await run(() => api.saveServer({ name: pr.name, logo: pr.domain, preset: pr.key, command: 'npx', args: pr.args, env }));
      const srv = S.customServers.find((x) => x.preset === pr.key);
      toast(srv?.status.connected ? `${pr.name} connected` : `${pr.name} couldn’t connect`, !srv?.status.connected);
    } catch (_) {}
  }));
  $$('[data-retry]').forEach((b) => (b.onclick = async () => {
    b.disabled = true; b.textContent = 'Retrying…';
    const s = S.customServers.find((x) => x.id === b.dataset.retry);
    await run(() => api.saveServer({ ...stripStatus(s) })).catch(() => {});
  }));
  if (connTab === 'apps') { renderMcpCard(); renderApps(); }
  if (!toolsPage && connTab === 'conn') wireComposio();
  if (toolsPage) renderSkills();
}
let connTab = 'api';
const appName = (slug) => (COMPOSIO_APPS.find((a) => a[0] === slug) || [0, slug.replace(/^\w/, (c) => c.toUpperCase())])[1];

async function renderSkills() {
  const box = $('#skills-box');
  if (!box) return;
  const draw = (list) => {
    list = list.filter((k) => k.id !== 'composio');
    if (!list.length) { box.innerHTML = '<div class="empty-mini">No skills yet. Teach one, and it shows up here.</div>'; return; }
    box.innerHTML = list.map((k) => `<div class="prow"><div class="ic sk-ic">${icon('sparkle')}</div><div class="grow"><div class="nm">${esc(k.name)}</div><div class="ds sk-ds">${esc(k.description)}</div></div><button class="icon-btn" data-sk-del="${esc(k.id)}" title="Remove">${icon('trash')}</button></div>`).join('') || '<div class="empty-mini">No skills yet.</div>';
    $$('[data-sk-del]', box).forEach((b) => (b.onclick = () => confirmBox(`Remove the ${b.dataset.skDel} skill?`, 'Bots stop using its instructions. You can add it again any time.', 'Remove', async () => draw(await api.skillsRemove(b.dataset.skDel)))));
  };
  try { draw(await api.skillsList()); } catch (_) {}
  const add = $('#sk-add'), inp = $('#sk-cmd');
  const go = async () => {
    if (!inp.value.trim()) return inp.focus();
    add.disabled = true; add.textContent = 'Installing…';
    try { draw(await api.skillsInstall(inp.value.trim())); inp.value = ''; toast('Skill added — every bot can use it'); }
    catch (e) { toast(e.message, true); }
    add.disabled = false; add.textContent = 'Add skill';
  };
  add.onclick = go;
  inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
}

// ---------- Composio: Gmail, Calendar, Drive, Slack… through one connector ----------
const COMPOSIO_APPS = [
  ['gmail', 'Gmail', 'mail.google.com', 'Read, send and search your email'],
  ['googlecalendar', 'Google Calendar', 'calendar.google.com', 'Events, invites and free time'],
  ['googleclassroom', 'Google Classroom', 'classroom.google.com', 'Classes, assignments and due dates'],
  ['googledrive', 'Google Drive', 'drive.google.com', 'Find, read and share files'],
  ['googlesheets', 'Google Sheets', 'sheets.google.com', 'Read and update spreadsheets'],
  ['googledocs', 'Google Docs', 'docs.google.com', 'Create and edit documents'],
  ['googleslides', 'Google Slides', 'slides.google.com', 'Create and edit presentations'],
  ['slack', 'Slack', 'slack.com', 'Messages and channels'],
  ['notion', 'Notion', 'notion.so', 'Pages and databases'],
  ['whatsapp', 'WhatsApp', 'whatsapp.com', 'Send and read messages'],
  ['instagram', 'Instagram', 'instagram.com', 'Posts, comments and insights'],
  ['linkedin', 'LinkedIn', 'linkedin.com', 'Posts and your profile'],
  ['outlook', 'Outlook', 'outlook.com', 'Microsoft email and calendar'],
  ['github', 'GitHub', 'github.com', 'Repos, issues and pull requests'],
];
const appDomain = (slug) => (COMPOSIO_APPS.find((a) => a[0] === slug) || [])[2] || `${slug}.com`;
let composioLinked = null;
function composioCard() {
  if (!composioCard.asked) { composioCard.asked = true; extraIconKeys.push(...COMPOSIO_APPS.map((a) => a[2])); loadIcons(); }
  const srv = S.customServers.find((x) => x.composio);
  const bad = srv && srv.enabled && srv.status.error && !S.composioKeyNeeded;
  const keyBlock = '';
  if (S.composioKeyNeeded) return `<div class="apps-page">${keyBlock}</div>`;
  return `<div class="apps-page">${keyBlock}
    <p class="hint sec-hint">Let your bots use your apps. Sign in to an app once — the first time a bot wants to use it, it asks you. ${S.settings.appsVia === 'browser' ? 'Right now bots use your apps <b>in their browser</b>' : 'Bots always use these <b>connections</b>'} — change it in <a href="#" id="to-apps-via">Settings → General → Your apps</a>.</p>
    <div class="app-search"><span class="as-ic">${icon('search')}</span><input id="app-q" placeholder="Search 500+ apps — WhatsApp, Trello, Shopify…" autocomplete="off" spellcheck="false"><div class="as-drop hidden" id="app-drop"></div></div>
    ${bad ? `<div class="comp-err">Can't reach the apps service right now. <a href="#" id="comp-retry">Try again</a></div>` : ''}
    <div class="app-grid">${[...COMPOSIO_APPS, ...(composioLinked || []).filter((x) => !COMPOSIO_APPS.some((a) => a[0] === x)).map((x) => [x, x.replace(/^\w/, (c) => c.toUpperCase()), `${x}.com`, 'Connected app'])].map(([slug, name, dom, desc]) => {
      const linked = composioLinked?.includes(slug);
      return `<div class="app-cell">
        <button class="app-tile ${linked ? 'linked' : ''}" data-capp="${slug}">
          ${siteLogo(dom, 'lg', name)}
          <span class="at-text"><span class="at-nm">${esc(name)}</span><span class="at-ds">${esc(desc)}</span></span>
          ${linked ? `<span class="at-ok">${icon('check')}Connected</span>` : '<span class="at-go">Connect</span>'}
        </button>
      </div>`;
    }).join('')}</div>
  </div>`;
}
async function connectApp(slug, btn) {
  btn?.classList.add('busy');
  try { await api.composioLink(slug); toast('Sign in using your browser, then come back to Wayzerr'); }
  catch (e) { toast(e.message, true); }
  btn?.classList.remove('busy');
}
function wireComposio() {
  $('#comp-key-change')?.addEventListener('click', (e) => { e.preventDefault(); $('#comp-key-box')?.classList.toggle('hidden'); $('#comp-key')?.focus(); });
  const saveKey = async () => {
    const v = $('#comp-key')?.value.trim();
    if (!v) return toast('Paste your Composio API key first.', true);
    const b = $('#comp-key-save'); b.disabled = true;
    try { await run(() => api.composioConnect(v)); composioLinked = null; toast('Apps connected'); if (view === 'settings') tabConnectors(); }
    catch (_) {} finally { b.disabled = false; }
  };
  $('#comp-key-save')?.addEventListener('click', saveKey);
  $('#comp-key')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveKey(); });
  $('#comp-retry')?.addEventListener('click', async (e) => { e.preventDefault(); try { await run(() => api.composioConnect('')); } catch (_) {} });
  $$('[data-capp]').forEach((b) => (b.onclick = () => connectApp(b.dataset.capp, b)));
  $('#to-apps-via')?.addEventListener('click', (e) => { e.preventDefault(); settingsTab = 'general'; renderSettings(); });
  const q = $('#app-q'), drop = $('#app-drop');
  if (q) {
    let seq = 0, results = [], sel = 0;
    const draw = () => {
      if (!q.value.trim()) { drop.classList.add('hidden'); return; }
      drop.innerHTML = results.length ? results.map((r, i) => `<button class="as-item ${i === sel ? 'sel' : ''}" data-i="${i}">
          ${r.logo && ICONS[r.logo] ? `<img class="logo md" src="${ICONS[r.logo]}" alt="">` : siteLogo(appDomain(r.slug), 'md', r.name)}
          <span class="at-text"><span class="at-nm">${i === 0 ? '<em>Top result</em>' : ''}${esc(r.name)}${composioLinked?.includes(r.slug) ? ' <span class="status ok">✓</span>' : ''}</span><span class="at-ds">${esc(r.description || '')}</span></span>
          <span class="at-go">${composioLinked?.includes(r.slug) ? 'Connected' : 'Connect'}</span></button>`).join('')
        : '<div class="as-empty">No apps found</div>';
      drop.classList.remove('hidden');
      $$('img[data-fb]', drop).forEach((im) => (im.onerror = () => { const sp = document.createElement('span'); sp.className = 'prov-badge md b-custom'; sp.textContent = im.dataset.fb; im.replaceWith(sp); }));
      $$('.as-item', drop).forEach((b) => (b.onmousedown = (e) => { e.preventDefault(); const r = results[+b.dataset.i]; drop.classList.add('hidden'); q.value = ''; connectApp(r.slug); }));
    };
    q.oninput = async () => {
      const my = ++seq, v = q.value.trim();
      if (!v) return draw();
      const r = await api.composioSearch(v).catch(() => []);
      if (my !== seq) return;
      results = r; sel = 0;
      const doms = [...r.filter((x) => x.logo).map((x) => x.logo), ...r.map((x) => appDomain(x.slug))].filter((d) => !(d in ICONS));
      if (doms.length) { extraIconKeys.push(...doms); api.getIcons(doms).then((ic) => { Object.assign(ICONS, ic); if (my === seq) draw(); }).catch(() => {}); }
      draw();
    };
    q.onkeydown = (e) => {
      if (e.key === 'ArrowDown') { sel = Math.min(results.length - 1, sel + 1); draw(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); draw(); e.preventDefault(); }
      else if (e.key === 'Enter' && results[sel]) { const r = results[sel]; q.value = ''; drop.classList.add('hidden'); connectApp(r.slug); }
      else if (e.key === 'Escape') { q.value = ''; drop.classList.add('hidden'); }
    };
    q.onblur = () => setTimeout(() => drop.classList.add('hidden'), 120);
    q.onfocus = () => { if (q.value.trim()) draw(); };
  }
  if (composioLinked === null) { composioLinked = []; api.composioApps().then((l) => { composioLinked = l; if (view === 'settings' && connTab === 'conn') tabConnectors(); }); }
}
addEventListener('focus', () => { if (S.composio && view === 'settings' && connTab === 'conn') api.composioApps().then((l) => { if (JSON.stringify(l) !== JSON.stringify(composioLinked)) { composioLinked = l; tabConnectors(); } }).catch(() => {}); });

let appsCache = null;
const mcpApps = () => (appsCache || []).filter((a) => a.connected);
const agoText = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : Math.round(m / 60) + ' h ago'; };
function updateConnBadge() {
  const el = $('#cx');
  if (!el || !S.providers) return;
  const n = S.providers.filter((p) => !p.account).length, c = S.providers.filter((p) => p.account);
  el.innerHTML = `<i class="${n ? 'on' : ''}" title="${n ? n + ' AI connected with an API key' : 'No API key'}">API</i><i class="cld ${c.length ? 'on' : ''}" title="${c.length ? 'Signed in: ' + c.map((p) => p.name).join(', ') : 'No cloud sign-in'}">CLOUD</i>`;
}
async function renderApps() {
  if (appsCache) drawApps(appsCache);
  try { appsCache = await api.aiApps(); } catch (_) { return; }
  drawApps(appsCache);
}
function drawApps(list) {
  const g = $('#apps-grid');
  if (!g) return;
  if (!drawApps.asked) { drawApps.asked = true; extraIconKeys.push(...list.map((a) => a.domain)); loadIcons(); }
  g.innerHTML = list.map((a) => `
    <div class="acard ${a.connected ? 'ok' : ''} ${!a.installed ? 'dim' : ''}">
      <div class="acard-top">${siteLogo(a.domain, 'md', a.name)}
        <div class="grow"><div class="g-nm">${esc(a.name)}${a.connected ? ' <span class="tag-mcp">MCP</span>' : ''}</div><div class="g-ds">${a.connected ? '<span class="status ok">● Connected</span>' + (a.lastSeen ? ' · used ' + agoText(a.lastSeen) : '') : !a.supported ? 'Online connectors only' : a.installed ? 'Installed' : 'Not installed'}${a.sub ? ' · ' + esc(a.sub) : ''}</div></div>
        ${!a.installed || !a.supported ? `<a class="btn sm ghost" href="${a.download}" target="_blank">${icon('download')}${a.installed ? 'Site' : 'Get'}</a>` : ''}
        ${a.supported && a.installed ? `<button class="btn sm ${a.connected ? '' : 'primary'}" data-app="${a.id}" data-on="${a.connected ? 1 : 0}">${a.connected ? 'Disconnect' : 'Connect'}</button>` : ''}
      </div>
      ${!a.supported ? `<div class="g-ds note">${esc(a.note)}</div>` : ''}
    </div>`).join('');
  $$('[data-app]', g).forEach((b) => (b.onclick = async () => {
    const a = list.find((x) => x.id === b.dataset.app);
    b.disabled = true;
    try {
      if (b.dataset.on === '1') { appsCache = await api.aiAppDisconnect(a.id); toast(`Removed from ${a.name}`); }
      else { appsCache = await api.aiAppConnect(a.id); toast(`Added to ${a.name} — quit and reopen ${a.name} to use your bots there`); }
    } catch (err) { toast(err.message, true); }
    drawApps(appsCache);
    updateConnBadge();
  }));
}

let mcpInfoCache = null;
async function renderMcpCard(fresh = true) {
  if (mcpInfoCache) drawMcpCard(mcpInfoCache);
  if (!fresh && mcpInfoCache) return;
  try { mcpInfoCache = await api.mcpInfo(); } catch (e) { return; }
  drawMcpCard(mcpInfoCache);
}
function drawMcpCard(info) {
  const card = $('#mcp-card');
  if (!card) return;
  const q = (sel) => card.querySelector(sel);
  card.innerHTML = `
    <div class="card-row">
      <div class="ic">${icon('plug')}</div>
      <div class="grow"><div class="nm">Wayzerr MCP server</div><div class="ds">${info.running ? '<span class="status ok">● On</span> · only this computer can reach it' : 'Off — other apps can’t reach your bots'}</div></div>
      <button class="btn sm" id="mcp-copy">${icon('copy')}Copy link & token</button>
      <label class="toggle" title="Turn the Wayzerr MCP server on/off"><input type="checkbox" id="mcp-on" ${info.enabled ? 'checked' : ''}><span></span></label>
    </div>`;
  q('#mcp-copy').onclick = () => {
    const t = document.createElement('textarea');
    t.value = `URL: ${info.url}\nHeader: Authorization: Bearer ${info.token}`;
    document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    toast('Copied');
  };
  q('#mcp-on').onchange = async (e) => { await api.mcpToggle(e.target.checked); renderMcpCard(); };
}

// Connect any cloud AI server: just its address (and a key if it needs one).
function openServerConnect() {
  modal(`<h3 class="pm-h"><span class="srv-ic">${icon('cloud')}</span>Connect a cloud server</h3>
    <p class="lead">Paste the server's address. Wayzerr finds its models by itself — your bots can then think with them.</p>
    <label class="f">Name</label><input id="sv-name" placeholder="e.g. School AI, My server" />
    <label class="f">Server address</label><input id="sv-url" placeholder="https://ai.example.com" autocomplete="off" />
    <label class="f">Key <span>(if the server needs one)</span></label><input id="sv-key" type="password" autocomplete="off" placeholder="Paste the key" />
    <details><summary>Model name (only if Wayzerr can't find the models)</summary><input id="sv-model" style="margin-top:8px" placeholder="e.g. llama-3.1-70b" /></details>
    <div class="hint">Works with servers that speak the OpenAI format. The key is stored encrypted on this computer.</div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="sv-go">Connect</button></div>`, 'wide');
  $('#sv-url').focus();
  $('#sv-go').onclick = async () => {
    const b = $('#sv-go'); b.disabled = true; b.textContent = 'Connecting…';
    const url = $('#sv-url').value.trim();
    let name = $('#sv-name').value.trim();
    if (!name) { try { name = new URL(/^https?:/.test(url) ? url : 'https://' + url).hostname.replace(/^(www|api)\./, ''); } catch (_) { name = 'Cloud server'; } }
    try { await run(() => api.saveProvider({ type: 'custom', name, baseUrl: url, apiKey: $('#sv-key').value.trim(), model: $('#sv-model').value.trim() })); closeModal(); toast('Connected — pick its models in the model menu'); }
    catch (_) { b.disabled = false; b.textContent = 'Connect'; }
  };
}

function openProviderModal(existing, type) {
  const tn = type && S.providerTypes[type]?.name.replace(/ \(.*\)/, '');
  modal(`<h3 class="pm-h">${existing ? 'Change key for ' + esc(existing.name) : type ? `${logoFor(type, 'md')}Connect ${esc(tn)}` : 'Add AI provider'}</h3>
    <p class="lead">${existing ? 'Paste a new key. The model list reloads automatically.' : type ? `Paste your ${esc(tn)} API key. Its models then appear in the model menu next to the send button.` : 'Pick a provider and paste its API key. Its models appear in the model menu next to the send button.'}</p>
    <div id="pm-form"></div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="pm-save">${existing ? 'Save' : 'Connect'}</button></div>`, 'wide');
  const form = providerForm($('#pm-form'), existing?.type || type || 'anthropic', existing, !!type);
  $('#pm-save').onclick = async () => {
    const b = $('#pm-save');
    b.disabled = true; b.textContent = 'Connecting…';
    try { await run(() => form.save()); closeModal(); toast('Connected'); } catch (_) { b.disabled = false; b.textContent = existing ? 'Save' : 'Connect'; }
  };
}

function openConnectorGallery() {
  modal(`<h3>Add connector</h3>
    <p class="lead">Pick one — most only need an API key. These run through Node.js (<a href="https://nodejs.org" target="_blank">nodejs.org</a>), so install it once if you haven't.</p>
    <div class="gallery">
      ${PRESETS.map((p, i) => `<button class="g-item" data-i="${i}"><span class="g-ic">${p.icon}</span><span class="g-nm">${esc(p.name)}</span><span class="g-ds">${esc(p.desc)}</span><span class="g-key">${p.env.length ? icon('key') + 'API key' : 'No key needed'}</span></button>`).join('')}
      <button class="g-item" data-custom="url"><span class="g-ic">🌐</span><span class="g-nm">Online MCP server</span><span class="g-ds">Paste a server URL and API key.</span><span class="g-key">${icon('key')}Optional key</span></button>
      <button class="g-item" data-custom="cmd"><span class="g-ic">🧩</span><span class="g-nm">Custom command</span><span class="g-ds">Any MCP server started with npx or another command.</span><span class="g-key">Advanced</span></button>
    </div>
    <div class="modal-actions"><a href="https://registry.modelcontextprotocol.io/" target="_blank" style="margin-right:auto;align-self:center;font-size:13px">Browse more connectors ↗</a><button class="btn" data-close>Close</button></div>`, 'wide');
  $$('.g-item[data-i]').forEach((b) => (b.onclick = () => openPresetForm(PRESETS[+b.dataset.i])));
  $('.g-item[data-custom=url]').onclick = () => openServerEditor(null, 'url');
  $('.g-item[data-custom=cmd]').onclick = () => openServerEditor(null, 'cmd');
}

function openPresetForm(p) {
  modal(`<div class="row-flex" style="gap:14px;margin-bottom:6px"><span class="g-ic big">${p.icon}</span><div><h3>${esc(p.name)}</h3><p class="lead" style="margin:0">${esc(p.desc)}</p></div></div>
    ${p.env.map(([k, label]) => `<label class="f">${esc(label)}</label><input type="password" data-env="${k}" autocomplete="off" placeholder="Paste key" />`).join('')}
    ${p.keyUrl ? `<div class="hint">Get a key: <a href="${p.keyUrl}" target="_blank">${esc(p.keyUrl.replace(/^https:\/\//, ''))}</a></div>` : '<div class="hint">No API key needed.</div>'}
    <div class="modal-actions"><button class="btn" id="pf-back">Back</button><button class="btn primary" id="pf-add">Add & connect</button></div>`);
  $('#pf-back').onclick = openConnectorGallery;
  $('[data-env]')?.focus();
  $('#pf-add').onclick = async () => {
    const env = {};
    for (const i of $$('[data-env]')) {
      if (!i.value.trim()) return toast('Paste the API key first.', true);
      env[i.dataset.env] = i.value.trim();
    }
    const b = $('#pf-add');
    b.disabled = true; b.textContent = 'Connecting… (first time can take a minute)';
    try { await run(() => api.saveServer({ name: p.name, icon: p.icon, command: 'npx', args: p.args, env })); closeModal(); toast(`${p.name} added`); } catch (_) { b.disabled = false; b.textContent = 'Retry'; }
  };
}

function openServerEditor(s, kind) {
  const d = s ? stripStatus(s) : { name: '', command: 'npx', args: [], env: {} };
  const isUrl = s ? !!s.url : kind === 'url';
  modal(`
    <h3>${s ? esc(s.name) : isUrl ? 'Online MCP server' : 'Custom command'}</h3>
    <label class="f">Name</label><input id="sv-name" value="${esc(d.name)}" placeholder="e.g. My tools" />
    ${isUrl ? `
      <label class="f">Server URL</label><input id="sv-url" value="${esc(d.url || '')}" placeholder="https://…/mcp" />
      <label class="f">API key <span>(sent as a Bearer token, if the server needs one)</span></label><input id="sv-key" type="password" value="${esc(d.apiKey || '')}" autocomplete="off" />
      <div class="hint">Servers that need a browser login (OAuth) aren't supported yet.</div>` : `
      <label class="f">Command</label><input id="sv-cmd" value="${esc(d.command)}" placeholder="npx" />
      <label class="f">Arguments <span>(one per line)</span></label><textarea id="sv-args" rows="3">${esc((d.args || []).join('\n'))}</textarea>
      <label class="f">API keys / environment <span>(KEY=value, one per line)</span></label><textarea id="sv-env" rows="2" placeholder="SOME_API_KEY=…">${esc(Object.entries(d.env || {}).map(([k, v]) => `${k}=${v}`).join('\n'))}</textarea>`}
    <div class="modal-actions">${s ? '' : '<button class="btn" id="sv-back" style="margin-right:auto">Back</button>'}<button class="btn" data-close>Cancel</button><button class="btn primary" id="sv-save">${s ? 'Save & reconnect' : 'Add & connect'}</button></div>`);
  $('#sv-back')?.addEventListener('click', openConnectorGallery);
  $('#sv-save').onclick = async () => {
    const out = { ...d, name: $('#sv-name').value.trim() };
    if (isUrl) {
      out.url = $('#sv-url').value.trim();
      out.apiKey = $('#sv-key').value.trim();
      delete out.command; delete out.args; delete out.env;
      if (!out.name || !/^https?:\/\//.test(out.url)) return toast('Name and a valid URL are required.', true);
    } else {
      const env = {};
      $('#sv-env').value.split('\n').map((l) => l.trim()).filter(Boolean).forEach((l) => { const i = l.indexOf('='); if (i > 0) env[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
      Object.assign(out, { command: $('#sv-cmd').value.trim(), args: $('#sv-args').value.split('\n').map((x) => x.trim()).filter(Boolean), env });
      if (!out.name || !out.command) return toast('Name and command are required.', true);
    }
    const b = $('#sv-save');
    b.disabled = true; b.textContent = 'Connecting…';
    try { await run(() => api.saveServer(out)); closeModal(); } catch (_) { b.disabled = false; b.textContent = 'Retry'; }
  };
}

// ---------- Teach a skill: show a bot how to do something in its browser ----------
let teaching = false;
function setTeaching(on) {
  teaching = on;
  $('#teach-bar').classList.toggle('hidden', !on);
  $('#fs-teach').classList.toggle('hidden', on);
  $('#fs').classList.toggle('is-teaching', on);
  if (on) { $('#teach-count').textContent = 'Recording'; $('#teach-last').textContent = 'Do the task in this browser. Your bots will learn each step.'; }
}
async function startTeaching() {
  const p = active();
  if (!p || p.group) return toast('Open a bot first (not a group chat).', true);
  try {
    if (!screenOpen) setScreen(true);
    if (!fsOpen) openFullScreen('#brw-card', true);
    await api.teachStart(browserSt.hasPage ? '' : 'https://www.google.com');
    setTeaching(true);
    toast('Recording — do the task, then click Save skill');
  } catch (e) { toast(e.message, true); }
}
api.onTeach?.((t) => {
  if (!teaching) return;
  $('#teach-count').textContent = t.count ? `Recording · ${t.count} step${t.count === 1 ? '' : 's'}` : 'Recording';
  if (t.last) $('#teach-last').textContent = t.last;
});
async function finishTeaching() {
  const steps = await api.teachPeek().catch(() => []);
  if (!steps.length) return toast('Nothing recorded yet. Do the task in the browser first.', true);
  closeFullScreen();
  const o = modal(`<h3 style="margin:0 0 4px">Save this skill</h3>
    <div class="hint">Every bot can use it. They'll repeat these steps in their browser when you ask.</div>
    <label class="f">Name</label><input id="tk-name" placeholder="Check my homework in Google Classroom" maxlength="80">
    <label class="f">When should bots use it? <span class="hint">(optional)</span></label><input id="tk-when" placeholder="When I ask what homework I have">
    <label class="f">What the bots learned</label>
    <ol class="tk-steps">${steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
    <div class="row-flex" style="justify-content:flex-end;margin-top:12px"><button class="btn" id="tk-discard">Discard</button><button class="btn primary" id="tk-save">Save skill</button></div>`);
  setTimeout(() => $('#tk-name')?.focus(), 50);
  $('#tk-discard').onclick = async () => { await api.teachStop({}).catch(() => {}); setTeaching(false); closeModal(); toast('Skill discarded'); };
  $('#tk-save').onclick = async () => {
    const name = $('#tk-name').value.trim();
    if (!name) { $('#tk-name').focus(); return toast('Give the skill a name.', true); }
    try { const r = await api.teachStop({ save: true, name, when: $('#tk-when').value.trim() }); setTeaching(false); closeModal(); toast(`Saved “${r.name}” — ask any bot to do it`); }
    catch (e) { toast(e.message, true); }
  };
}

// ---------- Phone: use your bots from your iPhone ----------
let phoneSeq = 0;
function seenAgo(ts) {
  const m = Math.round((Date.now() - (ts || 0)) / 60000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
}
async function tabPhone() {
  const seq = ++phoneSeq;
  let st; try { st = await api.phoneState(); } catch (e) { const b0 = $('#set-body'); if (b0) b0.innerHTML = `<h1>Phone</h1><p class="lead">${esc(e.message)}</p>`; return; }
  const link = st.anywhere || (st.tunnelError ? st.home : '');
  const anyHost = st.anywhere ? new URL(st.anywhere).host : '';
  const qr = st.enabled && link ? await api.phoneQr(link).catch(() => '') : '';
  const body = $('#set-body');
  if (seq !== phoneSeq || !body || view !== 'settings' || settingsTab !== 'phone') return;
  if (st.locked || S.settings.phoneUnlocked !== true) {
    body.innerHTML = `<h1>Phone</h1><div class="card simple"><div class="card-row"><div class="grow"><div class="nm">Still under development</div><div class="ds">Using Wayzerr on your phone isn't ready for everyone yet. If you've been given access, press <b>Control + 1</b> and type your code.</div></div></div></div>`;
    return;
  }
  const dev = st.devices || [];
  body.innerHTML = `
    <h1>Phone</h1>
    <p class="lead">Talk to your bots and watch their browser from your phone. They keep running on this computer.</p>
    <div class="card simple"><div class="card-row"><div class="grow"><div class="nm">Use Wayzerr on my phone</div><div class="ds">This computer needs to be awake with Wayzerr open.</div></div><label class="switch"><input type="checkbox" id="ph-on" ${st.enabled ? 'checked' : ''}><span></span></label></div></div>
    ${st.enabled ? `
    <div class="card simple">
      <div class="card-row"><div class="grow"><div class="nm">Ask for a code</div><div class="ds">The phone asks for a 6-digit code before it shows anything, and again every 12 hours. ${st.codeDefault ? 'The code is <b>250612</b> until you choose your own.' : 'Your own code is set.'}</div></div><label class="switch"><input type="checkbox" id="ph-lock" ${st.lock ? 'checked' : ''}><span></span></label></div>
      ${st.lock ? '<div class="card-row"><div class="grow"><div class="nm">Phone code</div><div class="ds">Six numbers. Phones have to enter the new code after you change it.</div></div><button class="btn sm" id="ph-code">Change code</button></div>' : ''}
    </div>
    <div class="card ph-card">
      <div class="ph-pair">
        ${qr ? `<div class="ph-qr">${qr}</div>` : `<div class="ph-qr ph-wait">${!st.anywhere ? (st.tunnelError ? '' : 'Starting the secure link…') : ''}</div>`}
        <div class="ph-how">
          <div class="nm">Add a phone</div>
          <ol class="ph-steps">
            <li>On your phone, open <b>Code Scanner</b> (swipe down for Control Center) or the <b>Camera</b>, and point it at this code.</li>
            <li>Tap the link. Your phone connects.</li>
            <li>In Safari, tap <b>Share</b> → <b>Add to Home Screen</b>.</li>
          </ol>
          <div class="ds">${anyHost ? `No camera handy? On the phone open <b>${esc(anyHost)}</b> and tap <b>Connect</b>. You'll be asked here to allow it.` : 'The code appears in a few seconds.'}</div>
          <div class="ds">${st.anywhere ? 'This code is for one phone and changes after 10 minutes or once it is used. Phones you already connected are not affected.' : ''}</div>
        </div>
      </div>
    </div>
    <div class="card">
      <h2>Connected phones</h2>
      ${dev.length ? dev.map((d) => `<div class="card-row ph-dev"><span class="ph-dot${d.online ? ' on' : ''}"></span><div class="grow"><div class="nm">${esc(d.name)}</div><div class="ds">${d.online ? 'Using Wayzerr now' : 'Last used ' + seenAgo(d.lastSeen)}</div></div><button class="btn sm" data-rm="${esc(d.id)}">Remove</button></div>`).join('') : '<div class="ds" style="padding:6px 0">No phones yet. Scan the code above.</div>'}
    </div>
    <div class="card simple anywhere">
      <div class="card-row"><div class="grow"><div class="nm">Works anywhere</div><div class="ds">${st.anywhere ? '<span class="status ok">● On</span> · your phone connects over mobile data or any Wi-Fi, from any distance. Scan once and it keeps working.' : st.tunnelError ? `<span class="status err">● Didn’t start</span> · ${esc(st.tunnelError)} <button class="btn sm" id="ph-retry" style="margin-left:6px">Try again</button>` : 'Starting… this takes a few seconds.'}</div></div></div>
      <div class="hint">This computer must stay on, online and with Wayzerr open. It won't go to sleep while Phone is on. Your phone reaches it through a private, encrypted Cloudflare link, and only phones you connected can get in.</div>
    </div>
    <div class="row-flex" style="justify-content:flex-end"><button class="btn sm" id="ph-relock">Lock Phone again</button></div>
    ${dev.length ? '<div class="row-flex" style="justify-content:flex-end"><button class="btn sm danger" id="ph-new">Remove all phones</button></div>' : ''}` : ''}`;
  const set = async (patch, msg) => { try { await api.phoneSet(patch); if (msg) toast(msg); } catch (e) { toast(e.message, true); } tabPhone(); };
  $('#ph-on').onchange = (e) => set({ enabled: e.target.checked }, e.target.checked ? 'Phone is on' : 'Phone is off');
  if ($('#ph-remote')) $('#ph-remote').onchange = (e) => set({ remote: e.target.checked });
  if ($('#ph-relock')) $('#ph-relock').onclick = async () => { await api.phoneLock().catch(() => {}); S = await api.getState(); tabPhone(); toast('Phone is locked again'); };
  if ($('#ph-lock')) $('#ph-lock').onchange = (e) => set({ lock: e.target.checked }, e.target.checked ? 'The phone asks for a code' : 'The phone no longer asks for a code');
  if ($('#ph-code')) $('#ph-code').onclick = () => {
    modal(`<h3>New phone code</h3><p class="lead">Six numbers. You type this on the phone to open Wayzerr.</p><input id="pc-in" inputmode="numeric" maxlength="6" placeholder="6 numbers" autocomplete="off" style="font-size:20px;letter-spacing:.3em;text-align:center"><div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="pc-ok">Save code</button></div>`);
    setTimeout(() => $('#pc-in')?.focus(), 50);
    $('#pc-ok').onclick = async () => { const v = $('#pc-in').value.trim(); if (!/^\d{6}$/.test(v)) return toast('The code is 6 numbers.', true); try { await api.phoneSet({ code: v }); closeModal(); toast('Code saved'); tabPhone(); } catch (err) { toast(err.message, true); } };
  };
  if ($('#ph-retry')) $('#ph-retry').onclick = () => set({ retryTunnel: true }, 'Trying again…');
  $$('[data-rm]').forEach((b) => (b.onclick = () => set({ remove: b.dataset.rm }, 'Phone removed')));
  if ($('#ph-new')) $('#ph-new').onclick = () => confirmBox('Remove all phones?', 'They stop working until you connect them again.', 'Remove all', () => set({ newKey: true }, 'All phones removed'));
}
// A phone asks to connect: Allow / Don't allow.
api.onPhoneJoin?.((r) => {
  const o = modal(`<div class="join"><div class="join-ic">${icon('phone')}</div><h3>${esc(r.name)} wants to connect</h3>
    <div class="hint">It will see your bots and chats, message them and watch their browser. Only allow your own phone.</div>
    <div class="row-flex" style="justify-content:center;margin-top:16px"><button class="btn" id="jn-no">Don't allow</button><button class="btn primary" id="jn-yes">Allow</button></div></div>`);
  $('#jn-yes').onclick = async () => { await api.phoneSet({ answer: r.id, allow: true }).catch(() => {}); closeModal(); toast(`${r.name} connected`); if (view === 'settings' && settingsTab === 'phone') tabPhone(); };
  $('#jn-no').onclick = async () => { await api.phoneSet({ answer: r.id, allow: false }).catch(() => {}); closeModal(); };
});
api.onPhone?.(() => { if (view === 'settings' && settingsTab === 'phone') tabPhone(); });
// Control + 1 opens a box for the code that unlocks Phone (it is still under development).
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey && !e.metaKey && !e.altKey && (e.key === '1' || e.code === 'Digit1'))) return;
  e.preventDefault();
  if (S.settings.phoneUnlocked === true) return toast('Phone is already unlocked');
  if ($('#pu-in')) return;
  modal(`<h3>Enter your code</h3><p class="lead">Phone is still under development. Type the code you were given.</p><input id="pu-in" type="password" inputmode="numeric" maxlength="6" placeholder="••••••" autocomplete="off" style="font-size:22px;letter-spacing:.4em;text-align:center"><div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="pu-ok">Unlock</button></div>`);
  setTimeout(() => $('#pu-in')?.focus(), 50);
  const go = async () => { try { await api.phoneUnlock($('#pu-in').value.trim()); S = await api.getState(); closeModal(); toast('Phone unlocked'); if (view === 'settings' && settingsTab === 'phone') tabPhone(); } catch (err) { toast(err.message, true); const i = $('#pu-in'); if (i) { i.value = ''; i.focus(); } } };
  $('#pu-ok').onclick = go;
  $('#pu-in').onkeydown = (ev) => { if (ev.key === 'Enter') go(); };
});

// Which computer the bots' computer tools control: their own (inside Wayzerr) or yours.
function tabComputer() {
  const draw = () => {
    const mine = S.settings.computerTarget === 'mine', name = S.settings.myComputerName || 'My Mac', pm = S.settings.myMac || {}, mac = !!pm.supported;
    const dot = (ok) => `<span class="perm-dot ${ok ? 'ok' : 'no'}"></span>`;
    $('#set-body').innerHTML = `
      <h1>Computer</h1>
      <p class="lead">Bots can use a computer: they see the screen, click, type and open programs. Choose which one they use.</p>
      <div class="card simple">
        <div class="card-row"><div class="grow"><div class="nm">Bots can use the browser</div><div class="ds">Reading pages, clicking through sites and signing in with your saved logins. It is built in, so there is nothing to download.</div></div><label class="switch"><input type="checkbox" id="cm-brw" ${S.connectors?.browser?.enabled !== false ? 'checked' : ''}><span></span></label></div>
        <div class="card-row"><div class="grow"><div class="nm">Bots can use a computer</div><div class="ds">${S.settings.computerOn === false ? 'Off: bots will not use any computer, theirs or yours.' : 'On: bots can use a computer when a job needs one.'}</div></div><label class="switch"><input type="checkbox" id="cm-on" ${S.settings.computerOn !== false ? 'checked' : ''}><span></span></label></div>
        <div class="card-row"><div class="grow"><div class="nm">Which computer do bots use?</div><div class="ds">${mine ? `Bots work on <b>${esc(name)}</b>, your own computer. They ask you before every use, and the Stop button stops them.` : `Bots work on their own computer inside Wayzerr. It can't touch your files, only the shared Wayzerr Files folder.`}</div></div>
          <div class="seg" id="cm-target"><button data-v="bot" class="${mine ? '' : 'on'}">Bot's own</button><button data-v="mine" class="${mine ? 'on' : ''}" ${mac ? '' : 'disabled title="Only on a Mac for now"'}>${esc(name)}</button></div></div>
        <div class="card-row"><div class="grow"><div class="nm">Name of your computer</div><div class="ds">What you call it. Say it in a message ("do it on ${esc(name)}") to use it for just that message.</div></div><input id="cm-name" class="mid" value="${esc(name)}" maxlength="40" placeholder="My Mac"></div>
      </div>
      <div class="hint">Whichever you pick here, you can tell a bot in the chat: "use my computer" or "use your own computer", and it does that for that message.</div>
      ${mac ? `<div class="section-title sm">Permissions for ${esc(name)}</div>
      <div class="card simple">
        <div class="card-row"><div class="grow"><div class="nm">${dot(pm.screen === 'granted')}See the screen</div><div class="ds">System Settings → Privacy & Security → Screen & System Audio Recording. After switching Wayzerr on, restart Wayzerr.</div></div>${pm.screen === 'granted' ? '<span class="ok-t">Allowed</span>' : '<button class="btn sm" data-p="screen">Allow…</button>'}</div>
        <div class="card-row"><div class="grow"><div class="nm">${dot(pm.accessibility)}Click and type</div><div class="ds">System Settings → Privacy & Security → Accessibility.</div></div>${pm.accessibility ? '<span class="ok-t">Allowed</span>' : '<button class="btn sm" data-p="accessibility">Allow…</button>'}</div>
        <div class="card-row"><div class="grow"><div class="nm">Already switched them on?</div><div class="ds">Press to check again.</div></div><button class="btn sm" id="cm-check">Check again</button></div>
      </div>` : `<div class="hint">Using your own computer works on a Mac for now.</div>`}
      <div class="section-title sm">The bots' own computers</div>
      <div class="card simple"><div class="card-row"><div class="grow"><div class="nm">Download, power and reset</div><div class="ds">Each bot's own computer is a small Linux computer. You can see it, download it and switch it on or off in the Screen panel (the monitor button).</div></div><button class="btn sm" id="cm-open">Open Screen panel</button>${loadPref('computerDeclined', false) ? ' <button class="btn sm primary" id="cm-dl">Download the computer</button>' : ''}</div></div>
      <div class="card simple"><div class="card-row"><div class="grow"><div class="nm">Computer data</div><div class="ds" id="cm-usage">Checking how much room the computers use…</div></div><button class="btn sm danger" id="cm-wipe">Delete all computer data…</button></div></div>
      <div class="hint">Deleting turns every bot's computer off and erases the computer system, every bot's computer and everything the bots installed or saved on it. Your own files and the shared Wayzerr Files folder are not touched. Bots get a fresh computer when you download it again.</div>`;
    $('#cm-brw').onchange = async (e) => { S = await api.updateConnector({ key: 'browser', patch: { enabled: e.target.checked } }); renderBrowserState(); draw(); toast(e.target.checked ? 'Bots can use the browser' : 'Bots will not use the browser'); };
    $('#cm-on').onchange = async (e) => { S = await api.saveProfile({ computerOn: e.target.checked }); draw(); toast(e.target.checked ? 'Bots can use a computer' : 'Bots will not use a computer'); };
    $$('#cm-target button').forEach((b) => (b.onclick = async () => { S = await api.saveProfile({ computerTarget: b.dataset.v }); draw(); toast(b.dataset.v === 'mine' ? `Bots will use ${S.settings.myComputerName || 'My Mac'}, and ask you each time` : 'Bots will use their own computer'); }));
    $('#cm-name').onchange = async (e) => { S = await api.saveProfile({ myComputerName: e.target.value }); draw(); toast('Saved'); };
    $$('[data-p]').forEach((b) => (b.onclick = async () => { await api.macRequestAccess(b.dataset.p); toast('Switch Wayzerr on in the window that opened, then press Check again'); }));
    const ck = $('#cm-check'); if (ck) ck.onclick = async () => { S = await api.getState(); draw(); };
    $('#cm-open').onclick = () => { go('chat'); setScreen(true); setScrTab('computer'); };
    const dl = $('#cm-dl'); if (dl) dl.onclick = () => { savePref('computerDeclined', false); go('chat'); setScreen(true); setScrTab('computer'); window.computerRedraw?.(); };
    const gbOf = (n) => (n >= 1e9 ? (n / 1e9).toFixed(2) + ' GB' : Math.max(0, Math.round(n / 1e6)) + ' MB');
    api.computerUsage().then((u) => { const el = $('#cm-usage'); if (el) el.textContent = u && u.total > 0 ? `The computers use ${gbOf(u.total)} on this computer (the system ${gbOf(u.base)}, the bots' own computers ${gbOf(u.disks)}${u.engine ? `, the engine ${gbOf(u.engine)}` : ''}).` : 'No computer data on this computer.'; }).catch(() => { const el = $('#cm-usage'); if (el) el.textContent = 'Everything the bots\u2019 computers keep on this computer.'; });
    $('#cm-wipe').onclick = () => confirmBox('Delete all computer data?', 'Every bot\u2019s computer is turned off and erased, together with the computer system and everything the bots installed or saved on their computers. Your own files and the shared Wayzerr Files folder stay as they are. You can download the computer again later.', 'Delete everything', async () => {
      try { await api.computerWipe(); toast('Computer data deleted'); } catch (e) { toast(e.message || 'Could not delete the computer data', true); }
      draw();
    });
  };
  draw();
}

function tabBrowser() {
  $('#set-body').innerHTML = `
    <h1>Browser & apps</h1>
    <p class="lead">Your bots' browser has its own profile, separate from Safari and Chrome.</p>
    <div class="card"><div class="card-row"><div class="ic">${icon('puzzle')}</div><div class="grow"><div class="nm">Using your apps</div><div class="ds">For Gmail, Classroom, Slides, Drive and your other apps. You can still say “use your browser” in a message.</div></div>
      <div class="seg" id="apps-via">${[['connector', 'Connections'], ['browser', 'Browser']].map(([v, l]) => `<button data-v="${v}" class="${(S.settings.appsVia || 'connector') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div></div>
    <div class="card"><div class="card-row"><div class="ic">${icon('external')}</div><div class="grow"><div class="nm">Opening links in chats</div><div class="ds">Where links from your bots open.</div></div><select class="mini" id="link-open"><option value="ask" ${(S.settings.linkOpen || 'ask') === 'ask' ? 'selected' : ''}>Ask me</option><option value="app" ${S.settings.linkOpen === 'app' ? 'selected' : ''}>In Wayzerr</option><option value="browser" ${S.settings.linkOpen === 'browser' ? 'selected' : ''}>In my browser</option></select></div></div>
    <div class="card"><div class="card-row"><div class="ic">${icon('cookie')}</div><div class="grow"><div class="nm">Sign out of all sites</div><div class="ds">Clears cookies, logins and site data in the bots' browser.</div></div><button class="btn sm danger" id="clr-browser">Clear</button></div></div>
    <div class="card"><div class="card-row"><div class="ic">${icon('compass')}</div><div class="grow"><div class="nm">Browser connector</div><div class="ds">Turn the bots' browser on or off in Tools & skills.</div></div><button class="btn sm" id="to-conn">Open</button></div></div>`;
  $('#link-open').onchange = async (e) => { S = await api.setLinkOpen(e.target.value); toast('Saved'); };
  $$('#apps-via button').forEach((b) => (b.onclick = async () => { S = await api.setAppsVia(b.dataset.v); $$('#apps-via button').forEach((x) => x.classList.toggle('on', x === b)); toast(b.dataset.v === 'browser' ? 'Bots will use your apps in their browser' : 'Bots will always use your app connections'); }));
  $('#clr-browser').onclick = () => confirmBox('Sign out of all sites?', 'Your bots will need you to log in again where needed.', 'Clear', async () => { await api.clearBrowserData(); toast('Browser data cleared'); });
  $('#to-conn').onclick = () => { settingsTab = 'tools'; renderSettings(); };
}


// ---------- logos (official site icons, cached) ----------
const ICONS = {};
const extraIconKeys = [];
const siteDomain = (site) => hostOf(/^https?:\/\//.test(site || '') ? site : 'https://' + (site || ''));
async function loadIcons() {
  const domains = [...Object.values(S.providerTypes).map((t) => t.domain), ...(S.vault || []).map((v) => siteDomain(v.site)), ...PRESETS.map((p) => p.domain), 'claude.ai', ...S.customServers.map((x) => x.logo), ...extraIconKeys].filter((d) => d && !(d in ICONS));
  if (!domains.length) return;
  try {
    Object.assign(ICONS, await api.getIcons(domains));
    $$('.prov-tile[data-t]').forEach((b) => { const f = b.firstElementChild; if (f) f.outerHTML = logoFor(b.dataset.t, 'md'); });
    $$('[data-logo]').forEach((n) => { const src = ICONS[n.dataset.logo]; if (src && n.tagName !== 'IMG') n.outerHTML = `<img class="logo ${n.dataset.cls || ''}" src="${src}" alt="">`; });
    if (S.ready && view === 'settings') renderSettings();
  } catch (_) {}
}
function logoFor(type, cls = '') {
  const t = S.providerTypes[type];
  const src = t && ICONS[t.domain];
  return src ? `<img class="logo ${cls}" src="${src}" alt="">` : `<span class="prov-badge ${cls} b-${type}">${esc((t?.name || '?')[0])}</span>`;
}
function siteIcon(site, name, cls = '') {
  const src = ICONS[siteDomain(site)];
  return src ? `<img class="logo ${cls}" src="${src}" alt="">` : `<span class="prov-badge ${cls} b-custom">${esc((name || '?')[0].toUpperCase())}</span>`;
}

// ---------- Passwords folder ----------
function tabPasswords() {
  const items = S.vault || [];
  const on = S.connectors.logins?.enabled;
  $('#set-body').innerHTML = `
    <h1>Passwords & cards</h1>
    <p class="lead">Accounts and cards every bot can use, on any website. They're encrypted on this computer, and the AI never sees them.</p>
    <div class="card"><div class="card-row"><div class="ic">${icon('key')}</div><div class="grow"><div class="nm">Let bots sign in with saved accounts</div><div class="ds">They'll ask once before using it the first time.</div></div><label class="toggle"><input type="checkbox" id="pw-toggle" ${on ? 'checked' : ''}><span></span></label></div></div>
    <div class="section-title">Saved accounts · ${items.length}</div>
    ${items.length ? items.map((v) => `
      <div class="card pw-card">
        <div class="card-row">
          ${siteIcon(v.site || acctDomain(v.username), v.name, 'lg')}
          <div class="grow pw-text"><div class="nm">${esc(v.name)}</div><div class="ds pw-user" title="${esc(v.username || '')}">${esc(v.username || 'No username')}</div><div class="ds pw-site">Works on any website</div></div>
        </div>
        <div class="pw-actions">
          <select class="mini" data-pw-perm="${v.id}" title="When a bot wants to use this login"><option value="always" ${v.perm !== 'ask' ? 'selected' : ''}>Always allow</option><option value="ask" ${v.perm === 'ask' ? 'selected' : ''}>Always ask</option></select>
          <span class="pw-secret"><span class="pw-dots" id="pw-${v.id}">${v.hasPassword ? '••••••••' : 'no password'}</span>${v.hasPassword ? `<button class="icon-btn" data-pw-show="${v.id}" title="Show password">${icon('eye')}</button>` : ''}</span>
          <span class="pw-btns"><button class="btn sm" data-pw-edit="${v.id}">Edit</button><button class="btn sm danger" data-pw-del="${v.id}">Delete</button></span>
        </div>
      </div>`).join('') : '<div class="pw-empty">📁<div>Your Passwords folder is empty.</div></div>'}
    <button class="btn" id="pw-add">${icon('plus')}Add account</button>
    <div class="section-title" style="margin-top:30px">Payment cards · ${(S.cards || []).length}</div>
    <p class="hint" style="margin:-4px 0 12px">Bots can pay with these on websites. They never see the number, and they ask you <b>every time</b> before using a card.</p>
    ${(S.cards || []).map((c) => `<div class="card"><div class="card-row"><div class="cardchip ${esc((c.brand || '').toLowerCase().replace(/\s/g, ''))}">${esc((c.brand || 'Card').slice(0, 4).toUpperCase())}</div><div class="grow"><div class="nm">${esc(c.name)}</div><div class="ds">${esc(c.brand)} •••• ${esc(c.last4)} · expires ${esc(c.exp)}</div></div><button class="btn sm" data-cd-edit="${esc(c.id)}">Edit</button><button class="btn sm danger" data-cd-del="${esc(c.id)}">Delete</button></div></div>`).join('')}
    <button class="btn" id="cd-add">${icon('plus')}Add card</button>
    <p class="hint" style="margin-top:18px">Tip: if a bot needs a login you haven't saved, it asks you in the chat with a secure card — and can save it here for next time.</p>`;
  $('#pw-toggle').onchange = (e) => run(() => api.updateConnector({ key: 'logins', patch: { enabled: e.target.checked } }));
  $('#pw-add').onclick = () => openLoginEditor(null);
  $('#cd-add').onclick = () => openCardEditor(null);
  $$('[data-cd-edit]').forEach((b) => (b.onclick = () => openCardEditor((S.cards || []).find((c) => c.id === b.dataset.cdEdit))));
  $$('[data-cd-del]').forEach((b) => (b.onclick = () => { const c = (S.cards || []).find((x) => x.id === b.dataset.cdDel); confirmBox(`Delete ${c.name}?`, 'Bots will no longer be able to pay with it.', 'Delete', async () => { S = await api.cardDelete(c.id); renderSettings(); toast('Card deleted'); }); }));
  $$('[data-pw-perm]').forEach((sel) => (sel.onchange = () => { const v = items.find((x) => x.id === sel.dataset.pwPerm); run(() => api.vaultSave({ ...v, perm: sel.value })); }));
  $$('[data-pw-edit]').forEach((b) => (b.onclick = () => openLoginEditor(items.find((x) => x.id === b.dataset.pwEdit))));
  $$('[data-pw-del]').forEach((b) => (b.onclick = () => {
    const v = items.find((x) => x.id === b.dataset.pwDel);
    confirmBox(`Delete ${v.name}?`, 'Bots will no longer be able to sign in with it.', 'Delete', () => run(() => api.vaultDelete(v.id)));
  }));
  $$('[data-pw-show]').forEach((b) => (b.onclick = async () => {
    const el = $('#pw-' + b.dataset.pwShow);
    if (el.dataset.shown) { el.textContent = '••••••••'; delete el.dataset.shown; return; }
    try { el.textContent = await api.vaultReveal(b.dataset.pwShow); } catch (err) { toast(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); return; }
    el.dataset.shown = '1';
    setTimeout(() => { if (el.dataset.shown) { el.textContent = '••••••••'; delete el.dataset.shown; } }, 10000);
  }));
}

// Add or edit a payment card. The number is saved encrypted and never shown again (not even here).
function openCardEditor(c) {
  modal(`<h3>${c ? 'Edit card' : 'Add card'}</h3>
    <p class="lead">Encrypted on this computer. Bots never see it and must ask you each time.</p>
    <label class="f">Card number ${c ? `<span>(•••• ${esc(c.last4)} saved — leave empty to keep it)</span>` : ''}</label><input id="cd-num" inputmode="numeric" autocomplete="off" placeholder="${c ? '•••• •••• •••• ' + esc(c.last4) : '1234 5678 9012 3456'}" />
    <div class="row-flex"><div class="grow"><label class="f">Expires</label><input id="cd-exp" value="${esc(c?.exp || '')}" placeholder="MM/YY" autocomplete="off" /></div><div class="grow"><label class="f">Security code ${c ? '<span>(leave empty to keep)</span>' : ''}</label><input id="cd-cvc" type="password" inputmode="numeric" autocomplete="off" placeholder="123" /></div></div>
    <label class="f">Name on card</label><input id="cd-holder" value="${esc(c?.holder || '')}" autocomplete="off" />
    <div class="row-flex"><div class="grow"><label class="f">Postcode <span>(optional)</span></label><input id="cd-zip" value="${esc(c?.zip || '')}" autocomplete="off" /></div><div class="grow"><label class="f">Nickname <span>(optional)</span></label><input id="cd-name" value="${esc(c?.name || '')}" placeholder="My Visa" /></div></div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="cd-save">Save card</button></div>`);
  $('#cd-num').oninput = (e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 19); e.target.value = d.replace(/(\d{4})(?=\d)/g, '$1 '); };
  $('#cd-exp').oninput = (e) => { let d = e.target.value.replace(/\D/g, '').slice(0, 4); if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2); e.target.value = d; };
  $('#cd-save').onclick = async () => {
    try {
      S = await api.cardSave({ id: c?.id, number: $('#cd-num').value, exp: $('#cd-exp').value, cvc: $('#cd-cvc').value, holder: $('#cd-holder').value, zip: $('#cd-zip').value, name: $('#cd-name').value });
      closeModal(); renderSettings(); toast('Card saved');
    } catch (e) { toast(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), true); }
  };
}

// ---------- Notifications: a bot tells you when it's done ----------
// Draw each bot as a small picture for its notifications.
const picDone = new Set();
async function sendBotPics() {
  const out = {};
  for (const p of S.personas || []) {
    const ch = p.group ? S.personas.find((x) => x.id === (p.members || [])[0]) : p;
    if (!ch) continue;
    const key = p.id + JSON.stringify(charOf(ch));
    if (picDone.has(key)) continue;
    const wrap = document.createElement('div'); wrap.innerHTML = characterSvg(charOf(ch), { size: 128, flat: false });
    const svg = wrap.querySelector('svg'); if (!svg) continue;
    svg.querySelectorAll('.c-dots, .c-fx').forEach((g) => g.remove());
    svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg'); svg.setAttribute('width', 256); svg.setAttribute('height', 256); svg.removeAttribute('style');
    const url = await new Promise((res) => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 256; c.getContext('2d').drawImage(img, 0, 0, 256, 256); res(c.toDataURL('image/png')); }; img.onerror = () => res(null); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.outerHTML); });
    if (url) { out[p.id] = url; picDone.add(key); }
  }
  if (Object.keys(out).length) api.botPics(out).catch(() => {});
}
setTimeout(() => { if (S?.personas) sendBotPics().catch(() => {}); }, 2500);
api.onOpenChat?.((id) => { if (S.personas?.some((p) => p.id === id)) { view = 'chat'; S.activePersonaId = id; render(); } });
const VOICE_LANGS = [['', 'Detect automatically'], ['en', 'English'], ['es', 'Español'], ['ca', 'Català'], ['fr', 'Français'], ['de', 'Deutsch'], ['it', 'Italiano'], ['pt', 'Português'], ['nl', 'Nederlands'], ['ru', 'Русский'], ['uk', 'Українська'], ['pl', 'Polski'], ['tr', 'Türkçe'], ['ar', 'العربية'], ['he', 'עברית'], ['hi', 'हिन्दी'], ['ja', '日本語'], ['ko', '한국어'], ['zh', '中文'], ['sv', 'Svenska'], ['da', 'Dansk'], ['no', 'Norsk'], ['fi', 'Suomi'], ['el', 'Ελληνικά'], ['cs', 'Čeština'], ['ro', 'Română'], ['hu', 'Magyar'], ['id', 'Bahasa Indonesia'], ['vi', 'Tiếng Việt'], ['th', 'ไทย']];
let voiceTest = null;
function tabVoice() {
  if (voiceTest) { voiceTest.stop(true); voiceTest = null; }
  $('#set-body').innerHTML = `
    <h1>Voice</h1>
    <p class="lead">Wayzerr turns your voice into text with Whisper, on this computer. Tell it which microphone, which language and which names to expect, and it hears you better.</p>
    <div class="section-title sm">Microphone</div>
    <div class="card simple">
      <div class="card-row"><div class="grow"><div class="nm">Microphone</div><div class="ds" id="vo-mic-ds">The one your computer uses unless you pick another.</div></div><select id="vo-mic" aria-label="Microphone" style="max-width:260px"></select></div>
      <div class="card-row"><div class="grow"><div class="nm">Test it</div><div class="ds">Say something. The bar should move.</div><div class="vo-meter"><i id="vo-bar"></i></div></div><button class="btn" id="vo-test">Test microphone</button></div>
    </div>
    <div class="section-title sm">Language</div>
    <div class="card simple">
      <div class="card-row"><div class="grow"><div class="nm">I speak</div><div class="ds">Picking your language stops Whisper from guessing wrong, especially with an accent or short sentences.</div></div><select id="vo-lang" aria-label="Language you speak" style="max-width:220px">${VOICE_LANGS.map(([c, n]) => `<option value="${c}"${(S.settings.voiceLang || '') === c ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
    </div>
    <div class="section-title sm">Names and words</div>
    <div class="card simple">
      <div class="card-row" style="display:block"><div class="nm">Words to recognize</div><div class="ds" style="margin-bottom:8px">Names, places or words Whisper keeps getting wrong. Separate them with commas. Your bots' names are added for you.</div><textarea id="vo-words" rows="3" placeholder="For example: Grigor, Wayzerr, Barcelona" spellcheck="false">${esc(S.settings.voiceWords || '')}</textarea></div>
    </div>`;
  const sel = $('#vo-mic');
  const fill = async () => {
    const list = await WzTalk.devices(), cur = loadPref('micDevice', '');
    sel.innerHTML = `<option value="">Default microphone</option>` + list.filter((d) => d.id && d.id !== 'default').map((d, i) => `<option value="${esc(d.id)}"${d.id === cur ? ' selected' : ''}>${esc(d.label || `Microphone ${i + 1}`)}</option>`).join('');
    if (list.length && list.every((d) => !d.label)) $('#vo-mic-ds').textContent = 'Press “Test microphone” once to show the names of your microphones.';
  };
  fill();
  sel.onchange = () => { savePref('micDevice', sel.value); if (voiceTest) $('#vo-test').click(); };
  $('#vo-lang').onchange = async (e) => { S = await api.saveProfile({ voiceLang: e.target.value }); toast(e.target.value ? 'Whisper will listen for ' + VOICE_LANGS.find((l) => l[0] === e.target.value)[1] : 'Whisper will detect your language'); };
  $('#vo-words').onchange = async (e) => { S = await api.saveProfile({ voiceWords: e.target.value }); toast('Saved'); };
  const stopTest = () => { if (voiceTest) { voiceTest.stop(true); voiceTest = null; } const b = $('#vo-test'); if (b) b.textContent = 'Test microphone'; const bar = $('#vo-bar'); if (bar) bar.style.width = '0'; };
  $('#vo-test').onclick = async () => {
    if (voiceTest) return stopTest();
    try {
      if (!(await api.voiceMic())) return toast(MIC_DENIED, true);
      let peak = 0;
      voiceTest = await WzTalk.record({ deviceId: sel.value, discard: true, onLevel: (l) => { const bar = $('#vo-bar'); if (!bar) return stopTest(); peak = Math.max(peak, l); bar.style.width = Math.round(Math.min(1, l * 1.4) * 100) + '%'; } });
      $('#vo-test').textContent = 'Stop test';
      fill();
      setTimeout(() => { if (voiceTest && !$('#vo-test')) stopTest(); }, 100);
      setTimeout(() => { const b = $('#vo-test'); if (voiceTest && b) { stopTest(); } }, 30000);
    } catch (e) { voiceTest = null; toast(/denied|not allowed|permission/i.test(e.message) ? MIC_DENIED : 'Couldn’t open that microphone: ' + e.message, true); }
  };
  navigator.mediaDevices?.addEventListener?.('devicechange', fill);
}

function tabNotify() {
  const n = S.notify || { enabled: true, from: 'all' };
  const bots = S.personas;
  const some = Array.isArray(n.from);
  $('#set-body').innerHTML = `
    <h1>Notifications</h1>
    <p class="lead">Get a notification when a bot finishes a task, with the bot's picture.</p>
    <div class="card simple"><div class="card-row"><div class="ic">${icon('bell')}</div><div class="grow"><div class="nm">Notify me when a bot is done</div><div class="ds">Only when you're not looking at that chat.</div></div><label class="switch"><input type="checkbox" id="nt-on" ${n.enabled ? 'checked' : ''}><span></span></label></div></div>
    ${n.enabled ? `
    <div class="section-title sm">From</div>
    <div class="card simple">
      <label class="card-row nt-opt"><input type="radio" name="nt-from" value="all" ${!some ? 'checked' : ''}><div class="grow"><div class="nm">All bots</div></div></label>
      <label class="card-row nt-opt"><input type="radio" name="nt-from" value="some" ${some ? 'checked' : ''}><div class="grow"><div class="nm">Only the bots I pick</div></div></label>
    </div>
    ${some ? `<div class="card simple">${bots.map((p) => `<label class="card-row nt-opt"><span class="nt-av">${charEl(p, 30, 'none')}</span><div class="grow"><div class="nm">${esc(p.name)}</div></div><label class="switch"><input type="checkbox" data-nt-bot="${esc(p.id)}" ${n.from.includes(p.id) ? 'checked' : ''}><span></span></label></label>`).join('')}</div>` : ''}
    <div class="row-flex" style="margin-top:6px"><button class="btn sm" id="nt-test">Send a test notification</button></div>
    <p class="hint">If nothing shows up, allow notifications for Wayzerr in your computer's System Settings → Notifications.</p>` : ''}`;
  const save = async (patch) => { S = await api.notifySave({ ...n, ...patch }); tabNotify(); };
  $('#nt-on').onchange = (e) => save({ enabled: e.target.checked });
  $$('[name="nt-from"]').forEach((r) => (r.onchange = () => save({ from: r.value === 'all' ? 'all' : (some ? n.from : bots.map((p) => p.id)) })));
  $$('[data-nt-bot]').forEach((b) => (b.onchange = () => { const set = new Set(n.from); b.checked ? set.add(b.dataset.ntBot) : set.delete(b.dataset.ntBot); save({ from: [...set] }); }));
  if ($('#nt-test')) $('#nt-test').onclick = () => { const p = bots.find((x) => !x.group) || bots[0]; api.notifyTest(p?.id).catch((e) => toast(e.message, true)); };
}

// The account's own domain (gmail.com → Google) for its icon.
function acctDomain(u) { const d = String(u || '').split('@')[1] || ''; return /gmail|googlemail/i.test(d) ? 'google.com' : /outlook|hotmail|live\./i.test(d) ? 'microsoft.com' : /icloud|me\.com/i.test(d) ? 'apple.com' : d; }
function openLoginEditor(v) {
  modal(`<h3>${v ? 'Edit ' + esc(v.name) : 'Add account'}</h3>
    <p class="lead">Every bot can use it on any website — e.g. your Google account works for Classroom, Slides, Drive and every “Sign in with Google”.</p>
    <label class="f">Name</label><input id="lg-name" value="${esc(v?.name || '')}" placeholder="e.g. My Google account" />
    <label class="f">Email or username</label><input id="lg-user" value="${esc(v?.username || '')}" placeholder="name@school.org" autocomplete="off" />
    <label class="f">Password ${v?.hasPassword ? '<span>(leave empty to keep the saved one)</span>' : ''}</label>
    <div class="pw-input"><input id="lg-pass" type="password" autocomplete="new-password" placeholder="${v?.hasPassword ? '••••••••' : ''}" /><button class="icon-btn" id="lg-eye" title="Show">${icon('eye')}</button></div>
    <label class="f">Notes <span>(optional — e.g. "use the school account button")</span></label><input id="lg-notes" value="${esc(v?.notes || '')}" />
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn primary" id="lg-save">Save</button></div>`);
  $('#lg-eye').onclick = () => { const i = $('#lg-pass'); i.type = i.type === 'password' ? 'text' : 'password'; };
  $('#lg-name').focus();
  $('#lg-save').onclick = async () => {
    const item = { id: v?.id, name: $('#lg-name').value, site: v?.site || '', username: $('#lg-user').value, password: $('#lg-pass').value, notes: $('#lg-notes').value };
    try { await run(() => api.vaultSave(item)); closeModal(); toast('Saved to Passwords'); loadIcons(); } catch (_) {}
  };
}


// ---------- Connector directory (official MCP Registry) ----------
function openRegistry() {
  modal(`<h3>Browse connectors</h3>
    <p class="lead">From the official MCP directory. Click <strong>Get</strong> — Wayzerr downloads and connects it for you.</p>
    <div class="reg-search">${icon('search')}<input id="reg-q" placeholder="Search — e.g. Gmail, GitHub, Spotify, Notion…" autocomplete="off" /></div>
    <div class="reg-list" id="reg-list"><div class="p-empty shimmer">Loading…</div></div>
    <div class="modal-actions"><button class="btn" data-close>Close</button></div>`, 'wide reg-modal');
  let token = 0, next = null, items = [];
  const kindLabel = (it) => it.kind === 'remote' ? 'Online' : it.kind === 'npm' ? 'Download' : it.kind === 'pypi' ? 'Needs Python' : it.kind === 'oci' ? 'Needs Docker' : 'Unavailable';
  const installed = (it) => S.customServers.some((x) => x.registryId === it.id);
  const draw = () => {
    const list = $('#reg-list');
    if (!list) return;
    if (!items.length) { list.innerHTML = '<div class="p-empty">No connectors found.</div>'; return; }
    list.innerHTML = items.map((it, i) => `
      <div class="reg-item">
        ${siteLogo(it.logo, 'md', it.title)}
        <div class="grow"><div class="reg-nm">${esc(it.title)} <span class="chip">${kindLabel(it)}</span></div><div class="reg-ds">${esc(it.description)}</div></div>
        ${installed(it) ? '<span class="status ok">Added</span>' : `<button class="btn sm ${it.kind === 'npm' || it.kind === 'remote' ? 'primary' : ''}" data-get="${i}" ${it.kind === 'npm' || it.kind === 'remote' ? '' : 'disabled'}>Get</button>`}
      </div>`).join('') + (next ? '<button class="btn sm" id="reg-more" style="margin:10px auto;display:flex">Load more</button>' : '');
    $$('[data-get]').forEach((b) => (b.onclick = () => installFromRegistry(items[+b.dataset.get])));
    const more = $('#reg-more');
    if (more) more.onclick = () => load($('#reg-q').value.trim(), true);
    const keys = items.map((x) => x.logo).filter((k) => k && !(k in ICONS));
    if (keys.length) { extraIconKeys.push(...keys); loadIcons(); }
  };
  const load = async (q, append) => {
    const my = ++token;
    try {
      const r = await api.registrySearch({ q, cursor: append ? next : null });
      if (my !== token) return;
      items = append ? items.concat(r.items) : r.items;
      next = r.next;
      draw();
    } catch (e) {
      if (my === token) $('#reg-list').innerHTML = `<div class="p-empty">${esc(e.message)}</div>`;
    }
  };
  let t;
  $('#reg-q').oninput = (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value.trim()), 300); };
  $('#reg-q').focus();
  load('');
}

function installFromRegistry(it) {
  const envs = it.kind === 'npm' ? (it.npm.env || []) : [];
  const heads = it.kind === 'remote' ? (it.remote.headers || []) : [];
  const fields = [...envs.map((e) => ({ kind: 'env', name: e.name, label: e.description || e.name, secret: e.isSecret || e.is_secret, required: e.isRequired || e.is_required, def: e.default || '' })),
    ...heads.map((h) => ({ kind: 'header', name: h.name, label: h.description || h.name, secret: h.isSecret || h.is_secret, required: h.isRequired || h.is_required, def: h.value && !/[{}]/.test(h.value) ? h.value : '' }))];
  modal(`<div class="row-flex" style="gap:14px;margin-bottom:6px">${siteLogo(it.logo, 'lg', it.title)}<div><h3>${esc(it.title)}</h3><p class="lead" style="margin:0">${esc(it.description)}</p></div></div>
    ${fields.map((f, i) => `<label class="f">${esc(f.label)}${f.required ? '' : ' <span>(optional)</span>'}</label><input data-field="${i}" type="${f.secret ? 'password' : 'text'}" value="${esc(f.def)}" autocomplete="off" />`).join('') || '<div class="hint">No setup needed.</div>'}
    ${it.repo ? `<div class="hint">Instructions for getting keys: <a href="${esc(it.repo)}" target="_blank">${esc(it.repo.replace(/^https:\/\//, ''))}</a></div>` : ''}
    ${it.kind === 'remote' && !heads.length ? '<div class="hint">If this service needs you to sign in with your account (OAuth), it may not connect yet.</div>' : ''}
    <div class="modal-actions"><button class="btn" id="ri-back">Back</button><button class="btn primary" id="ri-go">Get & connect</button></div>`);
  $('#ri-back').onclick = openRegistry;
  $('#ri-go').onclick = async () => {
    const env = {}, headers = {};
    for (const [i, f] of fields.entries()) {
      const v = $(`[data-field="${i}"]`).value.trim();
      if (!v && f.required) return toast(`Fill in "${f.label}".`, true);
      if (v) (f.kind === 'env' ? env : headers)[f.name] = v;
    }
    const b = $('#ri-go');
    b.disabled = true; b.textContent = 'Downloading & connecting…';
    const base = { name: it.title, logo: it.logo, registryId: it.id };
    const cfg = it.kind === 'remote'
      ? { ...base, url: it.remote.url, headers }
      : { ...base, command: 'npx', args: ['-y', `${it.npm.identifier}@${it.npm.version}`, ...(it.npm.args || []).filter((a) => a.value || a.default).flatMap((a) => (a.type === 'named' ? [a.name, a.value || a.default] : [a.value || a.default]))], env };
    try {
      await run(() => api.saveServer(cfg));
      const srv = S.customServers.find((x) => x.registryId === it.id);
      closeModal();
      toast(srv?.status.connected ? `${it.title} connected` : `${it.title} added, but couldn’t connect: ${srv?.status.error || ''}`.slice(0, 160), !srv?.status.connected);
    } catch (_) { b.disabled = false; b.textContent = 'Retry'; }
  };
}

// ---------- permission prompts (ask once) ----------
const permQueue = [];
function showNextPermission() {
  if ($('#perm') || !permQueue.length) return;
  const r = permQueue[0];
  const args = JSON.stringify(r.args, null, 2);
  const o = document.createElement('div');
  o.className = 'overlay'; o.id = 'perm';
  if (r.kind === 'login') {
    o.innerHTML = `<div class="modal perm-app">
      <div class="perm-logo">${siteLogo(r.site, 'xl', r.loginName || r.site)}</div>
      <h3>Let ${esc(r.personaName)} sign in to ${esc(r.site)}?</h3>
      <p class="lead">With your saved login${r.username ? ` <strong>${esc(r.username)}</strong>` : ''}. The password is typed into the page for the bot. It never sees it.${S.touchId ? '<br>Confirm with Touch ID.' : ''}</p>
      <div class="modal-actions"><button class="btn danger" data-a="deny" style="margin-right:auto">Don't allow</button>${S.touchId ? `<button class="btn" data-a="always">Always allow</button><button class="btn primary" data-a="once">${icon('finger')}Use Touch ID</button>` : '<button class="btn" data-a="once">Allow once</button><button class="btn primary" data-a="always">Always allow</button>'}</div></div>`;
  } else if (r.kind === 'mymac') {
    o.innerHTML = `<div class="modal perm-app">
      <div class="perm-logo">${icon('monitor')}</div>
      <h3>Let ${esc(r.personaName)} use ${esc(r.connectorName)}?</h3>
      <p class="lead">${esc(r.personaName)} will see your screen and can click and type on it, the way you would. It asks again for every message. You can stop it any time with the Stop button.</p>
      <div class="modal-actions"><button class="btn danger" data-a="deny" style="margin-right:auto">Don't allow</button><button class="btn primary" data-a="once">Allow this time</button></div></div>`;
  } else if (r.kind === 'card') {
    o.innerHTML = `<div class="modal perm-app perm-card">
      <div class="cardchip big">${esc((r.connectorName || 'Card').split(' ')[0].slice(0, 4).toUpperCase())}</div>
      <h3>Let ${esc(r.personaName)} use your ${esc(r.connectorName)}?</h3>
      <p class="lead">${r.what ? `For <strong>${esc(r.what)}</strong>` : 'To fill in a payment form'}${r.site ? ` on <strong>${esc(r.site)}</strong>` : ''}${r.amount ? ` · <strong>${esc(r.amount)}</strong>` : ''}.<br>The card is typed into the page for the bot. It doesn't see the number, and it will ask you again before it pays.</p>
      <div class="modal-actions"><button class="btn danger" data-a="deny" style="margin-right:auto">Don't use</button><button class="btn primary" data-a="once">${S.touchId ? `${icon('finger')}Use with Touch ID` : 'Use it this time'}</button></div></div>`;
  } else
  o.innerHTML = (r.appSlug ? `<div class="modal perm-app">
    <div class="perm-logo">${siteLogo(appDomain(r.appSlug), 'xl', r.connectorName)}</div>
    <h3>Allow ${esc(r.personaName)} to use ${esc(r.connectorName)}?</h3>
    <p class="lead">It wants to <strong>${esc(r.toolName)}</strong>. Choose <strong>Always allow</strong> and it won't ask again for ${esc(r.connectorName)}.</p>
    <details class="perm-more"><summary>Details</summary><div class="perm-box">${esc(args.length > 1200 ? args.slice(0, 1200) + '…' : args)}</div></details>` : `<div class="modal">
    <h3>Allow ${esc(r.personaName)} to use ${esc(r.connectorName)}?</h3>
    <p class="lead">Choose <strong>Always allow</strong> and it won't ask again.</p>
    <div class="perm-box">${esc(r.toolName)}\n${esc(args.length > 1200 ? args.slice(0, 1200) + '…' : args)}</div>`) + `
    <div class="modal-actions">
      <button class="btn danger" data-a="deny" ${r.appSlug ? '' : 'style="margin-right:auto"'}>Don't allow</button>
      <button class="btn" data-a="once">Allow once</button>
      <button class="btn primary" data-a="always">Always allow</button>
    </div></div>`;
  $('#layer').appendChild(o);
  overlay(+1);
  const done = () => { if (!o.isConnected) return; permQueue.shift(); o.remove(); overlay(-1); showNextPermission(); };
  const answer = async (a) => {
    $$('[data-a]', o).forEach((x) => (x.disabled = true));
    const res = await api.answerPermission({ requestId: r.requestId, answer: a }).catch(() => false);
    if (res && res.touchFailed) { $$('[data-a]', o).forEach((x) => (x.disabled = false)); return; } // Touch ID cancelled: stay, try again
    done();
  };
  $$('[data-a]', o).forEach((b) => (b.onclick = () => answer(b.dataset.a)));
  // On a Mac with Touch ID, the fingerprint sheet comes up by itself for cards and saved logins.
  if (S.touchId && (r.kind === 'card' || r.kind === 'login')) setTimeout(() => { if (o.isConnected && !$('[data-a]:disabled', o)) answer('once'); }, 350);
}

// ---------- boot ----------
function initChrome() {
  initA11y();
  initNet();
  $('#btn-search').innerHTML = icon('search');
  $('#btn-new').innerHTML = icon('plus');
  $('#btn-new').title = `New bot or group chat (${MOD === '⌘' ? '⌘N' : 'Ctrl+N'})`;
  $('#btn-search').onclick = openPalette;
  $('#btn-new').onclick = () => { view = 'new'; render(); };
  $('#btn-connectors').innerHTML = `${icon('gear')}<span>Settings</span><span class="cx" id="cx"></span>`;
  $('#btn-connectors').title = 'Settings';
  $('#btn-connectors').onclick = () => go('settings', 'general');
  // Collapse the bot list to a thin rail: just the faces and your account button.
  const sbToggle = $('#btn-collapse');
  const sbApply = (on) => { $('#sidebar').classList.toggle('collapsed', on); sbToggle.innerHTML = icon('panel'); sbToggle.title = on ? 'Show the bot list' : 'Collapse the bot list'; sbToggle.setAttribute('aria-label', sbToggle.title); sbToggle.setAttribute('aria-expanded', String(!on)); };
  sbApply(!!loadPref('sbCollapsed', false));
  sbToggle.onclick = () => { const on = !$('#sidebar').classList.contains('collapsed'); savePref('sbCollapsed', on); sbApply(on); };
  $('#btn-me').title = 'Account';
  $('#btn-me').onclick = (e) => openAccountMenu(e.currentTarget);
  addEventListener('keydown', (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
    if (mod && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key) && !$('#modal') && !$('.popover') && S?.ready) {
      const target = sortedBots()[+e.key - 1];
      if (target) { e.preventDefault(); openChat(target.id); }
    }
    if (mod && e.key === ',') { e.preventDefault(); go('settings'); }
    if (mod && e.key.toLowerCase() === 'f' && view === 'settings') { e.preventDefault(); $('#set-q')?.focus(); $('#set-q')?.select(); }
    else if (mod && e.key.toLowerCase() === 'n') { e.preventDefault(); closeModal(); view = 'new'; render(); }
    else if (e.key === 'Escape') { if ($('.popover')) closePopover(); else if ($('#modal')) closeModal(); else if (fsOpen) closeFullScreen(); }
  });
}
// Account menu (like Grok's): who you are, quick links, updates. Phone download isn't available yet.
// Delete account: erases everything Wayzerr keeps on this computer. Needs the word DELETE typed.
function openDeleteAccount() {
  modal(`<h3>Delete your account?</h3>
    <p class="lead">This erases everything Wayzerr keeps on this computer. It can’t be undone.</p>
    <ul class="del-list"><li>All your bots, group chats and memories</li><li>Saved logins, payment cards and API keys</li><li>Pictures, skills, settings and app connections</li><li>Your account on wayzerr.com (your email address and phone link), when you are online</li></ul>
    <p class="hint">Not touched: your Claude, ChatGPT or other plan accounts themselves, and chats those apps saved on their own. Wayzerr then restarts as a new install.</p>
    <label class="f" for="del-word">Type DELETE to confirm</label>
    <input id="del-word" autocomplete="off" spellcheck="false" placeholder="DELETE" />
    <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn danger" id="del-go" disabled>Delete everything</button></div>`, 'del-modal');
  const word = $('#del-word'), go_ = $('#del-go');
  word.oninput = () => { go_.disabled = word.value.trim().toUpperCase() !== 'DELETE'; };
  word.onkeydown = (e) => { if (e.key === 'Enter' && !go_.disabled) go_.click(); };
  go_.onclick = async () => {
    if (go_.disabled) return;
    go_.disabled = true; word.disabled = true; go_.textContent = 'Deleting…';
    const run = async (localOnly) => {
      try { const r = await api.deleteAccount({ word: word.value, localOnly }); try { localStorage.clear(); } catch (_) {} toast(r && r.remote === false ? 'Erased on this computer. Your email address is still on wayzerr.com: email info@wayzerr.com and we will remove it. Restarting…' : 'Everything was deleted. Restarting…'); }
      catch (e) {
        toast(e.message, true); go_.textContent = 'Delete everything'; word.disabled = false; go_.disabled = false;
        if (!$('#del-local')) { const b = document.createElement('button'); b.className = 'btn'; b.id = 'del-local'; b.type = 'button'; b.textContent = 'Erase this computer only'; b.onclick = () => { b.disabled = true; go_.disabled = true; run(true); }; go_.parentNode.prepend(b); }
      }
    };
    run(false);
  };
  word.focus();
}
function openAccountMenu(anchor) {
  const name = (S.settings.userName || 'Me').trim();
  const bots = S.personas.filter((p) => !p.group).length, groups = S.personas.filter((p) => p.group).length;
  const items = [
    ['cal', 'Calendar', () => window.openCalendar?.(S.activePersonaId && !(active()?.group) ? S.activePersonaId : undefined)],
    ['gear', 'Settings', () => go('settings', 'general')],
    ['help', 'Help', () => go('settings', 'help')],
    ['connectors', 'Connectors', () => go('settings', 'connectors')],
    ['sparkle', "What's new", () => showWhatsNew(S.version, S.notes || [], false)],
    ['download', 'Check for updates', async () => { try { const r = await api.updateCheck(); toast(r?.update ? `Wayzerr ${r.update.version} is ready — press “Restart to update” above your account` : `You're up to date. To update, put the new ${INSTALLER} in your Downloads folder.`); } catch (e) { toast(e.message, true); } }],
  ];
  const pop = openPopover(`<div class="acct-menu">
      <div class="acct-head"><span class="me acct-av">${esc(name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase())}</span>
        <div class="grow"><div class="acct-nm">${esc(name)}</div><div class="acct-sub">${bots} bot${bots === 1 ? '' : 's'}${groups ? ` · ${groups} group${groups === 1 ? '' : 's'}` : ''}</div></div></div>
      <div class="menu">
        ${items.map((it, i) => `<button data-i="${i}">${icon(it[0])}${esc(it[1])}</button>`).join('')}
        <button disabled class="acct-off" title="Not available yet">${icon('phone')}Download for phone<span class="acct-soon">Soon</span></button>
      </div>
      <div class="acct-foot">${icon('info')}Wayzerr ${esc(S.version || '')}</div>
    </div>`, anchor, 'up');
  $$('.menu button[data-i]', pop).forEach((b) => (b.onclick = () => { closePopover(); items[+b.dataset.i][2](); }));
}
function updateMe() {
  const n = (S.settings.userName || 'Me').trim();
  $('#btn-me').textContent = n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

api.onState((s) => {
  S = s;
  updateMe();
  sendBotPics().catch(() => {});
  if (!$('#modal') && !$('#palette')) render();
  else renderSidebar();
});
// A bot does its rainbow spin only when it has just replied.
function celebrate(id) {
  setTimeout(() => {
    const chars = [$(`#bot-list .row[data-id="${id}"] .char`), ...(S.activePersonaId === id ? [$('.bot-pill .char'), $('.chat-empty .char')] : [])].filter(Boolean);
    chars.forEach((c) => window.Characters.play(c, 'spinRainbow'));
  }, 250);
}
// The answer as it arrives (streaming): shown in a bubble above the "working" line, replaced by the saved message.
const drafts = new Map();
const shownLen = new Map(); // how much of each live draft is on screen
const lastDraftAt = new Map(); // so a reply that was already shown live isn't typed out a second time
let draftRaf = 0;
function drawDraft(p) {
  const col = $('#msg-col'); if (!col || !p) return;
  const text = drafts.get(p.id);
  let el = $('#live-draft');
  if (!text) { el?.remove(); shownLen.delete(p.id); return; }
  lastDraftAt.set(p.id, Date.now());
  if (!el) { el = document.createElement('div'); el.id = 'live-draft'; el.className = 'msg assistant draft'; el.setAttribute('aria-hidden', 'true'); el.innerHTML = '<div class="bubble"></div>'; const live = $('#live'); live ? col.insertBefore(el, live) : col.appendChild(el); }
  stepDraft(p.id);
}
// The AI sends its words in bursts; this glides between them so the text appears to be written live.
function stepDraft(id) {
  cancelAnimationFrame(draftRaf); draftRaf = 0;
  const el = $('#live-draft'), text = drafts.get(id);
  if (!el || !text || active()?.id !== id) return;
  let n = shownLen.get(id) || 0;
  if (n > text.length) n = 0;
  if (n < text.length) n = Math.min(text.length, n + Math.max(2, Math.ceil((text.length - n) / 6)));
  shownLen.set(id, n);
  const bubble = el.querySelector('.bubble');
  const part = text.slice(0, n);
  bubble.innerHTML = md((part.match(/```/g) || []).length % 2 ? part + '\n```' : part);
  addCaret(bubble);
  const box = $('#messages');
  if (box && box.scrollHeight - box.scrollTop - box.clientHeight < 160) box.scrollTop = box.scrollHeight;
  if (n < text.length) draftRaf = requestAnimationFrame(() => stepDraft(id));
}
function addCaret(root) {
  root.querySelector('.caret')?.remove();
  let n = root;
  while (n.lastElementChild && !/^(PRE|TABLE|IMG|SVG)$/i.test(n.lastElementChild.tagName)) n = n.lastElementChild;
  const c = document.createElement('span');
  c.className = 'caret';
  n.appendChild(c);
}
// A finished reply (cloud AIs answer in one piece) is written out as if typed: quick, never longer than ~2 seconds.
function typeIn(bubble) {
  if (!bubble || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const walker = document.createTreeWalker(bubble, NodeFilter.SHOW_TEXT);
  const parts = [];
  let node, total = 0;
  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('.use-line, .code-bar')) continue;
    parts.push({ node, full: node.nodeValue, start: total });
    total += node.nodeValue.length;
  }
  if (total < 40) return; // short replies just appear
  parts.forEach((x) => (x.node.nodeValue = ''));
  const caret = document.createElement('span');
  caret.className = 'caret';
  const box = $('#messages');
  const stick = box ? box.scrollHeight - box.scrollTop - box.clientHeight < 160 : false;
  const dur = Math.min(2000, Math.max(450, total * 1.5)); // ~650 characters a second
  const wait = parseFloat(getComputedStyle(bubble.closest('.msg') || bubble).animationDelay) * 1000 || 0;
  let t0 = null;
  const finish = () => { parts.forEach((x) => (x.node.nodeValue = x.full)); caret.remove(); };
  const frame = (now) => {
    if (!bubble.isConnected) return;
    if (t0 === null) t0 = now + wait;
    const upto = now < t0 ? 0 : Math.min(total, Math.ceil(((now - t0) / dur) * total));
    let last = parts[0];
    for (const x of parts) {
      const k = Math.max(0, Math.min(x.full.length, upto - x.start));
      if (x.node.nodeValue.length !== k) x.node.nodeValue = x.full.slice(0, k);
      if (k > 0) last = x;
    }
    if (last?.node.parentNode) last.node.parentNode.insertBefore(caret, last.node.nextSibling);
    if (stick && box) box.scrollTop = box.scrollHeight;
    if (upto < total) requestAnimationFrame(frame); else finish();
  };
  requestAnimationFrame(frame);
}
api.onChatEvent(async (e) => {
  if (e.type === 'stream') {
    if (e.text) drafts.set(e.personaId, e.text); else drafts.delete(e.personaId);
    if (e.thinking !== undefined) { noteThink(e.personaId, { thinking: e.thinking }); if (thinkOpen && active()?.id === e.personaId) drawThink(active()); }
    const p = active(); if (view === 'chat' && p && p.id === e.personaId) drawDraft(p);
    return;
  }
  if (e.type === 'done') {
    drafts.delete(e.personaId); thinks.delete(e.personaId);
    if (active()?.id === e.personaId) { $('#live-draft')?.remove(); $('#live-think')?.remove(); }
    celebrate(e.personaId);
    if (!busy.has(e.personaId)) return;
    busy.delete(e.personaId);
    S = await api.getState();
    if (!$('#modal') && !$('#palette')) render(); else renderSidebar();
    return;
  }
  if (e.type !== 'status') return;
  if (e.text && !/^(Thinking|Typing|Writing)$/i.test(e.text)) noteThink(e.personaId, { step: e.text });
  busy.set(e.personaId, { activity: e.activity, text: e.text, botId: e.botId, botName: e.botId !== e.personaId ? e.botName : null, since: busy.get(e.personaId)?.since || Date.now() });
  if (e.browser && e.personaId === S.activePersonaId) { if (scrTab !== 'computer') setScrTab('computer'); if (!screenOpen && !fsOpen) setScreen(true); }
  renderBrowserState();
  const p = active();
  if (view === 'chat' && p && p.id === e.personaId) { updateLive(p); updateHead(p); }
  renderSidebar();
});
api.onPermissionRequest((r) => { permQueue.push(r); showNextPermission(); });
api.onPermissionCancel(({ requestId }) => {
  const i = permQueue.findIndex((r) => r.requestId === requestId);
  if (i === 0) { $('#perm')?.remove(); overlay(-1); }
  if (i >= 0) permQueue.splice(i, 1);
  showNextPermission();
});
api.onBrowserState((st) => { if (st.personaId && st.personaId !== screenFor) return; browserSt = st; renderBrowserState(); syncScreen(); });

// ---------- in-app updates ----------
let updateInfo = null;
let updating = false;
const dismissedVer = () => { try { return localStorage.getItem('persona-update-later') || ''; } catch (_) { return ''; } };
function showUpdatePill() {
  const card = $('#update-card');
  if (!card) return;
  const v = updateInfo?.update?.version, preview = !!updateInfo?.preview;
  if (!v || (!preview && dismissedVer() === v && !updating)) { card.classList.add('hidden'); return; }
  const dv = v + (preview ? '-preview' : '');
  if (!card.classList.contains('hidden') && card.dataset.v === dv && !updating) return;
  card.dataset.v = dv;
  const notes = (updateInfo.update.notes || []).filter(Boolean);
  card.innerHTML = `<div class="uv">
      <div class="uv-top"><div class="uv-t"><b>${preview ? 'Update preview' : 'Update ready'}</b><span>Version ${esc(v)}</span></div><button class="uv-x" id="uc-x" type="button" title="Later" aria-label="Later">${icon('x')}</button></div>
      ${notes.length ? `<button class="uv-more" id="uc-more" type="button">See new changes</button>` : ''}
      <div class="uv-actions"><button class="uv-go" id="uc-go" type="button">${preview ? 'Close preview' : 'Restart to update'}</button><button class="uv-later" id="uc-later" type="button">Later</button></div>
      <p class="uv-sub" id="uc-sub">${preview ? 'This is only a preview. Nothing is installed.' : 'Wayzerr restarts for a few seconds. Your bots and chats stay.'}</p></div>`;
  card.classList.remove('hidden');
  const close = () => { if (preview) { updateInfo = card._prev || null; } else { try { localStorage.setItem('persona-update-later', v); } catch (_) {} } card.classList.add('leaving'); setTimeout(() => { card.classList.add('hidden'); card.classList.remove('leaving'); if (preview) card.dataset.v = ''; }, 260); };
  $('#uc-x').onclick = close;
  $('#uc-later').onclick = close;
  $('#uc-go').onclick = preview ? close : installUpdate;
  const more = $('#uc-more'); if (more) more.onclick = () => showWhatsNew(v, notes, !preview);
}
// Temporary: plays the update alert with this version's notes, so you can see how it looks. Nothing is installed.
function playUpdateAlert() {
  const card = $('#update-card');
  if (!card) return;
  const prev = updateInfo && !updateInfo.preview ? updateInfo : null;
  const notes = prev?.update?.notes?.length ? prev.update.notes : ['A new look for the Schedule tab and calendar.', 'You now get a notification when a scheduled task runs.', 'A new Wayzerr logo, with a light and a dark version.', 'Smaller fixes and speed improvements.'];
  card._prev = prev;
  card.classList.add('hidden'); card.dataset.v = '';
  updateInfo = { update: { version: prev?.update?.version || S.version || '1.0.0', notes }, preview: true };
  showUpdatePill();
  if (view === 'settings') toast('Look at the bottom left of the sidebar.');
}
// Publisher mode — only for the app's owner: new builds in Downloads go live on the Netlify site for everyone.
async function drawPublish() {
  const box = $('#pub-box');
  if (!box) return;
  let st; try { st = await api.publishState(); } catch (_) { return; }
  box.innerHTML = `<details class="pub"><summary>${icon('cloud')}Publish updates for everyone ${st.hasToken ? `<span class="pub-on">On · ${esc(st.site)}</span>` : '<span class="pub-off">Off</span>'}</summary>
    <div class="pub-body">
      <div class="hint">When a newer Wayzerr.dmg lands in your Downloads, Wayzerr uploads it for you. The Download button on your site gets the new version and every user's app shows the update card. Only you need this — the key stays encrypted on this computer.</div>
      <label class="f">Where to publish</label>
      <input id="pub-site" value="${esc(st.site)}" placeholder="grigorsworks/persona  (or yoursite.netlify.app)">
      <label class="f">Key ${st.hasToken ? `<span class="pub-on">saved${st.user ? ' · ' + esc(st.user) : ''}</span>` : ''}</label>
      <div class="row-flex"><input id="pub-token" class="grow" type="password" autocomplete="off" placeholder="${st.hasToken ? '•••••••• (saved — paste a new one to replace)' : 'github_pat_…'}"><button class="btn" id="pub-save">Save</button></div>
      <div class="hint">GitHub: <a href="https://github.com/settings/personal-access-tokens/new" target="_blank">make a key</a> → Fine-grained → Only select repositories: <b>persona</b> → Permissions → Contents: <b>Read and write</b> → Generate. Netlify: <a href="https://app.netlify.com/user/applications#personal-access-tokens" target="_blank">make a key</a> → New access token.</div>
      <label class="cl-check" style="margin-top:10px"><input type="checkbox" id="pub-auto" ${st.auto ? 'checked' : ''}><span>Publish automatically when a new Wayzerr.dmg arrives</span></label>
      <div class="row-flex" style="margin-top:10px"><button class="btn primary" id="pub-now" ${st.hasToken ? '' : 'disabled'}>${icon('cloud')}Publish the Wayzerr.dmg in Downloads now</button></div>
      <div class="hint" id="pub-status">${st.last ? `Last published: Wayzerr ${esc(st.last.version)} · ${fmtTime(st.last.at)}` : ''}</div>
    </div></details>`;
  $('#pub-save').onclick = async () => {
    const b = $('#pub-save'); b.disabled = true; b.textContent = 'Checking…';
    try { await api.publishSave({ site: $('#pub-site').value, token: $('#pub-token').value || undefined }); toast('Saved — publishing is on'); drawPublish(); }
    catch (e) { toast(e.message, true); b.disabled = false; b.textContent = 'Save'; }
  };
  $('#pub-auto').onchange = (e) => api.publishSave({ auto: e.target.checked });
  $('#pub-now').onclick = async () => {
    const b = $('#pub-now'); b.disabled = true;
    try { await api.publishNow(); toast('Published — everyone gets the update'); drawPublish(); } catch (e) { toast(e.message, true); b.disabled = false; }
  };
  box.querySelector('details').open = !st.hasToken ? box.querySelector('details').open : false;
}
api.onPublishProgress?.((m) => { const el = $('#pub-status'); if (el) el.textContent = m; toast(m, /failed/i.test(m)); });

// "What's new" — a short description of an update.
function showWhatsNew(version, notes, canInstall) {
  const list = (notes || []).filter(Boolean);
  const o = modal(`<div class="wn-head"><div><h3 style="margin:0">What's new in Wayzerr ${esc(version)}</h3><div class="hint" style="margin-top:2px">${canInstall ? 'Ready to install' : 'You have this version'}</div></div></div>
    ${list.length ? `<ul class="wn-list">${list.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>` : '<p class="lead">Improvements and fixes.</p>'}
    <div class="modal-actions">${canInstall ? `<button class="btn" data-close>Later</button><button class="btn primary" id="wn-go">${icon('reload')}Restart to update</button>` : '<button class="btn primary" data-close>Close</button>'}</div>`, 'wn-modal');
  o.querySelector('#wn-go')?.addEventListener('click', () => { closeModal(); installUpdate(); });
}
async function installUpdate() {
  if (!updateInfo?.update || updating) return;
  updating = true;
  const go = $('#uc-go');
  if (go) { go.disabled = true; go.textContent = 'Restarting…'; }
  $('#uc-sub') && ($('#uc-sub').textContent = 'Wayzerr will reopen in a few seconds.');
  try { await api.updateInstall(); } catch (e) { updating = false; toast(e.message, true); if (go) { go.disabled = false; go.textContent = 'Restart'; } }
}
// A scheduled task has run: a card in the corner, whatever you were doing
api.onScheduleFired?.((m) => {
  document.querySelectorAll('.sa-card').forEach((n) => n.remove());
  const el = document.createElement('div');
  el.className = 'sa-card'; el.setAttribute('role', 'alert');
  el.innerHTML = `<div class="sa-top"><b>${esc(m.botName)} · ${esc(m.title)}</b><button class="sa-x" type="button" aria-label="Close">${icon('x')}</button></div><p>${esc(m.text || 'Done.')}</p><button class="sa-open" type="button">Open chat</button>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('on'));
  const close = () => { el.classList.remove('on'); setTimeout(() => el.remove(), 220); };
  $('.sa-x', el).onclick = close;
  $('.sa-open', el).onclick = () => { close(); view = 'chat'; try { openChat(m.botId); } catch (_) { render(); } };
  setTimeout(close, 20000);
});
api.onUpdateAvailable((r) => { updateInfo = r; showUpdatePill(); if (view === 'settings' && settingsTab === 'general') renderSettings(); });
api.onUpdateProgress((m) => { const sub = $('#uc-sub'); if (sub) sub.textContent = m; else toast(m); });
// Look again whenever you come back to Wayzerr (e.g. after a new Wayzerr.dmg lands in Downloads).
let lastUpdateCheck = 0;
addEventListener('focus', () => { if (Date.now() - lastUpdateCheck < 20000) return; lastUpdateCheck = Date.now(); api.updateCheck?.().then((r) => { if (r) { updateInfo = r; showUpdatePill(); } }).catch(() => {}); });


// "Try again" under an error: asks your last question again (the failed attempt is removed first).
document.addEventListener('click', async (e) => {
  if (!e.target.closest?.('.err-retry')) return;
  const p = active();
  if (!p || busy.has(p.id)) return;
  const msgs = S.chats[p.id] || [];
  let i = msgs.length - 1;
  while (i >= 0 && !(msgs[i].role === 'user' && !msgs[i].from)) i--;
  if (i < 0) return;
  const m = msgs[i];
  chatError = null;
  try { S = await api.truncateChat({ personaId: p.id, index: i }); } catch (err) { return toast(err.message, true); }
  mounted = null; render();
  await send(p, { text: m.content, attachments: m.attachments });
});

// "Copy" at the bottom of a code box: copies just the code inside it.
document.addEventListener('click', async (e) => {
  const btn = e.target.closest?.('.code-copy');
  if (!btn) return;
  const code = btn.closest('.codebox')?.querySelector('pre code')?.textContent ?? '';
  try { await navigator.clipboard.writeText(code); }
  catch (_) { const t = document.createElement('textarea'); t.value = code; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
  btn.textContent = 'Copied ✓';
  btn.classList.add('done');
  clearTimeout(btn._t);
  btn._t = setTimeout(() => { btn.textContent = 'Copy'; btn.classList.remove('done'); }, 1600);
});

// ---------- accessibility ----------
// Icon-only buttons and unlabeled fields get a spoken name (from their tooltip, row label or placeholder).
function a11yLabelAll() {
  document.querySelectorAll('#k-bot .k-tile').forEach((b, i) => { if (!b.getAttribute('aria-label')) b.setAttribute('aria-label', `Character ${i + 1}`); });
  document.querySelectorAll('select.mp-select').forEach((s) => { if (!s.getAttribute('aria-label')) s.setAttribute('aria-label', 'Account'); });
  document.querySelectorAll('.k-arrow').forEach((b) => b.setAttribute('aria-label', `${+b.dataset.d < 0 ? 'Previous' : 'Next'} ${b.dataset.k === 'acc' ? 'accessory' : 'look'}`));
  document.querySelectorAll('button, [role=button]').forEach((b) => {
    if (b.getAttribute('aria-label') || b.getAttribute('aria-labelledby') || b.textContent.trim()) return;
    const t = (b.getAttribute('title') || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
    if (t) b.setAttribute('aria-label', t);
  });
  document.querySelectorAll('input:not([type=hidden]):not([type=file]), textarea, select').forEach((f) => {
    if (f.getAttribute('aria-label') || f.getAttribute('aria-labelledby') || f.labels?.length) return;
    const row = f.closest('.card-row, .prow, .skill-add, .set-search');
    const name = row?.querySelector('.nm')?.textContent?.trim() || f.getAttribute('placeholder') || f.getAttribute('title') || '';
    if (name) f.setAttribute('aria-label', name);
  });
}
// What screen readers say when something new happens (a new reply, a finished task).
function announce(text) {
  const sr = $('#sr-live');
  if (!sr || !text) return;
  sr.textContent = '';
  requestAnimationFrame(() => { sr.textContent = text; });
}
// A quiet note at the top while you're offline (local AIs and saved chats still work).
function initNet() {
  const bar = document.createElement('div');
  bar.id = 'offline-bar'; bar.className = 'offline-bar hidden'; bar.setAttribute('role', 'status');
  bar.textContent = 'You’re offline. Cloud AIs can’t answer until you’re back online. Your chats are safe, and local AIs still work.';
  document.body.appendChild(bar);
  const sync = () => bar.classList.toggle('hidden', navigator.onLine);
  addEventListener('offline', sync);
  addEventListener('online', () => { sync(); toast('Back online'); });
  sync();
}
function initA11y() {
  const sr = document.createElement('div');
  sr.id = 'sr-live'; sr.className = 'sr-only';
  sr.setAttribute('role', 'status'); sr.setAttribute('aria-live', 'polite'); sr.setAttribute('aria-atomic', 'true');
  document.body.appendChild(sr);
  let t = 0;
  new MutationObserver(() => { clearTimeout(t); t = setTimeout(a11yLabelAll, 120); }).observe(document.body, { childList: true, subtree: true });
  a11yLabelAll();
}
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type=hidden]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Characters react when you hover them.
document.addEventListener('mouseover', (e) => {
  const host = e.target.closest('.row, .p-item, .opt, .bot-pill, .char-btn, .chat-empty .char, .profile .char');
  if (!host || host.contains(e.relatedTarget)) return;
  const c = host.classList.contains('char') ? host : host.querySelector('.char');
  if (c) window.Characters.play(c, ['bounce', 'glance', 'doubleHop', 'tilt', 'jump'][Math.floor(Math.random() * 5)]);
});

(async () => {
  window.Characters.startIdle();
  initChrome();
  api.setZoom?.((+loadPref('textSize2', 1) || 1) * (typeof TEXT_BASE === 'number' ? TEXT_BASE : 0.92));
  S = await api.getState();
  updateMe();
  initScreen();
  browserSt = await api.browserState();
  renderBrowserState();
  render();
  loadIcons();
  try { appsCache = await api.aiApps(); updateConnBadge(); } catch (_) {}
  api.onAiApps((list) => { appsCache = list; updateConnBadge(); if ($('#apps-grid')) drawApps(list); if ($('.mp')) $('.mp').dispatchEvent(new Event('apps')); });
})();
