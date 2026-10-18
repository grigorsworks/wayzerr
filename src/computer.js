// A small Linux computer for each bot. It runs in QEMU (using the machine's own virtualization), shows up as a screen
// in Wayzerr, and has no way to touch your files except the one folder you share with it.
// The engine and the base system are downloaded once from the update server; every bot then gets its own disk on top.
const fs = require('fs');
const path = require('path');
const net = require('net');
const crypto = require('crypto');
const os = require('os');
const { spawn, execFile } = require('child_process');
const fetch = require('./netfetch');

const KEY = process.env.WAYZERR_FAKE_SYSTEM || `${process.platform}-${process.arch}`; // e.g. darwin-arm64 (the override is only for testing how other systems look)
const SUPPORTED = new Set(['darwin-arm64', 'linux-x64', 'linux-arm64', 'win32-x64']);
const WIN = process.platform === 'win32'; // on Windows the engine is downloaded, the screen is on a private local port (protected with TLS) and the shared folder is served by Wayzerr itself (p9.js)
const NET9P = WIN || !!process.env.WAYZERR_NET9P; // (the override is only for testing the network folder on other systems)
const TCPVNC = WIN || !!process.env.WAYZERR_VNC_TCP;
let whpxOk = null; // Windows only: does this PC let QEMU use Windows' own virtualization (Windows Hypervisor Platform)? null = not checked yet
const LINUX = process.platform === 'linux'; // on Linux the virtual machine program (QEMU) comes from the system, and the computer runs with KVM
const ARM = process.arch === 'arm64';
const QEMU_HINT = ARM ? 'sudo apt install qemu-system-arm qemu-utils qemu-efi-aarch64' : 'sudo apt install qemu-system-x86 qemu-utils';
// Where Linux distributions keep the start-up firmware that an ARM computer needs (a 64 MiB pflash file, or a small one for -bios)
const ARM_FIRMWARE = [...(process.env.WAYZERR_ARM_FIRMWARE ? [process.env.WAYZERR_ARM_FIRMWARE] : []), '/usr/share/AAVMF/AAVMF_CODE.fd', '/usr/share/edk2/aarch64/QEMU_EFI-pflash.raw', '/usr/share/edk2/aarch64/QEMU_CODE.fd', '/usr/share/qemu-efi-aarch64/QEMU_EFI.fd', '/usr/share/qemu/edk2-aarch64-code.fd'];
const armFirmware = () => ARM_FIRMWARE.find((f) => { try { fs.accessSync(f, fs.constants.R_OK); return true; } catch (_) { return false; } }) || '';
// Without KVM the computer still runs, in software: it works but is slow (a few minutes to start)
const kvmOk = () => { try { fs.accessSync('/dev/kvm', fs.constants.R_OK | fs.constants.W_OK); return true; } catch (_) { return false; } };
const isSlow = () => (LINUX && (process.env.WAYZERR_QEMU_ACCEL === 'tcg' || !kvmOk())) || (WIN && (process.env.WAYZERR_QEMU_ACCEL === 'tcg' || whpxOk === false));

// An endpoint is a socket file / named pipe (a string) or a local port.
const connectEp = (ep) => (typeof ep === 'string' ? net.connect(ep) : net.connect(ep.port, '127.0.0.1'));
const freePort = () => new Promise((ok) => { const tryOne = (n) => { const p = 20000 + Math.floor(Math.random() * 39000); const t = net.createServer(); t.once('error', () => (n > 20 ? ok(0) : tryOne(n + 1))); t.listen(p, '127.0.0.1', () => t.close(() => ok(p))); }; tryOne(0); });
// The screen on a local port (Windows) is protected with TLS and a certificate that only Wayzerr has (QEMU's own password login is not
// available in the Windows build). QEMU speaks "VeNCrypt" for this: a short negotiation, then TLS, then the normal screen protocol.
function makeCreds(dir) {
  const forge = require('node-forge'), pki = forge.pki;
  fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const key = () => { const k = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }); const pem = k.privateKey.export({ type: 'pkcs8', format: 'pem' }); return { priv: pki.privateKeyFromPem(pem), pub: pki.publicKeyFromPem(k.publicKey.export({ type: 'spki', format: 'pem' })), pem }; };
  const cert = (cn, k, issuer, issuerKey, ext) => {
    const c = pki.createCertificate(); c.publicKey = k.pub; c.serialNumber = '0' + crypto.randomBytes(8).toString('hex');
    c.validity.notBefore = new Date(Date.now() - 3600e3); c.validity.notAfter = new Date(Date.now() + 30 * 86400e3);
    const subj = [{ name: 'commonName', value: cn }]; c.setSubject(subj); c.setIssuer(issuer ? issuer.subject.attributes : subj); c.setExtensions(ext);
    c.sign(issuerKey || k.priv, forge.md.sha256.create()); return c;
  };
  const caK = key(), srvK = key(), cliK = key();
  const ca = cert('Wayzerr computer CA', caK, null, null, [{ name: 'basicConstraints', cA: true, critical: true }, { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true }]);
  const leaf = (usage) => [{ name: 'basicConstraints', cA: false }, { name: 'keyUsage', digitalSignature: true, keyEncipherment: true }, { name: 'extKeyUsage', ...usage }];
  const srv = cert('127.0.0.1', srvK, ca, caK.priv, [...leaf({ serverAuth: true }), { name: 'subjectAltName', altNames: [{ type: 7, ip: '127.0.0.1' }] }]);
  const cli = cert('Wayzerr', cliK, ca, caK.priv, leaf({ clientAuth: true }));
  fs.writeFileSync(path.join(dir, 'ca-cert.pem'), pki.certificateToPem(ca));
  fs.writeFileSync(path.join(dir, 'server-cert.pem'), pki.certificateToPem(srv));
  fs.writeFileSync(path.join(dir, 'server-key.pem'), srvK.pem, { mode: 0o600 });
  return { dir, at: Date.now(), ca: pki.certificateToPem(ca), cert: pki.certificateToPem(cli), key: cliK.pem }; // the client key never goes to disk
}
// Connects to a screen that wants TLS and returns the secure connection, ready for the client's own set-up (ClientInit).
function tlsUpstream(ep, creds) {
  return new Promise((ok, no) => {
    const s = connectEp(ep); let buf = Buffer.alloc(0), stage = 0, subs = 0, failed = false;
    const fail = (e) => { if (failed) return; failed = true; s.destroy(); no(e instanceof Error ? e : new Error(String(e))); };
    s.on('error', fail);
    const onData = (d) => {
      buf = Buffer.concat([buf, d]);
      try {
        if (stage === 0 && buf.length >= 12) { s.write('RFB 003.008\n'); buf = buf.subarray(12); stage = 1; }
        if (stage === 1 && buf.length >= 1) { const n = buf[0]; if (n === 0) throw new Error('The screen refused the connection.'); if (buf.length < 1 + n) return; if (![...buf.subarray(1, 1 + n)].includes(19)) throw new Error('The screen does not offer a secure login.'); s.write(Buffer.from([19])); buf = buf.subarray(1 + n); stage = 2; }
        if (stage === 2 && buf.length >= 2) { s.write(Buffer.from([0, 2])); buf = buf.subarray(2); stage = 3; }
        if (stage === 3 && buf.length >= 1) { if (buf[0] !== 0) throw new Error('The screen does not speak this secure login.'); buf = buf.subarray(1); stage = 4; }
        if (stage === 4 && buf.length >= 1) { subs = buf[0]; buf = buf.subarray(1); stage = 5; }
        if (stage === 5 && buf.length >= 4 * subs) {
          const list = []; for (let i = 0; i < subs; i++) list.push(buf.readUInt32BE(i * 4));
          if (!list.includes(260)) throw new Error('The screen wants a different secure login.');
          const b = Buffer.alloc(4); b.writeUInt32BE(260); s.write(b); buf = buf.subarray(4 * subs); stage = 6;
        }
        if (stage === 6 && buf.length >= 1) {
          if (buf[0] !== 1) throw new Error('The screen refused the secure login.');
          s.removeListener('data', onData); s.removeListener('error', fail);
          const t = require('tls').connect({ socket: s, ca: creds.ca, cert: creds.cert, key: creds.key, minVersion: 'TLSv1.2', checkServerIdentity: () => undefined });
          t.once('error', fail);
          t.once('secureConnect', () => {
            let r = Buffer.alloc(0);
            const onRes = (x) => { r = Buffer.concat([r, x]); if (r.length < 4) return; t.removeListener('data', onRes); t.removeListener('error', fail); if (r.readUInt32BE(0) !== 0) return fail(new Error('The screen refused the connection.')); if (r.length > 4) t.unshift(r.subarray(4)); ok(t); };
            t.on('data', onRes);
          });
        }
      } catch (e) { fail(e); }
    };
    s.on('data', onData);
  });
}

// QEMU's own VNC has no safe login here, so it listens on a private socket file and Wayzerr hands the screen to the window
// through this small WebSocket bridge, which only lets in a connection that knows the secret in the address.
function bridge(ep, token, creds) {
  const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
  const server = net.createServer((c) => {
    let head = Buffer.alloc(0), up = null, buf = Buffer.alloc(0);
    c.on('error', () => up?.destroy());
    c.on('close', () => up?.destroy());
    const send = (op, data) => {
      const n = data.length;
      const h = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : (() => { const b = Buffer.alloc(10); b[0] = 0x80 | op; b[1] = 127; b.writeBigUInt64BE(BigInt(n), 2); return b; })();
      c.write(Buffer.concat([h, data]));
    };
    const frames = (d) => {
      buf = Buffer.concat([buf, d]);
      for (;;) {
        if (buf.length < 2) return;
        const op = buf[0] & 15, masked = buf[1] & 128;
        let n = buf[1] & 127, o = 2;
        if (n === 126) { if (buf.length < 4) return; n = buf.readUInt16BE(2); o = 4; } else if (n === 127) { if (buf.length < 10) return; n = Number(buf.readBigUInt64BE(2)); o = 10; }
        if (buf.length < o + (masked ? 4 : 0) + n) return;
        const mask = masked ? buf.subarray(o, o + 4) : null;
        if (masked) o += 4;
        const p = Buffer.from(buf.subarray(o, o + n));
        if (mask) for (let i = 0; i < p.length; i++) p[i] ^= mask[i & 3];
        buf = buf.subarray(o + n);
        if (op === 8) { c.end(); return; }
        if (op === 9) send(10, p);
        else if (op === 1 || op === 2 || op === 0) toUp(p);
      }
    };
    let toUp = (p) => up.write(p);
    c.on('data', function first(d) {
      head = Buffer.concat([head, d]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) { if (head.length > 8192) c.destroy(); return; }
      const text = head.subarray(0, end).toString('latin1');
      const rest = head.subarray(end + 4);
      const key = /sec-websocket-key:\s*(\S+)/i.exec(text)?.[1];
      if (!key || text.split(' ')[1] !== '/' + token) { c.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return; }
      c.removeListener('data', first);
      const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
      c.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n${/binary/i.test(text) ? 'Sec-WebSocket-Protocol: binary\r\n' : ''}\r\n`);
      c.on('data', frames);
      const attach = (u) => { up = u; up.on('error', () => c.destroy()); up.on('close', () => c.destroy()); up.on('data', (x) => send(2, x)); };
      if (!creds) attach(connectEp(ep));
      else {
        // The screen wants TLS (Windows): log in to it here, so the window never needs a certificate, then tell the window "no login needed".
        let early = Buffer.alloc(0), st = 0, cb = Buffer.alloc(0);
        toUp = (p) => { early = Buffer.concat([early, p]); };
        tlsUpstream(ep, creds).then((t) => {
          attach(t);
          send(2, Buffer.from('RFB 003.008\n'));
          const fromWindow = (p) => {
            cb = Buffer.concat([cb, p]);
            if (st === 0 && cb.length >= 12) { cb = cb.subarray(12); send(2, Buffer.from([1, 1])); st = 1; }
            if (st === 1 && cb.length >= 1) { cb = cb.subarray(1); send(2, Buffer.from([0, 0, 0, 0])); st = 2; toUp = (q) => up.write(q); if (cb.length) up.write(cb); }
          };
          toUp = fromWindow;
          if (early.length) fromWindow(early);
        }).catch(() => c.destroy());
      }
      if (rest.length) frames(rest);
    });
  });
  return new Promise((ok, no) => { server.on('error', no); server.listen(0, '127.0.0.1', () => ok({ server, port: server.address().port })); });
}


// ---------- What the bots can do in their computer ----------
const XY = { x: { type: 'number', description: 'x on the latest screenshot' }, y: { type: 'number', description: 'y on the latest screenshot' } };

// The small scripts that run inside the bot's computer live in ./guest (agent, AppImage opener, download-and-run).
const guest = (n) => fs.readFileSync(path.join(__dirname, 'guest', n), 'utf8');
const shq = (v) => "'" + String(v == null ? '' : v).replace(/'/g, "'\\''") + "'";

const COMPUTER_TOOLS = [
  ['computer_start', "Turn on the computer you control and look at it (your own Linux computer turns on by itself when you use any computer tool). Returns a screenshot.", {}, []],
  ['computer_screenshot', "See the screen. All x and y values for clicks come from the LATEST screenshot.", {}, []],
  ['computer_click', 'Click once at x,y. button: left (default) or right. Returns a new screenshot with a red ring where you clicked.', { ...XY, button: { type: 'string', enum: ['left', 'right'] }, double: { type: 'boolean', description: 'same as computer_double_click' } }, ['x', 'y']],
  ['computer_double_click', 'Double-click at x,y: opens files, folders and desktop icons, selects a word. Returns a new screenshot.', XY, ['x', 'y']],
  ['computer_triple_click', 'Triple-click at x,y: selects a whole line or paragraph. Returns a new screenshot.', XY, ['x', 'y']],
  ['computer_right_click', 'Right-click at x,y to open the context menu. Returns a new screenshot.', XY, ['x', 'y']],
  ['computer_mouse_move', 'Move the pointer to x,y without clicking (hover menus and tooltips). Returns a new screenshot.', XY, ['x', 'y']],
  ['computer_type', 'Type text where the cursor is (click the field first). enter=true presses Enter afterwards. Returns a new screenshot.', { text: { type: 'string' }, enter: { type: 'boolean' } }, ['text']],
  ['computer_key', 'Press a key or shortcut, e.g. Return, Tab, Escape, BackSpace, Delete, Up, Down, Left, Right, Home, End, PageUp, PageDown, F5, ctrl+c, ctrl+l, alt+Tab; on a Mac also cmd+space, cmd+c, cmd+v, cmd+t, cmd+w, cmd+q. times repeats it. Returns a new screenshot.', { keys: { type: 'string' }, times: { type: 'integer' } }, ['keys']],
  ['computer_run', `Run a shell command on your Linux computer and get its exact text output back (no screenshot needed). This is the best way to install software (sudo apt-get install -y x; no password), download (curl -L -o file URL), read files, check things (uname -m, ls, cat) and run programs. GUI programs: add & or set background=true so it returns right away. The computer is ${process.arch === 'arm64' ? 'ARM64 (aarch64), so programs must be arm64 builds' : 'x86-64 (amd64), so programs must be x86-64 builds, not arm64'}. Files you want to keep go in your home folder; they stay between sessions.`, { command: { type: 'string' }, timeout_seconds: { type: 'integer', description: 'How long to wait for it to finish (default 60, up to 900).' }, background: { type: 'boolean', description: 'Do not wait for it to finish (for programs with a window).' } }, ['command']],
  ['computer_get_app', "Download a program or file from a web address and get it running, in ONE step with no browser clicking: it downloads to ~/Downloads, and for an AppImage it unpacks it (this computer has no FUSE), installs missing libraries and starts it; .deb files are installed; archives are unpacked. It also makes double-clicking an AppImage in the file manager work from then on. Use it whenever the user wants something downloaded and opened. Returns the result plus a screenshot.", { url: { type: 'string', description: 'full https:// address of the file' }, save_as: { type: 'string', description: 'optional file name to keep it under' } }, ['url']],
  ['computer_open', "Open a program, a file or a web address in one step, without hunting for icons: e.g. \"firefox\", \"terminal\", \"Safari\", \"https://wayzerr.com\". Returns a screenshot.", { what: { type: 'string', description: 'program name or URL' } }, ['what']],
  ['computer_scroll', 'Scroll at x,y. direction: up, down, left or right. amount = how many notches (default 5). Returns a new screenshot.', { ...XY, direction: { type: 'string', enum: ['up', 'down', 'left', 'right'] }, amount: { type: 'integer' } }, ['x', 'y', 'direction']],
  ['computer_drag', 'Drag from (x1,y1) to (x2,y2): move windows, select text, move files. Returns a new screenshot.', { x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' } }, ['x1', 'y1', 'x2', 'y2']],
  ['computer_zoom', 'Look closely at a rectangle of the screen in full detail (small text, tiny buttons). Coordinates are from the latest screenshot. Returns an enlarged picture; clicks still use screenshot coordinates.', { x1: { type: 'number' }, y1: { type: 'number' }, x2: { type: 'number' }, y2: { type: 'number' } }, ['x1', 'y1', 'x2', 'y2']],
  ['computer_wait', 'Wait a few seconds (installs, downloads, pages loading), then return a screenshot.', { seconds: { type: 'integer' } }, []],
].map(([name, description, properties, required]) => ({ name, description, parameters: { type: 'object', properties, required } }));

const KEYSYMS = { return: 0xff0d, enter: 0xff0d, tab: 0xff09, escape: 0xff1b, esc: 0xff1b, backspace: 0xff08, delete: 0xffff, del: 0xffff, up: 0xff52, down: 0xff54, left: 0xff51, right: 0xff53, home: 0xff50, end: 0xff57, pageup: 0xff55, pagedown: 0xff56, space: 0x20, shift: 0xffe1, ctrl: 0xffe3, control: 0xffe3, alt: 0xffe9, super: 0xffeb, cmd: 0xffeb, meta: 0xffeb, insert: 0xff63 };
for (let i = 1; i <= 12; i++) KEYSYMS['f' + i] = 0xffbd + i;
const symOf = (k) => { const l = k.toLowerCase(); if (KEYSYMS[l] !== undefined) return KEYSYMS[l]; const cp = k.codePointAt(0); return cp < 0x100 ? cp : 0x01000000 + cp; };

// Sends keys and mouse moves through the same private screen socket (no framebuffer needed, so nothing to decode).
async function rfbInput(ep, creds) {
  const pre = creds ? await tlsUpstream(ep, creds) : null; // (on a secure screen the set-up up to the result is done already)
  return new Promise((resolve, reject) => {
    const s = pre || connectEp(ep);
    let stage = 0, buf = Buffer.alloc(0), size = { w: 0, h: 0 };
    if (pre) { s.write(Buffer.from([1])); stage = 3; }
    s.on('error', reject);
    s.on('data', (d) => {
      buf = Buffer.concat([buf, d]);
      if (stage === 0 && buf.length >= 12) { s.write('RFB 003.008\n'); buf = buf.subarray(12); stage = 1; }
      if (stage === 1 && buf.length >= 1) { const n = buf[0]; if (buf.length < 1 + n) return; s.write(Buffer.from([1])); buf = buf.subarray(1 + n); stage = 2; }
      if (stage === 2 && buf.length >= 4) { if (buf.readUInt32BE(0) !== 0) return reject(new Error('The screen refused the connection.')); s.write(Buffer.from([1])); buf = buf.subarray(4); stage = 3; }
      if (stage === 3 && buf.length >= 24) {
        size = { w: buf.readUInt16BE(0), h: buf.readUInt16BE(2) }; buf = Buffer.alloc(0); stage = 4;
        // Without this the screen ignores every mouse click (keys work, clicks silently don't): say which picture formats we understand
        // (SetEncodings: raw, pointer-type-change, desktop-size) and ask for one picture. The answer is simply thrown away.
        const enc = [0, -257, -223], e = Buffer.alloc(4 + 4 * enc.length); e[0] = 2; e.writeUInt16BE(enc.length, 2); enc.forEach((v, i) => e.writeInt32BE(v, 4 + i * 4));
        const rq = Buffer.alloc(10); rq[0] = 3; rq[1] = 1; rq.writeUInt16BE(size.w, 6); rq.writeUInt16BE(size.h, 8);
        s.write(Buffer.concat([e, rq]));
        setTimeout(() => resolve({ sock: s, ...size }), 400);
      }
      if (stage === 4) buf = Buffer.alloc(0); // we never ask for pictures, so anything else is ignored
    });
  });
}
const pointer = (c, x, y, mask) => { c.ptr = { x, y, down: mask > 0 }; if (c.onPtr) c.onPtr(); const b = Buffer.alloc(6); b[0] = 5; b[1] = mask; b.writeUInt16BE(Math.max(0, Math.min(c.w - 1, Math.round(x))), 2); b.writeUInt16BE(Math.max(0, Math.min(c.h - 1, Math.round(y))), 4); c.sock.write(b); };
const keyEv = (c, sym, down) => { const b = Buffer.alloc(8); b[0] = 4; b[1] = down ? 1 : 0; b.writeUInt32BE(sym >>> 0, 4); c.sock.write(b); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// A red ring with a white edge around (cx, cy) on a BGRA picture.
function drawRing(px, w, h, cx, cy) {
  const R = 20;
  for (let y = Math.max(0, Math.round(cy) - R - 3); y <= Math.min(h - 1, Math.round(cy) + R + 3); y++) {
    for (let x = Math.max(0, Math.round(cx) - R - 3); x <= Math.min(w - 1, Math.round(cx) + R + 3); x++) {
      const d = Math.hypot(x - cx, y - cy), o = (y * w + x) * 4;
      if (d >= R - 1.5 && d <= R + 1.5) { px[o] = 40; px[o + 1] = 40; px[o + 2] = 255; } // red
      else if ((d >= R - 3 && d < R - 1.5) || (d > R + 1.5 && d <= R + 3)) { px[o] = 255; px[o + 1] = 255; px[o + 2] = 255; } // white edge
    }
  }
}
const NEEDS_SHIFT = /[A-Z~!@#$%^&*()_+{}|:"<>?]/;
// Types one character, holding Shift for capitals and symbols like > or ? (the emulator won't add it by itself).
async function typeChar(c, ch) {
  const sym = ch === '\n' ? 0xff0d : ch === '\t' ? 0xff09 : symOf(ch);
  const shift = NEEDS_SHIFT.test(ch);
  if (shift) keyEv(c, 0xffe1, true);
  keyEv(c, sym, true); keyEv(c, sym, false);
  if (shift) keyEv(c, 0xffe1, false);
  await sleep(14);
}

// The bots' computers run as another user, so everything in the shared folder must be readable and writable by anyone.
function openUp(root) {
  let left = 4000;
  const walk = (d, depth) => {
    try { fs.chmodSync(d, 0o777); } catch (_) { return; }
    if (depth > 6) return;
    let list = []; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch (_) {}
    for (const e of list) {
      if (--left < 0) return;
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(p, depth + 1); else { try { fs.chmodSync(p, 0o666); } catch (_) {} }
    }
  };
  walk(root, 0);
}

module.exports = function createComputers({ dir, feedUrl, sharedDir, log = () => {}, onPointer = () => {} }) {
  const engineDir = path.join(dir, 'engine');
  const baseFile = path.join(dir, 'base.qcow2');
  const diskDir = path.join(dir, 'disks');
  const lastUse = new Map(); // botId -> when a bot (or you) last used its computer
  const IDLE_MS = 10 * 60 * 1000;
  const running = new Map(); // botId -> { proc, info, bridge, sock }
  const onPath = (n) => (process.env.PATH || '/usr/bin:/usr/local/bin').split(path.delimiter).concat(['/usr/bin', '/usr/local/bin']).map((d) => path.join(d, n)).find((f) => { try { fs.accessSync(f, fs.constants.X_OK); return true; } catch (_) { return false; } }) || '';
  const QEMU = (LINUX && !ARM) || WIN ? 'qemu-system-x86_64' : 'qemu-system-aarch64';
  const exeName = (n) => (WIN && !/\.exe$/i.test(n) ? n + '.exe' : n);
  const TAR = WIN ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar'; // (not a Git-for-Windows tar: it takes C: for a remote machine)
  const bin = (n) => (LINUX ? onPath(n) || n : path.join(engineDir, 'bin', exeName(n)));
  const have = () => (LINUX ? !!onPath(QEMU) && !!onPath('qemu-img') && (!ARM || !!armFirmware()) : fs.existsSync(bin(QEMU)) && fs.existsSync(bin('qemu-img')));
  const haveBase = () => fs.existsSync(baseFile);
  const safe = (id) => String(id).replace(/[^\w-]/g, '');
  const run = (file, args) => new Promise((res, rej) => execFile(file, args, { maxBuffer: 1 << 24 }, (e, so, se) => (e ? rej(new Error(se || e.message)) : res(so))));

  let lastPlan = null;
  async function manifest() {
    const r = await fetch(feedUrl, { cache: 'no-store' });
    if (!r.ok) throw new Error('Could not reach the update server.');
    const all = (await r.json()).computer || {};
    // An ARM Linux PC runs the very same ARM system as the Mac (only the virtual machine program differs), so it needs no copy of its own
    const m = all[KEY] || (KEY === 'linux-arm64' && all['darwin-arm64'] ? { base: all['darwin-arm64'].base } : null);
    if (!m) throw new Error('Computers are not available for this system yet.');
    return { m, origin: new URL(feedUrl).origin };
  }

  // Downloads to a .part file (appending when it is one piece of a bigger file), checks size and sha256, then moves it into place.
  async function fetchFile(url, want, to, onProgress, { append = false, last = true, base = 0, total = want.size } = {}) {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    const part = to + '.part';
    const r = await fetch(url);
    if (!r.ok || !r.body) throw new Error(`Download failed (${r.status}).`);
    const h = crypto.createHash('sha256');
    const out = fs.createWriteStream(part, { flags: append ? 'a' : 'w' });
    let got = 0;
    for await (const chunk of r.body) {
      h.update(chunk);
      got += chunk.length;
      if (!out.write(chunk)) await new Promise((ok) => out.once('drain', ok));
      onProgress?.(base + got, total);
    }
    await new Promise((ok, no) => out.end((e) => (e ? no(e) : ok())));
    if (got !== want.size || h.digest('hex') !== want.sha256) { fs.rmSync(part, { force: true }); throw new Error('The download was damaged. Try again.'); }
    if (last) fs.renameSync(part, to);
  }

  // What is still to be downloaded, so the app can say so (and why) before anything is fetched.
  async function plan() {
    if (!SUPPORTED.has(KEY)) return null;
    const { m } = await manifest();
    const engine = LINUX || have() ? 0 : m.engine.size, base = haveBase() ? 0 : m.base.size;
    return (lastPlan = { engine, base, total: engine + base, unpacked: m.base.unpacked || 0, have: have() && haveBase(), needsQemu: LINUX && !have(), qemuHint: QEMU_HINT, slow: isSlow() });
  }
  const setup = { active: false, step: '', done: 0, total: 0, error: '' };
  async function install(onProgress) {
    if (!SUPPORTED.has(KEY)) throw new Error('Computers are not available for this system yet.');
    const { m, origin } = await manifest();
    if (!LINUX && !have()) {
      const tgz = path.join(dir, 'engine.tar.gz');
      await fetchFile(`${origin}/${m.engine.url}`, m.engine, tgz, (a, b) => onProgress?.({ step: 'engine', done: a, total: b }));
      fs.rmSync(engineDir, { recursive: true, force: true });
      fs.mkdirSync(engineDir, { recursive: true });
      await run(TAR, ['-xzf', tgz, '-C', engineDir]);
      fs.rmSync(tgz, { force: true });
    }
    if (!haveBase()) {
      fs.rmSync(baseFile + '.part', { force: true });
      let done = 0;
      for (const [i, p] of m.base.parts.entries()) {
        await fetchFile(`${origin}/${p.url}`, p, baseFile, (a, b) => onProgress?.({ step: 'system', done: a, total: b }), { append: i > 0, last: i === m.base.parts.length - 1, base: done, total: m.base.size });
        done += p.size;
      }
    }
    return status();
  }

    // Downloads the engine and system in the background, once, so every bot's computer is ready when it is needed.
  async function ensure(onProgress) {
    if (setup.active || !SUPPORTED.has(KEY) || (LINUX ? haveBase() : have() && haveBase())) return status();
    setup.active = true; setup.error = '';
    try { await install((p) => { Object.assign(setup, p); onProgress?.(p); }); } catch (e) { setup.error = e.message; log('computer setup', e.message); } finally { setup.active = false; }
    probeWhpx();
    return status();
  }

  // Only one start per computer at a time (the bot and the Computer box can both ask), and any copy left
  // over from before an update/crash is closed first: two copies must never open the same disk.
  const starting = new Map();
  function start(botId) {
    const id = safe(botId);
    lastUse.set(id, Date.now());
    if (running.has(id)) return Promise.resolve(running.get(id).info);
    if (!starting.has(id)) starting.set(id, startOnce(id).finally(() => starting.delete(id)));
    return starting.get(id);
  }
  async function killLeftover(id) {
    const f = path.join(diskDir, id + '.pid');
    let pid = 0; try { pid = parseInt(fs.readFileSync(f, 'utf8'), 10); } catch (_) {}
    if (pid > 1) {
      let cmd = ''; try { cmd = WIN ? await run('tasklist', ['/FI', `PID eq ${pid}`, '/NH', '/FO', 'CSV']) : await run('/bin/ps', ['-p', String(pid), '-o', 'command=']); } catch (_) {}
      if (/qemu-system/i.test(cmd) && (WIN || cmd.includes(id + '.qcow2'))) {
        try { process.kill(pid, 'SIGTERM'); } catch (_) {}
        for (let i = 0; i < 20; i++) { await sleep(250); try { process.kill(pid, 0); } catch (_) { break; } }
        try { process.kill(pid, 'SIGKILL'); } catch (_) {}
      }
    }
    fs.rmSync(f, { force: true });
  }
  async function startOnce(id) {
    if (LINUX && !have()) throw new Error('Wayzerr needs the virtual machine program (QEMU) for the bot computer. Install it once with: ' + QEMU_HINT);
    if (!haveBase() || (!LINUX && !have())) throw new Error('The computer is not installed yet: open the Screen panel, choose Computer and press Download.');
    if (WIN) { probeWhpx(); for (let i = 0; i < 24 && whpxOk === null; i++) await sleep(250); }
    const slow = isSlow(); // no KVM / Windows virtualization (or testing): the computer runs in software, which works but is slow
    fs.mkdirSync(diskDir, { recursive: true });
    const disk = path.join(diskDir, id + '.qcow2');
    await killLeftover(id);
    // each bot's disk only stores what that bot changes; the shared base stays untouched
    if (!fs.existsSync(disk)) await run(bin('qemu-img'), ['create', '-f', 'qcow2', '-b', baseFile, '-F', 'qcow2', disk, '24G']);
    else await run(bin('qemu-img'), ['rebase', '-u', '-F', 'qcow2', '-b', baseFile, disk]).catch(() => {}); // the app folder may have moved (Wayzerr → Wayzerr)
    const token = crypto.randomBytes(16).toString('hex');
    const sock = path.join(os.tmpdir(), `wzr-${crypto.randomBytes(4).toString('hex')}.sock`);
    const qp = (f) => f.replace(/,/g, ',,'); // a comma in a path must be doubled for QEMU
    const share = sharedDir || path.join(dir, 'shared');
    fs.mkdirSync(share, { recursive: true });
    openUp(share);
    const fsArgs = NET9P && process.env.WAYZERR_NO_VIRTIO9P ? [] : ['-fsdev', `local,id=share,path=${share},security_model=none`, '-device', 'virtio-9p-pci,fsdev=share,mount_tag=wayzerr']; // (the folder is shared directly, except on Windows; the override only tests the network folder on Linux)
    // The screen and the monitor: private socket files on Mac and Linux; on Windows a private local port protected with TLS, and a named pipe.
    let vncEp = sock, vncCreds = null, vncArgs = ['-vnc', `unix:${sock}`], monEp = sock + '.mon', monArgs = ['-monitor', `unix:${sock}.mon,server,nowait`], netArgs = [];
    if (TCPVNC) {
      const port = await freePort(); if (!port) throw new Error('No free port for the computer screen.');
      if (tlsCreds && Date.now() - tlsCreds.at > 7 * 86400e3) tlsCreds = null; // the certificates last 30 days
      vncCreds = tlsCreds ||= makeCreds(path.join(dir, 'tls'));
      vncEp = { port }; vncArgs = ['-object', `tls-creds-x509,id=tls0,endpoint=server,dir=${qp(vncCreds.dir)},verify-peer=yes`, '-vnc', `127.0.0.1:${port - 5900},tls-creds=tls0`];
    }
    if (WIN) { const pipe = `wzr-mon-${crypto.randomBytes(4).toString('hex')}`; monEp = '\\\\.\\pipe\\' + pipe; monArgs = ['-chardev', `pipe,id=mon0,path=${pipe}`, '-mon', 'chardev=mon0,mode=readline']; }
    if (NET9P) { const s9 = await startP9(share); netArgs = ['-fw_cfg', `name=opt/wayzerr/9p,string=${s9.port}:${s9.secret}`]; } // how the computer finds the shared folder (see p9.js)
    const fw = LINUX && ARM ? armFirmware() : '';
    const fwArgs = !fw ? [] : fs.statSync(fw).size >= 32 * 1024 * 1024 ? ['-drive', `if=pflash,format=raw,readonly=on,file=${fw}`, '-drive', `if=pflash,format=raw,file=${await vars(id)}`] : ['-bios', fw];
    const args = WIN ? [
      '-L', path.join(engineDir, 'share/qemu'),
      '-machine', 'q35', ...(slow ? ['-accel', 'tcg,thread=multi'] : ['-accel', 'whpx,kernel-irqchip=off', '-accel', 'tcg,thread=multi']), '-cpu', 'qemu64,+ssse3,+sse4.1,+sse4.2,+popcnt', '-smp', '2', '-m', slow ? '2048' : '3072',
      '-drive', `file=${qp(disk)},if=virtio,format=qcow2`,
      '-device', 'virtio-vga', '-device', 'qemu-xhci', '-device', 'usb-kbd', '-device', 'usb-tablet',
      '-netdev', 'user,id=n0', '-device', 'virtio-net-pci,netdev=n0',
      '-display', 'none', ...vncArgs, ...monArgs, ...netArgs,
    ] : LINUX && ARM ? [
      '-machine', slow ? 'virt' : 'virt,gic-version=host', ...(slow ? ['-accel', 'tcg', '-cpu', 'cortex-a72'] : ['-accel', 'kvm', '-cpu', 'host']), '-smp', '2', '-m', slow ? '2048' : '3072',
      ...fwArgs,
      '-drive', `file=${disk},if=virtio,format=qcow2`,
      '-device', 'virtio-gpu-pci', '-device', 'qemu-xhci', '-device', 'usb-kbd', '-device', 'usb-tablet',
      '-netdev', 'user,id=n0', '-device', 'virtio-net-pci,netdev=n0',
      ...fsArgs,
      '-display', 'none', ...vncArgs, ...monArgs, ...netArgs,
    ] : LINUX ? [
      '-machine', 'q35', ...(slow ? ['-accel', 'tcg', '-cpu', 'max'] : ['-accel', 'kvm', '-cpu', 'host']), '-smp', '2', '-m', slow ? '2048' : '3072',
      '-drive', `file=${disk},if=virtio,format=qcow2`,
      '-device', 'virtio-vga', '-device', 'qemu-xhci', '-device', 'usb-kbd', '-device', 'usb-tablet',
      '-netdev', 'user,id=n0', '-device', 'virtio-net-pci,netdev=n0',
      ...fsArgs,
      '-display', 'none', ...vncArgs, ...monArgs, ...netArgs,
    ] : [
      '-L', path.join(engineDir, 'share/qemu'),
      '-machine', 'virt,highmem=on', '-accel', 'hvf', '-cpu', 'host', '-smp', '2', '-m', '3072',
      '-drive', `if=pflash,format=raw,readonly=on,file=${path.join(engineDir, 'share/qemu/edk2-aarch64-code.fd')}`,
      '-drive', `if=pflash,format=raw,file=${await vars(id)}`,
      '-drive', `file=${disk},if=virtio,format=qcow2`,
      '-device', 'virtio-gpu-pci', '-device', 'qemu-xhci', '-device', 'usb-kbd', '-device', 'usb-tablet',
      '-netdev', 'user,id=n0', '-device', 'virtio-net-pci,netdev=n0',
      ...fsArgs,
      '-display', 'none', ...vncArgs, ...monArgs, ...netArgs,
    ];
    const proc = spawn(bin(QEMU), args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let err = '';
    try { fs.writeFileSync(path.join(diskDir, id + '.pid'), String(proc.pid)); } catch (_) {}
    proc.stderr.on('data', (d) => { err += d; });
    proc.on('exit', (code) => { const r = running.get(id); running.delete(id); inputs.get(id)?.sock.destroy(); inputs.delete(id); r?.bridge.server.close(); try { r?.monConn?.destroy(); } catch (_) {} fs.rmSync(sock, { force: true }); fs.rmSync(sock + '.mon', { force: true }); fs.rmSync(path.join(diskDir, id + '.pid'), { force: true }); if (code) log('computer exited', code, err.slice(-500)); });
    await new Promise((ok) => setTimeout(ok, 2000));
    if (proc.exitCode !== null) throw new Error('The computer would not start: ' + (err.trim().split('\n').pop() || 'unknown error'));
    const b = await bridge(vncEp, token, vncCreds);
    const info = { running: true, port: b.port, token };
    running.set(id, { proc, info, bridge: b, vncEp, vncCreds, monEp, monConn: null, sock, slow });
    return info;
  }

  async function vars(id) { // each computer keeps its own firmware settings
    const f = path.join(dir, 'disks', id + '.vars.fd');
    if (!fs.existsSync(f)) { const fd = fs.openSync(f, 'w'); fs.ftruncateSync(fd, 64 * 1024 * 1024); fs.closeSync(fd); } // sparse: takes no real space
    return f;
  }

  // Sends one command to the emulator's monitor. On Mac and Linux each command uses a short connection; on Windows (a named pipe that
  // takes one connection at a time) one connection is kept open per computer.
  const monLine = (r, line) => new Promise((ok, no) => {
    if (!WIN) { const m = net.connect(r.monEp); m.on('error', no); m.on('connect', () => { m.write(line + '\n'); setTimeout(() => { m.destroy(); ok(); }, 300); }); return; }
    const send = () => { r.monConn.write(line + '\n'); setTimeout(ok, 300); };
    if (r.monConn && !r.monConn.destroyed) return send();
    const m = net.connect(r.monEp);
    m.on('error', (e) => { if (r.monConn === m) r.monConn = null; no(e); });
    m.on('close', () => { if (r.monConn === m) r.monConn = null; });
    m.on('data', () => {}); // the monitor's answers are not needed
    m.on('connect', () => { r.monConn = m; send(); });
  });

  function stop(botId) {
    const r = running.get(safe(botId));
    if (r) { // ask the guest to shut down like a power button, then force it off if it takes too long
      monLine(r, 'system_powerdown').catch(() => {});
      setTimeout(() => { try { r.proc.kill(); } catch (_) {} }, 10000); }
  }
  const stopAll = () => { for (const r of running.values()) try { r.proc.kill(); } catch (_) {} };
  // Quitting (or updating) must not lose what a bot downloaded or saved: ask every computer to shut down properly first,
  // so the system writes its files to disk, and only force it off if it takes too long.
  const shutdownAll = (ms = 9000) => new Promise((done) => {
    const list = [...running.values()];
    if (!list.length) return done();
    for (const r of list) monLine(r, 'system_powerdown').catch(() => {});
    const t0 = Date.now(), tick = setInterval(() => { if (!running.size || Date.now() - t0 > ms) { clearInterval(tick); stopAll(); try { p9?.srv.close(); } catch (_) {} setTimeout(done, 300); } }, 250);
  });
  const remove = (botId) => { stop(botId); const id = safe(botId); for (const f of [id + '.qcow2', id + '.vars.fd']) fs.rmSync(path.join(diskDir, f), { force: true }); };

  function status(botId) {
    const r = botId && running.get(safe(botId));
    const diskSize = botId && fs.existsSync(path.join(diskDir, safe(botId) + '.qcow2')) ? fs.statSync(path.join(diskDir, safe(botId) + '.qcow2')).size : 0;
    return { supported: SUPPORTED.has(KEY), system: KEY, engine: have(), needsQemu: LINUX && !have(), base: haveBase(), running: !!r, slow: isSlow(), qemuHint: QEMU_HINT, whpx: WIN ? whpxOk : undefined, ...(r ? { port: r.info.port, token: r.info.token } : {}), diskSize, setup: { ...setup } };
  }


  // Windows: the shared folder is served from here to the bots' computers (they mount it over the network, see p9.js)
  let p9 = null, tlsCreds = null;
  async function startP9(share) {
    if (p9 && p9.share === share) return p9;
    try { p9?.srv.close(); } catch (_) {}
    const secret = crypto.randomBytes(12).toString('hex');
    const srv = require('./p9')({ root: share, secret, log });
    const { port } = await srv.listen(0);
    return (p9 = { srv, port, secret, share });
  }
  // Windows: asks QEMU once whether this PC lets it use Windows' own virtualization (the "Windows Hypervisor Platform" feature).
  let probing = false;
  function probeWhpx() {
    if (!WIN || probing || whpxOk !== null || !have()) return;
    probing = true;
    let err = '';
    const p = spawn(bin(QEMU), ['-L', path.join(engineDir, 'share/qemu'), '-accel', 'whpx', '-machine', 'q35', '-m', '64', '-display', 'none', '-S', '-nodefaults'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    p.stderr.on('data', (d) => { err += d; });
    const t = setTimeout(() => { if (whpxOk === null) whpxOk = true; probing = false; try { p.kill(); } catch (_) {} }, 4000);
    p.on('exit', () => { clearTimeout(t); if (whpxOk === null) { whpxOk = false; log('computer: Windows virtualization is not available:', err.trim().split('\n').pop()); } probing = false; });
    p.on('error', (e) => { clearTimeout(t); probing = false; log('computer: could not check Windows virtualization:', e.message); });
  }

  // --- control ---
  const inputs = new Map(); // botId -> connection to the screen socket
  async function input(id) {
    const r = running.get(id);
    if (!r) throw new Error("Your computer is off.");
    let c = inputs.get(id);
    if (!c || c.sock.destroyed) { c = await rfbInput(r.vncEp, r.vncCreds); c.sock.on('close', () => inputs.delete(id)); c.onPtr = () => { try { onPointer({ personaId: id, x: c.ptr.x, y: c.ptr.y, w: c.w, h: c.h, down: c.ptr.down }); } catch (_) {} }; inputs.set(id, c); }
    return c;
  }
  const monitor = (id, line) => new Promise((ok, no) => { const r = running.get(id); if (!r) return no(new Error('Your computer is off.')); monLine(r, line).then(ok, no); });

  // A picture of the screen, scaled to at most 1024 wide (clicks are scaled back up). Taken by the emulator itself.
  async function screenshot(id) {
    const { nativeImage } = require('electron');
    const file = path.join(os.tmpdir(), `wzr-shot-${crypto.randomBytes(4).toString('hex')}.ppm`);
    await monitor(id, WIN ? `screendump "${file.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : `screendump ${file}`); // (the monitor wants a quoted path with doubled backslashes; a Windows user name can have a space)
    let buf = null;
    for (let i = 0; i < 20 && !buf; i++) { try { const b = fs.readFileSync(file); if (b.length > 20) buf = b; } catch (_) {} if (!buf) await sleep(150); }
    fs.rmSync(file, { force: true });
    if (!buf) throw new Error("Couldn't see the screen.");
    const m = /^P6\s+(\d+)\s+(\d+)\s+255\s/.exec(buf.subarray(0, 40).toString('latin1'));
    if (!m) throw new Error("Couldn't read the screen.");
    const w = +m[1], h = +m[2], off = m[0].length, bgra = Buffer.alloc(w * h * 4);
    for (let i = 0, j = off; i < w * h; i++, j += 3) { bgra[i * 4] = buf[j + 2]; bgra[i * 4 + 1] = buf[j + 1]; bgra[i * 4 + 2] = buf[j]; bgra[i * 4 + 3] = 255; }
    const rec = shots.get(id) || {}; rec.bgra = bgra; rec.w = w; rec.h = h;
    let shown = bgra;
    if (rec.mark) { shown = Buffer.from(bgra); drawRing(shown, w, h, rec.mark.x, rec.mark.y); rec.mark = null; } // a red ring: "this is where you clicked"
    let img = nativeImage.createFromBitmap(shown, { width: w, height: h });
    const sw = Math.min(1024, w);
    if (sw < w) img = img.resize({ width: sw });
    const sz = img.getSize();
    rec.scale = w / sz.width; shots.set(id, rec);
    return { image: 'data:image/jpeg;base64,' + img.toJPEG(72).toString('base64'), width: sz.width, height: sz.height };
  }
  const shots = new Map();
  // Wait until the desktop is really showing (not a black screen), then a moment for the panel and icons to settle.
  async function waitScreen(id) {
    const t0 = Date.now();
    const limit = running.get(id)?.slow ? 900000 : 50000; // in slow (software) mode the desktop can take many minutes
    while (Date.now() - t0 < limit) {
      await sleep(2500);
      try {
        await screenshot(id);
        // The desktop is up when its light panel bar is showing along the top (a boot logo or a black screen never has one).
        const { bgra, w } = shots.get(id); let bright = 0, n = 0;
        for (let y = 4; y < 16; y += 4) for (let x = 0; x < w; x += 9) { n++; const o = (y * w + x) * 4; if (bgra[o] + bgra[o + 1] + bgra[o + 2] > 600) bright++; }
        if (n && bright / n > 0.5) break;
      } catch (_) { /* not ready yet */ }
    }
    await sleep(2500);
  }
  const seen = async (id, note, delay = 700) => { await sleep(delay); const s = await screenshot(id); return { text: `${note} The screen is ${s.width}x${s.height}; x and y are measured on the screenshot below.`, image: s.image }; };
  const scaleOf = (id) => shots.get(id)?.scale || 1;


  // Types saved logins / card details into the field that has the cursor. The text never goes through the AI.
  async function fill(botId, items, submit) {
    const id = safe(botId); const c = await input(id);
    const type = async (s) => { for (const ch of String(s)) await typeChar(c, ch); };
    const tap = async (sym) => { keyEv(c, sym, true); keyEv(c, sym, false); await sleep(80); };
    for (const [i, s] of items.entries()) { if (i) await tap(0xff09); await type(s); }
    if (submit) await tap(0xff0d);
    await sleep(500);
  }
  // A small picture for the Screen panel.
  async function thumb(botId) {
    const id = safe(botId); if (!running.has(id)) return null;
    const { nativeImage } = require('electron');
    const s = await screenshot(id);
    return nativeImage.createFromDataURL(s.image).resize({ width: 520 }).toDataURL();
  }

  const altF2 = async (c) => { keyEv(c, 0xffe9, true); keyEv(c, 0xffbf, true); await sleep(40); keyEv(c, 0xffbf, false); keyEv(c, 0xffe9, false); await sleep(2000); };
  const onProgress = () => {};
  // A small helper inside the computer runs commands from the shared folder, so nothing flashes on screen and nothing depends on a dialog
  // appearing in time. It starts by itself at login; the first time it is started by typing one line into the Run dialog (alt+F2).
  const agentSeen = new Map(); // botId -> when the helper last answered
  async function ensureAgent(id, c, wz) {
    if (Date.now() - (agentSeen.get(id) || 0) < 20000) return true;
    const hb = path.join(wz, 'hb');
    const readHb = () => { try { return fs.readFileSync(hb, 'utf8').trim(); } catch (_) { return null; } };
    // the helper writes a counter that keeps going up; if it changes, the helper is alive (clocks between the Mac and the computer are not compared)
    const alive = async (ms) => { const a = readHb(), t0 = Date.now(); while (Date.now() - t0 < ms) { await sleep(300); const b = readHb(); if (b && b !== a) { agentSeen.set(id, Date.now()); return true; } } return false; };
    const put = (n, mode = 0o755) => { fs.writeFileSync(path.join(wz, n), guest(n), { mode }); try { fs.chmodSync(path.join(wz, n), mode); } catch (_) {} };
    fs.mkdirSync(wz, { recursive: true }); put('agent.sh'); put('install-agent.sh'); put('wz-appimage.sh'); put('watch.sh');
    if (await alive(2500)) return true;
    if (await alive(running.get(id)?.slow ? 420000 : LINUX ? 15000 : 5000)) return true; // it starts by itself a moment after login (much later in slow mode)
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) { keyEv(c, 0xff1b, true); keyEv(c, 0xff1b, false); await sleep(300); keyEv(c, 0xff1b, true); keyEv(c, 0xff1b, false); await sleep(600); }
      await altF2(c);
      for (const ch of 'bash /mnt/shared/.wz/install-agent.sh') await typeChar(c, ch);
      await sleep(900); keyEv(c, 0xff0d, true); keyEv(c, 0xff0d, false);
      if (await alive(9000)) return true;
    }
    return false;
  }

  async function act(botId, name, args = {}) {
    const id = safe(botId);
    // Every tool turns the computer on if it is off; it turns itself off again after a while without use.
    const st = status(id);
    if (!st.supported) throw new Error('Computers are not available on this system yet.');
    if (!st.engine || !st.base) throw new Error(setup.active ? `Your computer is still being downloaded (${setup.total ? Math.round((setup.done / setup.total) * 100) : 0}%). Tell the user it will be ready in a few minutes; until then use your browser or other tools.` : `Your computer is not installed on this Mac yet. Tell the user: open the Screen panel (the monitor button), choose Computer and press Download (one time, about ${lastPlan ? (lastPlan.total / 1e9).toFixed(1) : '1'} GB). Do not claim you used a computer. If there is another way to do the task (your browser, search, other tools) do that now.`);
    lastUse.set(id, Date.now());
    let justStarted = false;
    if (!running.has(id)) { await start(id); await waitScreen(id); justStarted = true; } // the first picture takes up to half a minute
    if (name === 'computer_start') return seen(id, running.has(id) ? 'Your computer is on.' : 'Your computer did not start.', 500);
    if (name === 'computer_screenshot') { const s = await screenshot(id); return { text: `The screen is ${s.width}x${s.height}.`, image: s.image }; }
    const c = await input(id);
    const k = scaleOf(id);
    const clickLike = { computer_click: [args.button === 'right' ? 4 : 1, args.double ? 2 : 1], computer_double_click: [1, 2], computer_triple_click: [1, 3], computer_right_click: [4, 1] }[name];
    if (clickLike) {
      const x = +args.x * k, y = +args.y * k, [btn, times] = clickLike;
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('Give x and y from the latest screenshot.');
      pointer(c, x, y, 0); await sleep(120); // arrive first, then press: the desktop needs to see the pointer on the target
      for (let i = 0; i < times; i++) { pointer(c, x, y, btn); await sleep(50); pointer(c, x, y, 0); await sleep(times > 1 ? 70 : 90); }
      (shots.get(id) || shots.set(id, {}).get(id)).mark = { x, y };
      return seen(id, times === 3 ? 'Triple-clicked.' : times === 2 ? 'Double-clicked.' : btn === 4 ? 'Right-clicked.' : 'Clicked.');
    }
    if (name === 'computer_mouse_move') {
      const x = +args.x * k, y = +args.y * k;
      pointer(c, x, y, 0); await sleep(150);
      (shots.get(id) || shots.set(id, {}).get(id)).mark = { x, y };
      return seen(id, 'Moved the pointer.', 500);
    }
    if (name === 'computer_zoom') {
      const rec = shots.get(id);
      if (!rec || !rec.bgra) throw new Error('Take a screenshot first.');
      const [x1, y1, x2, y2] = [args.x1, args.y1, args.x2, args.y2].map((v) => +v * k);
      const X = Math.max(0, Math.floor(Math.min(x1, x2))), Y = Math.max(0, Math.floor(Math.min(y1, y2))), W = Math.min(rec.w - X, Math.ceil(Math.abs(x2 - x1))), H = Math.min(rec.h - Y, Math.ceil(Math.abs(y2 - y1)));
      if (W < 8 || H < 8) throw new Error('That area is too small to zoom into.');
      const { nativeImage } = require('electron');
      let img = nativeImage.createFromBitmap(rec.bgra, { width: rec.w, height: rec.h }).crop({ x: X, y: Y, width: W, height: H });
      if (W < 900) img = img.resize({ width: Math.min(1400, W * 3) });
      return { text: `Zoomed in on that area (${Math.round(W / k)}x${Math.round(H / k)} on the screenshot). Click using the normal screenshot coordinates.`, image: 'data:image/jpeg;base64,' + img.toJPEG(80).toString('base64') };
    }
    if (name === 'computer_run' || name === 'computer_get_app' || name === 'computer_open') {
      const isGet = name === 'computer_get_app', isOpen = name === 'computer_open';
      let cmd;
      if (isGet) {
        const u = String(args.url || '').trim();
        if (!/^https?:\/\//i.test(u)) throw new Error('Give the full web address (starting with https://) of the file to download.');
        cmd = `export WZ_URL=${shq(u)} WZ_NAME=${shq(args.save_as || '')}\n${guest('get-app.sh')}`;
      } else if (isOpen) {
        const w = String(args.what || '').trim();
        if (!w) throw new Error('Say what to open.');
        cmd = `export WZ_WHAT=${shq(w)}\n${guest('open.sh')}`;
      } else cmd = String(args.command || '').trim();
      if (!cmd) throw new Error('Give a command.');
      const share = sharedDir || path.join(dir, 'shared'), wz = path.join(share, '.wz');
      fs.mkdirSync(path.join(wz, 'q'), { recursive: true }); try { fs.chmodSync(wz, 0o777); fs.chmodSync(path.join(wz, 'q'), 0o777); } catch (_) {}
      for (const f of fs.readdirSync(wz)) { try { if (/^(run|out|done)-/.test(f) && Date.now() - fs.statSync(path.join(wz, f)).mtimeMs > 3600e3) fs.rmSync(path.join(wz, f), { force: true }); } catch (_) {} } // old runs
      const tag = crypto.randomBytes(3).toString('hex'), g = `/mnt/shared/.wz`;
      const script = `#!/bin/bash\nexec > ${g}/out-${tag}.txt 2>&1\ntrap 'echo $? > ${g}/done-${tag}' EXIT\nexport DISPLAY=:0\ncd ~\n${cmd}\n`;
      const via = await ensureAgent(id, c, wz);
      const doneF = path.join(wz, `done-${tag}`), outF = path.join(wz, `out-${tag}.txt`);
      if (via) { fs.writeFileSync(path.join(wz, 'q', `run-${tag}.sh`), script, { mode: 0o666 }); try { fs.chmodSync(path.join(wz, 'q', `run-${tag}.sh`), 0o666); } catch (_) {} }
      if (via && isGet) { const w = path.join(wz, 'q', `run-${tag}w.sh`); fs.writeFileSync(w, `export DISPLAY=:0\nsetsid nohup xfce4-terminal --geometry=84x9+20+60 --title='Wayzerr: getting the app' -x bash ${g}/watch.sh ${tag} >/dev/null 2>&1 &\n`, { mode: 0o666 }); try { fs.chmodSync(w, 0o666); } catch (_) {} }
      else { // no helper could be started: type the command into the Run dialog (alt+F2) the old way
        fs.writeFileSync(path.join(wz, `run-${tag}.sh`), script, { mode: 0o666 }); try { fs.chmodSync(path.join(wz, `run-${tag}.sh`), 0o666); } catch (_) {}
        await altF2(c); for (const ch of `bash ${g}/run-${tag}.sh`) await typeChar(c, ch);
        await sleep(900); keyEv(c, 0xff0d, true); keyEv(c, 0xff0d, false);
      }
      const read = () => { try { const t = fs.readFileSync(outF, 'utf8'); return t.length > 6000 ? '…(earlier output cut)\n' + t.slice(-6000) : t; } catch (_) { return ''; } };
      if (isOpen) { for (let i = 0; i < 16 && !fs.existsSync(doneF); i++) await sleep(250); return seen(id, `Opened "${String(args.what).trim()}".`, 3000); }
      if (args.background) { await sleep(2500); return seen(id, `Started: ${cmd.slice(0, 80)}.${read() ? '\nOutput so far:\n' + read() : ''}`, 500); }
      const limit = Math.min(900, Math.max(5, isGet ? 600 : args.timeout_seconds || 60)) * 1000, t0 = Date.now();
      let nextShot = Date.now() + 20000;
      while (Date.now() - t0 < limit && !fs.existsSync(doneF)) { lastUse.set(id, Date.now()); await sleep(500); if (isGet && Date.now() > nextShot) { nextShot = Date.now() + 20000; onProgress(id, read()); } }
      const out = read();
      if (!fs.existsSync(doneF)) return isGet ? seen(id, `Still working after ${Math.round(limit / 1000)} s. Output so far:\n${out || '(none)'}`, 500) : { text: `Still running after ${Math.round(limit / 1000)} s. Output so far:\n${out || '(none)'}\nCheck again later with computer_run (for example: cat ${g}/out-${tag}.txt).` };
      const code = String(fs.readFileSync(doneF, 'utf8')).trim();
      if (isGet) return seen(id, `Exit code ${code}.${out ? '\n' + out : ''}`, 1500);
      return { text: `Exit code ${code}.${out ? '\n' + out : '\n(no output)'}` };
    }
    if (name === 'computer_type') {
      for (const ch of String(args.text || '')) await typeChar(c, ch);
      if (args.enter) { keyEv(c, 0xff0d, true); keyEv(c, 0xff0d, false); }
      return seen(id, 'Typed.', Math.min(5000, 700 + String(args.text || '').length * 25)); // the guest reads keys more slowly than they are sent
    }
    if (name === 'computer_key') {
      const parts = String(args.keys || '').split('+').map((p) => p.trim()).filter(Boolean);
      if (!parts.length) throw new Error('No keys given.');
      const syms = parts.map(symOf);
      for (let n = 0; n < Math.min(20, args.times || 1); n++) { syms.forEach((s) => keyEv(c, s, true)); await sleep(30); [...syms].reverse().forEach((s) => keyEv(c, s, false)); await sleep(60); }
      return seen(id, 'Pressed ' + parts.join('+') + '.');
    }
    if (name === 'computer_scroll') {
      const x = +args.x * k, y = +args.y * k, bit = { up: 8, down: 16, left: 32, right: 64 }[args.direction];
      if (!bit) throw new Error('direction must be up, down, left or right.');
      pointer(c, x, y, 0);
      for (let i = 0; i < Math.min(30, args.amount || 5); i++) { pointer(c, x, y, bit); pointer(c, x, y, 0); await sleep(25); }
      return seen(id, 'Scrolled.');
    }
    if (name === 'computer_drag') {
      const [x1, y1, x2, y2] = [args.x1, args.y1, args.x2, args.y2].map((v) => +v * k);
      pointer(c, x1, y1, 0); await sleep(60); pointer(c, x1, y1, 1); await sleep(80);
      for (let i = 1; i <= 8; i++) { pointer(c, x1 + ((x2 - x1) * i) / 8, y1 + ((y2 - y1) * i) / 8, 1); await sleep(25); }
      pointer(c, x2, y2, 0);
      return seen(id, 'Dragged.');
    }
    if (name === 'computer_wait') { await sleep(Math.min(60, Math.max(1, args.seconds || 5)) * 1000); const s = await screenshot(id); return { text: 'Waited.', image: s.image }; }
    throw new Error('Unknown computer tool');
  }

  // How much room the computers take on this machine (the engine, the shared system and every bot's own disk).
  function dirSize(d, depth = 0) {
    let n = 0, list = [];
    try { list = fs.readdirSync(d, { withFileTypes: true }); } catch (_) { return 0; }
    for (const e of list) {
      const p = path.join(d, e.name);
      try { if (e.isDirectory()) n += depth < 8 ? dirSize(p, depth + 1) : 0; else if (e.isFile()) n += fs.statSync(p).size; } catch (_) { /* gone meanwhile */ }
    }
    return n;
  }
  function usage() {
    const sz = (f) => { try { return fs.statSync(f).size; } catch (_) { return 0; } };
    const base = sz(baseFile) + sz(baseFile + '.part'), disks = dirSize(diskDir), engine = dirSize(engineDir) + sz(path.join(dir, 'engine.tar.gz'));
    return { total: base + disks + engine, base, disks, engine };
  }
  // Delete everything the computers made: turns them all off, then removes the engine, the shared system, every bot's disk
  // and the helper files. The shared "Wayzerr Files" folder (your own files) is never touched.
  async function wipe() {
    if (setup.active) throw new Error('A computer is being downloaded right now. Wait for it to finish, then try again.');
    const ids = [...running.keys()];
    for (const id of ids) { try { running.get(id).proc.kill(); } catch (_) {} }
    for (let i = 0; i < 40 && running.size; i++) await sleep(250);
    await sleep(400); // let the system release the disk files
    for (const f of ['engine.tar.gz', 'engine.zip', 'base.qcow2', 'base.qcow2.part']) fs.rmSync(path.join(dir, f), { force: true });
    fs.rmSync(engineDir, { recursive: true, force: true });
    fs.rmSync(diskDir, { recursive: true, force: true });
    fs.rmSync(path.join(dir, 'tls'), { recursive: true, force: true }); tlsCreds = null;
    fs.rmSync(path.join(sharedDir || path.join(dir, 'shared'), '.wz'), { recursive: true, force: true }); // only the helper's scratch folder, never the files around it
    agentSeen.clear(); inputs.clear(); shots.clear(); lastUse.clear(); lastPlan = null;
    setup.error = ''; setup.step = ''; setup.done = 0; setup.total = 0;
    return status();
  }

  const touch = (botId) => { lastUse.set(safe(botId), Date.now()); };
  probeWhpx();
  setInterval(() => { for (const id of [...running.keys()]) if (Date.now() - (lastUse.get(id) || 0) > IDLE_MS) stop(id); }, 60 * 1000).unref?.();
  return { status, plan, install, ensure, shutdownAll, touch, start, stop, stopAll, remove, usage, wipe, run: act, fill, thumb };
};

module.exports.COMPUTER_TOOLS = COMPUTER_TOOLS;
module.exports._test = { makeCreds, tlsUpstream, bridge, rfbInput }; // (for the tests)
