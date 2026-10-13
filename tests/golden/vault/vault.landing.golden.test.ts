// Regression cases for BUGLOG LD-1 (landing agent cards must show the live agent ids). FROZEN: add cases, never edit.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const src = readFileSync(new URL("../../../apps/vault/components/landing/agent-cards.tsx", import.meta.url), "utf8");

describe("landing agent cards regressions", () => {
  it("LD-1 Sage is #2068 and Wayfarer is #2069", () => {
    expect(src).toContain("ERC-8004 #2068");
    expect(src).toContain("ERC-8004 #2069");
  });
  it("LD-1 the old hacksprint ids 1965 and 1966 never appear", () => {
    expect(src).not.toMatch(/1965|1966/);
  });
});
