// Before building: stamp the build date and this version's "What's new" notes into the app.
// After building: write dist/latest.json — upload it next to Wayzerr.dmg so every user gets the update.
//   node scripts/release-info.js prepare 1.1.9
//   node scripts/release-info.js feed https://github.com/<you>/persona/releases/latest/download/Wayzerr.dmg
const fs = require('fs');
const path = require('path');
const pkgFile = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
const log = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'changelog.json'), 'utf8'));
const [cmd, arg] = process.argv.slice(2);
if (cmd === 'prepare') {
  if (arg) pkg.version = arg;
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  // WAYZERR_BUILD lets several machines (the GitHub build jobs) share ONE build stamp, so every download of a release carries the same one.
  pkg.build.buildVersion = /^\d{12}$/.test(process.env.WAYZERR_BUILD || '') ? process.env.WAYZERR_BUILD : `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`;
  // Windows and Linux read their build stamp from here (macOS reads it from the app's Info.plist).
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'buildinfo.json'), JSON.stringify({ build: pkg.build.buildVersion }));
  pkg.build.mac = { ...(pkg.build.mac || {}), extendInfo: { ...((pkg.build.mac || {}).extendInfo || {}), WayzerrNotes: (log[pkg.version] || []).join(' | '), PersonaNotes: (log[pkg.version] || []).join(' | ') } };
  fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
  console.log(`Wayzerr ${pkg.version} (build ${pkg.build.buildVersion}) — ${(log[pkg.version] || []).length} notes`);
} else if (cmd === 'feed') {
  const out = { version: pkg.version, build: pkg.build.buildVersion, url: arg, notes: log[pkg.version] || [] };
  fs.writeFileSync(path.join(__dirname, '..', 'dist', 'latest.json'), JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
} else console.log('usage: prepare <version> | feed <dmg-url>');
