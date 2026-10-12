# Contract: import existing memories

## Purpose
A new owner can paste or upload text they already have (notes, a ChatGPT or Claude memory export, a previous
Engram export) and save selected lines as vault entries, so agents know them from the first chat. Hands off:
writing to the registry (same owner append path as the dashboard); parsing is done in the browser only.

## Inputs
- Pasted text or an uploaded `.txt`, `.md` or `.json` file (max 200 KB).
- The owner picks a topic (default `preferences`) and a kind per run: `preference`, `fact` or `note`.
- Unlocked owner session.

## Outputs
- A preview list of candidate entries, each with a checkbox (all ticked up to 25; the rest unticked).
- On "Save N", N entries are appended as the owner, in one batch with one passkey confirmation where the SDK
  allows it (otherwise the per-entry cost is stated before saving). Result: "Saved N memories".

## Behavior cases (input -> expected output)
| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 1 | Text with 3 bullet lines | 3 candidates, text trimmed, bullet markers removed | |
| 2 | Blank lines, duplicate lines | blanks dropped, exact duplicates collapsed | |
| 3 | A line over 500 chars | split at sentence boundaries into <= 500-char candidates | entry cap |
| 4 | Engram export JSON (export.md) | its entries become candidates with original kind | round trip |
| 5 | ChatGPT-style memory list (one fact per line) | one candidate per line | |
| 6 | Empty or whitespace input | "Nothing to import"; no save button | |
| 7 | File over 200 KB or wrong type | rejected with a clear message; nothing read | |
| 8 | User unticks 2 of 5 | only 3 saved | |
| 9 | Locked session | import disabled with "Unlock first" | |

## Edge cases that must be covered
- Text that looks like a secret (private key block, line starting with `sk-`, 12-word seed pattern): flagged in the preview and unticked by default with a warning.
- Same line already in the vault: shown as "already saved" and unticked.
- A failed write halfway: report exactly which entries were saved; never save twice on retry.
- Parsing never executes content and never sends text anywhere before the owner presses Save.

## Explicitly out of scope
- Direct connectors to ChatGPT, Claude or Notion (paste/upload only).
- Automatic summarization by a model (no model call in this flow).

## Status
- [x] Drafted
- [x] Reviewed by a human (approved by the user 2026-10-13)
- [x] Implementation matches this contract (deviations: undecryptable entries are a per-topic count, the SDK exposes no seq; indexer lag is a boolean note; import offers existing topics; N relayed transactions, no passkey prompt)
- [x] Golden tests exist for every behavior case above (cases that are browser-only are asserted structurally; no e2e run)
