# Contract amendment: several MCP sessions at once (replaces M15, fixes BUGLOG RV-3)

## Purpose
Two Claude Code, Cursor or Codex windows can each run `engram-mcp` at the same time. The second no longer exits;
it takes the next free port and prints its own link. Hands off: link security (token, mutual HMAC) is unchanged,
see contracts/mcp.md.

## Inputs
- `ENGRAM_PORT` (default 7457). If set explicitly, it is used exactly (no scanning), as before.
- Without `ENGRAM_PORT`: ports 7457..7466 are tried in order.

## Outputs
- The link server binds the first free port; the pairing link already carries `?port=` so `/link` needs no change.

## Behavior cases (input -> expected output)
| # | Input | Expected output | Notes |
|---|-------|------------------|-------|
| 1 | Nothing on 7457, no `ENGRAM_PORT` | binds 7457 | unchanged |
| 2 | 7457 taken, no `ENGRAM_PORT` | binds 7458; link shows `port=7458`; the MCP client sees a healthy server | RV-3 |
| 3 | 7457..7466 all taken | exits with a clear message naming `ENGRAM_PORT` | |
| 4 | `ENGRAM_PORT=8000`, 8000 taken | exits naming `ENGRAM_PORT` (no scanning) | explicit means exact |
| 5 | Two sessions linked to two `/link` tabs | each answers only its own tab; tokens differ | M17/M18 still hold |
| 6 | Port taken by a non-Engram program | skipped like any taken port | |
| 7 | Session 1 exits | its port is freed; a new session may take it | |

## Edge cases that must be covered
- Port in use that frees up between the check and the bind: retry the next port, never crash.
- The link tab for session 2 must not connect to session 1 (token mismatch, M18 rejection).
- stdout stays MCP-only (M16); the chosen port goes to stderr.

## Explicitly out of scope
- One shared link across sessions (each session keeps its own tab, as documented).

## Status
- [x] Drafted
- [x] Reviewed by a human (approved by the user 2026-10-13)
- [x] Implementation matches this contract
- [x] Golden tests exist for every behavior case above (tests/golden/mcp/mcp.multisession.golden.test.ts)
