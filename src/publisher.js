// Where updates go: a GitHub repository ("name/repo" → Releases) or a Netlify site ("something.netlify.app").
const github = require('./publisher-github');
const netlify = require('./publisher-netlify');
const isNetlify = (where) => /\./.test(String(where || '')) && !/github\.com/.test(where);
const clean = (where) => String(where || '').trim().replace(/^https?:\/\/(www\.)?github\.com\//, '').replace(/^https?:\/\//, '').replace(/\/+$/, '').replace(/\/releases.*$/, '');
module.exports = {
  isNetlify, clean,
  feedFor: (where) => (isNetlify(where) ? `https://${where}/latest.json` : `https://github.com/${where}/releases/latest/download/latest.json`),
  check: (token, where) => (isNetlify(where) ? netlify.check(token, where) : github.check(token, where)),
  publish: (o) => (isNetlify(o.site) ? netlify.publish(o) : github.publish({ ...o, repo: o.site })),
};
