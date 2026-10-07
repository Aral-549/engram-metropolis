// Golden cases for contracts/simple-flow.md C21b (the handoff carries the approval; BUGLOG HO-2).
// Written from the spec before the implementation. FROZEN: add cases, never edit.
import { describe, expect, it } from "vitest";
import { HANDOFF_TYPE, acceptHandoff } from "../../../apps/vault/lib/handoff.js";

const VAULT = "https://vault.test";
const policy = { agentId: 7n, origin: "https://sage.test", labels: ["preferences"], scope: "read", exp: 1e15, active: true, seq: 3n };
const base = { type: HANDOFF_TYPE, v: 1, agentId: "7", prf: new Uint8Array(32), credentialId: "c" };

describe("handoff with the approval", () => {
  it("C21b the approval comes through with the session", () => {
    const h = acceptHandoff({ origin: VAULT, data: { ...base, policy } }, { vaultOrigin: VAULT, agentId: 7n });
    expect(h?.policy).toMatchObject({ agentId: 7n, seq: 3n, origin: "https://sage.test" });
  });

  it("C21b without an approval the handoff still works (policy undefined)", () => {
    const h = acceptHandoff({ origin: VAULT, data: base }, { vaultOrigin: VAULT, agentId: 7n });
    expect(h).not.toBeNull();
    expect(h!.policy).toBeUndefined();
  });

  it("C21b a malformed approval, or one for another agent, makes the whole message ignored", () => {
    for (const p of ["x", 5, null, { ...policy, agentId: 8n }, { ...policy, agentId: "7" }, { ...policy, seq: "3" }]) {
      expect(acceptHandoff({ origin: VAULT, data: { ...base, policy: p } }, { vaultOrigin: VAULT, agentId: 7n })).toBeNull();
    }
  });
});
