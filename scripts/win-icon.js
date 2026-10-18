// Puts the Wayzerr icon (and the product name and version) into a Windows .exe.
//
// Why this exists: electron-builder writes the icon into Wayzerr.exe by itself, but the build that makes the Windows files runs on a
// Mac with that step switched off (signAndEditExecutable=false), so the finished Wayzerr.exe kept Electron's atom icon: in the
// installer's shortcuts, the Start menu, the taskbar, the uninstall list and the zip. scripts/after-pack.js calls this after
// every Windows build, so the icon is there however electron-builder is started.
//
// It uses "resedit" (plain JavaScript, so it also works on a Mac; electron-builder itself depends on it). On a Windows machine it
// falls back to the "rcedit" package if resedit is missing.
const fs = require('fs');
const path = require('path');

function versionParts(v) { // "1.3.29" or "1.3.29.1" -> [1, 3, 29, 1]
  const p = String(v || '').split('.').map((n) => parseInt(n, 10)).filter((n) => Number.isFinite(n));
  while (p.length < 4) p.push(0);
  return p.slice(0, 4);
}

async function withResedit(resedit, exePath, icoPath, info) {
  const exe = resedit.NtExecutable.from(fs.readFileSync(exePath));
  const res = resedit.NtExecutableResource.from(exe);
  const list = resedit.Resource.VersionInfo.fromEntries(res.entries);
  const vi = list.length ? list[0] : resedit.Resource.VersionInfo.createEmpty();
  const langs = vi.getAllLanguagesForStringValues();
  const lang = langs.length ? langs[0] : { lang: 0x0409, codepage: 1200 };
  const [a, b, c, d] = versionParts(info.version);
  vi.setFileVersion(a, b, c, d, lang.lang);
  vi.setProductVersion(a, b, c, d, lang.lang);
  vi.setStringValues(lang, {
    CompanyName: info.company || 'Wayzerr',
    LegalCopyright: info.copyright || '© 2026 Wayzerr',
    ProductName: info.productName || 'Wayzerr',
    FileDescription: info.description || info.productName || 'Wayzerr',
    InternalName: info.productName || 'Wayzerr',
    OriginalFilename: path.basename(exePath),
    FileVersion: String(info.version || ''),
    ProductVersion: String(info.version || ''),
  });
  vi.outputToResourceEntries(res.entries);
  const icons = resedit.Data.IconFile.from(fs.readFileSync(icoPath)).icons.map((i) => i.data);
  resedit.Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, lang.lang, icons);
  res.outputResource(exe);
  fs.writeFileSync(exePath, Buffer.from(exe.generate()));
}

async function withRcedit(exePath, icoPath, info) {
  const rcedit = require('rcedit');
  await rcedit(exePath, { icon: icoPath, 'product-version': String(info.version || ''), 'file-version': String(info.version || ''), 'version-string': { ProductName: info.productName || 'Wayzerr', FileDescription: info.description || info.productName || 'Wayzerr', InternalName: info.productName || 'Wayzerr', OriginalFilename: path.basename(exePath) } });
}

exports.applyIcon = async function applyIcon(exePath, icoPath, info = {}) {
  if (!fs.existsSync(exePath)) throw new Error('no .exe to put the icon into: ' + exePath);
  if (!fs.existsSync(icoPath)) throw new Error('no icon file: ' + icoPath + ' (make it with: python3 scripts/make-icons.py)');
  let first;
  try { await withResedit(require('resedit'), exePath, icoPath, info); return 'resedit'; } catch (e) { first = e; }
  if (process.platform === 'win32') { try { await withRcedit(exePath, icoPath, info); return 'rcedit'; } catch (_) { /* report the first problem below */ } }
  throw new Error('could not write the Wayzerr icon into ' + path.basename(exePath) + ': ' + (first && first.message));
};
