// Wayzerr installs its helper AIs (Claude, Gemini…) with a copy of npm that ships inside the app.
// npm needs its own node_modules folder, but the packager leaves nested node_modules out, so it is copied in here
// (before the app is signed). Without it, "Connect" fails with "Couldn't download…".
// It also puts the Wayzerr icon into the Windows .exe (see scripts/win-icon.js).
const fs = require('fs');
const path = require('path');

exports.default = async function afterPack(context) {
  // Look at the system the app is built FOR, not the one this build runs on: a Windows or Linux app built on a Mac has no .app folder.
  const res = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources');
  const from = path.join(context.packager.projectDir, 'node_modules', 'npm', 'node_modules');
  const to = path.join(res, 'app.asar.unpacked', 'node_modules', 'npm', 'node_modules');
  if (!fs.existsSync(from)) throw new Error('npm is not installed in this project (run npm install first): ' + from);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  // The .bin folders are only shortcuts (symbolic links); npm doesn't need them, and they would break the app's signature.
  fs.cpSync(from, to, { recursive: true, force: true, filter: (src) => path.basename(src) !== '.bin' });
  if (!fs.existsSync(path.join(to, 'graceful-fs'))) throw new Error("npm's own modules were not copied into the app");

  // Windows: electron-builder only writes the icon into Wayzerr.exe when it is allowed to edit the .exe, and the Windows files are
  // built on a Mac with that switched off, which left Electron's own icon on the .exe (shortcuts, taskbar, uninstall list, zip).
  if (context.electronPlatformName === 'win32') {
    const info = context.packager.appInfo;
    const exe = path.join(context.appOutDir, `${info.productFilename}.exe`);
    const how = await require('./win-icon').applyIcon(exe, path.join(context.packager.projectDir, 'build', 'icon.ico'), { version: info.version, productName: info.productName, description: info.productName });
    console.log(`  • Wayzerr icon written into ${path.basename(exe)} (${how})`);
  }
};
