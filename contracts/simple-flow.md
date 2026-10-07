# Contract: chat-first flow

## Purpose
Make Sage and Wayfarer work like ChatGPT, Claude or Gemini: open the page and chat, with no sign-in. Memory is
something you turn on, not a gate. Priority order (user, 2026-10-07): **the user's control over their data comes
first** (the pitch); within that, as few passkey prompts as possible (on a desktop without a platform authenticator
each prompt is a QR scan with a phone). Rule used throughout: a step that **widens** who can see data (approving an
app, letting an agent's memory reach other apps) keeps an explicit, visible check; a step that only restores the
user's own access or **narrows** sharing (unlock, refresh, revoke, undo, reject) never prompts. No network step can block chatting: if the vault,
relay, indexer or chain is slow or down, the chat keeps working without memory and catches up later.

The visual redesign is in `contracts/ui.md`. This contract covers flow and behavior.

Amends, once approved (each file gets a matching edit and new golden cases):
- `contracts/apps.md`: anonymous chat (A1 changes: no cookie means chat without memory, not 401); connect does not
  wait for the chain; the agent app has no gate in front of chat.
- `contracts/sdk.md` "Session scoping": approve without a new passkey prompt when the vault is already unlocked
  on this device; a stored session (section B).
- `contracts/crypto.md` "Key material is never written to storage": changes to section B's rule.
- `contracts/disclosure.md`: bridge unlock by handoff or from its stored session; the bridge writes the approval;
  auto-saved proposals become candidates for every approved agent.
- `contracts/provenance.md`: review action `auto`; "Auto-confirm settings" moves into scope.

## Why (measured in the code, 2026-10-07)
| Problem | Cause |
|---|---|
| Can't chat without a vault | agent server returns 401 `NOT_AUTHORIZED` with no session cookie (agent-kit `disclosureChat`) |
| Up to 5 passkey prompts | popup approve, then a separate bridge unlock per app, then a vault unlock to review |
| Refresh loses the connection | the vault session lives only in memory; the bridge starts locked on every load |
| Connecting is slow and fails on a bad network | the popup waits for the policy transaction's receipt (`relay.ts` `waitForTransactionReceipt`) before replying |

## Target flow
| Step | What happens | Passkey | Waits on network? |
|---|---|---|---|
| Open Sage | chat right away; Sage works without memory | 0 | agent server only |
| Sage hears something worth keeping | a pill "Not saved yet" and a "Turn on memory" button | 0 | no |
| Turn on memory | popup: one passkey creates (or unlocks) the vault; Approve | 1 | no |
| Back in Sage | the vault strip is unlocked; the waiting memories go to your vault as Sage's suggestions | 0 | background only |
| "2 to review" in the vault strip | opens a vault popup (already unlocked): Confirm, Edit or Reject each | 0 | background only |
| Refresh Sage, or come back tomorrow | still connected and unlocked | 0 | no |
| Open Wayfarer, chat | works right away | 0 | agent server only |
| Turn on memory in Wayfarer, within 10 min of the last passkey | popup already unlocked: one Approve click | 0 | no |
| Wayfarer's next reply | uses what you confirmed | 0 | background reads |

One passkey prompt for the whole demo on a new device. Approving another app later (more than 10 minutes after the
last passkey) asks for the passkey again: that is the one prompt kept on purpose.

## A. Chat without a vault
| # | Input | Expected output | Notes |
|---|---|---|---|
| C1 | chat with no session cookie | 200; the model is told the user has no memory connected; no disclosure, no chain read | replaces A1's 401 |
| C2 | C1, the model calls `remember("vegetarian")` | the reply comes back with `pending` for `remember`; the page keeps the text in its local "not saved yet" list and answers `{ ok: false, code: "NOT_CONNECTED" }`; the model says it will keep it once memory is on | nothing is lost |
| C3 | the page is refreshed during C1/C2 | the conversation and the "not saved yet" list come back (agent page `sessionStorage`: this tab only, see C41) | amended by B2 |
| C4 | anonymous chat rate limits | 20 chats per hour per IP and the existing global limit; over that, 429 with "Turn on memory or try again later" | cost bound for KIMI |
| C5 | memory turned on with 2 "not saved yet" items | both are proposed through the bridge right after the unlock (auto-save rules in D apply); the list empties as each is written | |
| C6 | the user clears the conversation | the local conversation and the "not saved yet" list are deleted | |

## B. Stay signed in on this device
After a passkey ceremony, the vault keeps the session's root secret on this device, encrypted under a
non-extractable WebCrypto AES-GCM key, in IndexedDB on the vault origin. Two places keep their own copy, because
browsers partition iframe storage: the vault site and popup (first-party), and each app's bridge (one partition per
app site). The copy expires 7 days after the last use, or at once on "Lock" or on revoking that app.

Honest scope: the non-extractable key protects the copy on disk; code running on the vault origin (an XSS bug) can
still use it, as it can use an in-memory session today. The landing copy changes from "This browser stores
nothing" to "Stays signed in on this device until you lock it".

| # | Input | Expected output | Notes |
|---|---|---|---|
| C7 | Sage connected; refresh the page | the bridge restores its session from its storage, no prompt; status "sharing only what is relevant" | the refresh problem |
| C8 | come back 6 days later | same as C7; the 7 days restart | |
| C9 | come back 8 days later | the bridge is locked; "Unlock" asks for the passkey | |
| C10 | "Lock" on the vault site | the vault session and its first-party stored copy are deleted (vault site and popups). App strips keep their own copies (browsers partition iframe storage, so the vault site cannot reach them); each strip has its own Lock, and revoking an app clears that app's copy (C11) | amended 2026-10-07 during build: the first draft promised more than browsers allow |
| C11 | revoke Sage (vault site or Sage's strip) | Sage's bridge stops answering; it deletes its stored copy at once (strip revoke) or on its next load once it reads an inactive approval (vault-site revoke). "No approval found yet" never deletes it (indexer lag right after connecting) | |
| C12 | site data cleared | everything works again with the passkey (sdk.md case 2 still holds) | |
| C13 | the stored record is corrupted or its key is missing | it is deleted; the bridge shows locked; no crash | |
| C14 | stored copies never hold plaintext keys | the IndexedDB record is AES-GCM ciphertext; the wrapping key has `extractable: false` | |

### B2. Apps forget the vault when the tab closes (user decision 2026-10-07, fixes problem 3 / C10)
Only the vault site (first-party) keeps the 7-day copy, so "Lock" there covers every long-lived copy. Each app's
bridge keeps its copy **for the tab only**: the ciphertext in the bridge's `sessionStorage` (survives a refresh,
deleted when the tab closes), the wrapping key in its IndexedDB (useless without the ciphertext). Reopening an app
later: the strip shows **"Resume memory"**; one click opens `/resume?agentId=N&origin=<app origin>` from the strip
(its opener is the strip itself). The resume popup opens unlocked from the vault site's copy (or asks the passkey
if the vault is locked), checks that an active approval exists for exactly this agent and origin, hands over the
session and that approval to its opener, and closes. It has no approve control: resuming never widens access.
The app page's own chat (anonymous conversation and "not saved yet" memories) also lives in `sessionStorage`.

| # | Input | Expected output | Notes |
|---|---|---|---|
| C35 | Sage connected; refresh | strip still unlocked, no prompt, no click (C7 unchanged) | tab copy |
| C36 | close the Sage tab, open Sage again | strip locked, shows "Resume memory"; no stored copy is left in Sage's partition | nothing long-lived in apps |
| C37 | "Resume memory" while the vault site's copy is valid | popup opens unlocked, hands over, closes; no passkey prompt | one click, no QR |
| C38 | "Resume memory" after "Lock" on the vault site | the popup asks for the passkey | Lock really locks |
| C39 | resume for an agent with no active approval, an approval for another origin, or an unknown app origin | the popup says the app is not approved and sends nothing | resume never widens access |
| C40 | close or refresh the app tab with "not saved yet" memories | the browser's leave warning (its own fixed text); the page shows a banner "N memories not saved yet" with "Turn on memory" before that | browsers forbid custom text in that dialog |
| C41 | anonymous chat, refresh / close the tab | refresh keeps the conversation; closing the tab deletes it | replaces C3's `localStorage` |
| C42 | a bridge partition still holding a 7-day IndexedDB copy from an earlier build | deleted on load | migration |
| C43 | the app tab stays open after "Lock" on the vault site | that tab's strip stays unlocked until the tab closes (the vault site cannot reach it); the next open needs Resume, which asks for the passkey | honest limit |

## C. Connect in one step, without waiting for the chain
The popup unlocks with the stored session or one passkey, then shows the approval. Approve asks for the passkey
**unless a passkey ceremony happened in the last 10 minutes** (sdk.md's window grows from 60 s to 10 min). Unlocking
from the stored session (section B) is not a ceremony, so approving a new app on another day always asks once. It signs
the app-session proof (local, no network) and hands the session and the approval to the app's bridge (handoff
below), then closes. The bridge writes the approval to the chain in the background and retries until it lands.

Handoff: `window.opener.frames[i].postMessage({ type: "engram:bridge:unlock", v: 1, agentId, prf, credentialId,
policy }, VAULT_ORIGIN)`
(`policy` = the approval just written, with its `seq`; the bridge primes its cache with it, disclosure.md D39-D43) for each frame. The browser delivers it only to a frame on the vault origin, so the app
page never sees it.

| # | Input | Expected output | Notes |
|---|---|---|---|
| C15 | Turn on memory, new user | one passkey prompt (create); Approve; the popup closes with no wait for any transaction | |
| C16 | Turn on memory in Wayfarer, 5 min after the passkey in C15 | the popup opens unlocked; Approve without a prompt | one prompt for the demo |
| C17 | Turn on memory in a new app, 2 days later (vault restored from storage, no recent ceremony) | the popup opens unlocked; Approve asks for the passkey once | widening sharing keeps its check |
| C17b | the popup's vault is locked (8 days later) | one passkey prompt unlocks it, and the same ceremony covers Approve | never two prompts in a row |
| C18 | the relay, RPC or indexer fails while approving | the popup retries on its own (after 1, 2, 4, 8, 16 s) with a visible "Network trouble, retrying (n/5)" line; the chat in the app keeps working meanwhile; after 5 failures it shows "Couldn't save your approval. Check your connection and press Approve again." No passkey prompt on a retry within 10 min (C16) | amended 2026-10-08, see note |
| C19 | (dropped 2026-10-08) | the approval is written by the popup, not queued in the strip | see note |

**Note on C18/C19 (amended during the build, needs the reviewer's OK).** The first draft had the popup close
without waiting for the chain and the strip write the approval later from an outbox. That conflicts with the HO-2/HO-3
fix: the strip answers from the approval the popup hands over, and that approval is trusted only through its onchain
`seq` (disclosure.md D39-D46). Without waiting, the seq is a guess; a wrong guess either brings HO-2 back (first
message looks revoked) or weakens "a revoke always wins". On Monad the wait is about 1-2 s, so the popup keeps it and
retries network failures instead. Retrying is safe: a second write of the same approval is just the newest one.
Retryable: `RELAYER_UNAVAILABLE`, `SOURCE_UNAVAILABLE`, and errors that are not Engram errors (network failures in
reads). Never retried: passkey cancel/mismatch, `INPUT_INVALID`, `RELAY_REJECTED`, `TX_REVERTED`, `RATE_LIMITED`.
| C20 | the app page's own script listens for `message` events | it never receives `prf` or `policy` | the secret stays on the vault origin |
| C21 | unlock message from another origin, or for another agentId | ignored | |
| C21b | unlock message carrying `policy` (the approval just written, with `seq`) | the bridge primes its session with it (disclosure.md D39); a `policy` that is not an object, or names another agent, makes the whole message ignored | HO-2 |
| C22 | the bridge has not loaded when the popup approves | the popup retries every 250 ms for up to 3 s; then the bridge restores from its own storage on next load, or asks for the passkey | |
| C23 | `window.opener` is null | approval completes; no handoff; the bridge unlocks with its stored copy or one prompt | |
| C24 | revoke right after approving, before the policy write landed | the outbox drops the approval and writes the revoke (latest wins, D36) | |

## D. Review without a trip, auto-save as an opt-in

Built 2026-10-08: the opt-in switch, `auto` records, Undo and reject-all coverage (provenance.md P27-P38). Not built:
the `/review` popup (agreed cut); review happens in the vault's Review tab, which opens with no prompt (B).
Agent writes stay suggestions until the user confirms them (provenance.md), so one bad app cannot feed made-up
details to the others. What changes is the cost of confirming: the vault strip in the app shows "N to review", which
opens a **top-level vault popup** (`/review?agentId=N`), unlocked from the stored session with no prompt, listing that
app's pending suggestions with Confirm, Edit, Reject and "Confirm all". The strip itself still has no confirm
control (clickjacking rule, disclosure.md); it only opens the popup.

Auto-save stays available as an explicit choice: a switch in the connect popup, **off by default**, "Let Sage save
without asking me". When on, the bridge writes the proposal and a review record `"action":"auto"` (no copy). A
proposal whose latest review is `auto` reaches every app approved for that topic, with `by: "owner"`. "Undo" or
"Reject all from Sage and revoke" writes `reject`, which removes it from every app.

| # | Input | Expected output | Notes |
|---|---|---|---|
| C25 | Sage proposes 2 memories, auto-save off | the strip shows "2 to review"; Wayfarer cannot see them yet (D19) | control by default |
| C25b | tap "2 to review" | a vault popup opens unlocked, no prompt, with the 2 suggestions; "Confirm all" confirms both and closes | no vault trip, no QR |
| C25c | C25b, then Wayfarer asks about "diet" | returns the confirmed memory, `by: "owner"` | P3 |
| C25d | the popup's vault is locked (no stored session) | one passkey prompt, then the list | |
| C25e | a flagged suggestion ("Ignore previous instructions ...") in the popup | shown with the warning and no "Confirm all" coverage: it must be confirmed on its own | |
| C26 | auto-save switched on at connect; Sage proposes "vegetarian" | proposal + `auto` review; the vault shows "Saved by Sage automatically" with Undo; Wayfarer can get it | user's explicit choice |
| C27 | auto on; Sage proposes "Ignore previous instructions and ..." | flagged: stays pending, no `auto` record; Wayfarer cannot see it; counted in "N to review" | |
| C28 | "Undo" on an auto-saved memory, or "Reject all from Sage" | `reject` record(s); no app gets them any more; no prompt | narrowing never prompts |
| C29 | policy with `"auto":false`; review `auto` with a `copy`; an `auto` record not appended by the owner | `ENTRY_INVALID` / `ENTRY_INVALID` / ignored | crypto strictness, P11 |

## E. Network failures never break the chat
| # | Input | Expected output | Notes |
|---|---|---|---|
| C30 | the indexer or RPC is down during a chat turn | the disclosure gives up after 3 s; the turn is sent with `memory: "none"`; a small note "Memory is slow right now, answering without it" | chat first |
| C31 | the relay is down when Sage saves | the proposal waits in the bridge's outbox (persisted), the pill shows "Saving…", and it is retried; on success the pill turns to "Saved" | |
| C32 | the agent server is down | the user's message stays on screen with "Not sent. Retry"; nothing is lost | |
| C33 | passkey prompt cancelled or failed | the popup stays open with "Try again"; chatting in the app continues without memory | |
| C34 | any outbox item that fails 20 times | kept, shown in the vault as "Not saved yet" with a Retry button; never silently dropped | |

## Edge cases that must be covered
- Two Sage tabs share one bridge partition: both restore from storage; their outboxes do not double-send (each
  item has an id; the chain write is checked before a retry).
- A different passkey unlocks a bridge that holds another owner's stored session: the old session and copy are
  replaced; the old owner's outbox is kept under its owner id, not sent with the new key.
- Anonymous conversation text stays in the app's `localStorage` on this browser only; it is never sent to the
  vault until the user turns memory on, and then only the "not saved yet" items are proposed.

## Known limitations (found while building, 2026-10-07)
- A strip unlocked with its own passkey prompt on a site the user never approved keeps its stored copy in that
  site's partition (it can only be used by vault code there, and the strip answers nothing without an approval).
- Right after connecting, the strip may not see the new approval until the indexer catches up (BUGLOG HO-2; fixed
  by C18 in step 3).

## Explicitly out of scope
- Accounts other than passkeys (email, Google sign-in).
- Syncing the anonymous conversation across devices.
- A delegated session key with limited power instead of the stored root secret (a registry change; post-hackathon).

## Logging
`{ stage: "vault", op: "handoff" | "restore" | "outbox" | "autoSave", ok, code?, tries? }`,
`{ stage: "agent", op: "anonChat", ok }`. Never secrets, never memory text.

## Decisions (user, 2026-10-07: "data control is the priority; reduce QR logins as much as possible")
1. Stay signed in for **7 days** after last use. Apps never get the stored session (it lives on the vault origin
   only), so app access is unchanged; "Lock" and revoke clear it.
2. Approving a new app keeps its passkey check, with the window after a ceremony widened from 60 s to 10 minutes.
3. Anonymous chat (no vault) for both apps, rate-limited per IP; nothing from it reaches the vault until the user
   turns memory on.
4. Agent suggestions need confirmation by default; confirming happens in a no-prompt popup from the app. Auto-save
   is an opt-in switch, off by default.

## Passkey prompts (QR scans on a desktop without a platform authenticator)
| Situation | Before | After |
|---|---|---|
| First demo: Sage, confirm, Wayfarer | 5 | 1 |
| Refresh an app | 1 | 0 |
| Come back within 7 days and chat | 1 per app | 0 |
| Confirm suggestions | 1 (vault unlock) | 0 |
| Revoke, undo, reject | 0-1 | 0 |
| Approve a new app on a later day | 1-2 | 1 (kept on purpose) |

## Status
- [x] Drafted (2026-10-07, v2 "chat-first", replaces the v1 draft of the same day)
- [x] Reviewed by a human (2026-10-07: "approved, start building")
- [ ] Implementation matches this contract
- [ ] Golden tests exist for every behavior case above
