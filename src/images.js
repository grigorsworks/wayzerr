// Making pictures in the cloud. Uses the best image AI the user already has connected
// (OpenAI, Gemini, OpenRouter, xAI, or any cloud server that offers /images/generations),
// and falls back to a free cloud image service so it always works.
const TIMEOUT = 120000;

const SIZES = { square: [1024, 1024], portrait: [1024, 1536], landscape: [1536, 1024] };

function fromDataUrl(u) {
  const m = /^data:([^;]+);base64,(.+)$/s.exec(String(u || ''));
  return m ? { mime: m[1], buf: Buffer.from(m[2], 'base64') } : null;
}
async function jsonOrThrow(r, who) {
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`${who}: ${d?.error?.message || d?.message || 'HTTP ' + r.status}`);
  return d;
}
async function viaUrl(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return { buf: Buffer.from(await r.arrayBuffer()), mime: r.headers.get('content-type') || 'image/png' };
}

const ENGINES = {
  // OpenAI (and OpenAI-compatible servers that offer image generation)
  async openai(p, prompt, size) {
    const [w, h] = SIZES[size] || SIZES.square;
    const base = (p.baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const model = p.type === 'openai' ? 'gpt-image-1' : p.imageModel || undefined;
    const r = await fetch(base + '/images/generations', { method: 'POST', signal: AbortSignal.timeout(TIMEOUT), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key },
      body: JSON.stringify({ model, prompt, n: 1, size: `${w}x${h}`, ...(model === 'gpt-image-1' ? {} : { response_format: 'b64_json' }) }) });
    const d = await jsonOrThrow(r, p.name);
    const it = d.data?.[0] || {};
    if (it.b64_json) return { buf: Buffer.from(it.b64_json, 'base64'), mime: 'image/png' };
    if (it.url) return viaUrl(it.url);
    throw new Error(p.name + ' returned no image');
  },
  async xai(p, prompt) {
    const r = await fetch('https://api.x.ai/v1/images/generations', { method: 'POST', signal: AbortSignal.timeout(TIMEOUT), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key }, body: JSON.stringify({ model: 'grok-2-image', prompt, n: 1, response_format: 'b64_json' }) });
    const d = await jsonOrThrow(r, 'xAI');
    if (d.data?.[0]?.b64_json) return { buf: Buffer.from(d.data[0].b64_json, 'base64'), mime: 'image/jpeg' };
    throw new Error('xAI returned no image');
  },
  async google(p, prompt) {
    const r = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent', { method: 'POST', signal: AbortSignal.timeout(TIMEOUT), headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.key },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE', 'TEXT'] } }) });
    const d = await jsonOrThrow(r, 'Gemini');
    const part = (d.candidates?.[0]?.content?.parts || []).find((x) => x.inlineData || x.inline_data);
    const inl = part && (part.inlineData || part.inline_data);
    if (inl?.data) return { buf: Buffer.from(inl.data, 'base64'), mime: inl.mimeType || inl.mime_type || 'image/png' };
    throw new Error('Gemini returned no image');
  },
  async openrouter(p, prompt) {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(TIMEOUT), headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + p.key },
      body: JSON.stringify({ model: 'google/gemini-2.5-flash-image', modalities: ['image', 'text'], messages: [{ role: 'user', content: prompt }] }) });
    const d = await jsonOrThrow(r, 'OpenRouter');
    const u = d.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    const img = fromDataUrl(u);
    if (img) return img;
    if (u) return viaUrl(u);
    throw new Error('OpenRouter returned no image');
  },
  async codex(p, prompt, size) { return p.fn(prompt, size); },
  // Free cloud image service — no account needed (may be busy or limited).
  async free(_p, prompt, size) {
    const [w, h] = SIZES[size] || SIZES.square;
    const seed = Math.floor(Math.random() * 1e9);
    return viaUrl(`https://image.pollinations.ai/prompt/${encodeURIComponent(prompt.slice(0, 900))}?width=${w}&height=${h}&nologo=true&seed=${seed}`);
  },
};

// providers: [{ type, name, baseUrl, key }] with keys already decrypted.
function engines(providers, extra = {}) {
  const out = [];
  // Signed in with ChatGPT: its own image tool, on the ChatGPT plan.
  if (extra.codex && providers.some((p) => p.type === 'chatgpt-account')) out.push(['codex', { fn: extra.codex }, 'ChatGPT']);
  const has = (t) => providers.find((p) => p.type === t && p.key);
  if (has('openai')) out.push(['openai', has('openai'), 'OpenAI']);
  if (has('google')) out.push(['google', has('google'), 'Gemini']);
  const or = providers.find((p) => /openrouter/.test(p.type) && p.key);
  if (or) out.push(['openrouter', or, 'OpenRouter']);
  if (has('xai')) out.push(['xai', has('xai'), 'Grok']);
  for (const p of providers.filter((x) => x.type === 'custom' && x.imageOk)) out.push(['openai', p, p.name]);
  if (extra.free !== false) out.push(['free', {}, 'a free cloud image service']);
  return out;
}

async function makeImage(providers, prompt, size, extra) {
  prompt = String(prompt || '').trim();
  if (!prompt) throw new Error('Describe the picture first.');
  const errors = extra?.skipNote ? [extra.skipNote] : [];
  const list = engines(providers, extra);
  if (!list.length) throw new Error('No picture AI is connected. Connect OpenAI or Gemini in Settings → AI & apps, or turn on the free picture service in Settings → General → Privacy.');
  for (const [kind, p, label] of list) {
    try { const img = await ENGINES[kind](p, prompt, size); if (img?.buf?.length > 500) return { ...img, via: label, skipped: errors.join('; ') }; errors.push(label + ': empty image'); }
    catch (e) { errors.push(`${label}: ${String(e.message || e).slice(0, 120)}`); }
  }
  throw new Error("Couldn't make the picture — " + errors.join('; '));
}

module.exports = { makeImage, engines };
