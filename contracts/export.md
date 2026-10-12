# Contract: export my memories

## Purpose
One button in the vault dashboard downloads everything the owner can read as a file, decrypted in the browser.
Makes "you own your data" concrete. Hands off: decryption to the SDK/crypto packages; nothing is sent to any server.

## Inputs
- An unlocked owner session (the same one the dashboard already uses; no new passkey prompt).
- All topics (namespaces) the dashboard lists, with their entries (text, kind, seq, writer, time, review state).

## Outputs
- `engram-export-YYYY-MM-DD.json`: `{ version: 1, exportedAt, owner, topics: [{ label, entries: [{ seq, kind, text, writer: "you"|"agent:<id>", time, review }] }] }`
- `engram-export-YYYY-MM-DD.md`: one section per topic, one bullet per entry.
- The user picks JSON or Markdown from the button menu.

## Behavior cases (input -> expected output)
| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 1 | Vault with 2 topics, 5 entries | JSON lists both topics and all 5 entries in seq order | |
| 2 | Empty vault | file with empty topics; button still works | |
| 3 | Locked session | button disabled with "Unlock to export" | |
| 4 | Entry rejected in review | exported with `review: "rejected"` (nothing hidden) | |
| 5 | Entry that fails to decrypt | listed as `{ seq, error: "undecryptable" }`; export continues | |
| 6 | Entry text containing Markdown characters | escaped in the .md file; JSON exact | |

## Edge cases that must be covered
- Indexer lag (entries not yet indexed): export warns "N recent entries may be missing" like the dashboard.
- Very long text (500 chars is the cap) round-trips exactly.
- Filename never contains the owner address.
- No network call carries decrypted text (verified in the e2e by intercepting requests).

## Explicitly out of scope
- Deleting memories (the log is append-only; revoking agents is the control).
- Re-import of the file (see contracts/import.md, which accepts it as plain text/JSON).

## Status
- [x] Drafted
- [x] Reviewed by a human (approved by the user 2026-10-13)
- [x] Implementation matches this contract (deviations: undecryptable entries are a per-topic count, the SDK exposes no seq; indexer lag is a boolean note; import offers existing topics; N relayed transactions, no passkey prompt)
- [x] Golden tests exist for every behavior case above (cases that are browser-only are asserted structurally; no e2e run)
