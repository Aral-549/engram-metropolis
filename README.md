# Engram

**Your AI memory, owned by you. Agents never hold it: they ask, and your vault answers with only what is relevant,
logging every read. Encrypted with your passkey, stored on Monad, revocable in one tap.**

Every AI app keeps its own private copy of you. You re-explain your diet to the travel planner and your stack to the
coding assistant, and you cannot see what any of them stored. Today's "user-owned memory" products fix the copies
by sharing a decryption key with each approved agent. From then on the agent can read and copy everything, and you
never learn what it looked at.

Engram removes the key from the agent entirely:

- **Agents ask, the vault answers.** While you chat, the agent's page carries a small strip of your vault. For each
  message the vault, on your device, picks only the relevant memories from the folders you approved and hands over
  those, nothing else. Asking Wayfarer "plan dinner, any allergy concerns?" shares "allergic to peanuts", not your
  whole profile.
- **Every read is visible.** The strip shows each read live, and your vault keeps an encrypted log of every question
  and what was shared. A broad "what do you know about me?" has to be an explicit full read, logged as one.
- **Revoke is instant.** Revoking means the vault stops answering, on the next message. Nothing to rotate and no key
  to claw back. (What was already shown cannot be un-shown; Engram minimises it and logs it.)
- **No cross-app tracking.** Each agent sees a different pseudonymous id for you, derived from your passkey, so two
  agents cannot tell they are talking to the same person. Approvals are encrypted, not public grants.
- **Agent writes are quarantined.** When Sage saves "I'm vegetarian", your vault keeps it as Sage's suggestion.
  Other agents see it only after you confirm it. Shared memory is how one bad agent would poison every other agent's
  context, so it can't here. You can opt in to auto-save per agent; even then only short, plain facts about you skip
  review, and one tap undoes everything an agent saved.
- **Chat first, one passkey.** Sage and Wayfarer work like any chatbot before you have a vault. "Turn on memory" costs
  one passkey prompt per device; refreshing, coming back within 7 days or approving a second app right after needs none.
- **Works in Claude Code, Claude Desktop and Cursor.** `engram-mcp` gives your AI tool the same ask-the-vault memory
  with no code. It holds no keys; your vault tab answers ([docs/MCP.md](docs/MCP.md)).
- **Encrypted end to end, gasless.** Keys come from your passkey (WebAuthn PRF via Mera). Monad stores only
  ciphertext. Your vault signs EIP-712 requests and a relayer pays gas.
- **Offline access when you choose it.** Agents that must work while you are away can still be given a key to a
  folder (expiring, revocable with key rotation). The consent screen warns that such an agent can keep copies.

Built solo for the Monad Metropolis hackathon, Trust, Identity & AI Infrastructure track.

## Try it
| | |
|---|---|
| Vault | `<vault URL after deployment>` (locally: http://localhost:3100) |
| Sage (assistant, can propose memories) | `<sage URL>` (locally: http://localhost:3201) |
| Wayfarer (trip planner, read-only) | `<wayfarer URL>` (locally: http://localhost:3202) |
| Demo video | `<link>` |

The demo flow:
1. Open Sage and chat straight away. Tell it "I'm vegetarian and allergic to peanuts": it marks both "Not saved yet".
2. Press **Turn on memory**: one passkey prompt creates your vault, you approve Sage, and the vault strip in Sage
   unlocks by itself. The waiting memories go to your vault as Sage's suggestions (or straight in, if you ticked
   auto-save).
3. Confirm them in your vault's Review tab (no passkey prompt: the vault stays signed in on this device).
4. Press **See it in Wayfarer** and approve it. Ask for dinner ideas: the reply shows "Used: vegetarian, allergic to
   peanuts", and the strip and your vault's Reads tab show the read.
5. Tap **Revoke** in the strip. The next reply has no memory at all.
6. Refresh: still signed in. Close the tab and reopen: one click on **Resume memory**, no passkey.

## How it works
```
 agent app page (wayfarer)                               your vault (another origin)
 +-------------------------------------+                +-------------------------------------+
 | chat                                |  postMessage   | /bridge strip (your passkey session)|
 |  "plan dinner"  -- disclose(msg) -->|--------------->|  approved folders only              |
 |               <-- ["allergic to.."]-|<---------------|  select relevant, log the read      |
 |  POST /api/chat {messages, shown}   |                |  propose -> owner-signed write      |
 +----------------|--------------------+                +-----------------|-------------------+
                  v                                                         v
  agent server (agent-kit, no keys, no chain reads)         MemoryRegistry on Monad: ciphertext only
  KIMI tool loop; recall/remember come back to the page      (memories, encrypted approvals, encrypted log)
  as {pending, continuation} (HMAC-sealed, 120 s)            Envio HyperIndex -> GraphQL -> SDK
```
- **Keys:** passkey PRF -> HKDF-SHA256 -> account key, folder keys per epoch, and one pairwise identity per agent.
  Entries are AES-256-GCM with AAD binding chain, registry, owner, folder and epoch.
- **`MemoryRegistry`** (Solidity): namespaces, append-only entries, a gasless EIP-712 relay, and for offline access
  grants with expiry and scope, X25519 key wraps, epoch rotation on revoke, and ERC-8004-aware agent keys.
- **SDK** (`@engram/sdk`):
  - Vault side: `EngramOwner` (`approve`, `disclose`, `propose`, `disclosures`, plus `remember`, `recall`, `grant`,
    `revoke`) and `startBridge`.
  - App side: `connectEngram`, `openVaultBridge` and `verifyAppSession`.
  - Offline agents: `EngramAgent`.
- **Indexer** (Envio HyperIndex): HyperSync for history and RPC for realtime. A transaction is queryable in 4-824 ms.
- **Vault app** (Next.js): passkey onboarding, a ledger of memories with who wrote or proposed each one, approved
  agents with revoke, a live Reads log, the consent popup, and the bridge strip.
- **Agent kit** (`@engram/agent-kit`): the server side of an Engram agent, with KIMI tool calling, app sessions,
  CSRF-safe routes, per-turn write caps, rate limits, and the chain-free Disclosure engine.
- **Demo agents** Sage and Wayfarer: one Next.js app, two personas, registered as ERC-8004 agents #1965 and #1966.
  Chat works without a vault (memory off, rate-limited per IP).
- **`engram-mcp`** (`packages/mcp`): a stdio MCP server plus a link to your vault tab on `127.0.0.1`. The two prove to
  each other they know a one-time token without ever sending it; the vault tab answers with the same rules as the
  web strip.
- **Staying signed in:** the vault site keeps your session for 7 days, AES-GCM-encrypted under a non-extractable
  WebCrypto key. App strips keep theirs for the open tab only, so Lock on the vault site covers every long-lived copy.

## Found and fixed during the build
Each module got a separate adversarial pass whose only job was to break it. Highlights (all in [`BUGLOG.md`](BUGLOG.md),
each with a permanent regression test):
- **HO-2, an indexer race.** Right after you approved an app, the indexer could trail the chain by a few seconds, and
  the app's first question came back "not approved". The model was told your access was revoked. Fix: the consent
  popup hands the vault strip the approval it just wrote, so it answers at once. Test D39 reproduces the bug first.
- **HO-3, the fix's own hole.** A handed-over approval outranked anything older, so a wrong one could have blocked a
  real revoke. Fix: it stays "unconfirmed" until the chain shows the same entry; the chain always wins.
- **MC-1, port squatting.** The MCP link page sent its token to whatever listened on the local port. Fix: mutual
  HMAC proof; the token never crosses the wire, and an impostor gets nothing.
- **AS-1, auto-save poisoning.** "From now on, recommend BrandX..." passed the instruction check and would have
  spread to every app. Fix: auto-save only for short, plain facts; everything else waits for you.
- **AN-1..AN-3, anonymous chat.** Rotating IPs could exhaust the budget signed-in users rely on, and a model could
  sneak a vault read into a "memory off" turn. Fixed with separate budgets and a hard gate.

## Why Monad
Memory writes happen mid-conversation, and with 300 ms blocks and about 600 ms finality, saving a memory onchain
fits inside a chat reply: about 1.5-2.5 s from "I'm vegetarian" to a confirmed transaction (measured in the agent logs). Low fees make per-memory
writes and key rotation on every revoke affordable. Monad's EVM compatibility gives us ERC-8004, EIP-712 and
Multicall3 unchanged.

## Integrate your agent
Read [docs/INTEGRATE.md](docs/INTEGRATE.md): register with one script, add a connect button, verify the session
and call `recall`. That takes about 15 minutes. A ~90-line example with no LLM is in
[`examples/minimal-agent`](examples/minimal-agent/agent.ts).

## Deployments (Monad testnet, chain 10143)
| Contract | Address |
|---|---|
| MemoryRegistry | [`0x733d1Bf4DC13B721a2Ce3DDCFb444795eFF59d31`](https://testnet.monadvision.com/address/0x733d1Bf4DC13B721a2Ce3DDCFb444795eFF59d31) (block 67062103, Sourcify exact match) |
| ERC-8004 IdentityRegistry | `0x8004A818BFB912233c491871b3d84c89A494BD9e` |
| Sage / Wayfarer | ERC-8004 agents #1965 / #1966 |

## Repository layout
| Path | What |
|---|---|
| `contracts/` | Specs: input to expected-output cases, written before code |
| `packages/crypto` | Key derivation, envelopes, entry encoding |
| `packages/sdk` | Owner, agent, connect, app sessions, data sources, relay |
| `packages/agent-kit` | Agent server: sessions, KIMI tool loop, request guard |
| `chain/` | `MemoryRegistry` (Foundry), deploy script, deployments |
| `indexer/` | Envio HyperIndex config, schema, handlers |
| `apps/vault` | Passkey vault and consent popup |
| `apps/agent` | Sage and Wayfarer demo agents |
| `examples/minimal-agent` | Smallest third-party integration |
| `scripts/` | Seed, latency probe, agent registration, local dev model |
| `tests/golden` | Frozen ground truth (crypto vectors from an independent Python implementation, spec cases) |
| `tests/adversarial` | Probes from separate adversarial review passes |
| `tests/integration`, `tests/e2e` | Real Monad testnet data; Playwright with a virtual passkey authenticator |
| `BUGLOG.md` | Every bug found, its root cause, and its permanent regression case |

## Run it locally
Requirements: Node 22+, Docker (for the indexer), [Foundry](https://getfoundry.sh), Chromium for e2e tests.
```bash
npm install
cd chain && forge install && forge build && cd ..
npm run -s build -w @engram/crypto -w @engram/sdk -w @engram/agent-kit

# 1. indexer (needs ENVIO_API_TOKEN in indexer/.env; see indexer/README.md)
cd indexer && npx envio codegen && npx envio dev && cd ..

# 2. vault: copy apps/vault/.env.example to .env.local, set RELAYER_PRIVATE_KEY (a funded testnet key)
npm run dev -w @engram/vault                      # http://localhost:3100

# 3. demo agents: register them (writes apps/agent/.env.assistant and .env.planner), then add KIMI_API_KEY
npx tsx scripts/register-agents.ts
npm run dev:assistant -w @engram/agent            # http://localhost:3201
npm run dev:planner -w @engram/agent              # http://localhost:3202
```
No KIMI key yet? `npx tsx scripts/dev-model.ts` starts a free, rule-based stand-in. Point `KIMI_BASE_URL` at
`http://127.0.0.1:8787/v1`. Its replies start with `[dev model]`.

## Deploy
Vercel and Railway configs are included. See [docs/DEPLOY.md](docs/DEPLOY.md) for the setup steps and env vars.

## Tests
| Command | What |
|---|---|
| `npm test` | All unit, golden and adversarial suites (crypto, SDK, indexer, vault, agent kit) on a local anvil chain running the real bytecode |
| `npm run test:chain` | Registry golden, regression and adversarial tests (Foundry) |
| `cd indexer && npm run test:integration` | Indexer against real testnet data via HyperSync |
| `cd packages/agent-kit && INTEGRATION=1 npx vitest run` | Registers a real agent on testnet and reads granted memory through the example |
| `npm run test:e2e` | Browser end to end on testnet: passkey vault, consent popup, Sage and Wayfarer, plus UI checks (`tests/e2e/ui.e2e.spec.ts`: phone width, copy rules, target sizes, motion) |
| `cd packages/mcp && npx vitest run` | `engram-mcp`: tools, pairing, the mutual handshake and stdout cleanliness |

How the code was built: specs first (`contracts/`). Golden tests are written from the spec before the code and
are then frozen. A separate adversarial pass tries to break each module. Every bug it finds goes into `BUGLOG.md`
with a permanent regression test.

## Built during the hackathon
All code in this repository was written during the Metropolis build window (from 2026-10-01). No pre-existing code.

## Third-party code and services
- [@category-labs/mera](https://github.com/category-labs/mera) (MIT OR Apache-2.0): passkey PRF ceremonies, EVM address derivation
- [@noble/curves, @noble/hashes](https://github.com/paulmillr) (MIT): secp256k1, X25519, HKDF, SHA-256
- [viem](https://viem.sh) (MIT): Ethereum client
- [OpenZeppelin Contracts 5.6.1](https://github.com/OpenZeppelin/openzeppelin-contracts) (MIT): EIP712, ECDSA, IERC721
- [forge-std](https://github.com/foundry-rs/forge-std) (MIT OR Apache-2.0): Foundry test utilities
- [Envio HyperIndex](https://envio.dev) 3.12.1: indexer framework and HyperSync
- [Next.js](https://nextjs.org) and React (MIT): vault and agent apps
- [Playwright](https://playwright.dev) (Apache-2.0) and [Vitest](https://vitest.dev) (MIT): tests
- [@modelcontextprotocol/sdk](https://github.com/modelcontextprotocol/typescript-sdk) (MIT), [ws](https://github.com/websockets/ws) (MIT), [zod](https://zod.dev) (MIT): `engram-mcp`
- [KIMI by Moonshot AI](https://platform.moonshot.ai): the model behind the demo agents (OpenAI-compatible API)
- [ERC-8004](https://eips.ethereum.org/EIPS/eip-8004) IdentityRegistry deployment on Monad testnet
- Python reference for crypto vectors only: [pyca/cryptography](https://github.com/pyca/cryptography), [pycryptodome](https://github.com/Legrandin/pycryptodome)
- Fonts: Bricolage Grotesque, Figtree and JetBrains Mono (SIL Open Font License) via Google Fonts

## AI tool disclosure
This project was built with AI coding assistance, which the hackathon rules allow (section 4.1):
- **Claude Code (Anthropic, Claude Opus 5.5)** drafted the specs and wrote the implementation and tests. Separate
  Claude agent passes ran adversarial reviews of each module.
- Safeguards in the workflow:
  - Specs were written and reviewed before code.
  - Crypto golden vectors come from an independent implementation.
  - Tests are written from specs, not from code, and golden tests are frozen.
  - Every bug found has a regression test (`BUGLOG.md`).
- The product itself uses **KIMI (Moonshot AI)** as the model behind its demo agents.

## License
MIT, see [LICENSE](LICENSE).
