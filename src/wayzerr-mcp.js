// Wayzerr's own MCP server: lets other AI apps (Claude Desktop, Cursor, …) use your bots.
// Runs only on this computer (127.0.0.1) and needs a secret token.
// Tools: list_bots, message_bot, create_bot. Everything shows up live in Wayzerr.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');
const { Server } = require('@modelcontextprotocol/sdk/server/index.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { ListToolsRequestSchema, CallToolRequestSchema } = require('@modelcontextprotocol/sdk/types.js');
const { ensureShims } = require('./runtime');

const TOOLS = [
  {
    name: 'list_bots',
    description: "List the bots in the user's Wayzerr app (id, name, tag, what they do).",
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'message_bot',
    description: 'Send a message to one of the Wayzerr bots and get its reply. The bot uses its own AI, personality, memory and tools (browser, saved logins…). The conversation appears in the Wayzerr app.',
    inputSchema: {
      type: 'object',
      properties: { bot: { type: 'string', description: 'bot name or id' }, message: { type: 'string' } },
      required: ['bot', 'message'],
    },
  },
  {
    name: 'create_bot',
    description: 'Create a new bot in Wayzerr. The name and description decide who it is and what it is an expert in.',
    inputSchema: {
      type: 'object',
      properties: { name: { type: 'string' }, tag: { type: 'string' }, description: { type: 'string' } },
      required: ['name'],
    },
  },
];

function startWayzerrMcp(deps) {
  let server = null;
  const turns = new Map(); // per-turn tool endpoints for account-connected models

  function makeTurnMcp(turn) {
    const mcp = new Server({ name: 'wayzerr', version: app.getVersion() }, { capabilities: { tools: {} } });
    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: turn.tools }));
    mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
      try {
        const r = await turn.call(req.params.name, req.params.arguments || {});
        if (r && typeof r === 'object' && r.image) {
          const m = String(r.image).match(/^data:([^;]+);base64,(.*)$/);
          return { content: [{ type: 'text', text: r.text || '' }, ...(m ? [{ type: 'image', mimeType: m[1], data: m[2] }] : [])] };
        }
        return { content: [{ type: 'text', text: String(r ?? '') }] };
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    });
    return mcp;
  }

  function makeMcp(clientName) {
    const mcp = new Server({ name: 'wayzerr', version: app.getVersion() }, { capabilities: { tools: {} } });
    mcp.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
    mcp.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: a = {} } = req.params;
      const text = (t) => ({ content: [{ type: 'text', text: t }] });
      try {
        if (name === 'list_bots') {
          const bots = deps.listBots();
          if (!bots.length) return text('There are no bots yet. Use create_bot to make one.');
          return text(bots.map((p) => `[${p.id}] ${p.name}${p.tag ? ' (' + p.tag + ')' : ''}${p.description ? ' — ' + p.description.slice(0, 200) : ''}`).join('\n'));
        }
        if (name === 'create_bot') {
          if (!a.name) throw new Error('name is required');
          const p = deps.createBot({ name: String(a.name), tag: String(a.tag || ''), description: String(a.description || '') });
          return text(`Created bot "${p.name}" (id ${p.id}).`);
        }
        if (name === 'message_bot') {
          const p = deps.findBot(a.bot);
          if (!p) return text(`No bot called "${a.bot}". Call list_bots to see them.`);
          const reply = await deps.messageBot(p, String(a.message || ''), clientName);
          return text(`${p.name} replied:\n${reply || '(no reply)'}`);
        }
        throw new Error('Unknown tool ' + name);
      } catch (e) {
        return { content: [{ type: 'text', text: 'Error: ' + e.message }], isError: true };
      }
    });
    mcp.oninitialized = () => {};
    return mcp;
  }

  async function handle(req, res) {
    const cfg = deps.getConfig();
    const tm = req.url.match(/^\/turn\/([\w-]+)/);
    if (tm) {
      const turn = turns.get(tm[1]);
      if (!turn || req.headers.authorization !== `Bearer ${turn.token}`) { res.writeHead(401).end('Unauthorized'); return; }
      let body = '';
      for await (const chunk of req) body += chunk;
      let json;
      try { json = body ? JSON.parse(body) : undefined; } catch (_) { res.writeHead(400).end(); return; }
      const mcp = makeTurnMcp(turn);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      res.on('close', () => { transport.close(); mcp.close(); });
      await mcp.connect(transport);
      await transport.handleRequest(req, res, json);
      return;
    }
    if (!req.url.startsWith('/mcp') || cfg.enabled === false) { res.writeHead(404).end(); return; }
    if (req.headers.authorization !== `Bearer ${cfg.token}`) { res.writeHead(401).end('Unauthorized'); return; }
    let body = '';
    for await (const chunk of req) body += chunk;
    let json;
    try { json = body ? JSON.parse(body) : undefined; } catch (_) { res.writeHead(400).end(); return; }
    const clientName = String(req.headers['x-wayzerr-client'] || 'Claude Desktop');
    try { deps.onClient?.(clientName); } catch (_) {}
    // Stateless: a fresh server + transport per request.
    const mcp = makeMcp(clientName);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on('close', () => { transport.close(); mcp.close(); });
    await mcp.connect(transport);
    await transport.handleRequest(req, res, json);
  }

  return {
    start() {
      if (server) return;
      const cfg = deps.getConfig();
      server = http.createServer((req, res) => handle(req, res).catch(() => { try { res.writeHead(500).end(); } catch (_) {} }));
      server.on('error', () => { server = null; });
      server.listen(cfg.port, '127.0.0.1');
    },
    stop() {
      server?.close();
      server = null;
    },
    isRunning: () => !!server && server.listening,
    // Expose one bot's tools for the length of one reply. Works even when the public server is off.
    async registerTurn({ tools, call }) {
      if (!server) this.start();
      const srv = server;
      if (srv && !srv.listening) await Promise.race([new Promise((r) => srv.once('listening', r)), new Promise((r) => setTimeout(r, 3000))]);
      if (!server?.listening) throw new Error("Wayzerr couldn't start its local tool server (the port may be busy). Restart Wayzerr and try again.");
      const id = require('crypto').randomBytes(8).toString('hex');
      const token = require('crypto').randomBytes(18).toString('base64url');
      turns.set(id, { tools, call, token });
      return { url: `http://127.0.0.1:${server.address().port}/turn/${id}`, token, dispose: () => turns.delete(id) };
    },
  };
}

// ---------- One-click "Connect to Claude Desktop" ----------
// Adds Wayzerr to Claude Desktop's MCP config, using a tiny bridge that needs no Node.js install.
const BRIDGE = `// Wayzerr ↔ Claude Desktop bridge (stdio → local HTTP). No dependencies.
const url = process.env.WAYZERR_MCP_URL, token = process.env.WAYZERR_MCP_TOKEN;
let buf = '';
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
// Plain http (no timeout): some tools wait for you, e.g. a sign-in card.
const http = require('http');
function post(body) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: 'Bearer ' + token, 'X-Wayzerr-Client': process.env.WAYZERR_CLIENT || 'another app', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let t = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (t += c));
      res.on('end', () => resolve(t));
    });
    req.setTimeout(0);
    req.on('error', reject);
    req.end(body);
  });
}
async function relay(msg) {
  try {
    const t = await post(JSON.stringify(msg));
    if (!t) return;
    let data;
    try { data = JSON.parse(t); } catch (_) { data = t.split('\\n').filter((l) => l.startsWith('data:')).map((l) => JSON.parse(l.slice(5))); }
    (Array.isArray(data) ? data : [data]).forEach(out);
  } catch (e) {
    if (msg.id !== undefined) out({ jsonrpc: '2.0', id: msg.id, error: { code: -32000, message: 'Wayzerr is not running. Open the Wayzerr app and try again.' } });
  }
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  buf += c;
  let i;
  while ((i = buf.indexOf('\\n')) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (line) { try { relay(JSON.parse(line)); } catch (_) {} }
  }
});
`;

function claudeDesktopConnector(getInfo) {
  const cfgPath = () => process.env.WAYZERR_CLAUDE_CONFIG || path.join(process.platform === 'win32' ? (process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')) : process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') : (process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config')), 'Claude', 'claude_desktop_config.json');
  const read = () => { try { return JSON.parse(fs.readFileSync(cfgPath(), 'utf8')); } catch (_) { return null; } };
  return {
    isConnected() { return !!read()?.mcpServers?.wayzerr; },
    async connect() {
      const info = getInfo();
      const bin = ensureShims();
      const bridge = path.join(bin, 'wayzerr-mcp-bridge.js');
      fs.writeFileSync(bridge, BRIDGE);
      const file = cfgPath();
      if (!fs.existsSync(path.dirname(file))) throw new Error("Claude Desktop isn't installed on this computer (claude.ai/download).");
      const cfg = read() || {};
      if (fs.existsSync(file)) fs.copyFileSync(file, file + '.wayzerr-backup');
      cfg.mcpServers = cfg.mcpServers || {};
      const node = require('./runtime').nodeLaunch();
      delete cfg.mcpServers.persona; // the old name
      cfg.mcpServers.wayzerr = { command: node.command, args: [bridge], env: { ...node.env, WAYZERR_MCP_URL: info.url, WAYZERR_MCP_TOKEN: info.token } };
      fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
    },
    async disconnect() {
      const cfg = read();
      if (!cfg?.mcpServers) return;
      delete cfg.mcpServers.wayzerr; delete cfg.mcpServers.persona;
      fs.writeFileSync(cfgPath(), JSON.stringify(cfg, null, 2));
    },
  };
}

module.exports = { startWayzerrMcp, claudeDesktopConnector, BRIDGE };
