// Server side of the anonymous usage count, for the deployed Worker `wayzerr-updates` (see legal/WORKER-USAGE-STATS.md).
// handleStats(req, env) answers /api/stats/ping (from the app) and /api/stats (the owner's page, password = env.STATS_KEY).
// It needs the D1 binding `wayzerr_accounts` (already there) and one new secret `STATS_KEY`.
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const json = (d, status = 200) => new Response(JSON.stringify(d), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const now = () => Math.floor(Date.now() / 1000);
const flag = (c) => (/^[A-Z]{2}$/.test(c || '') ? String.fromCodePoint(...[...c].map((ch) => 127397 + ch.charCodeAt(0))) : '🌍');
const DAY = 86400;

async function ensure(db) {
  await db.prepare('CREATE TABLE IF NOT EXISTS usage (n INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, first INTEGER NOT NULL, last INTEGER NOT NULL, opens INTEGER NOT NULL, country TEXT, version TEXT, os TEXT)').run();
}

async function ping(req, env) {
  const db = env.wayzerr_accounts;
  if (!db) return json({ ok: false }, 503);
  const b = await req.json().catch(() => ({}));
  const id = String(b.id || '');
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return json({ ok: false }, 400);
  const v = String(b.v || '').replace(/[^0-9A-Za-z.\-]/g, '').slice(0, 20);
  const os = ['mac', 'windows', 'linux'].includes(b.os) ? b.os : '';
  const country = (req.cf && req.cf.country) || req.headers.get('cf-ipcountry') || '';
  await ensure(db);
  const t = now();
  const row = await db.prepare('SELECT last FROM usage WHERE id = ?').bind(id).first();
  if (!row) await db.prepare('INSERT INTO usage (id, first, last, opens, country, version, os) VALUES (?, ?, ?, 1, ?, ?, ?)').bind(id, t, t, country, v, os).run();
  else if (t - row.last > 600) await db.prepare('UPDATE usage SET last = ?, opens = opens + 1, country = ?, version = ?, os = ? WHERE id = ?').bind(t, country, v, os, id).run(); // pings closer than 10 minutes are the same visit
  return json({ ok: true });
}

export function renderStats(rows, t = now()) {
  const active = (days) => rows.filter((r) => t - r.last < days * DAY).length;
  const byCountry = {};
  for (const r of rows) { const c = r.country || '??'; (byCountry[c] ||= { users: 0, opens: 0 }); byCountry[c].users++; byCountry[c].opens += r.opens; }
  const countries = Object.entries(byCountry).sort((a, b) => b[1].users - a[1].users || b[1].opens - a[1].opens);
  const ago = (s) => { const d = t - s; return d < 3600 ? Math.max(1, Math.round(d / 60)) + ' min ago' : d < DAY ? Math.round(d / 3600) + ' h ago' : Math.round(d / DAY) + ' days ago'; };
  const day = (s) => new Date(s * 1000).toISOString().slice(0, 10);
  const total = rows.reduce((a, r) => a + r.opens, 0);
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Wayzerr usage</title><style>
:root{--bg:#1b1b1b;--card:#242424;--line:#333;--tx:#ececec;--mut:#9a9a9a;--ac:#ff8a2b}
@media(prefers-color-scheme:light){:root{--bg:#f3f3f3;--card:#fff;--line:#e2e2e2;--tx:#1b1b1b;--mut:#6c6c6c}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--tx);font:15px -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;padding:32px 20px}
.w{max-width:860px;margin:0 auto}h1{font-size:22px;margin:0 0 4px}p.s{color:var(--mut);margin:0 0 22px}
.k{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:26px}.k div{background:var(--card);border:1px solid var(--line);border-radius:8px;padding:14px 16px}
.k b{display:block;font-size:28px;font-weight:600}.k span{color:var(--mut);font-size:13px}
h2{font-size:15px;margin:26px 0 10px}table{width:100%;border-collapse:collapse;background:var(--card);border:1px solid var(--line);border-radius:8px;overflow:hidden}
th,td{text-align:left;padding:10px 14px;border-bottom:1px solid var(--line)}th{color:var(--mut);font-weight:500;font-size:13px}tr:last-child td{border-bottom:0}td.n{text-align:right;font-variant-numeric:tabular-nums}th.n{text-align:right}
.on{color:var(--ac)}</style></head><body><div class="w"><h1>Wayzerr usage</h1><p class="s">Anonymous: every person is just a number. No names, no emails.</p>
<div class="k"><div><b>${rows.length}</b><span>people have used Wayzerr</span></div><div><b>${active(1)}</b><span>used it today</span></div><div><b>${active(7)}</b><span>in the last 7 days</span></div><div><b>${active(30)}</b><span>in the last 30 days</span></div><div><b>${total}</b><span>times opened, all together</span></div></div>
<h2>Countries</h2><table><tr><th>Country</th><th class="n">People</th><th class="n">Times opened</th></tr>${countries.map(([c, x]) => `<tr><td>${flag(c)} ${esc(c === '??' ? 'Unknown' : c)}</td><td class="n">${x.users}</td><td class="n">${x.opens}</td></tr>`).join('') || '<tr><td colspan="3">Nobody yet.</td></tr>'}</table>
<h2>Each person</h2><table><tr><th>Person</th><th>Country</th><th class="n">Times opened</th><th>First seen</th><th>Last seen</th><th>Version</th><th>System</th></tr>${rows.map((r, i) => `<tr><td>Person ${i + 1}</td><td>${flag(r.country)} ${esc(r.country || '?')}</td><td class="n"><b>${r.opens}</b></td><td>${day(r.first)}</td><td class="${t - r.last < DAY ? 'on' : ''}">${ago(r.last)}</td><td>${esc(r.version || '')}</td><td>${esc(r.os || '')}</td></tr>`).join('') || '<tr><td colspan="7">Nobody yet.</td></tr>'}</table>
<p class="s" style="margin-top:18px">"Times opened" counts one per start of the app, at most one every 10 minutes. People who switched the count off in Settings → Privacy are not included.</p></div></body></html>`;
}

async function page(req, env) {
  if (!env.STATS_KEY) return new Response('Not set up', { status: 503 });
  const m = /^Basic (.+)$/.exec(req.headers.get('authorization') || '');
  const pw = m ? atob(m[1]).split(':').slice(1).join(':') : '';
  const enc = new TextEncoder(), a = enc.encode(pw), b = enc.encode(env.STATS_KEY);
  let d = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) d |= (a[i] || 0) ^ b[i];
  if (d !== 0) return new Response('Password needed', { status: 401, headers: { 'www-authenticate': 'Basic realm="Wayzerr usage"', 'cache-control': 'no-store' } });
  const db = env.wayzerr_accounts;
  await ensure(db);
  const { results } = await db.prepare('SELECT first, last, opens, country, version, os FROM usage ORDER BY n').all();
  return new Response(renderStats(results || []), { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex' } });
}

export async function handleStats(req, env) {
  const p = new URL(req.url).pathname.replace(/\/+$/, '');
  if (p === '/api/stats/ping' && req.method === 'POST') return ping(req, env);
  if (p === '/api/stats' && req.method === 'GET') return page(req, env);
  return null;
}
