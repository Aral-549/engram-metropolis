"use client";
// Consent popup (contracts/apps.md "Connect flow", cases V3, V4; sdk.md cases 12-14).
import { parseConnectRequest, replyToOpener, type AgentCard, type ConnectRequest, type OwnerSession, type PolicyView } from "@engram/sdk";
import { useEffect, useRef, useState } from "react";
import { KNOWN_LABELS, addLabel } from "@/lib/discover";
import { explain } from "@/lib/engram";
import { Seal } from "@/components/Seal";
import { SessionProvider, useSession } from "@/components/SessionProvider";
import { agentCard } from "@/components/useAgentCards";
import { HANDOFF_TYPE, sendHandoff } from "@/lib/handoff";
import { withRetry } from "@/lib/retry";

/**
 * Unlocks the app's vault strip with this session (contracts/simple-flow.md C). Retries every 250 ms for 3 s in case
 * the strip is still loading (C22); the strip ignores repeats. Resolves when done, so the popup can close after.
 */
async function handOff(s: OwnerSession, agentId: bigint, policy?: PolicyView): Promise<number> {
  if (!s.credentialId || !window.opener) return 0;
  const prf = s.exportRootSecret();
  let best = 0;
  try {
    for (let t = 0; t <= 3000; t += 250) {
      best = Math.max(best, sendHandoff(window.opener as Window, { type: HANDOFF_TYPE, v: 1, agentId: agentId.toString(), prf, credentialId: s.credentialId, ...(policy ? { policy } : {}) }, window.location.origin));
      await new Promise((r) => setTimeout(r, 250));
    }
  } finally {
    prf.fill(0);
  }
  console.info(JSON.stringify({ stage: "vault", op: "handoff", ok: best > 0, tries: 13, frames: best }));
  return best;
}

function duration(sec: number) {
  if (sec < 3600) return `${Math.round(sec / 60)} minutes`;
  if (sec < 86400 * 2) return `${Math.round(sec / 3600)} hours`;
  return `${Math.round(sec / 86400)} days`;
}

function claimedOrigin(): string | null {
  const o = new URL(window.location.href).searchParams.get("origin");
  try {
    return o && new URL(o).origin === o ? o : null;
  } catch {
    return null;
  }
}

function Consent() {
  const { session, status, signIn, signUp, run, error } = useSession();
  const [req, setReq] = useState<ConnectRequest | null>(null);
  const [card, setCard] = useState<AgentCard | null>(null);
  const [bad, setBad] = useState<string | null>(null);
  const [phase, setPhase] = useState<"review" | "granting" | "done">("review");
  const [retrying, setRetrying] = useState<string | null>(null);
  // Auto-save: opt-in, off by default, readwrite apps only (simple-flow.md D, provenance.md P27-P36).
  const [autoSave, setAutoSave] = useState(false);
  const replied = useRef(false);

  const reply = (msg: Parameters<typeof replyToOpener>[2]) => {
    if (replied.current || !req) return;
    replied.current = true;
    replyToOpener(window.opener, req.origin, msg);
  };

  useEffect(() => {
    let parsed: ConnectRequest;
    try {
      parsed = parseConnectRequest(window.location.href);
    } catch (e) {
      setBad(explain(e));
      const origin = claimedOrigin();
      if (origin && window.opener) replyToOpener(window.opener, origin, { ok: false, code: "INPUT_INVALID" });
      replied.current = true;
      return;
    }
    setReq(parsed);
    void agentCard(parsed.agentId.toString()).then((c) => {
      setCard(c);
      if (c) setReq(parseConnectRequest(window.location.href, { agentCard: c }));
    });
  }, []);

  // New users arriving from an app can create their vault right here; the grant follows within the
  // 60 s window, so it is still one passkey prompt.
  async function approve(how: "existing" | "new" = "existing") {
    if (!req) return;
    const s = session ?? (await (how === "new" ? signUp() : signIn()));
    if (!s) return;
    setPhase("granting");
    if (req.mode === "disclosure") {
      // Disclosure mode: no key leaves the vault. An encrypted approval is written; the app gets a pairwise
      // identity and must ask this vault (through /bridge) for each answer (contracts/disclosure.md D1, D2).
      // Network trouble is retried here (simple-flow.md C18); passkey and rule errors are not.
      const r = await run((x) =>
        withRetry(() => x.approve(req.agentId, { origin: req.origin, labels: req.labels, scope: req.scope, expiresInSec: req.expiresInSec, ...(autoSave && req.scope === "readwrite" ? { auto: true } : {}) }), {
          onRetry: (n, of) => setRetrying(`Network trouble, retrying (${n}/${of})…`),
        }),
      );
      setRetrying(null);
      const proof = r ? await run((x) => x.signAppSession({ agentId: req.agentId, origin: req.origin, ttlSec: Math.min(req.expiresInSec, 30 * 86400), pairwise: true })) : undefined;
      if (!r || !proof) {
        setPhase("review");
        return;
      }
      // No txHash: the policy tx's calldata names your real address, which the app must never learn (D33).
      reply({ ok: true, owner: r.pairwiseOwner, granted: req.labels, sessionProof: proof, mode: "disclosure" });
      setPhase("done");
      // Hand over the approval with its seq too, so the strip answers before the indexer catches up (HO-2).
      await handOff(s, req.agentId, { agentId: req.agentId, origin: req.origin, labels: req.labels, scope: req.scope, exp: r.exp, active: true, seq: r.seq, ...(autoSave && req.scope === "readwrite" ? { auto: true } : {}) });
      setTimeout(() => window.close(), 400);
      return;
    }
    // Sign the app-session proof first (prompt-free, in-session): if it fails, nothing has been granted yet.
    const sessionProof = await run((x) => x.signAppSession({ agentId: req.agentId, origin: req.origin, ttlSec: Math.min(req.expiresInSec, 30 * 86400) }));
    if (!sessionProof) {
      setPhase("review");
      return;
    }
    let txHash: `0x${string}` | undefined;
    for (const label of req.labels) {
      if (!(KNOWN_LABELS as readonly string[]).includes(label)) await run((x) => addLabel(x, label));
      const r = await run((x) => x.grant(label, req.agentId, { scope: req.scope, expiresInSec: req.expiresInSec, includeHistory: true }));
      if (!r) {
        setPhase("review");
        return;
      }
      txHash = r.txHash;
    }
    reply({ ok: true, owner: s.owner, granted: req.labels, txHash: txHash!, sessionProof });
    setPhase("done");
    setTimeout(() => window.close(), 1400);
  }

  function deny() {
    reply({ ok: false, code: "USER_CANCELLED" });
    window.close();
  }

  if (bad) {
    return (
      <Shell>
        <h1 className="font-display text-3xl">This request is not valid</h1>
        <p className="mt-3 text-ink-soft">{bad}</p>
        <p className="mt-2 text-sm text-ink-soft">Nothing was shared. You can close this window.</p>
      </Shell>
    );
  }
  if (!req) return <Shell><p className="text-ink-soft">Reading the request…</p></Shell>;

  const name = card?.name ?? `Agent #${req.agentId}`;
  return (
    <Shell>
      {phase === "done" ? (
        <div className="settle text-center">
          <Seal size={44} className="seal-stamp mx-auto" />
          <h1 className="mt-4 font-display text-3xl">Access granted</h1>
          <p className="mt-2 text-ink-soft">
            {req.mode === "disclosure"
              ? `${name} can now ask your vault about ${req.labels.join(", ")}. It won't get a key, and every read shows up in your vault.`
              : `${name} can now read ${req.labels.join(", ")}. Revoke it any time in your vault.`}
          </p>
        </div>
      ) : (
        <>
          <div className="-mx-6 -mt-2 border-y-[3px] border-ink bg-vault px-6 py-5">
            <p className="text-xs font-bold uppercase tracking-widest">Access request</p>
            <h1 className="mt-1 font-display text-[2rem] leading-tight">
              {name} wants to read part of your memory
            </h1>
            {card?.description ? <p className="mt-1 text-sm font-medium">{card.description}</p> : null}
          </div>

          <div className="paper-card mt-6 space-y-3 p-5 text-sm">
            <Row k="Requested by">
              <span className="font-mono">{req.origin}</span>{" "}
              {req.originVerified ? (
                <span className="mt-1 inline-block whitespace-nowrap rounded-full border-2 border-ink bg-sage px-2 py-0.5 text-[11px] font-bold">verified by agent card</span>
              ) : (
                <span className="mt-1 inline-block whitespace-nowrap rounded-full border-2 border-ink bg-danger px-2 py-0.5 text-[11px] font-bold">not listed by this agent</span>
              )}
            </Row>
            <Row k="Topics">{req.labels.map((l) => <span key={l} className="mr-2 font-mono">{l}</span>)}</Row>
            <Row k="Permission">{req.scope === "readwrite" ? (req.mode === "disclosure" ? "Read, and suggest memories for you to review" : "Read, and add new memories") : "Read only"}</Row>
            <Row k="For">{duration(req.expiresInSec)}, or until you revoke it</Row>
            <Row k="How">
              {req.mode === "disclosure" ? (
                <span><span className="font-bold">It never gets a key.</span> It asks your vault, gets only what fits, and you see every read.</span>
              ) : (
                <span className="font-bold text-danger-ink">Offline access: it gets a key to these topics, can read them without you, and keep copies.</span>
              )}
            </Row>
          </div>

          {req.mode === "disclosure" && req.scope === "readwrite" ? (
            <label className="paper-card mt-4 flex cursor-pointer items-start gap-3 p-4 text-sm">
              <input type="checkbox" className="mt-1 h-5 w-5 accent-[#8f73ff]" checked={autoSave} onChange={(e) => setAutoSave(e.target.checked)} />
              <span>
                <span className="font-bold">Let {name} save without asking me</span>
                <span className="block text-ink-soft">Only short, plain facts about you are saved right away, so your other apps can use them. Anything else waits for you. You can undo any of it.</span>
              </span>
            </label>
          ) : null}
          {!req.originVerified ? (
            <p className="mt-4 rounded-[14px] border-[3px] border-ink bg-danger-soft px-3 py-2 text-sm font-medium">
              The agent&apos;s public card does not list {req.origin}. Only continue if you opened this from an app you trust.
            </p>
          ) : null}
          <p className="mt-4 text-xs font-medium leading-relaxed text-ink-soft">
            What the app is shown goes to its AI provider so it can answer. Revoking stops new reads; past ones stay shown.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <button className="btn btn-primary justify-center px-5 py-3" onClick={() => void approve("existing")} disabled={phase === "granting" || status === "working" || status === "restoring"}>
              <Seal size={18} />
              {phase === "granting" ? "Sealing access onchain…" : status === "working" ? "Waiting for your passkey…" : status === "restoring" ? "Opening your vault…" : session ? "Approve" : "Unlock and approve"}
            </button>
            {!session ? (
              <button className="btn btn-ghost justify-center px-5 py-2.5" onClick={() => void approve("new")} disabled={phase === "granting" || status === "working" || status === "restoring"}>
                New here? Create a vault and approve
              </button>
            ) : null}
            <button className="mt-1 self-center px-4 py-2.5 text-sm font-bold underline underline-offset-4" onClick={deny} disabled={phase === "granting"}>
              Deny
            </button>
          </div>
          {retrying ? <p role="status" className="mt-4 text-sm font-bold">{retrying}</p> : null}
          {error && !retrying ? <p role="alert" className="mt-4 text-sm text-rust">{error}</p> : null}
        </>
      )}
    </Shell>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr] gap-3">
      <span className="text-[11px] font-bold uppercase tracking-wider text-ink-soft">{k}</span>
      <span>{children}</span>
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
      <header className="mb-8 flex items-center gap-2">
        <Seal size={22} />
        <span className="font-display text-xl">Engram</span>
      </header>
      {children}
    </main>
  );
}

export default function ConnectPage() {
  return (
    <SessionProvider>
      <Consent />
    </SessionProvider>
  );
}
