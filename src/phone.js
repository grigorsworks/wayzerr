// Wayzerr on your phone.
// The Mac app serves a small phone app. The bots keep running here on the computer, with their
// cloud brains (ChatGPT / Claude / Gemini sign-ins), memories and browsers; the phone is a
// window onto them. Every computer has its own permanent address (p-xxxx.wayzerr.com) through
// a Cloudflare tunnel, so a phone scanned once keeps working on any network; the home Wi-Fi
// address stays as a second way in.
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const PORT = Number(process.env.WAYZERR_PHONE_PORT || 47821);
const SPORT = PORT + 1; // the secure (https) door, for phones that trust this computer
const https = require('https');
const tls = require('./localtls');

function createPhone({ store, sendMessage, stopTurn, screen = async () => null, tap = async () => {}, scroll = async () => {}, onJoin = () => {}, getUpdate = () => null, doUpdate = async () => {}, checkUpdate = async () => null, profile = () => ({}), setProfile = () => {}, decline = () => {}, newBot = () => null, answerPermission = () => false, pendingAsks = () => [], newGroup = () => null, imageFile = () => null, theme = () => 'system', transcribe = null, voiceAvailable = () => false, tunnelInfo = async () => null, allowed = () => true, tasks = null, botTools = null, jsqrFile, dataDir, iconFile, mobileDir, charactersFile, onChange = () => {} }) {
  const newTok = () => crypto.randomBytes(18).toString('base64url');
  const hash = (k) => crypto.createHash('sha256').update(String(k)).digest('hex');
  const cfg = () => {
    const c = (store.data.phone ||= { enabled: false, remote: true });
    c.remote = true; // the permanent address is always on while Phone is on
    if (!c.invite) { c.invite = c.token || newTok(); c.inviteAt = Date.now(); } // the QR code's link (older versions called it token)
    if (!c.inviteAt) c.inviteAt = Date.now();
    delete c.token;
    c.devices ||= [];
    return c;
  };
  const joins = new Map(); // id -> { name, status: 'pending'|'ok'|'denied', key, at }
  const online = new Map(); // deviceId -> number of open live connections
  let server = null, tunnel = null, tunnelUrl = '', tunnelPermanent = false, tunnelErr = '', starting = null, inviteTimer = null;
  const clients = new Set();
  const busy = new Map(); // bot/group id -> what it's doing right now
  const busyOf = (id) => busy.get(id) || null;
  const tries = new Map(); // ip -> [timestamps]
  const nameFrom = (ua) => /iPhone/i.test(ua) ? 'iPhone' : /iPad/i.test(ua) ? 'iPad' : /Android/i.test(ua) ? (/Mobile/i.test(ua) ? 'Android phone' : 'Android tablet') : /Macintosh|Windows/i.test(ua) ? 'Computer' : 'Phone';
  function addDevice(name) {
    const c = cfg(), key = newTok();
    let n = name, i = 2; while (c.devices.some((d) => d.name === n)) n = `${name} ${i++}`;
    const d = { id: crypto.randomBytes(4).toString('hex'), name: n, key: hash(key), added: Date.now(), lastSeen: Date.now() };
    c.devices.push(d); store.save(); onChange();
    return { d, key };
  }
  let seenSave = 0;
  function deviceOf(req, u) {
    const k = String(req.headers['x-nx-key'] || u.searchParams.get('k') || '');
    if (!k) return null;
    const h = Buffer.from(hash(k));
    const d = cfg().devices.find((x) => { const b = Buffer.from(x.key); return b.length === h.length && crypto.timingSafeEqual(b, h); });
    if (d) { d.lastSeen = Date.now(); if (Date.now() - seenSave > 60000) { seenSave = Date.now(); store.save(); } }
    return d || null;
  }
  // The QR code works for one phone and for ten minutes, then it changes. Phones already connected keep their own key.
  const INVITE_TTL = 10 * 60000;
  const rotateInvite = () => { const c = cfg(); c.invite = newTok(); c.inviteAt = Date.now(); store.save(); };
  const freshInvite = () => { const c = cfg(); if (Date.now() - c.inviteAt > INVITE_TTL) rotateInvite(); return c.invite; };
  const isInvite = (k) => { const a = Buffer.from(String(k || '')), b = Buffer.from(freshInvite()); return a.length === b.length && crypto.timingSafeEqual(a, b); };
  // ---------- the phone code: the phone app asks for it before it shows anything ----------
  const DEFAULT_CODE = '250612';
  const lockOn = () => cfg().lock !== false;
  const codeIs = (code) => {
    const c = cfg(); code = String(code || '');
    if (!/^\d{6}$/.test(code)) return false;
    if (!c.code) return code === DEFAULT_CODE;
    const a = crypto.scryptSync(code, c.code.salt, 32), b = Buffer.from(c.code.hash, 'hex');
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const lockSecret = () => { const c = cfg(); if (!c.lockSecret) { c.lockSecret = crypto.randomBytes(24).toString('hex'); store.save(); } return c.lockSecret; };
  const SESSION_MS = 12 * 3600 * 1000;
  const sessSign = (devId, exp) => crypto.createHmac('sha256', lockSecret()).update(devId + '.' + exp).digest('hex');
  const sessionFor = (dev) => { const exp = Date.now() + SESSION_MS; return { token: exp + '.' + sessSign(dev.id, exp), exp }; };
  const unlocked = (req, u, dev) => {
    if (!lockOn()) return true;
    const t = String(req.headers['x-nx-sess'] || u.searchParams.get('s') || '');
    const i = t.indexOf('.'); if (i < 1) return false;
    const exp = Number(t.slice(0, i)); if (!(exp > Date.now())) return false;
    const a = Buffer.from(t.slice(i + 1)), b = Buffer.from(sessSign(dev.id, exp));
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  const codeTries = new Map(); // device id -> times of wrong codes
  const clientIp = (req) => { const ra = req.socket.remoteAddress || ''; return (/^(::1|127\.|::ffff:127\.)/.test(ra) && String(req.headers['cf-connecting-ip'] || '')) || ra; };

  // ---------- helpers ----------
  const lanIp = () => {
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address)) return a.address;
    return '';
  };
  const host = () => { const h = os.hostname(); return /\.local$/i.test(h) ? h : lanIp(); };
  const lanIps = () => { const out = []; for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal && !/^169\.254\./.test(a.address)) out.push(a.address); return out; };
  const localName = () => { const h = os.hostname().replace(/\.local$/i, ''); return /^[a-z0-9-]+$/i.test(h) ? h + '.local' : ''; };
  const links = () => {
    const k = freshInvite();
    const home = host() ? `http://${host()}:${PORT}/?join=${k}` : '';
    const ip = lanIp() ? `http://${lanIp()}:${PORT}/?join=${k}` : '';
    const sh = localName() || lanIp();
    return { home, ip, anywhere: tunnelUrl ? `${tunnelUrl}/?join=${k}` : '', permanent: !!tunnelPermanent, inviteMinutes: 10, secureBase: secure && sh ? `https://${sh}:${SPORT}` : '' };
  };
  const devices = () => cfg().devices.map((d) => ({ id: d.id, name: d.name, added: d.added, lastSeen: d.lastSeen, online: (online.get(d.id) || 0) > 0 })).sort((a, b) => (b.online - a.online) || (b.lastSeen - a.lastSeen));
  const state = () => ({ devices: devices(), enabled: !!cfg().enabled, remote: true, locked: !allowed(), lock: lockOn(), codeDefault: !cfg().code, running: !!server, ...links(), tunnelStarting: !!starting, tunnelError: tunnelErr });

  const json = (res, code, obj) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };
  const file = (res, f, type, extra = {}) => {
    try { const b = fs.readFileSync(f); res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-cache', ...extra }); res.end(b); }
    catch (_) { res.writeHead(404); res.end(); }
  };
  const body = (req, max = 12 * 1024 * 1024) => new Promise((resolve, reject) => {
    let n = 0; const parts = [];
    let over = false;
    req.on('data', (c) => { n += c.length; if (n > max) { if (!over) { over = true; reject(Object.assign(new Error('That is too big to send.'), { status: 413 })); } } else parts.push(c); });
    req.on('end', () => { if (over) return; try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8') || '{}')); } catch (e) { reject(Object.assign(new Error('Something went wrong sending that. Try again.'), { status: 400 })); } });
    req.on('error', reject);
  });

  const plainBots = () => (store.data.personas || []).map((p) => {
    const list = store.data.chats[p.id] || [];
    const last = [...list].reverse().find((m) => m.role === 'user' || m.role === 'assistant');
    return {
      id: p.id, name: p.name, tag: p.tag || '', group: !!p.group, members: p.members || [],
      character: p.character || null, avatar: p.avatar && /^data:image\//.test(p.avatar) ? p.avatar : null,
      last: last ? { role: last.role, text: String(last.content || '').replace(/<thinking>[\s\S]*?<\/thinking>/g, '').slice(0, 140), ts: last.ts || 0 } : null,
      busy: busyOf(p.id) || null,
      unread: (() => { const seen = (store.data.seen || {})[p.id] || 0; for (let i = list.length - 1; i >= 0; i--) { const m = list[i]; const bot = m.role === 'assistant' || (m.role === 'user' && m.from) || m.kind === 'botmsg'; if (bot) return (m.ts || 0) > seen && !!store.data.seen; if (m.role === 'user') return false; } return false; })(),
    };
  }).sort((a, b) => (b.last?.ts || 0) - (a.last?.ts || 0));

  const plainChat = (id) => {
    const names = Object.fromEntries((store.data.personas || []).map((p) => [p.id, p.name]));
    const no = new Set(Object.keys(store.data.appsDeclined || {}));
    const isGroup = (store.data.personas || []).some((p) => p.id === id && p.group);
    return (store.data.chats[id] || []).filter((m) => (['user', 'assistant', 'activity'].includes(m.role) || (m.role === 'card' && m.kind === 'app')) && !m.hidden).slice(-200).map((m) => m.kind === 'botmsg' ? (isGroup && !m.at && !m.toGroup ? { text: '' } : (() => { const ids = m.toGroup ? [...new Set((m.thread || []).map((t) => t.id).filter((x) => x && x !== m.fromId && names[x]))] : []; return { role: 'activity', talk: ids[0] || m.toId, pre: isGroup ? `${m.from} messaged` : 'Messaged', text: ids.length ? ids.slice(0, 3).map((x) => names[x]).join(', ') + (ids.length > 3 ? ` +${ids.length - 3}` : '') : names[m.toId] || m.to || 'a bot', ts: m.ts || 0 }; })())
      : m.role === 'user' && m.from?.id && names[m.from.id] ? { role: 'activity', talk: m.from.id, pre: 'Message from', text: names[m.from.id], ts: m.ts || 0 }
      : m.role === 'card' ? ({
      role: 'card', kind: 'app', id: m.id, slug: m.slug, text: m.name, desc: m.desc || '', ts: m.ts || 0,
      status: m.status === 'connected' || (store.data.composioLinked || []).includes(m.slug) ? 'connected' : m.status === 'declined' || no.has(m.slug) ? 'declined' : 'pending',
    }) : ({
      role: m.role,
      text: String(m.content || '').replace(/<thinking>[\s\S]*?<\/thinking>/g, '').replace(m.role === 'activity' ? /(^|\s*·\s*)Thought for [\dms ]+$/ : /$^/, '').trim(),
      ts: m.ts || 0,
      bot: m.bot ? (m.botName || names[m.bot] || '') : '',
      from: m.from?.name || '',
      images: (m.attachments || []).filter((a) => a.type === 'image').length,
      pic: m.image?.id || undefined,
      card: m.card ? true : undefined,
    })).filter((m) => m.text || m.images || m.pic);
  };

  // ---------- live updates (Server-Sent Events) ----------
  let pending = null;
  function emit(type, data) {
    if (!clients.size) return;
    const line = `event: ${type}\ndata: ${JSON.stringify(data || {})}\n\n`;
    for (const c of clients) { try { c.write(line); } catch (_) {} }
  }
  function forward(ch, data) {
    if (ch === 'chat-event' && data?.personaId) {
      if (data.type === 'status') busy.set(data.personaId, { activity: data.activity, text: data.text, bot: data.botName || '' });
      else if (data.type === 'done') busy.delete(data.personaId);
    }
    if (!clients.size) return;
    if (ch === 'state') { clearTimeout(pending); pending = setTimeout(() => emit('refresh', {}), 150); }
    else if (ch === 'chat-event' && data) emit('chat', { id: data.personaId, type: data.type, activity: data.activity, text: data.type === 'status' ? data.text : undefined, bot: data.botName || '' });
    else if (ch === 'update-available') emit('update', getUpdate() || {});
    else if (ch === 'update-progress' && data) emit('update-progress', { text: String(data) });
    else if (ch === 'permission-request' && data) emit('permission', { requestId: data.requestId, personaName: data.personaName, kind: data.kind || '', connectorName: data.connectorName, toolName: data.toolName, site: data.site || '', amount: data.amount || '', what: data.what || '' });
    else if (ch === 'permission-cancel' && data) emit('permission-done', { requestId: data.requestId });
  }

  // ---------- the web server ----------
  async function route(req, res) {
    const u = new URL(req.url, 'http://x');
    const p = u.pathname;
    if (p === '/' || p === '/index.html') {
      // Opening the QR code's link adds this phone and gives it its own login.
      const j = u.searchParams.get('join') || (isInvite(u.searchParams.get('k')) ? u.searchParams.get('k') : '');
      if (j) {
        if (!isInvite(j) || !cfg().enabled) { res.writeHead(302, { Location: '/?old=1' }); return res.end(); }
        const { key } = addDevice(nameFrom(req.headers['user-agent'] || ''));
        rotateInvite(); onChange(); // that code is used up
        res.writeHead(302, { Location: `/?k=${encodeURIComponent(key)}` }); return res.end();
      }
      // The Home Screen app opens its manifest's start address, so that address carries this phone's login.
      let html = fs.readFileSync(path.join(mobileDir, 'index.html'), 'utf8');
      const k = u.searchParams.get('k');
      if (k && deviceOf(req, u)) html = html.replace('href="/manifest.json"', `href="/manifest.json?k=${encodeURIComponent(k)}"`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      return res.end(html);
    }
    if (p === '/api/ping') { res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' }); return res.end(JSON.stringify({ ok: true, secure: !!req.socket.encrypted })); }
    if (p === '/nexarium.mobileconfig') {
      if (!caPair) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'application/x-apple-aspen-config', 'Content-Disposition': 'attachment; filename="Wayzerr.mobileconfig"', 'Cache-Control': 'no-store' });
      return res.end(tls.mobileconfig(caPair, os.hostname().replace(/\.local$/i, '')));
    }
    if (p === '/sw.js') return file(res, path.join(mobileDir, 'sw.js'), 'text/javascript; charset=utf-8', { 'Cache-Control': 'no-cache', 'Service-Worker-Allowed': '/' });
    if (p === '/jsqr.js') return file(res, jsqrFile, 'text/javascript; charset=utf-8', { 'Cache-Control': 'max-age=86400' });
    // Ask the computer to let this phone in (the computer shows Allow / Don't allow).
    if (p === '/api/join' && req.method === 'POST') {
      if (!cfg().enabled) return json(res, 403, { error: 'Phone is switched off on your computer.' });
      const ip = clientIp(req);
      const t = (tries.get(ip) || []).filter((x) => Date.now() - x < 60000);
      if (t.length >= 4) return json(res, 429, { error: 'Too many requests. Wait a minute and try again.' });
      t.push(Date.now()); tries.set(ip, t);
      for (const [id, x] of joins) if (Date.now() - x.at > 5 * 60000) joins.delete(id);
      if ([...joins.values()].filter((x) => x.status === 'pending').length >= 3) return json(res, 429, { error: 'Answer the requests waiting on your computer first.' });
      const id = crypto.randomBytes(8).toString('hex');
      const name = nameFrom(req.headers['user-agent'] || '');
      joins.set(id, { name, status: 'pending', at: Date.now() });
      onJoin({ id, name });
      return json(res, 200, { id });
    }
    if (p === '/api/join' && req.method === 'GET') {
      const id = u.searchParams.get('id') || '';
      const x = joins.get(id);
      if (!x) return json(res, 404, { status: 'gone' });
      if (x.status === 'ok') { joins.delete(id); return json(res, 200, { status: 'ok', key: x.key }); }
      if (x.status === 'denied') joins.delete(id);
      return json(res, 200, { status: x.status });
    }
    if (p === '/characters.js') return file(res, charactersFile, 'text/javascript; charset=utf-8');
    if (p === '/talk.js') return file(res, path.join(__dirname, 'renderer', 'talk.js'), 'text/javascript; charset=utf-8');
    if (p === '/icon.png' || p === '/apple-touch-icon.png') return file(res, iconFile, 'image/png', { 'Cache-Control': 'max-age=86400' });
    if (p === '/manifest.json') {
      const k = /^[\w-]{10,64}$/.test(u.searchParams.get('k') || '') ? u.searchParams.get('k') : '';
      return json(res, 200, { name: 'Wayzerr', short_name: 'Wayzerr', start_url: k ? `/?k=${k}` : '/', display: 'standalone', background_color: '#000000', theme_color: '#000000', icons: [{ src: '/icon.png', sizes: '1024x1024', type: 'image/png' }] });
    }
    if (!p.startsWith('/api/')) { res.writeHead(404); return res.end(); }
    const dev = deviceOf(req, u);
    if (!dev) return json(res, 401, { error: 'This phone isn’t connected anymore. Connect it again.' });
    if (p === '/api/lock') return json(res, 200, { required: lockOn(), unlocked: unlocked(req, u, dev) });
    if (p === '/api/unlock' && req.method === 'POST') {
      const b = await body(req, 1024);
      const t = (codeTries.get(dev.id) || []).filter((x) => Date.now() - x < 10 * 60000);
      if (t.length >= 5) return json(res, 429, { error: 'Too many wrong codes. Wait 10 minutes and try again.' });
      if (!lockOn() || codeIs(b.code)) { codeTries.delete(dev.id); return json(res, 200, sessionFor(dev)); }
      t.push(Date.now()); codeTries.set(dev.id, t);
      return json(res, 403, { error: t.length >= 5 ? 'Too many wrong codes. Wait 10 minutes and try again.' : 'That code is not right.' });
    }
    if (!unlocked(req, u, dev)) return json(res, 423, { error: 'Enter your phone code.', locked: true });

    if (p === '/api/state') return json(res, 200, { mac: os.hostname().replace(/\.local$/i, ''), bots: plainBots(), update: getUpdate(), voice: !!(transcribe && voiceAvailable()), theme: theme() });
    if (p === '/api/transcribe' && req.method === 'POST') {
      if (!transcribe) return json(res, 404, { error: 'Speech to text is not available.' });
      const b = await body(req, 25 * 1024 * 1024);
      try { const r = await transcribe(Buffer.from(String(b.data || ''), 'base64'), String(b.mime || 'audio/mp4')); return json(res, 200, { text: r.text }); }
      catch (e) { return json(res, 400, { error: e.message }); }
    }
    if (p === '/api/image') { const f = imageFile(u.searchParams.get('id')); if (!f) return json(res, 404, { error: 'Not found' }); res.writeHead(200, { 'Content-Type': /\.jpg$/.test(f) ? 'image/jpeg' : /\.webp$/.test(f) ? 'image/webp' : 'image/png', 'Cache-Control': 'private, max-age=31536000' }); return require('fs').createReadStream(f).pipe(res); }
    if (p === '/api/chat') { const cid = u.searchParams.get('id'); if (cid && store.data.seen) { store.data.seen[cid] = Date.now(); store.save(); } }
    if (p === '/api/chat') return json(res, 200, { id: u.searchParams.get('id'), messages: plainChat(u.searchParams.get('id')), busy: busyOf(u.searchParams.get('id')) || null });
    if (p === '/api/events') {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write('retry: 3000\n\n');
      res.dev = dev.id;
      clients.add(res);
      online.set(dev.id, (online.get(dev.id) || 0) + 1); onChange();
      const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (_) {} }, 20000);
      req.on('close', () => { clearInterval(ping); clients.delete(res); online.set(dev.id, Math.max(0, (online.get(dev.id) || 1) - 1)); onChange(); });
      return;
    }
    if (p === '/api/send' && req.method === 'POST') {
      const b = await body(req);
      const bot = (store.data.personas || []).find((x) => x.id === b.id);
      if (!bot) return json(res, 404, { error: 'That bot is gone.' });
      const text = String(b.text || '').slice(0, 20000);
      const attachments = (Array.isArray(b.images) ? b.images : []).filter((d) => /^data:image\/(png|jpe?g|webp|gif);base64,/.test(d)).slice(0, 4).map((d, i) => ({ type: 'image', name: `photo-${i + 1}.jpg`, dataUrl: d }));
      if (!text.trim() && !attachments.length) return json(res, 400, { error: 'Type a message first.' });
      sendMessage(bot.id, text, attachments).catch(() => {});
      return json(res, 200, { ok: true });
    }
    if (p === '/api/screen') return json(res, 200, (await screen(u.searchParams.get('id') || '')) || { hasPage: false });
    if (p === '/api/tap' && req.method === 'POST') { const b = await body(req, 4096); await tap(String(b.id || ''), Number(b.x), Number(b.y)); return json(res, 200, { ok: true }); }
    if (p === '/api/scroll' && req.method === 'POST') { const b = await body(req, 4096); await scroll(String(b.id || ''), Number(b.dy) || 0); return json(res, 200, { ok: true }); }
    if (p === '/api/update' && req.method === 'GET') return json(res, 200, getUpdate() || { available: false });
    if (p === '/api/update/check' && req.method === 'POST') { await checkUpdate().catch(() => {}); return json(res, 200, getUpdate() || { available: false }); }
    // Settings on the phone: you, this phone, the computer.
    if (p === '/api/me' && req.method === 'GET') return json(res, 200, { ...profile(), phone: { id: dev.id, name: dev.name, added: dev.added }, computer: os.hostname().replace(/\.local$/i, ''), anywhere: !!tunnelUrl, update: getUpdate(), secureBase: links().secureBase, isSecure: !!req.socket.encrypted, viaAnywhere: /trycloudflare\.com|\.wayzerr\.com/i.test(req.headers.host || ''), permanent: !!tunnelPermanent });
    if (p === '/api/me' && req.method === 'POST') { const b = await body(req, 4096); setProfile({ userName: b.userName, phoneName: b.phoneName, devId: dev.id }); if (b.phoneName) { dev.name = String(b.phoneName).trim().slice(0, 40) || dev.name; store.save(); onChange(); } return json(res, 200, { ok: true }); }
    if (p === '/api/logout' && req.method === 'POST') { cfg().devices = cfg().devices.filter((d) => d.id !== dev.id); store.save(); onChange(); return json(res, 200, { ok: true }); }
    if (p === '/api/update' && req.method === 'POST') {
      const up = getUpdate();
      if (!up?.available) return json(res, 400, { error: 'Wayzerr is already up to date.' });
      json(res, 200, { ok: true });
      setTimeout(() => doUpdate().catch((e) => emit('notice', { text: 'Update failed: ' + e.message })), 300);
      return;
    }
    if (p === '/api/bots' && req.method === 'POST') { const b = await body(req, 20000); try { return json(res, 200, { id: newBot(b) }); } catch (e) { return json(res, 400, { error: e.message }); } }
    if (p === '/api/groups' && req.method === 'POST') { const b = await body(req, 20000); try { return json(res, 200, { id: newGroup(b) }); } catch (e) { return json(res, 400, { error: e.message }); } }
    if (p === '/api/permission' && req.method === 'POST') { const b = await body(req, 4096); return json(res, 200, { ok: answerPermission(String(b.requestId || ''), ['deny', 'once', 'always'].includes(b.answer) ? b.answer : 'deny') }); }
    if (p === '/api/permissions') return json(res, 200, { asks: pendingAsks() });
    if (p === '/api/decline' && req.method === 'POST') { const b = await body(req, 4096); decline(String(b.slug || ''), String(b.id || ''), String(b.card || '')); return json(res, 200, { ok: true }); }
    // Tasks (schedules) and bot settings from the phone.
    const ok = async (fn) => { try { const v = await fn(); return json(res, 200, v === undefined ? { ok: true } : (typeof v === 'object' && v ? v : { ok: true, value: v })); } catch (e) { return json(res, 400, { error: e.message }); } };
    if (tasks && p === '/api/tasks' && req.method === 'GET') return ok(() => tasks.list());
    if (tasks && p === '/api/tasks/save' && req.method === 'POST') { const b = await body(req, 20000); return ok(async () => ({ id: await tasks.save(b) })); }
    if (tasks && p === '/api/tasks/delete' && req.method === 'POST') { const b = await body(req, 4096); return ok(() => tasks.remove(b.id)); }
    if (tasks && p === '/api/tasks/toggle' && req.method === 'POST') { const b = await body(req, 4096); return ok(() => tasks.toggle(b)); }
    if (tasks && p === '/api/tasks/run' && req.method === 'POST') { const b = await body(req, 4096); return ok(() => tasks.run(b.id)); }
    if (botTools && p === '/api/bot' && req.method === 'GET') return ok(() => botTools.get(u.searchParams.get('id') || ''));
    if (botTools && p === '/api/bot/edit' && req.method === 'POST') { const b = await body(req, 20000); return ok(() => botTools.edit(b)); }
    if (botTools && p === '/api/bot/clear' && req.method === 'POST') { const b = await body(req, 4096); return ok(() => botTools.clear(b.id)); }
    if (botTools && p === '/api/bot/delete' && req.method === 'POST') { const b = await body(req, 4096); return ok(() => botTools.remove(b.id)); }
    if (botTools && p === '/api/bot/forget' && req.method === 'POST') { const b = await body(req, 4096); return ok(() => botTools.forget(b)); }
    if (p === '/api/stop' && req.method === 'POST') { const b = await body(req); stopTurn(String(b.id || '')); return json(res, 200, { ok: true }); }
    return json(res, 404, { error: 'Unknown' });
  }

  let secure = null, caPair = null;
  function startSecure() {
    if (secure) return;
    try {
      caPair = tls.ensureCA(path.join(dataDir, 'phone-tls'));
      const names = [localName(), os.hostname(), 'localhost'].filter(Boolean);
      const { key, cert } = tls.serverCert(path.join(dataDir, 'phone-tls'), caPair, [...new Set(names)], [...lanIps(), '127.0.0.1']);
      const s = https.createServer({ key, cert }, (req, res) => { route(req, res).catch((e) => { try { if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong on your computer. Try again.' }); } catch (_) {} }); });
      s.on('error', () => { secure = null; });
      s.listen(SPORT, '0.0.0.0', () => { secure = s; onChange(); });
    } catch (_) { secure = null; }
  }
  function startServer() {
    if (!secure) setTimeout(startSecure, 50);
    if (server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = http.createServer((req, res) => { route(req, res).catch((e) => { try { if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Something went wrong on your computer. Try again.' }); } catch (_) {} }); });
      s.on('error', (e) => { server = null; reject(new Error(e.code === 'EADDRINUSE' ? `Port ${PORT} is busy — quit other copies of Wayzerr.` : e.message)); });
      s.listen(PORT, '0.0.0.0', () => { server = s; resolve(); });
    });
  }
  function stopServer() { for (const c of clients) { try { c.end(); } catch (_) {} } clients.clear(); online.clear(); for (const s of [server, secure]) if (s) { s.close(); try { s.closeAllConnections(); } catch (_) {} } server = null; secure = null; }

  // ---------- the permanent address: a Cloudflare tunnel named for this computer (wayzerr.com hands it out) ----------
  const binDir = path.join(dataDir, 'bin');
  const cfBin = path.join(binDir, process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared');
  const run = (cmd, args) => new Promise((res, rej) => execFile(cmd, args, (e, so, se) => (e ? rej(new Error(String(se || e.message).slice(0, 200))) : res(so))));
  async function ensureCloudflared() {
    if (fs.existsSync(cfBin)) return cfBin;
    fs.mkdirSync(binDir, { recursive: true });
    const arch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    // A pinned version with known checksums (from Cloudflare's release page): a different file is never run.
    const CF_VERSION = '2026.10.1';
    const CF_SHA256 = {
      'cloudflared-darwin-amd64.tgz': '3b0dbaf378337e9d7fb6cd235a76d1d6a7dee434c2d8edf9281164fb6a3837ab',
      'cloudflared-darwin-arm64.tgz': '647615df99d49cd179ea5e13ef760b9bbfb33630f6ae62f87e33dfadda60adcc',
      'cloudflared-linux-amd64': '3bfc539f45d2620c71debb7a86be0efa737ed5ccbad9eb85c787116900e5c586',
      'cloudflared-linux-arm64': '2c65dfabf616c40efc7545d107d7a57ad5e21377e2964b7e88af19a238074a46',
      'cloudflared-windows-amd64.exe': '4d2490e74082c5d48dbfedaf92576fa5bd1702379ab88eb7faa0cfbe8dc891b6',
    };
    const base = `https://github.com/cloudflare/cloudflared/releases/download/${CF_VERSION}/`;
    // Mac: a .tgz; Windows: an .exe; Linux: the program itself.
    const name = process.platform === 'darwin' ? `cloudflared-darwin-${arch}.tgz` : process.platform === 'win32' ? `cloudflared-windows-${arch}.exe` : `cloudflared-linux-${arch}`;
    const r = await fetch(base + name);
    if (!r.ok) throw new Error("Couldn't download the secure link helper (" + r.status + ').');
    const buf = Buffer.from(await r.arrayBuffer());
    if (!CF_SHA256[name]) throw new Error("The secure link helper isn't available for this kind of computer yet.");
    if (require('crypto').createHash('sha256').update(buf).digest('hex') !== CF_SHA256[name]) throw new Error("The downloaded secure link helper isn't the file Wayzerr expects, so it was not used.");
    if (process.platform === 'darwin') {
      const tgz = path.join(binDir, 'cloudflared.tgz');
      fs.writeFileSync(tgz, buf);
      await run('/usr/bin/tar', ['-xzf', tgz, '-C', binDir]);
      fs.rmSync(tgz, { force: true });
      fs.chmodSync(cfBin, 0o755);
    } else {
      fs.writeFileSync(cfBin, buf);
      if (process.platform !== 'win32') fs.chmodSync(cfBin, 0o755);
    }
    return cfBin;
  }
  // Start the tunnel; if the normal way (QUIC) is blocked on this network, try again over HTTP/2.
  // Everything cloudflared says goes to a log file, and the last useful line is shown if it fails.
  const logFile = () => path.join(dataDir, 'use-anywhere.log');
  // If Wayzerr crashed last time, its tunnel helper may still be running and would answer for this computer's address with nothing behind it: stop it first.
  const pidFile = () => path.join(dataDir, 'tunnel.pid');
  function killStale() {
    try {
      const pid = Number(fs.readFileSync(pidFile(), 'utf8'));
      if (pid > 1 && pid !== process.pid) {
        let name = '';
        try { name = require('child_process').execFileSync(process.platform === 'win32' ? 'tasklist' : 'ps', process.platform === 'win32' ? ['/FI', `PID eq ${pid}`, '/NH'] : ['-p', String(pid), '-o', 'comm='], { encoding: 'utf8', timeout: 4000 }); } catch (_) {}
        if (/cloudflared/i.test(name)) process.kill(pid);
      }
    } catch (_) {}
    try { fs.rmSync(pidFile(), { force: true }); } catch (_) {}
  }
  // With `info` ({ host, token }) it runs this computer's own tunnel; without it, it falls back to a free temporary address.
  function runTunnel(bin, protocol, info) {
    return new Promise((resolve, reject) => {
      const args = info ? ['tunnel', '--no-autoupdate', '--protocol', protocol, 'run'] : ['tunnel', '--no-autoupdate', '--protocol', protocol, '--url', `http://127.0.0.1:${PORT}`];
      const t = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, TUNNEL_ORIGIN_CERT: '', ...(info ? { TUNNEL_TOKEN: info.token } : {}) } });
      tunnel = t;
      try { fs.writeFileSync(pidFile(), String(t.pid)); } catch (_) {}
      let lastErr = '', done = false;
      const log = fs.createWriteStream(logFile(), { flags: 'a' });
      log.write(`\n--- ${new Date().toISOString()} starting (${protocol})\n`);
      const timer = setTimeout(() => { if (!done) { done = true; reject(new Error(lastErr || 'The secure link took too long to start.')); try { t.kill(); } catch (_) {} } }, 60000);
      const look = (buf) => {
        const txt = String(buf); log.write(txt);
        for (const line of txt.split('\n')) if (/ERR|error|failed/i.test(line)) lastErr = line.replace(/^\S+\s+ERR\s*/, '').replace(/\s+/g, ' ').trim().slice(0, 160);
        const m = info ? (/Registered tunnel connection/.test(txt) ? ['https://' + info.host] : null) : txt.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m && !done) { done = true; tunnelUrl = m[0]; tunnelPermanent = !!info; clearTimeout(timer); resolve(); onChange(); }
      };
      t.stdout.on('data', look); t.stderr.on('data', look);
      t.on('error', (e) => { if (!done) { done = true; clearTimeout(timer); reject(e); } });
      t.on('exit', (code) => {
        log.end(`--- exited (${code})\n`);
        try { if (Number(fs.readFileSync(pidFile(), 'utf8')) === t.pid) fs.rmSync(pidFile(), { force: true }); } catch (_) {}
        const wasUp = !!tunnelUrl && tunnel === t;
        if (tunnel === t) { tunnel = null; tunnelUrl = ''; tunnelPermanent = false; }
        clearTimeout(timer);
        if (!done) { done = true; reject(new Error(lastErr || 'The secure link stopped.')); }
        // It was working and stopped (sleep, network change): start again by itself.
        if (wasUp && cfg().enabled) setTimeout(() => startTunnel(), 3000);
        onChange();
      });
    });
  }
  function startTunnel() {
    if (tunnel || starting) return starting || Promise.resolve();
    tunnelErr = '';
    starting = (async () => {
      killStale();
      const bin = await ensureCloudflared();
      let info = null;
      try { info = await tunnelInfo(PORT); } catch (e) { fs.appendFileSync(logFile(), `\n--- permanent address unavailable: ${e.message}\n`); }
      try { await runTunnel(bin, 'quic', info); }
      catch (e) { stopTunnel(); await runTunnel(bin, 'http2', info); }
    })().catch((e) => { tunnelErr = 'The secure link couldn’t start: ' + e.message + ' (Check this computer has internet.)'; stopTunnel(); setTimeout(() => { if (cfg().enabled && !tunnel) startTunnel(); }, 30000); }).finally(() => { starting = null; onChange(); });
    return starting;
  }
  function stopTunnel() { try { tunnel?.kill(); } catch (_) {} tunnel = null; tunnelUrl = ''; tunnelPermanent = false; }

  // ---------- public ----------
  async function apply() {
    const c = cfg();
    if (c.enabled && allowed()) {
      await startServer(); startTunnel();
      // the QR code changes by itself when its ten minutes are nearly up
      if (!inviteTimer) inviteTimer = setInterval(() => { const cc = cfg(); if (cc.enabled && Date.now() - cc.inviteAt > INVITE_TTL - 60000) { rotateInvite(); onChange(); } }, 20000);
    } else { stopTunnel(); stopServer(); clearInterval(inviteTimer); inviteTimer = null; }
    store.save();
    onChange();
    return state();
  }
  async function set(patch) {
    const c = cfg();
    if ('enabled' in patch) c.enabled = !!patch.enabled;
    if (patch.retryTunnel) { stopTunnel(); tunnelErr = ''; if (c.enabled) startTunnel(); }
    if (patch.newCode) rotateInvite();
    if ('lock' in patch) c.lock = !!patch.lock;
    if (patch.code !== undefined) {
      if (!/^\d{6}$/.test(String(patch.code))) throw new Error('The code is 6 numbers.');
      const salt = crypto.randomBytes(12).toString('hex');
      c.code = { salt, hash: crypto.scryptSync(String(patch.code), salt, 32).toString('hex') };
      c.lockSecret = crypto.randomBytes(24).toString('hex'); // phones have to enter the new code
      codeTries.clear();
    }
    if (patch.newKey) { c.invite = newTok(); c.inviteAt = Date.now(); c.devices = []; for (const cl of clients) { try { cl.end(); } catch (_) {} } clients.clear(); online.clear(); }
    if (patch.remove) { c.devices = c.devices.filter((d) => d.id !== patch.remove); for (const cl of [...clients]) if (cl.dev === patch.remove) { try { cl.end(); } catch (_) {} clients.delete(cl); } online.delete(patch.remove); }
    if (patch.rename && patch.name) { const d = c.devices.find((x) => x.id === patch.rename); if (d) d.name = String(patch.name).trim().slice(0, 40) || d.name; }
    if (patch.answer) {
      const x = joins.get(patch.answer);
      if (x && x.status === 'pending') { if (patch.allow) { const { key } = addDevice(x.name); x.status = 'ok'; x.key = key; } else x.status = 'denied'; }
    }
    return apply();
  }
  async function qr(text) {
    const QR = require('qrcode');
    return text ? QR.toString(text, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }) : '';
  }

  return { state, set, apply, forward, qr, stop: () => { clearInterval(inviteTimer); stopTunnel(); stopServer(); }, port: PORT };
}

module.exports = { createPhone };
