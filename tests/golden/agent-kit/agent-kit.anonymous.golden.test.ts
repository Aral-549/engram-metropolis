// Golden tests for anonymous chat (no vault yet): contracts/apps.md A28-A36, contracts/simple-flow.md C1, C2, C4.
// No chain: disclosure mode never reads it. Written from the spec before the implementation. FROZEN: add cases, never edit.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EngramOwner, type EngramConfig, type MemorySource } from "../../../packages/sdk/src/index.js";
import { createAgentServer } from "../../../packages/agent-kit/src/index.js";
import { FakeKimi } from "../../support/fake-kimi.js";

const ORIGIN = "https://sage.test";
const AGENT = 1965n;
const SECRET = "test-continuation-secret-0123456789abcdef";
const boom = async () => { throw new Error("the agent server must not read the chain in disclosure mode"); };
const deadSource = new Proxy({}, { get: () => boom }) as unknown as MemorySource;
const config: EngramConfig = {
  chainId: 31337, registry: "0x00000000000000000000000000000000000000aa", identityRegistry: "0x00000000000000000000000000000000000000bb",
  rpcUrl: "http://127.0.0.1:1", source: deadSource, relayer: { submit: boom as never },
};
let kimi: FakeKimi;

const server = (o: { canWrite?: boolean; anonymous?: { perHour?: number } | null } = {}) =>
  createAgentServer({
    config, agentId: AGENT, origin: ORIGIN, mode: "disclosure", continuationSecret: SECRET,
    kimi: { baseUrl: kimi.baseUrl, apiKey: "test-kimi-key", model: "k", timeoutMs: 2000 },
    persona: { name: "Sage", description: "t", systemPrompt: "You are Sage.", canWrite: o.canWrite ?? true, labels: ["preferences"] },
    ...(o.anonymous === null ? {} : { anonymous: o.anonymous ?? {} }),
  });

async function cookieFor(srv: ReturnType<typeof server>) {
  const s = await EngramOwner.fromPrf({ config, prfOutput: globalThis.crypto.getRandomValues(new Uint8Array(32)) });
  const proof = await s.signAppSession({ agentId: AGENT, origin: ORIGIN, ttlSec: 3600, pairwise: true });
  return srv.session(proof);
}
const user = (t: string) => [{ role: "user" as const, content: t }];
const toolNames = (i: number) => (kimi.requests[i]!.tools ?? []).map((t) => t.function.name).sort();
const systemText = (i: number) => kimi.requests[i]!.messages.filter((m) => m.role === "system").map((m) => String(m.content)).join("\n");

beforeAll(async () => {
  kimi = await new FakeKimi().start();
});
afterAll(() => kimi?.stop());
beforeEach(() => kimi.reset());

describe("anonymous chat (memory off)", () => {
  it("A28 no cookie: 200, memory off, the model is told so, only remember is offered", async () => {
    const srv = server();
    kimi.reply({ text: "Hi! Tell me about yourself." });
    const r = await srv.chat({ cookie: undefined, client: "1.2.3.4", messages: user("hi") });
    expect(r.status).toBe(200);
    expect(r.body.reply).toBe("Hi! Tell me about yourself.");
    expect(r.body.memory).toBe("off");
    expect(toolNames(0)).toEqual(["remember"]);
    expect(systemText(0).toLowerCase()).toContain("memory is off");
  });

  it("A29 remember while memory is off: pending, then NOT_CONNECTED; nothing saved; the model is told it stays on the device", async () => {
    const srv = server();
    kimi.reply({ toolCalls: [{ name: "remember", args: { kind: "preference", text: "vegetarian" } }] }, { text: "I'll keep that once memory is on." });
    const r1 = await srv.chat({ cookie: undefined, client: "1.2.3.4", messages: user("I'm vegetarian") });
    expect(r1.status).toBe(200);
    expect(r1.body.pending).toMatchObject({ tool: "remember", args: { kind: "preference", text: "vegetarian" } });
    const r2 = await srv.continue({ cookie: undefined, client: "1.2.3.4", continuation: r1.body.continuation!, result: { id: r1.body.pending!.id, ok: false, code: "NOT_CONNECTED" } });
    expect(r2.status).toBe(200);
    expect(r2.body.reply).toBe("I'll keep that once memory is on.");
    expect(r2.body.saved).toEqual([]);
    const tool = kimi.requests[1]!.messages.find((m) => m.role === "tool")!;
    expect(String(tool.content).toLowerCase()).toContain("memory is off");
    expect(String(tool.content).toLowerCase()).toContain("device");
  });

  it("A30 per-client anonymous limit; another client is not affected", async () => {
    const srv = server({ anonymous: { perHour: 3 } });
    for (let i = 0; i < 3; i++) expect((await srv.chat({ cookie: undefined, client: "10.0.0.1", messages: user("hi") })).status).toBe(200);
    const over = await srv.chat({ cookie: undefined, client: "10.0.0.1", messages: user("hi") });
    expect(over.status).toBe(429);
    expect(over.body.code).toBe("RATE_LIMITED");
    expect((await srv.chat({ cookie: undefined, client: "10.0.0.2", messages: user("hi") })).status).toBe(200);
    expect(kimi.requests).toHaveLength(4);
  });

  it("A31 an anonymous continuation is bound to its client: another client or a signed-in caller is refused", async () => {
    const srv = server();
    kimi.reply({ toolCalls: [{ name: "remember", args: { kind: "fact", text: "lives in Pune" } }] });
    const r1 = await srv.chat({ cookie: undefined, client: "1.1.1.1", messages: user("I live in Pune") });
    const result = { id: r1.body.pending!.id, ok: false, code: "NOT_CONNECTED" };
    const calls = kimi.requests.length;
    const other = await srv.continue({ cookie: undefined, client: "2.2.2.2", continuation: r1.body.continuation!, result });
    expect(other.status).toBe(400);
    expect(other.body.code).toBe("BAD_CONTINUATION");
    const signedIn = await srv.continue({ cookie: await cookieFor(srv), client: "1.1.1.1", continuation: r1.body.continuation!, result });
    expect(signedIn.status).toBe(400);
    expect(signedIn.body.code).toBe("BAD_CONTINUATION");
    expect(kimi.requests.length).toBe(calls);
  });

  it("A32 without the anonymous option, no cookie is still 401 and the model is never called", async () => {
    const srv = server({ anonymous: null });
    const r = await srv.chat({ cookie: undefined, client: "1.2.3.4", messages: user("hi") });
    expect(r.status).toBe(401);
    expect(kimi.requests).toHaveLength(0);
  });

  it("A33 a cookie that fails verification is treated as anonymous", async () => {
    const srv = server();
    kimi.reply({ text: "hello" });
    const r = await srv.chat({ cookie: "garbage", client: "1.2.3.4", messages: user("hi") });
    expect(r.status).toBe(200);
    expect(r.body.memory).toBe("off");
  });

  it("A34 anonymous requests cannot inject disclosed memory", async () => {
    const srv = server();
    kimi.reply({ text: "ok" });
    await srv.chat({ cookie: undefined, client: "1.2.3.4", messages: user("plan dinner"), disclosed: [{ kind: "preference", text: "vegetarian", by: "owner" }], memory: "ok" });
    const all = kimi.requests[0]!.messages.map((m) => String(m.content ?? "")).join("\n");
    expect(all).not.toContain("<user_memory>");
    expect(all).not.toContain("vegetarian");
  });

  it("A35 a read-only persona gets no tools while memory is off", async () => {
    const srv = server({ canWrite: false });
    kimi.reply({ text: "Where to?" });
    const r = await srv.chat({ cookie: undefined, client: "1.2.3.4", messages: user("plan a trip") });
    expect(r.status).toBe(200);
    expect(kimi.requests[0]!.tools ?? []).toHaveLength(0);
  });

  it("A36 a signed-in chat on a server with anonymous on is unchanged", async () => {
    const srv = server();
    const cookie = await cookieFor(srv);
    kimi.reply({ text: "Here is a plan." });
    const r = await srv.chat({ cookie, client: "1.2.3.4", messages: user("plan dinner"), disclosed: [{ kind: "preference", text: "vegetarian", by: "owner" }], memory: "ok" });
    expect(r.status).toBe(200);
    expect(r.body.memory).toBeUndefined();
    expect(toolNames(0)).toEqual(["recall", "remember"]);
    const all = kimi.requests[0]!.messages.map((m) => String(m.content ?? "")).join("\n");
    expect(all).toContain("<user_memory>");
  });
});
