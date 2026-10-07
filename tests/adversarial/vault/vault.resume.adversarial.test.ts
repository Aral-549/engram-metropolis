// Adversarial probes for "Resume memory" and the tab-only store (contracts/simple-flow.md B2). Goal: break them.
import { describe, expect, it } from "vitest";
import { EngramOwner, type EngramConfig, type MemorySource, type PolicyView } from "../../../packages/sdk/src/index.js";
import { deviceStore, memoryKV, tabKV } from "../../../apps/vault/lib/device.js";
import { embedderOrigin, resumeCheck } from "../../../apps/vault/lib/resume.js";
import { FakeAuthenticator } from "../../support/fake-authenticator.js";

const boom = async () => { throw new Error("no chain"); };
const config: EngramConfig = {
  chainId: 31337, registry: "0x00000000000000000000000000000000000000aa", identityRegistry: "0x00000000000000000000000000000000000000bb",
  rpcUrl: "http://127.0.0.1:1", source: new Proxy({}, { get: () => boom }) as unknown as MemorySource, relayer: { submit: boom as never },
};
const tab = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k), m };
};

describe("resume, adversarial", () => {
  const policy: PolicyView = { agentId: 7n, origin: "https://sage.test", labels: ["preferences"], scope: "read", exp: 9e15, active: true, seq: 1n };

  it("a hostile site that embeds the strip cannot resume someone else's approval", () => {
    // the strip computes the app origin from the browser, so on evil.test it is evil.test
    const origin = embedderOrigin({ ancestorOrigins: ["https://evil.test"], referrer: "https://sage.test/" });
    expect(origin).toBe("https://evil.test"); // ancestorOrigins wins over a referrer that could be set by the page
    expect(resumeCheck({ policy, agentId: 7n, origin, now: 0 }).ok).toBe(false);
  });

  it("near-miss origins never match", () => {
    for (const o of ["https://sage.test.evil.test", "http://sage.test", "https://sage.test:444", "https://SAGE.test.evil"]) {
      expect(resumeCheck({ policy, agentId: 7n, origin: embedderOrigin({ referrer: o + "/" }), now: 0 }).ok).toBe(false);
    }
  });

  it("odd schemes and opaque origins give no origin at all", () => {
    for (const r of ["javascript:alert(1)", "file:///etc/passwd", "data:text/html,x", "about:blank", "blob:https://sage.test/x"]) {
      expect(embedderOrigin({ referrer: r })).toBeNull();
    }
  });

  it("a tampered tab copy (bad base64, wrong lengths) is dropped, not thrown", async () => {
    const s = await EngramOwner.signUp({ config, rpId: "vault.test", rpName: "E", userName: "r", webAuthnClient: new FakeAuthenticator("adv-r").client });
    for (const damage of ["%%%not-base64%%%", "AAAA"]) {
      const t = tab();
      const idb = memoryKV();
      await deviceStore({ kv: tabKV({ session: t, persistent: idb }) }).save(s);
      const rec = JSON.parse(t.m.get("engram-session")!);
      t.m.set("engram-session", JSON.stringify({ ...rec, ct: damage }));
      expect(await deviceStore({ kv: tabKV({ session: t, persistent: idb }) }).restore({ config, rpId: "vault.test" })).toBeNull();
      expect(t.m.has("engram-session")).toBe(false);
    }
  });
});
