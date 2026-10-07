// Adversarial probes for primeApproval (BUGLOG HO-2 fix, disclosure.md D39-D43). Goal: break it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EngramOwner, createRelayHandler, inProcessRelayer, logsSource, type EngramConfig } from "../../../packages/sdk/src/index.js";
import { startLocalChain, type LocalChain } from "../../support/anvil.js";

let chain: LocalChain;
let config: EngramConfig;
const APP = "https://sage.test";
beforeAll(async () => {
  chain = await startLocalChain();
  const handler = createRelayHandler({ config: { chainId: 31337, registry: chain.registry, identityRegistry: chain.identityRegistry, rpcUrl: chain.rpcUrl }, wallet: chain.wallet(1) });
  config = { chainId: 31337, registry: chain.registry, identityRegistry: chain.identityRegistry, rpcUrl: chain.rpcUrl, source: logsSource({ rpcUrl: chain.rpcUrl, registry: chain.registry, fromBlock: 0n }), relayer: inProcessRelayer(handler) };
});
afterAll(() => chain?.stop());

describe("primeApproval, adversarial", () => {
  it("a primed approval with a seq that never existed onchain cannot block a real revoke", async () => {
    const prf = globalThis.crypto.getRandomValues(new Uint8Array(32));
    let now = Date.now();
    const owner = await EngramOwner.fromPrf({ config, prfOutput: prf });
    await owner.remember("preferences", { kind: "preference", text: "vegetarian" });
    await owner.approve(7n, { origin: APP, labels: ["preferences"], scope: "read", expiresInSec: 3600 });
    const bridge = await EngramOwner.fromPrf({ config, prfOutput: prf, clock: () => now });
    bridge.primeApproval({ agentId: 7n, origin: APP, labels: ["preferences"], scope: "read", exp: Date.now() + 3_600_000, active: true, seq: 1000n });
    await owner.disapprove(7n);
    now += 5000;
    const r = await bridge.disclose({ agentId: 7n, origin: APP, query: "vegetarian", mode: "relevant", round: 0 }).then(() => "ANSWERED", (e) => (e as { code?: string }).code);
    expect(r).toBe("NOT_APPROVED");
  }, 60_000);

  it("a primed approval that disagrees with the onchain entry at the same seq is replaced by the chain", async () => {
    const prf = globalThis.crypto.getRandomValues(new Uint8Array(32));
    let now = Date.now();
    const owner = await EngramOwner.fromPrf({ config, prfOutput: prf });
    await owner.remember("preferences", { kind: "preference", text: "vegetarian" });
    const w = await owner.approve(7n, { origin: APP, labels: ["preferences"], scope: "read", expiresInSec: 3600 });
    const bridge = await EngramOwner.fromPrf({ config, prfOutput: prf, clock: () => now });
    // same seq, but claims a different origin
    bridge.primeApproval({ agentId: 7n, origin: "https://evil.test", labels: ["preferences"], scope: "read", exp: Date.now() + 3_600_000, active: true, seq: w.seq });
    now += 5000;
    const r = await bridge.disclose({ agentId: 7n, origin: "https://evil.test", query: "vegetarian", mode: "relevant", round: 0 }).then(() => "ANSWERED", (e) => (e as { code?: string }).code);
    expect(r).toBe("NOT_APPROVED");
  }, 60_000);
});
