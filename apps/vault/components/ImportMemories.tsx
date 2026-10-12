"use client";
// Import existing memories (contracts/import.md). Parsing is local (lib/import.ts); text leaves this device only when
// the owner presses Save, one sealed entry at a time through the same owner path as "Remember".
import { useEffect, useMemo, useRef, useState } from "react";
import { IMPORT_KINDS, MAX_IMPORT_BYTES, byteLength, checkFile, defaultSelection, normalize, parseImport, type ImportKind } from "@/lib/import";
import { useSession } from "./SessionProvider";

type Props = {
  /** Topics the owner can import into. */
  topics: string[];
  /** Topic selected in the dashboard. */
  initialTopic: string;
  /** Every text already in the vault, for "already saved". */
  existing: string[];
  onClose: () => void;
  /** Called after any save attempt so the dashboard reloads. */
  onSaved: () => void;
};

export function ImportMemories({ topics, initialTopic, existing, onClose, onSaved }: Props) {
  const { run } = useSession();
  const [text, setText] = useState("");
  const [topic, setTopic] = useState(topics.includes(initialTopic) ? initialTopic : (topics[0] ?? "preferences"));
  const [kind, setKind] = useState<ImportKind>("preference");
  const [fileError, setFileError] = useState<string | null>(null);
  const [ticked, setTicked] = useState<Set<string>>(new Set());
  // Normalized texts saved in this panel: never written twice, even if the text is edited or the list reloads.
  const [done, setDone] = useState<Set<string>>(new Set());
  const inFlight = useRef(false); // a ref, not state: two clicks in one frame must not both start a save
  const [saving, setSaving] = useState<{ at: number; of: number } | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const parsed = useMemo(() => parseImport(text, { kind, existing }), [text, kind, existing]);
  const candidates = parsed.candidates;

  // A different candidate list (by content, not just length) restores the default ticks. Kind and "already saved"
  // changes do not: they must not undo the owner's choices.
  const parsedKey = useMemo(() => candidates.map((c) => c.text).join("\u0000"), [candidates]);
  useEffect(() => {
    setTicked(defaultSelection(candidates));
    setResult(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parsedKey]);

  const isDone = (c: { text: string }) => done.has(normalize(c.text));
  const chosen = candidates.filter((c) => ticked.has(c.id) && !c.saved && !isDone(c));
  const tooBig = byteLength(text) > MAX_IMPORT_BYTES;

  async function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const bad = checkFile(f);
    setFileError(bad);
    if (bad) return; // nothing is read
    setText(await f.text());
  }

  function toggle(id: string) {
    setTicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    const batch = chosen;
    if (!batch.length || inFlight.current) return;
    inFlight.current = true;
    setResult(null);
    try {
      await saveBatch(batch);
    } finally {
      inFlight.current = false;
    }
  }

  async function saveBatch(batch: typeof chosen) {
    let ok = 0;
    for (const [i, c] of batch.entries()) {
      setSaving({ at: i + 1, of: batch.length });
      const r = await run((s) => s.remember(topic, { kind: c.kind, text: c.text }));
      if (!r) {
        setSaving(null);
        setResult(`Saved ${ok} of ${batch.length}. Stopped at "${c.text.slice(0, 60)}${c.text.length > 60 ? "…" : ""}". The ${batch.length - ok} remaining stay ticked; saved ones will not be written again.`);
        onSaved();
        return;
      }
      ok++;
      setDone((prev) => new Set(prev).add(normalize(c.text)));
    }
    setSaving(null);
    setResult(`Saved ${ok} ${ok === 1 ? "memory" : "memories"}`);
    onSaved();
  }

  return (
    <section aria-label="Import memories" className="paper-card mt-6 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-display text-2xl tracking-tight">Import what you already have</h3>
          <p className="mt-1 text-sm text-ink-soft">
            Paste notes, a ChatGPT or Claude memory list, or an Engram export. Nothing leaves this device until you press Save.
          </p>
        </div>
        <button type="button" className="btn btn-ghost px-3 py-1.5 text-sm" disabled={saving !== null} onClick={onClose}>Close</button>
      </div>

      <label htmlFor="import-text" className="mt-4 block font-mono text-[11px] uppercase tracking-wider text-ink-soft">Text to import</label>
      <textarea
        id="import-text"
        value={text}
        readOnly={saving !== null}
        onChange={(e) => { setFileError(null); setText(e.target.value); }}
        rows={6}
        placeholder={"- I am vegetarian\n- I work in UTC+5:30\n- I prefer short answers"}
        className="mt-2 w-full rounded-sm border border-rule bg-paper px-3 py-2 font-mono text-sm outline-none focus:border-seal"
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <input ref={fileRef} type="file" accept=".txt,.md,.json,text/plain,text/markdown,application/json" onChange={(e) => void pick(e)} className="sr-only" id="import-file" />
        <label htmlFor="import-file" className="btn btn-ghost cursor-pointer px-3 py-1.5 text-sm">Upload .txt, .md or .json</label>
        <span className="font-mono text-xs text-ink-soft">up to 200 KB</span>
      </div>
      {fileError ? <p role="alert" className="mt-2 text-sm text-danger-ink">{fileError}</p> : null}
      {tooBig || parsed.error ? <p role="alert" className="mt-2 text-sm text-danger-ink">{parsed.error ?? "That text is over 200 KB."}</p> : null}

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">Topic</span>
          <select value={topic} disabled={saving !== null} onChange={(e) => setTopic(e.target.value)} className="rounded-sm border border-rule bg-card px-2 py-1 font-mono text-sm">
            {topics.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[11px] uppercase tracking-wider text-ink-soft">Kind</span>
          <div className="flex gap-1" role="radiogroup" aria-label="Kind for imported memories">
            {IMPORT_KINDS.map((k) => (
              <button type="button" role="radio" aria-checked={kind === k} key={k} disabled={saving !== null} onClick={() => setKind(k)}
                className={`rounded-sm border px-2.5 py-1 font-mono text-xs ${kind === k ? "border-seal bg-seal-soft text-seal" : "border-rule text-ink-soft"}`}>
                {k}
              </button>
            ))}
          </div>
        </div>
        {parsed.source === "engram" ? <span className="font-mono text-xs text-ink-soft">Engram export: each memory keeps its own kind.</span> : null}
      </div>

      {!tooBig && !parsed.error && candidates.length === 0 ? <p className="mt-4 text-ink-soft">Nothing to import.</p> : null}
      {parsed.truncated ? <p role="status" className="mt-4 text-sm text-ink-soft">Showing the first {candidates.length} lines; {parsed.truncated} more were left out. Import the rest in another run.</p> : null}

      {candidates.length > 0 ? (
        <>
          <ul className="mt-4 max-h-96 space-y-2 overflow-y-auto pr-1" aria-label="Candidate memories">
            {candidates.map((c) => {
              const wrote = isDone(c);
              return (
                <li key={c.id} className={`flex items-start gap-3 rounded-sm border px-3 py-2 ${c.secret ? "border-rust/60 bg-rust-soft" : "border-rule bg-card"}`}>
                  <input
                    type="checkbox"
                    id={`imp-${c.id}`}
                    className="mt-1.5 h-5 w-5 shrink-0 accent-[#4d33cc]"
                    checked={wrote || c.saved ? false : ticked.has(c.id)}
                    disabled={wrote || c.saved || saving !== null}
                    onChange={() => toggle(c.id)}
                  />
                  <label htmlFor={`imp-${c.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="block break-words leading-snug">{c.text}</span>
                    <span className="mt-1 flex flex-wrap gap-x-3 font-mono text-xs text-ink-soft">
                      <span>{c.kind}</span>
                      {c.saved ? <span>already saved</span> : null}
                      {wrote ? <span className="text-seal">saved</span> : null}
                      {c.secret ? <span className="text-rust">Looks like a secret (key, token or recovery phrase). Not ticked; tick it only if you are sure.</span> : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-primary px-4 py-2" disabled={chosen.length === 0 || saving !== null} onClick={() => void save()}>
              {saving ? `Sealing ${saving.at} of ${saving.of}…` : `Save ${chosen.length}`}
            </button>
            <p className="text-sm text-ink-soft">
              {chosen.length > 0
                ? `No passkey prompt. Each memory is sealed as its own transaction on Monad (${chosen.length} ${chosen.length === 1 ? "transaction" : "transactions"}), so this takes a moment.`
                : "Tick the memories to keep."}
            </p>
          </div>
        </>
      ) : null}
      <p role="status" aria-live="polite" className="mt-3 text-sm">{result}</p>
    </section>
  );
}
