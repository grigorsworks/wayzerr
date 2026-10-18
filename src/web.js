// Fast web research for bots: search and read many pages at the same time, as plain text,
// without opening them in the bot's visible browser (that one is for clicking, logging in and posting).
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
const MAX_BYTES = 2_500_000;

async function get(url, { timeout = 10000, method = 'GET', body, headers = {} } = {}) {
  const r = await fetch(url, { method, body, redirect: 'follow', signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9', Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', ...headers } });
  const type = r.headers.get('content-type') || '';
  const reader = r.body?.getReader();
  const parts = []; let n = 0;
  if (reader) {
    for (;;) { const { done, value } = await reader.read(); if (done) break; n += value.length; parts.push(value); if (n > MAX_BYTES) { try { await reader.cancel(); } catch (_) {} break; } }
  }
  return { ok: r.ok, status: r.status, url: r.url || url, type, body: Buffer.concat(parts.map((p) => Buffer.from(p))).toString('utf8') };
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', copy: '©', eacute: 'é', aacute: 'á', iacute: 'í', oacute: 'ó', uacute: 'ú', ntilde: 'ñ' };
const decode = (s) => String(s || '').replace(/&(#x?[0-9a-f]+|\w+);/gi, (m, e) => e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e.toLowerCase()] ?? m);
const strip = (s) => decode(String(s || '').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// HTML page → title + readable text (paragraphs kept, menus/scripts/ads dropped as far as possible).
function pageText(html) {
  const title = strip((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '');
  let h = html.replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style|noscript|svg|canvas|iframe|template|form|button|select)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(nav|footer|header|aside)[\s\S]*?<\/\1>/gi, ' ');
  const main = h.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i);
  if (main && main[2].length > 1500) h = main[2];
  h = h.replace(/<\/?(p|div|section|li|h[1-6]|tr|br|blockquote|pre|dd|dt)[^>]*>/gi, '\n');
  const lines = decode(h.replace(/<[^>]+>/g, ' ')).split('\n').map((l) => l.replace(/\s+/g, ' ').trim()).filter((l) => l.length > 1);
  // drop very short menu-like lines that repeat, keep real text
  const out = []; const seen = new Set();
  for (const l of lines) { if (seen.has(l)) continue; seen.add(l); if (l.length < 25 && !/[.!?:]$/.test(l) && out.length && out[out.length - 1].length < 25) continue; out.push(l); }
  return { title, text: out.join('\n') };
}

// ---- search: no key needed (DuckDuckGo's plain HTML page, Bing as a backup) ----
async function searchDuck(q) {
  const r = await get('https://html.duckduckgo.com/html/', { method: 'POST', body: new URLSearchParams({ q, kl: 'wt-wt' }).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 9000 });
  if (!r.ok) throw new Error('search ' + r.status);
  const res = [];
  const blocks = r.body.split(/(?=<a[^>]+class="result__a")/).slice(1);
  for (const b of blocks) {
    if (res.length >= 10) break;
    const a = b.match(/^<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const sn = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div|td)>/);
    let url = decode(a[1]);
    const u = url.match(/[?&]uddg=([^&]+)/); if (u) url = decodeURIComponent(u[1]);
    if (url.startsWith('//')) url = 'https:' + url;
    if (/duckduckgo\.com\/y\.js|[?&]ad_domain=/i.test(url)) continue; // ads
    res.push({ title: strip(a[2]), url, snippet: strip(sn ? sn[1] : '') });
  }
  return res;
}
async function searchBing(q) {
  const r = await get('https://www.bing.com/search?setlang=en&q=' + encodeURIComponent(q), { timeout: 9000 });
  const res = [];
  const re = /<li class="b_algo"[\s\S]*?<h2[^>]*><a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>([\s\S]*?)<\/li>/g;
  let m;
  while ((m = re.exec(r.body)) && res.length < 10) res.push({ title: strip(m[2]), url: decode(m[1]), snippet: strip((m[3].match(/<p[^>]*>([\s\S]*?)<\/p>/) || [])[1] || '').slice(0, 300) });
  return res;
}
async function searchOne(q) {
  try { const r = await searchDuck(q); if (r.length) return r; } catch (_) {}
  try { return await searchBing(q); } catch (_) { return []; }
}
// Several queries at once. Returns a text block the AI can read quickly.
async function search(queries) {
  const qs = [...new Set((Array.isArray(queries) ? queries : [queries]).map((q) => String(q || '').trim()).filter(Boolean))].slice(0, 5);
  if (!qs.length) return 'Error: give at least one query.';
  const all = await Promise.all(qs.map(searchOne));
  if (!all.some((r) => r.length)) return 'Error: the search service did not answer. Try browser_search instead.';
  return all.map((r, i) => `Results for "${qs[i]}":\n` + (r.length ? r.map((x, j) => `${j + 1}. ${x.title}\n   ${x.url}\n   ${x.snippet}`).join('\n') : '(nothing found)')).join('\n\n');
}

// ---- read: many pages at the same time ----
async function readOne(url, find, each) {
  let u = String(url || '').trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const r = await get(u, { timeout: 12000 });
    if (!r.ok) return { url: u, error: `the site answered ${r.status}` };
    if (/pdf/i.test(r.type)) return { url: u, error: 'this is a PDF — open it with browser_open to read it' };
    if (!/html|text|xml|json/i.test(r.type)) return { url: u, error: `not a web page (${r.type || 'unknown type'})` };
    const { title, text } = /html|xml/i.test(r.type) ? pageText(r.body) : { title: '', text: r.body };
    if (text.length < 200) return { url: r.url, title, error: 'almost no text (the page probably needs a real browser: use browser_open)' };
    let body = text;
    if (find) {
      const words = String(find).toLowerCase().split(/\s+/).filter((w) => w.length > 2);
      const paras = text.split('\n');
      const hits = paras.map((p, i) => ({ i, s: words.filter((w) => p.toLowerCase().includes(w)).length })).filter((h) => h.s).sort((a, b) => b.s - a.s).slice(0, 8).sort((a, b) => a.i - b.i);
      body = hits.length ? hits.map((h) => paras[h.i]).join('\n…\n') : text;
    }
    return { url: r.url, title, text: body.slice(0, each) + (body.length > each ? ' …(shortened)' : '') };
  } catch (e) {
    return { url: u, error: /timeout|abort/i.test(e.message) ? 'too slow to answer' : 'could not open it' };
  }
}
async function read(urls, find) {
  const list = [...new Set((Array.isArray(urls) ? urls : [urls]).map(String).filter(Boolean))].slice(0, 20);
  if (!list.length) return 'Error: give at least one URL.';
  const each = list.length <= 3 ? 9000 : list.length <= 8 ? 4500 : 2500;
  const out = new Array(list.length);
  let next = 0;
  const worker = async () => { while (next < list.length) { const i = next++; out[i] = await readOne(list[i], find, each); } };
  await Promise.all(Array.from({ length: Math.min(8, list.length) }, worker));
  return out.filter(Boolean).map((p, i) => `### ${i + 1}. ${p.title || p.url}\n${p.url}\n${p.error ? '(' + p.error + ')' : p.text}`).join('\n\n');
}

const WEB_TOOLS = [
  { type: 'function', function: { name: 'web_search', description: 'Search the web FAST (no browser). Pass several queries at once to cover a topic in one step. Returns titles, links and snippets. Use it for news, facts, prices, research — then web_read the best links.', parameters: { type: 'object', properties: { queries: { type: 'array', items: { type: 'string' }, description: '1-5 different search queries' } }, required: ['queries'] } } },
  { type: 'function', function: { name: 'web_read', description: 'Read up to 20 web pages AT THE SAME TIME as plain text (no browser, a few seconds in total). Use it to read search results or any links. Optional find = words to pull out only the matching passages. Use the visible browser (browser_open) only when you must click, log in, fill in a form or post.', parameters: { type: 'object', properties: { urls: { type: 'array', items: { type: 'string' }, description: '1-20 URLs' }, find: { type: 'string', description: 'optional words to look for on the pages' } }, required: ['urls'] } } },
];

module.exports = { search, read, pageText, WEB_TOOLS };
