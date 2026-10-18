// The user's own Mac, controlled with the same tools as a bot's own computer (computer_click, computer_type, ...).
// It sees the main screen with the system's screenshot tool and moves the pointer / presses keys with small scripts.
// macOS only, and only after the user switched it on and allowed Wayzerr under Privacy & Security
// (Screen Recording to see the screen, Accessibility to click and type).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const run = (file, args, opts = {}) => new Promise((res, rej) => execFile(file, args, { maxBuffer: 1 << 24, timeout: 30000, ...opts }, (e, so, se) => (e ? rej(new Error((se || e.message).trim().split('\n').slice(-2).join(' '))) : res(so))));

// macOS key codes for the named keys (letters and digits are typed as characters).
const CODES = { return: 36, enter: 76, tab: 48, space: 49, backspace: 51, delete: 117, escape: 53, esc: 53, left: 123, right: 124, down: 125, up: 126, home: 115, end: 119, pageup: 116, pagedown: 121,
  f1: 122, f2: 120, f3: 99, f4: 118, f5: 96, f6: 97, f7: 98, f8: 100, f9: 101, f10: 109, f11: 103, f12: 111 };
const MODS = { cmd: 'command down', command: 'command down', super: 'command down', meta: 'command down', ctrl: 'control down', control: 'control down', alt: 'option down', option: 'option down', opt: 'option down', shift: 'shift down' };

function drawRing(px, w, h, cx, cy) {
  const R = 20;
  for (let y = Math.max(0, Math.round(cy) - R - 3); y <= Math.min(h - 1, Math.round(cy) + R + 3); y++) {
    for (let x = Math.max(0, Math.round(cx) - R - 3); x <= Math.min(w - 1, Math.round(cx) + R + 3); x++) {
      const d = Math.hypot(x - cx, y - cy), o = (y * w + x) * 4;
      if (d >= R - 1.5 && d <= R + 1.5) { px[o] = 40; px[o + 1] = 40; px[o + 2] = 255; } else if ((d >= R - 3 && d < R - 1.5) || (d > R + 1.5 && d <= R + 3)) { px[o] = 255; px[o + 1] = 255; px[o + 2] = 255; }
    }
  }
}

module.exports = function createMyMac({ getName = () => 'My Mac' } = {}) {
  const supported = process.platform === 'darwin';
  const shot = { k: 1, w: 0, h: 0, bgra: null, mark: null }; // k: screenshot pixels → screen points

  function permissions() {
    if (!supported) return { supported: false, screen: 'unsupported', accessibility: false };
    const { systemPreferences } = require('electron');
    let screen = 'unknown', accessibility = false;
    try { screen = systemPreferences.getMediaAccessStatus('screen'); } catch (_) {}
    try { accessibility = systemPreferences.isTrustedAccessibilityClient(false); } catch (_) {}
    return { supported: true, screen, accessibility };
  }
  // Asks macOS to show its permission prompts, and opens the right Settings page.
  async function requestAccess(which) {
    const { systemPreferences, shell } = require('electron');
    if (which === 'accessibility') { try { systemPreferences.isTrustedAccessibilityClient(true); } catch (_) {} await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility').catch(() => {}); }
    else { try { await takeShot(true); } catch (_) {} await shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture').catch(() => {}); }
    return permissions();
  }
  function need() {
    if (!supported) throw new Error('Controlling your own computer only works on a Mac for now.');
    const p = permissions();
    if (!p.accessibility) throw new Error(`Wayzerr is not allowed to control ${getName()} yet. Tell the user: open System Settings → Privacy & Security → Accessibility and switch on Wayzerr (Settings → Computer in Wayzerr has a button for it). Do not claim you did anything.`);
    if (p.screen !== 'granted') throw new Error(`Wayzerr is not allowed to see the screen of ${getName()} yet. Tell the user: open System Settings → Privacy & Security → Screen & System Audio Recording and switch on Wayzerr, then restart Wayzerr.`);
  }

  async function takeShot(quiet) {
    const { nativeImage, screen } = require('electron');
    const file = path.join(os.tmpdir(), `wzr-mac-${crypto.randomBytes(4).toString('hex')}.png`);
    try { await run('/usr/sbin/screencapture', ['-x', '-m', '-t', 'png', file]); } catch (e) { if (quiet) return null; throw new Error("Couldn't see the screen: " + e.message); }
    let img = nativeImage.createFromPath(file);
    fs.rmSync(file, { force: true });
    if (img.isEmpty()) { if (quiet) return null; throw new Error("Couldn't see the screen."); }
    const full = img.getSize(); // pixels
    const pts = screen.getPrimaryDisplay().bounds; // points
    shot.bgra = img.toBitmap(); shot.w = full.width; shot.h = full.height; shot.ptW = pts.width; shot.ptH = pts.height;
    let shown = shot.bgra;
    if (shot.mark) { shown = Buffer.from(shot.bgra); drawRing(shown, full.width, full.height, shot.mark.px, shot.mark.py); shot.mark = null; }
    let out = nativeImage.createFromBitmap(shown, { width: full.width, height: full.height });
    const sw = Math.min(1280, full.width);
    if (sw < full.width) out = out.resize({ width: sw });
    const sz = out.getSize();
    shot.shotW = sz.width; shot.shotH = sz.height;
    shot.k = pts.width / sz.width; // a click at (x, y) on the screenshot is at (x * k, y * k) points
    shot.pxPerShot = full.width / sz.width;
    return { image: 'data:image/jpeg;base64,' + out.toJPEG(75).toString('base64'), width: sz.width, height: sz.height };
  }
  const seen = async (note, delay = 700) => { await sleep(delay); const s = await takeShot(); return { text: `${note} The screen is ${s.width}x${s.height}; x and y are measured on the screenshot below.`, image: s.image }; };

  // JavaScript for Automation: posts mouse events straight to the system.
  const jxa = (body) => run('/usr/bin/osascript', ['-l', 'JavaScript', '-e', `ObjC.import('CoreGraphics'); ObjC.import('unistd');
const post = (t, x, y, b, n) => { const e = $.CGEventCreateMouseEvent(null, t, { x: x, y: y }, b); if (n) $.CGEventSetIntegerValueField(e, 1, n); $.CGEventPost(0, e); };
const wait = (ms) => $.usleep(ms * 1000);
${body}`]);
  const point = (x, y) => { const px = +x, py = +y; if (!Number.isFinite(px) || !Number.isFinite(py)) throw new Error('Give x and y from the latest screenshot.'); return { x: px * shot.k, y: py * shot.k, px: px * shot.pxPerShot, py: py * shot.pxPerShot }; };
  const clickAt = async (x, y, right, times) => {
    const p = point(x, y), down = right ? 3 : 1, up = right ? 4 : 2, btn = right ? 1 : 0;
    await jxa(`post(5, ${p.x}, ${p.y}, 0); wait(120);\nfor (let i = 1; i <= ${times}; i++) { post(${down}, ${p.x}, ${p.y}, ${btn}, i); wait(40); post(${up}, ${p.x}, ${p.y}, ${btn}, i); wait(${times > 1 ? 60 : 80}); }`);
    shot.mark = p;
  };

  // AppleScript through System Events for typing: it handles any text, including accents and emoji.
  const keystroke = (text) => run('/usr/bin/osascript', ['-e', 'on run argv', '-e', 'tell application "System Events" to keystroke (item 1 of argv)', '-e', 'end run', '--', String(text)]);
  async function pressKeys(spec, times) {
    const parts = String(spec || '').split('+').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) throw new Error('No keys given.');
    const key = parts.pop(), mods = parts.map((m) => MODS[m.toLowerCase()]).filter(Boolean);
    if (mods.length !== parts.length) throw new Error('Unknown modifier in "' + spec + '". Use cmd, ctrl, alt/option and shift.');
    const using = mods.length ? ` using {${mods.join(', ')}}` : '';
    const code = CODES[key.toLowerCase()];
    const line = code !== undefined ? `key code ${code}${using}` : `keystroke "${key.replace(/["\\]/g, '\\$&')}"${using}`;
    for (let i = 0; i < Math.min(20, times || 1); i++) { await run('/usr/bin/osascript', ['-e', `tell application "System Events" to ${line}`]); await sleep(60); }
  }

  async function act(name, args = {}) {
    need();
    if (name === 'computer_start' || name === 'computer_screenshot') { const s = await takeShot(); return { text: `${name === 'computer_start' ? `This is ${getName()}, the user's own Mac. ` : ''}The screen is ${s.width}x${s.height}; x and y are measured on the screenshot.`, image: s.image }; }
    if (!shot.bgra) await takeShot(); // coordinates need a first look
    const done = { computer_click: 'Clicked.', computer_double_click: 'Double-clicked.', computer_triple_click: 'Triple-clicked.', computer_right_click: 'Right-clicked.' };
    if (name in done) {
      const times = name === 'computer_triple_click' ? 3 : name === 'computer_double_click' || args.double ? 2 : 1;
      await clickAt(args.x, args.y, name === 'computer_right_click' || args.button === 'right', times);
      return seen(times === 3 ? done.computer_triple_click : times === 2 ? done.computer_double_click : name === 'computer_right_click' || args.button === 'right' ? done.computer_right_click : done.computer_click);
    }
    if (name === 'computer_mouse_move') { const p = point(args.x, args.y); await jxa(`post(5, ${p.x}, ${p.y}, 0);`); shot.mark = p; return seen('Moved the pointer.', 500); }
    if (name === 'computer_type') {
      const t = String(args.text || '');
      for (let i = 0; i < t.length; i += 400) await keystroke(t.slice(i, i + 400));
      if (args.enter) await pressKeys('return');
      return seen('Typed.');
    }
    if (name === 'computer_key') { await pressKeys(args.keys, args.times); return seen('Pressed ' + args.keys + '.'); }
    if (name === 'computer_scroll') {
      const p = point(args.x, args.y), n = Math.min(30, args.amount || 5);
      const dy = { up: n, down: -n }[args.direction] || 0, dx = { left: n, right: -n }[args.direction] || 0;
      if (!dx && !dy) throw new Error('direction must be up, down, left or right.');
      await jxa(`post(5, ${p.x}, ${p.y}, 0); wait(60); const e = $.CGEventCreateScrollWheelEvent(null, 1, 2, ${dy}, ${dx}); $.CGEventPost(0, e);`);
      return seen('Scrolled.');
    }
    if (name === 'computer_drag') {
      const a = point(args.x1, args.y1), b = point(args.x2, args.y2);
      let body = `post(5, ${a.x}, ${a.y}, 0); wait(100); post(1, ${a.x}, ${a.y}, 0, 1); wait(100);\n`;
      for (let i = 1; i <= 10; i++) body += `post(6, ${a.x + ((b.x - a.x) * i) / 10}, ${a.y + ((b.y - a.y) * i) / 10}, 0); wait(25);\n`;
      body += `post(2, ${b.x}, ${b.y}, 0, 1);`;
      await jxa(body);
      return seen('Dragged.');
    }
    if (name === 'computer_zoom') {
      const { nativeImage } = require('electron');
      const f = shot.pxPerShot, X = Math.max(0, Math.floor(Math.min(args.x1, args.x2) * f)), Y = Math.max(0, Math.floor(Math.min(args.y1, args.y2) * f));
      const W = Math.min(shot.w - X, Math.ceil(Math.abs(args.x2 - args.x1) * f)), H = Math.min(shot.h - Y, Math.ceil(Math.abs(args.y2 - args.y1) * f));
      if (W < 8 || H < 8) throw new Error('That area is too small to zoom into.');
      let img = nativeImage.createFromBitmap(shot.bgra, { width: shot.w, height: shot.h }).crop({ x: X, y: Y, width: W, height: H });
      if (W < 900) img = img.resize({ width: Math.min(1400, W * 3) });
      return { text: 'Zoomed in on that area. Click using the normal screenshot coordinates.', image: 'data:image/jpeg;base64,' + img.toJPEG(80).toString('base64') };
    }
    if (name === 'computer_open') {
      const what = String(args.what || '').trim();
      if (!what) throw new Error('Say what to open.');
      const url = /^[a-z][a-z0-9+.-]*:\/\//i.test(what) ? what : /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(what) && !/\s/.test(what) && !/\.app$/i.test(what) ? 'https://' + what : '';
      try { await run('/usr/bin/open', url ? [url] : ['-a', what.replace(/\.app$/i, '')]); } catch (e) { throw new Error(`Couldn't open "${what}": ${e.message}`); }
      return seen(`Opened "${what}".`, 2500);
    }
    if (name === 'computer_run' || name === 'computer_get_app') throw new Error("Shell commands only run on the bot's own computer. On the user's Mac use computer_open, keys and clicks.");
    if (name === 'computer_wait') { await sleep(Math.min(60, Math.max(1, args.seconds || 5)) * 1000); const s = await takeShot(); return { text: 'Waited.', image: s.image }; }
    throw new Error('Unknown computer tool');
  }

  // Logins and cards are typed straight into the field that has the cursor; the text never goes through the AI.
  async function fill(items, submit) {
    need();
    for (const [i, s] of items.entries()) { if (i) await pressKeys('tab'); await keystroke(s); }
    if (submit) await pressKeys('return');
    await sleep(500);
  }

  return { supported, permissions, requestAccess, run: act, fill };
};
