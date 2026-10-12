// Golden tests for contracts/import.md behavior cases 1-9 and edge cases (pure parser; the checkbox/Save wiring is covered
// by the notes at the end).
import { describe, expect, it } from "vitest";
import { buildExport, exportJson, exportMarkdown, type ExportEntry, type ExportSpace } from "../../../apps/vault/lib/export.js";
import { MAX_IMPORT_BYTES, checkFile, defaultSelection, fitsEntry, looksSecret, parseImport, splitLong } from "../../../apps/vault/lib/import.js";

const run = (text: string, existing: string[] = [], kind: "preference" | "fact" | "note" = "preference") => parseImport(text, { kind, existing });
const texts = (text: string, existing: string[] = []) => run(text, existing).candidates.map((c) => c.text);
const cp = (s: string) => Array.from(s).length;

describe("import (contracts/import.md)", () => {
  it("case 1: 3 bullet lines give 3 trimmed candidates without markers", () => {
    expect(texts("- I am vegetarian\n* I work in UTC+5:30\n  1. I prefer short answers  ")).toEqual(["I am vegetarian", "I work in UTC+5:30", "I prefer short answers"]);
  });
  it("case 2: blank lines dropped, exact duplicates collapsed", () => {
    expect(texts("a\n\n   \na\nb\n\na")).toEqual(["a", "b"]);
  });
  it("case 3: a line over 500 chars splits at sentence boundaries into <= 500-char candidates", () => {
    const sentence = "This is one sentence of moderate length that goes on a bit. ";
    const parts = texts(sentence.repeat(30));
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) {
      expect(cp(p)).toBeLessThanOrEqual(500);
      expect(p.endsWith(".")).toBe(true);
    }
  });
  it("case 4: an Engram JSON export round-trips with each entry's own kind", () => {
    const e = (seq: number, text: string, kind: string, review?: ExportEntry["review"]): ExportEntry => ({ seq: BigInt(seq), kind, text, t: 1, byOwner: true, agentId: 0n, review });
    const spaces: ExportSpace[] = [{ label: "w", complete: true, skipped: 1, entries: [e(0, "likes tea", "preference"), e(1, "born in May", "fact"), e(2, "rejected one", "note", "rejected")] }];
    const r = run(exportJson(buildExport(spaces, "0xabc")), [], "note");
    expect(r.source).toBe("engram");
    expect(r.candidates.map((c) => [c.text, c.kind])).toEqual([["likes tea", "preference"], ["born in May", "fact"]]);
  });
  it("case 4b: the Markdown export re-imports cleanly (escapes undone, exact suffix stripped, kind kept)", () => {
    const e = (seq: number, text: string, kind: string): ExportEntry => ({ seq: BigInt(seq), kind, text, t: Date.UTC(2026, 9, 13), byOwner: false, agentId: 5n });
    const hard = ["*bold* [x](y) _z_ #1 - dash", "two\nlines\n\nand a gap", "- starts with dash", "1. numbered", "ends with (parens)", "=eq"];
    const spaces: ExportSpace[] = [{ label: "w", complete: false, skipped: 2, entries: hard.map((t, i) => e(i, t, i % 2 ? "fact" : "note")) }];
    const r = run(exportMarkdown(buildExport(spaces, "0xabc")), []);
    expect(r.source).toBe("engram");
    expect(r.candidates.map((c) => c.text)).toEqual(hard);
    expect(r.candidates.map((c) => c.kind)).toEqual(hard.map((_, i) => (i % 2 ? "fact" : "note")));
  });
  it("case 5: a ChatGPT-style list gives one candidate per line", () => {
    expect(texts("Prefers concise answers\nLives in Pune\nWorks as a designer")).toHaveLength(3);
  });
  it("case 6: empty or whitespace input gives nothing and no error", () => {
    for (const t of ["", "   ", "\n\n\t\n"]) {
      const r = run(t);
      expect(r.candidates).toEqual([]);
      expect(r.error).toBeUndefined();
    }
  });
  it("case 7: file over 200 KB or wrong type is rejected before reading", () => {
    expect(checkFile({ name: "a.txt", size: MAX_IMPORT_BYTES })).toBeNull();
    expect(checkFile({ name: "a.txt", size: MAX_IMPORT_BYTES + 1 })).toMatch(/200 KB/);
    expect(checkFile({ name: "a.pdf", size: 10 })).toMatch(/Only/);
    expect(checkFile({ name: "noext", size: 10 })).toMatch(/Only/);
    expect(checkFile({ name: "A.MD", size: 10 })).toBeNull();
    expect(run("x".repeat(MAX_IMPORT_BYTES + 1)).error).toMatch(/200 KB/);
    expect(run("x".repeat(MAX_IMPORT_BYTES)).error).toBeUndefined();
    expect(run("é".repeat(MAX_IMPORT_BYTES / 2 + 1)).error).toMatch(/200 KB/); // bytes, not characters
  });
  it("case 8: only ticked candidates are chosen; defaults tick the first 25 safe ones", () => {
    const many = Array.from({ length: 30 }, (_, i) => `memory number ${i}`).join("\n");
    const c = run(many).candidates;
    expect(defaultSelection(c).size).toBe(25);
    expect(defaultSelection(c).has("c25")).toBe(false);
  });
  it("case 9: locked session never renders the dashboard, so Import cannot be reached (Dashboard returns null without a session)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../../apps/vault/components/Dashboard.tsx", import.meta.url), "utf8");
    expect(src).toMatch(/if \(!session\) return null;/);
  });

  it("edge: secret-looking lines are flagged and unticked", () => {
    const pem = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7\nabc def\n-----END PRIVATE KEY-----\nafter the key";
    const r = run(`${pem}\nsk-abc123\nSK-UPPER1\n${"abandon ".repeat(11)}about\njust a fact`).candidates;
    const by = Object.fromEntries(r.map((c) => [c.text, c.secret]));
    expect(by["MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7"]).toBe(true);
    expect(by["abc def"]).toBe(true);
    expect(by["after the key"]).toBe(false);
    expect(by["sk-abc123"]).toBe(true);
    expect(by["SK-UPPER1"]).toBe(true);
    expect(by["just a fact"]).toBe(false);
    expect(r.filter((c) => c.secret).every((c) => !defaultSelection(r).has(c.id))).toBe(true);
    expect(r.find((c) => c.text.startsWith("abandon"))!.secret).toBe(true);
  });
  it("edge: a line already in the vault is marked saved (case-insensitive) and unticked", () => {
    const r = run("Likes  TEA\nnew thing", ["likes tea"]);
    expect(r.candidates.map((c) => c.saved)).toEqual([true, false]);
    expect([...defaultSelection(r.candidates)]).toEqual(["c1"]);
  });
  it("edge: parsing is pure (no network, no eval)", async () => {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync(new URL("../../../apps/vault/lib/import.ts", import.meta.url), "utf8");
    expect(src).not.toMatch(/\b(fetch|XMLHttpRequest|sendBeacon|eval|new Function)\b/);
  });
});

describe("import: adversarial", () => {
  it("500-character boundary: 500 stays whole, 501 splits, in code points", () => {
    expect(splitLong("a".repeat(500))).toHaveLength(1);
    const parts = splitLong("a".repeat(501));
    expect(parts.length).toBe(2);
    parts.forEach((p) => expect(cp(p)).toBeLessThanOrEqual(500));
    expect(splitLong("😀".repeat(100))).toEqual(["😀".repeat(100)]);
  });
  it("500 emoji fit the character cap but not the 2048-byte entry cap: they are split so Save cannot fail halfway", () => {
    const parts = splitLong("😀".repeat(500));
    expect(parts.length).toBeGreaterThan(1);
    parts.forEach((p) => expect(fitsEntry(p)).toBe(true));
    expect(parts.join("")).toBe("😀".repeat(500));
  });
  it("control characters that JSON-escape to 6 bytes also respect the byte cap", () => {
    splitLong("\u0001".repeat(500)).forEach((p) => expect(fitsEntry(p)).toBe(true));
  });
  it("lone surrogates are replaced (the entry format rejects them)", () => {
    const r = run(JSON.stringify(["bad \ud800 text"]));
    expect(r.candidates[0]!.text).toBe("bad � text");
  });
  it("200 KB exactly is accepted, +1 byte rejected", () => {
    expect(run("a".repeat(MAX_IMPORT_BYTES)).error).toBeUndefined();
    expect(run("a".repeat(MAX_IMPORT_BYTES + 1)).error).toBeTruthy();
  });
  it("malformed JSON: plain notes if it is not an export, an error if it is a damaged export", () => {
    expect(texts("{not json at all}")).toEqual(["{not json at all}"]);
    expect(texts("[ ] buy milk")).toEqual(["buy milk"]);
    expect(run('{"version":1,"topics":[{"entries":[{"text":"a"').error).toMatch(/damaged/);
    expect(run('{"a":1}').error).toMatch(/not an Engram export/);
    expect(run("[1,2]").error).toMatch(/not an Engram export/);
  });
  it("prototype-pollution keys in JSON do nothing", () => {
    const before = ({} as Record<string, unknown>).polluted;
    const r = run('{"__proto__":{"polluted":1},"version":1,"topics":[{"__proto__":{"entries":[{"text":"x"}]},"entries":[{"text":"safe","kind":"__proto__"},{"text":"y","__proto__":{"error":"e"}}]}]}');
    expect(({} as Record<string, unknown>).polluted).toBe(before);
    expect(r.candidates.map((c) => [c.text, c.kind])).toEqual([["safe", "preference"], ["y", "preference"]]);
  });
  it("huge arrays are capped so the preview stays usable", () => {
    const r = run(JSON.stringify(Array.from({ length: 20000 }, (_, i) => `n${i}`)));
    expect(r.candidates).toHaveLength(1000);
    expect(r.truncated).toBe(19000);
    expect(defaultSelection(r.candidates).size).toBe(25);
  });
  it("deeply nested JSON does not crash", () => {
    expect(() => run("[".repeat(5000) + "]".repeat(5000))).not.toThrow();
  });
  it("secret detection: zero-width, fullwidth, embedded, numbered seed, bare key body, JWT, hex key", () => {
    for (const s of ["s​k-abcdefghijklmnop", "ｓｋ-abcdefghijklmnop", "my key is sk-abcdefghijklmnopqrstuv", "-----BEGIN OPENSSH PRIVATE KEY-----", "-----BEGIN PGP PRIVATE KEY BLOCK-----",
      "1. abandon 2. ability 3. able 4. about 5. above 6. absent 7. absorb 8. abstract 9. absurd 10. abuse 11. access 12. accident",
      "Abandon, Ability, Able, About, Above, Absent, Absorb, Abstract, Absurd, Abuse, Access, Accident",
      "MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC7", "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdef", "0x" + "ab".repeat(32), "ghp_" + "a".repeat(30)]) {
      expect(looksSecret(s), s).toBe(true);
    }
    for (const s of ["I like task-based planning", "risk-averse", "My favourite number is 42", "Meets with Sam every Friday at ten"]) expect(looksSecret(s), s).toBe(false);
  });
  it("a PEM inside one long JSON entry flags every split piece", () => {
    const text = `-----BEGIN PRIVATE KEY-----\n${"MIIEvQIBADANBgkq ".repeat(80)}\n-----END PRIVATE KEY-----`;
    const doc = JSON.stringify({ version: 1, topics: [{ label: "x", entries: [{ seq: 0, kind: "note", text }] }] });
    const r = run(doc).candidates;
    expect(r.length).toBeGreaterThan(1);
    expect(r.every((c) => c.secret)).toBe(true);
  });
  it("duplicates across casing: collapsed against the vault, kept apart within one paste (exact duplicates only)", () => {
    expect(run("Tea\ntea", ["TEA"]).candidates.map((c) => c.saved)).toEqual([true, true]);
    expect(texts("Tea\ntea")).toEqual(["Tea", "tea"]);
  });
  it("RTL, emoji, newline-in-JSON, zero-width text pass through unchanged", () => {
    const t = "‮evil‬ 🙂 zero​width";
    expect(texts(`- ${t}`)).toEqual([t]);
    expect(run(JSON.stringify(["a\nb"])).candidates.map((c) => c.text)).toEqual(["a", "b"]);
  });
  it("separator-only lines are dropped", () => {
    expect(texts("---\n***\n===\n- \nreal")).toEqual(["real"]);
  });
  it("CSV/Markdown-injection text is kept as plain text (nothing is interpreted)", () => {
    expect(texts("=HYPERLINK(\"http://x\")\n@SUM(A1)\n[a](javascript:alert(1))")).toEqual(['=HYPERLINK("http://x")', "@SUM(A1)", "[a](javascript:alert(1))"]);
  });
});

// Browser-level cases (ImportMemories.tsx), reviewed by reading rather than run, since no vault, indexer or chain is
// reachable in the review environment: Save is guarded by a ref against double clicks; saved lines are remembered by
// normalized text so a retry after a halfway failure never writes them again; ticks survive kind changes and reloads.
