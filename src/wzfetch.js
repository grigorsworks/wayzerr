// Reaching wayzerr.com when your internet provider blocks it.
//
// wayzerr.com runs on Cloudflare. In some countries (for example Spain on football match days) providers block parts of
// Cloudflare's address list, so the normal address times out while other Cloudflare addresses still work. For wayzerr.com,
// when the normal way fails or is slow, this tries the same site through other Cloudflare addresses. The connection is
// still https to wayzerr.com (same certificate check, same name), only the numeric address differs.
//
// install() wraps the global fetch, so updates, connectors, accounts and everything else that talks to wayzerr.com get it.
const HOSTS = new Set(['wayzerr.com', 'www.wayzerr.com']);
const FALLBACK_IPS = ['104.21.32.1', '104.21.0.1', '104.21.64.1', '104.21.16.1', '104.21.48.1', '104.21.80.1'];
const PATIENCE_MS = 4000; // how long the normal way gets before the other addresses are tried as well
const PER_TRY_MS = 9000;

let undici = null;
try { undici = require('undici'); } catch (_) { /* without it, only the normal way is used */ }
const agents = new Map();
function agentFor(ip) {
  if (!undici) return null;
  if (!agents.has(ip)) {
    agents.set(ip, new undici.Agent({
      connect: {
        timeout: PER_TRY_MS,
        lookup: (host, opts, cb) => { const done = typeof opts === 'function' ? opts : cb; (opts && opts.all) ? done(null, [{ address: ip, family: 4 }]) : done(null, ip, 4); },
      },
    }));
  }
  return agents.get(ip);
}

let preferUntil = 0; // after the normal way failed, go straight to the other addresses for a while
let lastGood = 0;

function install() {
  const realFetch = globalThis.fetch;
  if (!realFetch || realFetch.__wz) return;
  const wrapped = async function (input, init) {
    let url;
    try { url = new URL(typeof input === 'string' ? input : input.url || String(input)); } catch (_) { return realFetch(input, init); }
    if (!undici || url.protocol !== 'https:' || !HOSTS.has(url.hostname) || (init && init.body && typeof init.body !== 'string' && !(init.body instanceof Uint8Array))) return realFetch(input, init);
    const outer = init && init.signal;
    const attempt = (ip) => {
      const ac = new AbortController();
      const onAbort = () => ac.abort(outer.reason);
      if (outer) { if (outer.aborted) ac.abort(outer.reason); else outer.addEventListener('abort', onAbort, { once: true }); }
      const timer = setTimeout(() => ac.abort(new Error('timeout')), PER_TRY_MS + 3000);
      const p = realFetch(input, { ...init, signal: ac.signal, ...(ip ? { dispatcher: agentFor(ip) } : {}) })
        .then((r) => { clearTimeout(timer); return r; }, (e) => { clearTimeout(timer); throw e; });
      return { p, ac, cancel: () => { try { ac.abort(); } catch (_) {} if (outer) outer.removeEventListener('abort', onAbort); } };
    };
    const order = () => { const i = FALLBACK_IPS.indexOf(FALLBACK_IPS[lastGood]); return FALLBACK_IPS.slice(i).concat(FALLBACK_IPS.slice(0, i)); };
    const viaOthers = async (shouldStop) => {
      let lastErr = null;
      for (const ip of order()) {
        if (shouldStop && shouldStop()) throw new Error('stopped');
        if (outer && outer.aborted) throw outer.reason || new Error('aborted');
        const t = attempt(ip);
        try { const r = await t.p; lastGood = FALLBACK_IPS.indexOf(ip); return r; } catch (e) { lastErr = e; }
      }
      throw lastErr || new Error('fetch failed');
    };
    if (Date.now() < preferUntil) {
      try { return await viaOthers(); } catch (_) { /* fall back to the normal way below */ }
    }
    const first = attempt(null);
    let settled = false;
    const normal = first.p.then((r) => { settled = true; return r; });
    const others = new Promise((resolve, reject) => {
      const start = () => { if (settled) return reject(new Error('normal way finished')); viaOthers(() => settled).then(resolve, reject); };
      const t = setTimeout(start, PATIENCE_MS);
      normal.then(() => clearTimeout(t), () => { clearTimeout(t); start(); }); // the normal way failed outright: no waiting
    });
    try {
      const r = await Promise.any([normal, others.then((x) => { first.cancel(); preferUntil = Date.now() + 10 * 60000; return x; })]);
      return r;
    } catch (e) {
      throw (e && e.errors && e.errors[0]) || e;
    }
  };
  wrapped.__wz = true;
  globalThis.fetch = wrapped;
}

module.exports = { install, FALLBACK_IPS };
