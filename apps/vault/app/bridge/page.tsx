"use client";
// Vault bridge strip, framed by an approved agent app (contracts/disclosure.md, contracts/apps.md V6, V7).
// It holds its own vault session (one passkey tap), answers the app's questions from approved folders only, and
// shows every read live. No approve or confirm controls live here (clickjacking): approvals happen in /connect.
import { startBridge, type BridgeEvent, type OwnerSession, type PolicyView } from "@engram/sdk";
import { useEffect, useRef, useState } from "react";
import { Seal } from "@/components/Seal";
import { acceptHandoff } from "@/lib/handoff";
import { device } from "@/components/SessionProvider";
import { embedderOrigin, resumeUrl } from "@/lib/resume";
import { SessionProvider, useSession } from "@/components/SessionProvider";

type Line = { key: number; text: string; tone: "read" | "write" | "empty" | "error" };

function embedder(): string | null {
  const ao = (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins;
  if (ao && ao.length) return ao[0] ?? null;
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
}

function Strip() {
  const { session, status, adopt, lock, run, error } = useSession();
  const [resumeNote, setResumeNote] = useState<string | null>(null);

  // "Resume memory" (simple-flow.md B2): reopen this app's access from the vault site's copy, one click, no QR.
  function resume() {
    if (agentId === null || agentId === undefined) return;
    const app = embedderOrigin({ ancestorOrigins: (window.location as Location & { ancestorOrigins?: DOMStringList }).ancestorOrigins as unknown as ArrayLike<string>, referrer: document.referrer });
    if (!app) {
      setResumeNote("Can't tell which app this is. Open the app again and press Turn on memory.");
      return;
    }
    const w = window.open(resumeUrl(window.location.origin, agentId, app), "engram-resume", "popup,width=440,height=560");
    setResumeNote(w ? null : "Allow pop-ups for this site, then press Resume again.");
  }
  // Read the URL and the framing context after mount (window does not exist while prerendering).
  const [agentId, setAgentId] = useState<bigint | null | undefined>(undefined);
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    const raw = new URL(window.location.href).searchParams.get("agentId") ?? "";
    setAgentId(/^(0|[1-9]\d{0,77})$/.test(raw) ? BigInt(raw) : null);
    setFramed(window.parent !== window);
  }, []);
  const [policy, setPolicy] = useState<PolicyView | null | undefined>(undefined);
  const [lines, setLines] = useState<Line[]>([]);
  const sessionRef = useRef<OwnerSession | null>(null);
  const bridge = useRef<ReturnType<typeof startBridge> | null>(null);
  const seq = useRef(0);
  sessionRef.current = session;
  const parentOrigin = useRef<string | null>(null);

  useEffect(() => {
    parentOrigin.current = embedder();
    if (agentId === null || agentId === undefined || window.parent === window) return;
    const push = (text: string, tone: Line["tone"]) => setLines((l) => [{ key: seq.current++, text, tone }, ...l].slice(0, 3));
    const onEvent = (e: BridgeEvent) => {
      if (!e.ok) return push(e.code === "RATE_LIMITED" ? "Paused: this app asked too often" : `Refused: ${e.code.toLowerCase().replaceAll("_", " ")}`, "error");
      if (e.op === "propose") return push(`Saved for you, waiting for your review: ${e.text}`, "write");
      if (!e.entries.length) return push(e.mode === "full" ? "Asked for everything, but there's nothing to share yet" : "Asked, nothing relevant shared", "empty");
      push(`${e.mode === "full" ? "Full read" : "Shared"} ${e.entries.length}: ${e.entries.map((x) => x.text).join("; ")}`, "read");
    };
    bridge.current = startBridge({ session: () => sessionRef.current ?? undefined, agentId, window: window as never, onEvent });
    return () => bridge.current?.stop();
  }, [agentId]);

  // The connect popup hands its session over right after you approve (contracts/simple-flow.md C): no second prompt.
  useEffect(() => {
    if (agentId === null || agentId === undefined) return;
    const onMessage = (ev: MessageEvent) => {
      const h = acceptHandoff({ origin: ev.origin, data: ev.data }, { vaultOrigin: window.location.origin, agentId });
      if (!h) return;
      const policy = h.policy;
      void adopt(h.prf, h.credentialId).then((s) => {
        if (!s || !policy) return;
        // Answer from the approval just written instead of waiting for the indexer (BUGLOG HO-2, disclosure.md D39).
        try {
          s.primeApproval(policy);
          setPolicy(policy);
          void bridge.current?.refresh();
        } catch {
          /* malformed approval: fall back to reading it from the chain */
        }
      });
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [agentId, adopt]);

  useEffect(() => {
    if (!session || agentId === null || agentId === undefined) {
      setPolicy(undefined);
      return;
    }
    void run((s) => s.approvalFor(agentId)).then((p) => {
      setPolicy(p ?? null);
      // Revoked or expired for this app: forget this device's copy here (C11). No approval found yet is not a
      // revoke (the indexer may still be catching up right after connecting), so it keeps the copy.
      if (p && (!p.active || p.exp <= Date.now())) lock();
      void bridge.current?.refresh();
    });
  }, [session, agentId, run, lock]);

  if (agentId === undefined) return <Frame><span className="text-ink-soft">Opening your vault…</span></Frame>;
  if (agentId === null || !framed) {
    return <Frame><span className="text-ink-soft">This page only works inside an approved agent app.</span></Frame>;
  }

  const here = parentOrigin.current;
  const approvedHere = !!policy && policy.active && (!here || policy.origin === here);
  const busy = status === "working";

  return (
    <Frame>
      <div className="flex min-w-0 flex-1 flex-col justify-center">
        <p className="flex items-center gap-2 font-mono text-[11px] text-ink-soft">
          <Seal size={16} />
          <span className="text-ink">Engram vault</span>
          <span className="text-rule">/</span>
          {status === "restoring" ? (
            <span>opening…</span>
          ) : status !== "ready" ? (
            <span>locked</span>
          ) : policy === undefined ? (
            <span>checking approval…</span>
          ) : approvedHere ? (
            <span className="flex items-center gap-1.5 text-seal"><span className="live-dot" aria-hidden /> sharing only what is relevant</span>
          ) : (
            <span className="text-rust">Not approved for this site</span>
          )}
        </p>
        <p className="mt-1 truncate text-[13px] leading-snug" aria-live="polite">
          {lines[0] ? (
            <span key={lines[0].key} className={`ink-in inline-block max-w-full truncate ${lines[0].tone === "error" ? "text-rust" : lines[0].tone === "write" ? "text-seal" : ""}`}>
              {lines[0].text}
            </span>
          ) : status === "ready" ? (
            <span className="text-ink-soft">No reads yet. Each one will show up here and in your vault.</span>
          ) : (
            <span className="text-ink-soft">{resumeNote ?? error ?? "Resume so this app can ask your vault. It won't get a key."}</span>
          )}
        </p>
      </div>
      {status !== "ready" ? (
        <button className="btn btn-primary shrink-0 px-3 py-1.5 text-sm" onClick={resume} disabled={busy || status === "restoring"}>
          {busy ? "Waiting…" : "Resume memory"}
        </button>
      ) : approvedHere ? (
        <button
          className="btn btn-danger shrink-0 px-3 py-1.5 text-sm"
          onClick={() =>
            void run((s) => s.disapprove(agentId)).then((r) => {
              if (!r) return;
              setPolicy((p) => (p ? { ...p, active: false } : p));
              void device("tab").clear().catch(() => {}); // revoked here: forget this app's copy (C11)
            })
          }
        >
          Revoke
        </button>
      ) : null}
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return <main className="flex h-dvh items-center gap-3 overflow-hidden border border-rule bg-card px-3">{children}</main>;
}

export default function BridgePage() {
  return (
    <SessionProvider scope="tab">
      <Strip />
    </SessionProvider>
  );
}
