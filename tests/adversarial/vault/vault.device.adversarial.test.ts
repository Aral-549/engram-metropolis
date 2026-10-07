// Adversarial probes for the device store and the popup-to-bridge handoff (contracts/simple-flow.md B, C).
// Goal: break them, not confirm them.
import { describe, expect, it } from "vitest";
import { EngramOwner, type EngramConfig, type MemorySource } from "../../../packages/sdk/src/index.js";
import { deviceStore, memoryKV } from "../../../apps/vault/lib/device.js";
import { HANDOFF_TYPE, acceptHandoff, sendHandoff } from "../../../apps/vault/lib/handoff.js";
import { FakeAuthenticator } from "../../support/fake-authenticator.js";

const boom = async () => { throw new Error("no chain"); };
const config: EngramConfig = {
  chainId: 31337, registry: "0x00000000000000000000000000000000000000aa", identityRegistry: "0x00000000000000000000000000000000000000bb",
  rpcUrl: "http://127.0.0.1:1", source: new Proxy({}, { get: () => boom }) as unknown as MemorySource, relayer: { submit: boom as never },
};
const RP = "vault.test";
const VAULT = "https://vault.test";
const up = async (seed: string) => EngramOwner.signUp({ config, rpId: RP, rpName: "E", userName: seed, webAuthnClient: new FakeAuthenticator(seed).client });

describe("device store, adversarial", () => {
  it("a record relabelled with another owner does not open (owner is bound into the ciphertext)", async () => {
    const kv = memoryKV();
    const a = await up("adv-a");
    const b = await up("adv-b");
    await deviceStore({ kv }).save(a);
    const rec = (await kv.get("session")) as Record<string, unknown>;
    await kv.set("session", { ...rec, owner: b.owner });
    expect(await deviceStore({ kv }).restore({ config, rpId: RP })).toBeNull();
    expect(await kv.get("session")).toBeUndefined();
  });

  it("a record encrypted under another device's key does not open", async () => {
    const kv1 = memoryKV();
    const kv2 = memoryKV();
    const a = await up("adv-c");
    await deviceStore({ kv: kv1 }).save(a);
    await deviceStore({ kv: kv2 }).save(await up("adv-d")); // kv2 gets its own wrapping key
    await kv2.set("session", await kv1.get("session"));
    expect(await deviceStore({ kv: kv2 }).restore({ config, rpId: RP })).toBeNull();
  });

  it("a far-future expiry written by hand still needs the right key", async () => {
    const kv = memoryKV();
    await deviceStore({ kv }).save(await up("adv-e"));
    const rec = (await kv.get("session")) as { ct: Uint8Array };
    await kv.set("session", { ...rec, exp: Number.MAX_SAFE_INTEGER, ct: new Uint8Array(48) });
    expect(await deviceStore({ kv }).restore({ config, rpId: RP })).toBeNull();
  });

  it("odd field types are rejected and cleaned up, never thrown", async () => {
    const shapes = [
      { v: 1, owner: "x", credentialId: "c", iv: [1, 2], ct: new Uint8Array(48), exp: 9e15 },
      { v: 1, owner: "x", credentialId: "c", iv: new Uint8Array(12), ct: "abc", exp: 9e15 },
      { v: 1, owner: "x", credentialId: "", iv: new Uint8Array(12), ct: new Uint8Array(48), exp: 9e15 },
      { v: 1, owner: "x", credentialId: "c", iv: new Uint8Array(12), ct: new Uint8Array(48), exp: Number.NaN },
      "string", 42,
    ];
    for (const rec of shapes) {
      const kv = memoryKV();
      await deviceStore({ kv }).save(await up("adv-f"));
      await kv.set("session", rec);
      expect(await deviceStore({ kv }).restore({ config, rpId: RP })).toBeNull();
      expect(await kv.get("session")).toBeUndefined();
    }
  });

  it("a storage backend that throws never breaks restore", async () => {
    const kv = { get: async () => { throw new Error("blocked"); }, set: async () => { throw new Error("blocked"); }, del: async () => { throw new Error("blocked"); } };
    expect(await deviceStore({ kv }).restore({ config, rpId: RP })).toBeNull();
  });

  it("session timing options reject nonsense values", async () => {
    const prf = globalThis.crypto.getRandomValues(new Uint8Array(32));
    for (const o of [{ reauthWindowMs: -1 }, { reauthWindowMs: Number.POSITIVE_INFINITY }, { idleMs: 0 }, { idleMs: Number.NaN }]) {
      await expect(EngramOwner.restore({ config, rpId: RP, prfOutput: prf, credentialId: "c", ...o })).rejects.toMatchObject({ code: "INPUT_INVALID" });
    }
  });
});

describe("handoff, adversarial", () => {
  const msg = { type: HANDOFF_TYPE, v: 1 as const, agentId: "7", prf: new Uint8Array(32), credentialId: "c" };

  it("an opener whose frames throw (closed or navigated) does not crash the popup", () => {
    const opener = new Proxy({}, { get: () => { throw new Error("cross-origin"); } }) as Window;
    expect(sendHandoff(opener, msg, VAULT)).toBe(0);
    const partly = { length: 2, frames: { 0: { postMessage: () => { throw new Error("gone"); } }, 1: { postMessage: () => {} } } } as unknown as Window;
    expect(sendHandoff(partly, msg, VAULT)).toBe(1);
  });

  it("non-Uint8Array secrets and oversized ids are ignored", () => {
    const bad = [
      { ...msg, prf: new DataView(new ArrayBuffer(32)) },
      { ...msg, prf: new Uint16Array(16) },
      { ...msg, agentId: "9".repeat(79) },
      { ...msg, credentialId: "c".repeat(1025) },
      Object.assign(Object.create({ type: HANDOFF_TYPE }), { v: 1, agentId: "7", prf: new Uint8Array(32), credentialId: "c" }),
    ];
    for (const data of bad) expect(acceptHandoff({ origin: VAULT, data }, { vaultOrigin: VAULT, agentId: 7n })).toBeNull();
  });
});
