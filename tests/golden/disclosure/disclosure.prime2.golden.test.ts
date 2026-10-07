// Regression cases for BUGLOG HO-3 / contracts/disclosure.md D44-D46: a primed approval never outranks the chain.
// FROZEN: add cases, never edit.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EngramOwner, createRelayHandler, inProcessRelayer, logsSource, type EngramConfig, type PolicyView } from "../../../packages/sdk/src/index.js";
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

const policy = (seq: bigint, over: Partial<PolicyView> = {}): PolicyView =>
  ({ agentId: 7n, origin: APP, labels: ["preferences"], scope: "read", exp: Date.now() + 3_600_000, active: true, seq, ...over });
const ask = (s: Awaited<ReturnType<typeof EngramOwner.fromPrf>>, origin = APP) =>
  s.disclose({ agentId: 7n, origin, query: "vegetarian", mode: "relevant", round: 0 }).then(() => "ANSWERED", (e) => (e as { code?: string }).code);

async function setup() {
  const prf = globalThis.crypto.getRandomValues(new Uint8Array(32));
  const owner = await EngramOwner.fromPrf({ config, prfOutput: prf });
  await owner.remember("preferences", { kind: "preference", text: "vegetarian" });
  const w = await owner.approve(7n, { origin: APP, labels: ["preferences"], scope: "read", expiresInSec: 3600 });
  return { prf, owner, w };
}

describe("primed approvals never outrank the chain", () => {
  it("D44 a primed seq that does not exist onchain cannot block a visible revoke", async () => {
    const { prf, owner } = await setup();
    let now = Date.now();
    const bridge = await EngramOwner.fromPrf({ config, prfOutput: prf, clock: () => now });
    bridge.primeApproval(policy(1000n));
    await owner.disapprove(7n);
    now += 5000;
    expect(await ask(bridge)).toBe("NOT_APPROVED");
  }, 60_000);

  it("D45 a primed approval that disagrees with the chain at the same seq is replaced", async () => {
    const { prf, w } = await setup();
    let now = Date.now();
    const bridge = await EngramOwner.fromPrf({ config, prfOutput: prf, clock: () => now });
    bridge.primeApproval(policy(w.seq, { origin: "https://evil.test" }));
    now += 5000;
    expect(await ask(bridge, "https://evil.test")).toBe("NOT_APPROVED");
    expect(await ask(bridge)).toBe("ANSWERED");
  }, 60_000);

  it("D46 a primed seq that does not exist onchain, with no revoke, is dropped after 30 s", async () => {
    const prf = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const owner = await EngramOwner.fromPrf({ config, prfOutput: prf });
    await owner.remember("preferences", { kind: "preference", text: "vegetarian" });
    let now = Date.now();
    const bridge = await EngramOwner.fromPrf({ config, prfOutput: prf, clock: () => now });
    bridge.primeApproval(policy(5n));
    now += 5000;
    expect(await ask(bridge)).toBe("ANSWERED"); // within the grace: could be a lagging RPC node
    now += 30_000;
    expect(await ask(bridge)).toBe("NOT_APPROVED");
  }, 60_000);
});
