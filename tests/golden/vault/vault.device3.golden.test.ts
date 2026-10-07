// Regression case for BUGLOG DS-1 / contracts/simple-flow.md C44: in a browser that shares IndexedDB between the
// strip and the vault site, the strip's tab copy never touches the vault site's 7-day copy. FROZEN: add, never edit.
import { describe, expect, it } from "vitest";
import { EngramOwner, type EngramConfig, type MemorySource } from "../../../packages/sdk/src/index.js";
import { deviceFor, memoryKV, type KV } from "../../../apps/vault/lib/device.js";
import { FakeAuthenticator } from "../../support/fake-authenticator.js";

const boom = async () => { throw new Error("no chain"); };
const config: EngramConfig = {
  chainId: 31337, registry: "0x00000000000000000000000000000000000000aa", identityRegistry: "0x00000000000000000000000000000000000000bb",
  rpcUrl: "http://127.0.0.1:1", source: new Proxy({}, { get: () => boom }) as unknown as MemorySource, relayer: { submit: boom as never },
};
const tab = () => { const m = new Map<string, string>(); return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) }; };

describe("DS-1 one shared (unpartitioned) IndexedDB", () => {
  it("C44 a strip's save and cleanup leave the vault site's session intact", async () => {
    const dbs = new Map<string, KV>();
    const idb = (name: string) => { if (!dbs.has(name)) dbs.set(name, memoryKV()); return dbs.get(name)!; };
    const s = await EngramOwner.signUp({ config, rpId: "vault.test", rpName: "E", userName: "ds1", webAuthnClient: new FakeAuthenticator("ds1").client });
    const site = deviceFor("site", { idb, session: tab() });
    await site.save(s); // the connect popup saves the 7-day copy
    const strip = deviceFor("tab", { idb, session: tab() });
    await strip.save(s); // the strip adopts the handoff and keeps its tab copy
    await strip.clear(); // and later forgets it (revoke)
    const reopened = await deviceFor("site", { idb, session: tab() }).restore({ config, rpId: "vault.test" });
    expect(reopened?.owner).toBe(s.owner);
  });
});
