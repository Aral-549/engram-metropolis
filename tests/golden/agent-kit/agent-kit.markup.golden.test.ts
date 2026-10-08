// Golden tests for contracts/apps.md A40-A44 (BUGLOG MK-1): tool-call markup written as text never reaches the user.
// Written from the spec before the implementation. FROZEN: add cases, never edit.
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EngramOwner, type EngramConfig, type MemorySource } from "../../../packages/sdk/src/index.js";
import { createAgentServer } from "../../../packages/agent-kit/src/index.js";
import { FakeKimi } from "../../support/fake-kimi.js";

const ORIGIN = "https://wayfarer.test";
const AGENT = 1966n;
const SECRET = "test-continuation-secret-0123456789abcdef";
const boom = async () => { throw new Error("no chain"); };
const config: EngramConfig = {
  chainId: 31337, registry: "0x00000000000000000000000000000000000000aa", identityRegistry: "0x00000000000000000000000000000000000000bb",
  rpcUrl: "http://127.0.0.1:1", source: new Proxy({}, { get: () => boom }) as unknown as MemorySource, relayer: { submit: boom as never },
};
let kimi: FakeKimi;
const HINT = "Before planning meals, call recall once with the query \"diet allergies food preferences\".";
const server = () => createAgentServer({
  config, agentId: AGENT, origin: ORIGIN, mode: "disclosure", continuationSecret: SECRET, anonymous: {},
  kimi: { baseUrl: kimi.baseUrl, apiKey: "test-kimi-key", model: "k", timeoutMs: 2000 },
  persona: { name: "Wayfarer", description: "t", systemPrompt: "You are Wayfarer.", canWrite: false, labels: ["preferences"], recallHint: HINT },
});
async function cookie(srv: ReturnType<typeof server>) {
  const s = await EngramOwner.fromPrf({ config, prfOutput: globalThis.crypto.getRandomValues(new Uint8Array(32)) });
  return srv.session(await s.signAppSession({ agentId: AGENT, origin: ORIGIN, ttlSec: 3600, pairwise: true }));
}
const user = (t: string) => [{ role: "user" as const, content: t }];
const MARKUP = '<function_calls>\n<invoke name="recall">\n<arg name="query">diet allergies food preferences</arg>\n</invoke>\n</function_calls>';
const sys = (i: number) => kimi.requests[i]!.messages.filter((m) => m.role === "system").map((m) => String(m.content)).join("\n");

beforeAll(async () => { kimi = await new FakeKimi().start(); });
afterAll(() => kimi?.stop());
beforeEach(() => kimi.reset());

describe("tool-call markup", () => {
  it("A40 locked memory: the markup block is removed, the text around it kept", async () => {
    const srv = server();
    kimi.reply({ text: `I'll check your food preferences first.\n\n${MARKUP}\n\nHere is a plan: lentil soup.` });
    const r = await srv.chat({ cookie: await cookie(srv), messages: user("Plan three dinners"), disclosed: [], memory: "locked" });
    expect(r.status).toBe(200);
    expect(r.body.reply).not.toMatch(/function_calls|<invoke|<arg/);
    expect(r.body.reply).toContain("Here is a plan: lentil soup.");
  });

  it("A41 recall offered, markup instead of a real call: treated as the recall call", async () => {
    const srv = server();
    kimi.reply({ text: MARKUP }, { text: "Vegetarian plan." });
    const c = await cookie(srv);
    const r1 = await srv.chat({ cookie: c, messages: user("Plan three dinners"), disclosed: [], memory: "ok" });
    expect(r1.body.pending).toMatchObject({ tool: "recall", args: { query: "diet allergies food preferences", mode: "relevant" } });
    expect(r1.body.reply ?? "").not.toMatch(/function_calls|<invoke/);
    const r2 = await srv.continue({ cookie: c, continuation: r1.body.continuation!, result: { id: r1.body.pending!.id, ok: true, entries: [{ kind: "preference", text: "vegetarian", by: "owner" }] } });
    expect(r2.body.reply).toBe("Vegetarian plan.");
  });

  it("A42 markup naming a tool that is not offered is removed and never run", async () => {
    const srv = server();
    kimi.reply({ text: 'Sure.<function_calls><invoke name="delete_all"><arg name="x">1</arg></invoke></function_calls>' });
    const r = await srv.chat({ cookie: await cookie(srv), messages: user("hi"), disclosed: [], memory: "ok" });
    expect(r.body.pending).toBeUndefined();
    expect(r.body.reply).toBe("Sure.");
  });

  it("A43 the recall hint is given only when recall is offered; with no tools the model is told not to write tool calls", async () => {
    const srv = server();
    kimi.reply({ text: "a" }, { text: "b" });
    const c = await cookie(srv);
    await srv.chat({ cookie: c, messages: user("x"), disclosed: [], memory: "ok" });
    await srv.chat({ cookie: c, messages: user("x"), disclosed: [], memory: "locked" });
    expect(sys(0)).toContain(HINT);
    expect(sys(1)).not.toContain(HINT);
    expect(sys(1).toLowerCase()).toContain("no tools");
  });

  it("A44 Kimi's native tool-call tokens are removed", async () => {
    const srv = server();
    kimi.reply({ text: "Plan:<|tool_calls_section_begin|><|tool_call_begin|>functions.recall:0<|tool_call_argument_begin|>{\"query\":\"diet\"}<|tool_call_end|><|tool_calls_section_end|> soup." });
    const r = await srv.chat({ cookie: undefined, client: "1.1.1.1", messages: user("x") });
    expect(r.body.reply).toBe("Plan: soup.");
  });
});
