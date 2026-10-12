// Pure builders for the "Export my memories" files (contracts/export.md). No I/O, no network: the dashboard hands in
// what it already decrypted and gets file contents back.

export type ExportEntry = {
  seq: bigint;
  kind: string;
  text: string;
  t: number;
  byOwner: boolean;
  agentId: bigint;
  src?: { agent: string };
  review?: "pending" | "confirmed" | "rejected" | "auto";
};
export type ExportSpace = { label: string; entries: ExportEntry[]; complete: boolean; skipped: number };

export type ExportedEntry = { seq: number; kind: string; text: string; writer: string; time: string; review: string | null };
export type ExportedTopic = { label: string; entries: ExportedEntry[]; undecryptable: number; incomplete: boolean };
export type ExportDoc = { version: 1; exportedAt: string; owner: string; topics: ExportedTopic[] };

/** "you" for the owner's own writes, "agent:<id>" for an agent's (or the agent a vault-written proposal came from). */
export function writerOf(e: Pick<ExportEntry, "byOwner" | "agentId" | "src">): string {
  if (e.src) return `agent:${e.src.agent}`;
  return e.byOwner ? "you" : `agent:${e.agentId.toString()}`;
}

/** "" for a time Date cannot represent (an agent can write any safe integer); one bad entry must not stop the export. */
const isoTime = (t: number): string => {
  try {
    return Number.isFinite(t) ? new Date(t).toISOString() : "";
  } catch {
    return "";
  }
};

export function buildExport(spaces: ExportSpace[], owner: string, now: number = Date.now()): ExportDoc {
  return {
    version: 1,
    exportedAt: new Date(now).toISOString(),
    owner,
    topics: spaces.map((s) => ({
      label: s.label,
      entries: [...s.entries]
        .sort((a, b) => (a.seq < b.seq ? -1 : a.seq > b.seq ? 1 : 0))
        .map((e) => ({ seq: Number(e.seq), kind: e.kind, text: e.text, writer: writerOf(e), time: isoTime(e.t), review: e.review ?? null })),
      undecryptable: s.skipped,
      incomplete: !s.complete,
    })),
  };
}

export function exportJson(doc: ExportDoc): string {
  return `${JSON.stringify(doc, null, 2)}\n`;
}

/** Escapes text so Markdown shows it literally (the JSON file is the exact copy). Newlines become hard line breaks. */
export function escapeMarkdown(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) =>
      line
        .replace(/[\\`*_{}[\]()<>#~|!&]/g, "\\$&")
        .replace(/^(\s*)([-+=])/, "$1\\$2")
        .replace(/^(\s*\d+)([.)])/, "$1\\$2"),
    )
    .join("  \n  ");
}

export function exportMarkdown(doc: ExportDoc): string {
  const out: string[] = ["# Engram export", "", `Exported ${doc.exportedAt}`, ""];
  if (!doc.topics.length) out.push("No topics.", "");
  for (const t of doc.topics) {
    out.push(`## ${escapeMarkdown(t.label)}`, "");
    if (!t.entries.length) out.push("No memories in this topic.", "");
    for (const e of t.entries) {
      const meta = [e.kind, e.writer, e.time.slice(0, 10), ...(e.review && e.review !== "confirmed" ? [`review: ${e.review}`] : [])].filter(Boolean);
      out.push(`- ${escapeMarkdown(e.text)} _(${escapeMarkdown(meta.join(", "))})_`);
    }
    if (t.entries.length) out.push("");
    if (t.undecryptable) out.push(`${t.undecryptable} entries could not be decrypted.`, "");
    if (t.incomplete) out.push("Some recent entries had not reached the indexer and may be missing.", "");
  }
  return `${out.join("\n").trimEnd()}\n`;
}

/** engram-export-YYYY-MM-DD.<ext>. Never contains the owner address. */
export function exportFilename(ext: "json" | "md", now: number = Date.now()): string {
  return `engram-export-${new Date(now).toISOString().slice(0, 10)}.${ext}`;
}

export function entryCount(doc: ExportDoc): number {
  return doc.topics.reduce((n, t) => n + t.entries.length, 0);
}
