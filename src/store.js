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
    let text = null;
    try { text = fs.readFileSync(this.file, 'utf8'); } catch (_) { /* first run */ }
    if (text != null) {
      try {
        this.data = deepMerge(structuredClone(DEFAULTS), JSON.parse(text));
        // Keep a copy of the last file that loaded fine, in case something ever goes wrong.
        try { fs.copyFileSync(this.file, this.file.replace(/\.json$/, '.backup.json')); } catch (_) {}
        // One copy per day, kept for two weeks, so a bad moment never costs more than a day of chats.
        try {
          const bdir = path.join(dir, 'backups'); fs.mkdirSync(bdir, { recursive: true });
          const today = path.join(bdir, `wayzerr-data-${new Date().toISOString().slice(0, 10)}.json`);
          if (!fs.existsSync(today)) fs.copyFileSync(this.file, today);
          const all = fs.readdirSync(bdir).filter((n) => /^wayzerr-data-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
          while (all.length > 14) fs.rmSync(path.join(bdir, all.shift()), { force: true });
        } catch (_) {}
      } catch (_) {
        // A damaged file must never be overwritten with an empty one: set it aside and use the last good copy.
        try { fs.copyFileSync(this.file, this.file.replace(/\.json$/, `.damaged-${Date.now()}.json`)); } catch (_) {}
        try { this.data = deepMerge(structuredClone(DEFAULTS), JSON.parse(fs.readFileSync(this.file.replace(/\.json$/, '.backup.json'), 'utf8'))); this.restored = true; } catch (_) {}
      }
    }
    // Write everything still waiting when the app quits.
    process.on('exit', () => this.flush());
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
    this.timer = setTimeout(() => { this.timer = null; this.write(); }, 250);
  }
  flush() {
    if (!this.timer) return;
    clearTimeout(this.timer); this.timer = null;
    this.write();
  }
  write() {
    if (this.locked) return;
    try {
      const tmp = this.file + '.tmp';
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(tmp, JSON.stringify(this.data));
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
