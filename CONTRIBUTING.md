# Contributing to Wayzerr

Thanks for helping. Bug reports, ideas and pull requests are welcome.

## Before you start
- Open an issue first for anything bigger than a small fix, so we can agree on the approach.
- Security problems: do **not** open a public issue. See [SECURITY.md](SECURITY.md).
- Be kind. This project follows the [Code of Conduct](CODE_OF_CONDUCT.md).

## Your contribution and the licence
Wayzerr is released under the [MIT licence](LICENSE). By opening a pull request you confirm that:
1. you wrote the change yourself, or you have the right to submit it;
2. you license it under the same MIT licence as the project, so it can be used in Wayzerr and its official builds;
3. it contains no code, text, images or data copied from a source whose licence doesn't allow this, and nothing confidential or personal.

Sign off your commits with `git commit -s` (this adds a `Signed-off-by:` line, the [Developer Certificate of Origin](https://developercertificate.org)). Contributions from employers or under another licence: ask us first.

## Rules for code
- Don't add tracking, analytics or data collection. Wayzerr sends nothing to us except what the privacy policy lists. A change that adds a new network destination or new data leaving the computer must say so in the pull request and update `THIRD_PARTY_NOTICES.md` and the privacy policy (`src/site/privacy.html`).
- New dependencies: say why, check the licence is compatible with MIT distribution, and add it to `THIRD_PARTY_NOTICES.md`.
- Anything a bot can do that sends, pays, posts or deletes must keep asking the user (see `askPermission` in `src/ai.js`). Don't add "always allow" paths for cards or logins.
- Don't use the Anthropic, OpenAI, Google or other providers' logos or names in a way that suggests they made or endorse Wayzerr (see [TRADEMARKS.md](TRADEMARKS.md)).

## Running and checking
```bash
npm install
sh scripts/check.sh
npm start
```
