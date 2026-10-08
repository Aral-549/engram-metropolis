// Golden tests for contracts/ui.md U32, U33 (BUGLOG MD-1): the reply formatting subset, parsed to plain data the
// page renders as React elements (never HTML). Written from the spec before the implementation. FROZEN: add, never edit.
import { describe, expect, it } from "vitest";
import { parseReply } from "../../../apps/agent/lib/markdown.js";

describe("reply formatting", () => {
  it("U32 bold, italic, code, headings, lists and dividers", () => {
    const b = parseReply("### Plan\n**Monday:** risotto with *garlic* bread\n\n- one\n- **two**\n\n1. first\n2. second\n\n---\nUse `pnpm`.");
    expect(b).toEqual([
      { type: "h", inl: [{ t: "text", v: "Plan" }] },
      { type: "p", lines: [[{ t: "b", v: "Monday:" }, { t: "text", v: " risotto with " }, { t: "i", v: "garlic" }, { t: "text", v: " bread" }]] },
      { type: "ul", items: [[{ t: "text", v: "one" }], [{ t: "b", v: "two" }]] },
      { type: "ol", items: [[{ t: "text", v: "first" }], [{ t: "text", v: "second" }]] },
      { type: "hr" },
      { type: "p", lines: [[{ t: "text", v: "Use " }, { t: "code", v: "pnpm" }, { t: "text", v: "." }]] },
    ]);
  });

  it("U32 '* item' bullets and single line breaks inside a paragraph", () => {
    expect(parseReply("* a\n* b")).toEqual([{ type: "ul", items: [[{ t: "text", v: "a" }], [{ t: "text", v: "b" }]] }]);
    expect(parseReply("line one\nline two")).toEqual([{ type: "p", lines: [[{ t: "text", v: "line one" }], [{ t: "text", v: "line two" }]] }]);
  });

  it("U33 markup and links stay plain text", () => {
    const b = parseReply('<script>alert(1)</script> <img src=x onerror=alert(1)> [click](javascript:alert(1))');
    const flat = JSON.stringify(b);
    expect(b).toHaveLength(1);
    expect(flat).toContain("<script>alert(1)</script>");
    expect(flat).toContain("[click](javascript:alert(1))");
    expect(flat).not.toMatch(/"t":"(link|html|a)"/);
  });

  it("unclosed markers are kept as text, never swallowing the rest", () => {
    expect(parseReply("2 * 3 = 6 and **almost")).toEqual([{ type: "p", lines: [[{ t: "text", v: "2 * 3 = 6 and **almost" }]] }]);
  });
});
