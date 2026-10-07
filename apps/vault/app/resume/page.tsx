"use client";
// "Resume memory" popup (contracts/simple-flow.md B2, cases C37-C39). Opened by an app's vault strip; opens unlocked
// from the vault site's copy (or asks for the passkey), checks for an active approval for exactly this agent and app
// origin, hands the session and that approval back to the strip, and closes. No approve control: resuming never
// widens access.
import type { PolicyView } from "@engram/sdk";
import { useEffect, useRef, useState } from "react";
import { Seal } from "@/components/Seal";
import { SessionProvider, useSession } from "@/components/SessionProvider";
import { HANDOFF_TYPE } from "@/lib/handoff";
import { resumeCheck } from "@/lib/resume";

const REASONS: Record<string, string> = {
  UNKNOWN_ORIGIN: "This request doesn't say which app it came from.",
  NOT_APPROVED: "This app isn't approved. Open it and press Turn on memory.",
  ORIGIN: "This app is approved for a different site, so nothing was shared.",
  EXPIRED: "This app's approval has expired. Open it and press Turn on memory.",
};

function params(): { agentId: bigint | null; origin: string | null } {
  const q = new URL(window.location.href).searchParams;
  const raw = q.get("agentId") ?? "";
  return { agentId: /^(0|[1-9]\d{0,77})$/.test(raw) ? BigInt(raw) : null, origin: q.get("origin") };
}

function Resume() {
  const { session, status, signIn, run, error } = useSession();
  const [note, setNote] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (!session || started.current) return;
    started.current = true;
    const { agentId, origin } = params();
    if (agentId === null || !window.opener) {
      setNote("Open this from an app's memory strip.");
      return;
    }
    void run(async (s) => ({ p: await s.approvalFor(agentId) })).then((got) => {
      if (!got) {
        started.current = false; // a network or vault error, not a refusal: let the user try again
        setNote("Couldn't reach your vault just now. Close this window and press Resume again.");
        return;
      }
      const p = got.p;
      const check = resumeCheck({ policy: p as PolicyView | undefined, agentId, origin, now: Date.now() });
      console.info(JSON.stringify({ stage: "vault", op: "resume", ok: check.ok, ...(check.ok ? {} : { code: check.reason }) }));
      if (!check.ok) {
        setNote(REASONS[check.reason]!);
        return;
      }
      if (!session.credentialId) {
        setNote("Unlock with your passkey to resume.");
        return;
      }
      const prf = session.exportRootSecret();
      try {
        // The opener is the strip itself (vault origin); targetOrigin keeps the secret off any other page.
        (window.opener as Window).postMessage({ type: HANDOFF_TYPE, v: 1, agentId: agentId.toString(), prf, credentialId: session.credentialId, policy: p }, window.location.origin);
      } finally {
        prf.fill(0);
      }
      setDone(true);
      setTimeout(() => window.close(), 600);
    });
  }, [session, run]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-6 py-8">
      <header className="mb-8 flex items-center gap-2">
        <Seal size={22} />
        <span className="font-display text-xl">Engram</span>
      </header>
      {done ? (
        <p className="font-display text-3xl">Memory resumed</p>
      ) : note ? (
        <p className="text-ink-soft">{note}</p>
      ) : status === "restoring" || (status === "ready" && !note) ? (
        <p className="text-ink-soft">Opening your vault…</p>
      ) : (
        <>
          <h1 className="font-display text-3xl">Resume your memory</h1>
          <p className="mt-2 text-ink-soft">Your vault is locked on this device. Unlock it to let this app ask again.</p>
          <button className="btn btn-primary mt-6 justify-center px-5 py-3" onClick={() => void signIn()} disabled={status === "working"}>
            <Seal size={18} /> {status === "working" ? "Waiting for your passkey…" : "Unlock with passkey"}
          </button>
          {error ? <p role="alert" className="mt-4 text-sm text-rust">{error}</p> : null}
        </>
      )}
    </main>
  );
}

export default function ResumePage() {
  return (
    <SessionProvider>
      <Resume />
    </SessionProvider>
  );
}
