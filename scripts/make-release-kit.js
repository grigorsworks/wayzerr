// Turns the installers built by GitHub Actions into an upload-ready "release kit":
//   - the files renamed the way the update server expects (Wayzerr-<version>[-windows|-linux|-linux-arm64].<ext>)
//   - latest.json (the update feed), with the SHA-256 and size of every file
//   - SHA256SUMS.txt and UPLOAD-STEPS.txt
// Nothing is published by this script.
//   node scripts/make-release-kit.js <folder with one subfolder per build> <output folder>
// Subfolders: wayzerr-mac, wayzerr-windows, wayzerr-linux, wayzerr-linux-arm64 (any may be missing).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const [inDir, outDir] = process.argv.slice(2);
if (!inDir || !outDir) { console.error('usage: make-release-kit.js <input folder> <output folder>'); process.exit(2); }
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
const log = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'changelog.json'), 'utf8'));
const version = pkg.version, build = pkg.build.buildVersion;
if (!/^\d+\.\d+\.\d+$/.test(version) || !/^\d{12}$/.test(String(build))) throw new Error('package.json needs a version and a build stamp (run scripts/release-info.js prepare first)');

const filesIn = (sub) => { const d = path.join(inDir, sub); return fs.existsSync(d) ? fs.readdirSync(d).filter((n) => !n.startsWith('.')).map((n) => path.join(d, n)) : []; };
const pick = (sub, re) => filesIn(sub).find((f) => re.test(path.basename(f))) || null;

// what to build: [kit file name, source file]
const plan = {
  mac: [`Wayzerr-${version}.dmg`, pick('wayzerr-mac', /\.dmg$/i)],
  windows: [`Wayzerr-${version}-windows.exe`, pick('wayzerr-windows', /\.exe$/i)],
  windowsZip: [`Wayzerr-${version}-windows.zip`, pick('wayzerr-windows', /\.zip$/i)],
  linux: [`Wayzerr-${version}-linux.AppImage`, pick('wayzerr-linux', /\.AppImage$/i)],
  linuxDeb: [`Wayzerr-${version}-linux.deb`, pick('wayzerr-linux', /\.deb$/i)],
  linuxArm64: [`Wayzerr-${version}-linux-arm64.AppImage`, pick('wayzerr-linux-arm64', /\.AppImage$/i)],
};

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });
const info = {};
for (const [kind, [name, src]] of Object.entries(plan)) {
  if (!src) { console.log(`  - ${kind}: not built, left out`); continue; }
  const dest = path.join(outDir, name);
  fs.copyFileSync(src, dest);
  const buf = fs.readFileSync(dest);
  info[kind] = { url: name, sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: buf.length };
  console.log(`  + ${kind}: ${name} (${(buf.length / 1048576).toFixed(1)} MB)`);
}
if (!Object.keys(info).length) throw new Error('No installers found in ' + inDir);

// The feed. Top level = macOS (the app reads url/sha256/size from here on a Mac); platforms = Windows/Linux; downloads = the website's /download/<kind> links.
const feed = { version, build, notes: log[version] || [] };
if (info.mac) Object.assign(feed, info.mac);
const platforms = {};
if (info.windows) platforms.win32 = info.windows;
if (info.linux) platforms.linux = info.linux;
if (info.linuxArm64) platforms['linux-arm64'] = info.linuxArm64;
if (Object.keys(platforms).length) feed.platforms = platforms;
const downloads = {};
for (const k of ['windows', 'windowsZip', 'linuxDeb', 'linuxArm64']) if (info[k]) downloads[k] = { url: info[k].url };
if (Object.keys(downloads).length) feed.downloads = downloads;
fs.writeFileSync(path.join(outDir, 'latest.json'), JSON.stringify(feed, null, 2) + '\n');
fs.writeFileSync(path.join(outDir, 'SHA256SUMS.txt'), Object.values(info).map((i) => `${i.sha256}  ${i.url}`).join('\n') + '\n');
fs.writeFileSync(path.join(outDir, 'UPLOAD-STEPS.txt'), `Wayzerr ${version} (build ${build}): upload steps
1. Test the installers on a real computer first. Nothing is live until step 3.
2. Upload every installer file in this folder to the R2 bucket that serves wayzerr.com (Cloudflare dashboard -> R2 -> the bucket -> Upload, or wrangler r2 object put).
   Keep the file names exactly as they are here.
3. Upload latest.json LAST. The moment it is replaced, every copy of Wayzerr starts offering this version.
4. To undo: upload the previous latest.json again.
`);
console.log(`\nKit written to ${outDir} (version ${version}, build ${build})`);
