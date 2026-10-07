// Regression cases for BUGLOG HO-1 (contracts/simple-flow.md C21). FROZEN: add cases, never edit.
import { describe, expect, it } from "vitest";
import { HANDOFF_TYPE, acceptHandoff } from "../../../apps/vault/lib/handoff.js";

describe("handoff regressions", () => {
  it("HO-1 fields inherited from a prototype are not accepted", () => {
    const data = Object.assign(Object.create({ type: HANDOFF_TYPE, v: 1 }), { agentId: "7", prf: new Uint8Array(32), credentialId: "c" });
    expect(acceptHandoff({ origin: "https://vault.test", data }, { vaultOrigin: "https://vault.test", agentId: 7n })).toBeNull();
    const own = { type: HANDOFF_TYPE, v: 1, agentId: "7", prf: new Uint8Array(32), credentialId: "c" };
    expect(acceptHandoff({ origin: "https://vault.test", data: own }, { vaultOrigin: "https://vault.test", agentId: 7n })).not.toBeNull();
  });
});
