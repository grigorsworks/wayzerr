// Simple JSON storage kept in the app's user-data folder.
const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  settings: {
    baseUrl: 'https://api.openai.com/v1',
    model: '',
    userName: '',
    providers: [], // { id, type, name, baseUrl, key, models: [{ id, name }] }
    defaultModel: null, // { providerId, model }
  },
  encryptedKey: null, // { mode: 'safe' | 'plain', value: base64 }
  personas: [],
  activePersonaId: null,
  chats: {}, // personaId -> [{ role, content, ts }]
  memories: {}, // personaId -> [{ id, text, ts }]
  connectors: {
    browser: { enabled: true, permission: 'ask' },
    logins: { enabled: true, permission: 'ask' },
    computer: { enabled: true, permission: 'ask' },
    team: { enabled: true, permission: 'always' },
    files: { enabled: false, folder: '', permission: 'ask' },
    clipboard: { enabled: false, permission: 'ask' },
    notifications: { enabled: false, permission: 'ask' },
    schedule: { enabled: true, permission: 'always' },
    open: { enabled: false, permission: 'ask' },
    web: { enabled: false, permission: 'ask' },
  },
  schedules: [], // tasks a bot does by itself at a time you choose (see schedules.js)
  scheduleLog: [], // what happened when they ran
  vault: [], // saved logins { id, name, site, username, password(enc), notes }
  iconCache: {}, // domain -> data URL
  mcpServer: { enabled: true, port: 48620, token: '' }, // Wayzerr's own MCP server for other apps
  customServers: [], // { id, name, command, args, env, enabled, permission }
};

class Store {
  constructor(dir) {
    this.file = path.join(dir, 'wayzerr-data.json');
    try { // the file used to be called persona-data*: move it (and its backups) over once
      if (!fs.existsSync(this.file)) for (const n of fs.readdirSync(dir)) if (n.startsWith('persona-data')) fs.renameSync(path.join(dir, n), path.join(dir, n.replace('persona-data', 'wayzerr-data')));
    } catch (_) {}
    this.data = structuredClone(DEFAULTS);
    this.timer = null;
    this.dir = dir;
    const bak = this.file.replace(/\.json$/, '.backup.json');
    const bdir = path.join(dir, 'backups');
    // Only a file that does not exist is a "first run". Anything else (cannot be read, empty, damaged) must never end with
    // an empty start that the next save writes over your real bots and chats.
    let text = null, missing = false, problem = null;
    try { text = fs.readFileSync(this.file, 'utf8'); } catch (e) { if (e && e.code === 'ENOENT') missing = true; else problem = e; }
    let parsed = null;
    if (text != null) {
      if (!text.trim()) problem = new Error('empty file');
      else { try { parsed = JSON.parse(text); } catch (e) { problem = e; } }
    }
    // The copies we can fall back to, best first: the last good file, the newest "before an update" copy, then the daily copies.
    const copies = () => {
      const out = [bak];
      try {
        const names = fs.readdirSync(bdir);
        const newest = (re) => names.filter((n) => re.test(n)).sort().reverse().map((n) => path.join(bdir, n));
        out.push(...newest(/^pre-update-.*\.json$/), ...newest(/^wayzerr-data-\d{4}-\d{2}-\d{2}\.json$/));
      } catch (_) {}
      return out;
    };
    const fromCopies = () => {
      for (const f of copies()) {
        try { const j = JSON.parse(fs.readFileSync(f, 'utf8')); if (j && typeof j === 'object' && !Array.isArray(j)) return { j, f }; } catch (_) {}
      }
      return null;
    };
    const hasCopies = () => copies().some((f) => { try { return fs.statSync(f).size > 2; } catch (_) { return false; } });
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      this.data = deepMerge(structuredClone(DEFAULTS), parsed);
      const count = (d) => (d && Array.isArray(d.personas) ? d.personas.length : 0);
      // Keep a copy of the last file that loaded fine, but never replace it with one that lost all the bots.
      try {
        let keep = true;
        try { if (count(parsed) === 0 && count(JSON.parse(fs.readFileSync(bak, 'utf8'))) > 0) keep = false; } catch (_) {}
        if (keep) fs.copyFileSync(this.file, bak);
        else { const old = JSON.parse(fs.readFileSync(bak, 'utf8')); this.offer = { file: bak, bots: count(old) }; } // an empty file next to a copy that has bots: offer to bring them back
      } catch (_) {}
      // One copy per day, kept for two weeks, so a bad moment never costs more than a day of chats.
      try {
        fs.mkdirSync(bdir, { recursive: true });
        const today = path.join(bdir, `wayzerr-data-${new Date().toISOString().slice(0, 10)}.json`);
        if (!fs.existsSync(today) && count(parsed) > 0) fs.copyFileSync(this.file, today);
        const all = fs.readdirSync(bdir).filter((n) => /^wayzerr-data-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
        while (all.length > 14) fs.rmSync(path.join(bdir, all.shift()), { force: true });
      } catch (_) {}
    } else if (problem || (missing && hasCopies())) {
      // Set the real file aside (if we can), use the best copy, and say so. If the original cannot even be copied, do not
      // write over it at all: your data is kept as it is on disk, and this session just does not save.
      let aside = !problem; // a missing file has nothing to set aside
      if (problem) { try { fs.copyFileSync(this.file, this.file.replace(/\.json$/, `.damaged-${Date.now()}.json`)); aside = true; } catch (_) {} }
      const got = fromCopies();
      if (got) { this.data = deepMerge(structuredClone(DEFAULTS), got.j); this.restored = true; this.restoredFrom = path.basename(got.f); }
      if (!aside) { this.locked = true; this.unreadable = true; }
      else if (!got && problem) this.locked = true; // damaged and no copy to use: leave the file alone rather than start empty over it
      if (this.locked && !this.unreadable) this.unreadable = true;
    }
    // Write everything still waiting when the app quits.
    process.on('exit', () => this.flush());
  }
  // Bring the bots and chats back from a copy (the current file is kept next to it first).
  restoreFrom(file) {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      try { fs.copyFileSync(this.file, this.file.replace(/\.json$/, `.before-restore-${Date.now()}.json`)); } catch (_) {}
      this.data = deepMerge(structuredClone(DEFAULTS), j);
      this.offer = null; this.locked = false;
      clearTimeout(this.timer); this.timer = null; this.write(true);
      return true;
    } catch (_) { return false; }
  }
  // A copy for "just before something risky" (installing an update). Kept: the newest five.
  snapshot(label = 'pre-update') {
    try {
      if (this.locked) return false;
      this.flush();
      if (!fs.existsSync(this.file)) return false;
      const bdir = path.join(this.dir || path.dirname(this.file), 'backups'); fs.mkdirSync(bdir, { recursive: true });
      fs.copyFileSync(this.file, path.join(bdir, `${label}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`));
      const all = fs.readdirSync(bdir).filter((n) => n.startsWith(label + '-')).sort();
      while (all.length > 5) fs.rmSync(path.join(bdir, all.shift()), { force: true });
      return true;
    } catch (_) { return false; }
  }
  // Delete account: forget everything, remove every copy on disk, and never write again (the app restarts right after).
  wipe() {
    clearTimeout(this.timer); this.timer = null;
    this.locked = true;
    this.data = structuredClone(DEFAULTS);
    const dir = path.dirname(this.file), base = path.basename(this.file, '.json');
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n === base + '.json' || n.startsWith(base + '.')); } catch (_) {}
    for (const n of names) { try { fs.rmSync(path.join(dir, n), { force: true }); } catch (_) {} }
    try { fs.rmSync(path.join(dir, 'backups'), { recursive: true, force: true }); } catch (_) {}
  }
  // Saves are grouped: many changes in a short moment become one write (keeps the app smooth with big chats).
  save() {
    if (this.locked || this.timer) return;
    this.timer = setTimeout(() => { this.timer = null; this.write(); }, 150);
  }
  flush() {
    if (!this.timer) return;
    clearTimeout(this.timer); this.timer = null;
    this.write(true);
  }
  // The new file is written next to the old one and swapped in, so a crash or a power cut can never leave half a file.
  // When the app quits (durable) the data is also forced onto the disk before the swap.
  write(durable = false) {
    if (this.locked) return;
    try {
      const tmp = this.file + '.tmp';
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const fd = fs.openSync(tmp, 'w', 0o600);
      try { fs.writeSync(fd, JSON.stringify(this.data)); if (durable) fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      fs.renameSync(tmp, this.file);
    } catch (e) { console.error('Could not save Wayzerr data:', e.message); }
  }
}

function deepMerge(base, extra) {
  for (const [k, v] of Object.entries(extra || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      base[k] = deepMerge(base[k], v);
    } else {
      base[k] = v;
    }
  }
  return base;
}

module.exports = { Store };
