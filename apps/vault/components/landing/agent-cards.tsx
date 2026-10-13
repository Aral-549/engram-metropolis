"use client";

import { Tilt } from "./tilt";
import { Reveal } from "./reveal";
import { LatticeDivider } from "./lattice-divider";

const SAGE_URL = process.env.NEXT_PUBLIC_SAGE_URL ?? "http://localhost:3201";
const WAYFARER_URL = process.env.NEXT_PUBLIC_WAYFARER_URL ?? "http://localhost:3202";

const AGENTS = [
  {
    name: "Sage",
    role: "Personal Memory Assistant",
    tag: "ERC-8004 #2068",
    colorBg: "bg-sage",
    colorPill: "bg-sage/20 text-[#126b3b] border-sage",
    body: "Remembers your diet, stack, preferences, and personal facts. Proposes memories to your vault with owner quarantine—other apps never see them until you confirm.",
    href: SAGE_URL,
    cta: "Launch Sage",
    isExternal: true,
  },
  {
    name: "Wayfarer",
    role: "Trip & Dining Planner",
    tag: "ERC-8004 #2069",
    colorBg: "bg-wayfarer",
    colorPill: "bg-wayfarer/20 text-[#a34400] border-wayfarer",
    body: "Plans itineraries and dinners without re-asking your allergies. Requests relevant context from your vault, receives only what fits, and records every read live.",
    href: WAYFARER_URL,
    cta: "Launch Wayfarer",
    isExternal: true,
  },
  {
    name: "Your AI Tools",
    role: "MCP Developer Ecosystem",
    tag: "engram-vault-mcp",
    colorBg: "bg-vault",
    colorPill: "bg-vault/20 text-vault-ink border-vault",
    body: "Works in Claude Code, Codex, Cursor, and Gemini CLI. Your local coding assistants ask your vault tab with no keys, zero tracking, and instant one-tap revocation.",
    href: "#builders",
    cta: "Explore MCP setup",
    isExternal: false,
  },
];

export function AgentCards() {
  return (
    <section className="relative py-14 sm:py-20">
      <LatticeDivider className="absolute inset-x-0 top-0 -translate-y-1/2" />
      <div className="flex flex-col gap-2">
        <div className="inline-flex items-center gap-2 self-start rounded-full border-2 border-ink bg-pop px-3 py-1 font-mono text-xs font-bold text-ink shadow-[2px_2px_0_#141414]">
          <span className="h-2 w-2 rounded-full bg-ink" />
          Autonomous Agent Identities
        </div>
        <h2 className="font-display text-3xl sm:text-4xl">Meet the agents connected to your vault</h2>
        <p className="max-w-2xl text-base font-medium text-ink-soft">
          Each agent sees a different pairwise pseudonym. They never share a decryption key; they ask your vault, and your vault decides.
        </p>
      </div>

      <Reveal className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {AGENTS.map((agent) => (
          <Tilt key={agent.name} className="flex">
            <a
              data-reveal
              href={agent.href}
              target={agent.isExternal ? "_blank" : undefined}
              rel={agent.isExternal ? "noreferrer" : undefined}
              className="glass-panel glass-sheen group relative flex flex-1 flex-col justify-between rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-[7px_7px_0_#141414] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-vault"
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className={`grid h-12 w-12 place-items-center rounded-xl border-[2.5px] border-ink font-display text-xl font-extrabold ${agent.colorBg} shadow-[3px_3px_0_#141414]`}>
                    {agent.name[0]}
                  </div>
                  <span className={`rounded-full border-2 px-2.5 py-0.5 font-mono text-[11px] font-bold ${agent.colorPill}`}>
                    {agent.tag}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-2xl font-bold text-ink">{agent.name}</h3>
                <p className="font-mono text-xs font-semibold text-ink-soft">{agent.role}</p>
                <p className="mt-3 text-sm font-medium leading-relaxed text-ink-soft">
                  {agent.body}
                </p>
              </div>

              <div className="mt-6 flex items-center gap-2 border-t-2 border-ink/10 pt-4 font-display text-sm font-bold text-ink group-hover:text-vault-ink">
                <span>{agent.cta}</span>
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </div>
            </a>
          </Tilt>
        ))}
      </Reveal>
    </section>
  );
}
