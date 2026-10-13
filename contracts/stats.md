# Contract: live usage stats strip

## Purpose
Show visitors and judges, on the landing page, real onchain usage of Engram: how many vaults exist, how many
memories were written, how many agents are connected. Numbers come from the indexer, never from a counter we edit.
Hands off: indexing to the Envio indexer (contracts/indexer.md); page layout to contracts/ui.md.

## Inputs
- Indexer GraphQL endpoint (server-side env, same one the apps already use, read-only).
- Entities used: `Owner` (one row per vault owner), `Entry` (memory writes), `Agent`, `DailyStat`.

## Amendment 2026-10-13 (found against the real indexer)
The indexer is shared with the earlier hacksprint project (same registry, 100+ owners and 1000+ agents that are not
Engram's). So every number is scoped to the Engram launch, 2026-10-08 00:00 IST (unix 1791397800). In disclosure mode
agents write no entries and hold no key grants, so "agents connected" cannot be derived and is removed. "Active today"
is replaced by a peak, because "0 active today" would mislead on a quiet day.

## Outputs
- `GET /api/stats` on the vault app: `{ ok: true, vaults, memories, peakDay, updatedAt }` (non-negative integers,
  `updatedAt` ISO time), cached for 60 s (`s-maxage=60, stale-while-revalidate`).
  - `vaults`: distinct `Owner` rows with `firstSeenAt >= 1791397800`.
  - `memories`: sum of `DailyStat.entries` for days `>= 2026-10-08`.
  - `peakDay`: the largest `DailyStat.activeOwners` among those days.
- Landing strip: three numbers labelled "vaults", "memories saved", "most vaults active in a day", caption "since
  launch, from Monad testnet".
- On failure: `{ ok: false, code: "UPSTREAM" }` (502). The strip hides itself; the landing page never shows an
  error or a fake number.

## Behavior cases (input -> expected output)
| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 1 | 22 owners since launch, days with entries 94 and 1 and activeOwners 16 and 1 | `{ ok:true, vaults:22, memories:95, peakDay:16 }` | Plain counts |
| 2 | Two requests within 60 s | One indexer query; second is served from cache | Protects the shared endpoint |
| 3 | Indexer returns empty lists | All numbers 0; strip shows 0s | No hiding for zero |
| 4 | Indexer times out (> 4 s) or returns an error | 502 `UPSTREAM`; strip hidden | No stale invented value |
| 5 | No DailyStat days since launch | `memories: 0, peakDay: 0` | Missing rows are zero |
| 6 | Owner with several namespaces | Counted once as one vault | Vault = distinct owner |
| 7 | Page loads with JS slow | Strip renders nothing until data arrives; no layout jump (reserved height) | |
| 8 | Owner or day rows from before the launch exist in the indexer | Not counted (filtered in the query) | shared indexer |

## Edge cases that must be covered
- Indexer lag: numbers may trail the chain by seconds to minutes; the strip says "from Monad testnet" and never claims real-time.
- Counts above 10,000 are shown with thousands separators; no abbreviation that hides digits.
- Responses with a non-numeric or negative field are treated as UPSTREAM failure.
- Only counts are exposed. No addresses, no ciphertext, no per-owner data (privacy: owner addresses are public onchain but we do not list them).
- Multiple agents/labels share the same endpoint; the route sends no auth headers to the browser.

## Explicitly out of scope
- Charts, history, leaderboards (a later page, if ever).
- Counting MCP installs or website visits (not onchain; no analytics are collected).
- Any write path.

## Status
- [x] Drafted
- [x] Reviewed by a human (approved by the user 2026-10-13)
- [x] Implementation matches this contract (checked against the live indexer 2026-10-13: 22 owners, 95 entries)
- [x] Golden tests exist for every behavior case above (case 7, layout jump, is a browser case covered by tests/e2e/mobile.e2e.spec.ts only for overflow)
