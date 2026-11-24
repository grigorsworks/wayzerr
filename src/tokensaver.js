'use strict';
// Token saver: what Wayzerr sends to an AI is checked first, the same way for every AI it talks to
// (API keys and the Claude, ChatGPT/Codex, Gemini, Copilot, Cursor, Amp and Augment apps).
// No tokenizer of one company is used: sizes are estimated from the text itself (see models.js), which
// works the same for every model.
//   - the same screen twice in a row → one line instead of another picture (a picture is ~1,000–1,500
//     tokens, and an app like Codex re-reads every picture of the chat on every step)
//   - the same long tool result twice → one line instead of the whole text again
//   - a huge tool result (a big email list, a long page) → its beginning and a note how to get the rest
//   - how big a chat may get before its older part is folded into a short note (see main.js compactChat)
const crypto = require('crypto');

const MODES = ['low', 'balanced', 'max'];
const pick = (table, mode) => table[MODES.includes(mode) ? mode : 'balanced'];

// One step of a reply may re-read about this many tokens; past it, the chat is folded into a short note and the
// AI app's own chat starts again small (the latest messages stay word for word). An AI app already starts at about
// 12–18k per step (its own instructions and the tool list), so these leave room for real growth before a restart.
const BUDGET = { low: 32000, balanced: 64000, max: 400000 };
// What a fresh AI-app chat starts with at most: the note about the older part + the latest messages (characters).
const FRESH_CHARS = { low: 16000, balanced: 48000, max: 400000 };
// API bots: how much of the chat goes word for word before older messages are summarised (tokens).
const API_CAP = { low: 16000, balanced: 36000, max: 0 };
// A tool result longer than this is cut (characters).
const RESULT_CHARS = { low: 12000, balanced: 24000, max: 120000 };
// Codex compacts its own chat during one long task once it passes this many tokens (0 = Codex decides).
const CODEX_COMPACT = { low: 60000, balanced: 120000, max: 0 };

const budget = (mode) => pick(BUDGET, mode);
const freshChars = (mode) => pick(FRESH_CHARS, mode);
const apiCap = (mode) => pick(API_CAP, mode);
const codexCompact = (mode) => pick(CODEX_COMPACT, mode);

const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex');
// Results the AI needs whole (instructions, files it asked to read, its own memory) are never cut or skipped.
const KEEP_WHOLE = /^(skill_read|file_read|memory_|ask_options|tools_load|tool_run$)/;

/** A fresh guard for one AI chat (one reply for API bots, one AI-app chat for Codex, Claude…). */
const makeGuard = (sid = null) => ({ sid, lastShot: null, seen: new Map(), saved: 0 });

// The AI-app chats' guards: kept while the same AI-app chat goes on, started again with a new one.
const guards = new Map();
function guardFor(key, sid) {
  let g = guards.get(key);
  if (!g || !sid || g.sid !== sid) { g = makeGuard(sid); guards.set(key, g); }
  if (guards.size > 400) guards.delete(guards.keys().next().value);
  return g;
}

/**
 * Check one tool result before the AI gets it. Returns the result to send (a string or { text, image }).
 * - dedupeText: also replace a repeated long text result (only where the AI still has the earlier one word for
 *   word, i.e. AI-app chats; API bots shorten old results themselves).
 */
function guardResult(g, name, result, { mode = 'balanced', dedupeText = false } = {}) {
  if (!g || result == null) return result;
  name = String(name || '');
  if (typeof result === 'object' && result.image) {
    const h = sha(result.image);
    if (g.lastShot === h) {
      g.saved += 1200;
      return `${result.text ? String(result.text).trim() + '\n' : ''}(No new picture: the screen is exactly the same as in your previous screenshot, so it was not sent again. Nothing changed on screen since then. If you expected a change, that step did not work; try another way instead of looking again.)`;
    }
    g.lastShot = h;
    return result;
  }
  const isObj = typeof result === 'object';
  let text = isObj ? String(result.text ?? '') : String(result);
  if (KEEP_WHOLE.test(name) || /^(Error|The user did not allow)/.test(text)) return result;
  if (dedupeText && text.length > 600) {
    const h = sha(name + '\0' + text);
    if (g.seen.has(h)) {
      g.saved += Math.ceil(text.length / 4);
      return `(Same result as your earlier ${name} call: exactly the same text, so it is not repeated here. Use that one.)`;
    }
    g.seen.set(h, 1);
    if (g.seen.size > 300) g.seen.delete(g.seen.keys().next().value);
  }
  const cap = pick(RESULT_CHARS, mode);
  if (text.length > cap) {
    const cut = text.length - cap;
    g.saved += Math.ceil(cut / 4);
    text = text.slice(0, cap) + `\n\n[… ${cut.toLocaleString('en-US')} more characters left out to save tokens. If you need them, ask the tool for less at a time: one item, fewer results, a search or filter, or the next part of the page.]`;
    return isObj ? { ...result, text } : text;
  }
  return result;
}

module.exports = { budget, freshChars, apiCap, codexCompact, makeGuard, guardFor, guardResult, MODES };
