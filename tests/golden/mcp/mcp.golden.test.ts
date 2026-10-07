// Golden tests for contracts/mcp.md (the engram-mcp side): pairing, tools and the link protocol, M1-M6, M8-M16.
// A fake vault tab connects over a real WebSocket; a real MCP client calls the tools over an in-memory transport.
// Written from the spec before the implementation. FROZEN: add cases, never edit.
import { afterEach, describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { WebSocket } from "ws";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createEngramMcp, startLink, type Link } from "../../../packages/mcp/src/index.js";

const VAULT = "https://vault.test";
const AGENT = 1999n;
let port = 17460;
const open: Array<{ close(): unknown }> = [];
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
});

async function setup(opts: { timeoutMs?: number } = {}) {
  const link = await startLink({ port: ++port, vaultOrigin: VAULT, agentId: AGENT, timeoutMs: opts.timeoutMs });
  open.push(link);
  const server = createEngramMcp({ link });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "claude-code", version: "1.0.0" });
  await client.connect(b);
  open.push(client);
  return { link, client };
}

type Frame = Record<string, unknown>;
/** A stand-in for the vault tab. `answer` decides each response. */
async function fakeVault(link: Link, o: { token?: string; origin?: string; answer?: (req: Frame) => Frame | null } = {}) {
  const ws = new WebSocket(`ws://127.0.0.1:${link.port}`, { origin: o.origin ?? VAULT });
  const frames: Frame[] = [];
  const closed = new Promise<void>((r) => ws.on("close", () => r()));
  ws.on("message", (raw) => {
    const m = JSON.parse(String(raw)) as Frame;
    frames.push(m);
    if (m.type === "req" && o.answer) {
      const res = o.answer(m);
      if (res) ws.send(JSON.stringify({ type: "res", id: m.id, ...res }));
    }
  });
  await new Promise<void>((r, j) => { ws.on("open", () => r()); ws.on("error", j); });
  ws.send(JSON.stringify({ type: "hello", v: 1, token: o.token ?? link.token }));
  open.push({ close: () => ws.close() });
  await new Promise((r) => setTimeout(r, 150));
  return { ws, frames, closed };
}
const text = (r: unknown) => ((r as { content: { type: string; text: string }[] }).content.map((c) => c.text).join("\n"));
const call = (client: Client, name: string, args: Record<string, unknown> = {}) => client.callTool({ name, arguments: args }).then(text);

describe("engram-mcp", () => {
  it("M1 a tool called before any vault tab is linked returns the link to open", async () => {
    const { link, client } = await setup();
    const t = await call(client, "recall", { query: "diet" });
    expect(t).toContain(link.url());
    expect(link.url()).toMatch(new RegExp(`^${VAULT}/link\\?port=${link.port}&agent=${AGENT}#token=[0-9a-f]{32}$`));
  });

  it("M2 the vault tab links with the right token and origin; it is told the client name", async () => {
    const { link, client } = await setup();
    const v = await fakeVault(link, { answer: (r) => (r.op === "status" ? { ok: true, result: { unlocked: true, approved: true, labels: ["preferences"], scope: "read" } } : null) });
    expect(link.linked()).toBe(true);
    expect(v.frames[0]).toMatchObject({ type: "welcome", v: 1, client: "claude-code" });
    expect(await call(client, "vault_status")).toMatch(/linked/i);
  });

  it("M3 a wrong or missing token is closed at once and never answered", async () => {
    const { link, client } = await setup();
    const v = await fakeVault(link, { token: "0".repeat(32) });
    await v.closed;
    expect(link.linked()).toBe(false);
    expect(await call(client, "recall", { query: "x" })).toContain(link.url());
  });

  it("M4 a connection from another website's origin is closed, even with the right token", async () => {
    const { link } = await setup();
    const v = await fakeVault(link, { origin: "https://evil.test" });
    await v.closed;
    expect(link.linked()).toBe(false);
  });

  it("M5 a second vault connection is refused; the first stays", async () => {
    const { link, client } = await setup();
    await fakeVault(link, { answer: () => ({ ok: true, result: { entries: [{ kind: "preference", text: "vegetarian" }] } }) });
    const second = await fakeVault(link);
    await second.closed;
    expect(link.linked()).toBe(true);
    expect(await call(client, "recall", { query: "diet" })).toContain("vegetarian");
  });

  it("M6 recall forwards the query and returns the disclosed entries as text", async () => {
    const { link, client } = await setup();
    const v = await fakeVault(link, { answer: () => ({ ok: true, result: { entries: [{ kind: "preference", text: "vegetarian" }, { kind: "fact", text: "lives in Pune" }] } }) });
    const t = await call(client, "recall", { query: "diet" });
    expect(t).toContain("- [preference] vegetarian");
    expect(t).toContain("- [fact] lives in Pune");
    expect(v.frames.find((f) => f.type === "req")).toMatchObject({ op: "recall", args: { query: "diet", all: false } });
  });

  it("M6 nothing relevant is said plainly", async () => {
    const { link, client } = await setup();
    await fakeVault(link, { answer: () => ({ ok: true, result: { entries: [] } }) });
    expect(await call(client, "recall", { query: "diet" })).toMatch(/nothing relevant/i);
  });

  it("M8 remember becomes a suggestion (or a plain save with auto-save on)", async () => {
    const { link, client } = await setup();
    let mode = "suggestion";
    const v = await fakeVault(link, { answer: () => ({ ok: true, result: { saved: mode } }) });
    expect(await call(client, "remember", { kind: "preference", text: "uses pnpm" })).toMatch(/suggestion; confirm it in your vault/i);
    mode = "auto";
    expect(await call(client, "remember", { kind: "preference", text: "uses pnpm" })).toMatch(/^Saved\./);
    expect(v.frames.find((f) => f.type === "req")).toMatchObject({ op: "remember", args: { kind: "preference", text: "uses pnpm" } });
  });

  it("M9 M11 M12 M13 vault refusals become plain text, never thrown errors", async () => {
    const { link, client } = await setup();
    let code = "READ_ONLY";
    await fakeVault(link, { answer: () => ({ ok: false, code, message: "x" }) });
    expect(await call(client, "remember", { kind: "fact", text: "x" })).toMatch(/can only read your vault/i);
    code = "VAULT_LOCKED";
    expect(await call(client, "recall", { query: "x" })).toMatch(/locked; unlock it in the vault tab/i);
    code = "NOT_APPROVED";
    expect(await call(client, "recall", { query: "x" })).toMatch(/not approved|revoked/i);
    code = "RATE_LIMITED";
    expect(await call(client, "recall", { query: "x" })).toMatch(/too many/i);
  });

  it("M10 when the vault tab goes away, tools say to open the link again", async () => {
    const { link, client } = await setup();
    const v = await fakeVault(link);
    v.ws.close();
    await v.closed;
    await new Promise((r) => setTimeout(r, 100));
    expect(link.linked()).toBe(false);
    expect(await call(client, "recall", { query: "x" })).toContain(link.url());
  });

  it("a vault that never answers times out with a plain message", async () => {
    const { link, client } = await setup({ timeoutMs: 300 });
    await fakeVault(link, { answer: () => null });
    expect(await call(client, "recall", { query: "x" })).toMatch(/didn't answer/i);
  });

  it("M14 junk frames are ignored and the link keeps working", async () => {
    const { link, client } = await setup();
    const v = await fakeVault(link, { answer: () => ({ ok: true, result: { entries: [{ kind: "note", text: "ok" }] } }) });
    v.ws.send("not json");
    v.ws.send(JSON.stringify({ type: "mystery" }));
    v.ws.send(JSON.stringify({ type: "res", id: "nobody-asked", ok: true, result: {} }));
    v.ws.send("x".repeat(70 * 1024));
    await new Promise((r) => setTimeout(r, 150));
    expect(link.linked()).toBe(true);
    expect(await call(client, "recall", { query: "x" })).toContain("ok");
  });

  it("M15 a port that is taken fails with a message naming ENGRAM_PORT", async () => {
    const taken = createServer().listen(++port, "127.0.0.1");
    await new Promise((r) => taken.once("listening", r));
    open.push({ close: () => new Promise((r) => taken.close(() => r(undefined))) });
    await expect(startLink({ port, vaultOrigin: VAULT, agentId: AGENT })).rejects.toThrow(/ENGRAM_PORT/);
  });

  it("M16 the CLI writes only MCP protocol to stdout; the link goes to stderr", async () => {
    const cli = spawn(process.execPath, ["--import", "tsx", "packages/mcp/src/cli.ts"], {
      cwd: new URL("../../../", import.meta.url).pathname,
      env: { ...process.env, ENGRAM_PORT: String(++port), ENGRAM_VAULT_URL: VAULT, ENGRAM_AGENT_ID: AGENT.toString() },
    });
    let out = "";
    let err = "";
    cli.stdout.on("data", (d) => (out += d));
    cli.stderr.on("data", (d) => (err += d));
    cli.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }) + "\n");
    const deadline = Date.now() + 15_000;
    while (!out.includes('"id":1') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
    cli.kill();
    const lines = out.split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const l of lines) expect(JSON.parse(l)).toHaveProperty("jsonrpc", "2.0");
    expect(err).toContain(`${VAULT}/link?port=`);
  });
});
