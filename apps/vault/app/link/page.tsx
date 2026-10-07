"use client";
// The desktop link tab (contracts/mcp.md): pairs with engram-mcp on 127.0.0.1, approves "Engram Desktop" once, then
// answers its requests with the same rules as any app (lib/link.ts). Keys never leave this tab. Not frameable.
import { useEffect, useRef, useState } from "react";
import { KNOWN_LABELS } from "@/lib/discover";
import { answerLink, vaultHandshake } from "@/lib/link";
import { Seal } from "@/components/Seal";
import { SessionProvider, useSession } from "@/components/SessionProvider";

type Params = { port: number; agentId: bigint; token: string; origin: string } | null;
type Activity = { key: number; text: string; tone: "read" | "write" | "error" };

function params(): Params {
  const u = new URL(window.location.href);
  const port = Number(u.searchParams.get("port"));
  const agent = u.searchParams.get("agent") ?? "";
  const token = new URLSearchParams(u.hash.slice(1)).get("token") ?? "";
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || !/^(0|[1-9]\d{0,77})$/.test(agent) || !/^[0-9a-f]{32}$/.test(token)) return null;
  return { port, agentId: BigInt(agent), token, origin: `http://127.0.0.1:${port}` };
}

function Link() {
  const { session, status, signIn, signUp, run, error } = useSession();
  const [p, setP] = useState<Params | undefined>(undefined);
  const [conn, setConn] = useState<"connecting" | "linked" | "blocked" | "closed" | "impostor">("connecting");
  const [client, setClient] = useState("your AI tool");
  const [approved, setApproved] = useState<boolean | null>(null);
  const [labels, setLabels] = useState<string[]>(["preferences"]);
  const [scope, setScope] = useState<"read" | "readwrite">("readwrite");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<Activity[]>([]);
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const seq = useRef(0);

  useEffect(() => setP(params()), []);

  // The link: hello with the one-time token, then answer every request with this tab's session.
  useEffect(() => {
    if (!p) return;
    let ws: WebSocket;
    try {
      ws = new WebSocket(`ws://127.0.0.1:${p.port}`);
    } catch {
      setConn("blocked");
      return;
    }
    let opened = false;
    // Mutual proof (BUGLOG MC-1): the token never crosses the wire, and nothing is answered until engram-mcp has
    // proven it knows the token too.
    const hs = vaultHandshake(p.token);
    let verified = false;
    let welcomed = false;
    // Firefox waits silently while its local-network prompt is open: after 10 s, show how to allow it (still waiting).
    const slow = setTimeout(() => !opened && setConn("blocked"), 10_000);
    ws.onopen = () => {
      opened = true;
      clearTimeout(slow);
      setConn((c) => (c === "blocked" ? "connecting" : c));
      ws.send(JSON.stringify(hs.hello));
    };
    ws.onerror = () => !opened && setConn("blocked");
    ws.onclose = () => setConn((c) => (c === "blocked" || c === "impostor" ? c : opened ? "closed" : "blocked"));
    ws.onmessage = async (ev) => {
      let m: { type?: string; client?: string; op?: string; args?: { query?: string } };
      try {
        m = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (m.type === "challenge" && !verified) {
        const r = await hs.onChallenge(m);
        if (!r) {
          console.info(JSON.stringify({ stage: "vault", op: "link", ok: false, code: "SERVER_UNVERIFIED" }));
          setConn("impostor");
          ws.close();
          return;
        }
        verified = true;
        ws.send(JSON.stringify(r.auth));
        return;
      }
      if (!verified) return;
      if (m.type === "welcome") {
        welcomed = true;
        setConn("linked");
        if (m.client && m.client !== "unknown") setClient(m.client);
        return;
      }
      if (m.type !== "req" || !welcomed) return;
      const res = await answerLink(sessionRef.current, m, { agentId: p.agentId, origin: p.origin });
      if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(res));
      if (m.op === "status") return;
      const r = res as { ok: boolean; code?: string; result?: { entries?: { text: string }[] } };
      const text = !r.ok
        ? `Refused (${(r.code ?? "error").toLowerCase().replaceAll("_", " ")})`
        : m.op === "remember"
          ? "Suggested a memory: waiting for your review"
          : `Asked "${String(m.args?.query ?? "").slice(0, 60)}": shared ${r.result?.entries?.length ?? 0}`;
      setActivity((a) => [{ key: seq.current++, text, tone: (!r.ok ? "error" : m.op === "remember" ? "write" : "read") as Activity["tone"] }, ...a].slice(0, 8));
    };
    return () => {
      clearTimeout(slow);
      ws.close();
    };
  }, [p]);

  // Is Engram Desktop already approved for this link's origin?
  useEffect(() => {
    if (!session || !p) return;
    void run((s) => s.approvalFor(p.agentId)).then((x) => setApproved(!!x && x.active && x.origin === p.origin && x.exp > Date.now()));
  }, [session, p, run]);

  async function approve() {
    if (!p || !labels.length) return;
    setBusy(true);
    const r = await run((s) => s.approve(p.agentId, { origin: p.origin, labels, scope, expiresInSec: 30 * 86400 }));
    setBusy(false);
    if (r) setApproved(true);
  }

  if (p === undefined) return <Shell><p className="text-ink-soft">Opening…</p></Shell>;
  if (p === null) {
    return (
      <Shell>
        <h1 className="font-display text-3xl">This link is not complete</h1>
        <p className="mt-2 text-ink-soft">Copy the whole link that engram-mcp printed in your terminal, including the part after #.</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-seal">Desktop link</p>
      <h1 className="mt-2 font-display text-[2.1rem] leading-tight">Give {client} a memory you control</h1>
      <p className="mt-2 text-sm text-ink-soft">
        {conn === "linked"
          ? "Connected to engram-mcp on this computer. Keep this tab open while you use it."
          : conn === "connecting"
            ? "Connecting to engram-mcp on this computer…"
            : conn === "closed"
              ? "engram-mcp stopped. Start it again, then open the new link it prints."
              : null}
      </p>
      {conn === "impostor" ? (
        <p role="alert" className="mt-4 rounded-sm border border-rust/40 bg-rust-soft px-3 py-2 text-sm text-rust">
          Something on this computer answered on that port but is not the engram-mcp that printed this link. Nothing was shared.
          Stop it, start engram-mcp again, and open the new link it prints.
        </p>
      ) : null}
      {conn === "blocked" ? (
        <p role="alert" className="mt-4 rounded-sm border border-rust/40 bg-rust-soft px-3 py-2 text-sm text-rust">
          Your browser is holding the connection to engram-mcp. Check that it is running, then allow local network access for this site (Chrome and
          Firefox ask once; if you said no, use the icon at the left of the address bar) and reload this page.
        </p>
      ) : null}

      {status === "restoring" ? (
        <p className="mt-6 text-ink-soft">Opening your vault…</p>
      ) : !session ? (
        <div className="mt-6 flex flex-col gap-2">
          <button className="btn btn-primary justify-center px-5 py-3" onClick={() => void signIn()} disabled={status === "working"}>
            <Seal size={18} /> {status === "working" ? "Waiting for your passkey…" : "Unlock my vault"}
          </button>
          <button className="btn btn-ghost justify-center px-5 py-2.5" onClick={() => void signUp()} disabled={status === "working"}>
            New here? Create a vault
          </button>
        </div>
      ) : approved === false ? (
        <div className="paper-card mt-6 space-y-4 p-5 text-sm">
          <p>
            <span className="font-medium">{client}</span> will ask your vault while you work. It never gets a key, and every read shows up in your vault.
          </p>
          <fieldset>
            <legend className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">Topics it may ask about</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {KNOWN_LABELS.map((l) => (
                <label key={l} className="flex items-center gap-1.5 font-mono">
                  <input type="checkbox" checked={labels.includes(l)} onChange={(e) => setLabels((x) => (e.target.checked ? [...x, l] : x.filter((y) => y !== l)))} />
                  {l}
                </label>
              ))}
            </div>
          </fieldset>
          <fieldset className="flex flex-wrap gap-4">
            <label className="flex items-center gap-1.5"><input type="radio" checked={scope === "read"} onChange={() => setScope("read")} /> Read only</label>
            <label className="flex items-center gap-1.5"><input type="radio" checked={scope === "readwrite"} onChange={() => setScope("readwrite")} /> Read, and suggest memories for me to review</label>
          </fieldset>
          <p className="text-xs text-ink-soft">What your vault shares goes to {client}&apos;s AI provider so it can answer you. For 30 days, or until you revoke it.</p>
          <button className="btn btn-primary w-full justify-center px-5 py-3" onClick={() => void approve()} disabled={busy || !labels.length}>
            <Seal size={18} /> {busy ? "Approving…" : "Approve"}
          </button>
        </div>
      ) : approved ? (
        <div className="mt-6">
          <p className="flex items-center gap-2 font-mono text-xs text-seal"><span className="live-dot" aria-hidden /> approved · answering {client}</p>
          <ol className="mt-4 space-y-2" aria-live="polite">
            {activity.length === 0 ? <li className="text-sm text-ink-soft">No requests yet. Each one shows up here and in your vault.</li> : null}
            {activity.map((a) => (
              <li key={a.key} className={`paper-card px-4 py-2.5 text-sm ${a.tone === "error" ? "text-rust" : a.tone === "write" ? "text-seal" : ""}`}>{a.text}</li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-6 text-ink-soft">Checking this link&apos;s approval…</p>
      )}
      {error ? <p role="alert" className="mt-4 text-sm text-rust">{error}</p> : null}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col px-6 py-8">
      <header className="mb-8 flex items-center gap-2">
        <Seal size={22} />
        <span className="font-display text-xl">Engram</span>
      </header>
      {children}
    </main>
  );
}

export default function LinkPage() {
  return (
    <SessionProvider>
      <Link />
    </SessionProvider>
  );
}
