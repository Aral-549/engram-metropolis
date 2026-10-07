// Adversarial probes for anonymous chat (contracts/apps.md A28-A36). Goal: break it, not confirm it.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EngramOwner, type EngramConfig, type MemorySource } from "../../../packages/sdk/src/index.js";
import { createAgentServer } from "../../../packages/agent-kit/src/index.js";
import { FakeKimi } from "../../support/fake-kimi.js";

const ORIGIN = "https://sage.test";
const AGENT = 1965n;
const SECRET = "test-continuation-secret-0123456789abcdef";
const boom = async () => { throw new Error("no chain in disclosure mode"); };
const config: EngramConfig = {
  chainId: 31337, registry: "0x00000000000000000000000000000000000000aa", identityRegistry: "0x00000000000000000000000000000000000000bb",
  rpcUrl: "http://127.0.0.1:1", source: new Proxy({}, { get: () => boom }) as unknown as MemorySource, relayer: { submit: boom as never },
};
let kimi: FakeKimi;
const server = (limits: { perOwnerPerHour?: number; globalPerHour?: number }, anonymous: { perHour?: number; globalPerHour?: number }) =>
  createAgentServer({
    config, agentId: AGENT, origin: ORIGIN, mode: "disclosure", continuationSecret: SECRET, limits, anonymous: anonymous as never,
    kimi: { baseUrl: kimi.baseUrl, apiKey: "test-kimi-key", model: "k", timeoutMs: 2000 },
    persona: { name: "Sage", description: "t", systemPrompt: "You are Sage.", canWrite: true, labels: ["preferences"] },
  });
const user = (t: string) => [{ role: "user" as const, content: t }];

beforeAll(async () => {
  kimi = await new FakeKimi().start();
});
afterAll(() => kimi?.stop());
beforeEach(() => kimi.reset());

describe("anonymous chat, adversarial", () => {
  it("rotating anonymous IPs cannot use up the budget signed-in users depend on", async () => {
    const srv = server({ perOwnerPerHour: 30, globalPerHour: 10 }, { perHour: 20 });
    for (let i = 0; i < 10; i++) await srv.chat({ cookie: undefined, client: `10.0.0.${i}`, messages: user("hi") });
    const s = await EngramOwner.fromPrf({ config, prfOutput: globalThis.crypto.getRandomValues(new Uint8Array(32)) });
    const cookie = await srv.session(await s.signAppSession({ agentId: AGENT, origin: ORIGIN, ttlSec: 3600, pairwise: true }));
    const r = await srv.chat({ cookie, client: "9.9.9.9", messages: user("plan dinner"), memory: "none" });
    expect(r.status).toBe(200);
  });

  it("anonymous traffic as a whole has its own cap", async () => {
    const srv = server({ perOwnerPerHour: 30, globalPerHour: 100 }, { perHour: 20, globalPerHour: 5 });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await srv.chat({ cookie: undefined, client: `10.1.0.${i}`, messages: user("hi") })).status);
    expect(codes.filter((c) => c === 200)).toHaveLength(5);
    expect(codes.slice(5)).toEqual([429, 429]);
  });

  it("an anonymous continuation replayed twice is refused the second time", async () => {
    const srv = server({}, {});
    kimi.reply({ toolCalls: [{ name: "remember", args: { kind: "fact", text: "x" } }] }, { text: "ok" }, { text: "again" });
    const r1 = await srv.chat({ cookie: undefined, client: "1.1.1.1", messages: user("x") });
    const req = { cookie: undefined, client: "1.1.1.1", continuation: r1.body.continuation!, result: { id: r1.body.pending!.id, ok: false, code: "NOT_CONNECTED" } };
    expect((await srv.continue(req)).status).toBe(200);
    expect((await srv.continue(req)).status).toBe(400);
  });

  it("an anonymous caller cannot sneak in recall through a forged ok result", async () => {
    const srv = server({}, {});
    kimi.reply({ toolCalls: [{ name: "recall", args: { query: "diet" } }] }, { text: "done" });
    const r = await srv.chat({ cookie: undefined, client: "1.1.1.1", messages: user("what is my diet") });
    // recall is not offered while memory is off; a model that calls it anyway gets a local error, not a pending vault read
    expect(r.body.pending).toBeUndefined();
    expect(r.status).toBe(200);
  });
});
