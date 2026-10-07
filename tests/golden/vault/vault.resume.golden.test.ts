// Golden tests for contracts/simple-flow.md B2 (apps forget the vault when the tab closes; "Resume memory"):
// C35, C36, C39, C42. Written from the spec before the implementation. FROZEN: add cases, never edit.
import { describe, expect, it } from "vitest";
import { EngramOwner, type EngramConfig, type MemorySource, type PolicyView } from "../../../packages/sdk/src/index.js";
import { deviceStore, memoryKV, tabKV } from "../../../apps/vault/lib/device.js";
import { embedderOrigin, resumeCheck, resumeUrl } from "../../../apps/vault/lib/resume.js";
import { FakeAuthenticator } from "../../support/fake-authenticator.js";

const boom = async () => { throw new Error("no chain"); };
const config: EngramConfig = {
  chainId: 31337, registry: "0x00000000000000000000000000000000000000aa", identityRegistry: "0x00000000000000000000000000000000000000bb",
  rpcUrl: "http://127.0.0.1:1", source: new Proxy({}, { get: () => boom }) as unknown as MemorySource, relayer: { submit: boom as never },
};
const RP = "vault.test";
const APP = "https://sage.test";

/** A stand-in for one tab's sessionStorage. */
function fakeSessionStorage() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, String(v)), removeItem: (k: string) => void m.delete(k), size: () => m.size };
}

describe("tab-only copy in apps (B2)", () => {
  it("C35 a refresh (same tab) restores without a prompt", async () => {
    const auth = new FakeAuthenticator("b2-35");
    const s = await EngramOwner.signUp({ config, rpId: RP, rpName: "E", userName: "b2", webAuthnClient: auth.client });
    const idb = memoryKV();
    const tab = fakeSessionStorage();
    await deviceStore({ kv: tabKV({ session: tab, persistent: idb }) }).save(s);
    const before = { ...auth.calls };
    const r = await deviceStore({ kv: tabKV({ session: tab, persistent: idb }) }).restore({ config, rpId: RP, webAuthnClient: auth.client });
    expect(r?.owner).toBe(s.owner);
    expect(auth.calls).toEqual(before);
  });

  it("C36 a new tab finds nothing; nothing long-lived holds the session", async () => {
    const s = await EngramOwner.signUp({ config, rpId: RP, rpName: "E", userName: "b2b", webAuthnClient: new FakeAuthenticator("b2-36").client });
    const idb = memoryKV();
    await deviceStore({ kv: tabKV({ session: fakeSessionStorage(), persistent: idb }) }).save(s);
    expect(await idb.get("session")).toBeUndefined();
    const reopened = deviceStore({ kv: tabKV({ session: fakeSessionStorage(), persistent: idb }) });
    expect(await reopened.restore({ config, rpId: RP })).toBeNull();
  });

  it("C42 a leftover long-lived copy in an app's partition is deleted, never used", async () => {
    const s = await EngramOwner.signUp({ config, rpId: RP, rpName: "E", userName: "b2c", webAuthnClient: new FakeAuthenticator("b2-42").client });
    const idb = memoryKV();
    await deviceStore({ kv: idb }).save(s); // what an earlier build wrote into the app's partition
    const store = deviceStore({ kv: tabKV({ session: fakeSessionStorage(), persistent: idb }) });
    expect(await store.restore({ config, rpId: RP })).toBeNull();
    expect(await idb.get("session")).toBeUndefined();
  });
});

describe("resume checks (B2)", () => {
  const now = 1_000_000;
  const policy = (over: Partial<PolicyView> = {}): PolicyView =>
    ({ agentId: 7n, origin: APP, labels: ["preferences"], scope: "read", exp: now + 60_000, active: true, seq: 2n, ...over });

  it("C37 an active approval for exactly this agent and origin resumes", () => {
    expect(resumeCheck({ policy: policy(), agentId: 7n, origin: APP, now })).toEqual({ ok: true });
  });

  it("C39 resume never widens access", () => {
    expect(resumeCheck({ policy: undefined, agentId: 7n, origin: APP, now })).toEqual({ ok: false, reason: "NOT_APPROVED" });
    expect(resumeCheck({ policy: policy({ active: false }), agentId: 7n, origin: APP, now })).toEqual({ ok: false, reason: "NOT_APPROVED" });
    expect(resumeCheck({ policy: policy({ origin: "https://other.test" }), agentId: 7n, origin: APP, now })).toEqual({ ok: false, reason: "ORIGIN" });
    expect(resumeCheck({ policy: policy({ agentId: 8n }), agentId: 7n, origin: APP, now })).toEqual({ ok: false, reason: "NOT_APPROVED" });
    expect(resumeCheck({ policy: policy({ exp: now - 1 }), agentId: 7n, origin: APP, now })).toEqual({ ok: false, reason: "EXPIRED" });
    expect(resumeCheck({ policy: policy(), agentId: 7n, origin: null, now })).toEqual({ ok: false, reason: "UNKNOWN_ORIGIN" });
  });

  it("C39 the app origin comes from the browser, exact, or not at all", () => {
    expect(embedderOrigin({ ancestorOrigins: [APP], referrer: "" })).toBe(APP);
    expect(embedderOrigin({ referrer: `${APP}/chat?x=1` })).toBe(APP);
    expect(embedderOrigin({ referrer: "" })).toBeNull();
    expect(embedderOrigin({ ancestorOrigins: ["null"], referrer: "" })).toBeNull();
    expect(embedderOrigin({ referrer: "not a url" })).toBeNull();
  });

  it("resumeUrl carries the agent and the app origin", () => {
    const u = new URL(resumeUrl("https://vault.test", 7n, APP));
    expect(u.origin + u.pathname).toBe("https://vault.test/resume");
    expect(u.searchParams.get("agentId")).toBe("7");
    expect(u.searchParams.get("origin")).toBe(APP);
  });
});
