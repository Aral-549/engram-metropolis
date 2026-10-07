"use client";
// Chat UI for a KIMI agent connected to the user's own memory vault (contracts/apps.md App 2 / App 3, ui.md).
import { connectEngram, openVaultBridge, type DisclosedEntry, type VaultBridge } from "@engram/sdk";
import { useEffect, useRef, useState } from "react";
import { persona } from "@/lib/personas";
import { Monogram } from "@/components/Monogram";
import { Words } from "@/components/Words";

type Unsaved = { kind: "fact" | "preference" | "note"; text: string };
type Msg = { role: "user" | "assistant"; content: string; saved?: { text: string; txHash?: string }[]; unsaved?: string[]; used?: string[] };
const P = persona(process.env.NEXT_PUBLIC_AGENT_PERSONA);
const VAULT = process.env.NEXT_PUBLIC_VAULT_URL ?? "http://localhost:3100";
const AGENT_ID = BigInt(process.env.NEXT_PUBLIC_AGENT_ID ?? "0");
// The other demo app, for "See it in Wayfarer" after Sage saves something (simple-flow.md C26).
const PEER = persona(P.id === "assistant" ? "planner" : "assistant");
const PEER_URL = process.env.NEXT_PUBLIC_PEER_AGENT_URL ?? "";
const FLAG = `engram-connected-${P.id}`; // UI convenience only; the httpOnly cookie is the real session
// Chat first (contracts/simple-flow.md A, B2): the conversation and memories waiting for a vault live in this tab only
// (sessionStorage): a refresh keeps them, closing the tab deletes them.
const CHAT_KEY = `engram-chat-${P.id}`;
const UNSAVED_KEY = `engram-unsaved-${P.id}`;
const load = <T,>(k: string, fallback: T): T => {
  try {
    const v = JSON.parse(sessionStorage.getItem(k) ?? "null") as T | null;
    return v ?? fallback;
  } catch {
    return fallback;
  }
};
const store = (k: string, v: unknown) => {
  try {
    sessionStorage.setItem(k, JSON.stringify(v));
  } catch {
    /* storage blocked or full: the chat still works for this visit */
  }
};
// Disclosure mode (default): this page never gets a key. It asks the user's vault, framed below, for each answer.
const MODE: "disclosure" | "offline" = process.env.NEXT_PUBLIC_AGENT_MODE === "offline" ? "offline" : "disclosure";
type Pending = { id: string; tool: "recall" | "remember"; args: Record<string, unknown> };
type ChatReply = { reply?: string; saved?: { text: string; txHash?: string }[]; accessRevoked?: boolean; message?: string; code?: string; pending?: Pending; continuation?: string; memory?: "off" };
const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

export default function Page() {
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);
  // The vault strip is mounted while connecting too, so the connect popup can unlock it directly (simple-flow.md C).
  const [connecting, setConnecting] = useState(false);
  const [unsaved, setUnsaved] = useState<Unsaved[]>([]);
  const unsavedRef = useRef<Unsaved[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const bridgeMount = useRef<HTMLDivElement>(null);
  const bridge = useRef<VaultBridge | null>(null);

  useEffect(() => {
    try {
      setConnected(localStorage.getItem(FLAG) === "1");
    } catch {
      /* storage blocked: start disconnected */
    }
    // Restore the conversation and anything waiting to be saved (simple-flow.md C3).
    setMessages(load<Msg[]>(CHAT_KEY, []).slice(-50));
    setUnsavedList(load<Unsaved[]>(UNSAVED_KEY, []));
  }, []);
  useEffect(() => {
    if (messages.length) store(CHAT_KEY, messages.slice(-50));
  }, [messages]);
  // Closing with memories that are not in the vault yet: the browser asks first (C40). Browsers show their own fixed
  // text here; the banner above the input says what is at stake before that.
  useEffect(() => {
    if (!unsaved.length) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved.length]);

  function setUnsavedList(list: Unsaved[]) {
    unsavedRef.current = list;
    setUnsaved(list);
    store(UNSAVED_KEY, list);
  }

  /** Sends memories that waited for a vault through the bridge, oldest first; keeps whatever fails (C5). */
  async function flushUnsaved() {
    if (MODE !== "disclosure" || !bridge.current) return;
    for (const item of [...unsavedRef.current]) {
      try {
        await bridge.current.propose({ kind: item.kind, text: item.text });
        setUnsavedList(unsavedRef.current.filter((x) => x !== item));
      } catch {
        return; // locked or offline: try again on the next message or connect
      }
    }
  }

  function clearChat() {
    setMessages([]);
    setUnsavedList([]);
    try {
      sessionStorage.removeItem(CHAT_KEY);
    } catch {
      /* ignore */
    }
  }
  // Block body on purpose: newer Chromium returns a Promise from scrollIntoView, and React must not get it as cleanup.
  // Only once there is a conversation: scrolling on mount would hide the header on phones (contracts/apps.md V12).
  useEffect(() => {
    if (messages.length) end.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Mount the vault bridge strip once connected (contracts/disclosure.md "Bridge").
  useEffect(() => {
    if (MODE !== "disclosure" || !(connected || connecting) || !bridgeMount.current) return;
    const b = openVaultBridge({ vaultUrl: VAULT, agentId: AGENT_ID, mount: bridgeMount.current });
    bridge.current = b;
    return () => {
      b.close();
      bridge.current = null;
    };
    // Keep one strip across connecting -> connected: remount only when it should appear or go away.
  }, [connected || connecting]);

  // Saved memories fly into the vault strip (contracts/ui.md U3). Visual only: the pills are already in the DOM.
  const flown = useRef(0);
  useEffect(() => {
    const last = messages.length - 1;
    if (last < flown.current || !messages[last]?.saved?.length || !bridgeMount.current) return;
    flown.current = last + 1;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = bridgeMount.current.getBoundingClientRect();
    document.querySelectorAll<HTMLElement>(`[data-fly="${last}"]`).forEach((el, i) => {
      const r = el.getBoundingClientRect();
      const c = el.cloneNode(true) as HTMLElement;
      c.classList.add("flight");
      c.removeAttribute("data-fly");
      c.setAttribute("aria-hidden", "true");
      Object.assign(c.style, { left: `${r.left}px`, top: `${r.top}px`, transitionDelay: `${i * 120}ms` });
      document.body.appendChild(c);
      requestAnimationFrame(() => {
        c.style.transform = `translate(${target.left + 20 - r.left}px, ${target.top + 10 - r.top}px) scale(0.3)`;
        c.style.opacity = "0";
      });
      setTimeout(() => c.remove(), 700 + i * 120);
    });
  }, [messages]);

  /** Asks the vault (through the bridge) and maps its refusals onto what the server needs to know. */
  async function ask(query: string, mode: "relevant" | "full", round: number): Promise<{ entries: DisclosedEntry[]; memory: "ok" | "locked" | "revoked" | "none" }> {
    if (!bridge.current) return { entries: [], memory: "none" };
    try {
      return { entries: (await bridge.current.disclose(query.slice(0, 500), { mode, round })).entries, memory: "ok" };
    } catch (e) {
      const code = (e as { code?: string }).code;
      return { entries: [], memory: code === "VAULT_LOCKED" ? "locked" : code === "NOT_APPROVED" || code === "EXPIRED" ? "revoked" : "none" };
    }
  }

  /** Runs pending tool calls through the vault until the server has a final reply (at most 3 tool rounds). */
  async function finish(res: Response, body: ChatReply, held: string[], used: string[]): Promise<{ res: Response; body: ChatReply }> {
    for (let round = 1; round <= 8 && res.ok && body.pending && body.continuation; round++) {
      const p = body.pending;
      let result: Record<string, unknown>;
      try {
        if (!bridge.current) {
          // Memory is off: keep what the agent wanted to save on this device until memory is turned on (C2).
          if (p.tool === "remember" && typeof p.args.text === "string" && p.args.text.trim()) {
            const kind = p.args.kind === "fact" || p.args.kind === "note" ? p.args.kind : "preference";
            setUnsavedList([...unsavedRef.current, { kind, text: p.args.text.trim().slice(0, 500) }]);
            held.push(p.args.text.trim().slice(0, 500));
          }
          result = { id: p.id, ok: false, code: "NOT_CONNECTED" };
        } else if (p.tool === "recall") {
          const r = await bridge.current!.disclose(String(p.args.query ?? ""), { mode: p.args.mode === "full" ? "full" : "relevant", round: Math.min(round, 3) });
          used.push(...r.entries.map((x) => x.text));
          result = { id: p.id, ok: true, entries: r.entries };
        } else {
          const w = await bridge.current!.propose({ kind: p.args.kind as "fact", text: String(p.args.text ?? "") });
          result = { id: p.id, ok: true, seq: w.seq.toString() }; // an opaque receipt: nothing that names you onchain
        }
      } catch (e) {
        result = { id: p.id, ok: false, code: (e as { code?: string }).code ?? "BAD_REQUEST" };
      }
      res = await post("/api/chat/continue", { continuation: body.continuation, result });
      body = ((await res.json().catch(() => ({}))) ?? {}) as ChatReply;
    }
    return { res, body };
  }

  function setFlag(v: boolean) {
    setConnected(v);
    try {
      v ? localStorage.setItem(FLAG, "1") : localStorage.removeItem(FLAG);
    } catch {
      /* ignore */
    }
  }

  async function connect() {
    setNotice(null);
    setConnecting(true);
    try {
      const r = await connectEngram({ vaultUrl: VAULT, agentId: AGENT_ID, labels: P.labels, scope: P.scope, expiresInSec: 7 * 86400, mode: MODE });
      const res = await fetch("/api/session", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ proof: r.sessionProof }) });
      if (!res.ok) throw new Error("session");
      setFlag(true);
      setRevoked(false);
      // The bridge mounts after this render; give it a moment, then save what was waiting.
      setTimeout(() => void flushUnsaved(), 1500);
    } catch (e) {
      const code = (e as { code?: string }).code;
      setNotice(code === "USER_CANCELLED" ? "Connection cancelled. Nothing was shared." : code === "POPUP_BLOCKED" ? "Allow pop-ups for this site, then try again." : "Could not connect your memory. Try again.");
    } finally {
      setConnecting(false);
    }
  }

  async function send(text: string) {
    if (!text.trim() || busy) return;
    const next: Msg[] = [...messages, { role: "user", content: text.trim() }];
    setMessages(next);
    setInput("");
    setBusy(true);
    setNotice(null);
    try {
      if (connected && unsavedRef.current.length) await flushUnsaved();
      // Disclosure mode: before the model sees anything, the vault picks what is relevant to this message.
      const pre = MODE === "disclosure" && connected ? await ask(text.trim(), "relevant", 0) : { entries: [], memory: "none" as const };
      const first = await post("/api/chat", {
        // The server only keeps the last 20 turns; never send more than that (long chats would hit the body cap).
        messages: next.slice(-20).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })),
        ...(MODE === "disclosure" ? { disclosed: pre.entries, memory: pre.memory } : {}),
      });
      const held: string[] = [];
      const used: string[] = pre.entries.map((x) => x.text);
      const done = await finish(first, ((await first.json().catch(() => ({}))) ?? {}) as ChatReply, held, used);
      const res = done.res;
      const body = done.body;
      if (res.status === 401) {
        setFlag(false);
        setNotice("Connect your memory first.");
        setMessages(messages);
        return;
      }
      // The server sees no session (never connected, or it expired): show memory as off.
      if (body.memory === "off" && connected) setFlag(false);
      if (!res.ok) {
        setNotice(body.code === "NO_GRANT" ? "Approve this agent in your vault first." : (body.message ?? "Something went wrong."));
        // Memories saved before a failure are real; show them (BUGLOG G6).
        if (body.saved?.length) setMessages([...next, { role: "assistant", content: "", saved: body.saved }]);
        return;
      }
      setRevoked(!!body.accessRevoked);
      setMessages([...next, { role: "assistant", content: body.reply ?? "", saved: body.saved, ...(held.length ? { unsaved: held } : {}), ...(used.length ? { used: [...new Set(used)] } : {}) }]);
    } catch {
      setNotice("Could not reach the agent. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const canWrite = P.scope === "readwrite";
  const memoryOn = MODE === "disclosure" && (connected || connecting);
  const lastSaved = messages.reduce((n, m, i) => (m.saved?.length ? i : n), -1);

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-20 border-b-[3px] border-ink" style={{ background: "var(--agent)" }}>
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3 md:px-6">
          <Monogram letter={P.name[0]!} plain />
          <div className="min-w-0">
            <h1 className="font-display text-3xl leading-none md:text-4xl">{P.name}</h1>
            <p className="hidden truncate text-sm font-semibold sm:block">{P.tagline}</p>
          </div>
          <div className="ml-auto w-[min(320px,56vw)]">
            {memoryOn ? (
              <div ref={bridgeMount} aria-label="Your Engram vault" />
            ) : (
              <button onClick={() => void connect()} className="btn btn-primary w-full justify-center px-3" aria-label={`Turn on memory${unsaved.length ? ` (${unsaved.length} waiting)` : ""}`}>
                <span className="whitespace-nowrap">Turn on memory</span>
                {unsaved.length ? (
                  <span aria-hidden className="grid h-6 min-w-6 place-items-center rounded-full border-2 border-ink bg-pop px-1 text-xs">{unsaved.length}</span>
                ) : null}
              </button>
            )}
          </div>
        </div>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-4 pt-6 md:px-6">
        {revoked ? (
          <div className="settle mb-4 flex flex-wrap items-center gap-3 rounded-[14px] border-[3px] border-ink bg-danger-soft px-4 py-2.5 text-sm">
            <span>You revoked my access, so I&apos;ll ask what I need.</span>
            <button className="btn btn-primary text-xs px-2.5" onClick={() => void connect()}>Turn memory back on</button>
          </div>
        ) : null}

        <div className="flex-1 space-y-6 pb-6">
          {messages.length === 0 ? (
            <div className="pt-4 md:pt-12">
              <p className="max-w-2xl font-display text-[clamp(2rem,5vw,3.4rem)] leading-[1.02]">
                <Words>{P.greeting}</Words>
              </p>
              <div className="stagger mt-8 flex flex-wrap gap-3">
                {P.suggestions.map((s, i) => (
                  <button key={s} onClick={() => void send(s)} style={{ ["--i" as string]: i, ["--d" as string]: "500ms" }} className="btn px-3.5 text-left text-sm">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="settle ml-auto max-w-[85%] text-right">
                <div className="inline-block whitespace-pre-wrap rounded-[14px] bg-ink px-4 py-2.5 text-left font-medium leading-relaxed text-white">{m.content}</div>
              </div>
            ) : (
              <div key={i} className="settle flex max-w-[92%] gap-3">
                <Monogram letter={P.name[0]!} size={34} />
                <div className="min-w-0 flex-1">
                  {m.used?.length ? (
                    <div className="mb-2 flex flex-wrap gap-2" aria-label="Used from your vault">
                      {m.used.map((t, k) => (
                        <span key={`${t}-${k}`} className="pill pill-used" aria-label={`Used from your vault: ${t}`}>
                          <span className="t">Used: {t}</span>
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {m.content ? (
                    <div className="paper-card px-4 py-3">
                      <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    </div>
                  ) : null}
                  {m.saved?.length || m.unsaved?.length ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(m.saved ?? []).map((s, k) => (
                        <span key={`${s.text}-${k}`} data-fly={i} className="pill pill-saved" aria-label={`Saved to your memory: ${s.text}`}>
                          <span className="t">Saved: {s.text}</span>
                        </span>
                      ))}
                      {(m.unsaved ?? []).map((t, k) => {
                        const waiting = unsaved.some((u) => u.text === t);
                        return (
                          <span key={`${t}-${k}`} className={`pill ${waiting ? "pill-waiting" : "pill-saved"}`} aria-label={`${waiting ? "Not saved yet" : "Saved to your memory"}: ${t}`}>
                            <span className="t">{waiting ? (connected ? "Saving…" : "Not saved yet") : "Saved"}: {t}</span>
                          </span>
                        );
                      })}
                      {i === lastSaved && PEER_URL && canWrite ? (
                        <a href={PEER_URL} target="_blank" rel="noreferrer" className="ml-1 text-sm font-bold underline underline-offset-4">
                          See it in {PEER.name} →
                        </a>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
            ),
          )}
          {busy ? (
            <div className="settle flex items-center gap-3 text-sm font-semibold">
              <Monogram letter={P.name[0]!} size={34} />
              <span className="drops" aria-hidden><span /><span /><span /></span>
              <span>{connected ? "asking your vault" : "thinking"}</span>
            </div>
          ) : null}
          <div ref={end} />
        </div>

        {unsaved.length ? (
          <div role="status" className="settle mb-3 flex flex-wrap items-center gap-3 rounded-[14px] border-[3px] border-dashed border-ink bg-card px-4 py-2.5 text-sm">
            <span>
              {unsaved.length === 1 ? "1 memory isn't" : `${unsaved.length} memories aren't`} saved yet. Closing this tab deletes {unsaved.length === 1 ? "it" : "them"}.
            </span>
            {!connected ? (
              <button className="btn btn-primary text-xs px-2.5" onClick={() => void connect()}>Turn on memory</button>
            ) : null}
          </div>
        ) : null}
        {notice ? (
          <p role="alert" className="settle mb-3 rounded-[14px] border-[3px] border-ink bg-danger-soft px-4 py-2.5 text-sm">{notice}</p>
        ) : null}
        <form onSubmit={(e) => { e.preventDefault(); void send(input); }} className="sticky bottom-4 flex items-end gap-3">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }}
            rows={1}
            maxLength={4000}
            placeholder={`Message ${P.name}`}
            aria-label={`Message ${P.name}`}
            className="paper-card min-h-[52px] flex-1 resize-none px-4 py-3 leading-relaxed outline-none"
          />
          <button className="btn btn-primary px-5" disabled={busy || !input.trim()}>Send</button>
        </form>
        <p className="mt-4 text-center text-xs font-medium text-ink-soft">
          Runs on KIMI. {P.name} sees only what your vault shares.
          {messages.length ? <> · <button className="underline" onClick={clearChat}>Clear this chat</button></> : null}
        </p>
      </section>
    </main>
  );
}
