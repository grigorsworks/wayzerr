// In-app updates.
// An update is a file named "Persona-update-<version>.zip" (containing Persona.app).
// The app looks for one in ~/Downloads (or at an optional feed URL), and installs it
// in place: unzip → wait for the app to quit → swap the app bundle → relaunch.
// Your data lives in ~/Library/Application Support/Persona, so it's never touched.
const { app, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');
const fetch = require('./netfetch');

const NAME_RE = /^Persona-update-(\d+)\.(\d+)\.(\d+)\.zip$/i;

function cmpVer(a, b) {
  const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
}

const current = () => process.env.WAYZERR_FAKE_VERSION || app.getVersion();
// Every build carries a build stamp (CFBundleVersion = yyyymmddhhmm). A newer stamp is an update,
// whatever the version name says — so "1.1.3" built today beats an older "1.3.0".
const isStamp = (b) => /^\d{12}$/.test(String(b || ''));
let ownBuild;
function currentBuild() {
  if (process.env.WAYZERR_FAKE_BUILD) return process.env.WAYZERR_FAKE_BUILD;
  if (ownBuild !== undefined) return ownBuild;
  ownBuild = null;
  if (process.platform !== 'darwin') { try { ownBuild = require('./buildinfo.json').build || null; } catch (_) {} return ownBuild; }
  try { const b = bundlePath(); const plist = fs.readFileSync(path.join(b, 'Contents', 'Info.plist'), 'utf8'); ownBuild = (plist.match(/CFBundleVersion<\/key>\s*<string>([^<]+)</) || [])[1] || null; } catch (_) {}
  return ownBuild;
}
function isNewer(u) {
  const cb = currentBuild();
  if (isStamp(u.build) && isStamp(cb)) return Number(u.build) > Number(cb);
  if (isStamp(u.build) && !isStamp(cb)) return true; // coming from an older app without stamps
  return cmpVer(u.version, current()) > 0;
}

// Path of the running Persona.app bundle (…/Persona.app/Contents/MacOS/Persona → …/Persona.app)
function bundlePath() {
  if (process.env.WAYZERR_APP_PATH) return process.env.WAYZERR_APP_PATH;
  if (process.platform === 'win32') return app.isPackaged ? path.dirname(process.execPath) : null;
  if (process.platform === 'linux') return process.env.APPIMAGE || (app.isPackaged ? path.dirname(process.execPath) : null);
  const p = path.resolve(process.execPath, '..', '..', '..');
  return p.endsWith('.app') ? p : null;
}

function findLocal() {
  const dir = process.env.WAYZERR_DOWNLOADS || app.getPath('downloads');
  let best = null;
  let names = [];
  try { names = fs.readdirSync(dir); } catch (e) { return { blocked: true }; }
  for (const n of names) {
    const m = n.match(NAME_RE);
    if (!m) continue;
    const version = `${+m[1]}.${+m[2]}.${+m[3]}`;
    if (cmpVer(version, current()) > 0 && (!best || cmpVer(version, best.version) > 0)) best = { version, file: path.join(dir, n), source: 'downloads' };
  }
  return best;
}

// Online updates for everyone: a small JSON file on the web — { version, build, url, notes }.
async function findFeed(feedUrl) {
  if (!feedUrl) return null;
  const r = await fetch(feedUrl, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
  if (!r.ok) throw new Error('Update server answered ' + r.status);
  let j = await r.json();
  // Windows and Linux use their own entry in the feed ("platforms": {"win32": {...}, "linux": {...}}); the .dmg is Mac-only.
  if (process.platform !== 'darwin') { const p = (process.platform === 'linux' && process.arch === 'arm64' && j.platforms?.['linux-arm64']) || j.platforms?.[process.platform]; if (!p?.url) return null; j = { ...j, ...p }; }
  let url = j.url;
  try { url = new URL(j.url, feedUrl).href; } catch (_) {} // "Wayzerr.dmg" next to latest.json works too
  const u = { version: j.version, build: j.build ? String(j.build) : null, url, sha256: /^[a-f0-9]{64}$/i.test(j.sha256 || '') ? j.sha256.toLowerCase() : null, size: Number(j.size) || null, notes: Array.isArray(j.notes) ? j.notes : String(j.notes || '').split('\n').filter(Boolean), source: 'feed' };
  if (u.version && u.url && isNewer(u)) return u;
  return null;
}

// A newer Persona.dmg in Downloads counts as an update too (read its version by mounting it quietly).
const dmgCache = new Map();
async function mountDmg(file) {
  const out = await run('/usr/bin/hdiutil', ['attach', '-nobrowse', '-readonly', '-noautoopen', '-noverify', '-plist', file]);
  const mp = [...out.matchAll(/<key>mount-point<\/key>\s*<string>([^<]+)<\/string>/g)].map((m) => m[1])[0];
  if (!mp) throw new Error("Couldn't open that installer disk.");
  return mp;
}
// The app inside an installer disk (Wayzerr.app, or Persona.app in older ones).
const appIn = (dir) => (fs.readdirSync(dir).find((n) => /^(Wayzerr|Nexarium|Persona)\.app$/i.test(n)) || fs.readdirSync(dir).find((n) => /\.app$/i.test(n)) || 'Wayzerr.app');
const detach = (mp) => run('/usr/bin/hdiutil', ['detach', '-quiet', '-force', mp]).catch(() => {});
async function dmgVersion(file) {
  const st = fs.statSync(file);
  const key = file + ':' + st.mtimeMs + ':' + st.size;
  if (dmgCache.has(key)) return dmgCache.get(key);
  let version = null, build = null, notes = [];
  if (process.platform === 'darwin') {
    let mp = null;
    try {
      mp = await mountDmg(file);
      const plist = fs.readFileSync(path.join(mp, appIn(mp), 'Contents', 'Info.plist'), 'utf8');
      version = (plist.match(/CFBundleShortVersionString<\/key>\s*<string>([^<]+)</) || [])[1] || null;
      build = (plist.match(/CFBundleVersion<\/key>\s*<string>([^<]+)</) || [])[1] || null;
      notes = ((plist.match(/(?:Persona|Wayzerr)Notes<\/key>\s*<string>([^<]*)</) || [])[1] || '').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').split(' | ').filter(Boolean);
    } catch (_) {} finally { if (mp) await detach(mp); }
  }
  const r = version ? { version, build, notes } : null;
  dmgCache.set(key, r);
  return r;
}
async function findDmg() {
  const dir = process.env.WAYZERR_DOWNLOADS || app.getPath('downloads');
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { return null; }
  let best = null;
  for (const n of names.filter((x) => /^(Persona|Nexarium|Wayzerr).*\.dmg$/i.test(x))) {
    const v = await dmgVersion(path.join(dir, n)).catch(() => null);
    if (!v) continue;
    const u = { version: v.version, build: v.build, notes: v.notes, file: path.join(dir, n), source: 'dmg' };
    if (isNewer(u) && (!best || (isStamp(u.build) && isStamp(best.build) ? Number(u.build) > Number(best.build) : cmpVer(u.version, best.version) > 0))) best = u;
  }
  return best;
}

// Windows / Linux: a newer installer in Downloads, e.g. "Wayzerr-Setup-1.1.49.exe", "Wayzerr-1.1.49.AppImage", "wayzerr_1.1.49_amd64.deb".
const INSTALLER_RE = process.platform === 'win32' ? /^(wayzerr|persona|nexarium)(?![a-z]).*?(\d+\.\d+\.\d+).*\.exe$/i : /^(wayzerr|persona|nexarium)(?![a-z]).*?(\d+\.\d+\.\d+).*\.(appimage|deb)$/i;
function installerInfo(file) {
  const n = path.basename(file);
  const m = n.match(INSTALLER_RE);
  if (!m) return null;
  const b = n.match(/(?:^|[^\d])(\d{12})(?:[^\d]|$)/);
  return { version: m[2], build: b ? b[1] : null, notes: [], file, source: 'installer' };
}
function findInstaller() {
  const dir = process.env.WAYZERR_DOWNLOADS || app.getPath('downloads');
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { return null; }
  let best = null;
  for (const n of names) {
    const u = installerInfo(path.join(dir, n));
    if (!u || !isNewer(u)) continue;
    if (process.platform === 'linux' && process.env.APPIMAGE && !/\.appimage$/i.test(n) && names.some((x) => /\.appimage$/i.test(x) && installerInfo(path.join(dir, x))?.version === u.version)) continue; // prefer the AppImage when running one
    if (!best || cmpVer(u.version, best.version) > 0) best = u;
  }
  return best;
}

// The newest Persona.dmg in Downloads, whatever version is installed (for publishing).
async function latestDmg() {
  const dir = process.env.WAYZERR_DOWNLOADS || app.getPath('downloads');
  let names = [];
  try { names = fs.readdirSync(dir); } catch (_) { return null; }
  let best = null;
  for (const n of names.filter((x) => /^(Persona|Nexarium|Wayzerr).*\.dmg$/i.test(x))) {
    const v = await dmgVersion(path.join(dir, n)).catch(() => null);
    if (!v) continue;
    const u = { version: v.version, build: v.build, notes: v.notes, file: path.join(dir, n), source: 'dmg' };
    if (!best || (isStamp(u.build) && isStamp(best.build) ? Number(u.build) > Number(best.build) : cmpVer(u.version, best.version) > 0)) best = u;
  }
  return best;
}
// What's published online right now (or null).
async function published(feedUrl) {
  if (!feedUrl) return null;
  try { const r = await fetch(feedUrl, { signal: AbortSignal.timeout(10000), cache: 'no-store' }); return r.ok ? await r.json() : null; } catch (_) { return null; }
}
const newerThan = (a, b) => !b || (isStamp(a.build) && isStamp(String(b.build || '')) ? Number(a.build) > Number(b.build) : cmpVer(a.version, b.version || '0.0.0') > 0);

async function check(feedUrl, { manual = false } = {}) {
  let feed = null, reached = false;
  // One or more feeds (your site first, older ones as backup) — the newest wins.
  for (const f of [].concat(feedUrl || []).filter(Boolean)) {
    let got = null;
    try { got = await findFeed(f); reached = true; } catch (_) { /* offline or gone */ }
    if (got && (!feed || newerThan(got, feed))) feed = got;
  }
  // The Downloads folder is only looked at when you press "Check for updates" and the online update server can't be reached,
  // so macOS has no reason to ask for permission to it when Wayzerr starts or updates.
  const scan = manual && !reached; // only when you press Check for updates AND the update server can't be reached (never on start-up: macOS asks for Downloads access again after every update)
  let local = scan ? findLocal() : null;
  const blocked = !!local?.blocked;
  if (blocked) local = null;
  let dmg = null;
  if (scan && !blocked) dmg = process.platform === 'darwin' ? await findDmg().catch(() => null) : findInstaller();
  const newest = (a, b) => (isStamp(a.build) && isStamp(b.build) ? Number(b.build) - Number(a.build) : cmpVer(b.version, a.version));
  const best = [dmg, feed, local].filter(Boolean).sort(newest)[0] || null;
  return { current: current(), update: best, canInstall: !!bundlePath(), downloadsBlocked: blocked };
}

const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, { maxBuffer: 1 << 26 }, (e, so, se) => (e ? rej(new Error((se || e.message).toString().slice(0, 300))) : res(so))));

// Who signed this app? "TeamIdentifier=ABCDE12345" from codesign; null for an unsigned or ad-hoc app.
const teamOf = (appPath) => new Promise((res) => execFile('/usr/bin/codesign', ['-dvv', appPath], (e, so, se) => {
  const m = /^TeamIdentifier=(\S+)$/m.exec(String(se || '') + String(so || ''));
  res(m && m[1] !== 'not' ? m[1] : null);
}));
// The new app must be validly signed. When the running app is signed with a Developer ID (it has a Team ID), the new one must be signed by the
// SAME developer and macOS must accept it (notarized). While the running app is still ad-hoc signed there is no developer to compare with.
async function verifySignedBySameTeam(fresh, current) {
  await run('/usr/bin/codesign', ['--verify', '--deep', '--strict', fresh]).catch(() => { throw new Error("The downloaded app's signature is not valid, so it wasn't installed."); });
  const mine = await teamOf(current);
  if (!mine) return;
  const theirs = await teamOf(fresh);
  if (!theirs || theirs !== mine) throw new Error('The downloaded app was not signed by the same developer, so it was not installed.');
  await run('/usr/sbin/spctl', ['--assess', '--type', 'execute', fresh]).catch(() => { throw new Error("macOS doesn't accept the downloaded app (it is not notarized), so it wasn't installed."); });
}

// Windows: run the new installer (it closes Wayzerr, installs and opens the new version).
// Linux: an AppImage replaces the running one and restarts; a .deb opens in the software installer.
async function installOther(update, onProgress) {
  let file = update.file;
  if (update.source === 'feed') {
    if (!/^https:\/\//i.test(update.url)) throw new Error('This update is not on a secure (https) address, so Wayzerr will not install it.');
    if (!update.sha256) throw new Error('The update feed has no checksum for this download, so Wayzerr will not install it.');
    onProgress('Downloading…');
    const r = await fetch(update.url);
    if (!r.ok) throw new Error('Download failed (' + r.status + ')');
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'wayzerr-update-'));
    file = path.join(work, path.basename(new URL(update.url).pathname) || (process.platform === 'win32' ? 'Wayzerr-Setup.exe' : 'Wayzerr.AppImage'));
    const hash = crypto.createHash('sha256');
    const outF = fs.createWriteStream(file);
    const total = Number(r.headers.get('content-length')) || update.size || 0;
    let got = 0, lastPct = -1;
    for await (const chunk of r.body) {
      const b = Buffer.from(chunk); hash.update(b); got += b.length;
      if (!outF.write(b)) await new Promise((res) => outF.once('drain', res));
      const pct = total ? Math.floor((got / total) * 100) : -1;
      if (pct !== lastPct && pct >= 0) { lastPct = pct; onProgress(`Downloading… ${pct}%`); }
    }
    await new Promise((res, rej) => outF.end((e) => (e ? rej(e) : res())));
    if (update.sha256 && hash.digest('hex') !== update.sha256) throw new Error("The downloaded update doesn't match the one on the website, so Wayzerr didn't install it. Try again later.");
  }
  if (!file || !fs.existsSync(file)) throw new Error("Couldn't find the update file.");
  onProgress('Restarting…');
  if (process.platform === 'win32') {
    const child = spawn(file, [], { detached: true, stdio: 'ignore', windowsHide: false });
    child.unref();
    setTimeout(() => app.quit(), 400);
    return true;
  }
  if (/\.deb$/i.test(file)) { await shell.openPath(file); return true; }
  const target = process.env.APPIMAGE;
  if (!target) { await shell.openPath(path.dirname(file)); throw new Error('Open the new Wayzerr AppImage from your Downloads folder to use the new version.'); }
  const q = (x) => `'${String(x).replace(/'/g, `'\\''`)}'`;
  const script = path.join(os.tmpdir(), `wayzerr-swap-${process.pid}.sh`);
  fs.writeFileSync(script, `#!/bin/sh\nwhile kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done\ncp -f ${q(file)} ${q(target)}.new && chmod +x ${q(target)}.new && mv -f ${q(target)}.new ${q(target)}\n${q(target)} >/dev/null 2>&1 &\nrm -f ${q(script)}\n`);
  fs.chmodSync(script, 0o755);
  spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' }).unref();
  setTimeout(() => app.quit(), 250);
  return true;
}

async function install(update, onProgress = () => {}) {
  if (process.platform !== 'darwin') return installOther(update, onProgress);
  const target = bundlePath();
  if (!target) throw new Error('Updates can only be installed when Wayzerr runs from its app (open it from Applications).');
  if (/^\/Volumes\//.test(target)) throw new Error('Wayzerr is running from the installer disk. Drag it to Applications first, then update.');
  try { fs.accessSync(path.dirname(target), fs.constants.W_OK); } catch (_) { throw new Error(`Can't write to ${path.dirname(target)}.`); }

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-update-'));
  let zip = update.file;
  let isDmg = update.source === 'dmg';
  if (update.source === 'feed') {
    // Only download over a secure connection.
    if (!/^https:\/\//i.test(update.url) && !(process.env.WAYZERR_DATA_DIR && /^http:\/\/127\.0\.0\.1[:/]/.test(update.url))) throw new Error('This update is not on a secure (https) address, so Wayzerr will not install it.');
    if (!update.sha256) throw new Error('The update feed has no checksum for this download, so Wayzerr will not install it.');
    onProgress('Downloading…');
    const r = await fetch(update.url);
    if (!r.ok) throw new Error('Download failed (' + r.status + ')');
    isDmg = /\.dmg(\?|$)/i.test(update.url) || /diskimage|octet-stream/i.test(r.headers.get('content-type') || '');
    zip = path.join(work, isDmg ? 'update.dmg' : 'update.zip');
    const total = Number(r.headers.get('content-length')) || update.size || 0;
    const hash = crypto.createHash('sha256');
    const outF = fs.createWriteStream(zip);
    let got = 0, lastPct = -1;
    for await (const chunk of r.body) {
      const b = Buffer.from(chunk);
      hash.update(b); got += b.length;
      if (!outF.write(b)) await new Promise((res) => outF.once('drain', res));
      const pct = total ? Math.floor((got / total) * 100) : -1;
      if (pct !== lastPct && pct >= 0) { lastPct = pct; onProgress(`Downloading… ${pct}%`); }
    }
    await new Promise((res, rej) => outF.end((e) => (e ? rej(e) : res())));
    // Check the file is exactly the one the website says it published.
    const digest = hash.digest('hex');
    if (update.sha256 && digest !== update.sha256) { fs.rmSync(work, { recursive: true, force: true }); throw new Error("The downloaded update doesn't match the one on the website, so Wayzerr didn't install it. Try again later."); }
    if (update.size && got !== update.size) { fs.rmSync(work, { recursive: true, force: true }); throw new Error('The update download was incomplete. Try again.'); }
  }
  onProgress('Unpacking…');
  const out = path.join(work, 'x');
  fs.mkdirSync(out);
  if (isDmg) {
    const mp = await mountDmg(zip);
    try { const a = appIn(mp); await run('/usr/bin/ditto', [path.join(mp, a), path.join(out, a)]); } finally { await detach(mp); }
  } else await run('/usr/bin/ditto', ['-x', '-k', zip, out]);
  const fresh = path.join(out, appIn(out));
  if (!fs.existsSync(path.join(fresh, 'Contents', 'Info.plist'))) throw new Error('That update file doesn\'t contain the app.');
  // It must really be Wayzerr (same app id), and the build the update promised.
  { const pl = fs.readFileSync(path.join(fresh, 'Contents', 'Info.plist'), 'utf8');
    const id = (pl.match(/CFBundleIdentifier<\/key>\s*<string>([^<]+)</) || [])[1];
    const bv = (pl.match(/CFBundleVersion<\/key>\s*<string>([^<]+)</) || [])[1];
    if (id && id !== 'com.persona.app' && id !== 'com.wayzerr.app') throw new Error("That update isn't Wayzerr, so it wasn't installed.");
    if (update.source === 'feed' && isStamp(update.build) && bv && bv !== update.build) throw new Error("The downloaded app isn't the version the website announced, so it wasn't installed."); }
  await verifySignedBySameTeam(fresh, target);
  // The app may have a new name (Persona → Wayzerr): install under the new name and remove the old one.
  const dest = path.join(path.dirname(target), path.basename(fresh));

  onProgress('Restarting…');
  const script = path.join(work, 'swap.sh');
  const q = (s) => `'${String(s).replace(/'/g, `'\\''`)}'`;
  fs.writeFileSync(script, `#!/bin/sh
# Wait for Persona to quit, swap in the new version, relaunch.
while kill -0 ${process.pid} 2>/dev/null; do sleep 0.3; done
OLD=${q(target)}
APP=${q(dest)}
NEW=${q(fresh)}
# The old app goes to its own fresh name: a leftover ".old" folder from an earlier update (even one that can't be deleted) can't block the swap.
rm -rf "$OLD.old" 2>/dev/null
BAK="$OLD.old.$$"
if mv "$OLD" "$BAK" && mv "$NEW" "$APP"; then
  rm -rf "$BAK" 2>/dev/null
else
  echo "$(date): the update could not be swapped in" >> "$HOME/Library/Logs/Wayzerr-update.log"
  [ -d "$BAK" ] && [ ! -d "$OLD" ] && mv "$BAK" "$OLD"
fi
${process.platform === 'darwin' ? 'xattr -dr com.apple.quarantine "$APP" 2>/dev/null\nopen "$APP"' : 'echo swapped > "$APP.swapped"'}
rm -rf ${q(work)}
`);
  fs.chmodSync(script, 0o755);
  // Tidy up: the used update file goes to the Trash.
  if (update.source === 'downloads' && !process.env.WAYZERR_APP_PATH) await shell.trashItem(update.file).catch(() => {});
  const child = spawn('/bin/sh', [script], { detached: true, stdio: 'ignore' });
  child.unref();
  setTimeout(() => app.quit(), 250);
  return true;
}

// Let the user pick an update file (works even if macOS blocks reading Downloads).
async function fromFile(file) {
  if (process.platform !== 'darwin') {
    const u = installerInfo(file) || (/\.(exe|appimage|deb)$/i.test(file) ? { version: '999.0.0', build: null, notes: [], file, source: 'installer' } : null);
    if (!u) throw new Error("That file isn't a Wayzerr installer.");
    if (u.version !== '999.0.0' && !isNewer(u)) throw new Error(`You already have Wayzerr ${current()} or a newer one.`);
    return u;
  }
  if (/\.dmg$/i.test(file)) {
    const v = await dmgVersion(file);
    if (!v) throw new Error("That file isn't a Wayzerr installer.");
    const u = { version: v.version, build: v.build, notes: v.notes, file, source: 'dmg' };
    if (!isNewer(u)) throw new Error(`You already have this Wayzerr build (${current()}) or a newer one.`);
    return u;
  }
  const m = path.basename(file).match(NAME_RE);
  let version = m ? `${+m[1]}.${+m[2]}.${+m[3]}` : null;
  if (!version) {
    try {
      const plist = await run('/usr/bin/unzip', ['-p', file, 'Persona.app/Contents/Info.plist']);
      version = (plist.match(/CFBundleShortVersionString<\/key>\s*<string>([^<]+)</) || [])[1] || null;
    } catch (_) {}
  }
  if (!version) throw new Error("That file isn't a Wayzerr update.");
  if (cmpVer(version, current()) <= 0) throw new Error(`You already have Wayzerr ${current()} (that file is ${version}).`);
  return { version, file, source: 'file' };
}

module.exports = { latestDmg, published, newerThan, check, install, fromFile, cmpVer, current };
