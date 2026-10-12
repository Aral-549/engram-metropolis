# Contract: live usage stats strip

## Purpose
Show visitors and judges, on the landing page, real onchain usage of Engram: how many vaults exist, how many
memories were written, how many agents are connected. Numbers come from the indexer, never from a counter we edit.
Hands off: indexing to the Envio indexer (contracts/indexer.md); page layout to contracts/ui.md.

## Inputs
- Indexer GraphQL endpoint (server-side env, same one the apps already use, read-only).
- Entities used: `Owner` (one row per vault owner), `Entry` (memory writes), `Agent`, `DailyStat`.

## Outputs
- `GET /api/stats` on the vault app: `{ ok: true, vaults, memories, agents, activeToday, updatedAt }`
  (all non-negative integers, `updatedAt` ISO time), cached for 60 s (`s-maxage=60, stale-while-revalidate`).
- Landing strip: four numbers with labels "vaults", "memories saved", "agents connected", "active today".
- On failure: `{ ok: false, code: "UPSTREAM" }` (502). The strip hides itself; the landing page never shows an
  error or a fake number.

## Behavior cases (input -> expected output)
| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 1 | Indexer has 16 owners, 140 entries, 5 agents, today's DailyStat activeOwners 3 | `{ ok:true, vaults:16, memories:140, agents:5, activeToday:3 }` | Plain counts |
| 2 | Two requests within 60 s | One indexer query; second is served from cache | Protects the shared endpoint |
| 3 | Indexer returns empty lists | All numbers 0; strip shows 0s | No hiding for zero |
| 4 | Indexer times out (> 4 s) or returns an error | 502 `UPSTREAM`; strip hidden | No stale invented value |
| 5 | Today has no DailyStat row | `activeToday: 0` | Missing row is zero |
| 6 | Owner with several namespaces | Counted once as one vault | Vault = distinct owner |
| 7 | Page loads with JS slow | Strip renders nothing until data arrives; no layout jump (reserved height) | |

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
- [ ] Implementation matches this contract
- [ ] Golden tests exist for every behavior case above
