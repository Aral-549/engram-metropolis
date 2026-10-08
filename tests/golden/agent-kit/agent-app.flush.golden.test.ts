// Regression case for BUGLOG FL-2 / contracts/simple-flow.md C5b: waiting memories are retried until the strip can
// take them, never sent twice, and given up on (kept) after the last try. Written before the implementation.
// FROZEN: add cases, never edit.
import { describe, expect, it } from "vitest";
import { FLUSH_DELAYS_MS, flushWithRetry } from "../../../apps/agent/lib/flush.js";

describe("FL-2 waiting memories after connecting", () => {
  it("C5b retries while the strip is still locked, then sends each item once", async () => {
    let list = ["vegetarian", "allergic to peanuts"];
    const sent: string[] = [];
    const unlockedAfter = 3; // the first 3 attempts find the strip locked
    let calls = 0;
    const waits: number[] = [];
    const ok = await flushWithRetry({
      take: () => list,
      propose: async (t) => { if (++calls <= unlockedAfter) throw Object.assign(new Error("locked"), { code: "VAULT_LOCKED" }); sent.push(t); },
      drop: (t) => { list = list.filter((x) => x !== t); },
      sleep: async (ms) => void waits.push(ms),
    });
    expect(ok).toBe(true);
    expect(sent).toEqual(["vegetarian", "allergic to peanuts"]);
    expect(list).toEqual([]);
    expect(waits).toEqual([2000, 3000, 5000]);
    expect(FLUSH_DELAYS_MS).toEqual([2000, 3000, 5000, 8000, 13000]);
  });

  it("C5b stops when memory is turned off, and gives up (keeping the items) after the last try", async () => {
    let active = true;
    let list = ["a"];
    const r1 = await flushWithRetry({ take: () => list, propose: async () => { active = false; throw new Error("locked"); }, drop: () => {}, isActive: () => active, sleep: async () => {} });
    expect(r1).toBe(false);
    let n = 0;
    const r2 = await flushWithRetry({ take: () => list, propose: async () => { n++; throw new Error("locked"); }, drop: () => { list = []; }, sleep: async () => {} });
    expect(r2).toBe(false);
    expect(n).toBe(6);
    expect(list).toEqual(["a"]);
  });
});
