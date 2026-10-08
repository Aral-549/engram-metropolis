// The small formatting subset agent replies use (contracts/ui.md U32, U33; BUGLOG MD-1), parsed to plain data that
// the page renders as React elements. There is no HTML and no link type: markup and links always stay text.
export type Inline = { t: "text" | "b" | "i" | "code"; v: string };
export type Block =
  | { type: "p"; lines: Inline[][] }
  | { type: "h"; inl: Inline[] }
  | { type: "ul" | "ol"; items: Inline[][] }
  | { type: "hr" };

const INLINE = /\*\*([^*\n]+?)\*\*|`([^`\n]+?)`|\*([^*\s][^*\n]*?)\*/g;

export function parseInline(s: string): Inline[] {
  const out: Inline[] = [];
  const text = (v: string) => {
    if (!v) return;
    const last = out[out.length - 1];
    if (last && last.t === "text") last.v += v;
    else out.push({ t: "text", v });
  };
  let at = 0;
  for (const m of s.matchAll(INLINE)) {
    text(s.slice(at, m.index));
    if (m[1] !== undefined) out.push({ t: "b", v: m[1] });
    else if (m[2] !== undefined) out.push({ t: "code", v: m[2] });
    else out.push({ t: "i", v: m[3]! });
    at = m.index! + m[0].length;
  }
  text(s.slice(at));
  return out;
}

export function parseReply(src: string): Block[] {
  const blocks: Block[] = [];
  let cur: Block | null = null;
  const flush = () => {
    if (cur) blocks.push(cur);
    cur = null;
  };
  for (const raw of src.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
      continue;
    }
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^\s{0,3}#{1,6}\s+(.*)$/))) {
      flush();
      blocks.push({ type: "h", inl: parseInline(m[1]!.trim()) });
    } else if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) {
      flush();
      blocks.push({ type: "hr" });
    } else if ((m = line.match(/^\s*[-*+]\s+(.*)$/))) {
      if (cur?.type !== "ul") {
        flush();
        cur = { type: "ul", items: [] };
      }
      (cur as { items: Inline[][] }).items.push(parseInline(m[1]!));
    } else if ((m = line.match(/^\s*\d{1,3}[.)]\s+(.*)$/))) {
      if (cur?.type !== "ol") {
        flush();
        cur = { type: "ol", items: [] };
      }
      (cur as { items: Inline[][] }).items.push(parseInline(m[1]!));
    } else {
      if (cur?.type !== "p") {
        flush();
        cur = { type: "p", lines: [] };
      }
      (cur as { lines: Inline[][] }).lines.push(parseInline(line.trim()));
    }
  }
  flush();
  return blocks;
}
