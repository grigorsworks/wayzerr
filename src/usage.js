// Anonymous usage count. Sends ONE small message to wayzerr.com when Wayzerr starts (and once a day while it stays open):
// a random install number (made here, not linked to your email or name), the app version and the system (mac/windows/linux).
// The country is worked out by the server from the connection, so Wayzerr never asks for your location.
// Nothing from chats, bots, memories or files is ever sent. Turn it off in Settings → Privacy.
const crypto = require('crypto');

function start({ store, version, origin, fetchImpl = fetch }) {
  const on = () => store.data.settings.shareUsage !== false;
  async function ping() {
    if (!on()) return;
    try {
      if (!store.data.usageId) { store.data.usageId = crypto.randomBytes(16).toString('base64url'); store.save(); }
      const os = process.platform === 'darwin' ? 'mac' : process.platform === 'win32' ? 'windows' : 'linux';
      await fetchImpl(origin.replace(/\/+$/, '') + '/api/stats/ping', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: store.data.usageId, v: String(version || ''), os }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (_) {} // offline or blocked: nobody needs to know
  }
  setTimeout(ping, 15000); // not while the app is still starting up
  const t = setInterval(ping, 24 * 3600 * 1000);
  t.unref?.();
  return { ping };
}
module.exports = { start };
