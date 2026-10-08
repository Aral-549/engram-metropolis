// Golden tests for contracts/sdk.md #67-#69 (BUGLOG FL-1): the 10-minute re-prompt window follows the real passkey
// ceremony across windows, never a stale or forged time. Local anvil chain. Written before the implementation.
// FROZEN: add cases, never edit.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EngramOwner, createRelayHandler, inProcessRelayer, logsSource, type EngramConfig } from "../../../packages/sdk/src/index.js";
import { startLocalChain, type LocalChain } from "../../support/anvil.js";
import { FakeAuthenticator } from "../../support/fake-authenticator.js";

let chain: LocalChain;
let base: EngramConfig;
const RP = "vault.test";
const MIN = 60_000;
beforeAll(async () => {
  chain = await startLocalChain();
  const handler = createRelayHandler({ config: { chainId: 31337, registry: chain.registry, identityRegistry: chain.identityRegistry, rpcUrl: chain.rpcUrl } as never, wallet: chain.wallet(1) });
  base = { chainId: 31337, registry: chain.registry, identityRegistry: chain.identityRegistry, rpcUrl: chain.rpcUrl, source: logsSource({ rpcUrl: chain.rpcUrl, registry: chain.registry, fromBlock: 0n }), relayer: inProcessRelayer(handler), logger: () => {} };
});
afterAll(() => chain?.stop());
const approve = (s: Awaited<ReturnType<typeof EngramOwner.restore>>, agent = 7n) =>
  s.approve(agent, { origin: "https://app.test", labels: ["preferences"], scope: "read", expiresInSec: 3600 });

describe("ceremony time across windows", () => {
  it("#67 lastCeremonyAt reports the real ceremony, and a plain restore reports none", async () => {
    let now = 10_000_000;
    const auth = new FakeAuthenticator("fl1-67");
    const s = await EngramOwner.signUp({ config: base, rpId: RP, rpName: "E", userName: "a", webAuthnClient: auth.client, clock: () => now, reauthWindowMs: 10 * MIN });
    expect(s.lastCeremonyAt).toBe(10_000_000);
    now += 11 * MIN;
    await approve(s); // re-prompts
    expect(s.lastCeremonyAt).toBe(now);
    const r = await EngramOwner.restore({ config: base, rpId: RP, prfOutput: s.exportRootSecret(), credentialId: s.credentialId!, webAuthnClient: auth.client });
    expect(r.lastCeremonyAt).toBeUndefined();
  }, 60_000);

  it("#68 a restore carrying a ceremony 4 minutes old approves without a prompt", async () => {
    let now = 20_000_000;
    const auth = new FakeAuthenticator("fl1-68");
    const s = await EngramOwner.signUp({ config: base, rpId: RP, rpName: "E", userName: "b", webAuthnClient: auth.client, clock: () => now });
    now += 4 * MIN;
    const r = await EngramOwner.restore({ config: base, rpId: RP, prfOutput: s.exportRootSecret(), credentialId: s.credentialId!, webAuthnClient: auth.client, clock: () => now, reauthWindowMs: 10 * MIN, ceremonyAt: 20_000_000 });
    const g0 = auth.calls.get;
    await approve(r);
    expect(auth.calls.get).toBe(g0);
  }, 60_000);

  it("#69 a stale, future or invalid ceremony time never widens the window", async () => {
    const now = 30_000_000;
    const auth = new FakeAuthenticator("fl1-69");
    const s = await EngramOwner.signUp({ config: base, rpId: RP, rpName: "E", userName: "c", webAuthnClient: auth.client, clock: () => now });
    for (const ceremonyAt of [now - 11 * MIN, now + 60_000, Number.NaN, Number.POSITIVE_INFINITY]) {
      const r = await EngramOwner.restore({ config: base, rpId: RP, prfOutput: s.exportRootSecret(), credentialId: s.credentialId!, webAuthnClient: auth.client, clock: () => now, reauthWindowMs: 10 * MIN, ceremonyAt });
      const g0 = auth.calls.get;
      await approve(r, 8n);
      expect(auth.calls.get, String(ceremonyAt)).toBe(g0 + 1);
    }
  }, 120_000);
});
