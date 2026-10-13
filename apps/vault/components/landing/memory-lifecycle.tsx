"use client";

import { Reveal } from "./reveal";
import { LatticeDivider } from "./lattice-divider";

const STEPS = [
  {
    num: "01",
    title: "You just talk",
    body: "Tell Sage 'I'm vegetarian and allergic to peanuts' in normal conversation. You don't set up categories.",
    pill: "Plain chat",
  },
  {
    num: "02",
    title: "Sage suggests, you decide",
    body: "Sage proposes the memory and it waits in your vault. Other agents can't see it until you approve.",
    pill: "Held for review",
  },
  {
    num: "03",
    title: "Sealed with your passkey",
    body: "Your device encrypts it with WebAuthn PRF and AES-256-GCM. The encrypted memory is stored immutably on Monad testnet.",
    pill: "Encrypted on device",
  },
  {
    num: "04",
    title: "The agent asks",
    body: "When Wayfarer plans dinner, it asks 'any allergy concerns?' It can't browse the rest of your memory.",
    pill: "No keys for agents",
  },
  {
    num: "05",
    title: "Your vault answers",
    body: "Your on-device vault strip picks 'allergic to peanuts' and sends back only that. Your medical notes and tech stack stay sealed.",
    pill: "Only what fits",
  },
  {
    num: "06",
    title: "See it, shut it off",
    body: "Every read shows up live in your Reads log. Tap once to revoke, and the agent's next prompt gets nothing.",
    pill: "One-tap revoke",
  },
];

export function MemoryLifecycle() {
  return (
    <section className="relative py-14 sm:py-20">
      <LatticeDivider className="absolute inset-x-0 top-0 -translate-y-1/2" />
      <div className="max-w-2xl">
        <div className="inline-flex items-center gap-2 rounded-full border-2 border-ink bg-vault-soft px-3 py-1 font-mono text-xs font-bold text-vault-ink shadow-[2px_2px_0_#141414]">
          <span className="h-2 w-2 rounded-full bg-vault" />
          Step by step
        </div>
        <h2 className="mt-3 font-display text-3xl sm:text-4xl">How your memory moves</h2>
        <p className="mt-3 text-base font-medium text-ink-soft">
          Agents never hold a key. They ask, your vault decides what to answer, and you can see each step.
        </p>
      </div>

      <Reveal className="mt-10">
        <ol className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {STEPS.map((step) => (
            <li
              key={step.num}
              data-reveal
              className="glass-panel flex flex-col justify-between rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 hover:shadow-[6px_6px_0_#141414]"
            >
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl font-black text-vault-ink">
                    {step.num}
                  </span>
                  <span className="rounded-full border border-ink/20 bg-paper px-2.5 py-0.5 font-mono text-[11px] font-bold text-ink">
                    {step.pill}
                  </span>
                </div>
                <h3 className="mt-4 font-display text-xl font-bold text-ink">{step.title}</h3>
                <p className="mt-2 text-sm font-medium leading-relaxed text-ink-soft">
                  {step.body}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </Reveal>
    </section>
  );
}
