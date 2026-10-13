# Video scripts (Metropolis submission)

Requirements from the brief: technical demo max 3:00, live product only (no slides, no code walkthrough); pitch
max 2:00 (team, problem, why you). Record at 1080p, browser only, mic on, one take per section, cut dead time.
Do not show keys, env files or the relayer wallet. Use a fresh browser profile so the stateless test is honest.

## Setup before recording (10 minutes)
- Fresh Chrome profile, zoom 110 percent, notifications off, bookmarks bar hidden.
- Tabs ready: vault (https://engram-vault.vercel.app), Sage (https://engram-sage.vercel.app),
  Wayfarer (https://engram-wayfarer.vercel.app), a terminal with Claude Code open in an empty folder.
- Phone ready for the passkey QR if the laptop has no platform authenticator.
- Do a full dry run once so the chain is warm; first writes are the slow ones.

## Technical demo (target 2:50)

| Time | On screen | Say |
|---|---|---|
| 0:00-0:12 | Vault landing, stats strip visible | "This is Engram: your AI memory, owned by you, encrypted in your browser, on Monad. The strip shows real onchain usage from testnet." |
| 0:12-0:35 | Sage chat, type "I'm vegetarian and allergic to peanuts" | "No account. I chat first. Sage notices two things worth remembering and marks them Not saved yet." |
| 0:35-0:55 | Press Turn on memory, passkey prompt, vault strip appears | "One passkey tap creates my vault. The key never leaves my device. Sage gets no key: it can only ask my vault questions." |
| 0:55-1:15 | Vault dashboard, Review tab, confirm the two memories | "Agent writes land as suggestions. I confirm them. Nothing the agent says becomes a fact without me." |
| 1:15-1:50 | Wayfarer, approve, ask "dinner ideas for tonight" | "A different agent. I approve it once. It asks my vault, the vault answers only what is relevant, and the reply shows exactly what was used: vegetarian, peanuts. Every read is logged in my Reads tab." |
| 1:50-2:05 | Tap Revoke in the strip, ask again | "I revoke. The next reply has no memory at all. Forward-only: old access cannot be replayed." |
| 2:05-2:25 | Clear storage / open in a private window, press Resume | "Stateless test: new session, same passkey, my memory is back. No server holds my account." |
| 2:25-2:50 | Terminal: `claude mcp add ...`, open the link, ask Claude "what do I eat?" | "Same vault from Claude Code, one command. Works in Cursor, Codex and Gemini CLI too. And the dashboard can export everything or import my old notes." |

Bounty cues to hit in the voiceover: one passkey ceremony, scoped sessions, stateless test (Mera-Powered UX);
agent identity on ERC-8004 with per-agent grants (track); "why Monad: cheap fast writes make every memory an onchain
event".

## Pitch (target 1:50)

| Time | Say |
|---|---|
| 0:00-0:15 | Who you are: "I'm [name], a solo builder from India. I built Engram in two weeks for the Trust, Identity and AI Infrastructure track." |
| 0:15-0:40 | Problem: "Every AI keeps its own memory of you. You cannot see it, move it, or take it back. And the memory products that let you own it still hand the agent the decryption key." |
| 0:40-1:10 | Solution: "Engram keeps memory in a vault only you can open. Agents do not get keys. They ask, the vault answers, every read is visible, and you can revoke any agent forward in time." |
| 1:10-1:35 | Traction: "[N] real vaults on testnet from [N] testers, a one-line MCP install, and people reporting bugs through the in-app report box. Name the first user or team if you have one." |
| 1:35-1:50 | Why you and next: "I shipped the contracts, SDK, indexer, apps and MCP bridge alone. Next: a published agent integration kit, and getting three more teams to read from the same vault." |

Fill the bracketed numbers from the live stats strip on the day you record. Do not claim a user count you cannot
show on screen.

## Optional 30 second ad (not judged)
Hero shot of the landing, the "Not saved yet" to vault flight animation, the Revoke moment, end card with the URL.
