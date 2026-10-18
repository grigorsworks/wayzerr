// Speech to text. Uses a fast cloud voice engine when you've added a Groq, OpenAI or Gemini API key,
// otherwise the free on-device engine (works with any AI, no key, nothing leaves the computer).
const TIMEOUT = 60000;

async function viaOpenAIStyle(base, key, model, buf, mime, lang, words) {
  const fd = new FormData();
  fd.append('file', new Blob([buf], { type: mime }), mime.includes('mp4') ? 'voice.mp4' : mime.includes('ogg') ? 'voice.ogg' : mime.includes('wav') ? 'voice.wav' : 'voice.webm');
  fd.append('model', model);
  if (lang) fd.append('language', lang);
  if (words?.length) fd.append('prompt', 'Names and words: ' + words.join(', ') + '.');
  const r = await fetch(base.replace(/\/+$/, '') + '/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + key }, body: fd, signal: AbortSignal.timeout(TIMEOUT) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || 'HTTP ' + r.status);
  return String(d.text || '').trim();
}
async function viaGemini(key, buf, mime, lang, words) {
  const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', {
    method: 'POST', signal: AbortSignal.timeout(TIMEOUT), headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ parts: [{ inline_data: { mime_type: mime.split(';')[0], data: Buffer.from(buf).toString('base64') } }, { text: 'Transcribe this voice message exactly, in the language it is spoken.' + (words?.length ? ' These names and words may appear: ' + words.join(', ') + '.' : '') + '  Reply with only the words, no quotes or notes. If there is no speech, reply with nothing.' }] }], generationConfig: { temperature: 0 } }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.error?.message || 'HTTP ' + r.status);
  return (d.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('').trim();
}

// providers: [{ type, baseUrl, key }] with keys already decrypted
function engines(providers, local) {
  const has = (t) => providers.find((p) => p.type === t && p.key);
  const out = [];
  if (has('groq')) out.push(['Groq', (b, m, l, w) => viaOpenAIStyle(process.env.WAYZERR_STT_BASE || 'https://api.groq.com/openai/v1', has('groq').key, 'whisper-large-v3-turbo', b, m, l, w)]);
  if (has('openai')) out.push(['OpenAI', (b, m, l, w) => viaOpenAIStyle(has('openai').baseUrl || 'https://api.openai.com/v1', has('openai').key, 'gpt-4o-mini-transcribe', b, m, l, w).catch(() => viaOpenAIStyle(has('openai').baseUrl || 'https://api.openai.com/v1', has('openai').key, 'whisper-1', b, m, l, w))]);
  if (has('google')) out.push(['Gemini', (b, m, l, w) => viaGemini(has('google').key, b, m, l, w)]);
  if (local?.exists()) out.push(['On this computer', (b, m, l) => local.transcribe(b, l)]);
  return out;
}
function available(providers, local) { return engines(providers, local).map(([n]) => n); }

async function transcribe(providers, buf, mime = 'audio/webm', lang, local, words = []) {
  if (!buf || buf.length < 1000) throw new Error("I didn't hear anything. Try again and speak a little longer.");
  const list = engines(providers, local);
  if (!list.length) throw Object.assign(new Error('The voice engine is missing. Reinstall Wayzerr to use your voice.'), { code: 'NO_ENGINE' });
  const errors = [];
  for (const [name, fn] of list) {
    try { const text = fixWords(await fn(buf, mime, lang, words), words); return { text, via: name }; }
    catch (e) { errors.push(`${name}: ${String(e.message || e).slice(0, 120)}`); }
  }
  throw new Error("Couldn't turn your voice into text — " + errors.join('; '));
}

// Whisper often turns a name into a similar real word ("Wayzer" -> "Weiser"). Put your own names back.
function dist(a, b) {
  const m = a.length, n = b.length; let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
  return prev[n];
}
function fixWords(text, words) {
  const list = (words || []).filter((w) => /^[\p{L}\p{N}]{4,}$/u.test(w));
  if (!list.length || !text) return text;
  return text.replace(/[\p{L}\p{N}]{4,}(?!['’]\p{L})/gu, (tok) => {
    const t = tok.toLowerCase();
    for (const w of list) {
      const lw = w.toLowerCase();
      if (t === lw) return w;
      if (t[0] === lw[0] && Math.abs(t.length - lw.length) <= 1 && dist(t, lw) <= (lw.length <= 8 ? 1 : 2)) return w;
    }
    return tok;
  });
}

module.exports = { transcribe, available, fixWords };
