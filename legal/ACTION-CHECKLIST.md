# Action checklist (things only the owner can do)

Nothing here makes you impossible to sue. It makes claims harder to bring, easier to defend and cheaper to survive.

## Publishing status (October 27, 2026)
**Ready to publish (no personal details, no brackets):** `src/site/terms.html`, `src/site/de/nutzungsbedingungen.html`, the updated `src/site/index.html` (footer shows Terms only), `src/site/_headers`, `src/site/fonts/`, the app's age + Terms screen.

**NOT ready, don't deploy yet** (they still contain `[BRACKETS]` or need the operator's name/address): `privacy.html`, `imprint.html`, `accessibility.html`, `open-source.html`, `de/datenschutz.html`, `de/impressum.html`. They are not linked from anywhere. Before the app collects emails or uses Google sign-in, the Privacy Policy and the Impressum are required in Germany; finish them first. To show their links again: footer in `index.html`, `legalLinks()` in `src/renderer/app.js`, and the Privacy line in `legal/signin-page-example.html`.

The Terms have no operator name or address on purpose. Have a German lawyer check them, in particular the liability clause (section 14 EN / 13 DE) and the section about signing in with an AI plan.

## Do first
- [ ] Fill every `[BRACKET]` in `src/site/*.html`, `TRADEMARKS.md`, `THIRD_PARTY_NOTICES.md`. Search: `grep -rn "\[[A-Z]" src/site/*.html TRADEMARKS.md THIRD_PARTY_NOTICES.md`
- [ ] Get a lawyer to review the Terms, Privacy Policy and the points below (a few hours of a privacy/tech lawyer in your country).
- [ ] Decide how to handle **Sign in with your Claude plan** (see "Provider terms" below).
- [ ] Deploy the backend changes in BACKEND-REQUIREMENTS.md (signup acceptance, account deletion endpoint).
- [ ] Publish the QEMU and system-image source (open-source page offer) and fill in the versions.

## Company, money, insurance
- [ ] Form a company that limits personal liability (LLC, GmbH/UG, Ltd, etc.), then put its name in the Terms, Privacy Policy, legal notice, LICENSE and package.json `author`.
- [ ] Buy cyber/tech E&O liability insurance. Ask whether it covers AI agent actions, data breaches and legal defence for IP claims.
- [ ] Open a business bank account and keep business and personal money separate (otherwise the company's liability shield can be pierced).
- [ ] If you take payments or donations: check tax registration; Buy Me a Coffee is a voluntary tip, but you may owe tax on it.

## Trademark
- [ ] Search for conflicts in your country, the EU (EUIPO) and the US (USPTO) for "Wayzerr" in software classes 9 and 42.
- [ ] File the application (about EUR 850 EUIPO / USD 350 per class USPTO, fees change). Register the domain variants too.

## Code signing
- [ ] macOS: Apple Developer Program (USD 99/year), Developer ID certificate, notarization. Scripts are already in `signing/`.
- [ ] Windows: a signing certificate (Azure Trusted Signing, or SignPath Foundation for open source). Unsigned installers look like malware and give users reasons to blame you.

## Provider terms
- Anthropic's Claude Code legal page says developers "may not collect, store, or intermediate Claude.ai credentials" and that Anthropic "does not permit third-party developers to offer Claude.ai login into their own applications, or to route requests through Free, Pro, or Max plan credentials on behalf of their users", but it allows an end user to sign in to the **unmodified** Claude Code with their own plan. Wayzerr drives the official CLI and never sees tokens, which is the safer variant, but a lawyer should assess whether an app that automatically launches it for users falls on the wrong side. Check the page again before each release: https://code.claude.com/docs/en/legal-and-compliance
- Do the same check for OpenAI (Codex/ChatGPT), Google (Gemini CLI), Cursor, Augment, Amp and GitHub Copilot. Ask each provider if unsure; keep the written answer.
- Safest option: make API keys the default and keep plan sign-in behind a clear "check your provider's rules" notice (the Terms already say this).
- Don't use provider logos or names so it looks endorsed.

## Website and domains
- [ ] Turn on HTTPS-only and the headers in `src/site/_headers` on your host, then test at https://securityheaders.com.
- [ ] The repo doesn't hold the media files the live site uses (`/media/*.mp4`, `icon-v2.png`, etc.). Make sure they are self-hosted. Add captions or a transcript to the demo videos (WCAG 1.2.x) and a way to pause autoplay (2.2.2), then update `accessibility.html`.
- [ ] Never add analytics, chat widgets, session recording, ad pixels, social embeds or YouTube/Vimeo embeds without legal review. They cause most "drive-by" privacy and wiretapping lawsuits and demand letters.
- [ ] Create a monitored privacy inbox, e.g. privacy@wayzerr.com, and put it in the Privacy Policy.
- [ ] Add your imprint details (legal notice) if you serve EU users. Required in Germany, Austria and many other countries.
- [ ] Add SPF, DKIM and DMARC to wayzerr.com email so sign-in emails reach people and can't be spoofed.

## If you add features later
- User-generated content or sharing: register a DMCA agent (US Copyright Office, USD 6) and add a takedown process.
- Paid plans: refund, renewal and tax terms, and click-to-cancel.
- Kids or schools: get legal advice before targeting under-13s or school accounts (COPPA, GDPR-K, FERPA).
- Marketing emails: consent, unsubscribe link and postal address.
