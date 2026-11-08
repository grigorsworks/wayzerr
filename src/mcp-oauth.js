// "Sign in" for online MCP servers that use OAuth (like Buffer's): you approve in your browser, the app keeps the token
// (encrypted) and refreshes it itself. Same flow Claude uses: dynamic client registration + PKCE.
const http = require('http');

// A provider the MCP SDK can use. Everything it must remember lives in server.oauth (one encrypted blob).
function makeProvider(server, { enc, dec, save }, redirectUrl, onRedirect) {
  const get = () => { try { return JSON.parse(dec(server.oauth) || '{}'); } catch (_) { return {}; } };
  const put = (patch) => { server.oauth = enc(JSON.stringify({ ...get(), ...patch })); save(); };
  return {
    get redirectUrl() { return redirectUrl; },
    get clientMetadata() { return { client_name: 'Wayzerr', redirect_uris: [redirectUrl], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }; },
    clientInformation: () => get().client,
    saveClientInformation: (c) => put({ client: c }),
    tokens: () => get().tokens,
    saveTokens: (t) => put({ tokens: t }),
    saveCodeVerifier: (v) => put({ verifier: v }),
    codeVerifier: () => get().verifier,
    redirectToAuthorization: (u) => { if (onRedirect) onRedirect(u); else throw new Error('Sign in to this app again (it needs your approval).'); },
    invalidateCredentials: (scope) => { const g = get(); if (scope === 'all') server.oauth = enc('{}'); else if (scope === 'tokens') put({ tokens: undefined }); else if (scope === 'client') put({ client: undefined }); save(); },
  };
}

// Run the whole sign-in. Resolves when the token is saved; `openUrl` opens the browser.
async function signIn(server, deps, openUrl) {
  const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
  let resolveCode, rejectCode;
  const codeP = new Promise((res, rej) => { resolveCode = res; rejectCode = rej; });
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://127.0.0.1');
    if (u.pathname !== '/callback') { res.writeHead(404); return res.end(); }
    const code = u.searchParams.get('code'), err = u.searchParams.get('error');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><meta charset="utf-8"><title>Wayzerr</title><body style="font:16px system-ui;background:#161616;color:#eee;display:grid;place-items:center;height:100vh;margin:0"><div>${code ? 'Connected. You can close this tab and go back to Wayzerr.' : 'Sign-in was cancelled. You can close this tab.'}</div>`);
    if (code) resolveCode(code); else rejectCode(new Error(err ? `Sign-in refused: ${err}` : 'Sign-in was cancelled.'));
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const redirectUrl = `http://127.0.0.1:${srv.address().port}/callback`;
  const timer = setTimeout(() => rejectCode(new Error('Sign-in took too long. Try again.')), 5 * 60 * 1000);
  try {
    const provider = makeProvider(server, deps, redirectUrl, (u) => openUrl(String(u)));
    const t = new StreamableHTTPClientTransport(new URL(server.url), { authProvider: provider });
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
    const c = new Client({ name: 'wayzerr-app', version: '1.0.0' });
    try { await c.connect(t); try { await c.close(); } catch (_) {} return; } // already signed in
    catch (e) { if (!/unauthorized/i.test(e.name + e.message)) throw e; }
    const code = await codeP;
    await t.finishAuth(code);
  } finally { clearTimeout(timer); srv.close(); }
}

module.exports = { makeProvider, signIn };
