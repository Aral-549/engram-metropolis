"use client";

// Vault landing (contracts/ui.md "Vault landing", U27): try the models, or open your vault. Never contains a chat.
import { useState } from "react";
import { ReportBug } from "./ReportBug";
import { Seal } from "./Seal";
import { useSession } from "./SessionProvider";
import { Hero } from "./landing/hero";
import { LandingAmbient } from "./landing/landing-ambient";
import { AgentCards } from "./landing/agent-cards";
import { MemoryLifecycle } from "./landing/memory-lifecycle";
import { ArchitectureSpec } from "./landing/architecture-spec";
import { LatticeDivider } from "./landing/lattice-divider";
import { Tilt } from "./landing/tilt";
import { Reveal } from "./landing/reveal";

const REGISTRY = "0x733d1Bf4DC13B721a2Ce3DDCFb444795eFF59d31";

const story = [
  ["Tell Sage", "“I'm vegetarian and allergic to peanuts.”", "bg-sage", "md:col-span-3"],
  ["It lands in your vault", "Encrypted on your device, kept on Monad. Sage only suggests; you confirm.", "bg-vault", "md:col-span-4"],
  ["Wayfarer already knows", "It asks your vault, gets only what fits, and you see the read.", "bg-wayfarer", "md:col-span-5"],
] as const;

const snippet = [
  ["c", "// any app: ask the user to approve one topic"],
  ["k", "const { sessionProof } = await connectEngram({"],
  ["v", '  vaultUrl, agentId, labels: ["preferences"], scope: "read",'],
  ["k", "});"],
  ["c", "// for each message: the vault shares what fits"],
  ["k", "const { entries } = await vault.disclose(userMessage);"],
] as const;

const MCP_CLAUDE_CODE = "claude mcp add -s user engram -- npx -y engram-vault-mcp";
const MCP_CODEX = "codex mcp add engram -- npx -y engram-vault-mcp";
const MCP_GEMINI = "gemini mcp add -s user engram npx -y engram-vault-mcp";
const MCP_JSON = `{
  "mcpServers": {
    "engram": { "command": "npx", "args": ["-y", "engram-vault-mcp"] }
  }
}`;

function CopyCode({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked: the command is still on screen to select */
    }
  }
  return (
    <div className="mt-2 flex items-start gap-2">
      <pre className="min-w-0 flex-1 overflow-x-auto rounded-[14px] border-[3px] border-ink bg-ink px-3 py-2.5 font-mono text-[13px] text-white">
        {code}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        className="btn shrink-0 px-3 text-sm"
        aria-label={copied ? "Copied" : `Copy ${label}`}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function Onboarding({ locked = false }: { locked?: boolean }) {
  const { signUp, signIn, status, error } = useSession();
  const busy = status === "working";
  const [open, setOpen] = useState(locked);
  const [replay, setReplay] = useState(0);

  return (
    <>
      <LandingAmbient />

      <main className="relative mx-auto max-w-6xl overflow-x-hidden px-4 py-4 md:px-8">
        {/* Navigation Header */}
        <header className="flex items-center gap-3 py-4 sm:py-6">
          <Seal size={34} />
          <span className="font-display text-2xl">Engram</span>
          <span className="rounded-full border-2 border-ink bg-pop px-2.5 py-0.5 text-xs font-bold shadow-[2px_2px_0_#141414]">
            Monad testnet
          </span>
        {locked ? null : (
          <a
            href="#builders"
            className="ml-auto hidden min-h-[24px] items-center text-sm font-bold underline underline-offset-4 text-ink transition-colors hover:text-vault-ink sm:inline-flex"
          >
            For builders
          </a>
        )}
        </header>

        {/* Reactive Glass Hero */}
        <div className="mt-2 sm:mt-4">
          <Hero
            locked={locked}
            busy={busy}
            signUp={signUp}
            signIn={signIn}
            open={open}
            setOpen={setOpen}
          />
        </div>

        {error && (
          <div
            role="alert"
            className="mt-6 rounded-[14px] border-[3px] border-ink bg-danger-soft px-4 py-3 font-medium text-danger-ink shadow-[4px_4px_0_#141414]"
          >
            {error}
          </div>
        )}

        {/* Additional Interactive Content for Unlocked Mode */}
        {!locked && (
          <>
            {/* Meet the Agents (Sage & Wayfarer) with 3D Tilt */}
            <div id="agents">
              <AgentCards />
            </div>

            {/* Zero-Knowledge Memory Lifecycle */}
            <div id="how-it-works">
              <MemoryLifecycle />
            </div>

            {/* Architecture Comparison: Traditional vs Engram */}
            <ArchitectureSpec />

            {/* Interactive Stage Simulation & Story Highlights */}
            <section className="relative py-14 sm:py-20">
              <LatticeDivider className="absolute inset-x-0 top-0 -translate-y-1/2" />
              <div className="flex flex-col gap-2">
                <div className="inline-flex items-center gap-2 self-start rounded-full border-2 border-ink bg-pop px-3 py-1 font-mono text-xs font-bold text-ink shadow-[2px_2px_0_#141414]">
                  <span className="h-2 w-2 rounded-full bg-ink" />
                  Live Memory Toy Box
                </div>
                <h2 className="font-display text-3xl sm:text-4xl">
                  Watch memory fly between apps
                </h2>
                <p className="max-w-2xl text-base font-medium text-ink-soft">
                  Sage only proposes. When you approve, your vault stores it encrypted. Wayfarer asks, gets only what fits, and the read is recorded.
                </p>
              </div>

              {/* Story Columns */}
              <Reveal className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-12">
                {story.map(([title, body, bg, span], i) => (
                  <div
                    key={title}
                    data-reveal
                    className={`glass-panel p-6 ${span} transition-all duration-200 hover:-translate-y-1 hover:shadow-[7px_7px_0_#141414]`}
                  >
                    <span
                      className={`inline-grid h-10 w-10 place-items-center rounded-full border-[3px] border-ink font-display text-xl font-bold ${bg} shadow-[2px_2px_0_#141414]`}
                    >
                      {i + 1}
                    </span>
                    <p className="mt-4 font-display text-2xl leading-tight text-ink">{title}</p>
                    <p className="mt-2 text-sm font-medium leading-relaxed text-ink-soft">
                      {body}
                    </p>
                  </div>
                ))}
              </Reveal>

              {/* Interactive Stage Container */}
              <div className="mt-10">
                <Tilt>
                  <div
                    className="glass-panel glass-sheen relative mx-auto h-[360px] w-full max-w-2xl overflow-hidden rounded-3xl p-6 md:h-[420px]"
                    aria-label="Interactive memory flight stage illustration"
                    onMouseEnter={() => setReplay((r) => r + 1)}
                  >
                    <div className="absolute top-4 left-6 z-10 flex items-center gap-2">
                      <span className="live-dot" />
                      <span className="font-mono text-xs font-bold text-ink-soft">
                        Interactive Stage · Hover to replay
                      </span>
                    </div>

                    <div key={replay} className="stage absolute inset-0">
                      <div className="paper-card absolute left-8 top-14 w-[42%] -rotate-3 bg-sage! p-4 font-bold shadow-[4px_4px_0_#141414]">
                        <div className="flex items-center justify-between">
                          <span className="font-display text-lg">Sage</span>
                          <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px]">App 1</span>
                        </div>
                        <div className="mt-2.5 h-2.5 rounded-full bg-ink/15" />
                        <div className="mt-1.5 h-2.5 w-2/3 rounded-full bg-ink/15" />
                      </div>

                      <div className="paper-card absolute right-8 bottom-8 w-[42%] rotate-2 bg-wayfarer! p-4 font-bold shadow-[4px_4px_0_#141414]">
                        <div className="flex items-center justify-between">
                          <span className="font-display text-lg">Wayfarer</span>
                          <span className="rounded-full bg-ink/10 px-2 py-0.5 text-[10px]">App 2</span>
                        </div>
                        <div className="mt-2.5 h-2.5 rounded-full bg-ink/15" />
                        <div className="mt-1.5 h-2.5 w-1/2 rounded-full bg-ink/15" />
                      </div>

                      <div className="stage-vault absolute left-1/2 top-1/2 drop-shadow-[5px_5px_0_#141414]">
                        <Seal size={180} />
                      </div>

                      <span className="pill pill-saved stage-in absolute">
                        <span className="h-2 w-2 rounded-full bg-ink" />
                        vegetarian
                      </span>
                      <span className="pill pill-used stage-out absolute">
                        <span className="h-2 w-2 rounded-full bg-ink" />
                        vegetarian
                      </span>
                    </div>
                  </div>
                </Tilt>
              </div>
            </section>

            {/* Builders Section: MCP & Code Snippet */}
            <section id="builders" className="relative py-14 sm:py-20 min-w-0 max-w-full">
              <LatticeDivider className="absolute inset-x-0 top-0 -translate-y-1/2" />
              <div className="grid gap-8 md:grid-cols-2 min-w-0 max-w-full">
                <Tilt className="min-w-0 max-w-full">
                  <div className="glass-panel glass-sheen min-w-0 max-w-full rounded-2xl p-6 sm:p-8">
                    <p className="font-mono text-xs font-bold uppercase tracking-widest text-vault-ink">
                      For builders · no code
                    </p>
                    <h2 className="mt-3 font-display text-2xl sm:text-3xl leading-tight">
                      Give your AI tool a memory you control.
                    </h2>
                    <p className="mt-3 text-sm font-medium leading-relaxed text-ink-soft">
                      Works with Claude Code, Codex, Gemini CLI, Cursor or any MCP client. Your tool asks your vault; it holds no keys. Needs Node 22.
                    </p>
                    <ol className="mt-5 space-y-4">
                      <li>
                        <p className="text-sm font-bold text-ink">
                          1. Add it to your tool (Claude Code shown)
                        </p>
                        <CopyCode code={MCP_CLAUDE_CODE} label="the Claude Code command" />
                        <details className="mt-3">
                          <summary className="inline-flex min-h-6 cursor-pointer items-center text-sm font-bold text-vault-ink underline underline-offset-4">
                            Other tools
                          </summary>
                          <p className="mt-3 text-sm font-bold text-ink">Codex</p>
                          <CopyCode code={MCP_CODEX} label="the Codex command" />
                          <p className="mt-3 text-sm font-bold text-ink">Gemini CLI</p>
                          <CopyCode code={MCP_GEMINI} label="the Gemini CLI command" />
                          <p className="mt-3 text-sm font-bold text-ink">
                            Cursor, Claude Desktop and others
                          </p>
                          <p className="mt-1 text-xs font-medium text-ink-soft">
                            Add this to <code className="font-mono text-ink">.cursor/mcp.json</code>, <code className="font-mono text-ink">claude_desktop_config.json</code> or your tool&apos;s MCP config:
                          </p>
                          <CopyCode code={MCP_JSON} label="the JSON config" />
                        </details>
                      </li>
                      <li>
                        <p className="text-sm font-bold text-ink">2. Link your vault</p>
                        <p className="mt-1 text-sm font-medium leading-relaxed text-ink-soft">
                          Ask your AI tool to check your Engram vault status. Open the link it gives, allow local network access, unlock and approve. Keep that tab open.
                        </p>
                      </li>
                    </ol>
                  </div>
                </Tilt>

                <Tilt className="min-w-0 max-w-full">
                  <div className="glass-panel glass-sheen min-w-0 max-w-full rounded-2xl p-6 sm:p-8">
                    <p className="font-mono text-xs font-bold uppercase tracking-widest text-pop">
                      For builders · your own agent
                    </p>
                    <h2 className="mt-3 font-display text-2xl sm:text-3xl leading-tight">
                      Add memory without holding anyone&apos;s data.
                    </h2>
                    <pre className="mt-4 overflow-x-auto rounded-[14px] border-[3px] border-ink bg-ink p-4 font-mono text-[13px] leading-6 text-white shadow-[4px_4px_0_#141414]">
                      {snippet.map(([t, line], i) => (
                        <span
                          key={i}
                          className={`block ${
                            t === "c"
                              ? "text-[#b8b0a4]"
                              : t === "v"
                              ? "text-pop"
                              : "text-white"
                          }`}
                        >
                          {line}
                        </span>
                      ))}
                    </pre>
                  </div>
                </Tilt>
              </div>
            </section>

            {/* Footer */}
            <footer className="relative flex flex-col gap-4 border-t-[3px] border-ink py-8 text-xs font-medium sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2">
                <Seal size={20} />
                <span>Built on Monad Metropolis · ERC-8004 · Mera Passkeys · Envio HyperIndex</span>
              </div>
              <ReportBug app="vault" />
              <a
                href={`https://testnet.monadvision.com/address/${REGISTRY}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono font-bold text-ink underline underline-offset-4 min-h-[24px] inline-flex items-center hover:text-vault-ink"
              >
                MemoryRegistry {REGISTRY.slice(0, 6)}…{REGISTRY.slice(-4)}
              </a>
            </footer>
          </>
        )}
      </main>
    </>
  );
}
