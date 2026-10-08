// Golden tests for contracts/mcp.md "Components": the /link page names the MCP client with a friendly, tool-neutral
// label derived from its `initialize` name. Client names were read from the installed tools on 2026-10-09
// (Codex 0.157.1: "codex-mcp-client", Gemini CLI: "gemini-cli-mcp-client"). FROZEN: add cases, never edit.
import { describe, expect, it } from "vitest";
import { clientLabel } from "../../../apps/vault/lib/link.js";

describe("clientLabel", () => {
  it("L1 known clients get their product names", () => {
    expect(clientLabel("claude-code")).toBe("Claude Code");
    expect(clientLabel("claude-ai")).toBe("Claude Desktop");
    expect(clientLabel("codex-mcp-client")).toBe("Codex");
    expect(clientLabel("gemini-cli-mcp-client")).toBe("Gemini CLI");
    expect(clientLabel("cursor-vscode")).toBe("Cursor");
  });

  it("L2 matching ignores case and surrounding spaces", () => {
    expect(clientLabel("  Claude-Code ")).toBe("Claude Code");
    expect(clientLabel("CODEX")).toBe("Codex");
  });

  it("L3 no name, 'unknown', or not a string -> 'your AI tool'", () => {
    for (const raw of ["", "   ", "unknown", "Unknown", undefined, null, 42, {}, ["claude-code"]]) {
      expect(clientLabel(raw)).toBe("your AI tool");
    }
  });

  it("L4 any other name is shown as sent, cut to 40 characters (by code point, never splitting one)", () => {
    expect(clientLabel("zed")).toBe("zed");
    expect(clientLabel("x".repeat(64))).toBe("x".repeat(40));
    const astral = "\u{1D400}".repeat(50); // 2 UTF-16 units each
    expect([...clientLabel(astral)]).toHaveLength(40);
  });

  it("L5 markup in a hostile client name stays text (React renders it escaped; nothing is interpreted here)", () => {
    expect(clientLabel("<img src=x onerror=alert(1)>")).toBe("<img src=x onerror=alert(1)>");
  });
});
