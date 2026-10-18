// "Use your bots in other AI apps": one-click add/remove of Wayzerr's MCP server
// in the config of each AI app on this computer. Apps that aren't installed get a download link.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ensureShims, nodeLaunch } = require('./runtime');
const { BRIDGE } = require('./wayzerr-mcp');

const HOME = () => process.env.WAYZERR_HOME || os.homedir();
const APPS_DIRS = () => (process.env.WAYZERR_APPS_DIR ? [process.env.WAYZERR_APPS_DIR] : ['/Applications', path.join(HOME(), 'Applications')]);
// Where apps keep their settings: Mac ~/Library/Application Support, Windows %APPDATA%, Linux ~/.config
const SUP = (...p) => path.join(process.platform === 'win32' ? (process.env.APPDATA || path.join(HOME(), 'AppData', 'Roaming')) : process.platform === 'darwin' ? path.join(HOME(), 'Library', 'Application Support') : (process.env.XDG_CONFIG_HOME || path.join(HOME(), '.config')), ...p);
const BIN_DIRS = () => [...(process.platform === 'win32' ? [path.join(process.env.APPDATA || '', 'npm')] : []), '/opt/homebrew/bin', '/usr/local/bin', path.join(HOME(), '.local', 'bin'), path.join(HOME(), '.npm-global', 'bin'), path.join(HOME(), '.bun', 'bin'), path.join(HOME(), '.volta', 'bin')];

// kind: json (key = object key for servers) | toml (codex) | none (can't connect locally)
const APPS = [
  { id: 'claude', name: 'Claude Desktop', domain: 'claude.ai', bundle: 'Claude.app', dir: () => SUP('Claude'), config: () => SUP('Claude', 'claude_desktop_config.json'), key: 'mcpServers', download: 'https://claude.ai/download', note: 'Quit and reopen Claude after connecting.' },
  { id: 'chatgpt', name: 'ChatGPT', domain: 'chatgpt.com', bundle: 'ChatGPT.app', kind: 'none', download: 'https://chatgpt.com/download', note: "ChatGPT can only use connectors on the internet, not apps on your computer — use Codex (by OpenAI) instead." },
  { id: 'cursor', name: 'Cursor', domain: 'cursor.com', bundle: 'Cursor.app', dir: () => path.join(HOME(), '.cursor'), config: () => path.join(HOME(), '.cursor', 'mcp.json'), key: 'mcpServers', download: 'https://cursor.com/download' },
  { id: 'codex', name: 'Codex', domain: 'openai.com', bundle: 'Codex.app', bins: ['codex'], dir: () => path.join(HOME(), '.codex'), config: () => path.join(HOME(), '.codex', 'config.toml'), kind: 'toml', download: 'https://developers.openai.com/codex', sub: 'by OpenAI' },
  { id: 'claude-code', name: 'Claude Code', domain: 'claude.com', bins: ['claude'], dir: () => path.join(HOME(), '.claude'), config: () => path.join(HOME(), '.claude.json'), key: 'mcpServers', type: true, download: 'https://claude.com/product/claude-code' },
  { id: 'vscode', name: 'VS Code', domain: 'code.visualstudio.com', bundle: 'Visual Studio Code.app', dir: () => SUP('Code'), config: () => SUP('Code', 'User', 'mcp.json'), key: 'servers', type: true, download: 'https://code.visualstudio.com/download' },
  { id: 'windsurf', name: 'Windsurf', domain: 'windsurf.com', bundle: 'Windsurf.app', dir: () => path.join(HOME(), '.codeium', 'windsurf'), config: () => path.join(HOME(), '.codeium', 'windsurf', 'mcp_config.json'), key: 'mcpServers', download: 'https://windsurf.com/download' },
  { id: 'gemini', name: 'Gemini CLI', domain: 'gemini.google.com', bins: ['gemini'], dir: () => path.join(HOME(), '.gemini'), config: () => path.join(HOME(), '.gemini', 'settings.json'), key: 'mcpServers', download: 'https://github.com/google-gemini/gemini-cli' },
  { id: 'qwen', name: 'Qwen Code', domain: 'qwen.ai', bins: ['qwen'], dir: () => path.join(HOME(), '.qwen'), config: () => path.join(HOME(), '.qwen', 'settings.json'), key: 'mcpServers', download: 'https://github.com/QwenLM/qwen-code' },
];

const exists = (p) => { try { fs.accessSync(p); return true; } catch (_) { return false; } };

function installed(a) {
  if (a.bundle && APPS_DIRS().some((d) => exists(path.join(d, a.bundle)))) return true;
  if (a.bins && a.bins.some((b) => BIN_DIRS().some((d) => exists(path.join(d, b)) || exists(path.join(d, b + '.cmd')) || exists(path.join(d, b + '.exe'))))) return true;
  if (a.dir && exists(a.dir())) return true;
  if (a.kind !== 'none' && a.config && exists(a.config())) return true;
  return false;
}

const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch (_) { return null; } };

// ---- TOML (Codex): replace the [mcp_servers.wayzerr] tables textually, keep everything else.
function tomlStrip(text) {
  const out = [];
  let skip = false;
  for (const line of text.split('\n')) {
    const h = line.match(/^\s*\[([^\]]+)\]\s*$/);
    if (h) skip = /^mcp_servers\.(wayzerr|persona)(\.|$)/.test(h[1].trim());
    if (!skip) out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
}
const tstr = (s) => JSON.stringify(String(s));

function isConnected(a) {
  if (a.kind === 'none') return false;
  if (a.kind === 'toml') { try { return /^\s*\[mcp_servers\.wayzerr\]/m.test(fs.readFileSync(a.config(), 'utf8')); } catch (_) { return false; } }
  return !!readJson(a.config())?.[a.key]?.wayzerr;
}

function list() {
  return APPS.map((a) => ({ id: a.id, name: a.name, sub: a.sub || '', domain: a.domain, download: a.download, note: a.note || '', supported: a.kind !== 'none', installed: installed(a), connected: isConnected(a) }));
}

function connect(id, info) {
  const a = APPS.find((x) => x.id === id);
  if (!a) throw new Error('Unknown app');
  if (a.kind === 'none') throw new Error(a.note);
  if (!installed(a)) throw new Error(`${a.name} isn't installed on this computer yet.`);
  const bin = ensureShims();
  const bridge = path.join(bin, 'wayzerr-mcp-bridge.js');
  fs.writeFileSync(bridge, BRIDGE);
  const node = nodeLaunch();
  const entry = { command: node.command, args: [bridge], env: { ...node.env, WAYZERR_MCP_URL: info.url, WAYZERR_MCP_TOKEN: info.token, WAYZERR_CLIENT: a.name } };
  const file = a.config();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (exists(file)) fs.copyFileSync(file, file + '.wayzerr-backup');
  if (a.kind === 'toml') {
    let text = '';
    try { text = fs.readFileSync(file, 'utf8'); } catch (_) {}
    const block = `[mcp_servers.wayzerr]\ncommand = ${tstr(entry.command)}\nargs = [${entry.args.map(tstr).join(', ')}]\n\n[mcp_servers.wayzerr.env]\n${Object.entries(entry.env).map(([k, v]) => `${k} = ${tstr(v)}`).join('\n')}\n`;
    const base = tomlStrip(text);
    fs.writeFileSync(file, (base ? base + '\n\n' : '') + block);
    return;
  }
  let cfg = {};
  if (exists(file)) {
    cfg = readJson(file);
    if (!cfg) throw new Error(`${a.name}'s settings file has an error, so Wayzerr didn't change it. Fix it or add Wayzerr by hand (Copy link & token).`);
  }
  cfg[a.key] = cfg[a.key] || {};
  delete cfg[a.key].persona; // the old name
  cfg[a.key].wayzerr = a.type ? { type: 'stdio', ...entry } : entry;
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

function disconnect(id) {
  const a = APPS.find((x) => x.id === id);
  if (!a || a.kind === 'none' || !isConnected(a)) return;
  const file = a.config();
  if (a.kind === 'toml') { fs.writeFileSync(file, tomlStrip(fs.readFileSync(file, 'utf8')) + '\n'); return; }
  const cfg = readJson(file);
  delete cfg[a.key].wayzerr; delete cfg[a.key].persona;
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
}

// Keep connected apps pointing at the current token/port (e.g. after a reset).
function refreshAll(info) {
  const bin = ensureShims();
  for (const a of APPS) {
    if (a.kind === 'none' || !isConnected(a)) continue;
    let text = '';
    try { text = fs.readFileSync(a.config(), 'utf8'); } catch (_) {}
    if (text.includes(info.token) && text.includes(info.url) && text.includes('WAYZERR_CLIENT') && text.includes(JSON.stringify(nodeLaunch().command).slice(1, -1))) continue;
    try { connect(a.id, info); } catch (_) {}
  }
}

module.exports = { list, connect, disconnect, refreshAll, APPS, tomlStrip };
