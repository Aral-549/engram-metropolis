// Golden tests for contracts/mcp-multi-session.md cases 1-7 (BUGLOG RV-3). They run the real CLI (packages/mcp/src/cli.ts)
// on the real default ports 7457..7466, so every expectation is relative to which of those ports were free when the
// test started (ports held by something else on the machine count as "taken" exactly as the contract says).
import { afterEach, describe, expect, it } from "vitest";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:net";
import { WebSocket } from "ws";
import { vaultHandshake } from "../../../apps/vault/lib/link.js";

const VAULT = "https://vault.test";
const ROOT = new URL("../../../", import.meta.url).pathname;
const RANGE = Array.from({ length: 10 }, (_, i) => 7457 + i);
let highPort = 17700;

const cleanup: Array<() => Promise<unknown> | unknown> = [];
afterEach(async () => {
  for (const c of cleanup.splice(0).reverse()) await c();
});

/** Tries to listen on 127.0.0.1:p; resolves a server, or null when the port is not available. */
function hold(p: number): Promise<Server | null> {
  return new Promise((resolve) => {
    const s = createServer();
    s.once("error", () => resolve(null));
    s.listen(p, "127.0.0.1", () => {
      cleanup.push(() => new Promise((r) => s.close(() => r(undefined))));
      resolve(s);
    });
  });
}
/** Ports in RANGE that nothing is listening on right now. */
async function freeRange(): Promise<number[]> {
  const free: number[] = [];
  for (const p of RANGE) {
    const s = await new Promise<Server | null>((resolve) => {
      const t = createServer();
      t.once("error", () => resolve(null));
      t.listen(p, "127.0.0.1", () => resolve(t));
    });
    if (s) { free.push(p); await new Promise((r) => s.close(() => r(undefined))); }
  }
  return free;
}

type Session = { proc: ChildProcess; out: () => string; err: () => string; exited: Promise<number | null>; port: number; token: string; stop: () => Promise<number | null> };
/** Starts the real CLI. Resolves once it printed its link, or once it exited (port/token are then 0/""). */
async function startCli(env: Record<string, string> = {}): Promise<Session> {
  const e: Record<string, string | undefined> = { ...process.env, ENGRAM_VAULT_URL: VAULT, ENGRAM_AGENT_ID: "1999", ...env };
  if (!("ENGRAM_PORT" in env)) delete e.ENGRAM_PORT;
  const proc = spawn(process.execPath, ["--import", "tsx", "packages/mcp/src/cli.ts"], { cwd: ROOT, env: e });
  let out = "";
  let err = "";
  proc.stdout!.on("data", (d) => (out += d));
  proc.stderr!.on("data", (d) => (err += d));
  const exited = new Promise<number | null>((r) => proc.on("exit", (code) => r(code)));
  const s: Session = {
    proc, out: () => out, err: () => err, exited, port: 0, token: "",
    stop: async () => { proc.kill("SIGTERM"); return exited; },
  };
  cleanup.push(async () => { if (proc.exitCode === null && proc.signalCode === null) { proc.kill("SIGKILL"); await exited; } });
  const deadline = Date.now() + 15_000;
  let done = false;
  exited.then(() => (done = true));
  while (!/\/link\?port=\d+/.test(err) && !done && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
  const m = err.match(/\/link\?port=(\d+)&agent=\d+#token=([0-9a-f]{32})/);
  if (m) { s.port = Number(m[1]); s.token = m[2]!; }
  return s;
}

/** The vault side of the v2 handshake against a port with a given token: did it verify the server, was it welcomed? */
async function vaultSide(port: number, token: string) {
  const hs = vaultHandshake(token);
  const ws = new WebSocket(`ws://127.0.0.1:${port}`, { origin: VAULT });
  cleanup.push(() => ws.close());
  let verified = false;
  let welcomed = false;
  const done = new Promise<void>((resolve) => {
    ws.on("message", async (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "challenge") {
        const r = await hs.onChallenge(m);
        if (!r) { ws.close(); resolve(); return; }
        verified = true;
        ws.send(JSON.stringify(r.auth));
      } else if (m.type === "welcome" && verified) { welcomed = true; resolve(); }
    });
    ws.on("close", () => resolve());
    ws.on("error", () => resolve());
  });
  await new Promise<void>((r) => { ws.on("open", () => r()); ws.on("error", () => r()); });
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(hs.hello));
  await Promise.race([done, new Promise((r) => setTimeout(r, 3000))]);
  return { verified, welcomed };
}

describe("several engram-mcp sessions at once (contracts/mcp-multi-session.md)", () => {
  it("case 1 nothing on the first default port, no ENGRAM_PORT: binds the first port of the range", async () => {
    const free = await freeRange();
    expect(free.length).toBeGreaterThan(0);
    const a = await startCli();
    expect(a.port).toBe(free[0]);
    expect(a.err()).toContain(`${VAULT}/link?port=${free[0]}&agent=1999#token=`);
  });

  it("case 2 first port taken, no ENGRAM_PORT: binds the next free port, link shows it, the process stays healthy", async () => {
    const free = await freeRange();
    expect(free.length).toBeGreaterThan(1);
    expect(await hold(free[0]!)).not.toBeNull();
    const a = await startCli();
    expect(a.port).toBe(free[1]);
    expect(a.err()).toContain(`link?port=${free[1]}&`);
    // healthy: still running, answers MCP initialize on stdout, and its link port accepts the vault origin
    a.proc.stdin!.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } } }) + "\n");
    const deadline = Date.now() + 10_000;
    while (!a.out().includes('"id":1') && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    expect(a.proc.exitCode).toBeNull();
    expect(JSON.parse(a.out().split("\n").filter(Boolean)[0]!)).toHaveProperty("result");
    expect((await vaultSide(a.port, a.token)).welcomed).toBe(true);
  });

  it("case 3 every port of the range taken: exit code 1, stdout empty, message names ENGRAM_PORT and the range", async () => {
    for (const p of await freeRange()) expect(await hold(p)).not.toBeNull();
    const a = await startCli();
    expect(await a.exited).toBe(1);
    expect(a.out()).toBe("");
    expect(a.err()).toMatch(/ENGRAM_PORT/);
    expect(a.err()).toContain("7457-7466");
    expect(a.err()).not.toContain("/link?port=");
  });

  it("case 4 explicit ENGRAM_PORT taken: exits naming ENGRAM_PORT and does not scan to another port", async () => {
    const p = ++highPort;
    expect(await hold(p)).not.toBeNull();
    const a = await startCli({ ENGRAM_PORT: String(p) });
    expect(await a.exited).toBe(1);
    expect(a.out()).toBe("");
    expect(a.err()).toContain(`port ${p} is already in use`);
    expect(a.err()).toMatch(/ENGRAM_PORT/);
    expect(await hold(p + 1)).not.toBeNull(); // p+1 was never bound by the failed session
    expect(a.err()).not.toContain("/link?port=");
  });

  it("case 4b explicit ENGRAM_PORT that is free is bound exactly, even when the default range has free ports", async () => {
    const p = ++highPort;
    const a = await startCli({ ENGRAM_PORT: String(p) });
    expect(a.port).toBe(p);
  });

  it("case 5 two sessions, two tabs: ports and tokens differ; each answers only its own token", async () => {
    const free = await freeRange();
    expect(free.length).toBeGreaterThan(1);
    const a = await startCli();
    const b = await startCli();
    expect(a.port).toBe(free[0]);
    expect(b.port).toBe(free[1]);
    expect(a.token).not.toBe(b.token);
    // M18: a vault holding session 1's token must reject session 2's server, and the other way round
    expect((await vaultSide(b.port, a.token)).verified).toBe(false);
    expect((await vaultSide(a.port, b.token)).verified).toBe(false);
    // and each tab with its own token links
    expect((await vaultSide(a.port, a.token)).welcomed).toBe(true);
    expect((await vaultSide(b.port, b.token)).welcomed).toBe(true);
  });

  it("case 6 a port held by a non-Engram TCP listener is skipped like any taken port", async () => {
    const free = await freeRange();
    expect(free.length).toBeGreaterThan(1);
    expect(await hold(free[0]!)).not.toBeNull(); // plain TCP, speaks no websocket
    const a = await startCli();
    expect(a.port).toBe(free[1]);
  });

  it("case 7 session 1 exits: its port is freed and a new session takes it", async () => {
    const free = await freeRange();
    const a = await startCli();
    expect(a.port).toBe(free[0]);
    expect(await a.stop()).toBe(0);
    const b = await startCli();
    expect(b.port).toBe(free[0]);
  });

  it("edge two sessions started at the same instant both come up, on different ports (bind race)", async () => {
    const free = await freeRange();
    expect(free.length).toBeGreaterThan(1);
    const [a, b] = await Promise.all([startCli(), startCli()]);
    expect(a.port).toBeGreaterThan(0);
    expect(b.port).toBeGreaterThan(0);
    expect(a.port).not.toBe(b.port);
    expect(a.proc.exitCode).toBeNull();
    expect(b.proc.exitCode).toBeNull();
  });

  it("edge a scanned session writes nothing to stdout until MCP traffic (M16) and puts the port on stderr", async () => {
    const free = await freeRange();
    expect(await hold(free[0]!)).not.toBeNull();
    const a = await startCli();
    await new Promise((r) => setTimeout(r, 300));
    expect(a.out()).toBe("");
    expect(a.err()).toContain(`link?port=${a.port}&`);
  });
});
