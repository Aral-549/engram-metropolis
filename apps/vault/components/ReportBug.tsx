"use client";
// "Report a bug" (contracts/feedback.md R1-R12). Sends only what the person types plus the app, page path (no query,
// no #fragment: the /link token lives there), browser and screen size. Never reads the vault, its session or storage.
import { useRef, useState } from "react";

type Phase = "idle" | "sending" | "sent" | "error" | "limited";

export function ReportBug({ app, endpoint = "/api/report", className = "" }: { app: "vault" | "sage" | "wayfarer"; endpoint?: string; className?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [what, setWhat] = useState("");
  const [contact, setContact] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [path, setPath] = useState("/");

  function open() {
    setPath(window.location.pathname);
    if (phase !== "error" && phase !== "limited") setPhase("idle");
    dialog.current?.showModal();
  }

  async function send(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!what.trim() || phase === "sending") return;
    setPhase("sending");
    const website = (new FormData(e.currentTarget).get("website") as string | null) ?? "";
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ app, path: window.location.pathname, what, contact: contact || undefined, ua: navigator.userAgent, vw: window.innerWidth, vh: window.innerHeight, website }),
      });
      if (res.status === 201) {
        setPhase("sent");
        setWhat("");
        setContact("");
      } else setPhase(res.status === 429 ? "limited" : "error");
    } catch {
      setPhase("error"); // offline: the text stays in the box
    }
  }

  return (
    <>
      <button type="button" onClick={open} className={`min-h-6 text-xs font-bold underline underline-offset-2 ${className}`}>
        Report a bug
      </button>
      <dialog ref={dialog} aria-labelledby="report-title" className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-[14px] border-[3px] border-ink bg-paper p-0 text-left text-base font-normal text-ink shadow-[5px_5px_0_#141414] backdrop:bg-ink/40">
        {phase === "sent" ? (
          <div className="p-5">
            <p id="report-title" className="font-display text-2xl">Thanks, sent.</p>
            <p className="mt-1 text-sm font-medium">We read every report.</p>
            <button type="button" className="btn btn-primary mt-4 px-5" onClick={() => dialog.current?.close()} autoFocus>Close</button>
          </div>
        ) : (
          <form onSubmit={(e) => void send(e)} className="space-y-3 p-5">
            <p id="report-title" className="font-display text-2xl">Report a bug</p>
            <label className="block text-sm font-bold">
              What happened?
              <textarea value={what} onChange={(e) => setWhat(e.target.value)} maxLength={2000} rows={4} autoFocus required
                className="mt-1 block w-full resize-y rounded-[10px] border-[3px] border-ink bg-card px-3 py-2 font-medium" />
            </label>
            <label className="block text-sm font-bold">
              Email or handle, if you want a reply <span className="font-medium text-ink-soft">(optional)</span>
              <input value={contact} onChange={(e) => setContact(e.target.value)} maxLength={200}
                className="mt-1 block w-full rounded-[10px] border-[3px] border-ink bg-card px-3 py-2 font-medium" />
            </label>
            {/* Hidden from people; bots fill it (R7). */}
            <input name="website" tabIndex={-1} autoComplete="off" aria-hidden className="absolute -left-[9999px] h-0 w-0 opacity-0" />
            <p className="text-xs font-medium text-ink-soft">Sent with this report: {app}, page {path}, your browser and screen size. Nothing from your vault.</p>
            {phase === "error" ? <p role="alert" className="text-sm font-bold text-danger-ink">Couldn&apos;t send. Try again later.</p> : null}
            {phase === "limited" ? <p role="alert" className="text-sm font-bold text-danger-ink">Too many reports, try again in a few minutes.</p> : null}
            <div className="flex flex-wrap gap-3">
              <button className="btn btn-primary px-5" disabled={!what.trim() || phase === "sending"}>{phase === "sending" ? "Sending…" : "Send"}</button>
              <button type="button" className="btn px-5" onClick={() => dialog.current?.close()}>Cancel</button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
