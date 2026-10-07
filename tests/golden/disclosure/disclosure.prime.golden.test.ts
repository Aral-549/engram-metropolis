// Golden tests for BUGLOG HO-2 / contracts/disclosure.md D39-D43: the bridge answers from the approval the
// connect popup just wrote, without waiting for the indexer, and revokes stay authoritative.
// Written from the spec before the implementation. FROZEN: add cases, never edit.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { toHex, type Hex } from "viem";
import { deriveNamespaceId } from "../../../packages/crypto/src/index.js";
import { EngramOwner, createRelayHandler, inProcessRelayer, logsSource, type EngramConfig, type MemorySource, type PolicyView } from "../../../packages/sdk/src/index.js";
import { startLocalChain, type LocalChain } from "../../support/anvil.js";

let chain: LocalChain;
let config: EngramConfig;
const APP = "https://sage.test";
const AGENT = 7n;

beforeAll(async () => {
  chain = await startLocalChain();
  const handler = createRelayHandler({ config: { chainId: 31337, registry: chain.registry, identityRegistry: chain.identityRegistry, rpcUrl: chain.rpcUrl }, wallet: chain.wallet(1) });
  config = {
    chainId: 31337, registry: chain.registry, identityRegistry: chain.identityRegistry, rpcUrl: chain.rpcUrl,
    source: logsSource({ rpcUrl: chain.rpcUrl, registry: chain.registry, fromBlock: 0n }), relayer: inProcessRelayer(handler),
  };
});
afterAll(() => chain?.stop());

/** A source that trails the chain for one owner's approvals: it shows no policy entry at or after `from`. */
function laggingPolicies(prf: Uint8Array) {
  const policyNs = toHex(deriveNamespaceId(prf, "engram-policy")).toLowerCase() as Hex;
  const lag = { from: undefined as bigint | undefined };
  const source: MemorySource = {
    ...config.source,
    entries: async (q) => {
      const all = await config.source.entries(q);
      return q.nsId.toLowerCase() === policyNs && lag.from !== undefined ? all.filter((e) => e.seq < lag.from!) : all;
    },
  };
  return { source, lag };
}
const ask = (s: Awaited<ReturnType<typeof EngramOwner.fromPrf>>, query = "diet vegetarian") =>
  s.disclose({ agentId: AGENT, origin: APP, query, mode: "relevant", round: 0 }).then(
    (r) => r.entries.map((e) => e.text),
    (e) => (e as { code?: string }).code ?? "THROWN",
  );
const policyOf = (seq: bigint, over: Partial<PolicyView> = {}): PolicyView =>
  ({ agentId: AGENT, origin: APP, labels: ["preferences"], scope: "read", exp: Date.now() + 3_600_000, active: true, seq, ...over });

describe("bridge primed with the popup's approval", () => {
  it("D39 answers at once although the indexer has not seen the approval", async () => {
    const prf = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const { source, lag } = laggingPolicies(prf);
    const popup = await EngramOwner.fromPrf({ config, prfOutput: prf });
    await popup.remember("preferences", { kind: "preference", text: "vegetarian" });
    const w = await popup.approve(AGENT, { origin: APP, labels: ["preferences"], scope: "read", expiresInSec: 3600 });
    expect(typeof w.seq).toBe("bigint");
    lag.from = w.seq; // the indexer has not reached the approval yet
    const bridge = await EngramOwner.fromPrf({ config: { ...config, source }, prfOutput: prf });
    expect(await ask(bridge)).toBe("NOT_APPROVED"); // the bug: without the approval in hand, lag looks like "not approved"
    bridge.primeApproval(policyOf(w.seq));
    expect(await ask(bridge)).toEqual(["vegetarian"]);
  }, 60_000);

  it("D40 a later revoke still wins once the bridge refreshes", async () => {
    const prf = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const { source, lag } = laggingPolicies(prf);
    let now = Date.now();
    const popup = await EngramOwner.fromPrf({ config, prfOutput: prf });
    await popup.remember("preferences", { kind: "preference", text: "vegetarian" });
    const w = await popup.approve(AGENT, { origin: APP, labels: ["preferences"], scope: "read", expiresInSec: 3600 });
    lag.from = w.seq;
    const bridge = await EngramOwner.fromPrf({ config: { ...config, source }, prfOutput: prf, clock: () => now });
    bridge.primeApproval(policyOf(w.seq));
    expect(await ask(bridge)).toEqual(["vegetarian"]);
    await popup.disapprove(AGENT); // revoked from the vault site
    lag.from = undefined; // the indexer catches up
    now += 5000; // past the 3 s policy cache
    expect(await ask(bridge)).toBe("NOT_APPROVED");
  }, 60_000);

  it("D41 an older revoke seen through lag never undoes a newer primed approval", async () => {
    const prf = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const { source, lag } = laggingPolicies(prf);
    let now = Date.now();
    const popup = await EngramOwner.fromPrf({ config, prfOutput: prf });
    await popup.remember("preferences", { kind: "preference", text: "vegetarian" });
    await popup.approve(AGENT, { origin: APP, labels: ["preferences"], scope: "read", expiresInSec: 3600 });
    await popup.disapprove(AGENT);
    const again = await popup.approve(AGENT, { origin: APP, labels: ["preferences"], scope: "read", expiresInSec: 3600 });
    lag.from = again.seq; // the source shows the revoke but not the re-approval
    const bridge = await EngramOwner.fromPrf({ config: { ...config, source }, prfOutput: prf, clock: () => now });
    bridge.primeApproval(policyOf(again.seq));
    expect(await ask(bridge)).toEqual(["vegetarian"]);
    now += 5000;
    expect(await ask(bridge)).toEqual(["vegetarian"]);
  }, 60_000);

  it("D42 invalid approvals are refused and not cached", async () => {
    const bridge = await EngramOwner.fromPrf({ config, prfOutput: globalThis.crypto.getRandomValues(new Uint8Array(32)) });
    const bad: Array<Partial<PolicyView>> = [
      { labels: ["engram-log"] }, { labels: [] }, { labels: ["Bad Label!"] }, { origin: "https://sage.test/path" },
      { agentId: -1n }, { agentId: 2n ** 256n }, { seq: -1n }, { seq: 1 as unknown as bigint }, { active: "yes" as unknown as boolean },
      { scope: "admin" as never }, { exp: Number.NaN },
    ];
    for (const b of bad) {
      let code = "OK";
      try {
        bridge.primeApproval(policyOf(0n, b));
      } catch (e) {
        code = (e as { code?: string }).code ?? "THROWN";
      }
      expect(code).toBe("INPUT_INVALID");
    }
    expect(await ask(bridge)).toBe("NOT_APPROVED");
  }, 60_000);

  it("D43 a primed approval that has expired answers EXPIRED", async () => {
    const prf = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const bridge = await EngramOwner.fromPrf({ config, prfOutput: prf });
    await bridge.remember("preferences", { kind: "preference", text: "vegetarian" });
    bridge.primeApproval(policyOf(0n, { exp: Date.now() - 1 }));
    expect(await ask(bridge)).toBe("EXPIRED");
  }, 60_000);
});
