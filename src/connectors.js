// Desktop connectors: built-in tools + custom MCP servers.
// Every connector asks for permission the first time; the user can choose
// "Always allow" so it never asks again (revocable in the Connectors screen).
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { clipboard, Notification, shell } = require('electron');
const { BROWSER_TOOLS } = require('./browser');
const { VAULT_TOOLS } = require('./vault');
const { TEAM_TOOLS } = require('./team');
const { COMPUTER_TOOLS } = require('./computer');

const MAX_READ = 60_000;

// ---------- Built-in connector catalog ----------
const BUILTIN = {
  browser: {
    name: 'Browser',
    icon: '🧭',
    description: "The bots' own web browser, shown in the Screen panel. Search, open pages, click, type, fill forms.",
    tools: BROWSER_TOOLS,
  },
  computer: {
    name: 'Computer',
    icon: '🖥️',
    description: "The bots' own Linux computer, running only inside Wayzerr. They can see its screen, click, type, open a terminal, and install and test apps there. Set it up in the Screen panel.",
    tools: COMPUTER_TOOLS,
  },
  team: {
    name: 'Team',
    icon: '🤝',
    description: 'Bots can create new bots and message each other. The app passes the messages along and shows them in each chat.',
    tools: TEAM_TOOLS,
  },
  logins: {
    name: 'Passwords',
    icon: '🔑',
    description: 'Bots can sign in with logins from your Passwords folder. Passwords are typed for them — the AI never sees them.',
    tools: VAULT_TOOLS,
  },
  files: {
    name: 'Files',
    icon: '📁',
    description: 'Read, write and search files inside one folder you choose.',
    tools: [
      tool('files_list', 'List files and folders inside the allowed folder (or a subfolder).', {
        subpath: { type: 'string', description: 'Relative subfolder, empty for the root' },
      }),
      tool('files_read', 'Read a text file inside the allowed folder.', {
        subpath: { type: 'string', description: 'Relative path of the file' },
      }, ['subpath']),
      tool('files_write', 'Create or overwrite a text file inside the allowed folder.', {
        subpath: { type: 'string', description: 'Relative path of the file' },
        content: { type: 'string', description: 'Full text content' },
      }, ['subpath', 'content']),
      tool('files_search', 'Find files whose name contains the query (searches subfolders).', {
        query: { type: 'string' },
      }, ['query']),
    ],
  },
  clipboard: {
    name: 'Clipboard',
    icon: '📋',
    description: 'Read what you copied, or put text on your clipboard.',
    tools: [
      tool('clipboard_read', 'Read the current text on the clipboard.', {}),
      tool('clipboard_write', 'Put text on the clipboard.', { text: { type: 'string' } }, ['text']),
    ],
  },
  schedule: {
    name: 'Schedules',
    icon: '🗓️',
    description: 'Bots do tasks by themselves at a time you choose, once or on repeat.',
    tools: [
      tool('schedule_create', "Schedule a task to be done later or on repeat — use it whenever the user says when something should happen ('every morning at 8…', 'tomorrow at 3pm…', 'every Monday…', 'remind me in 2 hours…'). At the time, the bot gets the instructions as a normal message and does the task (it can use all its tools, its computer and its browser). Times are the user's local time.", {
        title: { type: 'string', description: 'Short name, e.g. "Morning news".' },
        instructions: { type: 'string', description: 'What the bot should do when the time comes, written as a message to that bot.' },
        first_run: { type: 'string', description: 'Local date and time of the first run, "YYYY-MM-DD HH:MM". Work it out from today\'s date.' },
        repeat: { type: 'string', enum: ['none', 'daily', 'weekdays', 'weekly', 'monthly', 'every_n_minutes', 'every_n_hours'], description: 'How often. Default none (once).' },
        days: { type: 'array', items: { type: 'string', enum: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] }, description: 'For weekly: which days.' },
        every: { type: 'number', description: 'For every_n_minutes / every_n_hours: the number n.' },
        use_computer: { type: 'boolean', description: "True if the task needs the bot's own computer." },
        bot: { type: 'string', description: 'Name of the bot that should do it. Default: you.' },
      }, ['instructions', 'first_run']),
      tool('schedule_list', 'List the scheduled tasks (id, bot, title, when, how often).', {}),
      tool('schedule_delete', 'Delete a scheduled task by its id (see schedule_list).', { id: { type: 'string' } }, ['id']),
    ],
  },
  notifications: {
    name: 'Notifications',
    icon: '🔔',
    description: 'Show desktop notifications.',
    tools: [
      tool('notify', 'Show a desktop notification.', {
        title: { type: 'string' },
        body: { type: 'string' },
      }, ['title']),
    ],
  },
  open: {
    name: 'Open links & apps',
    icon: '🚀',
    description: 'Open web links in your browser and launch apps.',
    tools: [
      tool('open_url', 'Open a web link (http/https) in the default browser.', { url: { type: 'string' } }, ['url']),
      tool('open_app', 'Open an application by name, e.g. "Calendar" or "Notes".', { name: { type: 'string' } }, ['name']),
    ],
  },
  web: {
    name: 'Web pages',
    icon: '🌐',
    description: 'Read the text of a public web page.',
    tools: [
      tool('web_read', 'Download a public web page and return its readable text.', { url: { type: 'string' } }, ['url']),
    ],
  },
};

function tool(name, description, properties, required = []) {
  return { name, description, parameters: { type: 'object', properties, required } };
}

// ---------- Built-in implementations ----------
// realpath of a path that may not exist yet (files_write): resolve the part that exists, then add the rest.
function realish(p) {
  const rest = [];
  let cur = p;
  for (;;) {
    try { return path.join(fs.realpathSync(cur), ...rest.reverse()); } catch (e) {
      const up = path.dirname(cur);
      if (up === cur) throw e;
      rest.push(path.basename(cur)); cur = up;
    }
  }
}
// The shared folder is writable by the bot's Linux computer, which can create symbolic links in it:
// a link to /Users/you/.ssh must not let files_read walk out of the folder, so links are resolved before the check.
function safeJoin(root, sub = '') {
  if (!root) throw new Error('No folder chosen for the Files connector.');
  let realRoot; try { realRoot = fs.realpathSync(root); } catch (_) { realRoot = path.resolve(root); }
  const full = realish(path.resolve(realRoot, sub || '.'));
  const rel = path.relative(realRoot, full);
  if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('That path is outside the allowed folder.');
  return full;
}

async function runBuiltin(store, toolName, args, ctx) {
  const c = store.data.connectors;
  if (toolName.startsWith('browser_')) return ctx.browser.run(toolName, args);
  if (toolName.startsWith('computer_')) return ctx.computer.run(toolName, args);
  if (toolName.startsWith('logins_') || toolName.startsWith('cards_')) return ctx.vault.run(toolName, args, ctx.browser, ctx.computer);
  if (toolName.startsWith('bots_') || toolName.startsWith('groups_')) return ctx.team.run(toolName, args, ctx);
  if (toolName.startsWith('schedule_')) return runScheduleTool(toolName, args, ctx);
  switch (toolName) {
    case 'files_list': {
      const dir = safeJoin(c.files.folder, args.subpath);
      const items = fs.readdirSync(dir, { withFileTypes: true })
        .filter((d) => !d.name.startsWith('.'))
        .slice(0, 300)
        .map((d) => (d.isDirectory() ? d.name + '/' : d.name));
      return items.length ? items.join('\n') : '(empty folder)';
    }
    case 'files_read': {
      const f = safeJoin(c.files.folder, args.subpath);
      const text = fs.readFileSync(f, 'utf8');
      return text.length > MAX_READ ? text.slice(0, MAX_READ) + '\n…(truncated)' : text;
    }
    case 'files_write': {
      const f = safeJoin(c.files.folder, args.subpath);
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(f, args.content ?? '');
      return `Saved ${args.subpath}`;
    }
    case 'files_search': {
      const root = safeJoin(c.files.folder, '');
      const q = String(args.query || '').toLowerCase();
      const out = [];
      const walk = (dir, depth) => {
        if (depth > 6 || out.length >= 100) return;
        for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
          if (d.name.startsWith('.') || d.name === 'node_modules') continue;
          const full = path.join(dir, d.name);
          if (d.name.toLowerCase().includes(q)) out.push(path.relative(root, full));
          if (d.isDirectory()) walk(full, depth + 1);
        }
      };
      walk(root, 0);
      return out.length ? out.join('\n') : 'No matches.';
    }
    case 'clipboard_read':
      return clipboard.readText() || '(clipboard is empty)';
    case 'clipboard_write':
      clipboard.writeText(String(args.text ?? ''));
      return 'Copied to clipboard.';
    case 'notify':
      new Notification({ title: String(args.title || 'Wayzerr'), body: String(args.body || '') }).show();
      return 'Notification shown.';
    case 'open_url': {
      const u = new URL(String(args.url));
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http/https links can be opened.');
      await shell.openExternal(u.toString());
      return `Opened ${u}`;
    }
    case 'open_app': {
      const name = String(args.name || '').trim();
      if (!name || /[\/\\]/.test(name)) throw new Error('Invalid app name.');
      await new Promise((res, rej) => {
        if (process.platform === 'darwin') execFile('open', ['-a', name], (e) => (e ? rej(new Error(`Couldn't open "${name}".`)) : res()));
        else if (process.platform === 'win32') execFile('cmd', ['/c', 'start', '', name], (e) => (e ? rej(e) : res()));
        else execFile(name, [], (e) => (e ? rej(e) : res()));
      });
      return `Opened ${name}`;
    }
    case 'web_read': {
      const u = new URL(String(args.url));
      if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Only http/https pages.');
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 20000);
      try {
        const r = await fetch(u, { signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0 WayzerrApp' } });
        const html = await r.text();
        const text = htmlToText(html);
        return text.length > MAX_READ ? text.slice(0, MAX_READ) + '\n…(truncated)' : text;
      } finally {
        clearTimeout(t);
      }
    }
    default:
      throw new Error('Unknown tool ' + toolName);
  }
}

function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<\/(p|div|h\d|li|br|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n\n')
    .trim();
}

// ---------- Custom MCP servers (stdio) ----------
class McpManager {
  constructor() {
    this.clients = new Map(); // id -> { client, tools, error }
  }
  async connect(server) {
    await this.disconnect(server.id);
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const client = new Client({ name: 'wayzerr-app', version: '1.0.0' });
    const entry = { client, tools: [], error: null };
    this.clients.set(server.id, entry);
    try {
      if (server.url) {
        // Online MCP server (Streamable HTTP, falling back to SSE).
        const headers = { ...(server.headers || {}) };
        if (server.apiKey) headers.Authorization = `Bearer ${server.apiKey}`;
        const url = new URL(server.url);
        try {
          const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
          await client.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers } }));
        } catch (e) {
          const { SSEClientTransport } = require('@modelcontextprotocol/sdk/client/sse.js');
          const c2 = new Client({ name: 'wayzerr-app', version: '1.0.0' });
          entry.client = c2;
          await c2.connect(new SSEClientTransport(url, { requestInit: { headers }, eventSourceInit: { fetch: (u, init) => fetch(u, { ...init, headers: { ...(init?.headers || {}), ...headers } }) } }));
        }
      } else {
        const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');
        const { connectorEnv } = require('./runtime');
        const env = connectorEnv(server.env || {});
        // First connect may download the connector — allow a few minutes.
        await client.connect(new StdioClientTransport({ command: server.command, args: server.args || [], env, stderr: 'ignore' }), { timeout: 240000 });
      }
      const { tools } = await entry.client.listTools();
      entry.tools = tools || [];
    } catch (e) {
      entry.error = /ENOENT/.test(e.message) && !server.url
        ? `Couldn't run "${server.command}".`
        : e.message;
    }
    return entry;
  }
  async disconnect(id) {
    const e = this.clients.get(id);
    if (e) {
      try { await e.client.close(); } catch (_) {}
      this.clients.delete(id);
    }
  }
  status(id) {
    const e = this.clients.get(id);
    if (!e) return { connected: false, tools: [] };
    return { connected: !e.error, error: e.error, tools: e.tools.map((t) => t.name) };
  }
  async call(id, name, args) {
    const e = this.clients.get(id);
    if (!e || e.error) throw new Error('That connector is not connected.');
    const res = await e.client.callTool({ name, arguments: args }, undefined, { timeout: 180000 });
    const parts = (res.content || []).map((p) => (p.type === 'text' ? p.text : `[${p.type} content]`));
    const text = parts.join('\n') || '(no output)';
    if (res.isError) throw new Error(text);
    return text.length > MAX_READ ? text.slice(0, MAX_READ) + '\n…(truncated)' : text;
  }
}

// Scheduling from a chat: the same schedules the calendar shows.
const DAY_KEYS = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
function runScheduleTool(name, args, ctx) {
  const api = ctx.schedules;
  if (!api) return 'Error: schedules are not available here.';
  if (name === 'schedule_list') {
    const list = api.list();
    if (!list.length) return 'There are no scheduled tasks.';
    return list.map((s) => `- id ${s.id}: "${s.title}" for ${(ctx.store?.data.personas || []).find((p) => p.id === s.botId)?.name || s.botId}, ${s.repeatText}, ${s.next ? 'next ' + new Date(s.next).toLocaleString() : 'finished'}${s.enabled === false ? ' (paused)' : ''}`).join('\n');
  }
  if (name === 'schedule_delete') return api.remove(String(args.id || '')) ? 'Deleted.' : 'No scheduled task has that id.';
  // schedule_create
  let botId = ctx.persona?.id;
  if (args.bot) {
    const b = (ctx.store?.data.personas || []).find((p) => !p.group && p.name.toLowerCase() === String(args.bot).trim().toLowerCase());
    if (!b) return `Error: there is no bot named "${args.bot}".`;
    botId = b.id;
  }
  const t = String(args.repeat || 'none');
  const repeat = t === 'every_n_minutes' ? { type: 'interval', every: args.every, unit: 'minutes' } : t === 'every_n_hours' ? { type: 'interval', every: args.every, unit: 'hours' } : { type: t, days: (args.days || []).map((d) => DAY_KEYS[String(d).slice(0, 3).toLowerCase()]).filter((d) => d !== undefined) };
  try {
    const id = api.save({ botId, title: args.title, prompt: args.instructions, start: String(args.first_run || '').replace(' ', 'T'), repeat, useComputer: !!args.use_computer });
    const s = api.list().find((x) => x.id === id);
    return `Scheduled "${s.title}" (${s.repeatText.toLowerCase()}). Next run: ${s.next ? new Date(s.next).toLocaleString() : 'none'}. Wayzerr has to be open at that time (it keeps the computer awake for it). The user can see and change it in the Schedule tab.`;
  } catch (e) { return 'Error: ' + e.message; }
}

// ---------- Tool registry for the AI ----------
// Returns [{ def (OpenAI tool format), connectorKey, connectorName, run(args) }]
function collectTools(store, mcp, ctx) {
  const list = [];
  for (const [key, meta] of Object.entries(BUILTIN)) {
    const cfg = store.data.connectors[key];
    if (!cfg?.enabled && key !== 'team') continue; // making bots and messaging them is always on
    if (key === 'files' && !cfg.folder) continue;
    for (const t of meta.tools) {
      if (key === 'logins' && /^(logins|cards)_fill$/.test(t.name) && !store.data.connectors.browser?.enabled) continue; // typing into the browser needs the browser
      if (key === 'logins' && /^(logins|cards)_type$/.test(t.name) && !ctx?.desktop) continue; // typing into the computer needs a computer
      list.push({
        def: { type: 'function', function: t },
        connectorKey: key,
        connectorName: meta.name,
        run: (args) => runBuiltin(store, t.name, args, ctx),
      });
    }
  }
  for (const s of store.data.customServers) {
    if (!s.enabled) continue;
    const entry = mcp.clients.get(s.id);
    if (!entry || entry.error) continue;
    for (const t of entry.tools) {
      const fnName = `mcp_${s.id}_${t.name}`.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
      list.push({
        def: {
          type: 'function',
          function: {
            name: fnName,
            description: `[${s.name}] ${t.description || t.name}`.slice(0, 1000),
            parameters: t.inputSchema && t.inputSchema.type ? t.inputSchema : { type: 'object', properties: {} },
          },
        },
        connectorKey: 'custom:' + s.id,
        connectorName: s.composio ? 'your apps' : s.name,
        apps: !!s.composio,
        toolName: t.name,
        run: (args) => mcp.call(s.id, t.name, args),
      });
    }
  }
  return list;
}

function getPermission(store, connectorKey) {
  if (connectorKey === 'team') return 'always'; // making and messaging bots never needs a yes
  if (connectorKey.startsWith('app:')) return (store.data.appPermissions || {})[connectorKey.slice(4)] || 'ask';
  if (connectorKey.startsWith('custom:')) {
    const s = store.data.customServers.find((x) => 'custom:' + x.id === connectorKey);
    return s?.permission || 'ask';
  }
  return store.data.connectors[connectorKey]?.permission || 'ask';
}

function setPermission(store, connectorKey, value) {
  if (connectorKey.startsWith('app:')) {
    (store.data.appPermissions ||= {})[connectorKey.slice(4)] = value;
  } else if (connectorKey.startsWith('custom:')) {
    const s = store.data.customServers.find((x) => 'custom:' + x.id === connectorKey);
    if (s) s.permission = value;
  } else if (store.data.connectors[connectorKey]) {
    store.data.connectors[connectorKey].permission = value;
  }
  store.save();
}

module.exports = { BUILTIN, McpManager, collectTools, getPermission, setPermission };
