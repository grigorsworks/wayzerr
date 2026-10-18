// Use your own Claude or ChatGPT plan as a bot's brain — "Connect" → sign in in the browser.
// Wayzerr drives the official command-line apps (Claude Code and Codex) on this computer.
// They keep their own sign-in; Wayzerr never sees your password or tokens.
// Your bots' tools (browser, passwords, team, connectors) are handed to them over MCP.
const { app, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { ensureShims, connectorEnv, nodeLaunch, nodeTool } = require('./runtime');
const { BRIDGE } = require('./wayzerr-mcp');

const HOME = () => process.env.WAYZERR_HOME || os.homedir();
const WIN = process.platform === 'win32';

// Windows: npm makes a .cmd launcher in node_modules/.bin. Run what it points at directly
// (the .js with Wayzerr's built-in Node, or the .exe) — no shell, so nothing in a message can break out.
function launch(bin) {
  if (!WIN || !/\.cmd$/i.test(bin)) return { file: bin, pre: [], env: {} };
  try {
    const m = fs.readFileSync(bin, 'utf8').match(/"%~?dp0%?\\([^"]+)"\s*%\*/i);
    if (m) {
      const target = path.resolve(path.dirname(bin), m[1]);
      if (/\.exe$/i.test(target)) return { file: target, pre: [], env: {} };
      return { file: process.execPath, pre: [target], env: { ELECTRON_RUN_AS_NODE: '1' } };
    }
  } catch (_) {}
  return { file: bin, pre: [], env: {}, shell: true };
}
const spawnBin = (bin, args, opts = {}) => { const l = launch(bin); return spawn(l.file, [...l.pre, ...args], { ...opts, env: { ...(opts.env || connectorEnv()), ...l.env }, shell: !!l.shell, windowsHide: true }); };
const cliDir = () => path.join(app.getPath('userData'), 'cli');

const AGENTS = {
  claude: {
    type: 'claude-account',
    name: 'Claude',
    pkg: '@anthropic-ai/claude-code',
    bin: 'claude',
    extra: () => [path.join(HOME(), '.local', 'bin'), path.join(HOME(), '.claude', 'local'), path.join(HOME(), '.claude', 'bin')],
    models: [
      { id: 'sonnet', name: 'Claude Sonnet' },
      { id: 'opus', name: 'Claude Opus' },
      { id: 'fable', name: 'Claude Fable' },
      { id: 'haiku', name: 'Claude Haiku' },
    ],
  },
  codex: {
    type: 'chatgpt-account',
    name: 'ChatGPT',
    pkg: '@openai/codex',
    bin: 'codex',
    extra: () => ['/Applications/Codex.app/Contents/Resources', path.join(HOME(), 'Applications', 'Codex.app', 'Contents', 'Resources'), path.join(HOME(), '.codex', 'bin')],
    models: [
      { id: 'gpt-5.5', name: 'GPT-5.5' },
    ],
  },
};
AGENTS.gemini = {
  type: 'gemini-account',
  name: 'Gemini',
  app: 'Gemini CLI',
  pkg: '@google/gemini-cli',
  bin: 'gemini',
  extra: () => [],
  models: [
    { id: 'auto', name: 'Gemini Auto' },
    { id: 'pro', name: 'Gemini Pro' },
    { id: 'flash', name: 'Gemini Flash' },
    { id: 'flash-lite', name: 'Gemini Flash-Lite' },
  ],
};
AGENTS.copilot = {
  type: 'copilot-account',
  name: 'GitHub Copilot',
  app: 'Copilot CLI',
  pkg: '@github/copilot',
  bin: 'copilot',
  extra: () => [],
  models: [{ id: 'auto', name: 'Copilot Auto (picks the best model)' }],
};
AGENTS.augment = {
  type: 'augment-account', name: 'Augment', app: 'Auggie', pkg: '@augmentcode/auggie', bin: 'auggie', extra: () => [],
  models: [{ id: 'default', name: 'Augment (best model)' }],
};
AGENTS.cursor = {
  type: 'cursor-account', name: 'Cursor', app: 'Cursor CLI', bin: 'cursor-agent', installScript: 'curl -fsS https://cursor.com/install | bash',
  extra: () => [path.join(HOME(), '.local', 'bin'), path.join(HOME(), '.cursor', 'bin')],
  models: [{ id: 'auto', name: 'Cursor Auto' }],
};
AGENTS.amp = {
  type: 'amp-account', name: 'Amp', app: 'Amp CLI', pkg: '@ampcode/cli', bin: 'amp', extra: () => [path.join(HOME(), '.local', 'bin'), path.join(HOME(), '.amp', 'bin')],
  models: [{ id: 'smart', name: 'Amp Smart' }, { id: 'rush', name: 'Amp Rush (faster)' }],
};
AGENTS.claude.app = 'Claude Code';
AGENTS.codex.app = 'Codex';
const LOGIN_ARGS = { claude: ['auth', 'login', '--claudeai'], codex: ['login'], copilot: ['login', '--web-flow'], gemini: ['-p', 'Reply with just the word OK.', '--skip-trust', '-o', 'text'], augment: ['login', '--headless'], cursor: ['login'], amp: ['login'] };
const readJson = (f) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^\s*\/\/.*$/gm, '')); } catch (_) { return null; } };
// Gemini signs in with Google the first time it runs, once it knows to use a Google account.
function geminiUseGoogleLogin() {
  const f = path.join(HOME(), '.gemini', 'settings.json');
  const cfg = readJson(f) || {};
  if (cfg.security?.auth?.selectedType || cfg.selectedAuthType) return;
  cfg.security = { ...(cfg.security || {}), auth: { ...(cfg.security?.auth || {}), selectedType: 'oauth-personal' } };
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify(cfg, null, 2));
}
function copilotUser() {
  const cfg = readJson(path.join(process.env.COPILOT_HOME || path.join(HOME(), '.copilot'), 'config.json')) || {};
  const users = cfg.loggedInUsers || cfg.logged_in_users || [];
  const last = cfg.lastLoggedInUser || cfg.last_logged_in_user || users[0];
  return last ? (last.login || last.user || String(last)) : null;
}

const byType = (type) => Object.entries(AGENTS).find(([, a]) => a.type === type)?.[0];

// Is this file something the computer can start? (A real program, or a script with a #! line.)
// Claude's and Amp's package first puts a small placeholder text file there and a post-install step swaps in the real program.
const runnable = (f) => {
  if (WIN) return true;
  try {
    const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(4); fs.readSync(fd, b, 0, 4, 0); fs.closeSync(fd);
    const hex = b.toString('hex');
    return /^(cffaedfe|cefaedfe|cafebabe|bebafeca|7f454c46)/.test(hex) || b.toString('latin1', 0, 2) === '#!';
  } catch (_) { return false; }
};
function findBin(id) {
  const a = AGENTS[id];
  if (process.env['WAYZERR_' + id.toUpperCase() + '_BIN']) return process.env['WAYZERR_' + id.toUpperCase() + '_BIN'];
  const dirs = [path.join(cliDir(), 'node_modules', '.bin'), ...a.extra(), ...(WIN ? [path.join(process.env.APPDATA || '', 'npm'), path.join(HOME(), '.local', 'bin')] : []), '/opt/homebrew/bin', '/usr/local/bin', path.join(HOME(), '.npm-global', 'bin'), path.join(HOME(), '.bun', 'bin'), path.join(HOME(), '.volta', 'bin')];
  const names = WIN ? [a.bin + '.cmd', a.bin + '.exe'] : [a.bin];
  for (const d of dirs) {
    for (const n of names) {
      const f = path.join(d, n);
      try { fs.accessSync(f, WIN ? fs.constants.F_OK : fs.constants.X_OK); if (runnable(f)) return f; } catch (_) {}
    }
  }
  return null;
}

function run(file, args, { input, timeout = 60000, env, cwd } = {}) {
  const l = launch(file);
  return new Promise((resolve) => {
    const p = execFile(l.file, [...l.pre, ...args], { env: { ...(env || connectorEnv()), ...l.env }, shell: !!l.shell, windowsHide: true, timeout, maxBuffer: 1 << 26, cwd: cwd || workDir() }, (err, stdout, stderr) => resolve({ code: err ? err.code ?? 1 : 0, stdout: String(stdout || ''), stderr: String(stderr || '') }));
    if (input != null) { p.stdin.end(input); }
  });
}

function workDir() {
  const d = path.join(app.getPath('userData'), 'cli-work');
  fs.mkdirSync(d, { recursive: true });
  return d;
}

async function install(id, onProgress = () => {}) {
  const a = AGENTS[id];
  fs.mkdirSync(cliDir(), { recursive: true });
  const pj = path.join(cliDir(), 'package.json');
  if (!fs.existsSync(pj)) fs.writeFileSync(pj, JSON.stringify({ name: 'persona-cli', private: true }));
  onProgress(`Downloading ${a.app || a.name} (one time)…`);
  let r;
  if (a.installScript && WIN) throw new Error(`${a.app || a.name} can't be downloaded automatically on Windows yet. Install it from its website, then come back here.`);
  if (a.installScript) r = await run('/bin/bash', ['-c', a.installScript], { timeout: 600000 });
  else { const t = nodeTool('npm', ['install', '--no-audit', '--no-fund', '--prefix', cliDir(), a.pkg + '@latest']); r = await run(t.file, t.args, { timeout: 600000, env: connectorEnv(t.env) }); }
  // npm 12 no longer runs a package's post-install step by itself. Claude and Amp need it (it puts the real program in place),
  // so run it here. This also repairs a helper that an earlier attempt left half-installed.
  if (!a.installScript && a.pkg && !findBin(id)) {
    const pkgDir = path.join(cliDir(), 'node_modules', ...a.pkg.split('/'));
    const script = ['install.cjs', 'install.js'].map((n) => path.join(pkgDir, n)).find((f) => fs.existsSync(f));
    if (script) {
      onProgress(`Setting up ${a.app || a.name}…`);
      const node = WIN ? { file: process.execPath, args: [script], env: { ELECTRON_RUN_AS_NODE: '1' } } : { file: nodeLaunch().command, args: [script], env: {} };
      r = await run(node.file, node.args, { timeout: 300000, cwd: pkgDir, env: connectorEnv(node.env) });
    }
  }
  const bin = findBin(id);
  if (!bin) throw new Error(`Couldn't set up ${a.pkg}. Check your internet connection and try again.${r.stderr ? '\n' + r.stderr.slice(-300) : ''}`);
  return bin;
}

async function status(id) {
  const bin = findBin(id);
  if (!bin) return { installed: false, loggedIn: false };
  if (id === 'claude') {
    const r = await run(bin, ['auth', 'status', '--json'], { timeout: 20000 });
    let j = {};
    try { j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{'))); } catch (_) {}
    const plan = j.subscriptionType || j.subscription || '';
    return { installed: true, bin, loggedIn: !!j.loggedIn, account: j.email || j.account?.email || (plan ? 'Claude ' + plan : j.loggedIn ? 'Claude account' : '') };
  }
  if (id === 'gemini') {
    const creds = fs.existsSync(path.join(HOME(), '.gemini', 'oauth_creds.json'));
    const acc = readJson(path.join(HOME(), '.gemini', 'google_accounts.json'));
    return { installed: true, bin, loggedIn: creds, account: creds ? acc?.active || 'Google account' : '' };
  }
  if (id === 'augment') {
    const ok = fs.existsSync(path.join(HOME(), '.augment', 'session.json'));
    return { installed: true, bin, loggedIn: ok, account: ok ? 'Augment account' : '' };
  }
  if (id === 'amp') {
    const ok = !!process.env.AMP_API_KEY || [path.join(HOME(), '.local', 'share', 'amp', 'secrets.json'), path.join(HOME(), '.config', 'amp', 'secrets.json')].some((f) => fs.existsSync(f));
    return { installed: true, bin, loggedIn: ok, account: ok ? 'Amp account' : '' };
  }
  if (id === 'cursor') {
    const r = await run(bin, ['status'], { timeout: 20000 });
    const out = (r.stdout + r.stderr).replace(/\x1b\[[0-9;]*m/g, '');
    const ok = /logged in/i.test(out) && !/not logged in/i.test(out);
    return { installed: true, bin, loggedIn: ok, account: ok ? out.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || 'Cursor account' : '' };
  }
  if (id === 'copilot') {
    const u = copilotUser() || (process.env.COPILOT_GITHUB_TOKEN || process.env.GH_TOKEN ? 'GitHub token' : null);
    return { installed: true, bin, loggedIn: !!u, account: u ? (/token/.test(u) ? u : '@' + u) : '' };
  }
  const r = await run(bin, ['login', 'status'], { timeout: 20000 });
  const out = (r.stdout + r.stderr).trim();
  const logged = r.code === 0 && /logged in/i.test(out) && !/not logged in/i.test(out);
  return { installed: true, bin, loggedIn: logged, account: logged ? (out.match(/[\w.+-]+@[\w-]+\.[\w.]+/)?.[0] || (/chatgpt/i.test(out) ? 'ChatGPT account' : 'Signed in')) : '' };
}

async function models(id) {
  if (id !== 'codex') return AGENTS[id].models;
  const bin = findBin(id);
  if (!bin) return AGENTS.codex.models;
  const r = await run(bin, ['debug', 'models'], { timeout: 30000 });
  try {
    const j = JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
    const list = (j.models || []).filter((m) => m.visibility !== 'hide').sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99)).map((m) => ({ id: m.slug, name: m.display_name || m.slug, efforts: (m.supported_reasoning_levels || []).map((x) => x.effort) }));
    if (list.length) return list;
  } catch (_) {}
  return AGENTS.codex.models;
}

// Sign in: runs the app's own login, which opens the sign-in page in your browser.
let loginProc = null;
function login(id, onProgress = () => {}) {
  const bin = findBin(id);
  if (!bin) throw new Error('Not installed yet');
  loginProc?.kill();
  if (id === 'gemini') geminiUseGoogleLogin();
  const args = LOGIN_ARGS[id];
  const p = spawnBin(bin, args, { env: connectorEnv(), cwd: workDir(), stdio: ['pipe', 'pipe', 'pipe'] });
  loginProc = p;
  let buf = '', urlSent = false;
  const onData = (c) => {
    buf += c.toString();
    const url = buf.match(/https:\/\/[^\s"'<>]+/g)?.find((u) => /auth|login|oauth|device|claude\.ai|anthropic|openai|chatgpt|google|github/i.test(u));
    if (url && !urlSent) { urlSent = true; onProgress({ url }); }
    const dc = buf.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/);
    if (dc && !onData.dc) { onData.dc = true; onProgress({ text: `Enter this code on the sign-in page: ${dc[1]}`, deviceCode: dc[1] }); }
    if (/code/i.test(buf) && /paste|enter/i.test(buf)) onProgress({ needsCode: true });
  };
  p.stdout.on('data', onData);
  p.stderr.on('data', onData);
  p.on('exit', (code) => { if (loginProc === p) loginProc = null; onProgress({ exited: code, output: buf.slice(-400) }); });
  return true;
}
function sendCode(code) { if (loginProc) loginProc.stdin.write(String(code).trim() + '\n'); }
function cancelLogin() { loginProc?.kill(); loginProc = null; }

// Open a small script in a terminal window: Terminal on Mac, a cmd window on Windows, the usual terminal on Linux.
function openInTerminal(name, dir, pathDir, line, title) {
  if (WIN) {
    const f = path.join(workDir(), name + '.cmd');
    fs.writeFileSync(f, `@echo off\r\nset "PATH=${pathDir};%PATH%"\r\ncd /d "${dir}"\r\n${title ? `echo ${title}\r\n` : ''}${line}\r\necho.\r\npause\r\n`);
    return shell.openPath(f);
  }
  const f = path.join(workDir(), name + (process.platform === 'darwin' ? '.command' : '.sh'));
  fs.writeFileSync(f, `#!/bin/sh\nexport PATH="${pathDir}:$PATH"\ncd "${dir}"\n${title ? `echo "${title}"\n` : ''}${line}\n${process.platform === 'darwin' ? '' : 'echo\nprintf "Press Enter to close this window…"; read _\n'}`);
  fs.chmodSync(f, 0o755);
  if (process.platform === 'darwin') return shell.openPath(f);
  // Linux: try the common terminals in turn.
  const terms = [['x-terminal-emulator', ['-e', f]], ['gnome-terminal', ['--', f]], ['konsole', ['-e', f]], ['xfce4-terminal', ['-x', f]], ['xterm', ['-e', f]]];
  return new Promise((resolve) => {
    const next = (i) => {
      if (i >= terms.length) return resolve(shell.openPath(f));
      const p = spawn(terms[i][0], terms[i][1], { detached: true, stdio: 'ignore' });
      p.on('error', () => next(i + 1));
      p.on('spawn', () => { p.unref(); resolve(''); });
    };
    next(0);
  });
}

// Fallback: some versions want a real terminal for sign-in.
function loginInTerminal(id) {
  const bin = findBin(id);
  if (id === 'gemini') geminiUseGoogleLogin();
  const cmd = `${WIN ? 'call ' : ''}"${bin}" ` + (id === 'gemini' ? '' : LOGIN_ARGS[id].join(' '));
  return openInTerminal(`persona-${id}-login`, workDir(), ensureShims(), `${cmd}${WIN ? '\r\n' : '\n'}echo Done — you can close this window and go back to Wayzerr.`, `Signing in to ${AGENTS[id].name} for Wayzerr…`);
}

// Open one bot's cloud chat in the AI's own app (Terminal), e.g. `codex resume <id>` or `claude --resume <id>`.
function openChatInTerminal(id, session) {
  const bin = findBin(id);
  if (!bin) throw new Error(`${AGENTS[id].name} isn't set up on this computer.`);
  const resume = { claude: `--resume ${session}`, codex: `resume ${session}`, copilot: `--resume ${session}` }[id];
  if (!resume) throw new Error(`${AGENTS[id].name} doesn't keep chat history — Wayzerr keeps it for you here.`);
  return openInTerminal(`persona-${id}-chat`, personaDir(), ensureShims(), `${WIN ? 'call ' : ''}"${bin}" ${resume}`);
}

function loginCommand(id) {
  const bin = findBin(id);
  if (!bin) return null;
  const q = /[\s'"]/.test(bin) ? `'${bin}'` : bin;
  return id === 'gemini' ? `${q}   (then choose “Sign in with Google”)` : `${q} ${LOGIN_ARGS[id].join(' ')}`;
}

async function logout(id) {
  const bin = findBin(id);
  if (!bin) return;
  await run(bin, id === 'claude' ? ['auth', 'logout'] : ['logout'], { timeout: 20000 });
}

/**
 * One reply from an account-connected model.
 * mcp: { url, token } — a per-turn MCP endpoint that exposes this bot's tools.
 */
// The "Wayzerr" folder: every bot is one chat (session) inside it, so the same
// conversations show up in Claude Code / Codex under a project called Wayzerr.
function personaDir() {
  const d = process.env.WAYZERR_CHATS_DIR || path.join(HOME(), 'Wayzerr');
  try { const old = path.join(HOME(), 'Persona'); if (!process.env.WAYZERR_CHATS_DIR && !fs.existsSync(d) && fs.existsSync(old)) fs.renameSync(old, d); } catch (_) {} // the folder used to be called Persona
  fs.mkdirSync(d, { recursive: true });
  const readme = path.join(d, 'README.txt');
  if (!fs.existsSync(readme)) fs.writeFileSync(readme, 'This folder is used by the Wayzerr app.\nEach of your bots is one chat here, so the conversations also appear in Claude Code and Codex under "Wayzerr".\n');
  return d;
}

const CODEX_QUICK_OFF = ['apps', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'computer_use', 'goals', 'image_generation', 'in_app_browser', 'multi_agent', 'plugins', 'skill_search', 'sleep_tool', 'tool_suggest', 'hooks', 'view_image', 'personality'];
// Codex ships ~10k tokens of its own coding instructions and tool lists that Wayzerr never uses (its tools come over MCP).
// "Lean" replaces them with a few lines: a hello goes from about 13k tokens to about 4k.
const LEAN_TEXT = "You are the assistant inside the Wayzerr app. The user's message begins with an <instructions> block (who you are and how to answer): follow it. Use only the tools you are given (they come from Wayzerr over MCP, plus web search if offered). Never run shell commands or read or edit files. Answer in the user's language and in the style asked for.\n";
const CODEX_LEAN = ['features.shell_tool=false', 'features.unified_exec=false', 'include_environment_context=false', 'include_permissions_instructions=false', 'include_apply_patch_tool=false', 'include_plan_tool=false'];
function leanFile() {
  const f = path.join(ensureShims(), 'wayzerr-codex-instructions.md');
  try { if (fs.readFileSync(f, 'utf8') === LEAN_TEXT) return f; } catch (_) {}
  fs.writeFileSync(f, LEAN_TEXT);
  return f;
}
function ask({ id, model, effort, system, prompt, firstPrompt, mcp, signal, session, botName, sendSystem = true, webSearch = true, quick = false, images = [], partial = true, ephemeral = false, lean = false, onEvent = () => {} }) {
  if (effort === 'fast') effort = 'low'; // ⚡ Fast: least thinking
  // Small talk: no tools, no web, least thinking and the quickest model — it answers in a moment.
  if (quick) { effort = 'low'; webSearch = false; if (id === 'claude') model = 'haiku'; }
  const bin = findBin(id);
  if (!bin) return Promise.reject(new Error(`${AGENTS[id].name} isn't set up yet. Open the model menu and click Connect.`));
  const node = nodeLaunch();
  const nodeBin = node.command;
  const bridge = path.join(ensureShims(), 'wayzerr-mcp-bridge.js');
  fs.writeFileSync(bridge, BRIDGE);
  const env = { ...node.env, WAYZERR_MCP_URL: mcp.url, WAYZERR_MCP_TOKEN: mcp.token, WAYZERR_CLIENT: 'Wayzerr' };
  let args, outFile = null, extraEnv = {}, cwd = personaDir();
  // Pictures from the chat: saved as files for apps that take files, or sent inline to Claude.
  const pics = (images || []).map((u) => /^data:(image\/[a-z+.-]+);base64,(.+)$/s.exec(u)).filter(Boolean).map((m) => ({ mime: m[1], data: m[2] }));
  let picDir = null;
  const picFiles = () => {
    if (picDir) return picDir.files;
    const dir = fs.mkdtempSync(path.join(workDir(), 'pics-'));
    const files = pics.map((p, i) => { const f = path.join(dir, `image-${i + 1}.${p.mime.includes('png') ? 'png' : p.mime.includes('webp') ? 'webp' : 'jpg'}`); fs.writeFileSync(f, Buffer.from(p.data, 'base64')); return f; });
    picDir = { dir, files };
    return files;
  };
  if (id === 'claude') {
    const cfg = { mcpServers: quick ? {} : { persona: { command: nodeBin, args: [bridge], env } } };
    args = ['-p', '--output-format', 'stream-json', '--verbose', '--model', model, '--system-prompt', system,
      '--mcp-config', JSON.stringify(cfg), '--strict-mcp-config', '--tools', webSearch ? 'WebSearch,WebFetch' : '', '--allowedTools', webSearch ? 'mcp__wayzerr,WebSearch,WebFetch' : 'mcp__wayzerr'];
    if (session) args.push('--resume', session);
    else { session = require('crypto').randomUUID(); args.push('--session-id', session, '-n', botName || 'Wayzerr bot'); prompt = firstPrompt || prompt; }
    if (effort && effort !== 'default') args.push('--effort', effort);
    if (pics.length) args.push('--input-format', 'stream-json');
    if (partial) args.push('--include-partial-messages'); // the answer arrives word by word, so it can show live
  } else if (id === 'gemini') {
    // A private workspace per reply: its settings hand Gemini the bot's tools and switch off file/shell tools.
    const ws = fs.mkdtempSync(path.join(workDir(), 'gemini-'));
    fs.mkdirSync(path.join(ws, '.gemini'));
    fs.writeFileSync(path.join(ws, '.gemini', 'settings.json'), JSON.stringify({
      mcpServers: quick ? {} : { persona: { command: nodeBin, args: [bridge], env, trust: true, timeout: 900000 } },
      tools: { exclude: ['run_shell_command', 'write_file', 'replace', ...(pics.length ? [] : ['read_file', 'read_many_files']), 'glob', 'search_file_content', 'list_directory', 'save_memory', ...(webSearch ? [] : ['google_web_search', 'web_fetch'])] },
    }));
    fs.writeFileSync(path.join(ws, 'system.md'), system);
    extraEnv = { GEMINI_SYSTEM_MD: path.join(ws, 'system.md') };
    cwd = ws;
    prompt = firstPrompt || prompt;
    let ask = 'Reply to the conversation above.';
    if (pics.length) { pics.forEach((p, i) => fs.writeFileSync(path.join(ws, `image-${i + 1}.${p.mime.includes('png') ? 'png' : 'jpg'}`), Buffer.from(p.data, 'base64'))); ask += ' The pictures the user attached: ' + pics.map((p, i) => `@image-${i + 1}.${p.mime.includes('png') ? 'png' : 'jpg'}`).join(' '); }
    args = ['-p', ask, '-m', model, '--approval-mode', 'yolo', '--skip-trust', '-o', 'json'];
  } else if (id === 'augment' || id === 'cursor' || id === 'amp') {
    const ws = fs.mkdtempSync(path.join(workDir(), id + '-'));
    cwd = ws;
    let text = `<instructions>\n${system}\n</instructions>\n\n${firstPrompt || prompt}`;
    if (pics.length) { const fs2 = pics.map((p, i) => { const f = path.join(ws, `image-${i + 1}.${p.mime.includes('png') ? 'png' : 'jpg'}`); fs.writeFileSync(f, Buffer.from(p.data, 'base64')); return f; }); text += `\n\nThe user's pictures are saved here — open and look at them: ${fs2.join(', ')}`; }
    const cfg = { mcpServers: { persona: { command: nodeBin, args: [bridge], env } } };
    if (id === 'augment') {
      fs.writeFileSync(path.join(ws, 'prompt.md'), text);
      args = ['--print', '--quiet', '--output-format', 'text', '--dont-save-session', '--instruction-file', path.join(ws, 'prompt.md'), '--mcp-config', JSON.stringify(cfg), '--workspace-root', ws, '--no-discover-workspaces'];
      if (model && model !== 'default') args.push('--model', model);
      if (effort && effort !== 'default') args.push('--reasoning-effort', effort);
    } else if (id === 'cursor') {
      fs.mkdirSync(path.join(ws, '.cursor'));
      fs.writeFileSync(path.join(ws, '.cursor', 'mcp.json'), JSON.stringify(cfg));
      args = ['-p', text, '--output-format', 'text', '--approve-mcps', '--force'];
      if (model && model !== 'auto') args.push('--model', model);
    } else {
      args = ['-x', text, '--mcp-config', JSON.stringify(cfg.mcpServers), '--dangerously-allow-all', '--no-notifications'];
      if (model) args.push('-m', model);
    }
    prompt = null;
    session = null;
  } else if (id === 'copilot') {
    const cfg = { mcpServers: { persona: { type: 'local', command: nodeBin, args: [bridge], env, tools: ['*'] } } };
    let text = prompt;
    if (!session) { session = require('crypto').randomUUID(); text = `<instructions>\n${system}\n</instructions>\n\n${firstPrompt || prompt}`; }
    if (pics.length) text += `\n\nThe user's pictures are saved here — open and look at them: ${picFiles().join(', ')}`;
    args = ['-p', text, '-s', '--allow-all-tools', '--deny-tool', 'shell', '--deny-tool', 'write', '--additional-mcp-config', JSON.stringify(cfg), '--session-id', session, '-n', botName || 'Wayzerr bot', '--no-auto-update'];
    if (model && model !== 'auto') args.push('--model', model);
    if (effort && effort !== 'default') args.push('--reasoning-effort', effort);
    prompt = null;
  } else {
    outFile = path.join(workDir(), `reply-${Date.now()}.txt`);
    const t = (s) => JSON.stringify(String(s));
    if (!session) prompt = firstPrompt || prompt;
    args = ['exec', ...(session ? ['resume'] : []), '--json', '--skip-git-repo-check', ...(ephemeral && !session ? ['--ephemeral'] : []), '-m', model,
      '-c', 'approval_policy="never"', '-c', 'sandbox_mode="read-only"',
      ...(quick ? [] : ['-c', 'mcp_servers.wayzerr.default_tools_approval_mode="approve"',
        '-c', 'mcp_servers.wayzerr.tool_timeout_sec=900',
        '-c', `mcp_servers.wayzerr.command=${t(nodeBin)}`,
        '-c', `mcp_servers.wayzerr.args=[${t(bridge)}]`,
        '-c', `mcp_servers.wayzerr.env={WAYZERR_MCP_URL=${t(env.WAYZERR_MCP_URL)},WAYZERR_MCP_TOKEN=${t(env.WAYZERR_MCP_TOKEN)},WAYZERR_CLIENT="Wayzerr"${node.env.ELECTRON_RUN_AS_NODE ? ',ELECTRON_RUN_AS_NODE="1"' : ''}}`]),
      '-o', outFile];
    if (pics.length) for (const f of picFiles()) args.push(`--image=${f}`);
    // Small talk needs none of Codex's built-in tools (browser, computer, plugins…): each one adds to what every message re-reads.
    if (quick || lean) for (const f of CODEX_QUICK_OFF) args.push('-c', `features.${f}=false`);
    if (lean) { args.push('-c', `model_instructions_file=${t(leanFile())}`); for (const x of CODEX_LEAN) args.push('-c', x); }
    if (webSearch) args.push('-c', 'web_search="live"', '-c', 'tools.web_search=true'); // ChatGPT's own web search, like chatgpt.com
    if (effort && effort !== 'default') args.push('-c', `model_reasoning_effort=${t(effort)}`);
    if (session) args.push(session);
    args.push('-');
    // Resumed chats already have the instructions — only resend them when they changed (faster, fewer tokens).
    prompt = !session || sendSystem ? `<instructions>\n${system}\n</instructions>\n\n${prompt}` : prompt; // the time is already in the message
  }
  return new Promise((resolve, reject) => {
    // Tools can wait for you (sign-in cards, permission questions), so give them time.
    const p = spawnBin(bin, args, { env: connectorEnv({ MCP_TOOL_TIMEOUT: '900000', ...extraEnv }), cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', result = null, lastText = '', raw = '', thinking = '', usage = null, emitted = '', live = '';
    const emit = (t) => { t = String(t || '').trim(); if (t && t !== emitted) { emitted = t; try { onEvent({ type: 'text', text: t }); } catch (_) {} } };
    const kill = () => { try { p.kill(); } catch (_) {} };
    signal?.addEventListener('abort', kill, { once: true });
    p.stdout.on('data', (c) => {
      raw += c.toString();
      if (id !== 'claude' && id !== 'codex') return;
      out += c.toString();
      let i;
      while ((i = out.indexOf('\n')) >= 0) {
        const line = out.slice(0, i).trim();
        out = out.slice(i + 1);
        if (!line) continue;
        let ev;
        try { ev = JSON.parse(line); } catch (_) { continue; }
        if (id === 'claude') {
          if (ev.type === 'stream_event') {
            const e = ev.event || {};
            if (e.type === 'content_block_start' && e.content_block?.type === 'text') live = '';
            else if (e.type === 'content_block_delta' && e.delta?.type === 'text_delta' && e.delta.text) { live += e.delta.text; try { onEvent({ type: 'stream', text: live }); } catch (_) {} }
          }
          if (ev.type === 'result') result = ev;
          if (ev.type === 'assistant') for (const b of ev.message?.content || []) { if (b.type === 'text' && b.text) { lastText = b.text; emit(b.text); } if (b.type === 'tool_use' && /^Web(Search|Fetch)$/.test(b.name || '')) { try { onEvent({ type: 'status', activity: 'reading', text: b.name === 'WebSearch' ? `Searching the web${b.input?.query ? ' for “' + String(b.input.query).slice(0, 50) + '”' : ''}` : 'Reading a web page' }); } catch (_) {} } if (b.type === 'thinking' && b.thinking) thinking += (thinking ? '\n\n' : '') + b.thinking; }
        } else {
          const it = ev.item || ev.msg || {};
          if ((it.type === 'agent_message' || it.item_type === 'assistant_message') && (it.text || it.message)) { lastText = it.text || it.message; if (!/^item\.(started|updated)$/.test(ev.type || '')) emit(lastText); }
          if (ev.type === 'error' || ev.type === 'turn.failed') err += (ev.message || ev.error?.message || '') + '\n';
          if (ev.type === 'thread.started' && ev.thread_id) session = ev.thread_id;
          if (ev.type === 'turn.completed' && ev.usage) usage = ev.usage;
          if (/web_search/.test(it.type || '') && /started|completed/.test(ev.type || '')) { try { onEvent({ type: 'status', activity: 'reading', text: `Searching the web${it.query ? ' for “' + String(it.query).slice(0, 50) + '”' : ''}` }); } catch (_) {} }
          if (it.type === 'reasoning' && it.text) thinking += (thinking ? '\n\n' : '') + it.text;
        }
      }
    });
    p.stderr.on('data', (c) => { err += c.toString(); if (err.length > 20000) err = err.slice(-10000); });
    if (prompt != null && id === 'claude' && pics.length) {
      const content = [...pics.map((x) => ({ type: 'image', source: { type: 'base64', media_type: x.mime, data: x.data } })), { type: 'text', text: prompt }];
      p.stdin.end(JSON.stringify({ type: 'user', message: { role: 'user', content } }) + '\n');
    } else if (prompt == null) p.stdin.end(); else p.stdin.end(prompt);
    p.on('error', (e) => reject(e));
    p.on('exit', (code) => {
      signal?.removeEventListener('abort', kill);
      if (picDir) try { fs.rmSync(picDir.dir, { recursive: true, force: true }); } catch (_) {}
      if (signal?.aborted) { const e = new Error('Stopped'); e.stopped = true; return reject(e); }
      if (id === 'gemini') {
        if (cwd !== personaDir()) fs.rmSync(cwd, { recursive: true, force: true });
        let j = null;
        try { j = JSON.parse(raw.slice(raw.indexOf('{'))); } catch (_) {}
        const text = j?.response || (!j && code === 0 ? raw.trim() : '');
        if (text) { const st = j?.stats?.models ? Object.values(j.stats.models)[0]?.tokens : null; return resolve({ text, session: null, usage: st ? { input: st.prompt || st.input || 0, output: st.candidates || st.output || 0 } : null }); }
        return reject(new Error(friendly(id, j?.error?.message || err || raw, code)));
      }
      if (id === 'augment' || id === 'cursor' || id === 'amp') {
        if (cwd !== personaDir()) fs.rmSync(cwd, { recursive: true, force: true });
        const text = raw.replace(/\x1b\[[0-9;]*m/g, '').trim();
        if (code === 0 && text) return resolve({ text, session: null });
        return reject(new Error(friendly(id, err || text, code)));
      }
      if (id === 'copilot') {
        const text = raw.trim();
        if (code === 0 && text) return resolve({ text, session });
        return reject(new Error(friendly(id, err || text, code)));
      }
      if (id === 'claude') {
        if (result && !result.is_error) return resolve({ text: result.result || lastText || '…', session: result.session_id || session, thinking, usage: { ...(result.usage || {}), cost: result.total_cost_usd || 0 } });
        const msg = (result?.result || err || '').toString();
        return reject(new Error(friendly(id, msg, code)));
      }
      let text = '';
      try { text = fs.readFileSync(outFile, 'utf8').trim(); fs.rmSync(outFile, { force: true }); } catch (_) {}
      if (text || lastText) return resolve({ text: text || lastText, session, thinking, usage });
      reject(new Error(friendly(id, err, code)));
    });
  });
}

function friendly(id, msg, code) {
  const name = AGENTS[id].name;
  if (/log ?in|auth|unauthori[sz]ed|401|credential|not logged/i.test(msg)) return `${name} isn't signed in. Open the model menu, pick ${name} and click Connect.`;
  if (/rate|limit|quota|usage/i.test(msg)) return `You've reached your ${name} plan's usage limit for now. Try again later or switch to another model.`;
  const line = String(msg).split('\n').map((s) => s.trim()).filter(Boolean).pop() || `exit code ${code}`;
  return `${name} couldn't answer: ${line.slice(0, 240)}`;
}

// Make a picture with the ChatGPT plan through Codex (its built-in image tool — no API key).
// Codex saves the picture in ~/.codex/generated_images; we pick up the newest one it made.
async function codexImage(prompt, size = 'square') {
  const bin = findBin('codex');
  if (!bin) throw new Error('ChatGPT sign-in is not set up');
  const t0 = Date.now() - 2000;
  const home = process.env.CODEX_HOME || path.join(HOME(), '.codex');
  const dirs = [path.join(home, 'generated_images'), workDir()];
  const newest = () => {
    let best = null;
    const walk = (d, depth) => { let es = []; try { es = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return; }
      for (const e of es) { const f = path.join(d, e.name); if (e.isDirectory()) { if (depth < 4) walk(f, depth + 1); continue; }
        if (!/\.(png|jpe?g|webp)$/i.test(e.name)) continue; let st; try { st = fs.statSync(f); } catch (_) { continue; }
        if (st.mtimeMs >= t0 && st.size > 1000 && (!best || st.mtimeMs > best.t)) best = { f, t: st.mtimeMs }; } };
    dirs.forEach((d) => walk(d, 0));
    return best?.f || null;
  };
  const shape = size === 'portrait' ? 'tall (portrait, 2:3)' : size === 'landscape' ? 'wide (landscape, 3:2)' : 'square';
  const ask = `Generate this image with your built-in image generation tool (image_gen / $imagegen). Don't write code, scripts or SVG, and don't edit any files — just create the image once and reply "done". Shape: ${shape}.\n\nImage: ${prompt}`;
  // input: '' closes its stdin — without that, `codex exec` waits for more input forever and the picture never comes.
  // One try only: each try reads ~60k tokens of the ChatGPT plan, so a second one just burns credits.
  const r = await run(bin, ['exec', '--skip-git-repo-check', '-c', 'features.image_generation=true', ask], { timeout: 240000, input: '' });
  const f = newest();
  if (!f && /(isn.?t|not|n.t) available|can.?t generate|cannot generate|unable to generate/i.test(r.stdout + r.stderr)) { const e = new Error("ChatGPT's picture tool isn't available on this account"); e.unavailable = true; throw e; }
  if (!f) throw new Error(/log ?in|auth|401/i.test(r.stderr + r.stdout) ? 'sign in to ChatGPT again' : 'ChatGPT made no picture' + (r.stderr ? ' (' + r.stderr.trim().split('\n').pop().slice(0, 100) + ')' : ''));
  const ext = path.extname(f).slice(1).toLowerCase();
  return { buf: fs.readFileSync(f), mime: ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : 'image/' + ext };
}

module.exports = { codexImage, openChatInTerminal, personaDir, loginCommand, AGENTS, byType, findBin, install, status, models, login, sendCode, cancelLogin, loginInTerminal, logout, ask };
