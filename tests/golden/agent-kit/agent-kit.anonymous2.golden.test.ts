// Regression cases for BUGLOG AN-1..AN-3: contracts/apps.md A37-A39. FROZEN: add cases, never edit.
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
    config, agentId: AGENT, origin: ORIGIN, mode: "disclosure", continuationSecret: SECRET, limits, anonymous,
    kimi: { baseUrl: kimi.baseUrl, apiKey: "test-kimi-key", model: "k", timeoutMs: 2000 },
    persona: { name: "Sage", description: "t", systemPrompt: "You are Sage.", canWrite: true, labels: ["preferences"] },
  });
const user = (t: string) => [{ role: "user" as const, content: t }];

beforeAll(async () => {
  kimi = await new FakeKimi().start();
});
afterAll(() => kimi?.stop());
beforeEach(() => kimi.reset());

describe("anonymous chat regressions", () => {
  it("A37 anonymous chats never use the signed-in global budget (AN-1)", async () => {
    const srv = server({ perOwnerPerHour: 30, globalPerHour: 10 }, { perHour: 20 });
    for (let i = 0; i < 10; i++) await srv.chat({ cookie: undefined, client: `10.0.0.${i}`, messages: user("hi") });
    const s = await EngramOwner.fromPrf({ config, prfOutput: globalThis.crypto.getRandomValues(new Uint8Array(32)) });
    const cookie = await srv.session(await s.signAppSession({ agentId: AGENT, origin: ORIGIN, ttlSec: 3600, pairwise: true }));
    expect((await srv.chat({ cookie, client: "9.9.9.9", messages: user("plan dinner"), memory: "none" })).status).toBe(200);
  });

  it("A38 anonymous traffic has its own global cap (AN-2)", async () => {
    const srv = server({ globalPerHour: 100 }, { perHour: 20, globalPerHour: 5 });
    const codes: number[] = [];
    for (let i = 0; i < 7; i++) codes.push((await srv.chat({ cookie: undefined, client: `10.1.0.${i}`, messages: user("hi") })).status);
    expect(codes).toEqual([200, 200, 200, 200, 200, 429, 429]);
  });

  it("A39 a recall call while memory is off is answered locally, never sent to the vault (AN-3)", async () => {
    const srv = server({}, {});
    kimi.reply({ toolCalls: [{ name: "recall", args: { query: "diet" } }] }, { text: "I don't know your diet yet." });
    const r = await srv.chat({ cookie: undefined, client: "1.1.1.1", messages: user("what is my diet") });
    expect(r.status).toBe(200);
    expect(r.body.pending).toBeUndefined();
    expect(r.body.reply).toBe("I don't know your diet yet.");
    const tool = kimi.requests[1]!.messages.find((m) => m.role === "tool")!;
    expect(String(tool.content).toLowerCase()).toContain("memory is off");
  });
});
