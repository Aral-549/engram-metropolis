// Regression case for BUGLOG FL-3 / contracts/simple-flow.md C46: a refused resume tells the user where to go next.
// FROZEN: add cases, never edit.
import { describe, expect, it } from "vitest";
import { resumeMessage } from "../../../apps/vault/lib/resume.js";

describe("FL-3 refused resume points to Reconnect", () => {
  it("C46 not approved or expired: the message names the Reconnect button under the vault strip", () => {
    for (const reason of ["NOT_APPROVED", "EXPIRED"] as const) {
      const m = resumeMessage({ ok: false, reason })!;
      expect(m).toMatch(/Reconnect/);
      expect(m).toMatch(/under the vault strip/);
    }
  });
});
