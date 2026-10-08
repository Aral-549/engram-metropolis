// Regression case for BUGLOG FL-1 (hardening): the ceremony time is bound into the device record's encryption, so
// editing it in storage voids the record instead of skipping a passkey prompt. FROZEN: add cases, never edit.
import { describe, expect, it } from "vitest";
import { EngramOwner, type EngramConfig, type MemorySource } from "../../../packages/sdk/src/index.js";
import { deviceStore, memoryKV } from "../../../apps/vault/lib/device.js";
import { FakeAuthenticator } from "../../support/fake-authenticator.js";

const boom = async () => { throw new Error("no chain"); };
const config: EngramConfig = {
  chainId: 31337, registry: "0x00000000000000000000000000000000000000aa", identityRegistry: "0x00000000000000000000000000000000000000bb",
  rpcUrl: "http://127.0.0.1:1", source: new Proxy({}, { get: () => boom }) as unknown as MemorySource, relayer: { submit: boom as never },
};

describe("FL-1 tamper resistance", () => {
  it("C45 a record whose ceremony time was edited (or added) does not open", async () => {
    let now = 60_000_000;
    const s = await EngramOwner.signUp({ config, rpId: "vault.test", rpName: "E", userName: "t", webAuthnClient: new FakeAuthenticator("fl1-t").client, clock: () => now });
    for (const forged of [now + 3 * 60_000, undefined]) {
      const kv = memoryKV();
      await deviceStore({ kv, clock: () => now }).save(s);
      const rec = (await kv.get("session")) as Record<string, unknown>;
      const edited = forged === undefined ? (({ ceremonyAt: _, ...r }) => r)(rec) : { ...rec, ceremonyAt: forged };
      await kv.set("session", edited);
      expect(await deviceStore({ kv, clock: () => now + 5 * 60_000 }).restore({ config, rpId: "vault.test" })).toBeNull();
    }
    now += 0;
  });
});
