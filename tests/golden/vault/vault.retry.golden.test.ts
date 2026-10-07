// Golden tests for contracts/simple-flow.md C18 (amended): approval retries network failures, never user or rule
// errors. Fake delays. Written from the spec before the implementation. FROZEN: add cases, never edit.
import { describe, expect, it } from "vitest";
import { EngramError } from "../../../packages/sdk/src/index.js";
import { RETRY_DELAYS_MS, isRetryable, withRetry } from "../../../apps/vault/lib/retry.js";

const noWait = async () => {};

describe("approval retries (C18)", () => {
  it("retries network failures with 1, 2, 4, 8, 16 s delays, then succeeds", async () => {
    const waits: number[] = [];
    const seen: number[] = [];
    let n = 0;
    const r = await withRetry(async () => {
      if (++n < 4) throw new EngramError("RELAYER_UNAVAILABLE", "down");
      return "ok";
    }, { sleep: async (ms) => void waits.push(ms), onRetry: (attempt) => seen.push(attempt) });
    expect(r).toBe("ok");
    expect(waits).toEqual([1000, 2000, 4000]);
    expect(seen).toEqual([1, 2, 3]);
    expect(RETRY_DELAYS_MS).toEqual([1000, 2000, 4000, 8000, 16000]);
  });

  it("gives up after 5 retries and rethrows the last error", async () => {
    let n = 0;
    await expect(withRetry(async () => { n++; throw new EngramError("SOURCE_UNAVAILABLE", "down"); }, { sleep: noWait })).rejects.toMatchObject({ code: "SOURCE_UNAVAILABLE" });
    expect(n).toBe(6);
  });

  it("never retries passkey, input, rule or chain errors", async () => {
    for (const code of ["PASSKEY_CANCELLED", "REAUTH_MISMATCH", "INPUT_INVALID", "RELAY_REJECTED", "TX_REVERTED", "RATE_LIMITED", "SESSION_EXPIRED"] as const) {
      let n = 0;
      await expect(withRetry(async () => { n++; throw new EngramError(code, "x"); }, { sleep: noWait })).rejects.toMatchObject({ code });
      expect(n).toBe(1);
    }
  });

  it("treats non-Engram errors (a failed fetch) as network trouble", () => {
    expect(isRetryable(new TypeError("Failed to fetch"))).toBe(true);
    expect(isRetryable(new EngramError("RELAYER_UNAVAILABLE", "x"))).toBe(true);
    expect(isRetryable(new EngramError("USER_CANCELLED", "x"))).toBe(false);
  });
});
