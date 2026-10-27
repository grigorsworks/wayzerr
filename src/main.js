const { app, BrowserWindow, ipcMain, dialog, safeStorage, shell, session, powerSaveBlocker, nativeTheme, systemPreferences } = require('electron');
// The data folder is now "Wayzerr" (it used to be "Persona"): an old folder is moved over once, so bots, chats and passwords stay.
if (!process.env.WAYZERR_DATA_DIR) {
  try {
    const p = require('path'), f = require('fs'), root = app.getPath('appData');
    const mine = p.join(root, 'Wayzerr'), old = p.join(root, 'Persona');
    if (!f.existsSync(p.join(mine, 'wayzerr-data.json')) && !f.existsSync(p.join(mine, 'persona-data.json')) && f.existsSync(p.join(old, 'persona-data.json'))) { // a fresh Wayzerr folder may hold only caches: set it aside
      if (f.existsSync(mine)) f.renameSync(mine, mine + '-new-' + Date.now());
      f.renameSync(old, mine);
    }
    app.setPath('userData', mine);
  } catch (_) {}
}
app.setName('Wayzerr');
if (process.platform === 'win32') app.setAppUserModelId('com.persona.app'); // Windows: the same id the installer gives the Start menu shortcut, so the taskbar and notifications show Wayzerr and its icon
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Store } = require('./store');
const { BUILTIN, McpManager } = require('./connectors');
const { runTurn } = require('./ai');
const { TYPES, listModels } = require('./providers');
const { BotBrowser } = require('./browser');
const { Vault } = require('./vault');
const { createTeam } = require('./team');
const { startWayzerrMcp } = require('./wayzerr-mcp');
const aiapps = require('./aiapps');
const cli = require('./cliagents');
const PKG = require('../package.json');
const CHANGELOG = (() => { try { return require('./changelog.json'); } catch (_) { return {}; } })();
const skills = require('./skills');
const updater = require('./updater');
const createAccount = require('./account');
const TERMS_VERSION = '2026-10-27'; // bump when the Terms or Privacy Policy change materially: everyone sees the agree screen again
let account = null, accountReady = null;
const publisher = require('./publisher');
const { createPhone } = require('./phone');
const localStt = require('./localstt');
let phone = null;
let awakeId = -1;
const schedules = require('./schedules');
let pendingUpdate = null;

let win;
let store;
let vault;
const mcp = new McpManager();
const pendingPermissions = new Map();
const running = new Map(); // personaId -> AbortController
// Every bot gets its own browser (same logins, separate pages) so they never get in each other's way.
const browsers = new Map();
let screenBot = null; // the bot whose browser the Screen panel shows
let screenBounds = null;
function browserFor(id) {
  let b = browsers.get(id);
  if (!b) {
    b = new BotBrowser(() => win, (st) => win && !win.isDestroyed() && win.webContents.send('browser-state', st), id);
    b.onTeach = (t) => win && !win.isDestroyed() && win.webContents.send('teach-progress', t);
    browsers.set(id, b);
    if (screenBounds) b.setBounds({ ...screenBounds, mode: 'hidden' });
  }
  return b;
}
const shown = () => (screenBot ? browserFor(screenBot) : null);

// ---------- Secrets (API keys, passwords) ----------
// Encrypted with a private key file that only this computer user can read. We used to use the macOS
// Keychain, but because Wayzerr isn't signed by Apple, macOS asked for your password after every
// update. Now it asks at most once (to move old secrets over), then never again.
const dataDir = () => process.env.WAYZERR_DATA_DIR || app.getPath('userData');
let _mk = null;
function masterKey() {
  if (_mk) return _mk;
  const f = path.join(dataDir(), '.wayzerr-key'), oldF = path.join(dataDir(), '.persona-key');
  if (!fs.existsSync(f) && fs.existsSync(oldF)) { try { fs.renameSync(oldF, f); } catch (_) {} }
  try { _mk = Buffer.from(fs.readFileSync(f, 'utf8').trim(), 'base64'); if (_mk.length !== 32) throw new Error('bad key'); }
  catch (_) { _mk = crypto.randomBytes(32); fs.mkdirSync(dataDir(), { recursive: true }); fs.writeFileSync(f, _mk.toString('base64'), { mode: 0o600 }); }
  return _mk;
}
function enc(key) {
  if (!key) return null;
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([c.update(String(key), 'utf8'), c.final()]);
  return { mode: 'aes', value: Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64') };
}
function dec(k) {
  if (!k) return null;
  try {
    const buf = Buffer.from(k.value, 'base64');
    if (k.mode === 'aes') {
      const d = crypto.createDecipheriv('aes-256-gcm', masterKey(), buf.subarray(0, 12));
      d.setAuthTag(buf.subarray(12, 28));
      return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
    }
    if (k.mode === 'safe') return safeStorage.decryptString(buf); // old Keychain secrets (moved over once)
    return buf.toString();
  } catch (_) {
    return null;
  }
}
// One-time move of old Keychain-encrypted secrets → one password prompt at most, then never again.
function migrateSecrets() {
  let found = 0, moved = 0;
  const walk = (o) => {
    if (!o || typeof o !== 'object') return;
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object' && (v.mode === 'safe' || v.mode === 'plain') && typeof v.value === 'string') {
        found++;
        const plain = dec(v);
        if (plain != null) { o[k] = enc(plain); moved++; }
      } else walk(v);
    }
  };
  walk(store.data);
  if (moved) store.save();
  return { found, moved };
}
const maskKey = (k) => (k ? k.slice(0, 5) + '…' + k.slice(-4) : null);
const providers = () => (store.data.settings.providers ||= []);
const findProvider = (id) => providers().find((p) => p.id === id);

// Move the single key from older versions into the providers list.
function migrate() {
  const st = store.data.settings;
  // 1.1.48: one setting for all apps (General → Your apps) replaces the per-app switches.
  if (st.appModes && Object.keys(st.appModes).length) { st.appModes = {}; store.save(); }
  if (!providers().length && store.data.encryptedKey) {
    const isOpenAI = !st.baseUrl || /api\.openai\.com/.test(st.baseUrl);
    const id = crypto.randomBytes(3).toString('hex');
    providers().push({ id, type: isOpenAI ? 'openai' : 'custom', name: isOpenAI ? 'OpenAI' : 'Custom', baseUrl: st.baseUrl || TYPES.openai.baseUrl, key: store.data.encryptedKey, models: st.model ? [{ id: st.model, name: '' }] : [] });
    if (st.model) st.defaultModel = { providerId: id, model: st.model };
    store.save();
  }
}

// ----- usage (messages / tokens / cost) per provider: today, this month, last days, all time -----
// Everything is counted here on this computer. Cloud plans don't tell us their limits, so this is
// "how much you've used through Wayzerr" (numbers marked `estimated` are guessed from text length).
const p2 = (n) => String(n).padStart(2, '0');
const localDay = (d = new Date()) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const monthKey = () => localDay().slice(0, 7);
const blankUse = () => ({ input: 0, output: 0, cached: 0, requests: 0, cost: 0, estimated: 0 });
const posNum = (v) => { v = +v; return Number.isFinite(v) && v > 0 ? v : 0; };
function addTo(r, n) { r.cached = (r.cached || 0) + (n.cached || 0); r.input = (r.input || 0) + n.input; r.output = (r.output || 0) + n.output; r.cost = (r.cost || 0) + n.cost; r.requests = (r.requests || 0) + 1; if (n.estimated) r.estimated = (r.estimated || 0) + 1; }
// All-time totals start from the months already saved, so "all time" is never smaller than "this month".
function usageTotals() {
  if (store.data.usageTotal) return store.data.usageTotal;
  const seeded = {};
  for (const month of Object.values(store.data.usage || {})) for (const [id, r] of Object.entries(month || {})) {
    const t = (seeded[id] ||= blankUse());
    t.input += posNum(r.input); t.cached += posNum(r.cached); t.output += posNum(r.output); t.cost += posNum(r.cost); t.requests += posNum(r.requests); t.estimated += posNum(r.estimated);
  }
  return (store.data.usageTotal = seeded);
}
const cachedInside = (u) => posNum(u?.cached_input_tokens ?? u?.prompt_tokens_details?.cached_tokens ?? u?.input_tokens_details?.cached_tokens);
function normUsage(u) {
  u = u || {}; // a reply with no numbers still counts as one message
  return {
    // Claude lists cache reads separately (tokens written to the cache count as input). ChatGPT/OpenAI count cached tokens
    // inside the input, so they are taken out: "input" is what was newly read, "cached" is what was re-read cheaply.
    input: Math.max(0, posNum(u.prompt_tokens ?? u.input_tokens ?? u.input) - cachedInside(u)) + posNum(u.cache_creation_input_tokens),
    cached: cachedInside(u) + posNum(u.cache_read_input_tokens),
    output: posNum(u.completion_tokens ?? u.output_tokens ?? u.output),
    cost: posNum(u.cost ?? u.total_cost_usd),
    estimated: !!u.estimated,
  };
}
function addUsage(providerId, u) {
  if (!providerId) return;
  const totals = usageTotals(); // seeded from the saved months before this message is added to them
  const n = normUsage(u);
  addTo(((store.data.usage ||= {})[monthKey()] ||= {})[providerId] ||= blankUse(), n);
  const days = (store.data.usageDays ||= {});
  addTo((days[localDay()] ||= {})[providerId] ||= blankUse(), n);
  const old = Object.keys(days).sort().slice(0, -45); // keep the last 45 days
  for (const k of old) delete days[k];
  addTo(totals[providerId] ||= blankUse(), n);
  store.save();
  pushState();
}
// Messages per day for the last 7 days (oldest first), for the little bars.
function usageWeek() {
  const days = store.data.usageDays || {}, out = {};
  const ids = new Set(Object.values(days).flatMap((d) => Object.keys(d)));
  for (const id of ids) out[id] = Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return days[localDay(d)]?.[id]?.requests || 0; });
  return out;
}

function resolveModel(persona) {
  const st = store.data.settings;
  for (const sel of [persona?.model, st.defaultModel]) {
    if (!sel) continue;
    const p = findProvider(sel.providerId);
    if (p && sel.model) return { providerId: p.id, model: sel.model, baseUrl: p.baseUrl, apiKey: dec(p.key), effort: persona?.effort || st.defaultEffort || 'default', cli: TYPES[p.type]?.agent || null, providerName: p.name, providerType: p.type, local: !!TYPES[p.type]?.local, modelInfo: (p.models || []).find((m) => (m.id || m) === sel.model) || null, models: (p.models || []).map((m) => m.id || m) };
  }
  return null;
}

// A failed background task (a network call, a tool) is logged instead of taking the app down.
// A stray error (a closed connection, a window that is already gone) must never pop up a "JavaScript error" box.
process.on('uncaughtException', (e) => { try { console.error('Background error:', e && e.stack ? e.stack : e); } catch (_) {} });
process.on('unhandledRejection', (e) => { console.error('Background task failed:', e && e.message ? e.message : e); });

// ---------- Window ----------
const themeOf = () => (['light', 'dark'].includes(store?.data?.settings?.theme) ? store.data.settings.theme : 'system');
function createWindow() {
  nativeTheme.themeSource = themeOf();
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 820,
    minHeight: 560,
    title: 'Wayzerr',
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0a0a0a' : '#ffffff',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    autoHideMenuBar: process.platform !== 'darwin', // Windows/Linux: no File/Edit menu bar (Alt shows it)
    icon: process.platform !== 'darwin' ? path.join(__dirname, 'icon.png') : undefined, // Windows/Linux window and taskbar icon
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  // The microphone (speech to text) is allowed for Wayzerr's own window only — never for websites in the bot's browser.
  win.webContents.session.setPermissionRequestHandler((wc, perm, cb, details) => cb(perm !== 'media' || (wc === win.webContents && (details?.mediaTypes || ['audio']).every((t) => t === 'audio'))));
  win.webContents.session.setPermissionCheckHandler((wc, perm) => perm !== 'media' || wc === win?.webContents);
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  // Everything the Mac window hears about chats also goes to the phone app.
  const toWin = win.webContents.send.bind(win.webContents);
  win.webContents.send = (ch, ...a) => { try { phone?.forward(ch, a[0]); } catch (_) {} return toWin(ch, ...a); };
}

// Ollama and LM Studio were removed: forget any saved connection to them, and anything that pointed at one.
function dropRemovedProviders() {
  const list = providers();
  const gone = new Set(list.filter((x) => ['ollama', 'lmstudio'].includes(x.type)).map((x) => x.id));
  if (!gone.size) return;
  store.data.settings.providers = list.filter((x) => !gone.has(x.id));
  const st = store.data.settings;
  if (st.defaultModel && gone.has(st.defaultModel.providerId)) st.defaultModel = null;
  for (const bot of store.data.personas || []) if (bot.model && gone.has(bot.model.providerId)) delete bot.model;
  store.save();
}
// When the app's data moved from the "Persona" folder to "Wayzerr", chats written in the old folder in between could be left
// behind. Anything found there that this folder doesn't have yet (bots, chat messages, memories) is merged back, once.
function recoverOldData() {
  if (process.env.WAYZERR_DATA_DIR) return;
  const oldFile = path.join(app.getPath('appData'), 'Persona', 'persona-data.json');
  if (!fs.existsSync(oldFile)) return;
  let theirs; try { theirs = JSON.parse(fs.readFileSync(oldFile, 'utf8')); } catch (_) { return; }
  const d = store.data; let added = 0;
  const have = new Set((d.personas || []).map((p) => p.id));
  for (const p of theirs.personas || []) if (p && p.id && !have.has(p.id)) { d.personas.push(p); added++; }
  const key = (m) => `${m.role}|${m.ts || 0}|${String(m.content || '').slice(0, 60)}`;
  for (const [id, list] of Object.entries(theirs.chats || {})) {
    if (!Array.isArray(list) || !list.length) continue;
    const mine = (d.chats[id] ||= []);
    const seen = new Set(mine.map(key));
    const extra = list.filter((m) => m && !seen.has(key(m)));
    if (!extra.length) continue;
    added += extra.length;
    d.chats[id] = [...mine, ...extra].map((m, i) => [m, i]).sort((a, b) => ((a[0].ts || 0) - (b[0].ts || 0)) || a[1] - b[1]).map((x) => x[0]);
  }
  for (const [id, list] of Object.entries(theirs.memories || {})) {
    if (!Array.isArray(list)) continue;
    const mine = (d.memories[id] ||= []);
    const ids = new Set(mine.map((m) => m.id));
    for (const m of list) if (m && !ids.has(m.id)) { mine.push(m); added++; }
  }
  if (added) store.save();
  try { fs.renameSync(oldFile, oldFile.replace(/\.json$/, '.merged.json')); } catch (_) {} // never merged twice
  if (added) setTimeout(() => { try { dialog.showMessageBox({ type: 'info', message: 'Wayzerr found chats that were left in the old folder', detail: `${added} missing ${added === 1 ? 'item' : 'items'} (messages, bots or memories) were put back.` }).catch(() => {}); } catch (_) {} }, 2500);
}
app.whenReady().then(async () => {
  store = new Store(process.env.WAYZERR_DATA_DIR || app.getPath('userData'));
  try { dropRemovedProviders(); } catch (_) {}
  if (store.restored) setTimeout(() => { try { dialog.showMessageBox({ type: 'info', message: 'Wayzerr restored your bots and chats', detail: 'Your saved data was damaged, so Wayzerr opened the last good copy. The damaged file was kept next to it.' }); } catch (_) {} }, 1500);
  try { migrateSecrets(); } catch (_) {}
  vault = new Vault(store, enc, dec);
  migrate();
  try { recoverOldData(); } catch (e) { console.error('recover failed', e && e.message); }
  account = createAccount({ store, enc, dec, base: PKG.accountUrl || new URL(PKG.updateFeedCloud).origin, openUrl: (u) => shell.openExternal(u), onChange: () => pushState() });
  accountReady = account.probe().catch(() => {});
  setTimeout(() => account.check().catch(() => {}), 4000);
  // One folder shared by every bot (and by each bot's computer), so there is nothing to choose.
  try {
    fs.mkdirSync(sharedFilesDir(), { recursive: true });
    Object.assign(store.data.connectors.files, { folder: sharedFilesDir(), enabled: true });
    // On a Mac with computers the browser is something you add (Screen panel → Computer → Browser); until you do it stays off.
    if (store.data.settings.browserChoice !== 'on') { store.data.settings.browserChoice = 'on'; store.data.connectors.browser.enabled = true; } // the browser is built in, so it is simply on; Settings → Computer has the switch
    store.save();
  } catch (_) {}
  // The computers' engine and Linux system download quietly in the background, so every bot's computer is ready.
  phone = createPhone({
    store, sendMessage: (id, text, att) => sendMessage(id, text, att), stopTurn,
    // The phone can watch a bot's browser, tap on it and scroll it.
    screen: async (id) => {
      const b = browsers.get(id);
      const wc = b?.view?.webContents;
      if (!wc || !b.hasPage) return { hasPage: false };
      const img = await wc.capturePage().catch(() => null);
      if (!img || img.isEmpty()) return { hasPage: true, url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading() };
      const small = img.resize({ width: Math.min(900, img.getSize().width) });
      return { hasPage: true, url: wc.getURL(), title: wc.getTitle(), loading: wc.isLoading(), img: 'data:image/jpeg;base64,' + small.toJPEG(70).toString('base64') };
    },
    tap: async (id, x, y) => {
      const wc = browsers.get(id)?.view?.webContents;
      if (!wc || !(x >= 0 && x <= 1 && y >= 0 && y <= 1)) return;
      await wc.executeJavaScript(`(() => { const X = ${x} * innerWidth, Y = ${y} * innerHeight; const el = document.elementFromPoint(X, Y); if (!el) return; const o = { bubbles: true, cancelable: true, clientX: X, clientY: Y, view: window }; ['pointerdown','mousedown','pointerup','mouseup'].forEach((t) => el.dispatchEvent(new (t.startsWith('pointer') ? PointerEvent : MouseEvent)(t, o))); if (el.focus) el.focus(); el.click(); })()`, true).catch(() => {});
    },
    scroll: async (id, dy) => {
      const wc = browsers.get(id)?.view?.webContents;
      if (wc) await wc.executeJavaScript(`window.scrollBy({ top: innerHeight * ${Math.max(-3, Math.min(3, dy))}, behavior: 'smooth' })`, true).catch(() => {});
    },
    getUpdate: () => ({ available: !!pendingUpdate, version: pendingUpdate?.version || null, notes: pendingUpdate?.notes || [], current: updater.current() }),
    doUpdate: async () => {
      if (!pendingUpdate) await checkUpdates(true);
      if (!pendingUpdate) throw new Error("You're already on the latest version.");
      return updater.install(pendingUpdate, (msg) => win && !win.isDestroyed() && win.webContents.send('update-progress', msg));
    },
    checkUpdate: () => checkUpdates(true),
    answerPermission: (id, answer) => answerChecked(id, answer), // from the phone: the same Touch ID check as in the window
    pendingAsks: () => [...pendingPermissions.values()].map((p) => p.req).filter(Boolean),
    // Make bots and group chats from the phone.
    newBot: ({ name, tag, description, character }) => {
      name = String(name || '').trim().slice(0, 40);
      if (!name) throw new Error('Give your bot a name.');
      const p = createBot({ name, tag: String(tag || '').trim().slice(0, 30), description: String(description || '').trim().slice(0, 500) });
      if (character && typeof character === 'object') { p.character = { shape: String(character.shape || 'orb'), color: /^#[0-9a-f]{6}$/i.test(character.color) ? character.color : '#A77BFF', eyes: String(character.eyes || 'dots'), extra: String(character.extra || 'none'), mouth: String(character.mouth || 'smile'), acc: String(character.acc || 'none') }; store.save(); pushState(); }
      return p.id;
    },
    newGroup: ({ name, members }) => {
      const list = store.data.personas;
      const ids = (Array.isArray(members) ? members : []).filter((m) => list.some((p) => p.id === m && !p.group));
      if (ids.length < 2) throw new Error('Pick at least 2 bots for a group chat.');
      const g = { id: crypto.randomBytes(4).toString('hex'), created: Date.now(), group: true, name: String(name || '').trim().slice(0, 40) || list.filter((p) => ids.includes(p.id)).map((p) => p.name.split(' ')[0]).join(', '), tag: 'Group', members: ids };
      list.push(g); store.save(); pushState();
      return g.id;
    },
    decline: (slug, personaId, id) => { slug = slug.toLowerCase().replace(/[^a-z0-9]/g, ''); if (!slug) return; (store.data.appsDeclined ||= {})[slug] = Date.now(); const m = (store.data.chats[personaId] || []).find((x) => x.role === 'card' && x.id === id); if (m) m.status = 'declined'; store.save(); pushState(); },
    profile: () => ({ userName: store.data.settings.userName || '', version: updater.current(), bots: (store.data.personas || []).filter((p) => !p.group).length, groups: (store.data.personas || []).filter((p) => p.group).length }),
    setProfile: ({ userName }) => { if (typeof userName === 'string') { store.data.settings.userName = userName.trim().slice(0, 60); store.save(); pushState(); } },
    onJoin: (req) => { if (win && !win.isDestroyed()) { win.webContents.send('phone-join', req); try { if (process.platform === 'darwin') app.dock?.bounce('critical'); } catch (_) {} } },
    dataDir: process.env.WAYZERR_DATA_DIR || app.getPath('userData'),
    imageFile: (id) => imageFile(id),
    transcribe: (buf, mime) => transcribeVoice(buf, mime),
    // Tasks (schedules) and bot settings, done from the phone.
    tasks: {
      list: () => ({
        schedules: schedApi.list(), log: schedLog().slice(0, 15).map((r) => ({ id: r.id, sid: r.sid, botName: r.botName, title: r.title, ts: r.ts, status: r.status, manual: !!r.manual })),
        bots: store.data.personas.filter((x) => !x.group).map((x) => ({ id: x.id, name: x.name })),
        now: schedules.toStart(new Date()),
      }),
      save: (input) => schedApi.save(input || {}),
      remove: (id) => schedApi.remove(String(id || '')),
      toggle: (b) => HANDLERS.get('schedule-toggle')({ id: String(b.id || ''), enabled: !!b.enabled }),
      run: (id) => HANDLERS.get('schedule-run')(String(id || '')),
    },
    botTools: {
      get: (id) => {
        const b = store.data.personas.find((x) => x.id === id); if (!b) throw new Error('That bot is gone.');
        return { id: b.id, name: b.name, tag: b.tag || '', description: b.description || '', group: !!b.group, effort: b.effort || store.data.settings.defaultEffort || 'default', memories: (store.data.memories[id] || []).map((m) => ({ id: m.id, text: String(m.text || '').slice(0, 300), ts: m.ts || 0 })) };
      },
      edit: ({ id, name, tag, description, effort }) => {
        const b = store.data.personas.find((x) => x.id === id); if (!b) throw new Error('That bot is gone.');
        if (typeof name === 'string' && name.trim()) b.name = name.trim().slice(0, 40);
        if (typeof tag === 'string') b.tag = tag.trim().slice(0, 30);
        if (typeof description === 'string' && !b.group) b.description = description.trim().slice(0, 2000);
        if (['fast', 'default', 'low', 'medium', 'high', 'xhigh', 'max'].includes(effort) && !b.group) b.effort = effort;
        store.save(); pushState();
        return true;
      },
      clear: (id) => HANDLERS.get('clear-chat')(String(id || '')),
      remove: (id) => HANDLERS.get('delete-persona')(String(id || '')),
      forget: ({ id, memoryId }) => HANDLERS.get('delete-memory')({ personaId: String(id || ''), memoryId: String(memoryId || '') }),
    },
    // Wayzerr's website hands each computer its own permanent phone address and the key to open it.
    allowed: () => store.data.settings.phoneUnlocked === true,
    tunnelInfo: async (port) => {
      const origin = (process.env.WAYZERR_COMPOSIO_HOST || new URL(PKG.updateFeedCloud).origin).replace(/\/+$/, '');
      const r = await fetch(origin + '/api/phone/tunnel', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-wz-secret': appSecret() }, body: JSON.stringify({ port }), signal: AbortSignal.timeout(30000) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.token || !j.host) throw new Error(j?.error || `wayzerr.com answered ${r.status}`);
      return { host: j.host, token: j.token };
    },
    theme: () => themeOf(),
    voiceAvailable: () => require('./speech').available(speechProviders(), localStt).length > 0,
    iconFile: path.join(__dirname, 'site', 'icon-phone.png'), mobileDir: path.join(__dirname, 'mobile'),
    charactersFile: path.join(__dirname, 'renderer', 'characters.js'),
    jsqrFile: require.resolve('jsqr/dist/jsQR.js'),
    onChange: () => {
      if (win && !win.isDestroyed()) win.webContents.send('phone', phone.state());
      // While Phone is on, don't let the computer fall asleep (the screen can still turn off).
      applyAwake();
    },
  });
  createWindow();
  phone.apply().catch(() => {});
  if (store.data.mcpServer?.enabled !== false) personaMcp.start();
  try { aiapps.refreshAll(mcpInfo()); } catch (_) {}
  win.webContents.once('did-finish-load', () => setTimeout(() => checkUpdates().catch(() => {}), 1500));
  setInterval(() => checkUpdates().catch(() => {}), 15 * 60000);
  // Fill in model lists that are missing (e.g. right after upgrading).
  for (const p of providers()) {
    // Also once a week: picks up each model's context window when the provider reports it.
    if (!TYPES[p.type]?.account && ((p.models || []).length < 2 || Date.now() - (p.modelsChecked || 0) > 7 * 864e5)) listModels(p.type, p.baseUrl, dec(p.key)).then((m) => { p.models = m; p.modelsChecked = Date.now(); store.save(); pushState(); }).catch(() => {});
  }
  try { skills.seed(store); } catch (_) {}
  if (store.data.composio?.key) { delete store.data.composio; store.data.customServers = store.data.customServers.filter((x) => !x.composio); store.save(); } // an old pasted key: move to the built-in connection
  if (!store.data.customServers.some((x) => x.composio) && !store.data.composioOff) setTimeout(() => composioEnsure('').then(pushState).catch(() => {}), 2000);
  for (const s of store.data.customServers) {
    if (!s.enabled) continue;
    // Composio: keep using the same session; make a new one only if the old one stopped working.
    connectServer(s).then(async () => {
      if (s.composio && !mcp.status(s.id).connected) { await composioSession().catch(() => {}); await connectServer(s); }
    }).then(() => pushState());
  }
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
let quitGate = false;
app.on('before-quit', async (e) => {
  try { store?.flush(); } catch (_) {}
  try { phone?.stop(); } catch (_) {}
  // The bots' computers shut down properly first (a few seconds at most), so nothing they downloaded or saved is lost.
  if (!quitGate && computersInst) { quitGate = true; e.preventDefault(); computersInst.shutdownAll(9000).catch(() => {}).finally(() => app.quit()); return; }
  try { computers?.stopAll(); } catch (_) {}
  for (const id of mcp.clients.keys()) await mcp.disconnect(id);
});

// ---------- State shared with the UI ----------
function publicState() {
  const d = store.data;
  return {
    schedules: schedList().map((s) => ({ ...s, next: schedules.nextRun(s, Date.now()), repeatText: schedules.describeRepeat(s) })),
    scheduleLog: schedLog().slice(0, 150),
    scheduleAwake: store.data.settings.scheduleAwake !== false,
    ready: !!resolveModel(null),
    account: account ? account.state() : { signedIn: false, email: '', flow: null, error: '' },
    settings: { terms: { version: TERMS_VERSION, accepted: !!(d.settings.terms && d.settings.terms.version === TERMS_VERSION) }, setupSkipped: d.settings.setupSkipped === true, tutorialDone: d.settings.tutorialDone === true, guide: d.settings.guide || null, autoCompact: d.settings.autoCompact === true, computerTarget: d.settings.computerTarget === 'mine' ? 'mine' : 'bot', computerOn: d.settings.computerOn !== false, myComputerName: myComputerName(), myMac: mymac.permissions(), smartCompact: d.settings.smartCompact !== false, leanCodex: d.settings.leanCodex !== false, freshEach: d.settings.freshEach === true, showTokens: d.settings.showTokens === true, voiceLang: d.settings.voiceLang || '', voiceWords: d.settings.voiceWords || '', phoneUnlocked: d.settings.phoneUnlocked === true, freeImages: d.settings.freeImages !== false, onlineIcons: d.settings.onlineIcons !== false, replyLanguage: d.settings.replyLanguage || 'auto', theme: themeOf(), appModes: d.settings.appModes || {}, appsVia: d.settings.appsVia === 'browser' ? 'browser' : 'connector', usageMode: ['low', 'max'].includes(d.settings.usageMode) ? d.settings.usageMode : 'balanced', linkOpen: d.settings.linkOpen || 'ask', userName: d.settings.userName, defaultModel: d.settings.defaultModel || null, defaultEffort: d.settings.defaultEffort || 'default' },
    providers: providers().map((p) => ({ id: p.id, type: p.type, name: p.name, baseUrl: p.baseUrl, hasKey: !!p.key, keyPreview: TYPES[p.type]?.account ? p.account || 'Signed in' : maskKey(dec(p.key)), account: !!TYPES[p.type]?.account, models: p.models || [] })),
    providerTypes: TYPES,
    personas: d.personas,
    activePersonaId: d.activePersonaId,
    chats: d.chats,
    memories: d.memories,
    connectors: Object.fromEntries(
      Object.entries(BUILTIN).map(([k, m]) => [k, { ...m, tools: m.tools.map((t) => t.name), ...d.connectors[k] }])
    ),
    vault: vault.publicList(),
    cards: vault.publicCards(),
    notify: notifyCfg(),
    seen: seenMap(),
    customServers: d.customServers.map((s) => ({ ...maskServer(s), status: mcp.status(s.id) })),
    composio: d.composio ? { connected: true, ownKey: !!d.composio.key } : null,
    composioKeyNeeded: false,
    appsDeclined: Object.keys(d.appsDeclined || {}),
    usage: (d.usage || {})[monthKey()] || {},
    usageToday: (d.usageDays || {})[localDay()] || {},
    usageDay: localDay(),
    usageTotal: usageTotals(),
    usageWeek: usageWeek(),
    platform: process.platform,
    touchId: canTouchID(),
    version: updater.current(),
    updateFeed: d.settings.updateFeed || '',
    builtInFeed: PKG.updateFeed || '',
    notes: CHANGELOG[updater.current()] || [],
  };
}
// Many changes in a row (a bot typing several messages, cards updating) are sent to the window as one update.
let pushTimer = null;
function pushState() {
  if (pushTimer) return;
  pushTimer = setTimeout(() => { pushTimer = null; if (win && !win.isDestroyed()) win.webContents.send('state', publicState()); }, 30);
}

const HANDLERS = new Map(); // the phone calls a few of these by name
// Only Wayzerr's own window may call these. (The phone and the bots' tools call the handlers directly, not through here.)
const fromOurWindow = (e) => { try { return /^file:\/\/.*\/renderer\/index\.html(\?|#|$)/.test(e.senderFrame ? e.senderFrame.url : e.sender.getURL()); } catch (_) { return false; } };
const handle = (ch, fn) => (HANDLERS.set(ch, fn),
  ipcMain.handle(ch, async (e, ...args) => {
    try {
      if (!fromOurWindow(e)) throw new Error('Not allowed.');
      return { ok: true, value: await fn(...args) };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  }));

// Someone who already uses Wayzerr doesn't get the first-run tour (it stays in Settings → Help).
let tourChecked = false;
handle('get-state', async () => {
  if (accountReady) await Promise.race([accountReady, new Promise((r) => setTimeout(r, 3000))]);
  if (!tourChecked) { tourChecked = true; if (store.data.settings.tutorialDone === undefined && (providers().length || (store.data.personas || []).length)) { store.data.settings.tutorialDone = true; store.save(); } }
  return publicState();
});

// ----- In-app updates -----
async function checkUpdates(manual = false) {
  const r = await updater.check([...(PKG.updateFeedCloud ? [PKG.updateFeedCloud] : []), store.data.settings.updateFeed || PKG.updateFeed || '', ...(PKG.updateFeedBackup ? [PKG.updateFeedBackup] : []), ...(pubCfg().site ? [publisher.feedFor(pubCfg().site)] : [])], { manual });
  pendingUpdate = r.update;
  autoPublish().catch(() => {});
  if (r.update && win && !win.isDestroyed()) win.webContents.send('update-available', r);
  return r;
}

// ---------- Publisher mode: the owner's Wayzerr publishes new builds to GitHub for everyone ----------
const defaultSite = () => (PKG.updateFeed || '').match(/github\.com\/([^/]+\/[^/]+)\//)?.[1] || '';
const pubCfg = () => {
  const c = (store.data.publish ||= { auto: true, done: {} });
  if (c.target !== 'v2') { c.target = 'v2'; delete c.token; delete c.user; c.done = {}; c.site = defaultSite(); } // moved from GitHub to the Netlify site
  return c;
};
let publishing = null;
function pubState() {
  const c = pubCfg();
  return { site: c.site || '', hasToken: !!c.token, auto: c.auto !== false, user: c.user || '', last: c.last || null, busy: !!publishing };
}
async function publishDmg(u, force) {
  const c = pubCfg();
  if (!c.token || !c.site) throw new Error('Add where to publish and a key first (Settings → General → Publish updates).');
  const key = `${u.version}:${u.build || ''}`;
  if (!force && c.done?.[key]) return c.last;
  if (publishing) return publishing;
  const say = (m) => win && !win.isDestroyed() && win.webContents.send('publish-progress', m);
  publishing = publisher.publish({ token: dec(c.token), site: c.site, siteDir: path.join(__dirname, 'site'), file: u.file, version: u.version, build: u.build, notes: u.notes || [], onProgress: say })
    .then((res) => { (c.done ||= {})[key] = Date.now(); c.last = { version: u.version, at: Date.now(), url: res.url }; store.save(); say(`Wayzerr ${u.version} is live for everyone`); return c.last; })
    .catch((e) => { say('Publishing failed: ' + e.message); throw e; })
    .finally(() => { publishing = null; });
  return publishing;
}
// A Wayzerr.dmg in Downloads that's newer than what's on GitHub gets published by itself.
async function autoPublish() {
  if (!process.env.WAYZERR_PUBLISHER) return; // publishing from Downloads is for the developer only (set WAYZERR_PUBLISHER=1); users' copies never upload anything
  const c = pubCfg();
  if (!c.token || c.auto === false || publishing) return;
  const u = await updater.latestDmg();
  if (!u) return;
  const live = await updater.published(publisher.feedFor(c.site));
  if (updater.newerThan(u, live)) return publishDmg(u, false);
}
handle('publish-state', () => pubState());
handle('publish-save', async ({ token, site, auto }) => {
  const c = pubCfg();
  if (site !== undefined) c.site = publisher.clean(site);
  if (auto !== undefined) c.auto = !!auto;
  if (token !== undefined) {
    const t = String(token || '').trim();
    if (!t) { delete c.token; delete c.user; }
    else { const info = await publisher.check(t, c.site); c.token = enc(t); c.user = info.user; c.site = info.site || c.site; }
  }
  store.save();
  if (token) setTimeout(() => autoPublish().catch(() => {}), 500); // publish what's waiting in Downloads
  return pubState();
});
handle('publish-now', async () => {
  const u = await updater.latestDmg();
  if (!u) throw new Error('Put the new Wayzerr.dmg in your Downloads folder first.');
  return publishDmg(u, true);
});
handle('update-check', () => checkUpdates(true));
handle('update-install', async () => {
  if (!pendingUpdate) await checkUpdates();
  if (!pendingUpdate) throw new Error("You're already on the latest version.");
  return updater.install(pendingUpdate, (msg) => win.webContents.send('update-progress', msg));
});
handle('update-from-file', async () => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose the Wayzerr update file', defaultPath: app.getPath('downloads'), properties: ['openFile'], filters: [{ name: 'Wayzerr update', extensions: process.platform === 'win32' ? ['exe'] : process.platform === 'linux' ? ['AppImage', 'deb'] : ['dmg', 'zip'] }] });
  if (r.canceled || !r.filePaths[0]) return null;
  pendingUpdate = await updater.fromFile(r.filePaths[0]);
  return updater.install(pendingUpdate, (msg) => win.webContents.send('update-progress', msg));
});

// ---------- MCP Registry: browse & install connectors ----------
function simplifyServer(entry) {
  const s = entry.server || entry;
  const npm = (s.packages || []).find((p) => (p.registryType || p.registry_type) === 'npm');
  const other = (s.packages || []).find((p) => (p.registryType || p.registry_type) !== 'npm');
  const remote = (s.remotes || []).find((r) => /http|sse/.test(r.type || ''));
  const repo = s.repository?.url || '';
  const short = String(s.name || '').split('/').pop();
  const title = s.title || short.replace(/[-_]+/g, ' ').replace(/\b(mcp|server)\b/gi, '').trim().replace(/\b\w/g, (c) => c.toUpperCase()) || short;
  let logo = s.icons?.[0]?.src || '';
  if (!logo && remote) { try { logo = new URL(remote.url).hostname.replace(/^(mcp|api)\./, ''); } catch (_) {} }
  if (!logo && /github\.com\/([^/]+)/.test(repo)) logo = `https://github.com/${repo.match(/github\.com\/([^/]+)/)[1]}.png?size=64`;
  return {
    id: s.name, title, description: s.description || '', version: s.version, repo, logo,
    kind: remote ? 'remote' : npm ? 'npm' : other ? (other.registryType || other.registry_type) : 'none',
    npm: npm && { identifier: npm.identifier, version: npm.version, env: npm.environmentVariables || npm.environment_variables || [], args: npm.packageArguments || npm.package_arguments || [] },
    remote: remote && { type: remote.type, url: remote.url, headers: remote.headers || [] },
  };
}
handle('registry-search', async ({ q, cursor }) => {
  const u = new URL(process.env.WAYZERR_REGISTRY_URL || 'https://registry.modelcontextprotocol.io/v0/servers');
  if (q) u.searchParams.set('search', q);
  u.searchParams.set('limit', '40');
  u.searchParams.set('version', 'latest');
  if (cursor) u.searchParams.set('cursor', cursor);
  const r = await fetch(u, { signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error('The connector directory is not reachable right now (' + r.status + ').');
  const j = await r.json();
  const seen = new Set();
  const items = (j.servers || []).map(simplifyServer).filter((x) => x.id && !seen.has(x.id) && seen.add(x.id));
  return { items, next: j.metadata?.nextCursor || j.metadata?.next_cursor || null };
});

handle('update-feed', (url) => { store.data.settings.updateFeed = String(url || '').trim(); store.save(); return publicState(); });

// Light, dark, or follow the computer.
handle('set-theme', (t) => {
  store.data.settings.theme = ['light', 'dark'].includes(t) ? t : 'system';
  nativeTheme.themeSource = store.data.settings.theme;
  store.save();
  pushState();
  return publicState();
});
// How bots use your apps: through the app connections (default) or in their own browser.
handle('set-app-mode', ({ slug, mode } = {}) => {
  slug = String(slug || '').toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!slug) return publicState();
  const m = (store.data.settings.appModes ||= {});
  if (mode === 'browser' || mode === 'connector') m[slug] = mode; else delete m[slug];
  store.save();
  return publicState();
});
handle('set-usage-mode', (v) => { store.data.settings.usageMode = ['low', 'max'].includes(v) ? v : 'balanced'; store.save(); return publicState(); });
handle('set-apps-via', (v) => { store.data.settings.appsVia = v === 'browser' ? 'browser' : 'connector'; store.save(); return publicState(); });
// How links in chats open: 'ask' | 'app' (Wayzerr's browser) | 'browser' (your own browser).
handle('set-link-open', (mode) => {
  store.data.settings.linkOpen = ['ask', 'app', 'browser'].includes(mode) ? mode : 'ask';
  store.save();
  return publicState();
});
handle('open-external', (url) => { if (/^https?:\/\//i.test(String(url))) shell.openExternal(String(url)); return true; });
handle('save-profile', ({ voiceLang, voiceWords, userName, replyLanguage, freeImages, onlineIcons, autoCompact, showTokens, freshEach, smartCompact, leanCodex, setupSkipped, tutorialDone, computerTarget, computerOn, myComputerName: myName } = {}) => {
  if (typeof computerOn === 'boolean') store.data.settings.computerOn = computerOn;
  if (computerTarget === 'bot' || computerTarget === 'mine') store.data.settings.computerTarget = computerTarget;
  if (typeof myName === 'string') store.data.settings.myComputerName = myName.trim().slice(0, 40);
  if (typeof setupSkipped === 'boolean') store.data.settings.setupSkipped = setupSkipped;
  if (typeof tutorialDone === 'boolean') store.data.settings.tutorialDone = tutorialDone;
  if (typeof smartCompact === 'boolean') store.data.settings.smartCompact = smartCompact;
  if (typeof leanCodex === 'boolean') store.data.settings.leanCodex = leanCodex;
  if (typeof freshEach === 'boolean') store.data.settings.freshEach = freshEach;
  if (typeof showTokens === 'boolean') store.data.settings.showTokens = showTokens;
  if (typeof voiceLang === 'string') store.data.settings.voiceLang = /^[a-z]{2}$/.test(voiceLang) ? voiceLang : '';
  if (typeof voiceWords === 'string') store.data.settings.voiceWords = voiceWords.slice(0, 600);
  if (typeof autoCompact === 'boolean') store.data.settings.autoCompact = autoCompact;
  if (typeof freeImages === 'boolean') store.data.settings.freeImages = freeImages;
  if (typeof onlineIcons === 'boolean') store.data.settings.onlineIcons = onlineIcons;
  if (userName !== undefined) store.data.settings.userName = String(userName || '').trim();
  if (replyLanguage !== undefined) store.data.settings.replyLanguage = String(replyLanguage || 'auto').slice(0, 40);
  store.save();
  return publicState();
});

// Add (or re-key) an AI provider. Checks the key by loading the model list.
handle('save-provider', async ({ id, type, name, baseUrl, apiKey, model }) => {
  const existing = id ? findProvider(id) : null;
  const t = TYPES[type || existing?.type] || TYPES.custom;
  const key = (apiKey || '').trim() || (existing ? dec(existing.key) : '');
  let base = (baseUrl || existing?.baseUrl || t.baseUrl || '').trim();
  if (t.needsKey && !key) throw new Error('Paste your API key first.');
  let models;
  if ((type || existing?.type) === 'custom') {
    // Any cloud server: accept "myserver.com", "https://myserver.com" or ".../v1".
    if (!base) throw new Error('Enter the server address.');
    if (!/^https?:\/\//i.test(base)) base = (/^(localhost|127\.|192\.168\.|10\.)/.test(base) ? 'http://' : 'https://') + base;
    base = base.replace(/\/+$/, '').replace(/\/chat\/completions$/, '');
    const tries = /\/v\d+(beta)?$|\/openai$|\/api$/.test(base) ? [base] : [base + '/v1', base, base + '/api/v1', base + '/openai/v1'];
    let err;
    for (const b of tries) { try { models = await listModels('custom', b, key); base = b; break; } catch (e) { err = err || e; } }
    if (!models && model) models = [{ id: String(model).trim(), name: '' }], base = tries[0];
    if (!models) throw new Error(`${err?.message || "Couldn't reach that server"}. Check the address, or type the model name so Wayzerr can use it anyway.`);
  } else models = await listModels(type || existing.type, base, key);
  if (existing) Object.assign(existing, { baseUrl: base, key: enc(key) || existing.key, models, name: name || existing.name });
  else providers().push({ id: crypto.randomBytes(3).toString('hex'), type, name: name || t.name, baseUrl: base, key: enc(key), models });
  const p = existing || providers()[providers().length - 1];
  const st = store.data.settings;
  if (!st.defaultModel || !findProvider(st.defaultModel.providerId)) st.defaultModel = { providerId: p.id, model: pickDefault(p.models) };
  store.save();
  return publicState();
});

function pickDefault(models) {
  const ids = models.map((m) => m.id);
  return ids.find((m) => /^gpt-.*mini$/i.test(m)) || ids.find((m) => /sonnet/i.test(m)) || ids.find((m) => /flash/i.test(m)) || ids.find((m) => /mini/i.test(m)) || ids[0];
}

handle('refresh-models', async (id) => {
  const p = findProvider(id);
  if (TYPES[p.type]?.oauth) p.models = await listModels('openrouter', p.baseUrl, dec(p.key));
  else if (TYPES[p.type]?.account) {
    const s = await cli.status(TYPES[p.type].agent);
    if (s.account) p.account = s.account;
    p.models = await cli.models(TYPES[p.type].agent);
  } else p.models = await listModels(p.type, p.baseUrl, dec(p.key));
  store.save();
  return publicState();
});

handle('remove-provider', (id) => {
  store.data.settings.providers = providers().filter((p) => p.id !== id);
  const st = store.data.settings;
  if (st.defaultModel?.providerId === id) {
    const p = providers()[0];
    st.defaultModel = p ? { providerId: p.id, model: pickDefault(p.models) } : null;
  }
  for (const b of store.data.personas) if (b.model?.providerId === id) delete b.model;
  store.save();
  return publicState();
});

handle('set-default-model', (sel) => {
  store.data.settings.defaultModel = sel;
  store.save();
  return publicState();
});

handle('set-bot-effort', ({ personaId, effort, all }) => {
  if (all) store.data.settings.defaultEffort = effort;
  const b = store.data.personas.find((p) => p.id === personaId);
  if (b) { if (all) delete b.effort; else b.effort = effort; }
  store.save();
  return publicState();
});

handle('set-bot-model', ({ personaId, sel }) => {
  const b = store.data.personas.find((p) => p.id === personaId);
  if (b) { if (sel) b.model = sel; else delete b.model; }
  store.save();
  return publicState();
});

handle('save-persona', (p) => {
  const list = store.data.personas;
  if (!p.id) {
    p.id = crypto.randomBytes(4).toString('hex');
    p.created = Date.now();
    list.push(p);
  } else {
    const i = list.findIndex((x) => x.id === p.id);
    if (i >= 0) list[i] = { ...list[i], ...p };
  }
  store.data.activePersonaId = p.id;
  store.save();
  return publicState();
});

handle('delete-persona', (id) => {
  const br = browsers.get(id);
  if (br?.view) { try { win.contentView.removeChildView(br.view); br.view.webContents.close(); } catch (_) {} }
  browsers.delete(id);
  store.data.personas = store.data.personas.filter((p) => p.id !== id);
  delete store.data.chats[id];
  delete store.data.memories[id];
  if (store.data.activePersonaId === id) store.data.activePersonaId = store.data.personas[0]?.id || null;
  store.save();
  return publicState();
});

handle('set-active', (id) => {
  store.data.activePersonaId = id;
  store.save();
  return publicState();
});

// Keep the chat up to (and including) message #keep-1; later messages are removed.
handle('chat-truncate', ({ personaId, keep }) => {
  const chat = store.data.chats[personaId] || [];
  store.data.chats[personaId] = chat.slice(0, Math.max(0, keep));
  const bp = store.data.personas.find((x) => x.id === personaId);
  if (bp) delete bp.cliSessions; // the AI app's chat no longer matches — start fresh
  store.save();
  return publicState();
});
handle('open-cloud-chat', async (personaId) => {
  const p = store.data.personas.find((x) => x.id === personaId && !x.group);
  const llm = p && resolveModel(p);
  if (!llm?.cli) throw new Error('This bot uses an API key, so its chat lives only here in Wayzerr.');
  const sid = (p.cliSessions || {})[llm.cli];
  if (!sid) throw new Error('No cloud chat yet — send this bot a message first.');
  await cli.openChatInTerminal(llm.cli, sid);
  return true;
});
// Start fresh cloud chats: a bot's private one, or every member's chat for a group.
function resetCloudChats(bp) {
  if (!bp) return;
  if (!bp.group) { for (const k of Object.keys(bp.cliSessions || {})) if (!k.includes('@')) delete bp.cliSessions[k]; return; }
  for (const id of bp.members || []) { const m = store.data.personas.find((x) => x.id === id); if (m?.cliSessions) for (const k of Object.keys(m.cliSessions)) if (k.endsWith('@' + bp.id)) delete m.cliSessions[k]; }
}
// Compact a chat: everything but the last few messages is folded into a short note, and the cloud chat starts fresh,
// so the next message re-reads a few hundred words instead of the whole conversation. Costs nothing (no AI call).
// Every message stays visible in the app; only what is sent to the AI gets shorter.
const COMPACT_KEEP = 12, COMPACT_CHARS = 14000;
const AUTO_COMPACT_TOKENS = 400_000; // with "Compact automatically" on, a chat is folded once one message needs more than this much context
const SMART_PROMPT = `You keep the memory of a long chat between a user and an AI assistant, so the assistant can carry on exactly where it left off after the old messages are removed. Merge the previous note (if any) with the new messages into ONE note, in the language of the chat. Be thorough: the assistant must not need to ask the user anything again. Use only these headings and skip empty ones: GOAL (what the user is after), NOW (what is being worked on and where it stands), DECISIONS (agreed choices; the newest wins), FACTS (exact names, numbers, dates, links, commands, code, file names, results and outputs the user pasted, what the user said they use or meant, e.g. which app or system), TRIED (what was already suggested or tried, and what worked or failed, so it is not repeated), PREFERENCES (how the user wants things done, corrections), OPEN (unfinished tasks, questions waiting, promises made). Keep exact values and short quotes of important instructions. Skip only greetings, thanks and pure repeats. Never invent anything. Up to about 900 words. Reply with the note only.`;
// A trimmed copy of the old messages for the AI to read: newest first, about 2,500 tokens at most, so the note costs little.
function packForNote(msgs, cap = 90000) {
  const out = [];
  let left = cap;
  for (let i = msgs.length - 1; i >= 0 && left > 150; i--) {
    const x = msgs[i];
    let t = String(x.content || '').replace(/\s+/g, ' ').trim();
    if (t.length > 3000) t = t.slice(0, 2100) + ' … ' + t.slice(-800);
    const line = `${x.role === 'user' ? 'User' : 'Assistant'}: ${t}`;
    left -= line.length + 1;
    out.unshift(line);
  }
  return out.join('\n');
}
// One plain question to the connected AI, no tools. Cloud: a throw-away chat with the short ChatGPT instructions.
async function askPlain({ llm, system, text, maxOut = 2200, signal }) {
  let out = '', used = 0;
  if (llm.cli) {
    if (!['claude', 'codex'].includes(llm.cli)) throw new Error('not supported');
    const r = await require('./cliagents').ask({ id: llm.cli, model: llm.model, effort: 'low', system, prompt: text, firstPrompt: text, mcp: { url: 'http://127.0.0.1:9', token: 'x' }, quick: true, ephemeral: true, partial: false, lean: store.data.settings.leanCodex !== false, botName: 'Wayzerr', signal });
    out = r.text;
    addUsage(llm.providerId, r.usage || { input: Math.ceil(text.length / 4), output: Math.ceil(String(out).length / 4), estimated: true });
    const n = normUsage(r.usage); used = n.input + n.output;
  } else {
    const r = await require('./ai').callModel({ ...llm, effort: 'default', noEffort: true, maxOut, onUsage: (u) => { addUsage(llm.providerId, u); const n = normUsage(u); used += n.input + n.output; } }, [{ role: 'system', content: system }, { role: 'user', content: text }], [], signal);
    out = r?.content || '';
  }
  return { text: String(out).trim(), used };
}
// The AI writes the note (like Claude's compact), from the trimmed copy only: about 3,000 tokens at most, however big the chat is.
async function aiNote({ bp, prev, msgs, signal }) {
  const llm = resolveModel(bp.group ? null : bp);
  if (!llm) throw new Error('no model');
  const text = (prev ? `PREVIOUS NOTE:\n${String(prev).slice(-COMPACT_CHARS)}\n\n` : '') + `NEW MESSAGES:\n${packForNote(msgs)}`;
  const r = await askPlain({ llm, system: SMART_PROMPT, text, signal });
  if (r.text.length < 40) throw new Error('empty note');
  return { note: r.text.slice(0, COMPACT_CHARS), used: r.used };
}
const compacting = new Map(); // chat id -> { promise, ctl }: a compact that is running after a reply
async function compactChat(id, { smart = false, signal } = {}) {
  const bp = store.data.personas.find((x) => x.id === id);
  const chat = store.data.chats[id] || [];
  const out = { folded: 0, before: 0, after: 0, used: 0, smart: false };
  if (!bp) return out;
  const tok = (s) => Math.ceil(String(s || '').length / 4);
  const convo = chat.filter((x) => x.role === 'user' || x.role === 'assistant');
  const older = convo.slice(0, Math.max(0, convo.length - COMPACT_KEEP));
  const all = (store.data.chatCtx ||= {});
  const keys = bp.group ? (bp.members || []).map((mid) => `${id}:${mid}`) : [id];
  out.before = tok(convo.map((x) => x.content).join(' '));
  for (const key of keys) {
    const st = all[key];
    const fresh = older.filter((x) => (x.ts || 0) > (st?.upTo || 0));
    if (!fresh.length) continue;
    let summary = null;
    if (smart && !bp.group) { try { const r = await aiNote({ bp, prev: st?.summary, msgs: fresh, signal }); summary = r.note; out.used += r.used; out.smart = true; } catch (_) {} }
    if (!summary) {
      summary = [st?.summary, `Earlier messages (shortened):\n${require('./context').digest(fresh, bp, 160)}`].filter(Boolean).join('\n\n');
      if (summary.length > COMPACT_CHARS) summary = '…' + summary.slice(-COMPACT_CHARS);
    }
    all[key] = { summary, upTo: fresh[fresh.length - 1].ts || 0, updated: Date.now(), folded: (st?.folded || 0) + fresh.length, model: out.smart ? 'ai' : 'compact' };
    out.folded = Math.max(out.folded, fresh.length);
    out.after = Math.max(out.after, tok(summary));
  }
  if (!out.folded) return out;
  out.after += tok(convo.slice(-COMPACT_KEEP).map((x) => x.content).join(' '));
  resetCloudChats(bp);
  (store.data.chats[id] ||= []).push({ role: 'activity', content: `Chat compacted: ${out.folded} earlier ${out.folded === 1 ? 'message' : 'messages'} folded into ${out.smart ? 'an AI-written note' : 'a short note'} (about ${out.before.toLocaleString('en-US')} → ${out.after.toLocaleString('en-US')} tokens to re-read). You can still scroll up to read them.`, ts: Date.now(), kind: 'compact', ctx: out.after });
  store.save();
  return out;
}
handle('compact-chat', async (arg) => { const id = typeof arg === 'object' ? arg.id : arg; const r = await compactChat(id, { smart: typeof arg === 'object' && !!arg.smart }); return { ...r, state: publicState() }; });
// ----- Terms of Service: shown before first use and again whenever TERMS_VERSION changes (change it when the Terms or Privacy Policy change in a material way) -----
handle('accept-terms', () => { store.data.settings.terms = { version: TERMS_VERSION, at: Date.now() }; store.save(); pushState(); return publicState(); });
handle('quit-app', () => { app.quit(); return true; });
// ----- Delete account: erases the account on wayzerr.com (when online), then everything Wayzerr keeps on this computer, then starts again as a new install -----
handle('delete-account', async (arg) => {
  const word = arg && typeof arg === 'object' ? arg.word : arg;
  const localOnly = !!(arg && typeof arg === 'object' && arg.localOnly);
  if (String(word || '').trim().toUpperCase() !== 'DELETE') throw new Error('Type DELETE to confirm.');
  if (!localOnly && account) {
    const r = await account.remove();
    if (!r.ok) { const e = new Error(r.offline ? "Couldn't reach Wayzerr to delete your account there. Check your internet connection and try again, or erase this computer only." : "Wayzerr's server couldn't delete your account right now. Try again later, or erase this computer only and email hello@wayzerr.com to finish."); e.remoteFailed = true; throw e; }
  }
  for (const ctl of running.values()) { try { ctl.abort(); } catch (_) {} }
  store.wipe();
  const dir = dataDir();
  for (const name of ['.wayzerr-key', '.persona-key', 'images', 'skills']) { try { fs.rmSync(path.join(dir, name), { recursive: true, force: true }); } catch (_) {} }
  if (process.env.WAYZERR_SKILLS_DIR) { try { fs.rmSync(process.env.WAYZERR_SKILLS_DIR, { recursive: true, force: true }); } catch (_) {} }
  try { await session.fromPartition('persist:persona-browser').clearStorageData(); } catch (_) {}
  try { await session.defaultSession.clearStorageData(); await session.defaultSession.clearCache(); } catch (_) {}
  _mk = null;
  setTimeout(() => { store.wipe(); try { app.relaunch(); } catch (_) {} app.exit(0); }, 400);
  return true;
});
// ----- Help: the common questions, and "ask the guide" answered by the connected AI from the app's own info -----
const HELP_FAQ = (() => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'help-faq.json'), 'utf8')); } catch (_) { return []; } })();
const HELP_FACTS = "More facts: ⌘N makes a new bot, ⌘K searches all chats, ⌘1–⌘9 jumps between bots and ⌘, opens Settings. The ⋯ next to a bot edits, pins, copies, compacts, clears or deletes it. Clicking a bot's name at the top opens its menu: Edit, Copy chat, Clear chat, Delete, Chat size and Compact chat. The model button next to the message box picks the AI. Settings → General has your name, default AI, language, updates, AI usage (Low, Balanced, Max), Show tokens used per chat, Your apps, Text size, Appearance and Privacy. Settings → Help has the tour, the guide's look and these questions. You can tell a bot \"use your browser\" or \"don't use the connector\". When an update is ready, press Restart to update above your account.";
let helpBusy = false;
handle('help-faq', () => HELP_FAQ);
handle('help-ask', async (q, history) => {
  q = String(q || '').trim().slice(0, 400);
  if (!q) throw new Error('Type a question first.');
  if (helpBusy) throw new Error('One moment, I am still answering your last question.');
  let llm = resolveModel(null);
  if (!llm) { const p = providers().find((x) => (x.models || []).length); if (p) llm = resolveModel({ model: { providerId: p.id, model: p.models[0].id || p.models[0] } }); }
  if (!llm) throw new Error('Connect an AI first (Settings → AI & apps). The common questions below already have answers.');
  if (!/localhost|127\.0\.0\.1/.test(llm.baseUrl || '') && !(await hasInternet())) throw new Error('No internet connection. Check your Wi-Fi and try again.');
  const system = `You are the Tutorial Guide, the friendly guide inside the Wayzerr app. Answer the user's question about using Wayzerr in at most 110 words, in the language of the question, in plain friendly words, with short steps if needed. Use only the information below. If it isn't covered, say you aren't sure and point to Settings → Help or the search box in Settings. Never invent features or buttons.\n\nINFO\n${HELP_FAQ.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n')}\n${HELP_FACTS}`;
  helpBusy = true;
  try {
    // The last few messages of the help chat, so a follow-up like "and the second one?" makes sense.
    const earlier = (Array.isArray(history) ? history : []).filter((h) => h && (h.r === 'u' || h.r === 'g') && typeof h.t === 'string' && h.t).slice(-4).map((h) => `${h.r === 'u' ? 'User' : 'Guide'}: ${h.t.slice(0, 300)}`).join('\n');
    const r = await askPlain({ llm, system, text: (earlier ? `Earlier in this chat:\n${earlier}\n\nNew question: ` : '') + q, maxOut: 500 });
    if (!r.text) throw new Error('No answer came back. Try again.');
    return { text: r.text.slice(0, 1200) };
  } catch (e) {
    throw new Error(String(e.message || e).slice(0, 200));
  } finally { helpBusy = false; }
});
handle('save-guide', (g) => {
  const clean = (v) => String(v || '').replace(/[^\w #-]/g, '').slice(0, 24);
  const c = g?.character || {};
  store.data.settings.guide = { asked: g?.asked === true, character: { shape: clean(c.shape), color: clean(c.color), eyes: clean(c.eyes), mouth: clean(c.mouth), extra: clean(c.extra) || 'none', acc: clean(c.acc) || 'none' } };
  store.save();
  return true;
});
handle('compact-all', async () => {
  const sum = { folded: 0, chats: 0, before: 0, after: 0 };
  for (const p of store.data.personas) { const r = await compactChat(p.id); if (r.folded) { sum.folded += r.folded; sum.chats++; sum.before += r.before; sum.after += r.after; } }
  return { ...sum, state: publicState() };
});
// Cut a chat back to a message (for "Restart from here" and "Edit").
handle('truncate-chat', ({ personaId, index }) => {
  const chat = store.data.chats[personaId] || [];
  const i = Math.max(0, Math.min(chat.length, Number(index) || 0));
  store.data.chats[personaId] = chat.slice(0, i);
  const bp = store.data.personas.find((x) => x.id === personaId);
  resetCloudChats(bp);
  store.save();
  return publicState();
});
handle('clear-chat', (id) => {
  store.data.chats[id] = [];
  const bp = store.data.personas.find((x) => x.id === id);
  resetCloudChats(bp);
  store.save();
  return publicState();
});

handle('delete-memory', ({ personaId, memoryId }) => {
  store.data.memories[personaId] = (store.data.memories[personaId] || []).filter((m) => m.id !== memoryId);
  store.save();
  return publicState();
});

handle('update-connector', ({ key, patch }) => {
  Object.assign(store.data.connectors[key], patch);
  store.save();
  return publicState();
});

// ---------- Composio: Gmail, Calendar, Drive, Slack + 500 apps through one connector ----------
const { COMPOSIO_API_KEY } = require('./secrets');
const composioKey = () => COMPOSIO_API_KEY; // always empty: apps connect through wayzerr.com, which holds the key
const COMPOSIO = () => (process.env.WAYZERR_COMPOSIO_BASE || 'https://backend.composio.dev').replace(/\/+$/, '');
// Without a key of your own, apps connect through wayzerr.com: it holds the key, so nobody has to paste one and the key never reaches the app.
const hostedOn = () => !composioKey();
const HOSTED = () => (process.env.WAYZERR_COMPOSIO_HOST || new URL(PKG.updateFeedCloud).origin).replace(/\/+$/, '') + '/api/composio';
function appSecret() { if (!store.data.composioSecret) { store.data.composioSecret = enc(crypto.randomBytes(24).toString('base64url')); store.save(); } return dec(store.data.composioSecret); }
async function hostedFetch(pathname, { method = 'GET', body } = {}) {
  const r = await fetch(HOSTED() + pathname, { method, headers: { 'Content-Type': 'application/json', 'x-wz-secret': appSecret() }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error || `The apps connection answered ${r.status}. Try again in a minute.`);
  return j;
}
function connectServer(s) {
  if (s.composio && store.data.composio && !hostedOn()) return mcp.connect({ ...s, headers: { ...(s.headers || {}), 'x-api-key': composioKey() } });
  return mcp.connect(s);
}
async function composioFetch(pathname, body, key) {
  const r = await fetch(COMPOSIO() + pathname, { method: body ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'x-api-key': key }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(30000) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 401 || r.status === 403) throw new Error('Composio rejected the API key. Check it in dashboard.composio.dev → Settings → API keys.');
  if (!r.ok) throw new Error(`Composio error ${r.status}: ${j?.error?.message || j?.message || 'unknown'}`);
  return j;
}
async function composioSession(own) {
  if (!own && hostedOn()) {
    const j = await hostedFetch('/session', { method: 'POST', body: {} });
    if (!j?.mcp?.url) throw new Error("The apps connection didn't return a link. Try again in a minute.");
    const mcpUrl = HOSTED() + '/mcp/' + encodeURIComponent(j.session_id); // built here, so it always points at the same place as the rest
    store.data.composio = { userId: j.userId, sessionId: j.session_id, url: mcpUrl };
    const hs = store.data.customServers.find((x) => x.composio);
    if (hs) hs.url = mcpUrl;
    store.save();
    return;
  }
  const key = own || composioKey();
  const userId = store.data.composio?.userId || 'persona-' + crypto.randomBytes(6).toString('hex');
  const j = await composioFetch('/api/v3.1/tool_router/session', { user_id: userId }, key);
  if (!j?.mcp?.url) throw new Error("Composio didn't return a connector link. Try again in a minute.");
  store.data.composio = { ...(own ? { key: enc(own) } : store.data.composio?.key ? { key: store.data.composio.key } : {}), userId, sessionId: j.session_id, url: j.mcp.url };
  const s = store.data.customServers.find((x) => x.composio);
  if (s) s.url = j.mcp.url;
  store.save();
}
async function composioEnsure(apiKey) {
  const own = String(apiKey || '').trim();
  await composioSession(own);
  const list = store.data.customServers;
  let s = list.find((x) => x.composio);
  if (s) Object.assign(s, { url: store.data.composio.url, enabled: true });
  else { s = { id: crypto.randomBytes(3).toString('hex'), name: 'Your apps', logo: '', preset: 'composio', composio: true, url: store.data.composio.url, permission: 'ask', enabled: true }; list.push(s); }
  store.save();
  await connectServer(s);
  return publicState();
}
handle('composio-connect', async () => { delete store.data.composioOff; return composioEnsure(''); });
handle('skills-list', () => skills.list());
handle('skills-install', async (cmd) => { await skills.install(cmd); return skills.list(); });
handle('skills-remove', (id) => { skills.remove(id); return skills.list(); });
handle('composio-link', async (toolkit) => {
  if (!store.data.composio || !store.data.customServers.some((x) => x.composio)) await composioEnsure('');
  const c = store.data.composio;
  const j = hostedOn() ? await hostedFetch('/link/' + encodeURIComponent(c.sessionId), { method: 'POST', body: { toolkit } }) : await composioFetch(`/api/v3/tool_router/session/${encodeURIComponent(c.sessionId)}/link`, { toolkit }, composioKey());
  if (!j.redirect_url || !/^https:\/\//i.test(j.redirect_url)) throw new Error("Couldn't get a sign-in link for that app. Try again in a minute.");
  shell.openExternal(j.redirect_url);
  return j.redirect_url;
});
// Search the 500+ apps you can connect (falls back to a built-in list when offline).
const POPULAR_APPS = [['gmail','Gmail','Read, send and search email'],['googlecalendar','Google Calendar','Events, invites and free time'],['googledrive','Google Drive','Find, read and share files'],['googlesheets','Google Sheets','Read and update spreadsheets'],['googledocs','Google Docs','Create and edit documents'],['slack','Slack','Messages and channels'],['notion','Notion','Pages and databases'],['github','GitHub','Repos, issues and pull requests'],['outlook','Outlook','Microsoft email and calendar'],['instagram','Instagram','Posts, comments and insights'],['linkedin','LinkedIn','Posts and your profile'],['youtube','YouTube','Videos, playlists and comments'],['whatsapp','WhatsApp','Send and read WhatsApp messages'],['telegram','Telegram','Chats and bots'],['facebook','Facebook','Pages and posts'],['twitter','X (Twitter)','Posts and replies'],['trello','Trello','Boards and cards'],['asana','Asana','Tasks and projects'],['dropbox','Dropbox','Files and sharing'],['hubspot','HubSpot','Contacts and deals'],['shopify','Shopify','Orders and products'],['canva','Canva','Designs'],['spotify','Spotify','Music and playlists'],['discord','Discord','Servers and messages'],['zoom','Zoom','Meetings'],['calendly','Calendly','Scheduling'],['airtable','Airtable','Bases and records'],['figma','Figma','Design files'],['linear','Linear','Issues'],['jira','Jira','Issues and projects'],['onedrive','OneDrive','Microsoft files'],['microsoftteams','Microsoft Teams','Chats and meetings'],['todoist','Todoist','To-dos'],['mailchimp','Mailchimp','Email campaigns'],['stripe','Stripe','Payments'],['wordpress','WordPress','Site posts'],['tiktok','TikTok','Videos'],['pinterest','Pinterest','Pins and boards'],['reddit','Reddit','Posts and comments'],['clickup','ClickUp','Tasks'],['monday','monday.com','Boards'],['googlemaps','Google Maps','Places and directions'],['googletasks','Google Tasks','To-dos'],['googlemeet','Google Meet','Meetings'],['googlephotos','Google Photos','Photos and albums'],['googleslides','Google Slides','Presentations'],['googlecontacts','Google Contacts','Contacts']].map(([slug, name, description]) => ({ slug, name, description, logo: '' }));
handle('composio-search', async (q) => {
  const s = String(q || '').trim().toLowerCase();
  const local = POPULAR_APPS.filter((a) => !s || a.name.toLowerCase().includes(s) || a.slug.includes(s.replace(/\s+/g, '')))
    .sort((a, b) => (b.name.toLowerCase().startsWith(s) ? 1 : 0) - (a.name.toLowerCase().startsWith(s) ? 1 : 0));
  if (!s) return local.slice(0, 8);
  try {
    const j = hostedOn() ? await hostedFetch(`/toolkits?search=${encodeURIComponent(s)}&limit=12`) : await composioFetch(`/api/v3/toolkits?search=${encodeURIComponent(s)}&limit=12`, null, composioKey());
    const remote = (j.items || []).map((t) => ({ slug: String(t.slug || '').toLowerCase(), name: t.name || t.slug, description: t.meta?.description || '', logo: t.meta?.logo || '' })).filter((t) => t.slug);
    const seen = new Set();
    return [...local, ...remote].filter((a) => !seen.has(a.slug) && seen.add(a.slug))
      .sort((a, b) => (b.name.toLowerCase().startsWith(s) ? 1 : 0) - (a.name.toLowerCase().startsWith(s) ? 1 : 0)).slice(0, 8);
  } catch (_) { return local.slice(0, 8); }
});
// Which apps are connected right now (asks Composio; remembers the answer).
async function composioLinkedNow() {
  const c = store.data.composio;
  if (!c) return [];
  try {
    const j = hostedOn() ? await hostedFetch('/connected') : await composioFetch(`/api/v3/connected_accounts?user_ids=${encodeURIComponent(c.userId)}&statuses=ACTIVE&limit=100`, null, composioKey());
    const list = [...new Set((j.items || []).map((a) => a.toolkit?.slug || a.toolkit_slug || a.appName).filter(Boolean).map((x) => String(x).toLowerCase()))];
    store.data.composioLinked = list; store.save();
    return list;
  } catch (_) { return store.data.composioLinked || []; }
}
handle('composio-apps', () => composioLinkedNow());

// Connector keys never go to the window: it only sees "••••1234". Saving "••••…" keeps the real key.
const MASK = '\u2022\u2022\u2022\u2022';
const maskVal = (v) => (v ? MASK + String(v).slice(-4) : '');
const maskMap = (o) => (o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, maskVal(v)])) : o);
function maskServer(s) { return { ...s, env: maskMap(s.env), headers: maskMap(s.headers), apiKey: s.apiKey ? maskVal(s.apiKey) : s.apiKey }; }
function unmaskServer(s, old) {
  const keep = (v, prev) => (typeof v === 'string' && v.startsWith(MASK) ? prev : v);
  if (s.env && typeof s.env === 'object') s.env = Object.fromEntries(Object.entries(s.env).map(([k, v]) => [k, keep(v, old?.env?.[k])]).filter(([, v]) => v != null));
  if (s.headers && typeof s.headers === 'object') s.headers = Object.fromEntries(Object.entries(s.headers).map(([k, v]) => [k, keep(v, old?.headers?.[k])]).filter(([, v]) => v != null));
  if ('apiKey' in s) s.apiKey = keep(s.apiKey, old?.apiKey);
  return s;
}
handle('save-server', async (s) => {
  const list = store.data.customServers;
  if (s.id) unmaskServer(s, list.find((x) => x.id === s.id));
  if (!s.id) {
    s.id = crypto.randomBytes(3).toString('hex');
    s.permission = 'ask';
    s.enabled = true;
    list.push(s);
  } else {
    const i = list.findIndex((x) => x.id === s.id);
    if (i >= 0) list[i] = { ...list[i], ...s };
  }
  store.save();
  const saved = list.find((x) => x.id === s.id);
  if (saved.enabled) await connectServer(saved);
  else await mcp.disconnect(saved.id);
  return publicState();
});

handle('delete-server', async (id) => {
  await mcp.disconnect(id);
  if (store.data.customServers.find((s) => s.id === id)?.composio) { delete store.data.composio; store.data.composioOff = true; }
  store.data.customServers = store.data.customServers.filter((s) => s.id !== id);
  store.save();
  return publicState();
});

const pendingCards = new Map();

// ---------- Touch ID (Mac) for saved passwords and cards ----------
// The Mac's own fingerprint sheet ("Wayzerr is trying to …") — the check happens here, not in the window.
const canTouchID = () => { try { return process.platform === 'darwin' && systemPreferences.canPromptTouchID(); } catch (_) { return false; } };
async function touchID(reason) {
  if (!canTouchID()) return null; // no Touch ID on this computer: the in-app buttons are the OK
  try { if (win && !win.isDestroyed()) { if (win.isMinimized()) win.restore(); win.show(); } await systemPreferences.promptTouchID(String(reason).slice(0, 140)); return true; } catch (_) { return false; }
}
// Use a saved login on a "Log in to …" card: Touch ID first, then the app types it into the page.
handle('card-use-login', async ({ cardId, loginId }) => {
  const p = pendingCards.get(cardId);
  const it = vault.find(loginId);
  if (!p || !it || it.temp) return { ok: false };
  const ok = await touchID(`sign in with your saved login for ${it.name}`);
  if (ok === false) return { ok: false, cancelled: true };
  if (!pendingCards.has(cardId)) return { ok: false };
  pendingCards.delete(cardId);
  p.resolve({ useLogin: it.id });
  return { ok: true };
});
// Secure card answers (e.g. email + password). They go straight to the bot's browser — never to the AI.
handle('card-submit', ({ cardId, data }) => {
  const p = pendingCards.get(cardId);
  if (!p) return false;
  pendingCards.delete(cardId);
  p.resolve(data || { cancel: true });
  return true;
});
// "Can't connect" on a Connect card (e.g. a school account that doesn't allow it): bots stop asking.
handle('app-decline', ({ slug, personaId, id, undo }) => {
  slug = String(slug || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!slug) return publicState();
  store.data.appsDeclined ||= {};
  if (undo) { delete store.data.appsDeclined[slug]; if ((store.data.appPermissions || {})[slug] === 'never') delete store.data.appPermissions[slug]; }
  else store.data.appsDeclined[slug] = Date.now();
  const m = personaId && (store.data.chats[personaId] || []).find((x) => x.role === 'card' && x.id === id);
  if (m && !undo) m.status = 'declined';
  store.save();
  return publicState();
});
handle('card-update', ({ personaId, id, patch }) => {
  const m = (store.data.chats[personaId] || []).find((x) => x.role === 'card' && x.id === id);
  if (m && patch && typeof patch.status === 'string') { m.status = patch.status; store.save(); }
  return publicState();
});
// From the computer's window: saved cards and "always ask" logins need Touch ID (when the Mac has it).
handle('permission-answer', ({ requestId, answer }) => answerChecked(requestId, answer));
async function answerChecked(requestId, answer) {
  const p = pendingPermissions.get(requestId);
  if (p && answer !== 'deny' && (p.card || p.req?.kind === 'login')) {
    const r = p.req || {};
    const ok = await touchID(p.card ? `use your ${r.connectorName || 'saved card'}${r.site ? ' on ' + r.site : ''}${r.amount ? ' for ' + r.amount : ''}` : `sign in with your saved login for ${r.site || 'this site'}`);
    if (ok === false) return { touchFailed: true };
  }
  return answerPermission(requestId, answer);
}
function answerPermission(requestId, answer) {
  const p = pendingPermissions.get(requestId);
  if (!p) return false;
  pendingPermissions.delete(requestId);
  if (p.card && answer === 'always') answer = 'once'; // cards are approved one use at a time
  p.resolve(answer);
  if (win && !win.isDestroyed()) win.webContents.send('permission-cancel', { requestId });
  return true;
}

handle('browser-bounds', (b) => {
  screenBounds = b;
  for (const [id, br] of browsers) br.setBounds(id === screenBot ? b : { ...b, mode: 'hidden' });
  return true;
});
let thumbsOn = false;
handle('browser-select', (id) => {
  screenBot = id;
  for (const [bid, br] of browsers) {
    if (bid !== id) { br.setThumbs(false); if (screenBounds) br.setBounds({ ...screenBounds, mode: 'hidden' }); }
  }
  const b = browserFor(id);
  if (screenBounds) b.setBounds(screenBounds);
  b.setThumbs(thumbsOn);
  return { personaId: id, ...b.state() };
});
handle('browser-nav', async ({ action, url }) => { const b = shown(); if (!b) throw new Error('Open a bot first.'); await b.nav(action, url); return { personaId: screenBot, ...b.state() }; });
// Teach a skill: record what you do in the bot's browser, then save it as a skill every bot can use.
handle('teach-start', async (url) => {
  if (!screenBot) throw new Error('Open a bot first.');
  const b = browserFor(screenBot);
  if (url && !b.state().hasPage) await b.nav('go', url).catch(() => {});
  b.startTeach();
  return { personaId: screenBot };
});
handle('teach-peek', () => {
  const b = screenBot && browserFor(screenBot);
  const { describeStep } = require('./browser');
  return (b?.teach?.steps || []).map(describeStep).filter(Boolean);
});
handle('teach-stop', ({ save, name, when } = {}) => {
  const b = screenBot && browserFor(screenBot);
  const steps = b ? b.stopTeach() : [];
  if (!save) return { cancelled: true };
  const who = store.data.settings?.userName || 'The user';
  const r = skills.saveTaught({ name, when, steps, by: who });
  pushState();
  return r;
});
handle('browser-state', () => (shown() ? { personaId: screenBot, ...shown().state() } : { hasPage: false }));
handle('browser-thumbs', (on) => { thumbsOn = !!on; shown()?.setThumbs(thumbsOn); return true; });
// While the Screen panel is open, show a live picture of the selected bot's computer.
setInterval(async () => {
  if (!thumbsOn || !screenBot || !win || win.isDestroyed()) return;
  try { const data = await computers.thumb(screenBot); if (data) win.webContents.send('computer-thumb', { personaId: screenBot, data }); } catch (_) {}
}, 2500);

// Saved logins ("Passwords" folder)
handle('vault-save', (item) => { vault.save(item); return publicState(); });
handle('card-save', (item) => { vault.saveCard(item || {}); return publicState(); });
handle('card-delete', (id) => { vault.removeCard(String(id)); return publicState(); });
handle('vault-delete', (id) => { vault.remove(id); return publicState(); });
handle('vault-reveal', async (id) => {
  const it = vault.find(id);
  if (!it) return '';
  if ((await touchID(`show your saved password for ${it.name}`)) === false) throw new Error('Not shown: Touch ID was cancelled.');
  return vault.reveal(id);
});

// Official site icons (favicons), fetched once and cached.
handle('get-icons', async (domains) => {
  const cache = (store.data.iconCache ||= {});
  const online = store.data.settings.onlineIcons !== false; // Settings → Privacy: off = no logo downloads, letters instead
  const missing = online ? [...new Set(domains)].filter((d) => d && !cache[d]) : [];
  await Promise.all(missing.map(async (d) => {
    try {
      const src = /^https?:\/\//.test(d) ? d : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(d)}&sz=128`;
      const r = await fetch(src, { signal: AbortSignal.timeout(8000) });
      const buf = Buffer.from(await r.arrayBuffer());
      if (r.ok && buf.length > 200) cache[d] = `data:${r.headers.get('content-type') || 'image/png'};base64,${buf.toString('base64')}`;
    } catch (_) { /* offline: the app falls back to letter badges */ }
  }));
  if (missing.length) store.save();
  return Object.fromEntries(domains.map((d) => [d, cache[d] || null]));
});
// ----- A small Linux computer for each bot -----
let computersInst = null;
const sharedFilesDir = () => process.env.WAYZERR_DATA_DIR ? path.join(dataDir(), 'Wayzerr Files') : path.join(app.getPath('home'), 'Wayzerr Files') // not in Documents/Downloads/Desktop, so macOS never asks permission for it;
// Which computer the bot's computer tools control: its own Linux computer, or the user's Mac. The setting decides, and the
// message can say otherwise ("on my Mac", "use your own computer").
const mymac = require('./mymac')({ getName: () => myComputerName() });
const myComputerName = () => (store?.data.settings.myComputerName || '').trim() || 'My Mac';
function computerTargetFor(text) {
  const t = String(text || '');
  const name = myComputerName().toLowerCase();
  const mine = /\b(on|in|with|using|use|control|open|from)\s+(my|the user'?s)\s+(own\s+|real\s+)?(mac(book)?|computer|pc|laptop|desktop|screen|machine)\b|\bmy (mac(book)?|computer|screen)\b/i.test(t) || (name !== 'my mac' && t.toLowerCase().includes(name));
  const bots = /\b(on|in|with|using|use)\s+your\s+(own\s+)?(computer|machine|pc|vm|linux)\b|\byour own (computer|machine)\b|\bin (the|your) (virtual|linux)\b/i.test(t);
  let target = store.data.settings.computerTarget === 'mine' ? 'mine' : 'bot';
  if (mine && !bots) target = 'mine'; else if (bots && !mine) target = 'bot';
  return target === 'mine' && !mymac.supported ? 'bot' : target;
}
handle('mac-permissions', () => mymac.permissions());
handle('mac-request-access', (which) => mymac.requestAccess(which));
const computers = new Proxy({}, { get: (_t, k) => (computersInst ||= require('./computer')({ dir: path.join(dataDir(), 'computers'), feedUrl: PKG.updateFeedCloud, sharedDir: sharedFilesDir(), log: console.log, onPointer: (p) => { try { if (win && !win.isDestroyed()) win.webContents.send('computer-pointer', p); } catch (_) {} } }))[k] });
const desktopMode = () => { try { return computers.status().supported; } catch (_) { return false; } };
handle('account-start', () => account.start());
handle('account-signin-cancel', () => { account.cancel(); return true; }); // (not 'account-cancel': that name belongs to the AI-provider sign-in below)
handle('account-logout', async () => { await account.logout(); return publicState(); });
handle('open-files-folder', async () => { fs.mkdirSync(sharedFilesDir(), { recursive: true }); await shell.openPath(sharedFilesDir()); return true; });
handle('computer-status', (id) => computers.status(id));
handle('computer-install', () => computers.ensure((p) => { if (win && !win.isDestroyed()) win.webContents.send('computer-progress', p); }));
handle('computer-plan', () => computers.plan().catch(() => null));
// How much room the browser's saved sign-ins, cookies and cache take on this computer.
handle('browser-usage', async () => {
  const dirSize = (d) => { let n = 0; try { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); n += e.isDirectory() ? dirSize(f) : fs.statSync(f).size; } } catch (_) {} return n; };
  return dirSize(path.join(app.getPath('userData'), 'Partitions', 'persona-browser'));
});
handle('computer-start', (id) => computers.start(id));
handle('computer-touch', (id) => { computers.touch(id); return true; });
handle('computer-stop', (id) => { computers.stop(id); return true; });
handle('computer-delete', (id) => { computers.remove(id); return true; });
handle('computer-usage', () => computers.usage());
handle('computer-wipe', async () => { const s = await computers.wipe(); try { if (win && !win.isDestroyed()) win.webContents.send('computer-progress', { step: '', done: 0, total: 0 }); } catch (_) {} return s; });
handle('browser-screenshot', async () => {
  const b = shown();
  if (!b || !b.hasPage) throw new Error('Nothing is open in the Screen yet.');
  return b.screenshot();
});
handle('clear-browser-data', async () => {
  await session.fromPartition('persist:persona-browser').clearStorageData();
  return true;
});
function stopTurn(personaId) {
  running.get(personaId)?.abort();
  compacting.get(personaId)?.ctl.abort();
  queueGen.set(personaId, (queueGen.get(personaId) || 0) + 1);
  const g = store.data.personas.find((p) => p.id === personaId && p.group);
  for (const id of g?.members || []) { running.get(id)?.abort(); queueGen.set(id, (queueGen.get(id) || 0) + 1); }
  for (const [id, p] of pendingPermissions) {
    if (p.personaId === personaId) {
      pendingPermissions.delete(id);
      p.resolve('deny');
      win.webContents.send('permission-cancel', { requestId: id });
    }
  }
  return true;
}
handle('stop-turn', (personaId) => stopTurn(personaId));

// ---------- Running a bot's turn (used by the chat, by other bots, and by other apps via MCP) ----------
const botQueues = new Map(); // personaId -> promise chain, so one bot handles one message at a time

const queueGen = new Map(); // bumped by Stop: queued messages for that bot are dropped
const IDLE_LIMIT = Number(process.env.WAYZERR_IDLE_MS) || 3 * 60 * 1000; // a reply that shows no sign of life for this long is stopped
const TURN_LIMIT = Number(process.env.WAYZERR_TURN_MS) || 12 * 60 * 1000; // and no reply may take longer than this (time waiting for you doesn't count)
// Is there internet? (A quick look-up; cloud AIs can't answer without it.)
let netOkAt = 0;
async function hasInternet() {
  if (Date.now() - netOkAt < 20000) return true; // checked a moment ago: don't make every message wait for a lookup
  let ok;
  try { await Promise.race([require('dns').promises.lookup('www.apple.com'), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 3000))]); ok = true; }
  catch (e) { ok = !/ENOTFOUND|EAI_AGAIN|ENETUNREACH|ECONNREFUSED|timeout/i.test(e.code || e.message || ''); }
  if (ok) netOkAt = Date.now();
  return ok;
}

const longChatNoted = new Map();
function runBotTurn(persona, text, { attachments, from, depth = 0, chatKey, group, skipUser, chain = [], scheduled } = {}) {
  const evId = chatKey || persona.id; // group chats: events go to the group's row
  const prev = botQueues.get(persona.id) || Promise.resolve();
  const gen = queueGen.get(persona.id) || 0;
  const send = (ch, data) => win && !win.isDestroyed() && win.webContents.send(ch, data);
  if (running.has(persona.id)) send('chat-event', { personaId: evId, botId: persona.id, botName: persona.name, type: 'status', activity: 'waiting', text: `${persona.name} is finishing another task first` });
  const job = prev.catch(() => {}).then(async () => {
    await compacting.get(evId)?.promise; // a compact from the last reply finishes first (a moment)
    if ((queueGen.get(persona.id) || 0) !== gen) { const e = new Error('Stopped'); e.stopped = true; throw e; }
    let llm = resolveModel(persona);
    if (!llm) throw new Error('Connect an AI first: Settings → AI & apps.');
    const note = (text) => { (store.data.chats[evId] ||= []).push({ role: 'activity', content: text, ts: Date.now(), ...(group ? { bot: persona.id, botName: persona.name } : {}) }); store.save(); pushState(); };
    if (!/localhost|127\.0\.0\.1/.test(llm.baseUrl || '') && !(await hasInternet())) {
      if (!skipUser && text) (store.data.chats[evId] ||= []).push({ role: 'user', content: text, ts: Date.now(), ...(attachments?.length ? { attachments } : {}) });
      note(`${persona.name} can't answer: no internet connection. Check your Wi-Fi and try again.`);
      if (!group) send('chat-event', { personaId: persona.id, type: 'done' });
      return '';
    }
    const turnUse = { input: 0, output: 0, cached: 0, peak: 0, cost: 0, calls: 0, est: false, t0: Date.now() };
    llm.turnUse = turnUse;
    llm.onUsage = (u) => {
      addUsage(llm.providerId, u);
      const n = normUsage(u);
      turnUse.input += n.input; turnUse.cached += n.cached; turnUse.peak = Math.max(turnUse.peak, n.input + n.cached); turnUse.output += n.output; turnUse.cost += n.cost; turnUse.calls++;
      if (n.estimated) turnUse.est = true;
    };
    const target = computerTargetFor(text);
    const ctl = new AbortController();
    running.set(persona.id, ctl);
    if (chatKey) running.set(chatKey, ctl);
    // Watchdog: if nothing happens for a long time (and it isn't waiting for you), stop instead of "typing" forever.
    let last = Date.now(), waitingOnYou = 0, timedOut = false, waited = 0, waitStart = 0;
    const began = Date.now();
    const dog = setInterval(() => {
      const worked = Date.now() - began - waited - (waitingOnYou ? Date.now() - waitStart : 0);
      if (!waitingOnYou && (Date.now() - last > IDLE_LIMIT || worked > TURN_LIMIT)) { timedOut = true; clearInterval(dog); ctl.abort(); }
    }, 5000);
    const alive = () => { last = Date.now(); };
    const waitFor = (p) => { if (!waitingOnYou++) waitStart = Date.now(); return p.finally(() => { if (!--waitingOnYou) waited += Date.now() - waitStart; alive(); }); };
    if (from) { pushState(); send('chat-event', { personaId: evId, type: 'status', activity: 'thinking', text: `Reading ${from.name}'s message` }); }
    try {
      const replied = await runTurn({
        store,
        mcp,
        ctx: { browser: browserFor(persona.id), desktop: store.data.settings.computerOn === false ? false : target === 'mine' ? mymac.supported : desktopMode(), myMac: mymac.supported, computerTarget: target, myComputerName: myComputerName(), schedules: schedApi, computer: { run: (n, a) => (target === 'mine' ? mymac.run(n, a) : computers.run(persona.id, n, a)), fill: (items, submit) => (target === 'mine' ? mymac.fill(items, submit) : computers.fill(persona.id, items, submit)) }, vault, team, persona, depth, chain: [...chain, persona.id], registerTurn: (t) => personaMcp.registerTurn(t), makeImage: (prompt, size) => makeBotImage(prompt, size), appsLinked: () => (process.env.WAYZERR_APPS_LINKED != null ? Promise.resolve(process.env.WAYZERR_APPS_LINKED.split(',').filter(Boolean)) : composioLinkedNow()) },
        llm,
        persona,
        userText: text,
        attachments,
        from,
        scheduled,
        chatKey,
        group,
        skipUser,
        hooks: {
          signal: ctl.signal,
          onEvent: (evt) => { alive(); return evt.type === 'message' ? pushState() : send('chat-event', { personaId: evId, botId: persona.id, botName: persona.name, ...evt, text: evt.text }); },
          askCard: (req) =>
            waitFor(new Promise((resolve) => {
              pendingCards.set(req.cardId, { resolve, personaId: persona.id });
              ctl.signal.addEventListener('abort', () => { if (pendingCards.delete(req.cardId)) resolve({ cancel: true }); }, { once: true });
            })),
          askPermission: (req) =>
            waitFor(new Promise((resolve) => {
              const requestId = crypto.randomBytes(6).toString('hex');
              pendingPermissions.set(requestId, { resolve, personaId: persona.id, card: req.kind === 'card', req: { ...req, personaName: persona.name, requestId } });
              ctl.signal.addEventListener('abort', () => { if (pendingPermissions.delete(requestId)) { resolve('deny'); send('permission-cancel', { requestId }); } }, { once: true });
              send('permission-request', { requestId, personaName: persona.name, ...req });
            })),
          waitForBot: (p) => waitFor(p), // talking to another bot counts as waiting, not stuck
        },
      });
      // Chats are never shortened behind your back. Only when one message needed more than 400,000 tokens of context
      // is the old part folded away automatically (down to a small note + the latest messages, so it is not repeated
      // every message); otherwise you press Compact.
      if (store.data.settings.autoCompact === true && turnUse.peak > AUTO_COMPACT_TOKENS && !ctl.signal.aborted && !compacting.has(evId)) {
        const cc = new AbortController();
        const promise = compactChat(evId, { smart: store.data.settings.smartCompact !== false, signal: cc.signal }).catch(() => {}).finally(() => { compacting.delete(evId); pushState(); });
        compacting.set(evId, { promise, ctl: cc });
      }
      // A long chat makes every message cost more, because the AI re-reads the whole chat each time: say so, once in a while.
      const sizeNow = Math.max(turnUse.input, turnUse.peak - turnUse.cached);
      if (!group && !ctl.signal.aborted && sizeNow > 60000 && Date.now() - (longChatNoted.get(evId) || 0) > 30 * 60000) {
        longChatNoted.set(evId, Date.now());
        note(`This chat is getting long: each message now sends about ${Math.round(sizeNow / 1000)}k tokens. Use Compact or Clear chat to make replies cheaper.`);
      }
      return replied;
    } catch (e) {
      // Show what went wrong in the chat (on the computer and the phone), in plain words.
      if (!e.stopped && !timedOut && !ctl.signal.aborted && !group) {
        const off = /fetch failed|ENOTFOUND|EAI_AGAIN|ENETUNREACH|ECONNRESET|network|getaddrinfo/i.test(e.message || '');
        note(off ? `${persona.name} can't answer: no internet connection. Check your Wi-Fi and try again.` : `${persona.name} couldn't answer: ${String(e.message || 'something went wrong').slice(0, 160)}`);
        e.shown = true;
      }
      throw e;
    } finally {
      clearInterval(dog);
      if (timedOut) {
        (store.data.chats[evId] ||= []).push({ role: 'activity', content: `${persona.name} stopped because it took too long to answer. Check your internet and try again.`, ts: Date.now() });
        store.save();
      }
      running.delete(persona.id);
      if (chatKey) running.delete(chatKey);
      if (!group) send('chat-event', { personaId: persona.id, type: 'done' });
      try { notifyDone(persona, evId, began); } catch (_) {}
      pushState();
    }
  });
  botQueues.set(persona.id, job);
  return job;
}

// New bots made by other bots get one of the 18 looks, in a colour no other bot has yet.
const LOOKS = [['orb', '#FF6B5B', 'dots', 'smile'], ['pebble', '#4F8BFF', 'ovals', 'none'], ['blob', '#FFB020', 'wide', 'o'], ['bun', '#2FCB7A', 'dots', 'smile'], ['capsule', '#A77BFF', 'ovals', 'none'], ['bean', '#FF7AB6', 'wide', 'o'],
  ['orb', '#FF8A3D', 'ovals', 'o'], ['pebble', '#38BDF8', 'wide', 'smile'], ['blob', '#E879F9', 'dots', 'none'], ['bun', '#F2F2F2', 'ovals', 'o'], ['capsule', '#2DD4BF', 'wide', 'smile'], ['bean', '#A3E635', 'dots', 'none'],
  ['orb', '#6366F1', 'dots', 'none'], ['pebble', '#FB7185', 'dots', 'o'], ['blob', '#6EE7B7', 'ovals', 'smile'], ['bun', '#B07A4F', 'wide', 'none'], ['capsule', '#FACC15', 'dots', 'o'], ['bean', '#5B6275', 'ovals', 'smile']];
function freshLook() {
  const used = new Set(store.data.personas.map((p) => String(p.character?.color || '').toLowerCase()));
  const free = LOOKS.filter((l) => !used.has(l[1].toLowerCase()));
  const [shape, color, eyes, mouth] = (free.length ? free : LOOKS)[Math.floor(Math.random() * (free.length || LOOKS.length))];
  return { shape, color, eyes, mouth, extra: 'none', acc: 'none' };
}
function createBot({ name, tag = '', description = '', createdBy }) {
  name = String(name || '').trim().slice(0, 40);
  if (!name) throw new Error('Give the new bot a name.');
  const p = { id: crypto.randomBytes(4).toString('hex'), created: Date.now(), name, tag: String(tag || '').trim().slice(0, 30), description: String(description || '').trim().slice(0, 600), character: freshLook() };
  if (createdBy) p.createdBy = createdBy;
  store.data.personas.push(p);
  store.save();
  pushState();
  return p;
}

// Bot-to-bot conversations are temporary: they're removed a day later.
const DAY = 24 * 3600 * 1000;
function sweepBotTalk() {
  const cut = Date.now() - DAY; let n = 0;
  for (const [k, list] of Object.entries(store.data.chats || {})) {
    const keep = list.filter((m) => !((m.botTalk || m.kind === 'botmsg') && (m.ts || 0) < cut));
    if (keep.length !== list.length) { n += list.length - keep.length; store.data.chats[k] = keep; }
  }
  if (n) { store.save(); pushState(); }
}
setTimeout(() => { try { sweepBotTalk(); } catch (_) {} }, 5000);
setInterval(() => { try { sweepBotTalk(); } catch (_) {} }, 3600 * 1000);


// ---------- Schedules: bots doing tasks by themselves at times you choose ----------
const schedList = () => (store.data.schedules ||= []);
const schedLog = () => (store.data.scheduleLog ||= []);
const SCHED_CATCHUP = 6 * 3600 * 1000; // a run missed while Wayzerr was closed still happens if it was at most this long ago
function applyAwake() {
  const on = !!store.data.phone?.enabled || (store.data.settings.scheduleAwake !== false && schedList().some((s) => s.enabled !== false && schedules.nextRun(s, Date.now())));
  if (on && !(awakeId >= 0 && powerSaveBlocker.isStarted(awakeId))) awakeId = powerSaveBlocker.start('prevent-app-suspension');
  if (!on && awakeId >= 0 && powerSaveBlocker.isStarted(awakeId)) { powerSaveBlocker.stop(awakeId); awakeId = -1; }
}
function logRun(rec) {
  const log = schedLog();
  log.unshift(rec);
  if (log.length > 300) log.length = 300;
  return rec;
}
async function runSchedule(s, { manual } = {}) {
  const bot = store.data.personas.find((p) => p.id === s.botId && !p.group);
  const rec = logRun({ id: crypto.randomBytes(4).toString('hex'), sid: s.id, botId: s.botId, botName: bot?.name || '', title: s.title, ts: Date.now(), status: 'running', manual: !!manual });
  s.lastRun = rec.ts;
  store.save(); pushState();
  try {
    if (!bot) throw new Error('This bot was deleted.');
    const text = s.prompt + (s.useComputer ? '\n\n(Use your own computer for this.)' : '');
    const reply = await runBotTurn(bot, text, { scheduled: { id: s.id, title: s.title } });
    rec.status = 'done';
    rec.summary = String(reply || '').replace(/\s+/g, ' ').trim().slice(0, 240);
  } catch (e) {
    rec.status = e.stopped ? 'stopped' : 'failed';
    rec.error = String(e.message || 'Something went wrong').slice(0, 200);
  } finally {
    rec.ms = Date.now() - rec.ts;
    store.save(); pushState(); applyAwake();
    if (bot && rec.status === 'done') scheduleAlert(bot, s, rec.summary);
  }
}
// A task has run: tell the user even if they are looking at something else (a system notification, the dock icon and a card inside Wayzerr).
function scheduleAlert(bot, s, text) {
  try { if (notifyCfg().enabled) showNotification(bot, bot.id, `${s.title}${text ? ': ' + text : ''}`); } catch (_) {}
  try { app.dock && app.dock.bounce('informational'); } catch (_) {}
  try { if (win && !win.isDestroyed()) win.webContents.send('schedule-fired', { botId: bot.id, botName: bot.name, title: s.title, text: String(text || '').slice(0, 400) }); } catch (_) {}
}
function tickSchedules() {
  const now = Date.now();
  let changed = false;
  for (const s of schedList()) {
    if (s.enabled === false) continue;
    const cursor = s.cursor || s.created || now;
    const due = schedules.occurrences(s, cursor + 1, now + 1);
    if (!due.length) continue;
    s.cursor = now; changed = true;
    const t = due[due.length - 1];
    if (now - t > SCHED_CATCHUP) { logRun({ id: crypto.randomBytes(4).toString('hex'), sid: s.id, botId: s.botId, botName: store.data.personas.find((p) => p.id === s.botId)?.name || '', title: s.title, ts: t, status: 'missed', error: 'Wayzerr was not open at that time.', ms: 0 }); continue; }
    runSchedule(s).catch(() => {});
  }
  if (changed) { store.save(); pushState(); applyAwake(); }
}
const schedApi = {
  list: () => schedList().map((s) => ({ ...s, next: schedules.nextRun(s, Date.now()), repeatText: schedules.describeRepeat(s) })),
  save(input) {
    const old = input.id ? schedList().find((s) => s.id === input.id) : null;
    const s = schedules.clean(input, old || {});
    if (!store.data.personas.some((p) => p.id === s.botId && !p.group)) throw new Error('Choose one of your bots.');
    if (old) { Object.assign(old, s); if (input.start || input.repeat) old.cursor = Date.now(); } else { s.id = crypto.randomBytes(4).toString('hex'); s.created = Date.now(); s.cursor = Date.now(); schedList().push(s); }
    store.save(); pushState(); applyAwake();
    return (old || s).id;
  },
  remove(id) {
    const i = schedList().findIndex((s) => s.id === id);
    if (i < 0) return false;
    schedList().splice(i, 1); store.save(); pushState(); applyAwake();
    return true;
  },
};
handle('schedule-save', (input) => schedApi.save(input || {}));
handle('schedule-delete', (id) => schedApi.remove(id));
handle('schedule-toggle', ({ id, enabled }) => { const s = schedList().find((x) => x.id === id); if (!s) return false; s.enabled = !!enabled; if (enabled) s.cursor = Date.now(); store.save(); pushState(); applyAwake(); return true; });
handle('schedule-run', (id) => { const s = schedList().find((x) => x.id === id); if (!s) throw new Error('That schedule is gone.'); runSchedule(s, { manual: true }).catch(() => {}); return true; });
handle('schedule-awake', (on) => { store.data.settings.scheduleAwake = !!on; store.save(); applyAwake(); pushState(); return true; });
handle('schedule-log-clear', () => { store.data.scheduleLog = []; store.save(); pushState(); return true; });
setTimeout(() => { try { tickSchedules(); applyAwake(); } catch (_) {} }, 8000);
setInterval(() => { try { tickSchedules(); } catch (_) {} }, 15000);

const team = createTeam({ store: { get data() { return store.data; }, save: () => store.save() }, createBot, runBotTurn: (...a) => runBotTurn(...a), runGroupTurn: (g, text, o) => runGroupTurn(g, text, null, o) });

async function sendMessage(personaId, text, attachments) {
  const persona = store.data.personas.find((p) => p.id === personaId);
  if (!persona) throw new Error('Choose a bot first.');
  if (persona.group) return runGroupTurn(persona, text, attachments);
  return runBotTurn(persona, text, { attachments });
}
handle('send-message', ({ personaId, text, attachments }) => sendMessage(personaId, text, attachments).catch((e) => { if (e.shown) return ''; throw e; }));

// ---------- Notifications: a bot tells you when it's done ----------
const botPics = new Map(); // bot id -> picture (sent by the window, which draws the bots)
function notifyCfg() { const n = (store.data.notify ||= { enabled: true, from: 'all' }); return { enabled: n.enabled !== false, from: Array.isArray(n.from) ? n.from : 'all' }; }
function showNotification(bot, chatId, text) {
  const { Notification, nativeImage } = require('electron');
  if (!Notification.isSupported()) return;
  const pic = botPics.get(bot.id);
  const n = new Notification({ title: bot.name, body: String(text || '').replace(/<thinking>[\s\S]*?<\/thinking>/g, '').replace(/[*#`_>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 180) || 'Done', silent: false, ...(pic ? { icon: nativeImage.createFromDataURL(pic) } : process.platform !== 'darwin' ? { icon: path.join(__dirname, 'icon.png') } : {}) });
  n.on('click', () => { if (!win || win.isDestroyed()) return; if (win.isMinimized()) win.restore(); win.show(); win.focus(); store.data.activePersonaId = chatId; store.save(); win.webContents.send('open-chat', chatId); });
  n.show();
}
function notifyDone(bot, chatId, since) {
  const cfg = notifyCfg();
  if (!cfg.enabled) return;
  if (Array.isArray(cfg.from) && !cfg.from.includes(bot.id) && !cfg.from.includes(chatId)) return;
  const watching = win && !win.isDestroyed() && win.isFocused() && store.data.activePersonaId === chatId;
  if (watching) return;
  const last = [...(store.data.chats[chatId] || [])].reverse().find((m) => m.role === 'assistant' && !m.botTalk && (m.ts || 0) >= since - 1000 && (!m.bot || m.bot === bot.id));
  if (!last) return;
  showNotification(bot, chatId, last.image ? 'Made a picture for you 🖼️' : last.content);
}
// ---------- Pictures made by bots (in the cloud) ----------
const imagesDir = () => path.join(dataDir(), 'images');
function imageFile(id) {
  if (!/^[a-f0-9]{8,32}$/.test(String(id || ''))) return null;
  for (const ext of ['png', 'jpg', 'webp']) { const f = path.join(imagesDir(), `${id}.${ext}`); if (fs.existsSync(f)) return f; }
  return null;
}
async function makeBotImage(prompt, size) {
  const list = providers().map((p) => ({ type: p.type, name: p.name, baseUrl: p.baseUrl, key: dec(p.key), imageOk: p.imageOk }));
  // If ChatGPT's picture tool turned out to be unavailable on this account, don't try (and pay for) it again for a week.
  const off = store.data.codexImageOff && Date.now() - store.data.codexImageOff < 7 * 864e5;
  const codex = async (pr, sz) => { try { return await cli.codexImage(pr, sz); } catch (e) { if (e.unavailable) { store.data.codexImageOff = Date.now(); store.save(); } throw e; } };
  const r = await require('./images').makeImage(list, prompt, size, { codex: off ? null : codex, skipNote: off ? "ChatGPT's picture tool isn't available on this account" : '', free: store.data.settings.freeImages !== false });
  const id = crypto.randomBytes(8).toString('hex');
  const ext = /jpe?g/.test(r.mime) ? 'jpg' : /webp/.test(r.mime) ? 'webp' : 'png';
  fs.mkdirSync(imagesDir(), { recursive: true });
  fs.writeFileSync(path.join(imagesDir(), `${id}.${ext}`), r.buf);
  return { id, via: r.via, skipped: r.skipped || '' };
}
handle('image-get', (id) => { const f = imageFile(id); if (!f) return null; const ext = path.extname(f).slice(1); return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,` + fs.readFileSync(f).toString('base64'); });
handle('image-save', (id) => {
  const f = imageFile(id); if (!f) throw new Error('That picture is gone.');
  const dir = process.env.WAYZERR_DOWNLOADS || app.getPath('downloads');
  let out = path.join(dir, `Wayzerr picture ${new Date().toISOString().slice(0, 10)}${path.extname(f)}`), n = 2;
  while (fs.existsSync(out)) out = out.replace(/( \d+)?(\.\w+)$/, ` ${n++}$2`);
  fs.copyFileSync(f, out);
  shell.showItemInFolder(out);
  return out;
});

// A picture you attached to a chat → Downloads.
// "Copy" in the picture viewer: puts the picture on the clipboard so it can be pasted into a document or a chat.
handle('image-copy', ({ dataUrl } = {}) => {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || m[2].length > 40 * 1024 * 1024) throw new Error("Couldn't copy that picture.");
  const { clipboard, nativeImage } = require('electron');
  const img = nativeImage.createFromBuffer(Buffer.from(m[2], 'base64'));
  if (img.isEmpty()) throw new Error("Couldn't copy that picture.");
  clipboard.writeImage(img);
  return true;
});
handle('image-save-data', ({ dataUrl, name } = {}) => {
  const m = /^data:image\/(png|jpe?g|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m || m[2].length > 40 * 1024 * 1024) throw new Error("Couldn't save that picture.");
  const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
  const dir = process.env.WAYZERR_DOWNLOADS || app.getPath('downloads');
  const base = String(name || '').replace(/\.[a-z0-9]+$/i, '').replace(/[\/:*?"<>|\x00-\x1f]/g, '').trim().slice(0, 60) || `Wayzerr picture ${new Date().toISOString().slice(0, 10)}`;
  let out = path.join(dir, `${base}.${ext}`), n = 2;
  while (fs.existsSync(out)) out = path.join(dir, `${base} ${n++}.${ext}`);
  fs.writeFileSync(out, Buffer.from(m[2], 'base64'));
  shell.showItemInFolder(out);
  return out;
});

// ---------- Speech to text ----------
const speechProviders = () => providers().map((p) => ({ type: p.type, baseUrl: p.baseUrl, key: dec(p.key) }));
// Your language and your own words (plus your bots' names) make the transcript more accurate.
const voiceWords = () => [...new Set([...String(store.data.settings.voiceWords || '').split(/[,\n;]+/), 'Wayzerr', ...(store.data.personas || []).filter((p) => !p.group).map((p) => p.name)].map((w) => String(w || '').trim()).filter((w) => w && w.length <= 40))].slice(0, 40);
async function transcribeVoice(buf, mime) { return require('./speech').transcribe(speechProviders(), Buffer.from(buf), String(mime || 'audio/webm'), store.data.settings.voiceLang || undefined, localStt, voiceWords()); }
handle('voice-available', () => require('./speech').available(speechProviders(), localStt));
handle('voice-warm', () => { localStt.warm(); return true; });
// While Talk mode is open the window must keep listening even when it's hidden or behind other windows.
handle('talk-active', (on) => { try { win?.webContents.setBackgroundThrottling(!on); } catch (_) {} return true; });
handle('voice-mic', async () => {
  if (process.platform !== 'darwin') return true;
  const { systemPreferences } = require('electron');
  if (systemPreferences.getMediaAccessStatus('microphone') === 'granted') return true;
  return systemPreferences.askForMediaAccess('microphone');
});
handle('voice-transcribe', async ({ data, mime }) => {
  if (typeof data !== 'string' || data.length > 30 * 1024 * 1024) throw new Error('That recording is too long. Keep it under a few minutes.');
  return transcribeVoice(Buffer.from(data, 'base64'), mime);
});

// Unread dots: when you last looked at each chat (existing chats start as read).
function seenMap() {
  if (!store.data.seen) { store.data.seen = {}; for (const k of Object.keys(store.data.chats || {})) store.data.seen[k] = Date.now(); }
  return store.data.seen;
}
handle('mark-seen', (id) => { seenMap()[String(id)] = Date.now(); store.save(); return true; });
handle('notify-save', ({ enabled, from }) => { store.data.notify = { enabled: !!enabled, from: Array.isArray(from) ? from.map(String) : 'all' }; store.save(); return publicState(); });
handle('notify-test', (id) => { const bot = store.data.personas.find((p) => p.id === id) || { id: 'x', name: 'Wayzerr' }; showNotification(bot, bot.id, 'This is how a finished task will look.'); return true; });
handle('bot-pics', (map) => { for (const [id, url] of Object.entries(map || {})) if (/^data:image\/png;base64,/.test(url)) botPics.set(id, url); return true; });

// ---------- Wayzerr on your phone ----------
handle('phone-state', () => phone.state());
handle('phone-set', (patch) => { if (store.data.settings.phoneUnlocked !== true) throw new Error('Phone is still under development.'); return phone.set(patch || {}); });
// Phone is still under development: Control+1 opens a box for this code, and only then can it be used.
handle('phone-unlock', (code) => {
  if (String(code || '').trim() !== '250612') throw new Error('That code is not right.');
  store.data.settings.phoneUnlocked = true; store.save(); pushState();
  phone.apply().catch(() => {});
  return true;
});
handle('phone-lock', () => { store.data.settings.phoneUnlocked = false; store.save(); pushState(); phone.apply().catch(() => {}); return true; });
handle('phone-qr', (text) => phone.qr(String(text || '')));

// ---------- Group chats: several bots in one chat ----------
handle('save-group', ({ id, name, members }) => {
  const list = store.data.personas;
  const ids = (members || []).filter((m) => list.some((p) => p.id === m && !p.group));
  if (ids.length < 2) throw new Error('Pick at least 2 bots for a group chat.');
  let g = id && list.find((p) => p.id === id);
  if (g) Object.assign(g, { name: String(name || g.name).trim() || g.name, members: ids });
  else { g = { id: crypto.randomBytes(4).toString('hex'), created: Date.now(), group: true, name: String(name || '').trim() || list.filter((p) => ids.includes(p.id)).map((p) => p.name.split(' ')[0]).join(', '), tag: 'Group', members: ids }; list.push(g); }
  store.data.activePersonaId = g.id;
  store.save();
  return publicState();
});
const EVERYONE = /\b(everyone|everybody|all of you|you all|y'all|guys|team|todos|всем|все)\b/i;
const STOP = new Set('the and for you your with that this what have from can could would please about just make help some want need tell will into them they then than when there here also like more does bot bots'.split(' '));
const words = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').match(/[a-z\u0400-\u04ff0-9]{3,}/g) || [];
const stem = (w) => w.slice(0, 5);
function pickResponders(list, text, chat) {
  if (EVERYONE.test(text)) return list;
  const msg = new Set(words(text).filter((w) => !STOP.has(w)).map(stem));
  const scored = list.map((p) => {
    const own = new Set(words(`${p.name} ${p.tag || ''} ${p.tag || ''} ${p.description || ''}`).filter((w) => !STOP.has(w) && w !== 'bot').map(stem));
    let score = 0; for (const w of own) if (msg.has(w)) score++;
    if (msg.has(stem(words(p.name)[0] || '###'))) score += 3;
    return { p, score };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  if (scored.length) return scored.slice(0, 2).filter((x, i) => i === 0 || x.score >= scored[0].score - 1).map((x) => x.p);
  // Nothing specific: the bot you were just talking to carries on (or the first bot).
  const lastBot = [...chat].reverse().find((m) => m.role === 'assistant' && m.bot);
  return [list.find((p) => p.id === lastBot?.bot) || list[0]];
}
async function runGroupTurn(g, text, attachments, { fromBot, depth = 0, chain = [] } = {}) {
  const chat = (store.data.chats[g.id] ||= []);
  // A bot can post into a group from its private chat (e.g. a leader handing out work).
  const msg = fromBot ? { role: 'assistant', content: text, bot: fromBot.id, botName: fromBot.name, relayed: true, ts: Date.now() } : { role: 'user', content: text, ts: Date.now() };
  if (attachments?.length) msg.attachments = attachments;
  const start = chat.length;
  chat.push(msg);
  store.save();
  pushState();
  const members = () => g.members.map((id) => store.data.personas.find((p) => p.id === id)).filter(Boolean);
  const mentioned = (t, exclude) => members().filter((p) => p.id !== exclude && new RegExp('@' + p.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*'), 'i').test(t));
  // Who answers: the bots you @mention; otherwise only the bots the message is about
  // (or everyone if you talk to the whole group), else just the bot you were talking to.
  const skip = fromBot?.id; // the sender is busy waiting for the answers
  const busyChain = new Set(chain);
  let queue = fromBot ? (mentioned(text, skip).length ? mentioned(text, skip) : members().filter((p) => p.id !== skip)).filter((p) => !busyChain.has(p.id)) : mentioned(text).length ? mentioned(text) : pickResponders(members(), text, chat);
  let hops = 0;
  const handoffs = new Map();
  const send = (data) => win && !win.isDestroyed() && win.webContents.send('chat-event', data);
  try {
    while (queue.length) {
      const bot = queue.shift();
      const others = members().filter((p) => p.id !== bot.id).map((p) => ({ name: p.name, tag: p.tag, description: p.description }));
      const before = chat.length;
      try { await runBotTurn(bot, null, { chatKey: g.id, group: { name: g.name, others }, skipUser: true, depth, chain }); }
      catch (e) { if (running.has(g.id) === false && /Stopped/.test(e.message)) break; chat.push({ role: 'activity', content: `${bot.name} couldn't answer: ${e.message.slice(0, 120)}`, ts: Date.now() }); }
      // "(pass)" = nothing to add → hide it
      for (let i = chat.length - 1; i >= before; i--) if (chat[i].role === 'assistant' && /^\(?\s*pass\s*\)?\.?$/i.test((chat[i].content || '').trim())) chat.splice(i, 1);
      store.save();
      pushState();
      // Bots can talk to each other: an @mention in a reply brings that bot in (a few hops at most).
      const said = chat.slice(before).filter((m) => m.role === 'assistant').map((m) => m.content).join('\n');
      for (const p of mentioned(said, bot.id)) if (p.id !== skip && !busyChain.has(p.id) && hops < 4 && !queue.some((q) => q.id === p.id)) {
        queue.push(p); hops++;
        const note = { role: 'activity', kind: 'botmsg', from: bot.name, fromId: bot.id, to: p.name, toId: p.id, ts: Date.now(), thread: [{ who: bot.name, id: bot.id, text: said.slice(0, 4000) }] };
        chat.push(note); handoffs.set(p.id, note); store.save(); pushState();
      }
      const h = handoffs.get(bot.id);
      if (h) { const r = chat.slice(before).filter((m) => m.role === 'assistant').map((m) => m.content).join('\n'); if (r) h.thread.push({ who: bot.name, id: bot.id, text: r.slice(0, 4000) }); handoffs.delete(bot.id); store.save(); }
    }
  } finally {
    send({ personaId: g.id, type: 'done' });
    pushState();
  }
  if (!fromBot) return true;
  const out = [];
  for (const m of chat.slice(start + 1)) if (m.role === 'assistant' && m.bot) { const last = out[out.length - 1]; if (last && last.id === m.bot) last.text += '\n' + m.content; else out.push({ id: m.bot, name: m.botName, text: m.content }); }
  return out;
}

// ---------- Wayzerr's own MCP server (lets Claude Desktop & co. use your bots) ----------
function mcpInfo() {
  const m = (store.data.mcpServer ||= { enabled: true, port: 48620, token: '' });
  if (!m.token) { m.token = crypto.randomBytes(18).toString('base64url'); store.save(); }
  return { enabled: m.enabled, port: m.port, token: m.token, url: `http://127.0.0.1:${m.port}/mcp`, running: m.enabled !== false && personaMcp.isRunning() };
}
const mcpSeen = {};
const appsList = () => aiapps.list().map((a) => ({ ...a, lastSeen: mcpSeen[a.name] || 0 }));
const personaMcp = startWayzerrMcp({
  onClient: (name) => { const first = !mcpSeen[name] || Date.now() - mcpSeen[name] > 60000; mcpSeen[name] = Date.now(); if (first && win && !win.isDestroyed()) win.webContents.send('ai-apps', appsList()); },
  getConfig: () => mcpInfo(),
  listBots: () => store.data.personas.filter((p) => !p.group),
  findBot: (k) => team.find(k),
  createBot: (a) => createBot({ ...a, createdBy: 'another app' }),
  messageBot: (p, text, fromName) => runBotTurn(p, text, { from: { name: fromName || 'another app', bot: false } }),
});

handle('mcp-info', () => mcpInfo());
handle('ai-apps', () => appsList());

// ---------- "Connect" with your Claude / ChatGPT account ----------
let connecting = null;
async function finishAccount(type, s) {
  const t = TYPES[type];
  const models = await cli.models(t.agent);
  let p = providers().find((x) => x.type === type);
  if (p) Object.assign(p, { models, account: s.account });
  else { p = { id: crypto.randomBytes(3).toString('hex'), type, name: t.name, baseUrl: '', key: '', account: s.account, models }; providers().push(p); }
  const st = store.data.settings;
  if (!st.defaultModel || !findProvider(st.defaultModel.providerId)) st.defaultModel = { providerId: p.id, model: models[0].id };
  store.save();
  return publicState();
}
// "Sign in with OpenRouter": standard OAuth (PKCE) — you approve in the browser, OpenRouter hands Wayzerr a key.
function openrouterSignIn(say) {
  const http = require('http');
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return new Promise((resolve, reject) => {
    const srv = http.createServer(async (req, res) => {
      const u = new URL(req.url, 'http://localhost');
      if (u.pathname !== '/callback') { res.writeHead(404).end(); return; }
      const code = u.searchParams.get('code');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end('<body style="font-family:-apple-system,sans-serif;background:#0b0b0b;color:#eee;display:grid;place-items:center;height:90vh"><div style="text-align:center"><h2>You\'re signed in ✓</h2><p>You can close this tab and go back to Wayzerr.</p></div></body>');
      srv.close();
      clearTimeout(timer);
      if (!code) return reject(new Error('Sign-in was cancelled.'));
      try {
        const r = await fetch('https://openrouter.ai/api/v1/auth/keys', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, code_verifier: verifier, code_challenge_method: 'S256' }) });
        const j = await r.json();
        if (!j.key) throw new Error(j.error?.message || 'OpenRouter did not return a key.');
        resolve(j.key);
      } catch (e) { reject(e); }
    });
    const timer = setTimeout(() => { srv.close(); reject(new Error('Sign-in timed out. Try again.')); }, 10 * 60000);
    srv.listen(0, '127.0.0.1', () => {
      const cb = `http://localhost:${srv.address().port}/callback`;
      const url = `https://openrouter.ai/auth?callback_url=${encodeURIComponent(cb)}&code_challenge=${challenge}&code_challenge_method=S256`;
      shell.openExternal(url);
      say({ text: 'Sign in to OpenRouter in your browser…', url, waiting: true });
    });
  });
}
handle('account-connect', async (type) => {
  const t = TYPES[type];
  if (!t?.account) throw new Error('Unknown account type');
  if (t.oauth === 'openrouter') {
    const say = (x) => win && !win.isDestroyed() && win.webContents.send('account-progress', { type, ...(typeof x === 'string' ? { text: x } : x) });
    const key = await openrouterSignIn(say);
    say('Loading models…');
    const models = await listModels('openrouter', t.baseUrl, key);
    let p = providers().find((x) => x.type === type);
    if (p) Object.assign(p, { key: enc(key), models, account: 'OpenRouter account' });
    else { p = { id: crypto.randomBytes(3).toString('hex'), type, name: t.name, baseUrl: t.baseUrl, key: enc(key), account: 'OpenRouter account', models }; providers().push(p); }
    const st = store.data.settings;
    if (!st.defaultModel || !findProvider(st.defaultModel.providerId)) st.defaultModel = { providerId: p.id, model: pickDefault(models) };
    store.save();
    say({ text: 'Connected', done: true });
    return publicState();
  }
  const id = t.agent;
  const say = (x) => win && !win.isDestroyed() && win.webContents.send('account-progress', { type, ...(typeof x === 'string' ? { text: x } : x) });
  const my = (connecting = { cancelled: false });
  if (!cli.findBin(id)) await cli.install(id, say);
  say({ text: 'Checking your account…', command: cli.loginCommand(id) });
  let s = await cli.status(id);
  if (!s.loggedIn) {
    say({ text: `Sign in to ${t.name} in your browser, then paste the code here.`, waiting: true });
    cli.login(id, (x) => {
      say(x);
      if (x && x.exited !== undefined && x.exited !== 0 && !my.cancelled) say({ failed: true, text: 'The sign-in window closed. Use the command below, then click Check account.' });
    });
    const until = Date.now() + 15 * 60000;
    while (!s.loggedIn) {
      if (my.cancelled) { cli.cancelLogin(); throw new Error('Cancelled'); }
      if (Date.now() > until) { cli.cancelLogin(); throw new Error('Sign-in timed out. Click Sign in to try again.'); }
      await new Promise((r) => setTimeout(r, 2500));
      s = await cli.status(id);
    }
    cli.cancelLogin();
  }
  say('Loading models…');
  const st = await finishAccount(type, s);
  say({ text: 'Connected', done: true });
  return st;
});
// Credits left (OpenRouter shows them; other providers don't offer this).
handle('provider-credits', async (id) => {
  const p = findProvider(id);
  if (!p || !/openrouter/.test(p.type)) return null;
  try {
    const r = await fetch('https://openrouter.ai/api/v1/credits', { headers: { Authorization: 'Bearer ' + dec(p.key) }, signal: AbortSignal.timeout(10000) });
    const j = (await r.json()).data || {};
    return { total: j.total_credits, used: j.total_usage, left: (j.total_credits || 0) - (j.total_usage || 0) };
  } catch (_) { return null; }
});
handle('account-check', async (type) => {
  const t = TYPES[type];
  const s = await cli.status(t.agent);
  if (!s.loggedIn) return { loggedIn: false, installed: s.installed };
  if (connecting) connecting.cancelled = true;
  return { loggedIn: true, state: await finishAccount(type, s) };
});
handle('account-info', (type) => {
  const t = TYPES[type];
  if (t.oauth) return { installed: false, command: null, models: null };
  const installed = !!cli.findBin(t.agent);
  return { installed, command: installed ? cli.loginCommand(t.agent) : null, models: t.agent === 'codex' ? null : cli.AGENTS[t.agent].models.length };
});
handle('account-cancel', () => { if (connecting) connecting.cancelled = true; cli.cancelLogin(); return true; });
handle('account-code', (code) => { cli.sendCode(code); return true; });
handle('account-terminal', (type) => cli.loginInTerminal(TYPES[type].agent));
handle('ai-app-connect', (id) => { aiapps.connect(id, mcpInfo()); return appsList(); });
handle('ai-app-disconnect', (id) => { aiapps.disconnect(id); return appsList(); });
handle('mcp-toggle', async (on) => { store.data.mcpServer.enabled = !!on; store.save(); if (on) personaMcp.start(); return mcpInfo(); });
