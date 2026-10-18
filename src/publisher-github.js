// Publish a build as a GitHub Release: Wayzerr.dmg + latest.json (GitHub allows files up to 2 GB).
const fs = require('fs');
const API = process.env.WAYZERR_GH_API || 'https://api.github.com';
const UPLOADS = process.env.WAYZERR_GH_UPLOADS || 'https://uploads.github.com';

async function gh(token, method, url, body, headers = {}) {
  const r = await fetch(url.startsWith('http') ? url : API + url, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'Wayzerr-app', ...headers },
    body,
    signal: AbortSignal.timeout(20 * 60 * 1000),
  });
  const text = await r.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (_) {}
  if (!r.ok) {
    const e = new Error(r.status === 401 ? "GitHub didn't accept the key — make a new one and paste it again." : r.status === 403 || r.status === 404 ? `GitHub says the key can't write to ${url.split('/repos/')[1]?.split('/').slice(0, 2).join('/') || 'that repository'} — give it "Contents: Read and write" for that repository.` : `GitHub error ${r.status}: ${json?.message || text.slice(0, 120)}`);
    e.status = r.status;
    throw e;
  }
  return json;
}

async function check(token, repo) {
  const me = await gh(token, 'GET', '/user').catch(() => null);
  const info = await gh(token, 'GET', `/repos/${repo}`);
  return { user: me?.login || '', site: info.full_name };
}

async function publish({ token, repo, file, version, build, notes = [], onProgress = () => {} }) {
  const tag = `v${version}`;
  onProgress(`Publishing Wayzerr ${version} for everyone…`);
  const info = await gh(token, 'GET', `/repos/${repo}`);
  if (!info.size) await gh(token, 'PUT', `/repos/${repo}/contents/README.md`, JSON.stringify({ message: 'Add README', content: Buffer.from('# Wayzerr\n\nDownload the app from Releases.\n').toString('base64') })).catch(() => {});
  let rel = await gh(token, 'GET', `/repos/${repo}/releases/tags/${tag}`).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
  if (rel) {
    for (const a of rel.assets || []) if (/^(Wayzerr\.dmg|Nexarium\.dmg|Wayzerr\.dmg|latest\.json)$/.test(a.name)) await gh(token, 'DELETE', `/repos/${repo}/releases/assets/${a.id}`);
  } else {
    rel = await gh(token, 'POST', `/repos/${repo}/releases`, JSON.stringify({
      tag_name: tag, name: `Wayzerr ${version}`, make_latest: 'true',
      body: (notes.length ? notes.map((n) => `- ${n}`).join('\n') : 'Improvements and fixes.') + '\n\nDownload **Wayzerr.dmg** below, open it and drag Wayzerr into Applications.',
    }), { 'Content-Type': 'application/json' });
  }
  const up = (name, data, type) => gh(token, 'POST', `${UPLOADS}/repos/${repo}/releases/${rel.id}/assets?name=${encodeURIComponent(name)}`, data, { 'Content-Type': type, 'Content-Length': String(data.length) });
  onProgress('Uploading Wayzerr.dmg…');
  await up('Wayzerr.dmg', fs.readFileSync(file), 'application/octet-stream');
  await up('latest.json', Buffer.from(JSON.stringify({ version, build: build || null, url: `https://github.com/${repo}/releases/latest/download/Wayzerr.dmg`, notes }, null, 2)), 'application/json');
  if (rel.draft || rel.prerelease) await gh(token, 'PATCH', `/repos/${repo}/releases/${rel.id}`, JSON.stringify({ draft: false, prerelease: false, make_latest: 'true' }), { 'Content-Type': 'application/json' });
  onProgress(`Wayzerr ${version} is live for everyone`);
  return { url: rel.html_url };
}
module.exports = { check, publish };
