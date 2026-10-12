// Golden tests for contracts/export.md behavior cases 1-6 and its edge cases (pure builders; the button, lock state and
// no-network cases are browser behavior, see the notes at the end).
import { describe, expect, it } from "vitest";
import { buildExport, entryCount, escapeMarkdown, exportFilename, exportJson, exportMarkdown, type ExportEntry, type ExportSpace } from "../../../apps/vault/lib/export.js";

const T = Date.UTC(2026, 9, 13, 12, 0, 0);
const e = (seq: number, text: string, o: Partial<ExportEntry> = {}): ExportEntry => ({ seq: BigInt(seq), kind: "fact", text, t: T, byOwner: true, agentId: 0n, ...o });
const space = (label: string, entries: ExportEntry[], o: Partial<ExportSpace> = {}): ExportSpace => ({ label, entries, complete: true, skipped: 0, ...o });
const OWNER = "0xAbCdEf0123456789aBcDeF0123456789abcdef01";

describe("export (contracts/export.md)", () => {
  it("case 1: 2 topics, 5 entries, all listed in seq order", () => {
    const doc = buildExport([space("preferences", [e(2, "b"), e(0, "a"), e(1, "c")]), space("work", [e(1, "e"), e(0, "d")])], OWNER, T);
    expect(doc.version).toBe(1);
    expect(doc.owner).toBe(OWNER);
    expect(doc.exportedAt).toBe("2026-10-13T12:00:00.000Z");
    expect(doc.topics.map((t) => t.label)).toEqual(["preferences", "work"]);
    expect(doc.topics[0]!.entries.map((x) => x.text)).toEqual(["a", "c", "b"]);
    expect(doc.topics[1]!.entries.map((x) => x.seq)).toEqual([0, 1]);
    expect(entryCount(doc)).toBe(5);
    expect(JSON.parse(exportJson(doc))).toEqual(JSON.parse(JSON.stringify(doc)));
  });

  it("case 2: empty vault gives a valid file with empty topics", () => {
    const doc = buildExport([], OWNER, T);
    expect(JSON.parse(exportJson(doc)).topics).toEqual([]);
    expect(exportMarkdown(doc)).toContain("No topics.");
    expect(entryCount(doc)).toBe(0);
  });

  it("case 3: a locked session never renders the dashboard, so no Export button exists; while loading it is disabled", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../../apps/vault/components/Dashboard.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/if \(!session\) return null;/);
    expect(src).toMatch(/disabled=\{spaces === null\}/);
  });

  it("case 4: a rejected entry is exported with review rejected", () => {
    const doc = buildExport([space("work", [e(0, "nope", { review: "rejected" }), e(1, "ok")])], OWNER, T);
    expect(doc.topics[0]!.entries[0]).toMatchObject({ text: "nope", review: "rejected" });
    expect(doc.topics[0]!.entries[1]!.review).toBeNull();
    expect(exportMarkdown(doc)).toContain("review: rejected");
  });

  it("case 5: undecryptable entries do not stop the export and are reported (count per topic: the SDK gives no seq)", () => {
    const doc = buildExport([space("work", [e(0, "fine")], { skipped: 2 }), space("health", [e(0, "also")])], OWNER, T);
    expect(doc.topics[0]!.undecryptable).toBe(2);
    expect(doc.topics[1]!.entries).toHaveLength(1);
    expect(exportMarkdown(doc)).toContain("2 entries could not be decrypted.");
  });

  it("case 6: Markdown characters are escaped in .md, JSON is exact", () => {
    const text = "*bold* _it_ [x](http://a) `c` # h <b> | t | ~s~ !img &amp; {a}";
    const doc = buildExport([space("work", [e(0, text)])], OWNER, T);
    expect(JSON.parse(exportJson(doc)).topics[0].entries[0].text).toBe(text);
    const md = exportMarkdown(doc);
    expect(md).toContain("\\*bold\\* \\_it\\_ \\[x\\]\\(http://a\\) \\`c\\` \\# h \\<b\\> \\| t \\| \\~s\\~ \\!img \\&amp; \\{a\\}");
    expect(md).not.toContain("*bold*");
  });

  it("edge: indexer lag is stated in the JSON and the Markdown", () => {
    const doc = buildExport([space("work", [e(0, "a")], { complete: false })], OWNER, T);
    expect(doc.topics[0]!.incomplete).toBe(true);
    expect(exportMarkdown(doc)).toContain("may be missing");
  });

  it("edge: a 500-character text round-trips exactly through JSON", () => {
    const text = "é".repeat(499) + "😀";
    const doc = buildExport([space("work", [e(0, text)])], OWNER, T);
    expect(JSON.parse(exportJson(doc)).topics[0].entries[0].text).toBe(text);
  });

  it("edge: filename is date-only and never holds the owner address", () => {
    expect(exportFilename("json", T)).toBe("engram-export-2026-10-13.json");
    expect(exportFilename("md", T)).toBe("engram-export-2026-10-13.md");
  });

  it("writers: you, agent:<id>, and the agent behind a vault-written proposal", () => {
    const doc = buildExport([space("w", [e(0, "a"), e(1, "b", { byOwner: false, agentId: 7n }), e(2, "c", { src: { agent: "1961" } })])], OWNER, T);
    expect(doc.topics[0]!.entries.map((x) => x.writer)).toEqual(["you", "agent:7", "agent:1961"]);
  });
});

describe("export: adversarial", () => {
  it("a time Date cannot represent does not throw (an agent can write any safe integer as t)", () => {
    const doc = buildExport([space("w", [e(0, "a", { t: Number.MAX_SAFE_INTEGER }), e(1, "b", { t: Number.NaN })])], OWNER, T);
    expect(doc.topics[0]!.entries.map((x) => x.time)).toEqual(["", ""]);
    expect(() => exportMarkdown(doc)).not.toThrow();
  });

  it("injection-looking text stays inert in Markdown: no raw heading, quote, list, setext, link or HTML", () => {
    for (const text of ["=cmd|' /C calc'!A0", "@SUM(1+1)", "+1+1", "-2+3", "# heading", "> quote", "1. one", "[a](javascript:alert(1))", "<script>x</script>", "a\n===", "a\n---", "| a | b |"]) {
      for (const line of escapeMarkdown(text).split("\n")) {
        const l = line.trim();
        expect(l).not.toMatch(/^(#|>|[-+=]|\d+[.)]\s)/);
        expect(l).not.toMatch(/(^|[^\\])[[\]()<>|]/);
      }
    }
  });

  it("newlines, RTL, emoji and zero-width characters survive JSON exactly and Markdown does not lose them", () => {
    const text = "line1\r\nline2\n\n‮evil‬ ​zw 🙂👩‍👩‍👧";
    const doc = buildExport([space("w", [e(0, text)])], OWNER, T);
    expect(JSON.parse(exportJson(doc)).topics[0].entries[0].text).toBe(text);
    const md = exportMarkdown(doc);
    for (const piece of ["line1", "line2", "‮evil‬", "​zw", "🙂👩‍👩‍👧"]) expect(md).toContain(piece);
  });

  it("a hostile topic label is escaped in the Markdown heading", () => {
    const md = exportMarkdown(buildExport([space("x\n# injected [l](u)", [])], OWNER, T));
    expect(md).not.toMatch(/^# injected/m);
  });

  it("a very large vault exports without error", () => {
    const entries = Array.from({ length: 5000 }, (_, i) => e(i, `memory ${i}`));
    const doc = buildExport([space("big", entries)], OWNER, T);
    expect(entryCount(doc)).toBe(5000);
    expect(exportMarkdown(doc).split("\n").filter((l) => l.startsWith("- ")).length).toBe(5000);
  });

  it("no network primitive in the builder or the download handler (nothing decrypted leaves the browser)", async () => {
    const { readFileSync } = await import("node:fs");
    const lib = readFileSync(new URL("../../../apps/vault/lib/export.ts", import.meta.url), "utf8");
    expect(lib).not.toMatch(/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket)\b/);
    const dash = readFileSync(new URL("../../../apps/vault/components/Dashboard.tsx", import.meta.url), "utf8");
    const fn = dash.slice(dash.indexOf("function download("), dash.indexOf("const existingTexts"));
    expect(fn.length).toBeGreaterThan(100);
    expect(fn).not.toMatch(/\b(fetch|XMLHttpRequest|sendBeacon|WebSocket)\b/);
  });
});
