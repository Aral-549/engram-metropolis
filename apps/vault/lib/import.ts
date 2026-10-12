// Pure parsing for "Import existing memories" (contracts/import.md). Runs in the browser, never executes content,
// never sends text anywhere. The dashboard decides what to save.

export const MAX_IMPORT_BYTES = 200 * 1024;
export const MAX_ENTRY_CHARS = 500;
export const DEFAULT_TICKED = 25;
export const IMPORT_KINDS = ["preference", "fact", "note"] as const;
export type ImportKind = (typeof IMPORT_KINDS)[number];

export type ImportCandidate = { id: string; text: string; kind: ImportKind; secret: boolean; saved: boolean };
/** Most candidates one run will list (a 200 KB file of one-word lines would otherwise make tens of thousands of rows). */
export const MAX_CANDIDATES = 1000;
export type ParseResult = { source: "text" | "engram"; candidates: ImportCandidate[]; error?: string; /** lines left out because of MAX_CANDIDATES */ truncated?: number };

const cpLen = (s: string) => Array.from(s).length;
/** Comparison form for "already saved" and duplicate checks. */
export const normalize = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

export function byteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Checks a chosen file before anything is read. */
export function checkFile(file: { name: string; size: number }): string | null {
  if (!/\.(txt|md|json)$/i.test(file.name)) return "Only .txt, .md and .json files can be imported.";
  if (file.size > MAX_IMPORT_BYTES) return "That file is over 200 KB. Split it and import the parts.";
  return null;
}

/** Removes list markers: "- ", "* ", "+ ", bullets, "1. ", "1) ", "[ ] ", "[x] ". */
export function stripBullet(line: string): string {
  return line.trim().replace(/^(?:(?:[-*+•–—·▪◦]|\d{1,3}[.)]|\[[ xX]\])\s+)+/, "").trim();
}

const ENC = new TextEncoder();
/**
 * True when the SDK would accept this as one entry: 1..500 code points, well-formed, and the canonical entry
 * document (`{"v":1,"t":...,"kind":"preference","text":...}`, the longest kind) within 2048 bytes. 500 emoji are
 * 500 characters but over 2048 bytes, so the character cap alone is not enough.
 */
export function fitsEntry(text: string): boolean {
  const n = cpLen(text);
  if (n < 1 || n > MAX_ENTRY_CHARS) return false;
  return ENC.encode(JSON.stringify({ v: 1, t: 9999999999999, kind: "preference", text })).length <= 2048;
}

/** Replaces lone surrogates (which the entry format rejects, and which would stop a batch halfway) with U+FFFD. */
export function wellFormed(s: string): string {
  return s.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, "\uFFFD");
}

/** Splits one over-long line into pieces the SDK accepts (<= 500 characters, <= 2048 bytes), at sentence boundaries where possible. */
export function splitLong(text: string): string[] {
  const s = wellFormed(text).trim();
  if (!s) return [];
  if (fitsEntry(s)) return [s];
  const hard = (sen: string): string[] => {
    if (fitsEntry(sen)) return [sen];
    const parts: string[] = [];
    let rest = Array.from(sen);
    while (rest.length) {
      let n = Math.min(rest.length, MAX_ENTRY_CHARS);
      while (n > 1 && !fitsEntry(rest.slice(0, n).join(""))) n--;
      let cut = n;
      if (n < rest.length) {
        for (let i = n; i > n / 2; i--) {
          if (/\s/.test(rest[i] ?? "")) {
            cut = i;
            break;
          }
        }
      }
      const piece = rest.slice(0, cut).join("").trim();
      if (piece) parts.push(piece);
      rest = rest.slice(cut);
      while (rest.length && /\s/.test(rest[0]!)) rest = rest.slice(1);
    }
    return parts;
  };
  const out: string[] = [];
  let cur = "";
  for (const sen of s.split(/(?<=[.!?\u3002])\s+/)) {
    for (const piece of hard(sen)) {
      if (!cur) cur = piece;
      else if (fitsEntry(`${cur} ${piece}`)) cur += ` ${piece}`;
      else {
        out.push(cur);
        cur = piece;
      }
    }
  }
  if (cur) out.push(cur);
  return out;
}

const PRIVATE_KEY_BEGIN = /-----BEGIN [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/;
const PRIVATE_KEY_END = /-----END [A-Z0-9 ]*PRIVATE KEY(?: BLOCK)?-----/;
const INVISIBLE = /[\u00AD\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;
/** Detection form: no zero-width or bidi controls, fullwidth letters folded (so "s\u200Bk-..." cannot slip past). */
const forDetection = (s: string) => s.normalize("NFKC").replace(INVISIBLE, "");

/** True for text that looks like a credential: key block line, `sk-` token, 12-24 word seed, raw hex key, common tokens. */
export function looksSecret(text: string): boolean {
  const t = forDetection(text).trim();
  if (PRIVATE_KEY_BEGIN.test(t) || PRIVATE_KEY_END.test(t)) return true;
  if (/^sk-/i.test(t) || /\bsk-[A-Za-z0-9_-]{16,}/i.test(t)) return true;
  if (/\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{10,}/i.test(t)) return true;
  if (/\b(?:0x)?[0-9a-fA-F]{64}\b/.test(t)) return true;
  if (/\bAKIA[0-9A-Z]{16}\b/.test(t) || /\bgh[pousr]_[A-Za-z0-9]{20,}/.test(t) || /\bxox[abprs]-[A-Za-z0-9-]{10,}/.test(t)) return true;
  if (/\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/.test(t)) return true; // JWT
  if (/^[A-Za-z0-9+/=_-]{40,}$/.test(t)) return true; // one long unbroken token: key body, API key
  const words = t.split(/[\s,;]+/).filter((w) => !/^\d{1,2}[.):]?$/.test(w)); // seed phrases are often numbered or comma-separated
  if ([12, 15, 18, 21, 24].includes(words.length) && words.every((w) => /^[a-z]{3,8}$/i.test(w))) return true;
  return false;
}

type RawLine = { text: string; secret: boolean; kind?: ImportKind };

const SEPARATOR_ONLY = /^[-*_=~#>.|\s]+$/;

function textLines(text: string): RawLine[] {
  const out: RawLine[] = [];
  let inKey = false;
  for (const raw of text.split(/\r\n?|\n/)) {
    const s = stripBullet(raw);
    if (!s || SEPARATOR_ONLY.test(s)) continue;
    const d = forDetection(s);
    if (PRIVATE_KEY_BEGIN.test(d)) inKey = true;
    out.push({ text: s, secret: inKey || looksSecret(s) });
    if (PRIVATE_KEY_END.test(d)) inKey = false;
  }
  return out;
}

// --- Engram Markdown export (lib/export.ts): "- <escaped text> _(<kind>, <writer>, <date>[, review: x])_" ---
const MD_HEADER = /^#\s+Engram export\s*$/;
const MD_SUFFIX = /\s_\(((?:\\.|[^()\\])*)\)_\s*$/;
const unescapeMd = (s: string) => s.replace(/\\([\\`*_{}[\]()<>#~|!&+\-.=])/g, "$1");

function isEngramMarkdown(text: string): boolean {
  const first = text.split(/\r\n?|\n/).find((l) => l.trim());
  return !!first && MD_HEADER.test(first);
}

/** Reads the bullets of an Engram Markdown export back: undoes the escaping and strips the exact metadata suffix. */
function markdownLines(text: string, fallback: ImportKind): RawLine[] {
  const out: RawLine[] = [];
  let cur: string[] | null = null;
  const flush = () => {
    if (!cur) return;
    let body = cur.map((l, i) => (i < cur!.length - 1 ? l.replace(/ {2}$/, "") : l)).join("\n");
    cur = null;
    let kind: ImportKind = fallback;
    let rejected = false;
    const m = MD_SUFFIX.exec(body);
    if (m) {
      body = body.slice(0, m.index);
      const meta = unescapeMd(m[1]!).split(", ");
      kind = asKind(meta[0], fallback);
      rejected = meta.includes("review: rejected");
    }
    const t = unescapeMd(body).trim();
    if (t && !rejected) out.push({ text: t, secret: looksSecret(t), kind });
  };
  for (const line of text.split(/\r\n?|\n/)) {
    if (line.startsWith("- ")) {
      flush();
      cur = [line.slice(2)];
    } else if (cur && line.startsWith("  ")) cur.push(line.slice(2));
    else flush();
  }
  flush();
  return out;
}

const asKind = (k: unknown, fallback: ImportKind): ImportKind => ((IMPORT_KINDS as readonly string[]).includes(k as string) ? (k as ImportKind) : fallback);

/** Entries of an Engram export (contracts/export.md); errors and rejected entries are skipped. Null if not one. */
function engramLines(doc: unknown, fallback: ImportKind): RawLine[] | null {
  if (!doc || typeof doc !== "object") return null;
  const d = doc as { version?: unknown; topics?: unknown };
  if (d.version !== 1 || !Array.isArray(d.topics)) return null;
  const out: RawLine[] = [];
  for (const t of d.topics) {
    const entries = (t as { entries?: unknown } | null)?.entries;
    if (!Array.isArray(entries)) continue;
    for (const e of entries) {
      const x = e as { text?: unknown; kind?: unknown; error?: unknown; review?: unknown } | null;
      if (!x || typeof x.text !== "string" || x.error !== undefined || x.review === "rejected") continue;
      const text = x.text.trim();
      if (text) out.push({ text, secret: looksSecret(text), kind: asKind(x.kind, fallback) });
    }
  }
  return out;
}

/**
 * Turns pasted or uploaded text into import candidates. `existing` are the texts already in the vault; `kind` is the
 * kind chosen for the run (an Engram export keeps each entry's own kind).
 */
export function parseImport(input: string, opts: { kind: ImportKind; existing?: Iterable<string> }): ParseResult {
  if (byteLength(input) > MAX_IMPORT_BYTES) return { source: "text", candidates: [], error: "That text is over 200 KB. Split it and import the parts." };
  const trimmed = input.trim();
  if (!trimmed) return { source: "text", candidates: [] };

  let source: ParseResult["source"] = "text";
  let lines: RawLine[] | null = null;
  if (isEngramMarkdown(trimmed)) {
    source = "engram";
    lines = markdownLines(trimmed, opts.kind);
  } else if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let doc: unknown;
    try {
      doc = JSON.parse(trimmed);
    } catch {
      doc = undefined;
      // A cut-off Engram export must not turn into junk lines like `"text": "...",`.
      if (/"version"\s*:/.test(trimmed) && /"topics"\s*:/.test(trimmed)) {
        return { source: "text", candidates: [], error: "This looks like an Engram export but the file is damaged (it is not valid JSON)." };
      }
      // otherwise not JSON after all: treat it as plain notes
    }
    if (doc !== undefined) {
      const eng = engramLines(doc, opts.kind);
      if (eng) {
        source = "engram";
        lines = eng;
      } else if (Array.isArray(doc) && doc.every((x) => typeof x === "string")) {
        lines = (doc as string[]).flatMap((s) => textLines(s));
      } else {
        return { source: "text", candidates: [], error: "This JSON is not an Engram export. Paste the notes as plain text instead." };
      }
    }
  }
  lines ??= textLines(trimmed);

  const have = new Set<string>();
  for (const e of opts.existing ?? []) have.add(normalize(e));
  const seen = new Set<string>();
  const candidates: ImportCandidate[] = [];
  let truncated = 0;
  for (const line of lines) {
    for (const piece of splitLong(line.text)) {
      if (seen.has(piece)) continue;
      if (candidates.length >= MAX_CANDIDATES) {
        truncated++;
        continue;
      }
      seen.add(piece);
      candidates.push({
        id: `c${candidates.length}`,
        text: piece,
        kind: line.kind ?? opts.kind,
        secret: line.secret || looksSecret(piece),
        saved: have.has(normalize(piece)),
      });
    }
  }
  return { source, candidates, ...(truncated ? { truncated } : {}) };
}

/** Initial ticks: the first 25 candidates that are neither secret-looking nor already saved. */
export function defaultSelection(candidates: ImportCandidate[]): Set<string> {
  const ids = candidates.filter((c) => !c.secret && !c.saved).slice(0, DEFAULT_TICKED).map((c) => c.id);
  return new Set(ids);
}
