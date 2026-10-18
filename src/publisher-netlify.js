// Publisher mode (only on the owner's Mac): when a newer Wayzerr.dmg lands in Downloads,
// Wayzerr deploys the whole website to Netlify — the page, Wayzerr.dmg and latest.json —
// so the Download button and every user's in-app update point at the same new build.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const API = process.env.WAYZERR_NETLIFY_API || 'https://api.netlify.com/api/v1';

async function nf(token, method, url, body, headers = {}) {
  const r = await fetch(url.startsWith('http') ? url : API + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Wayzerr-app', ...headers },
    body,
    signal: AbortSignal.timeout(20 * 60 * 1000),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!r.ok) {
    const e = new Error(r.status === 401 ? "Netlify didn't accept the key — make a new one and paste it again."
      : r.status === 404 ? "Netlify can't find that site — check the address (like nexarium.netlify.app)."
      : r.status === 422 && /size|large/i.test(text) ? 'Netlify says Wayzerr.dmg is too big for this site.'
      : `Netlify error ${r.status}: ${json?.message || text.slice(0, 140)}`);
    e.status = r.status;
    throw e;
  }
  return json;
}

// Who is signed in and does the site exist?
async function check(token, site) {
  const me = await nf(token, 'GET', '/user');
  if (!site) return { user: me?.email || me?.full_name || '', site: '' };
  const s = await nf(token, 'GET', `/sites/${encodeURIComponent(site)}`);
  const host = (s.ssl_url || s.url || '').replace(/^https?:\/\//, '').replace(/\/.*$/, '') || site;
  return { user: me?.email || me?.full_name || '', site: host, id: s.id };
}

const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

async function publish({ token, site, siteDir, file, version, build, notes = [], onProgress = () => {} }) {
  onProgress(`Publishing Wayzerr ${version} for everyone…`);
  const info = await check(token, site);
  // Everything the site needs: the page (shipped inside the app), the installer and the update file.
  const files = {};
  const add = (name, buf) => { files['/' + name] = buf; };
  try { for (const n of fs.readdirSync(siteDir)) if (fs.statSync(path.join(siteDir, n)).isFile()) add(n, fs.readFileSync(path.join(siteDir, n))); } catch (_) {}
  add('Wayzerr.dmg', fs.readFileSync(file));
  add('latest.json', Buffer.from(JSON.stringify({ version, build: build || null, url: 'Wayzerr.dmg', notes }, null, 2)));
  const digests = Object.fromEntries(Object.entries(files).map(([p, b]) => [p, sha1(b)]));
  const dep = await nf(token, 'POST', `/sites/${info.id}/deploys`, JSON.stringify({ files: digests, draft: false }), { 'Content-Type': 'application/json' });
  const need = new Set(dep.required || []);
  for (const [p, b] of Object.entries(files)) {
    if (!need.has(digests[p])) continue;
    onProgress(p === '/Wayzerr.dmg' ? `Uploading Wayzerr.dmg (${Math.round(b.length / 1048576)} MB)…` : `Uploading ${p.slice(1)}…`);
    await nf(token, 'PUT', `/deploys/${dep.id}/files${p.split('/').map(encodeURIComponent).join('/')}`, b, { 'Content-Type': 'application/octet-stream' });
    need.delete(digests[p]);
  }
  onProgress('Netlify is putting it live…');
  let state = dep.state;
  for (let i = 0; i < 120 && !['ready', 'error'].includes(state); i++) {
    await new Promise((r) => setTimeout(r, 3000));
    state = (await nf(token, 'GET', `/deploys/${dep.id}`))?.state;
  }
  if (state === 'error') throw new Error('Netlify could not finish the deploy — try again in a minute.');
  onProgress(`Wayzerr ${version} is live for everyone`);
  return { url: `https://${info.site}` };
}

module.exports = { check, publish };
