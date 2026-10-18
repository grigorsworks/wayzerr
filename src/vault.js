// Shared "Passwords" folder: saved logins every bot can use.
// Passwords are encrypted with the macOS Keychain and are NEVER sent to the AI —
// bots only see names, sites and usernames, and the app types the password
// straight into the browser for them.
const crypto = require('crypto');

const VAULT_TOOLS = [
  {
    name: 'logins_list',
    description: 'The user\'s saved logins (name, username). You never see passwords. One account works on every site it belongs to (a Google account → Classroom, Gmail, Drive, "Sign in with Google"…).',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'logins_fill',
    description: 'Sign in with a saved login: types the username and/or password into the page (field ids from browser_read). Two-step logins: username first, then password on the next page.',
    parameters: {
      type: 'object',
      properties: {
        login_id: { type: 'string', description: 'id from logins_list' },
        username_field: { type: 'integer', description: 'element id of the username/email input' },
        password_field: { type: 'integer', description: 'element id of the password input' },
        submit: { type: 'boolean', description: 'press Enter after filling' },
      },
      required: ['login_id'],
    },
  },
  {
    name: 'logins_request',
    description: 'No saved login fits: show the user a secure sign-in card (they type it, you never see the password; they can save it). Send a short "Can you log me in?" first. Field ids from browser_read.',
    parameters: {
      type: 'object',
      properties: {
        site: { type: 'string', description: 'name of the site, e.g. Google Classroom' },
        url: { type: 'string', description: 'the login page address' },
        ask: { type: 'string', enum: ['both', 'username', 'password'], description: 'what to ask for (default both)' },
        username_field: { type: 'integer', description: 'element id of the email/username input on the current page, if visible' },
        password_field: { type: 'integer', description: 'element id of the password input on the current page, if visible' },
        submit: { type: 'boolean', description: 'press Enter after filling' },
      },
      required: ['site'],
    },
  },
  {
    name: 'logins_type',
    description: 'On your computer: sign in with a saved login by typing the username or the password into the field that has the cursor (click the field first). You never see the password. Two-step logins: username first, then the password on the next page. submit=true presses Enter afterwards.',
    parameters: { type: 'object', properties: { login_id: { type: 'string', description: 'id from logins_list' }, field: { type: 'string', enum: ['username', 'password', 'both'], description: 'what to type; both = username, Tab, password' }, submit: { type: 'boolean' } }, required: ['login_id', 'field'] },
  },
  {
    name: 'cards_type',
    description: 'On your computer: type one detail of a saved card into the field that has the cursor (click the field first). The user approves every use. It does NOT pay: tell the user what and how much, and press Pay only if they say yes.',
    parameters: { type: 'object', properties: { card_id: { type: 'string' }, field: { type: 'string', enum: ['number', 'name', 'expiry', 'month', 'year', 'cvc', 'zip'] }, amount: { type: 'string', description: 'what it costs, as shown on the page' }, what: { type: 'string', description: 'what is being bought, in a few words' } }, required: ['card_id', 'field'] },
  },
  {
    name: 'cards_list',
    description: 'The user\'s saved payment cards (nickname, brand, last 4, expiry). You never see the number.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'cards_fill',
    description: 'Type a saved card into a checkout page (field ids from browser_read; only fields that exist). The user approves every use. It does NOT pay: tell the user what and how much, and press Pay only if they say yes.',
    parameters: {
      type: 'object',
      properties: {
        card_id: { type: 'string', description: 'id from cards_list' },
        amount: { type: 'string', description: 'what it costs, as shown on the page, e.g. "€24.99"' },
        what: { type: 'string', description: 'what is being bought, in a few words' },
        number_field: { type: 'integer' }, name_field: { type: 'integer' },
        expiry_field: { type: 'integer', description: 'a single MM/YY box' }, month_field: { type: 'integer' }, year_field: { type: 'integer' },
        cvc_field: { type: 'integer' }, zip_field: { type: 'integer' },
      },
      required: ['card_id'],
    },
  },
];

const brandOf = (n) => /^4/.test(n) ? 'Visa' : /^(5[1-5]|2[2-7])/.test(n) ? 'Mastercard' : /^3[47]/.test(n) ? 'American Express' : /^6(011|5)/.test(n) ? 'Discover' : 'Card';
const luhn = (n) => { let sum = 0, alt = false; for (let i = n.length - 1; i >= 0; i--) { let d = +n[i]; if (alt) { d *= 2; if (d > 9) d -= 9; } sum += d; alt = !alt; } return sum % 10 === 0; };

class Vault {
  constructor(store, enc, dec) {
    this.store = store;
    this.enc = enc;
    this.dec = dec;
  }
  get items() {
    return (this.store.data.vault ||= []);
  }
  // Logins typed into a sign-in card but not saved: kept in memory only, for this session.
  get temp() { return (this._temp ||= new Map()); }
  addTemp(site, username, password) {
    const id = 't' + crypto.randomBytes(3).toString('hex');
    this.temp.set(id, { id, name: site, site, username, password: password ? this.enc(password) : null, perm: 'always', temp: true });
    return id;
  }
  find(id) { return this.items.find((x) => x.id === String(id)) || this.temp.get(String(id)); }
  publicList() {
    return this.items.map(({ password, ...rest }) => ({ ...rest, hasPassword: !!password }));
  }
  save(item) {
    const clean = {
      name: String(item.name || '').trim(),
      site: String(item.site || '').trim(),
      username: String(item.username || '').trim(),
      notes: String(item.notes || '').trim(),
      perm: item.perm === 'ask' ? 'ask' : 'always',
    };
    if (!clean.name) throw new Error('Give the account a name, e.g. My Google account.');
    const existing = item.id && this.items.find((x) => x.id === item.id);
    if (existing) {
      Object.assign(existing, clean, { updated: Date.now() });
      if (item.password) existing.password = this.enc(item.password);
    } else {
      this.items.push({ id: crypto.randomBytes(3).toString('hex'), ...clean, password: item.password ? this.enc(item.password) : null, created: Date.now() });
    }
    this.store.save();
    return (existing || this.items[this.items.length - 1]).id;
  }
  remove(id) {
    this.store.data.vault = this.items.filter((x) => x.id !== id);
    this.store.save();
  }

  // ----- payment cards: encrypted here; bots only ever see the nickname and last 4 digits -----
  get cards() { return (this.store.data.cards ||= []); }
  publicCards() { return this.cards.map((c) => ({ id: c.id, name: c.name, brand: c.brand, last4: c.last4, exp: c.exp, holder: c.holder || '', created: c.created })); }
  findCard(id) { return this.cards.find((c) => c.id === String(id)); }
  saveCard(item) {
    const number = String(item.number || '').replace(/\D/g, '');
    const existing = item.id && this.findCard(item.id);
    if (!existing || number) {
      if (number.length < 12 || number.length > 19 || !luhn(number)) throw new Error("That card number doesn't look right. Check it and try again.");
    }
    const exp = String(item.exp || '').replace(/\s/g, '');
    const m = exp.match(/^(\d{1,2})\/?(\d{2}|\d{4})$/);
    if (!m || +m[1] < 1 || +m[1] > 12) throw new Error('Type the expiry like 08/29.');
    const cvc = String(item.cvc || '').replace(/\D/g, '');
    if ((!existing || cvc) && (cvc.length < 3 || cvc.length > 4)) throw new Error('The security code is the 3 or 4 digits on the card.');
    const clean = { name: String(item.name || '').trim().slice(0, 40), holder: String(item.holder || '').trim().slice(0, 60), zip: String(item.zip || '').trim().slice(0, 12), exp: m[1].padStart(2, '0') + '/' + m[2].slice(-2) };
    if (existing) {
      Object.assign(existing, clean, { updated: Date.now() });
      if (number) Object.assign(existing, { number: this.enc(number), last4: number.slice(-4), brand: brandOf(number) });
      if (cvc) existing.cvc = this.enc(cvc);
      if (!existing.name) existing.name = `${existing.brand} •••• ${existing.last4}`;
    } else {
      const brand = brandOf(number);
      this.cards.push({ id: 'c' + crypto.randomBytes(3).toString('hex'), ...clean, name: clean.name || `${brand} •••• ${number.slice(-4)}`, brand, last4: number.slice(-4), number: this.enc(number), cvc: this.enc(cvc), created: Date.now() });
    }
    this.store.save();
  }
  removeCard(id) { this.store.data.cards = this.cards.filter((c) => c.id !== id); this.store.save(); }
  reveal(id) {
    const it = this.items.find((x) => x.id === id);
    return it ? this.dec(it.password) || '' : '';
  }

  // Remove any saved password (plain or URL-encoded) from text going to the AI.
  redact(text) {
    let out = String(text);
    for (const c of this.cards) {
      const n = this.dec(c.number) || '';
      if (n.length >= 12) {
        const spaced = n.replace(/(\d{4})(?=\d)/g, '$1 '), dashed = n.replace(/(\d{4})(?=\d)/g, '$1-');
        for (const v of [n, spaced, dashed]) out = out.split(v).join('•••• •••• •••• ' + c.last4);
        out = out.replace(new RegExp(n.split('').join('[\\s-]?'), 'g'), '•••• ' + c.last4);
      }
      const cvc = this.dec(c.cvc) || '';
      if (cvc.length >= 3) out = out.split('"' + cvc + '"').join('"•••"').split("'" + cvc + "'").join("'•••'").replace(new RegExp('(value\\s*[=:]\\s*)' + cvc + '\\b', 'gi'), '$1•••');
      const exp = c.exp || ''; // the expiry isn't secret, but there's no need to show it either
      if (cvc.length >= 3) out = out.replace(new RegExp('(value|cvc|cvv|code|security)([^\\n]{0,40}?)\\b' + cvc + '\\b', 'gi'), '$1$2•••');
    }
    for (const it of [...this.items, ...this.temp.values()]) {
      const pw = this.dec(it.password);
      if (!pw || pw.length < 4) continue;
      const hexAll = (up) => pw.replace(/[^A-Za-z0-9]/g, (c) => [...Buffer.from(c)].map((b) => '%' + (up ? b.toString(16).toUpperCase() : b.toString(16)).padStart(2, '0')).join(''));
      const variants = [pw, encodeURIComponent(pw), encodeURIComponent(pw).replace(/%20/g, '+'), hexAll(true), hexAll(false), hexAll(true).replace(/%20/g, '+')];
      for (const v of new Set(variants)) out = out.split(v).join('••••••');
    }
    return out;
  }

  // ----- tools for bots -----
  async run(tool, args, browser, computer) {
    if (tool === 'logins_list') {
      const all = [...this.items, ...this.temp.values()];
      if (!all.length) return 'The Passwords folder is empty. If a site needs a login, tell the user "Can you log me in?" and call logins_request so they can type it in a secure card.';
      return all.map((x) => `[${x.id}] ${x.name}${x.site && x.site !== x.name ? ' — ' + x.site : ''}${x.username ? ' — username: ' + x.username : ''}${x.temp ? ' (typed by the user this session)' : ''}${x.notes ? ' — note: ' + x.notes : ''}`).join('\n') + '\nIf none of these match the site, tell the user "Can you log me in?" and call logins_request.';
    }
    if (tool === 'logins_fill') {
      const it = this.find(args.login_id);
      if (!it) throw new Error('No saved login with that id. Call logins_list first.');
      if (args.username_field == null && args.password_field == null) throw new Error('Give username_field and/or password_field (element ids from browser_read).');
      browser.need();
      const done = [];
      if (args.username_field != null) {
        if (!it.username) throw new Error('This login has no username saved.');
        await browser.type(args.username_field, it.username, args.password_field == null && !!args.submit);
        done.push('username');
      }
      if (args.password_field != null) {
        const pw = this.dec(it.password);
        if (!pw) throw new Error('This login has no password saved.');
        await browser.type(args.password_field, pw, !!args.submit);
        done.push('password');
      }
      return `Filled ${done.join(' and ')} for "${it.name}"${args.submit ? ' and submitted' : ''}. Now browser_read to see the result.`;
    }
    if (tool === 'logins_type') {
      const it = this.find(args.login_id);
      if (!it) throw new Error('No saved login with that id. Call logins_list first.');
      const items = [];
      if (args.field !== 'password') { if (!it.username) throw new Error('This login has no username saved.'); items.push(it.username); }
      if (args.field !== 'username') { const pw = this.dec(it.password); if (!pw) throw new Error('This login has no password saved.'); items.push(pw); }
      await computer.fill(items, !!args.submit);
      return `Typed the ${args.field === 'both' ? 'username and password' : args.field} for "${it.name}"${args.submit ? ' and pressed Enter' : ''}. Take a computer_screenshot to see the result.`;
    }
    if (tool === 'cards_type') {
      const c = this.findCard(args.card_id);
      if (!c) throw new Error('No saved card with that id. Call cards_list first.');
      const [mm, yy] = c.exp.split('/');
      const value = { number: this.dec(c.number), name: c.holder, expiry: `${mm}/${yy}`, month: mm, year: '20' + yy, cvc: this.dec(c.cvc), zip: c.zip }[args.field];
      if (!value) throw new Error('The card has no ' + args.field + ' saved.');
      await computer.fill([value], false);
      return `Typed the ${args.field} of the ${c.brand} ending ${c.last4}. Nothing has been paid. Tell the user what you are buying and the price, and press the final Pay button only if they say yes.`;
    }
    if (tool === 'cards_list') {
      if (!this.cards.length) return "The user hasn't saved any payment cards. If they want to pay, ask them to add a card in Settings → Passwords → Cards, or to pay themselves.";
      return this.publicCards().map((c) => `[${c.id}] ${c.name} — ${c.brand} ending ${c.last4}, expires ${c.exp}`).join('\n') + '\nYou never see the full number. Use cards_fill (or cards_type on your computer): the user approves every use.';
    }
    if (tool === 'cards_fill') {
      const c = this.findCard(args.card_id);
      if (!c) throw new Error('No saved card with that id. Call cards_list first.');
      browser.need();
      const done = [];
      const put = async (field, value, label) => { if (field == null || !value) return; await browser.type(field, value, false); done.push(label); };
      const [mm, yy] = c.exp.split('/');
      await put(args.number_field, this.dec(c.number), 'card number');
      await put(args.name_field, c.holder, 'name on card');
      await put(args.expiry_field, `${mm}/${yy}`, 'expiry');
      await put(args.month_field, mm, 'expiry month');
      await put(args.year_field, '20' + yy, 'expiry year');
      await put(args.cvc_field, this.dec(c.cvc), 'security code');
      await put(args.zip_field, c.zip, 'postcode');
      if (!done.length) throw new Error('Give the element ids of the card fields (from browser_read).');
      return `Typed ${done.join(', ')} for the ${c.brand} ending ${c.last4}. Nothing has been paid yet. Tell the user what you're buying and the price, and only press the final Pay button if they say yes.`;
    }
    throw new Error('Unknown tool');
  }
}

module.exports = { Vault, VAULT_TOOLS };
