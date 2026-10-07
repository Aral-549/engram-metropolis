// Golden tests for contracts/simple-flow.md B (stay signed in: C7-C14) and C (popup-to-bridge handoff: C20-C23).
// No chain: restoring a session derives keys locally. In-memory key-value store + real WebCrypto.
// Written from the spec before the implementation. FROZEN: add cases, never edit.
import { describe, expect, it } from "vitest";
import { EngramOwner, type EngramConfig, type MemorySource } from "../../../packages/sdk/src/index.js";
import { STAY_MS, deviceStore, memoryKV } from "../../../apps/vault/lib/device.js";
import { HANDOFF_TYPE, acceptHandoff, sendHandoff } from "../../../apps/vault/lib/handoff.js";
import { FakeAuthenticator } from "../../support/fake-authenticator.js";

const boom = async () => { throw new Error("no chain needed"); };
const config: EngramConfig = {
  chainId: 31337, registry: "0x00000000000000000000000000000000000000aa", identityRegistry: "0x00000000000000000000000000000000000000bb",
  rpcUrl: "http://127.0.0.1:1", source: new Proxy({}, { get: () => boom }) as unknown as MemorySource, relayer: { submit: boom as never },
};
const RP = "vault.test";
const DAY = 24 * 3600 * 1000;
const VAULT = "https://vault.test";

async function signedUp(seed: string) {
  const auth = new FakeAuthenticator(seed);
  const s = await EngramOwner.signUp({ config, rpId: RP, rpName: "Engram", userName: seed, webAuthnClient: auth.client });
  return { auth, s };
}

describe("stay signed in (device store)", () => {
  it("C7 save then restore: same owner, no passkey prompt", async () => {
    const { auth, s } = await signedUp("c7");
    const store = deviceStore({ kv: memoryKV() });
    await store.save(s);
    const before = { ...auth.calls };
    const r = await store.restore({ config, rpId: RP, webAuthnClient: auth.client });
    expect(r?.owner).toBe(s.owner);
    expect(auth.calls).toEqual(before);
  });

  it("C8 restore 6 days later works and the 7 days restart", async () => {
    let now = 1_000_000_000;
    const kv = memoryKV();
    const { s } = await signedUp("c8");
    const store = deviceStore({ kv, clock: () => now });
    await store.save(s);
    now += 6 * DAY;
    expect((await store.restore({ config, rpId: RP }))?.owner).toBe(s.owner);
    now += 6 * DAY; // 12 days after the save, 6 after the last use
    expect((await store.restore({ config, rpId: RP }))?.owner).toBe(s.owner);
    expect(STAY_MS).toBe(7 * DAY);
  });

  it("C9 restore 8 days after the last use: locked, and the record is deleted", async () => {
    let now = 2_000_000_000;
    const kv = memoryKV();
    const { s } = await signedUp("c9");
    const store = deviceStore({ kv, clock: () => now });
    await store.save(s);
    now += 8 * DAY;
    expect(await store.restore({ config, rpId: RP })).toBeNull();
    expect(await kv.get("session")).toBeUndefined();
  });

  it("C10 clear (Lock): nothing to restore", async () => {
    const kv = memoryKV();
    const { s } = await signedUp("c10");
    const store = deviceStore({ kv });
    await store.save(s);
    await store.clear();
    expect(await store.restore({ config, rpId: RP })).toBeNull();
    expect(await kv.get("session")).toBeUndefined();
  });

  it("C13 a corrupted record or a missing wrapping key: deleted, locked, no throw", async () => {
    const { s } = await signedUp("c13");
    for (const damage of ["ciphertext", "shape", "key"] as const) {
      const kv = memoryKV();
      const store = deviceStore({ kv });
      await store.save(s);
      const rec = (await kv.get("session")) as { ct: Uint8Array };
      if (damage === "ciphertext") await kv.set("session", { ...rec, ct: rec.ct.map((b, i) => (i === 0 ? b ^ 1 : b)) });
      if (damage === "shape") await kv.set("session", { hello: "world" });
      if (damage === "key") await kv.del("wrap");
      expect(await store.restore({ config, rpId: RP })).toBeNull();
      expect(await kv.get("session")).toBeUndefined();
    }
  });

  it("C14 the stored record is ciphertext and the wrapping key cannot be exported", async () => {
    const kv = memoryKV();
    const { s } = await signedUp("c14");
    const secret = s.exportRootSecret();
    await deviceStore({ kv }).save(s);
    const hex = Buffer.from(secret).toString("hex");
    const rec = await kv.get("session");
    const dump = JSON.stringify(rec, (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString("hex") : v));
    expect(dump).not.toContain(hex);
    const key = (await kv.get("wrap")) as CryptoKey;
    expect(key.extractable).toBe(false);
    await expect(globalThis.crypto.subtle.exportKey("raw", key)).rejects.toThrow();
  });
});

describe("popup-to-bridge handoff", () => {
  const good = (agentId = "7") => ({ type: HANDOFF_TYPE, v: 1, agentId, prf: new Uint8Array(32).fill(5), credentialId: "cred" });

  it("C20 the popup posts only with the vault origin as target, to every frame of its opener", () => {
    const posted: Array<{ data: unknown; target: string }> = [];
    const frame = { postMessage: (data: unknown, target: string) => posted.push({ data, target }) };
    const opener = { frames: [frame, frame], length: 2 } as unknown as Window;
    expect(sendHandoff(opener, good(), VAULT)).toBe(2);
    expect(posted).toHaveLength(2);
    expect(posted.every((p) => p.target === VAULT)).toBe(true);
  });

  it("C23 no opener: nothing is sent", () => {
    expect(sendHandoff(null, good(), VAULT)).toBe(0);
  });

  it("C21 the bridge accepts only the vault origin and its own agent", () => {
    expect(acceptHandoff({ origin: VAULT, data: good() }, { vaultOrigin: VAULT, agentId: 7n })).toMatchObject({ credentialId: "cred" });
    expect(acceptHandoff({ origin: "https://sage.test", data: good() }, { vaultOrigin: VAULT, agentId: 7n })).toBeNull();
    expect(acceptHandoff({ origin: VAULT, data: good("8") }, { vaultOrigin: VAULT, agentId: 7n })).toBeNull();
  });

  it("C21 malformed handoffs are ignored", () => {
    const bad: unknown[] = [
      null, "x", { ...good(), type: "other" }, { ...good(), v: 2 }, { ...good(), prf: new Uint8Array(31) },
      { ...good(), prf: [1, 2, 3] }, { ...good(), credentialId: "" }, { ...good(), credentialId: 5 }, { ...good(), agentId: "07" },
    ];
    for (const data of bad) expect(acceptHandoff({ origin: VAULT, data }, { vaultOrigin: VAULT, agentId: 7n })).toBeNull();
  });
});
