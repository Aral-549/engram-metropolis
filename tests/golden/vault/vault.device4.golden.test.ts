// Regression case for BUGLOG FL-1 / contracts/simple-flow.md C45: the device record carries the time of the last
// real passkey ceremony, so a new window restored within 10 minutes keeps it. FROZEN: add cases, never edit.
import { describe, expect, it } from "vitest";
import { EngramOwner, type EngramConfig, type MemorySource } from "../../../packages/sdk/src/index.js";
import { deviceStore, memoryKV } from "../../../apps/vault/lib/device.js";
import { FakeAuthenticator } from "../../support/fake-authenticator.js";

const boom = async () => { throw new Error("no chain"); };
const config: EngramConfig = {
  chainId: 31337, registry: "0x00000000000000000000000000000000000000aa", identityRegistry: "0x00000000000000000000000000000000000000bb",
  rpcUrl: "http://127.0.0.1:1", source: new Proxy({}, { get: () => boom }) as unknown as MemorySource, relayer: { submit: boom as never },
};

describe("FL-1 ceremony time in the device record", () => {
  it("C45 a window restored 5 minutes after the passkey keeps the ceremony time; one restored from a plain copy has none", async () => {
    let now = 50_000_000;
    const s = await EngramOwner.signUp({ config, rpId: "vault.test", rpName: "E", userName: "fl1", webAuthnClient: new FakeAuthenticator("fl1-c45").client, clock: () => now });
    const kv = memoryKV();
    await deviceStore({ kv, clock: () => now }).save(s);
    now += 5 * 60_000;
    const r = await deviceStore({ kv, clock: () => now }).restore({ config, rpId: "vault.test", clock: () => now, reauthWindowMs: 10 * 60_000 });
    expect(r?.lastCeremonyAt).toBe(50_000_000);
    // a restored session has no ceremony of its own: saving it keeps the original time, never "now"
    await deviceStore({ kv, clock: () => now }).save(r!);
    const r2 = await deviceStore({ kv, clock: () => now }).restore({ config, rpId: "vault.test", clock: () => now });
    expect(r2?.lastCeremonyAt).toBe(50_000_000);
  });
});
