// Golden tests for contracts/apps.md A45-A47 (BUGLOG HG-1): a silent strip costs at most one 5 s wait per reply.
// Written from the spec before the implementation. FROZEN: add cases, never edit.
import { describe, expect, it } from "vitest";
import { BRIDGE_TIMEOUT_MS, STUCK_NOTICE, turnGuard } from "../../../apps/agent/lib/vault-turn.js";

const timeout = () => Object.assign(new Error("the vault did not answer in time"), { code: "BRIDGE_TIMEOUT" });

describe("HG-1 one wait per reply", () => {
  it("A45 the page waits 5 s for the strip", () => {
    expect(BRIDGE_TIMEOUT_MS).toBe(5000);
  });

  it("A46 after one timeout, later vault calls in the same reply fail at once without calling the strip", async () => {
    const g = turnGuard();
    let calls = 0;
    await expect(g.run(async () => { calls++; throw timeout(); })).rejects.toMatchObject({ code: "BRIDGE_TIMEOUT" });
    expect(g.stuck).toBe(true);
    await expect(g.run(async () => { calls++; return 1; })).rejects.toMatchObject({ code: "VAULT_UNAVAILABLE" });
    expect(calls).toBe(1);
  });

  it("A46 other errors (locked, not approved) do not trip the guard", async () => {
    const g = turnGuard();
    await expect(g.run(async () => { throw Object.assign(new Error("x"), { code: "VAULT_LOCKED" }); })).rejects.toMatchObject({ code: "VAULT_LOCKED" });
    expect(g.stuck).toBe(false);
    expect(await g.run(async () => 7)).toBe(7);
  });

  it("A47 the notice tells the user how to reconnect", () => {
    expect(STUCK_NOTICE).toBe("Your vault isn't answering this app. Press Turn on memory to reconnect.");
  });
});
