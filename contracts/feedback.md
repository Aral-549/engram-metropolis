# Contract: in-site bug reports

## Purpose
Let anyone using the vault site, Sage, Wayfarer or the MCP link page report a bug in a few seconds, without leaving
the page or needing an account, and store each report where only the builder can read it. It never collects memory
content, keys, link tokens or anything else from the vault. Hands off: storage to Upstash for Redis (Vercel
Marketplace, connected to the `engram-vault` project); triage to the builder, and confirmed bugs go to `BUGLOG.md`
as usual. (Amended 2026-10-09: email via Resend needs an owned domain, which the project does not have.)

## Components
- `ReportBug` button + dialog, one copy per app (vault: landing footer, dashboard sidebar, `/link`, `/connect`;
  agent apps: the footer line under the chat input).
- `POST /api/report` on the vault app only. The agent apps post to it cross-origin; it allows exactly the Sage and
  Wayfarer origins (`NEXT_PUBLIC_SAGE_URL`, `NEXT_PUBLIC_WAYFARER_URL`) and its own.
- Env (vault project only): `KV_REST_API_URL` / `KV_REST_API_TOKEN` (or `UPSTASH_REDIS_REST_URL` / `_TOKEN`),
  provisioned by the integration.
- Reading: there is **no** read endpoint on the site. The builder reads reports with `npm run reports` (prints the
  newest 20; env from `vercel env pull`) or in the Upstash console's data browser.

## Inputs
- From the user: `what` (required, 1-2000 characters: "What happened?"), `contact` (optional, at most 200 characters:
  "Email or handle, if you want a reply").
- Attached automatically and shown in the dialog before sending ("Sent with this report: ..."): app (`vault` |
  `sage` | `wayfarer`), page path **without query or `#fragment`**, browser user agent, viewport size, time.
- A hidden honeypot field.

## Outputs
- One JSON record `{ id, t, app, path, what, contact?, ua, vw, vh }` pushed to the Redis list `reports` (newest
  first, trimmed to the newest 1000).
- Response `{ ok: true }` (201), or `{ ok: false, code }` with `BAD_REQUEST` (400), `RATE_LIMITED` (429),
  `NOT_CONFIGURED` / `SEND_FAILED` (503).

## Behavior cases (input -> expected output)
| # | Input | Expected output | Notes |
|---|---|---|---|
| R1 | any listed page | a "Report a bug" control, at least 24 px, reachable by keyboard | |
| R2 | open the dialog | a textarea focused, an optional contact field, the "Sent with this report" line, Send and Cancel; Escape closes | |
| R3 | send with text | "Thanks, sent." in the dialog; `npm run reports` shows it first, with app, path, user agent, viewport, time | |
| R4 | send from `/link?port=7457&agent=2070#token=...` | the stored report contains `/link` only: no query, no token | the token pairs the vault |
| R5 | empty or whitespace-only text | Send disabled; the API answers 400 anyway | |
| R6 | text over 2000 characters, or contact over 200 | 400; nothing sent | |
| R7 | honeypot filled | 201 to the client, nothing sent | bots |
| R8 | more than 5 reports from one IP in 10 minutes | 429; the dialog says "Too many reports, try again in a few minutes." | counted in Redis, across instances; the IP itself is never stored (only a hash, expiring with the window) |
| R9 | a POST from an origin not listed | 403, no CORS headers | |
| R10 | the Redis env missing, or Redis fails | 503; the dialog says "Couldn't send. Try again later." and keeps the text | |
| R13 | any GET or other method on `/api/report` | 405; reports are never readable from the site | |
| R11 | text containing HTML or a script | sent as plain text only; nothing is rendered as HTML anywhere | |
| R12 | the vault dashboard, unlocked | the report still carries no vault address, memories, approvals or session data | |

## Edge cases that must be covered
- The dialog never reads the page's state, storage or the vault session; only the fields above.
- A report sent while offline keeps its text in the dialog (R10 message) so nothing typed is lost.
- Body cap 8 KB at the route; non-JSON bodies are 400.

## Logging
`{ stage: "report", ok, code?, app, durationMs }`. Never the report text, contact or user agent.

## Explicitly out of scope
- Screenshots and attachments, a public issue list, replying from the site.
- Reports from inside the vault strip iframe (it shows no controls besides lock state; disclosure.md).

## Status
- [x] Drafted (2026-10-09)
- [x] Reviewed by a human (2026-10-09: "go")
- [x] Implementation matches this contract (2026-10-09; live Redis write not yet checked: needs a deploy)
- [x] Golden tests exist for every behavior case above: tests/golden/vault/vault.report.golden.test.ts (route, R3-R13,
  in-memory Redis) and tests/e2e/report.e2e.spec.ts (browser, R1-R5, R8, R10, R12, R13)
