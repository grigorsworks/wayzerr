// A private certificate authority that lives only on this computer, so the phone can use a
// secure (https) connection over your own Wi-Fi — no internet needed. The phone trusts it once
// (a "Wayzerr" profile in Settings), then gets the camera scanner and opens even when the
// computer is away (it shows "Phone disconnected" instead of an error page).
const fs = require('fs');
const path = require('path');
const forge = require('node-forge');

function ensureCA(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const kf = path.join(dir, 'ca-key.pem'), cf = path.join(dir, 'ca-cert.pem');
  if (fs.existsSync(kf) && fs.existsSync(cf)) return { keyPem: fs.readFileSync(kf, 'utf8'), certPem: fs.readFileSync(cf, 'utf8') };
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01' + forge.util.bytesToHex(forge.random.getBytesSync(8));
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 10 * 365 * 86400000);
  const name = [{ name: 'commonName', value: 'Wayzerr on this computer' }, { name: 'organizationName', value: 'Wayzerr' }];
  cert.setSubject(name); cert.setIssuer(name);
  cert.setExtensions([{ name: 'basicConstraints', cA: true, critical: true }, { name: 'keyUsage', keyCertSign: true, cRLSign: true, critical: true }, { name: 'subjectKeyIdentifier' }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const keyPem = forge.pki.privateKeyToPem(keys.privateKey), certPem = forge.pki.certificateToPem(cert);
  fs.writeFileSync(kf, keyPem, { mode: 0o600 }); fs.writeFileSync(cf, certPem);
  return { keyPem, certPem };
}

// A server certificate for this computer's names and addresses (renewed when they change).
function serverCert(dir, ca, names, ips) {
  const tag = [...names, ...ips].sort().join(',');
  const kf = path.join(dir, 'srv-key.pem'), cf = path.join(dir, 'srv-cert.pem'), tf = path.join(dir, 'srv-for.txt');
  try {
    if (fs.readFileSync(tf, 'utf8') === tag) {
      const c = forge.pki.certificateFromPem(fs.readFileSync(cf, 'utf8'));
      if (c.validity.notAfter - Date.now() > 30 * 86400000) return { key: fs.readFileSync(kf, 'utf8'), cert: fs.readFileSync(cf, 'utf8') };
    }
  } catch (_) {}
  const caKey = forge.pki.privateKeyFromPem(ca.keyPem), caCert = forge.pki.certificateFromPem(ca.certPem);
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '02' + forge.util.bytesToHex(forge.random.getBytesSync(8));
  cert.validity.notBefore = new Date(Date.now() - 86400000);
  cert.validity.notAfter = new Date(Date.now() + 800 * 86400000); // Apple allows at most 825 days
  cert.setSubject([{ name: 'commonName', value: names[0] || 'nexarium.local' }]);
  cert.setIssuer(caCert.subject.attributes);
  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    { name: 'keyUsage', digitalSignature: true, keyEncipherment: true, critical: true },
    { name: 'extKeyUsage', serverAuth: true },
    { name: 'subjectAltName', altNames: [...names.map((value) => ({ type: 2, value })), ...ips.map((ip) => ({ type: 7, ip }))] },
  ]);
  cert.sign(caKey, forge.md.sha256.create());
  const key = forge.pki.privateKeyToPem(keys.privateKey), pem = forge.pki.certificateToPem(cert);
  fs.writeFileSync(kf, key, { mode: 0o600 }); fs.writeFileSync(cf, pem); fs.writeFileSync(tf, tag);
  return { key, cert: pem };
}

// An iPhone profile that installs the certificate (Settings → Profile Downloaded → Install).
function mobileconfig(ca, computer) {
  const der = forge.asn1.toDer(forge.pki.certificateToAsn1(forge.pki.certificateFromPem(ca.certPem))).getBytes();
  const b64 = Buffer.from(der, 'binary').toString('base64');
  const uuid = () => ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, (c) => (c ^ (require('crypto').randomBytes(1)[0] & (15 >> (c / 4)))).toString(16)).toUpperCase();
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>PayloadContent</key><array><dict>
<key>PayloadCertificateFileName</key><string>Wayzerr.cer</string>
<key>PayloadContent</key><data>${b64}</data>
<key>PayloadDisplayName</key><string>Wayzerr on ${esc(computer)}</string>
<key>PayloadIdentifier</key><string>app.nexarium.localca.cert</string>
<key>PayloadType</key><string>com.apple.security.root</string>
<key>PayloadUUID</key><string>${uuid()}</string>
<key>PayloadVersion</key><integer>1</integer>
</dict></array>
<key>PayloadDescription</key><string>Lets Wayzerr on your phone use a secure connection to Wayzerr on ${esc(computer)}, over your own Wi-Fi.</string>
<key>PayloadDisplayName</key><string>Wayzerr</string>
<key>PayloadIdentifier</key><string>app.nexarium.localca</string>
<key>PayloadOrganization</key><string>Wayzerr</string>
<key>PayloadRemovalDisallowed</key><false/>
<key>PayloadType</key><string>Configuration</string>
<key>PayloadUUID</key><string>${uuid()}</string>
<key>PayloadVersion</key><integer>1</integer>
</dict></plist>`;
}

module.exports = { ensureCA, serverCert, mobileconfig };
