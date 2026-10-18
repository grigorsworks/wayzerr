// AI providers: every provider speaks the OpenAI chat-completions format
// (Anthropic, Google, xAI, OpenRouter… all offer an OpenAI-compatible endpoint).
const TYPES = {
  'claude-account': { account: true, agent: 'claude', domain: 'claude.ai', sub: 'Sign in with your Claude plan — no API key', name: 'Claude', baseUrl: '', keyUrl: 'https://claude.ai', needsKey: false },
  'chatgpt-account': { account: true, agent: 'codex', domain: 'chatgpt.com', sub: 'Sign in with your ChatGPT plan — no API key', name: 'ChatGPT', baseUrl: '', keyUrl: 'https://chatgpt.com', needsKey: false },
  'gemini-account': { account: true, agent: 'gemini', domain: 'gemini.google.com', sub: 'Sign in with your Google account — no API key', name: 'Gemini', baseUrl: '', keyUrl: 'https://gemini.google.com', needsKey: false },
  'openrouter-account': { account: true, oauth: 'openrouter', domain: 'openrouter.ai', sub: 'Sign in — hundreds of models: Grok, DeepSeek, Llama, Mistral, Qwen…', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai', needsKey: false },
  'cursor-account': { account: true, agent: 'cursor', domain: 'cursor.com', sub: 'Sign in with your Cursor plan — no API key', name: 'Cursor', baseUrl: '', keyUrl: 'https://cursor.com', needsKey: false },
  'augment-account': { account: true, agent: 'augment', domain: 'augmentcode.com', sub: 'Sign in with your Augment account — no API key', name: 'Augment', baseUrl: '', keyUrl: 'https://augmentcode.com', needsKey: false },
  'amp-account': { account: true, agent: 'amp', domain: 'ampcode.com', sub: 'Sign in with your Amp account — no API key', name: 'Amp', baseUrl: '', keyUrl: 'https://ampcode.com', needsKey: false },
  'copilot-account': { account: true, agent: 'copilot', domain: 'github.com', sub: 'Sign in with your GitHub Copilot plan — no API key', name: 'GitHub Copilot', baseUrl: '', keyUrl: 'https://github.com/features/copilot', needsKey: false },
  openai: { domain: 'openai.com', sub: 'GPT models', name: 'OpenAI', baseUrl: 'https://api.openai.com/v1', keyUrl: 'https://platform.openai.com/api-keys', needsKey: true },
  anthropic: { domain: 'claude.ai', sub: 'Claude models', name: 'Anthropic (Claude)', baseUrl: 'https://api.anthropic.com/v1', keyUrl: 'https://console.anthropic.com/settings/keys', needsKey: true },
  google: { domain: 'gemini.google.com', sub: 'Gemini models', name: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', keyUrl: 'https://aistudio.google.com/apikey', needsKey: true },
  xai: { domain: 'x.ai', sub: 'Grok models', name: 'xAI (Grok)', baseUrl: 'https://api.x.ai/v1', keyUrl: 'https://console.x.ai', needsKey: true },
  openrouter: { domain: 'openrouter.ai', sub: 'Hundreds of models', name: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', keyUrl: 'https://openrouter.ai/keys', needsKey: true },
  groq: { domain: 'groq.com', sub: 'Very fast open models', name: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', keyUrl: 'https://console.groq.com/keys', needsKey: true },
  mistral: { domain: 'mistral.ai', sub: 'Mistral models', name: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', keyUrl: 'https://console.mistral.ai/api-keys', needsKey: true },
  deepseek: { domain: 'deepseek.com', sub: 'DeepSeek models', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', keyUrl: 'https://platform.deepseek.com/api_keys', needsKey: true },
  custom: { domain: '', sub: 'Any OpenAI-compatible API', name: 'Custom (OpenAI-compatible)', baseUrl: '', keyUrl: '', needsKey: false },
};

const NOT_CHAT = /(embed|whisper|tts|dall-e|image|audio|realtime|moderation|transcri|davinci|babbage|computer-use|sora|rerank|guard|search-preview|aqa|imagen|veo|lyria)/i;

function friendlyError(status, msg) {
  if (status === 401 || status === 403) return 'That API key was rejected. Check it and try again.';
  if (status === 429) return 'Rate limit or no credit left on this API account.';
  if (status === 404) return `Model not found. Pick another model. (${msg || ''})`;
  return `AI error ${status}: ${msg || 'unknown error'}`;
}

async function listModels(type, baseUrl, key) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  if (!base) throw new Error('Enter the API address.');
  const headers = {};
  if (type === 'anthropic') {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  } else if (key) headers.Authorization = `Bearer ${key}`;
  let r;
  try {
    r = await fetch(base + '/models' + (type === 'anthropic' ? '?limit=100' : ''), { headers, signal: AbortSignal.timeout(20000) });
  } catch (e) {
    throw new Error('Could not reach ' + base);
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(friendlyError(r.status, data?.error?.message));
  let list = (data.data || data.models || []).map((m) => ({
    id: String(m.id || m.name || '').replace(/^models\//, ''),
    name: m.display_name || m.displayName || (type === 'openrouter' ? m.name : '') || '',
    // Limits, when the provider tells us (OpenRouter, Groq, Mistral, Together, Gemini…)
    ctx: Number(m.context_length || m.context_window || m.max_context_length || m.inputTokenLimit || m.max_model_len || m.top_provider?.context_length) || undefined,
    out: Number(m.top_provider?.max_completion_tokens || m.max_completion_tokens || m.outputTokenLimit || m.max_output_tokens) || undefined,
  })).filter((m) => m.id && !NOT_CHAT.test(m.id));
  if (type === 'openai') list = list.filter((m) => /^(gpt|o\d|chatgpt)/i.test(m.id)).sort((a, b) => b.id.localeCompare(a.id));
  if (!list.length) throw new Error('Connected, but no chat models were found.');
  return list;
}

module.exports = { TYPES, listModels, friendlyError };
