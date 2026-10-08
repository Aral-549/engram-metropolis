# Contract: UI redesign ("bold and playful")

## Purpose
Replace the "archival ledger on warm paper" look (apps.md "Design and motion") with a bold, playful one where the
vault is a visible object: memories drop into it when an app saves them and fly out when an app asks. The
product's main idea (apps ask, the vault answers, you see every move) becomes something you watch, not
something you read. Flow and behavior are in `contracts/simple-flow.md`; this contract covers look, layout,
copy and motion only. No business logic changes here.

Amends `contracts/apps.md`: "Design and motion" (V8-V12) is replaced by this contract; V11 (e2e names unchanged)
is replaced by U20.

## Locked decisions
- **Mood:** toy-box vault. Flat color blocks, thick ink outlines, hard offset shadows, chunky type. References:
  Gumroad (neo-brutalist color blocks), Duolingo (friendly, bold), Teenage Engineering (objects with personality).
- **Fonts:** Bricolage Grotesque 700-800 for display (Google Fonts, `next/font`); Figtree 400-600 for body;
  JetBrains Mono only for addresses and tx hashes. Nothing else.
- **Palette (tokens, every component uses these):**
  | Token | Hex | Use |
  |---|---|---|
  | `paper` | #FFF4E0 | page background |
  | `ink` | #141414 | text, outlines, shadows |
  | `vault` | #8F73FF | the vault, its buttons, its chips (#7C5CFF failed: ink on it is 4.24:1) |
  | `sage` | #2BD67B | Sage's color block |
  | `wayfarer` | #FF8A2B | Wayfarer's color block |
  | `pop` | #FFD23F | "saved" highlight, badges |
  | `danger` | #FF5A5F | revoke, reject, errors |
  | `ink-soft` | #5C5348 | secondary text (6.92:1 on paper) |
  | `vault-ink` | #4D33CC | small purple text and links on light surfaces (7.24:1 on paper) |
  | `danger-ink` | #B3261E | small error text on light surfaces (6.0:1 on paper) |
  | `vault-soft` / `danger-soft` | #EAE4FF / #FFE3E3 | tinted backgrounds behind ink or *-ink text |
  The three `*-ink` tokens were added during the build (2026-10-08): the fill colors pass with ink text on them but
  fail as small text on paper, and the dashboard uses colored small text.
  Text on any color block is `ink`, never white (contrast). No gradients. Measured ink contrast: paper 16.9,
  vault 5.32, sage 9.66, wayfarer 7.83, pop 12.76, danger 6.04 (all >= 4.5:1).
- **Signature motif:** 3 px `ink` outline + hard shadow `5px 5px 0 ink` on cards and buttons. Pressing a button
  moves it 5 px down-right and the shadow drops to 0. Radius: 14 px for cards and buttons, full pill for memory
  chips only. Nothing else uses rounded corners.
- **Signature motion:** a memory chip flies along an arc into the vault object (save), or out of it into a reply
  (share); the vault wobbles and its counter bumps. Motion tokens, shared by every component: `press` 80 ms
  (button down), `state` 200 ms (hover, toggles, cards appearing), `flight` 450 ms with a slight overshoot
  (chips, vault wobble). Motion is decoration only: state never waits for an animation to end.
- **No emojis** anywhere (AGENTS.md rule 0). Illustrations are inline SVG drawn in the same outline style.

## Screens
**Agent chat page (Sage, Wayfarer; each app's `/`, its own site):** opens straight into the chat, no landing or
sign-in in front of it (simple-flow.md A). The sidebar is removed. A header bar in the agent's color: monogram, agent name
in display type, one line ("Remembers you, in your vault" / "Plans with what your vault shares"), and on the
right the vault strip (bridge iframe) restyled as the purple vault object with a memory counter. With memory
off, the strip is a grey vault with a "Turn on memory" button. With suggestions waiting, the strip shows a `pop`
badge button "2 to review" that opens the review popup. The counter's
text sits in one `role="status"` region that reads a sentence ("Saved to your vault: vegetarian. 4 memories."),
never a bare number. The chat fills
the rest. Suggestions are chunky outlined chips. Saved memories appear as `pop` pills under the reply, then
fly into the vault. With memory off they appear as outlined "Not saved yet" pills next to a "Turn on memory"
button; while the outbox retries they read "Saving…". Shared memories appear above a reply as small `vault` pills ("Used from your vault:
vegetarian").

**Vault landing (its own page, the vault site's `/`):** asymmetric hero. Left: headline "Tell one AI. Every app
you approve remembers." (display, very large), one sentence under it. Below it, two model cards side by side in
their colors, each with name, one line and a "Chat with Sage" / "Chat with Wayfarer" button (opens that app's chat
page), and a separate "Open my vault" button. Right: the vault illustration (chips drop in from a green Sage window
and fly out to an orange Wayfarer window). Below: a 3-panel strip of uneven widths (Tell Sage / It lands in your
vault / Wayfarer already knows), a short "For builders" block with the code snippet, a footer. The landing page
never contains a chat.

**Connect popup:** header block in the agent's color: "Sage wants to use your preferences". At most three short
lines (what it can do, that it never gets a key, for how long). The origin badge (verified / not listed) stays.
The auto-save switch, off by default (simple-flow.md D). One large Approve button, Deny as a text button.

**Review popup (`/review?agentId=N`, top-level vault window):** header in the agent's color "Sage suggested 2
things". One card per suggestion with Confirm, Edit, Reject; "Confirm all" at the bottom (flagged cards are
excluded and keep their warning). Closes itself when the list is empty.

**Vault dashboard:** two tabs instead of four.
- **Memory:** "Waiting for you" cards at the top (pending proposals: Confirm / Edit / Reject), then every memory as
  a card with who saved it ("You", "Sage", "Saved by Sage automatically" + Undo) and a small "on Monad" link.
- **Apps:** one card per approved app in its color: what it can use, when it expires, Revoke, and its recent
  activity (the read log for that app, newest first) inside the card.

## Copy rules
- Agent page: no paragraph over 15 words. Connect popup: no line over 20 words. The landing hero: under 30 words
  besides the headline.
- No internal words on screen: "namespace", "folder" (say "topic"), "seq", "sealed #N", "epoch", "ciphertext",
  "ERC-8004" (allowed only in the "For builders" block and the footer).

## Behavior cases (input -> expected output)
| # | Input | Expected output | Notes |
|---|---|---|---|
| U1 | any page | only the 3 font families above load; computed colors on text, borders and backgrounds come from the palette tokens | token discipline |
| U2 | any button, pointer down | moves 5 px down-right, shadow 0; returns on release | motif |
| U3 | Sage reply with one saved memory | a `pop` pill with the text appears under the reply, then a copy flies into the vault object; the counter goes up by 1 | signature motion |
| U4 | Wayfarer reply whose turn disclosed 2 memories | two `vault` pills "Used from your vault" above the reply | makes disclosure visible |
| U5 | `prefers-reduced-motion: reduce` | no flight, wobble or looping illustration; pills and counter still update; landing shows a static illustration | accessibility |
| U6 | an agent reply arrives | its full text is in the DOM at once (animation is visual only) | carried over from V10 |
| U7 | 390 x 844 | no horizontal scroll; agent header shows name, monogram and vault object on one row; landing buttons visible without scrolling | phone |
| U8 | 1440 x 900 landing | headline, both buttons and the illustration visible without scrolling | |
| U9 | text contrast | every text/background pair is at least 4.5:1 (WCAG AA); text on color blocks is `ink` | |
| U10 | keyboard only | every control reachable with Tab, visible focus ring (3 px `vault` outline), Enter sends, Escape closes the edit box | |
| U11 | connect popup for a `read` agent | header, at most 3 lines, origin badge, Approve, Deny; no auto-save switch | |
| U12 | connect popup, origin not listed by the agent's card | `danger` badge and one warning line stay visible above Approve | security copy kept |
| U13 | vault dashboard with 2 pending, 3 auto-saved, 4 own memories | Memory tab: 2 "Waiting for you" cards first, then 7 memory cards, newest first; auto-saved ones have Undo | |
| U14 | Apps tab with Sage and Wayfarer approved, 5 reads by Wayfarer | 2 app cards in their colors; Wayfarer's card lists its 5 reads newest first; Revoke on each | merged Reads view |
| U15 | revoke in the Apps tab | the card turns grey with "Revoked" and moves under "Past apps" | |
| U16 | the bridge strip, framed by an approved app | purple vault object, counter, lock state, "Unlock" or "Revoke"; still no approve or confirm controls | clickjacking rule kept (disclosure.md) |
| U17 | the bridge strip, not approved for this site | grey vault object, "Not approved for this site" | V6 kept |
| U18 | an error (model down, vault locked, popup blocked) | a `danger` outlined card with one plain sentence and the next action | |
| U19 | copy audit over all pages | no forbidden words outside the builder block and footer; paragraph limits hold | copy rules |
| U20 | e2e suite | updated in the same change to the new accessible names; every e2e flow still passes on testnet | replaces V11 |
| U21 | Sage saves 3 memories in one reply, and the user sends again before the flights end | the counter is exactly +3 at once; running flights are cancelled or finish visually; no count is lost or doubled | cancellable motion |
| U22 | screen reader, a save happens | one status announcement with the memory text and the new total; focus does not move | live region |
| U23 | "Saved" and "Used from your vault" pills | each carries its word as text, not only its color; pills are static text, not buttons; only "See it in Wayfarer" is a link | not color alone |
| U24 | a memory longer than the pill | one line, cut with an ellipsis; the full text is in the pill's accessible name and on the vault card (no hover-only tooltip) | |
| U25 | interactive targets | primary buttons at least 44 px tall; nothing interactive under 24 x 24 px; at least 8 px between adjacent targets | WCAG 2.5.8 |
| U26 | landing illustration | plays at most twice per scroll-into-view, then stops | no endless decorative loop |
| U27 | vault landing | buttons "Chat with Sage", "Chat with Wayfarer" and "Open my vault"; no chat on the page | separate pages |
| U28 | an agent chat page, first visit, no vault | the input is ready and focused; no sign-in, popup or banner before the first message | chat first |
| U29 | memory off, Sage replies with a memory | an outlined "Not saved yet" pill and a "Turn on memory" button; the vault strip is grey | |
| U31 | 2 suggestions waiting | the strip shows a "2 to review" badge button; tapping it opens the review popup | |
| U32 | an agent reply with `**bold**`, `*italic*`, `- item` / `1. item` lists, `### heading`, `---` | rendered as bold, italic, lists, a bold line and a divider; no raw `*`, `#` or `---` on screen | BUGLOG MD-1 |
| U33 | a reply containing `<script>`, `<img onerror>` or a `[link](javascript:...)` | shown as plain text; nothing is executed and no link is made | safe rendering |
| U34 | an agent page with memory on (the vault strip shown) | a "Reconnect" text button under the strip, at least 24 px tall, that opens the approval popup | FL-3 |
| U35 | vault landing, "For builders · no code" card | MCP setup on the page, like any MCP server: (1) the Claude Code command `claude mcp add -s user engram -- npx -y engram-vault-mcp` with a Copy button (at least 24 px, says "Copied" after), and the Cursor / Claude Desktop JSON with its own Copy button; (2) "ask Claude to check your Engram vault status, open the link it gives, allow local network access, unlock and approve, keep the tab open". The landing has no GitHub links (amended 2026-10-09, user: no pointing at the repo); no `git clone`; no `npx engram-mcp` (RV-2). Commands scroll inside their box; no page scroll at 320-390 px | 2026-10-09 |
| U30 | the outbox is retrying | the pill reads "Saving…"; when written it turns into the `pop` "Saved" pill and flies into the vault | network-tolerant feedback |

## Edge cases that must be covered
- Long memory text (1500 characters) in a pill: see U24.
- 50+ memories: the vault counter shows "50+"; the Memory tab paginates or virtualizes after 100.
- Agent name or color from an unknown agent card in the vault: falls back to `ink` outline on `paper` with the
  name, never a broken color.
- Dark mode: out of scope for the hackathon; the pages set `color-scheme: light` so browsers do not invert them.

## Explicitly out of scope
- Flow changes (simple-flow.md), any SDK, crypto, chain or agent-server change.
- Dark mode, internationalisation, native apps.

## Status
- [x] Drafted (2026-10-07)
- [x] Checked against the ui-ux-pro-max guidelines (2026-10-07): vault color fixed for contrast; U21-U26 added
- [x] Reviewed by a human (2026-10-07: "approved, start building") (a static mockup of the Sage screen and landing hero is provided for this review)
- [x] Implementation matches this contract (2026-10-08) for the agent chat page, vault landing, connect popup, vault
  strip and shared tokens/fonts; the vault dashboard got tokens and fonts only (agreed cut). Not built: the review
  popup (agreed cut), the Apps tab merge of the read log (U14), U13's merged layout (the dashboard keeps its tabs; "Saved by Sage automatically" with Undo is built)
- [x] Browser checks in tests/e2e/ui.e2e.spec.ts: U7, U8, U10, U19, U25, U26, U27, U28 pass against the dev servers.
  U3, U4, U16, U20-U23 are exercised by tests/e2e/agents.e2e.spec.ts, which needs the KIMI env to run
