# What the wayzerr.com backend must do

The backend (sign-in, `/api/*`, connected apps, tunnels) is not in this repo. The app and the legal pages now assume the following. Implement and confirm each, or change the wording in the policies.

## 1. Sign-in page: age, then agree, then Google
Flow on the page opened by the app (`verification_url`): **1)** ask the age, **2)** show "I agree to the Terms of Service and have read the Privacy Policy" (a checkbox that stays disabled until the age is old enough), **3)** only then show/enable "Continue with Google". Reference page: `signin-page-example.html` (no third-party scripts).
- **The server must enforce it, not just the page.** Don't start the Google flow or create an account unless the request says `age_ok=1` and the current `terms_version`.
- Store only: `terms_version`, `accepted_at`, `age_ok=true`. Don't store the exact age.
- Under the minimum age (16): show a polite message and stop before any Google redirect, so no data is collected.
- Google sign-in needs: the Privacy Policy and Terms URLs on the OAuth consent screen, a verified domain, and only the basic scopes (`openid email profile`).
- The Privacy Policy must mention Google sign-in (what you receive: email, and name/picture only if you keep them) once it is turned on. Update `src/site/privacy.html` and `src/site/de/datenschutz.html` first.

## 2. Account deletion endpoint (called by the app)
`POST /api/account/delete` with `Authorization: Bearer <token>`.
- Success `200 {"ok":true}`: delete the email, sign-in tokens, tunnel names (`p-xxxx.wayzerr.com` DNS and Cloudflare tunnel), Composio entity and connections, and any logs tied to the account within [30 days]. Keep only what the law requires.
- `401`: token already invalid; the app treats this as done.
- The app falls back gracefully (it still erases local data) and tells the user to email privacy@ if the server could not be reached or doesn't support deletion yet.

## 3. Data export and access
Provide the account's stored data (email, sign-up time, device list, tunnel name) on request. A manual process is fine at this size (see DATA-REQUESTS.md).

## 4. Logging and retention
- Keep IP/request logs no longer than needed (suggest 30 days), and say the number in the Privacy Policy.
- Don't log message content; the app never sends chats to wayzerr.com (confirm for the connected-apps proxy: it must not store tool arguments or results).

## 5. Cookies on sign-in pages
If sign-in pages set any cookie or storage, use only strictly necessary ones, set `Secure; HttpOnly; SameSite=Lax`, and keep the Privacy Policy cookie section accurate.

## 6. Email
Send sign-in codes only; no marketing without opt-in. Set SPF, DKIM, DMARC.

## 7. Subprocessors
Keep a list of every service that touches personal data (host, email sender, Cloudflare, Composio) with a signed data processing agreement where available (Cloudflare, Composio and most email providers offer one).
