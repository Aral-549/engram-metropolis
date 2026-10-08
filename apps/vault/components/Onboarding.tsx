"use client";
// Vault landing (contracts/ui.md "Vault landing", U27): try the models, or open your vault. Never contains a chat.
import { useState } from "react";
import { Seal } from "./Seal";
import { useSession } from "./SessionProvider";
import { Words } from "./Words";

const REGISTRY = "0x733d1Bf4DC13B721a2Ce3DDCFb444795eFF59d31";
const SAGE_URL = process.env.NEXT_PUBLIC_SAGE_URL ?? "http://localhost:3201";
const WAYFARER_URL = process.env.NEXT_PUBLIC_WAYFARER_URL ?? "http://localhost:3202";

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

// MCP setup, installed like any MCP server (contracts/ui.md U35, mcp.md "Distribution"). The landing links to no repo
// (the user's call). Not `npx engram-mcp`: that npm name is someone else's (BUGLOG RV-2).
const MCP_CLAUDE_CODE = "claude mcp add -s user engram -- npx -y engram-vault-mcp";
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
      <pre className="min-w-0 flex-1 overflow-x-auto rounded-[14px] border-[3px] border-ink bg-ink px-3 py-2.5 font-mono text-[13px] text-white">{code}</pre>
      <button type="button" onClick={() => void copy()} className="btn shrink-0 px-3 text-sm" aria-label={copied ? "Copied" : `Copy ${label}`}>
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

  const vaultButtons = (
    <div className="settle flex flex-col gap-3 sm:flex-row">
      {locked ? null : (
        <button className="btn btn-primary justify-center px-6" onClick={() => void signUp()} disabled={busy}>
          {busy ? "Waiting for your passkey…" : "Create my memory vault"}
        </button>
      )}
      <button className={`btn justify-center px-6 ${locked ? "btn-primary" : ""}`} onClick={() => void signIn()} disabled={busy}>
        {locked ? (busy ? "Waiting for your passkey…" : "Unlock vault") : "I already have one, unlock it"}
      </button>
    </div>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 md:px-8">
      <header className="flex items-center gap-3 py-6">
        <Seal size={34} />
        <span className="font-display text-2xl">Engram</span>
        <span className="rounded-full border-2 border-ink bg-pop px-2.5 py-0.5 text-xs font-bold">Monad testnet</span>
        {locked ? null : (
          <a href="#builders" className="ml-auto hidden text-sm font-bold underline underline-offset-4 sm:block">For builders</a>
        )}
      </header>

      <section className="grid grid-cols-1 items-center gap-10 pb-16 pt-4 md:grid-cols-[1.15fr_1fr] md:pt-10">
        <div>
          <h1 className="font-display text-[clamp(2.7rem,7vw,5.6rem)] leading-[0.95]">
            {locked ? (
              <Words>Your vault is locked.</Words>
            ) : (
              <>
                <Words>Tell one AI. Every app you approve</Words>{" "}
                <em className="mt-2 inline-block -rotate-2 rounded-[14px] border-[3px] border-ink bg-pop px-3 not-italic shadow-[5px_5px_0_#141414]">remembers.</em>
              </>
            )}
          </h1>
          <p className="settle mt-7 max-w-md text-lg font-medium leading-relaxed" style={{ animationDelay: "300ms" }}>
            {locked ? "Unlock it with your passkey to see and control your memory." : "Your memory lives in your vault. Apps ask it, it answers, and you see every move."}
          </p>

          {locked ? (
            <div className="mt-8">{vaultButtons}</div>
          ) : (
            <>
              <div className="stagger mt-8 grid max-w-xl grid-cols-1 gap-4 sm:grid-cols-2">
                <a href={SAGE_URL} className="paper-card lift flex flex-col gap-1 bg-sage! p-4" style={{ ["--i" as string]: 0 }}>
                  <span className="font-display text-3xl">Sage</span>
                  <span className="text-sm font-medium">Remembers what you tell it</span>
                  <span className="mt-3 font-bold">Chat with Sage →</span>
                </a>
                <a href={WAYFARER_URL} className="paper-card lift flex flex-col gap-1 bg-wayfarer! p-4" style={{ ["--i" as string]: 1 }}>
                  <span className="font-display text-3xl">Wayfarer</span>
                  <span className="text-sm font-medium">Plans trips and meals for you</span>
                  <span className="mt-3 font-bold">Chat with Wayfarer →</span>
                </a>
              </div>
              <div className="mt-6">
                {open ? vaultButtons : (
                  <button className="btn btn-primary px-6" onClick={() => setOpen(true)}>
                    <Seal size={20} /> Open my vault
                  </button>
                )}
              </div>
            </>
          )}
          {error ? (
            <p role="alert" className="mt-5 max-w-xl rounded-[14px] border-[3px] border-ink bg-danger-soft px-4 py-2.5 text-sm">{error}</p>
          ) : null}
          <p className="mt-6 max-w-md text-xs font-medium text-ink-soft">Encrypted on your device before it goes to Monad. No company can read it, us included.</p>
        </div>

        <div
          className="relative mx-auto h-[340px] w-full max-w-[460px] md:h-[440px]"
          aria-hidden
          onMouseEnter={() => setReplay((r) => r + 1)}
        >
          <div key={replay} className="stage absolute inset-0">
            <div className="paper-card absolute left-0 top-6 w-[46%] -rotate-3 bg-sage! p-3 font-bold">
              Sage
              <div className="mt-2 h-2.5 rounded-full bg-ink/15" />
              <div className="mt-1.5 h-2.5 w-2/3 rounded-full bg-ink/15" />
            </div>
            <div className="paper-card absolute bottom-4 right-0 w-[46%] rotate-2 bg-wayfarer! p-3 font-bold">
              Wayfarer
              <div className="mt-2 h-2.5 rounded-full bg-ink/15" />
              <div className="mt-1.5 h-2.5 w-1/2 rounded-full bg-ink/15" />
            </div>
            <div className="stage-vault absolute left-1/2 top-1/2">
              <Seal size={180} />
            </div>
            <span className="pill pill-saved stage-in absolute">vegetarian</span>
            <span className="pill pill-used stage-out absolute">vegetarian</span>
          </div>
        </div>
      </section>

      {locked ? null : (
        <>
          <section className="grid grid-cols-1 gap-5 border-t-[3px] border-ink py-14 md:grid-cols-12">
            {story.map(([title, body, bg, span], i) => (
              <div key={title} className={`paper-card p-5 ${span}`}>
                <span className={`inline-grid h-10 w-10 place-items-center rounded-full border-[3px] border-ink font-display text-xl ${bg}`}>{i + 1}</span>
                <p className="mt-4 font-display text-2xl leading-tight">{title}</p>
                <p className="mt-2 font-medium leading-relaxed">{body}</p>
              </div>
            ))}
          </section>

          <section id="builders" className="grid gap-8 border-t-[3px] border-ink py-14 md:grid-cols-2">
            <div className="paper-card min-w-0 p-6">
              <p className="text-xs font-bold uppercase tracking-widest">For builders · no code</p>
              <h2 className="mt-3 font-display text-3xl leading-tight">Give Claude Code or Cursor a memory you control.</h2>
              <p className="mt-3 font-medium leading-relaxed">Engram runs as an MCP server. Your AI tool asks your vault; it holds no keys. Needs Node 22.</p>
              <ol className="mt-5 space-y-4">
                <li>
                  <p className="font-bold">1. Add it to Claude Code</p>
                  <CopyCode code={MCP_CLAUDE_CODE} label="the Claude Code command" />
                  <details className="mt-2">
                    <summary className="inline-flex min-h-6 cursor-pointer items-center text-sm font-bold underline underline-offset-4">Cursor or Claude Desktop</summary>
                    <p className="mt-2 text-sm font-medium">Add this to <code className="font-mono">.cursor/mcp.json</code> or <code className="font-mono">claude_desktop_config.json</code>:</p>
                    <CopyCode code={MCP_JSON} label="the JSON config" />
                  </details>
                </li>
                <li>
                  <p className="font-bold">2. Link your vault</p>
                  <p className="mt-1 font-medium leading-relaxed">
                    Ask Claude to check your Engram vault status. Open the link it gives, allow local network access, unlock and approve. Keep that tab open.
                  </p>
                </li>
              </ol>
            </div>
            <div className="paper-card min-w-0 p-6">
              <p className="text-xs font-bold uppercase tracking-widest">For builders · your own agent</p>
              <h2 className="mt-3 font-display text-3xl leading-tight">Add memory without holding anyone&apos;s data.</h2>
              <pre className="mt-4 overflow-x-auto rounded-[14px] border-[3px] border-ink bg-ink p-4 font-mono text-[13px] leading-6 text-white">
                {snippet.map(([t, line], i) => (
                  <span key={i} className={`block ${t === "c" ? "text-[#b8b0a4]" : t === "v" ? "text-pop" : ""}`}>{line}</span>
                ))}
              </pre>
            </div>
          </section>

          <footer className="flex flex-col gap-3 border-t-[3px] border-ink py-8 text-xs font-medium sm:flex-row sm:items-center sm:justify-between">
            <span>Built on Monad, with ERC-8004 agent identities, Mera passkeys and Envio</span>
            <a href={`https://testnet.monadvision.com/address/${REGISTRY}`} target="_blank" rel="noreferrer" className="font-mono underline underline-offset-4">
              MemoryRegistry {REGISTRY.slice(0, 6)}…{REGISTRY.slice(-4)}
            </a>
          </footer>
        </>
      )}
    </main>
  );
}
