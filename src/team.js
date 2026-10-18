// Team: bots can list, create and message each other.
// The app acts as the "server": when bot A messages bot B, the app runs B's turn
// (B's own AI, personality and tools), shows the exchange in B's chat, and hands
// B's reply back to A.
const TEAM_TOOLS = [
  {
    name: 'bots_list',
    description: "List the other bots in the user's Wayzerr app (id, name, tag, what they do).",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'bots_create',
    description: 'Create a new bot (it appears in the user\'s bot list right away). Use it whenever the user asks you to make, create or add a bot. The name and description decide who it is and what it is an expert in.',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'plain name: the topic + "bot", e.g. "Homework bot" (use exactly what the user called it)' },
        tag: { type: 'string', description: 'one plain word for its topic, e.g. "Homework"' },
        description: { type: 'string', description: '2–4 sentences, written to the new bot: who it is, what it is an expert in, how it thinks and works, and its personality/tone. This shapes how it behaves.' },
      },
      required: ['name'],
    },
  },
  {
    name: 'bots_message',
    description: "Send a private message to another bot to hand it a task (e.g. ask Calendar bot to add a date). It's one-way: the other bot reads it, does the task itself and tells the user in its own chat. You don't get a reply, so put everything it needs in the message.",
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'bot id or name' },
        message: { type: 'string' },
      },
      required: ['to', 'message'],
    },
  },
  {
    name: 'groups_list',
    description: "List the user's group chats (id, name, which bots are in each).",
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'groups_send',
    description: "Post a message into one of the user's group chats as yourself. The bots in that group read it and get to work (use @Name to give a specific bot a task; without @mentions every bot in the group answers). Waits for their replies and returns them to you, so you can check and combine the results.",
    parameters: {
      type: 'object',
      properties: {
        group: { type: 'string', description: 'group chat name or id' },
        message: { type: 'string', description: 'a clear brief: the goal, what each bot should do, and the format you want back' },
      },
      required: ['group', 'message'],
    },
  },
];

const MAX_DEPTH = 3;

/**
 * deps: {
 *   store,
 *   createBot({ name, tag, description }) -> persona,
 *   runBotTurn(persona, text, { from, depth }) -> Promise<reply>,
 * }
 */
// Simple names: "make a homework bot" → name "Homework bot", tag "Homework".
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);
const clean = (t) => String(t || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}"“”'`*_#]/gu, '').replace(/\s+/g, ' ').trim();
function simpleName(args, userText) {
  const said = String(userText || '').match(/\b(?:create|make|add|build|set up|start|need|want)\s+(?:me\s+)?(?:(?:another|an|a|one|new)\s+)*([\p{L}\p{N}][\p{L}\p{N} &'-]{0,28}?)\s+bot\b/iu);
  let topic = said ? clean(said[1]).replace(/^(new|another)\s+/i, '') : '';
  if (topic && topic.split(' ').length > 3) topic = '';
  if (!topic) {
    // Use the AI's choice, but keep it plain: "The Homework Helper 3000 🤖" → "Homework helper bot"
    topic = clean(args.name).replace(/\bbot\b/ig, '').replace(/^(the|a|an)\s+/i, '').replace(/\s*\d+$/, '').trim();
    const t = clean(args.tag).replace(/&.*$/, '').trim();
    if (topic.split(' ').length > 2) topic = t && t.split(' ').length <= 2 ? t : topic.split(' ')[0];
  }
  if (!topic) return { name: '', tag: '' };
  topic = topic.toLowerCase();
  const name = cap(topic) + ' bot';
  const tag = cap(said ? topic : (clean(args.tag) || topic).toLowerCase()).split(' ').slice(0, 2).join(' ').slice(0, 20);
  return { name: name.slice(0, 40), tag };
}

function createTeam(deps) {
  const find = (key) => {
    const k = String(key || '').trim().toLowerCase();
    const list = deps.store.data.personas.filter((p) => !p.group);
    return list.find((p) => p.id === key) || list.find((p) => p.name.toLowerCase() === k) || list.find((p) => p.name.toLowerCase().includes(k));
  };
  return {
    find,
    async run(tool, args, ctx) {
      const self = ctx.persona;
      if (tool === 'bots_list') {
        const others = deps.store.data.personas.filter((p) => p.id !== self?.id && !p.group);
        if (!others.length) return 'There are no other bots yet. You can create one with bots_create.';
        return others.map((p) => `[${p.id}] ${p.name}${p.tag ? ' (' + p.tag + ')' : ''}${p.description ? ' — ' + p.description.slice(0, 160) : ''}`).join('\n');
      }
      if (tool === 'bots_create') {
        const { name, tag } = simpleName(args, ctx.userText);
        if (!name) throw new Error('Give the new bot a name.');
        const exists = find(name);
        if (exists && exists.name.toLowerCase() === name.toLowerCase()) return `A bot called "${exists.name}" already exists (id ${exists.id}).`;
        const p = deps.createBot({ name, tag, description: String(args.description || '').trim(), createdBy: self?.name });
        return `Created bot "${p.name}" (tag: ${p.tag || 'none'}). It's in the user's bot list now. Tell the user in one short line.`;
      }
      if (tool === 'bots_message') {
        const target = find(args.to);
        if (!target) return `No bot called "${args.to}". Use bots_list to see the bots, or bots_create to make one.`;
        if (target.id === self?.id) return "You can't message yourself.";
        const depth = (ctx.depth || 0) + 1;
        if (depth > MAX_DEPTH) return 'Too many bots are already passing this along — answer the user directly instead.';
        // One-way: "Messaged Calendar bot" shows in the sender's chat, "Message from …" in the other bot's chat,
        // and the other bot does the task there. The sender doesn't wait for an answer.
        const text = String(args.message || '').trim();
        if (!text) return 'Write the message to send.';
        if (self) {
          const chat = (deps.store.data.chats[ctx.chatKey || self.id] ||= []);
          chat.push({ role: 'activity', kind: 'botmsg', from: self.name, fromId: self.id, to: target.name, toId: target.id, ts: Date.now(), at: Date.now(), oneWay: true, thread: [{ who: self.name, id: self.id, text: text.slice(0, 4000), ts: Date.now() }], ...(ctx.group ? { bot: self.id } : {}) });
          deps.store.save(); ctx.hooks?.onEvent?.({ type: 'message' });
        }
        deps.runBotTurn(target, text, { from: self ? { id: self.id, name: self.name } : { name: 'Someone' }, depth, oneWay: true }).catch(() => {});
        return `Sent to ${target.name}. It will do the task and tell the user in its own chat — you won't get a reply. Tell the user in one short line that you passed it to ${target.name}.`;
      }
      if (tool === 'groups_list') {
        const groups = deps.store.data.personas.filter((p) => p.group);
        if (!groups.length) return 'The user has no group chats yet. They can make one with + → New group chat.';
        const nm = (id) => deps.store.data.personas.find((p) => p.id === id)?.name || '?';
        return groups.map((g) => `[${g.id}] ${g.name} — bots: ${(g.members || []).map(nm).join(', ')}`).join('\n');
      }
      if (tool === 'groups_send') {
        const k = String(args.group || '').trim().toLowerCase();
        const groups = deps.store.data.personas.filter((p) => p.group);
        const g = groups.find((x) => x.id === args.group) || groups.find((x) => x.name.toLowerCase() === k) || groups.find((x) => x.name.toLowerCase().includes(k)) || (groups.length === 1 && /group|gc|team/.test(k) ? groups[0] : null);
        if (!g) return `No group chat called "${args.group}". ${groups.length ? 'Groups: ' + groups.map((x) => x.name).join(', ') : 'There are no group chats yet.'}`;
        if ((ctx.depth || 0) >= MAX_DEPTH) return 'Too many bots are already passing this along — answer the user directly instead.';
        const text = String(args.message || '').trim();
        if (!text) return 'Write the message to post.';
        const run = deps.runGroupTurn(g, text, { fromBot: self, depth: (ctx.depth || 0) + 1, chain: ctx.chain || [] });
        const replies = await (ctx.hooks?.waitForBot ? ctx.hooks.waitForBot(run) : run);
        ctx.lastBotMsg = { target: { id: g.id, name: g.name, group: true }, reply: replies.map((r) => `${r.name}: ${r.text}`).join('\n\n'), thread: [{ who: self.name, id: self.id, text }, ...replies.map((r) => ({ who: r.name, id: r.id, text: r.text }))] };
        if (!replies.length) return `Posted in "${g.name}", but no bot replied.`;
        return `Posted in "${g.name}". Replies:\n\n${replies.map((r) => `${r.name}: ${r.text}`).join('\n\n')}\n\nCheck the work, then give the user one clean combined answer.`;
      }
      throw new Error('Unknown tool');
    },
  };
}

module.exports = { TEAM_TOOLS, createTeam, simpleName };
