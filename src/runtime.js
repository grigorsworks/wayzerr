// A built-in Node.js for connectors: Electron can run as Node, and we ship npm.
// We create tiny `node`, `npm` and `npx` launchers so any connector command
// ("npx -y some-mcp-server") works even if Node.js isn't installed on the computer (Mac, Windows or Linux).
const { app } = require('electron');
const fs = require('fs');
const path = require('path');

let binDir = null;

function npmDir() {
  // npm is unpacked from app.asar so it can read its own files normally.
  const base = app.getAppPath().replace(/app\.asar$/, 'app.asar.unpacked');
  const p = path.join(base, 'node_modules', 'npm');
  return fs.existsSync(p) ? p : path.join(app.getAppPath(), 'node_modules', 'npm');
}

const WIN = process.platform === 'win32';

function ensureShims() {
  if (binDir) return binDir;
  const dir = path.join(app.getPath('userData'), 'bin');
  fs.mkdirSync(dir, { recursive: true });
  const npm = npmDir();
  let files;
  if (WIN) {
    // Windows: small .cmd launchers (Electron runs as Node.js when ELECTRON_RUN_AS_NODE is set).
    const w = (s) => `"${String(s)}"`;
    files = {
      'node.cmd': `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n${w(process.execPath)} %*\r\n`,
      'npm.cmd': `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n${w(process.execPath)} ${w(path.join(npm, 'bin', 'npm-cli.js'))} %*\r\n`,
      'npx.cmd': `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n${w(process.execPath)} ${w(path.join(npm, 'bin', 'npx-cli.js'))} %*\r\n`,
    };
  } else {
    const q = (s) => `"${String(s).replace(/(["\\$`])/g, '\\$1')}"`;
    files = {
      node: `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${q(process.execPath)} "$@"\n`,
      npm: `#!/bin/sh\nexec ${q(path.join(dir, 'node'))} ${q(path.join(npm, 'bin', 'npm-cli.js'))} "$@"\n`,
      npx: `#!/bin/sh\nexec ${q(path.join(dir, 'node'))} ${q(path.join(npm, 'bin', 'npx-cli.js'))} "$@"\n`,
    };
  }
  for (const [name, body] of Object.entries(files)) {
    const f = path.join(dir, name);
    let cur = null;
    try { cur = fs.readFileSync(f, 'utf8'); } catch (_) {}
    if (cur !== body) fs.writeFileSync(f, body);
    if (!WIN) fs.chmodSync(f, 0o755);
  }
  binDir = dir;
  return dir;
}

// How to start Node.js for a helper (e.g. the MCP bridge other apps launch).
// Mac/Linux: our `node` launcher. Windows: Wayzerr.exe itself in Node mode (works without any shell).
function nodeLaunch() {
  if (WIN) return { command: process.execPath, env: { ELECTRON_RUN_AS_NODE: '1' } };
  return { command: path.join(ensureShims(), 'node'), env: {} };
}
// Run npm / npx without a shell on every system: { file, args, env }.
function nodeTool(tool, args = []) {
  if (!WIN) return { file: path.join(ensureShims(), tool), args, env: {} };
  return { file: process.execPath, args: [path.join(npmDir(), 'bin', `${tool}-cli.js`), ...args], env: { ELECTRON_RUN_AS_NODE: '1' } };
}

// Environment for connector processes: our launchers first, then the usual places.
function connectorEnv(extra = {}) {
  const dir = ensureShims();
  const env = { ...process.env, ...extra };
  if (!('ELECTRON_RUN_AS_NODE' in extra)) delete env.ELECTRON_RUN_AS_NODE;
  // Windows spells it "Path": keep exactly one PATH entry.
  const pkey = Object.keys(env).find((k) => k.toUpperCase() === 'PATH');
  const cur = pkey ? env[pkey] : '';
  if (pkey) delete env[pkey];
  env.PATH = (WIN ? [dir, cur] : [dir, cur, '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin']).filter(Boolean).join(path.delimiter);
  env.npm_config_yes = 'true';
  env.npm_config_update_notifier = 'false';
  env.npm_config_fund = 'false';
  env.npm_config_audit = 'false';
  env.npm_config_loglevel = 'error';
  return env;
}

module.exports = { ensureShims, connectorEnv, npmDir, nodeLaunch, nodeTool };
