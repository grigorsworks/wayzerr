// The Wayzerr account: you sign up or log in on the website (email + code), and this computer is "connected"
// with a token that is kept encrypted on this computer. No password ever passes through the app.
const fetch = require('./netfetch');

module.exports = function createAccount({ store, enc, dec, base, openUrl, onChange = () => {} }) {
  const data = () => store.data.account || null;
  let flow = null; // { deviceCode, userCode, url, expires, timer, error }
  let error = '';
  let required = false; // the website tells us whether it can send sign-in emails yet; until it can, nobody is asked to log in

  async function call(path, body, token) {
    const r = await fetch(base + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    let j = null; try { j = await r.json(); } catch (_) { /* not JSON */ }
    return { status: r.status, body: j || {} };
  }

  const state = () => ({
    signedIn: !!data()?.token,
    email: data()?.email || '',
    flow: flow ? { code: flow.userCode, url: flow.url } : null,
    error,
    required,
  });

  function stopFlow() { if (flow?.timer) clearTimeout(flow.timer); flow = null; }

  async function start() {
    stopFlow(); error = '';
    let r;
    try { r = await call('/api/device/start', {}); } catch (e) { error = "Couldn't reach Wayzerr. Check your internet connection and try again."; onChange(); throw new Error(error); }
    if (!r.body.ok) { error = r.body.error || 'Something went wrong. Try again.'; onChange(); throw new Error(error); }
    const f = flow = { deviceCode: r.body.device_code, userCode: r.body.user_code, url: r.body.verification_url, expires: Date.now() + r.body.expires_in * 1000, timer: null };
    onChange();
    openUrl(f.url);
    const tick = async () => {
      if (flow !== f) return;
      if (Date.now() > f.expires) { stopFlow(); error = 'That took too long. Press the button to try again.'; onChange(); return; }
      try {
        const p = await call('/api/device/poll', { device_code: f.deviceCode });
        if (flow !== f) return;
        if (p.body.status === 'approved' && p.body.token) {
          store.data.account = { email: p.body.email || '', token: enc(p.body.token), since: Date.now() };
          store.save(); stopFlow(); error = ''; onChange(); return;
        }
        if (p.body.status === 'expired') { stopFlow(); error = 'That sign-in link expired. Press the button to try again.'; onChange(); return; }
      } catch (_) { /* offline for a moment: keep trying */ }
      f.timer = setTimeout(tick, 3000);
    };
    f.timer = setTimeout(tick, 2500);
    return state();
  }

  function cancel() { stopFlow(); error = ''; onChange(); }

  async function logout() {
    const t = data()?.token ? dec(data().token) : '';
    store.data.account = null; store.save(); stopFlow();
    onChange();
    if (t) call('/api/auth/logout', {}, t).catch(() => {});
  }

  // On start: is this computer still connected? Only an answer of "no" signs out; being offline never does.
  async function check() {
    const t = data()?.token ? dec(data().token) : '';
    if (!t) return;
    try {
      const r = await call('/api/me', undefined, t);
      if (r.status === 401) { store.data.account = null; store.save(); onChange(); }
      else if (r.body.ok && r.body.email && r.body.email !== data()?.email) { data().email = r.body.email; store.save(); onChange(); }
    } catch (_) { /* offline */ }
  }

  async function probe() {
    try {
      const r = await call('/api/health');
      required = !!(r.body.ok && r.body.accounts && r.body.mail);
    } catch (_) { required = false; } // can't reach the site: never lock anyone out
    onChange();
  }

  return { state, start, cancel, logout, check, probe };
};
