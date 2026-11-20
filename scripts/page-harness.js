// (kept in scripts/ so it survives between sessions; originally written 2026-11-12 for bot checks)
// Headless page runner for checking bots in a real Chromium renderer (Electron), without touching anyone's browser pane.
//   /Users/grigor/Wayzerr/node_modules/.bin/electron main.js <page.html | http://localhost:PORT/page> [--shot out.png] [--w 900] [--h 700] [--wait 400] [--timeout 60000]
// The page can set  window.__result = <any JSON-able value>  and  window.__done = true  when it is finished.
// Prints  RESULT: <json>  on stdout (or  RESULT: null  if the page set nothing), console messages as  LOG: ..., then exits.
const { app, BrowserWindow } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf('--' + name); return i >= 0 ? argv[i + 1] : def; };
const page = argv.find((a) => !a.startsWith('--') && (/\.html?$/.test(a) || /^https?:\/\//.test(a)));
if (!page) { console.error('usage: main.js <page.html> [--shot out.png] [--w N] [--h N] [--wait ms] [--timeout ms]'); process.exit(2); }
const W = +opt('w', 900), H = +opt('h', 700), WAIT = +opt('wait', 400), TIMEOUT = +opt('timeout', 60000), SHOT = opt('shot', '');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'wz-harness-')));
if (app.dock) app.dock.hide();
app.commandLine.appendSwitch('disable-gpu-vsync');
app.on('window-all-closed', () => {});

app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, width: W, height: H, webPreferences: { offscreen: true, backgroundThrottling: false, contextIsolation: true, sandbox: true } });
  win.webContents.setFrameRate(30);
  win.webContents.on('console-message', (_e, level, message) => { console.log('LOG:', (typeof level === 'number' ? ['v', 'i', 'w', 'e'][level] || level : level), message); });
  const fail = (m) => { console.log('ERROR:', m); app.exit(1); };
  setTimeout(() => fail('timeout after ' + TIMEOUT + ' ms'), TIMEOUT + 5000).unref();
  try {
    if (/^https?:/.test(page)) await win.loadURL(page); else await win.loadFile(path.resolve(page));
    await new Promise((r) => setTimeout(r, WAIT));
    const t0 = Date.now();
    for (;;) {
      const done = await win.webContents.executeJavaScript('window.__done === true || window.__result !== undefined');
      if (done || Date.now() - t0 > TIMEOUT) break;
      await new Promise((r) => setTimeout(r, 100));
    }
    const res = await win.webContents.executeJavaScript('JSON.stringify(window.__result === undefined ? null : window.__result)');
    if (SHOT) {
      await new Promise((r) => setTimeout(r, 200));
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.resolve(SHOT), img.toPNG());
      console.log('SHOT:', path.resolve(SHOT), img.getSize().width + 'x' + img.getSize().height);
    }
    console.log('RESULT:', res);
    app.exit(0);
  } catch (e) { fail(String(e && e.stack || e)); }
});
