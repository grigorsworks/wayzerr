// Schedules: tasks a bot does by itself at a time you choose, once or on repeat.
// A schedule is { id, botId, title, prompt, useComputer, enabled, start: 'YYYY-MM-DDTHH:MM' (local time of the first run),
// repeat: { type: 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'interval', days: [0-6, Sunday = 0], every, unit: 'minutes' | 'hours' }, cursor }.
// Everything here is plain functions of a schedule and a time, so it can be tested without the app.

(() => {
const MIN = 60000, HOUR = 3600000, DAY = 86400000;

function parseStart(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})/.exec(String(s || ''));
  if (!m) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], 0, 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

const pad = (n) => String(n).padStart(2, '0');
const toStart = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const startOfDay = (ts) => { const d = new Date(ts); d.setHours(0, 0, 0, 0); return d; };

function stepMs(rep) {
  const n = Math.max(1, Math.floor(Number(rep.every) || 1));
  return n * (rep.unit === 'hours' ? HOUR : MIN);
}

// The moments (ms) this schedule runs in [from, to), earliest first (at most `limit`).
function occurrences(s, from, to, limit = 600) {
  const first = parseStart(s.start);
  if (!first || !(to > from)) return [];
  const rep = s.repeat || { type: 'none' };
  const out = [];
  const t0 = first.getTime();
  if (rep.type === 'none') return t0 >= from && t0 < to ? [t0] : [];
  if (rep.type === 'interval') {
    const step = stepMs(rep);
    let k = from > t0 ? Math.ceil((from - t0) / step) : 0;
    for (let t = t0 + k * step; t < to && out.length < limit; t += step) out.push(t);
    return out;
  }
  const h = first.getHours(), mi = first.getMinutes();
  const days = Array.isArray(rep.days) && rep.days.length ? rep.days.map(Number) : [first.getDay()];
  for (let day = startOfDay(Math.max(from, t0)); day.getTime() < to && out.length < limit; day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)) {
    const wd = day.getDay();
    let hit = false;
    if (rep.type === 'daily') hit = true;
    else if (rep.type === 'weekdays') hit = wd >= 1 && wd <= 5;
    else if (rep.type === 'weekly') hit = days.includes(wd);
    else if (rep.type === 'monthly') {
      const last = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
      hit = day.getDate() === Math.min(first.getDate(), last);
    }
    if (!hit) continue;
    const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, mi, 0, 0).getTime();
    if (t >= from && t < to && t >= t0) out.push(t);
  }
  return out;
}

// The next time after `after`, or null if it never runs again.
function nextRun(s, after) {
  if (!s || s.enabled === false) return null;
  const rep = s.repeat || { type: 'none' };
  const span = rep.type === 'none' ? 400 * DAY : rep.type === 'monthly' ? 62 * DAY : rep.type === 'interval' ? stepMs(rep) + DAY : 8 * DAY;
  const first = parseStart(s.start);
  if (!first) return null;
  const from = Math.max(after + 1, first.getTime());
  const list = occurrences(s, from, from + span, 1);
  return list.length ? list[0] : null;
}

const WORDS = { none: 'Once', daily: 'Every day', weekdays: 'Every weekday', weekly: 'Every week', monthly: 'Every month' };
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function describeRepeat(s) {
  const rep = s.repeat || { type: 'none' };
  if (rep.type === 'interval') { const n = Math.max(1, Math.floor(Number(rep.every) || 1)); return n === 1 ? (rep.unit === 'hours' ? 'Every hour' : 'Every minute') : `Every ${n} ${rep.unit === 'hours' ? 'hours' : 'minutes'}`; }
  if (rep.type === 'weekly' && Array.isArray(rep.days) && rep.days.length) return 'Every ' + [...rep.days].sort((a, b) => a - b).map((d) => DAY_NAMES[d]).join(', ');
  return WORDS[rep.type] || 'Once';
}

// Make anything the app or a bot sends into a clean schedule (or throw a plain sentence saying what is wrong).
function clean(input, old = {}) {
  const s = { ...old, ...input };
  s.title = String(s.title || '').trim().slice(0, 80);
  s.prompt = String(s.prompt || '').trim().slice(0, 4000);
  if (!s.prompt) throw new Error('Say what the bot should do.');
  if (!s.title) s.title = s.prompt.replace(/\s+/g, ' ').slice(0, 40);
  if (!s.botId) throw new Error('Choose a bot.');
  if (!parseStart(s.start)) throw new Error('Choose a date and time.');
  const rep = { ...(s.repeat || {}) };
  if (!['none', 'daily', 'weekdays', 'weekly', 'monthly', 'interval'].includes(rep.type)) rep.type = 'none';
  if (rep.type === 'weekly') { rep.days = [...new Set((rep.days || []).map(Number).filter((d) => d >= 0 && d <= 6))]; if (!rep.days.length) rep.days = [parseStart(s.start).getDay()]; } else delete rep.days;
  if (rep.type === 'interval') { rep.every = Math.min(999, Math.max(1, Math.floor(Number(rep.every) || 1))); rep.unit = rep.unit === 'hours' ? 'hours' : 'minutes'; if (rep.unit === 'minutes' && rep.every < 5) rep.every = 5; } else { delete rep.every; delete rep.unit; }
  s.repeat = rep;
  s.useComputer = !!s.useComputer;
  s.enabled = s.enabled !== false;
  s.start = toStart(parseStart(s.start));
  return s;
}

const exported = { parseStart, toStart, occurrences, nextRun, describeRepeat, clean, MIN, HOUR, DAY };
if (typeof module !== 'undefined' && module.exports) module.exports = exported; // the app
else window.Schedules = exported; // the calendar window uses the very same rules
})();
