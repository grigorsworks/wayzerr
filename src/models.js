// What each model can handle: how much text fits (context window), how long an answer may be,
// and which settings it accepts. Real numbers from the provider's /models list win (OpenRouter,
// Groq, Mistral and others report them); otherwise the published limits of well-known models;
// otherwise a careful default. Budgets are always kept below the real limit.

// [pattern, context tokens, max output tokens, accepts reasoning_effort]
const KNOWN = [
  [/^(openai\/)?gpt-5/i, 400000, 128000, true],
  [/^(openai\/)?gpt-4\.1/i, 1047576, 32768, false],
  [/^(openai\/)?(gpt-4o|chatgpt-4o)/i, 128000, 16384, false],
  [/^(openai\/)?gpt-4-turbo/i, 128000, 4096, false],
  [/^(openai\/)?gpt-4(?!o|\.)/i, 8192, 4096, false],
  [/^(openai\/)?gpt-3\.5/i, 16385, 4096, false],
  [/^(openai\/)?o[134](-|$)/i, 200000, 100000, true],
  [/^(anthropic\/)?claude-(opus|sonnet)-4|claude-(3-7|4)/i, 200000, 32000, false],
  [/^(anthropic\/)?claude-3-5/i, 200000, 8192, false],
  [/^(anthropic\/)?claude/i, 200000, 8192, false],
  [/^(google\/)?gemini-(2\.5|3)/i, 1048576, 65536, true],
  [/^(google\/)?gemini-2\.0/i, 1048576, 8192, false],
  [/^(google\/)?gemini-1\.5-pro/i, 2097152, 8192, false],
  [/^(google\/)?gemini/i, 1048576, 8192, false],
  [/^(x-ai\/)?grok-4/i, 256000, 32768, false],
  [/^(x-ai\/)?grok/i, 131072, 16384, false],
  [/deepseek-(reasoner|r1)/i, 64000, 32768, false],
  [/deepseek/i, 64000, 8192, false],
  [/mistral-(large|medium)|magistral|codestral/i, 128000, 8192, false],
  [/mistral|mixtral|ministral|pixtral/i, 32000, 8192, false],
  [/llama-?3\.[1-3]|llama-4|llama3\.[1-3]/i, 128000, 8192, false],
  [/qwen/i, 32768, 8192, false],
  [/gpt-oss/i, 131072, 32768, true],
];

// Servers that run on the computer often load models with a small window unless told otherwise.
const LOCAL_DEFAULT = 8192;
const UNKNOWN_DEFAULT = 32000;

function profile({ providerType, model, info, local } = {}) {
  const id = String(model || '');
  const hit = KNOWN.find(([re]) => re.test(id.replace(/^models\//, '')));
  let context = Number(info?.ctx) || (local ? LOCAL_DEFAULT : hit ? hit[1] : UNKNOWN_DEFAULT);
  let maxOutput = Number(info?.out) || (hit ? hit[2] : 4096);
  if (local && !info?.ctx) context = Math.min(context, hit ? Math.min(hit[1], 32768) : LOCAL_DEFAULT);
  maxOutput = Math.min(maxOutput, Math.floor(context / 2));
  return {
    context,
    maxOutput,
    reasoning: hit ? hit[3] : false,
    // Leave room for the answer — generous, but never more than a quarter of the window.
    reserveOutput: Math.min(maxOutput, Math.max(2048, Math.floor(context * 0.25)), 32000),
    // Stay this far below the real limit: token counts here are estimates.
    safety: 0.9,
    streaming: true,
    source: info?.ctx ? 'provider' : local ? 'local default' : hit ? 'known model' : 'careful default',
    providerType,
  };
}

// ----- token estimates (no tokenizer ships for every provider, so estimate on the safe side) -----
function estimateText(s) {
  s = String(s || '');
  if (!s) return 0;
  let ascii = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) < 128) ascii++;
  const other = s.length - ascii;
  // ~4 characters per token for English/code, ~1.5 for accented, Cyrillic, CJK and emoji text.
  return Math.ceil(ascii / 3.6 + other / 1.4);
}
const IMAGE_TOKENS = 1200; // a detailed photo on the big providers costs roughly 800–1600 tokens
function estimateMessage(m) {
  let n = 4;
  if (typeof m.content === 'string') n += estimateText(m.content);
  else if (Array.isArray(m.content)) for (const p of m.content) n += p.type === 'text' ? estimateText(p.text) : p.type === 'image_url' ? IMAGE_TOKENS : 0;
  if (m.tool_calls) n += estimateText(JSON.stringify(m.tool_calls));
  return n;
}
const estimateMessages = (list) => list.reduce((a, m) => a + estimateMessage(m), 0);
const estimateTools = (tools) => (tools?.length ? estimateText(JSON.stringify(tools)) : 0);

module.exports = { profile, estimateText, estimateMessage, estimateMessages, estimateTools, IMAGE_TOKENS };
