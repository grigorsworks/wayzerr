// Re-signs the Mac app with the "Wayzerr Signing" certificate (kept in its own keychain on the build Mac).
// Why: an ad-hoc signature is different for every build, so macOS forgets the permissions the user gave Wayzerr
// (Screen recording, Accessibility) after every update. A signature made with the same certificate every time
// keeps them. If the certificate is not on this Mac (someone else building), the app stays ad-hoc signed as before.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

exports.default = async function afterSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const kc = path.join(os.homedir(), 'Library', 'Keychains', 'wayzerr-signing.keychain-db');
  const pwFile = path.join(os.homedir(), '.wayzerr-signing', 'keychain-password');
  if (!fs.existsSync(kc) || !fs.existsSync(pwFile)) { console.log('  • Wayzerr signing certificate not found on this Mac: the app stays ad-hoc signed'); return; }
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  execFileSync('/usr/bin/security', ['unlock-keychain', '-p', fs.readFileSync(pwFile, 'utf8').trim(), kc]);
  const list = execFileSync('/usr/bin/security', ['find-identity', '-p', 'codesigning', kc], { encoding: 'utf8' });
  const m = /([0-9A-F]{40})\s+"Wayzerr Signing"/.exec(list);
  if (!m) throw new Error('The Wayzerr Signing certificate is missing from ' + kc);
  execFileSync('/usr/bin/codesign', ['--force', '--deep', '--keychain', kc, '--sign', m[1], app], { stdio: 'inherit' });
  execFileSync('/usr/bin/codesign', ['--verify', '--deep', '--strict', app]);
  const req = execFileSync('/usr/bin/codesign', ['-d', '-r-', app], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  console.log('  • signed with the Wayzerr Signing certificate: ' + req.trim().split('\n').pop());
};
