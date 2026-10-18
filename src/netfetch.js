// fetch() that still works when a network cannot reach the one address Cloudflare gave out for Wayzerr's server
// (some internet providers block parts of Cloudflare). If the normal request cannot connect, it asks other Cloudflare
// addresses for the same site; the secure connection still checks the site's real name, so nothing is weakened.
const https = require('https');
const { Readable } = require('stream');

const BACKUP_IPS = ['104.18.2.1', '172.67.74.1', '104.21.1.1', '162.159.140.1', '188.114.98.5'];
const viaIp = (url, ip, opts = {}) => new Promise((resolve, reject) => {
  const u = new URL(url);
  const req = https.request({ host: ip, servername: u.hostname, port: 443, path: u.pathname + u.search, method: 'GET', headers: { host: u.host, ...(opts.headers || {}) }, timeout: 8000 }, (res) => {
    const headers = new Headers();
    for (const [k, v] of Object.entries(res.headers)) if (v !== undefined) headers.set(k, Array.isArray(v) ? v.join(', ') : v);
    const noBody = res.statusCode === 204 || res.statusCode === 304;
    resolve(new Response(noBody ? null : Readable.toWeb(res), { status: res.statusCode, headers }));
  });
  req.on('timeout', () => req.destroy(new Error('timeout')));
  req.on('error', reject);
  opts.signal?.addEventListener('abort', () => req.destroy(new Error('aborted')));
  req.end();
});

const backup = async (url, opts) => {
  let last;
  for (const ip of BACKUP_IPS) { try { return await viaIp(url, ip, opts); } catch (err) { last = err; } }
  throw last;
};

module.exports = function netfetch(url, opts = {}) {
  if (!/\.workers\.dev$/i.test(new URL(url).hostname)) return fetch(url, opts); // only Wayzerr's own server gets the backup route
  // ask the normal way; if nothing has answered after 3 seconds, also try the other addresses and take whichever answers first
  return new Promise((resolve, reject) => {
    let settled = false, failures = 0, started = false, firstErr = null;
    const done = (r) => { if (!settled) { settled = true; clearTimeout(timer); resolve(r); } };
    const fail = (e) => { firstErr ||= e; if (++failures >= (started ? 2 : 1) && !(failures === 1 && !started)) { if (!settled) { settled = true; clearTimeout(timer); reject(firstErr); } } else if (!started) { start(); } };
    const start = () => { if (started || settled) return; started = true; backup(url, opts).then(done, fail); };
    const timer = setTimeout(start, 3000);
    fetch(url, opts).then(done, (e) => { if (opts.signal?.aborted) { if (!settled) { settled = true; clearTimeout(timer); reject(e); } } else fail(e); });
  });
};
