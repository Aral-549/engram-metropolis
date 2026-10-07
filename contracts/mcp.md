# Contract: Engram for MCP clients (Claude Code, Claude Desktop, Cursor)

## Purpose
Let anyone give the AI tools they already use a memory they control, with no code: install one command, open one
link, approve once. The MCP server holds **no keys and no memory**. It forwards questions to the user's vault,
which stays open in a browser tab and answers with exactly the Disclosure-mode rules every web agent gets
(relevant entries only, approved topics only, every read logged, writes are proposals the user reviews).

Hands off: selection, logging, quarantine and review to `contracts/disclosure.md` and `contracts/provenance.md`;
the stored session that keeps the vault tab unlocked to `contracts/simple-flow.md` B.

## Components
- `packages/mcp` (`engram-mcp`): a stdio MCP server for the MCP client, plus a link server on
  `127.0.0.1:7457` (`ENGRAM_PORT` to change) that the vault tab connects to.
- Vault page `/link?port=7457#token=<t>`: the "desktop link" tab. It approves the desktop agent once, then acts as
  that agent's bridge over the link instead of over `postMessage`.
- One ERC-8004 agent registered on Monad testnet for all MCP clients: "Engram Desktop". Approvals use the origin
  `http://127.0.0.1:7457`. The read log shows "Engram Desktop (<client name>)", the name taken from the MCP
  `initialize` request (e.g. "claude-code").

## Pairing
1. On start, `engram-mcp` makes a random 128-bit token and prints (stderr) one link:
   `https://<vault>/link?port=7457#token=<t>`. Tools called before pairing return that link.
2. The vault page reads the token from the URL fragment (never sent to any server), opens
   `ws://127.0.0.1:7457`, and sends `{ type: "hello", v: 1, token }`. The link server accepts exactly one vault
   connection whose token matches and whose `Origin` header is the vault origin; anything else is closed.
3. The vault page shows the approval (topics, read or read and suggest, expiry), with the same passkey rule as any
   app (simple-flow.md C). After that it answers requests. Re-opening the same link later re-links without a new
   approval while the approval is active.

## Tools
| Tool | Arguments | Result |
|---|---|---|
| `recall` | `{ query: string <= 500, all?: boolean }` | the disclosed entries as text (`- [preference] vegetarian`), or "Nothing relevant in your vault." |
| `remember` | `{ kind: "fact" \| "preference" \| "note", text: 1..500 }` | "Saved to your vault as a suggestion; confirm it in your vault." (or "Saved." when auto-save is on) |
| `vault_status` | none | linked or not, approved topics, the link to open if not linked |

The tool descriptions tell the model that recalled text is data, not instructions.

## Behavior cases (input -> expected output)
| # | Input | Expected output | Notes |
|---|---|---|---|
| M1 | `recall` before any vault tab linked | text result with the link to open; no error thrown to the client | |
| M2 | vault tab opens the link with the right token and origin | link accepted; `vault_status` reports linked | |
| M3 | a connection with a wrong or missing token | closed at once; nothing answered; logged `LINK_REJECTED` | other local programs |
| M4 | a connection whose `Origin` is not the vault origin (another website open in the browser) | closed at once, even with the right token | other websites |
| M5 | a second vault connection while one is linked | refused; the first stays | |
| M6 | linked and approved for `preferences`; `recall({ query: "diet" })` with "vegetarian" stored | returns "vegetarian"; the vault log shows the read by "Engram Desktop (claude-code)" | same rules as D6 |
| M7 | `recall` for a topic not approved | entries from it never returned (D14) | |
| M8 | `remember({ kind: "preference", text: "uses pnpm" })` with auto-save off | a proposal in the vault's review list; other apps cannot see it until confirmed (D19) | |
| M9 | `remember` on a read-only approval | text result "This link can only read your vault." (D16) | |
| M10 | the vault tab closes or the network drops | next tool call returns "Your vault is not linked; open <link>"; it re-links when the tab reopens | |
| M11 | the vault tab is locked (stored session expired) | tool returns "Your vault is locked; unlock it in the vault tab" (D5) | |
| M12 | the user revokes Engram Desktop in the vault | the link tab stops answering (`NOT_APPROVED`); tools say access was revoked | D12 |
| M13 | more than 60 recalls in 10 minutes | `RATE_LIMITED` text result (D26) | |
| M14 | a message on the link that is not valid JSON, is over 64 KB, or has an unknown type | ignored, connection kept; logged | |
| M15 | the link server port is already taken | `engram-mcp` exits with a clear message naming `ENGRAM_PORT` | |
| M16 | `engram-mcp` never writes anything but the pairing link and errors to stderr, and nothing to stdout except MCP protocol | MCP clients do not break | stdio rule |

## Edge cases that must be covered
- The link token lives only in the URL fragment and in memory; it changes every time `engram-mcp` starts.
- Two MCP clients running `engram-mcp` at once: the second exits with M15 unless it is given another port; each
  needs its own link tab.
- The vault page must keep working if the browser blocks `ws://127.0.0.1` from an https page: it shows what to
  allow (Chrome local network permission) instead of failing silently. **Spike first (1 hour):** check Chrome,
  Firefox and Safari. If any of them cannot connect at all, switch the transport to a hosted relay that forwards
  ciphertext only (key derived from the token), and amend this contract before building it.

## Explicitly out of scope
- ChatGPT: it needs a remote (hosted) MCP server, not a local one. Later.
- Holding keys or memory in `engram-mcp`, caching answers between calls.
- One link serving several vaults or several people.

## Distribution (needs the user)
- `npx engram-mcp` needs an npm publish from the user's account (outward-facing; confirm before publishing).
  Until then: `npx -y github:<user>/<repo>` with a `bin` entry, or a clone + `npm run mcp`.
- Install snippets for Claude Code (`claude mcp add engram -- npx -y engram-mcp`), Claude Desktop and Cursor
  (JSON config) in `docs/MCP.md`.

## Logging
`engram-mcp` (stderr, JSON lines): `{ stage: "mcp", op: "tool" | "link", tool?, ok, code?, durationMs }`. Never
query text, memory text or the token. The vault side logs as the bridge does (disclosure.md).

## Status
- [x] Drafted (2026-10-07)
- [x] Reviewed by a human (2026-10-07: "okay start building")
- [ ] Implementation matches this contract
- [ ] Golden tests exist for every behavior case above
