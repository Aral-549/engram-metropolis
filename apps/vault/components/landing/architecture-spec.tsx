"use client";

import { Reveal } from "./reveal";
import { LatticeDivider } from "./lattice-divider";

const SPECS = [
  {
    feature: "Decryption Keys",
    traditional: "Shared with every agent",
    engram: "Device WebAuthn PRF only",
    status: "pass",
  },
  {
    feature: "Read Visibility",
    traditional: "Invisible background scraping",
    engram: "Live real-time audit ledger",
    status: "pass",
  },
  {
    feature: "Agent Writes",
    traditional: "Direct memory poisoning",
    engram: "Quarantined proposals",
    status: "pass",
  },
  {
    feature: "Revocation",
    traditional: "Key rotation fails on clones",
    engram: "Instant one-tap kill",
    status: "pass",
  },
  {
    feature: "Identity Privacy",
    traditional: "Cross-app tracking IDs",
    engram: "Pairwise pseudonymous IDs",
    status: "pass",
  },
  {
    feature: "Consensus & Log",
    traditional: "Opaque centralized cloud",
    engram: "Monad 10,000 TPS + Envio",
    status: "pass",
  },
];

export function ArchitectureSpec() {
  return (
    <section className="relative grid gap-10 py-14 sm:py-20 lg:grid-cols-[1fr_1.35fr] lg:gap-14">
      <LatticeDivider className="absolute inset-x-0 top-0 -translate-y-1/2" />
      <div className="flex flex-col justify-center">
        <div className="inline-flex items-center gap-2 self-start rounded-full border-2 border-ink bg-pop px-3 py-1 font-mono text-xs font-bold text-ink shadow-[2px_2px_0_#141414]">
          <span className="h-2 w-2 rounded-full bg-ink" />
          Zero-Trust Security
        </div>
        <h2 className="mt-3 font-display text-3xl sm:text-4xl">Why today&apos;s shared memory is broken</h2>
        <p className="mt-4 text-base font-medium leading-relaxed text-ink-soft">
          When other products share your memory, they give each agent your private decryption key.
          From that moment, the agent can copy and exfiltrate everything.
        </p>
        <p className="mt-3 text-base font-medium leading-relaxed text-ink-soft">
          Engram removes the key from the agent completely. The agent asks questions, your vault filters the response on your device, and only the minimal relevant fact is disclosed.
        </p>
        <div className="mt-6 rounded-xl border-[2.5px] border-ink bg-card/80 p-4 font-mono text-xs shadow-[4px_4px_0_#141414] backdrop-blur-md">
          <span className="text-vault-ink font-bold">guarantee</span>: no agent can read your memories without an active user session and on-device vault strip approval.
        </div>
      </div>

      <div className="space-y-4 min-w-0 max-w-full overflow-x-auto">
        <Reveal className="glass-panel min-w-[320px] overflow-hidden rounded-2xl border-[2.5px] border-ink shadow-[6px_6px_0_#141414]">
          <div className="grid grid-cols-[1.1fr_1fr_1.1fr] items-center gap-2 sm:gap-4 border-b-2 border-ink/15 bg-paper/60 px-3 sm:px-5 py-3 font-mono text-xs font-bold uppercase tracking-wider text-ink-soft">
            <span>Security Model</span>
            <span className="text-danger-ink">Traditional</span>
            <span className="text-vault-ink">Engram Vault</span>
          </div>

          {SPECS.map((s, i) => (
            <div
              key={s.feature}
              data-reveal
              className={`grid grid-cols-[1.1fr_1fr_1.1fr] items-center gap-4 border-b border-ink/10 px-5 py-3.5 last:border-b-0 ${
                i % 2 === 0 ? "bg-white/40" : "bg-transparent"
              }`}
            >
              <span className="font-display text-sm font-bold text-ink">{s.feature}</span>
              <span className="font-mono text-xs text-danger-ink line-through decoration-danger decoration-2 opacity-80">
                {s.traditional}
              </span>
              <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-ink">
                <span className="inline-block h-2 w-2 rounded-full bg-sage" />
                {s.engram}
              </span>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
