// Skills: folders with a SKILL.md (instructions) + optional reference files.
// Bots see each skill's name and description, and load the full instructions
// with the skill_read tool only when a task needs them.
// Install with the same command as other agents: npx skills add <owner/repo> --skill <name>
const { app } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { ensureShims, connectorEnv, nodeTool } = require('./runtime');

const dir = () => {
  const d = process.env.WAYZERR_SKILLS_DIR || path.join(app.getPath('userData'), 'skills');
  fs.mkdirSync(d, { recursive: true });
  return d;
};
const BUILTIN = path.join(__dirname, 'skills-builtin');
const SAFE = /^[\w.-]+$/;

function frontmatter(text) {
  const m = text.match(/^---\s*\n([\s\S]*?)\n---/);
  const out = {};
  if (m) for (const line of m[1].split('\n')) { const kv = line.match(/^(\w[\w-]*):\s*(.*)$/); if (kv) out[kv[1]] = kv[2].replace(/^["']|["']$/g, '').trim(); }
  return out;
}

function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else if (e.isFile() || e.isSymbolicLink()) fs.copyFileSync(fs.realpathSync(s), d);
  }
}

// Ship the built-in skills once (the user can remove them later).
function seed(store) {
  const done = (store.data.skillsSeeded ||= []);
  if (!fs.existsSync(BUILTIN)) return;
  for (const name of fs.readdirSync(BUILTIN)) {
    if (done.includes(name)) continue;
    const target = path.join(dir(), name);
    if (!fs.existsSync(target)) copyDir(path.join(BUILTIN, name), target);
    done.push(name);
  }
  store.save();
}

function list() {
  const out = [];
  for (const name of fs.readdirSync(dir())) {
    const f = path.join(dir(), name, 'SKILL.md');
    if (!fs.existsSync(f)) continue;
    const fm = frontmatter(fs.readFileSync(f, 'utf8'));
    const files = [];
    const walk = (d, rel = '') => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { if (e.isDirectory()) walk(path.join(d, e.name), rel + e.name + '/'); else if (rel + e.name !== 'SKILL.md') files.push(rel + e.name); } };
    walk(path.join(dir(), name));
    out.push({ id: name, name: fm.name || name, description: (fm.description || '').slice(0, 600), files });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function read(name, file) {
  const s = list().find((x) => x.id === name || x.name === name);
  if (!s) return `No skill called "${name}". Available: ${list().map((x) => x.name).join(', ') || 'none'}.`;
  const rel = file ? String(file).replace(/^\.?\/*/, '') : 'SKILL.md';
  const root = path.join(dir(), s.id);
  const f = path.resolve(root, rel);
  if (!f.startsWith(root + path.sep) || !fs.existsSync(f)) return `The skill "${s.name}" has no file "${rel}". Files: SKILL.md${s.files.length ? ', ' + s.files.join(', ') : ''}.`;
  const text = fs.readFileSync(f, 'utf8');
  return (text.length > 40000 ? text.slice(0, 40000) + '\n…(cut)' : text) + (rel === 'SKILL.md' && s.files.length ? `\n\n(Other files in this skill you can read with skill_read: ${s.files.join(', ')})` : '');
}

// Accepts "npx skills add owner/repo --skill name -y", "owner/repo --skill name" or "owner/repo".
function parse(cmd) {
  const parts = String(cmd || '').trim().split(/\s+/).filter(Boolean);
  let i = 0;
  if (parts[i] === 'npx') i++;
  if (parts[i] === '-y' || parts[i] === '--yes') i++;
  if (/^skills(@.*)?$/.test(parts[i] || '')) i++;
  if (parts[i] === 'add') i++;
  const source = parts[i];
  if (!source || !/^[\w.-]+\/[\w.-]+(\/.*)?$|^https?:\/\//.test(source)) throw new Error('Paste a command like: npx skills add ComposioHQ/composio --skill composio');
  const k = parts.indexOf('--skill');
  const skill = k > 0 ? parts[k + 1] : null;
  if (skill && !SAFE.test(skill)) throw new Error('That skill name looks wrong.');
  return { source, skill };
}

function install(cmd) {
  const { source, skill } = parse(cmd);
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'persona-skill-'));
  const t = nodeTool('npx', ['-y', 'skills', 'add', source, ...(skill ? ['--skill', skill] : []), '-y']);
  return new Promise((resolve, reject) => {
    execFile(t.file, t.args, { cwd: work, env: connectorEnv({ CI: '1', ...t.env }), timeout: 240000, maxBuffer: 1 << 24 }, (err, stdout, stderr) => {
      const found = path.join(work, '.agents', 'skills');
      const names = fs.existsSync(found) ? fs.readdirSync(found).filter((n) => fs.existsSync(path.join(found, n, 'SKILL.md'))) : [];
      if (!names.length) { fs.rmSync(work, { recursive: true, force: true }); return reject(new Error("Couldn't install that skill. " + String(stderr || err?.message || '').split('\n').filter(Boolean).slice(-2).join(' ').slice(0, 200))); }
      for (const n of names) { fs.rmSync(path.join(dir(), n), { recursive: true, force: true }); copyDir(path.join(found, n), path.join(dir(), n)); }
      fs.rmSync(work, { recursive: true, force: true });
      resolve(names);
    });
  });
}

function remove(name) {
  if (!SAFE.test(name)) return;
  fs.rmSync(path.join(dir(), name), { recursive: true, force: true });
}

// A skill the user taught by doing it in the bot's browser.
function saveTaught({ name, when, steps, by }) {
  const { describeStep } = require('./browser');
  const title = String(name || '').trim().slice(0, 80);
  if (!title) throw new Error('Give the skill a name.');
  const lines = (steps || []).map(describeStep).filter(Boolean);
  if (!lines.length) throw new Error('Nothing was recorded. Do the task in the browser first, then click Done.');
  const slug = 'taught-' + (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || Date.now().toString(36));
  const desc = (String(when || '').trim() || title).replace(/\n/g, ' ').slice(0, 300);
  const md = `---
name: ${title.replace(/\n/g, ' ')}
description: ${desc} (a skill ${by || 'the user'} taught in the browser)
---
# ${title}

${by || 'The user'} showed you how to do this by doing it in your browser (taught: browser).
Repeat these steps with your browser tools: open the page, then click and type as shown.
Websites change. If a button or field looks a bit different, use the closest match.
Where a step types something that should change (a name, a date, a search), use what the user asks for this time instead.
For a saved password, use logins_request (never ask for it in chat).
Before anything that sends, posts, buys, pays or deletes, ask the user first.

## Steps
${lines.map((l, i) => `${i + 1}. ${l}`).join('\n')}
`;
  const d = path.join(dir(), slug);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, 'SKILL.md'), md);
  return { id: slug, name: title, steps: lines };
}

const SKILL_TOOLS = [{
  type: 'function',
  function: {
    name: 'skill_read',
    description: "Load a skill's instructions (or one of its reference files) before doing work the skill covers.",
    parameters: { type: 'object', properties: { name: { type: 'string', description: 'skill name' }, file: { type: 'string', description: 'optional file inside the skill, e.g. references/errors.md' } }, required: ['name'] },
  },
}];

module.exports = { seed, list, read, install, remove, parse, saveTaught, SKILL_TOOLS };
