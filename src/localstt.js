// On-device speech to text: Whisper runs in a hidden window from files bundled in the app,
// so the mic works with any AI (cloud sign-in, API key, or none) and nothing leaves the computer.
const { app, BrowserWindow, protocol, session } = require('electron');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, 'stt');
const PART = 'nxstt';
protocol.registerSchemesAsPrivileged([{ scheme: 'nxstt', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.json': 'application/json', '.txt': 'text/plain', '.onnx': 'application/octet-stream' };
let handled = false;
function serve() {
  if (handled) return; handled = true;
  session.fromPartition(PART).protocol.handle('nxstt', async (req) => {
    const u = new URL(req.url);
    const file = path.normalize(path.join(ROOT, decodeURIComponent(u.pathname)));
    const headers = { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp', 'Cross-Origin-Resource-Policy': 'same-origin' };
    if (!file.startsWith(ROOT + path.sep)) return new Response('no', { status: 403, headers });
    try {
      const buf = await fs.promises.readFile(file);
      return new Response(buf, { headers: { ...headers, 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' } });
    } catch (_) { return new Response('not found', { status: 404, headers }); }
  });
}

function exists() { return fs.existsSync(path.join(ROOT, 'models', 'Xenova', 'whisper-base', 'onnx', 'encoder_model_quantized.onnx')); }

let win = null, ready = null, idle = null, queue = Promise.resolve();
function open() {
  if (ready) return ready;
  serve();
  win = new BrowserWindow({ show: false, width: 200, height: 200, webPreferences: { partition: PART, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false, spellcheck: false } });
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.on('closed', () => { win = null; ready = null; });
  win.webContents.on('render-process-gone', () => { try { win?.destroy(); } catch (_) {} win = null; ready = null; });
  ready = win.loadURL('nxstt://app/index.html').then(async () => {
    for (let i = 0; i < 100; i++) { if (await win.webContents.executeJavaScript('!!window.nxSttReady')) return win; await new Promise((r) => setTimeout(r, 100)); }
    throw new Error('speech engine did not start');
  }).catch((e) => { try { win?.destroy(); } catch (_) {} win = null; ready = null; throw e; });
  return ready;
}
function touch() {
  clearTimeout(idle);
  idle = setTimeout(() => { try { win?.destroy(); } catch (_) {} win = null; ready = null; }, 10 * 60 * 1000); // free the memory when not used
}

// Loads the model in the background so the first voice message is quick.
function warm() { if (!exists()) return; open().then((w) => w.webContents.executeJavaScript('nxStt.warm()')).then(touch).catch(() => {}); }

function transcribe(buf, lang) {
  const job = queue.then(async () => {
    if (!exists()) throw new Error('the on-device voice engine is missing');
    const w = await open();
    touch();
    const b64 = Buffer.from(buf).toString('base64');
    const text = await w.webContents.executeJavaScript(`nxStt.run(Uint8Array.from(atob(${JSON.stringify(b64)}), (c) => c.charCodeAt(0)), ${JSON.stringify(String(lang || ''))})`);
    touch();
    return String(text || '').trim();
  });
  queue = job.catch(() => {});
  return job;
}

app.on('before-quit', () => { try { win?.destroy(); } catch (_) {} });

module.exports = { transcribe, warm, exists };
