// Conversation context: what each request carries, so long chats never hit "chat too long" and
// never silently lose what matters.
//
//   system prompt + tools            (fixed, measured each time)
//   summary of the earlier chat      (goal, decisions, facts, preferences, open tasks…)
//   recent messages, word for word
//   the current message
//
// Nothing is summarised until the recent messages grow past ~75% of the room the model has. Then
// the oldest part is folded into the summary (the latest messages always stay word for word) and
// the summary is saved with the chat, so it's done once — not on every message.
const { profile, estimateText, estimateMessage, estimateMessages, estimateTools } = require('./models');

const KEEP_RECENT = 24; // stored messages that are always sent word for word
const MAX_CONTEXT = 200000; // tokens of chat sent word for word, even to models that could take more
const COMPACT_AT = 0.9; // compact only when the chat uses this much of the room…
const COMPACT_TO = 0.4; // …and then down to well below it, so it does not happen again for a long while
const SUMMARY_MAX_TOKENS = 3000;

const SUMMARY_PROMPT = `You keep the running memory of a long conversation between a user and an AI assistant, so the assistant can continue seamlessly after older messages are no longer shown.

Write an updated summary that merges the previous summary (if any) with the new messages. Use these sections, leaving out any that would be empty:

GOAL: what the user is trying to accomplish overall.
ACTIVE TASK: what is being worked on right now and where it stands; what "continue" would mean.
DECISIONS: choices made and agreed (newest wins — if a later message changed a decision, keep only the new one and note it replaced the old).
REQUIREMENTS & CONSTRAINTS: must-haves, limits, deadlines, formats.
FACTS: important facts, names, numbers, dates, links, file names, code or technical details the assistant will need (quote exact values).
USER PREFERENCES & CORRECTIONS: how the user wants things done; anything they corrected.
DONE: finished work, briefly.
OPEN ITEMS: unfinished tasks, questions still waiting, promises the assistant made.

Rules: be specific and factual, keep exact values, and write in the language of the conversation. Skip greetings, small talk, thanks and repeated content. Do not invent anything. Stay under ${Math.round(SUMMARY_MAX_TOKENS * 0.75)} words. Reply with the summary only.`;

const keyOf = (chatKey, persona, group) => (group ? `${chatKey}:${persona.id}` : chatKey);

// Messages as plain text for the summariser.
function asText(msgs, persona) {
  return msgs.map((m) => {
    const who = m.role === 'user' ? (m.from ? `${m.from.name}` : 'User') : m.bot && m.bot !== persona.id ? (m.botName || 'Another bot') : 'Assistant';
    let t = String(m.content || '');
    for (const a of m.attachments || []) t += a.type === 'file' ? `\n[Attached file "${a.name}"]\n${String(a.text || '').slice(0, 20000)}` : `\n[Attached picture "${a.name}"]`;
    return `${who}: ${t}`;
  }).join('\n\n');
}

// A plain, shortened record — used only if the AI summary can't be made (e.g. the service is down).
function digest(msgs, persona, max = 300) {
  return msgs.map((m) => {
    const who = m.role === 'user' ? 'User' : m.bot && m.bot !== persona.id ? (m.botName || 'Another bot') : 'Assistant';
    const t = String(m.content || '').replace(/\s+/g, ' ').trim();
    return `- ${who}: ${t.length > max ? t.slice(0, max) + '…' : t}${(m.attachments || []).length ? ` [${m.attachments.map((a) => a.name).join(', ')}]` : ''}`;
  }).join('\n');
}

// Fold `msgs` into `prev` using the chat's own model (in pieces if they are very long).
async function summarise({ prev, msgs, persona, prof, ask }) {
  const piece = Math.max(4000, Math.floor(prof.context * 0.5) - SUMMARY_MAX_TOKENS - 2000);
  let summary = prev || '';
  let batch = [];
  let size = 0;
  const flush = async () => {
    if (!batch.length) return;
    const text = asText(batch, persona);
    const out = await ask([
      { role: 'system', content: SUMMARY_PROMPT },
      { role: 'user', content: `${summary ? `PREVIOUS SUMMARY:\n${summary}\n\n` : ''}NEW MESSAGES:\n${text}` },
    ]);
    if (!out || !out.trim()) throw new Error('empty summary');
    summary = out.trim();
    batch = []; size = 0;
  };
  for (const m of msgs) {
    const t = estimateText(asText([m], persona));
    if (size + t > piece && batch.length) await flush();
    batch.push(m); size += Math.min(t, piece);
  }
  await flush();
  return summary;
}

/**
 * Build the conversation part of a request.
 * - convo: the stored chat messages (user/assistant) in order, the last one is the current message.
 * - fixed: tokens already used by the system prompt, notes and tools.
 * - toApi(msgs): turns stored messages into API messages.
 * - ask(messages): one plain call to the model (for the summary).
 * Returns { messages, summary, compacted, budget }.
 */
async function buildContext({ store, chatKey, persona, group, llm, convo, fixed, toApi, ask, force = false, cap = 0, onStatus = () => {} }) {
  const prof = llm.prof || profile({ providerType: llm.providerType, model: llm.model, info: llm.modelInfo, local: llm.local });
  const all = (store.data.chatCtx ||= {});
  const key = keyOf(chatKey, persona, group);
  let st = all[key];
  // The chat was cleared or cut back before the summarised part: that summary no longer applies.
  const lastTs = convo.length ? convo[convo.length - 1].ts || 0 : 0;
  if (st && (!convo.length || lastTs < st.upTo)) { delete all[key]; st = null; }
  let room = Math.floor(prof.context * prof.safety) - fixed - prof.reserveOutput;
  // Saving usage: even a model with a huge window only gets this much of the chat word for word (the rest is summarised).
  if (cap > 0) room = Math.min(room, cap);
  room = Math.min(room, MAX_CONTEXT);
  const budget = Math.max(1500, force ? Math.floor(room * 0.6) : room);

  const recentOf = () => convo.filter((m) => !st || (m.ts || 0) > st.upTo);
  let recent = recentOf();
  const summaryTokens = () => (st?.summary ? estimateText(st.summary) + 60 : 0);
  const cost = (msgs) => estimateMessages(toApi(msgs));
  let compacted = false;

  if (recent.length > KEEP_RECENT && (force || cost(recent) + summaryTokens() > budget * COMPACT_AT)) {
    // Keep the newest messages word for word, fold the rest into the summary.
    const target = budget * COMPACT_TO;
    let keep = KEEP_RECENT, used = cost(recent.slice(-keep));
    while (keep < recent.length) {
      const next = cost(recent.slice(-(keep + 1)));
      if (next > target) break;
      keep++; used = next;
    }
    const older = recent.slice(0, recent.length - keep);
    if (older.length) {
      onStatus('Organising the earlier part of the chat');
      let summary;
      try { summary = await summarise({ prev: st?.summary, msgs: older, persona, prof, ask }); }
      catch (e) {
        // Couldn't reach the AI to summarise: keep a shortened record instead of losing anything.
        summary = `${st?.summary ? st.summary + '\n\n' : ''}Earlier messages (shortened):\n${digest(older, persona)}`;
        const max = SUMMARY_MAX_TOKENS * 4;
        if (estimateText(summary) > max) summary = '…' + summary.slice(-max * 3);
      }
      st = all[key] = { summary, upTo: older[older.length - 1].ts || 0, updated: Date.now(), folded: (st?.folded || 0) + older.length, model: llm.model };
      store.save();
      compacted = true;
      recent = recentOf();
    }
  }

  let messages = toApi(recent);
  // Still too big (one enormous message, e.g. a huge pasted file): shorten the biggest older
  // messages first, then the current one, and say so inside the text — never silently.
  let total = estimateMessages(messages) + summaryTokens();
  if (total > budget) {
    const order = messages.map((m, i) => i).sort((a, b) => estimateMessage(messages[b]) - estimateMessage(messages[a]));
    for (const i of order) {
      if (total <= budget) break;
      const m = messages[i];
      const isLast = i === messages.length - 1;
      const over = total - budget;
      const shrink = (text) => {
        const keepChars = Math.max(isLast ? 4000 : 600, Math.floor(text.length - over * 3.6 - 200));
        if (keepChars >= text.length) return text;
        return text.slice(0, keepChars) + `\n\n[… shortened to fit: ${text.length - keepChars} more characters were not included${isLast ? ' — ask the user for the part you need' : ''}]`;
      };
      const before = estimateMessage(m);
      if (typeof m.content === 'string') m.content = shrink(m.content);
      else if (Array.isArray(m.content)) m.content = m.content.map((p) => (p.type === 'text' ? { ...p, text: shrink(p.text) } : p));
      total -= before - estimateMessage(m);
    }
  }
  const out = [];
  if (st?.summary) out.push({ role: 'system', content: `Summary of the earlier part of this conversation (older messages are not shown word for word — rely on this for what happened before):\n${st.summary}` });
  out.push(...messages);
  return { messages: out, summary: st?.summary || '', compacted, budget, prof, used: estimateMessages(out) + fixed };
}

// Inside one long task (many tool steps), keep the request under the limit: shorten old tool
// results and drop old screenshots first — the latest steps stay complete.
function fitTurn(messages, prof, toolsTokens) {
  const limit = Math.floor(prof.context * prof.safety) - prof.reserveOutput - toolsTokens;
  let total = estimateMessages(messages);
  if (total <= limit) return false;
  let changed = false;
  // Old screenshots (keep the last one)
  const shots = messages.map((m, i) => (Array.isArray(m.content) && m.content.some((p) => p.type === 'image_url') && m.role === 'user' && /Screenshot from your browser/.test(m.content[0]?.text || '') ? i : -1)).filter((i) => i >= 0);
  for (const i of shots.slice(0, -1)) { if (total <= limit) break; const b = estimateMessage(messages[i]); messages[i] = { role: 'user', content: '(An earlier screenshot was removed to save room.)' }; total -= b - estimateMessage(messages[i]); changed = true; }
  // Old tool results, oldest first (keep the last 3 complete)
  const tools = messages.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
  for (const i of tools.slice(0, -3)) {
    if (total <= limit) break;
    const m = messages[i]; const c = String(m.content || '');
    if (c.length <= 700) continue;
    const b = estimateMessage(m);
    m.content = c.slice(0, 600) + `\n[… older tool result shortened to save room: ${c.length - 600} characters removed]`;
    total -= b - estimateMessage(m); changed = true;
  }
  return changed;
}

const isContextError = (msg) => /context.{0,20}(length|window|limit)|maximum context|too many tokens|prompt is too long|input is too long|request too large|reduce the length|exceeds? the (model'?s? )?(maximum|max)|token limit|too long for/i.test(String(msg || ''));

module.exports = { digest, buildContext, fitTurn, isContextError, estimateTools, KEEP_RECENT, SUMMARY_PROMPT };
