// Golden tests for BUGLOG MC-1 / contracts/mcp.md M17-M21: the mutual v2 handshake. The vault side is the real
// helper the /link page uses (apps/vault/lib/link.ts); the server side is the real link server.
// Written from the spec before the implementation. FROZEN: add cases, never edit.
import { afterEach, describe, expect, it } from "vitest";
import { createServer } from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { serverProof, startLink, type Link } from "../../../packages/mcp/src/index.js";
import { linkProof, vaultHandshake } from "../../../apps/vault/lib/link.js";

const VAULT = "https://vault.test";
let port = 17560;
const open: Array<{ close(): unknown }> = [];
afterEach(async () => {
  for (const o of open.splice(0)) await o.close();
});

/** Runs the vault side of the handshake against a server; returns what the vault saw and whether it linked. */
async function vaultSide(p: number, token: string) {
  const hs = vaultHandshake(token);
  const ws = new WebSocket(`ws://127.0.0.1:${p}`, { origin: VAULT });
  open.push({ close: () => ws.close() });
  const sent: string[] = [];
  const send = (f: unknown) => { const s = JSON.stringify(f); sent.push(s); ws.send(s); };
  let verified = false;
  let welcomed = false;
  const done = new Promise<void>((resolve) => {
    ws.on("message", async (raw) => {
      const m = JSON.parse(String(raw));
      if (m.type === "challenge") {
        const r = await hs.onChallenge(m);
        if (!r) { ws.close(); resolve(); return; }
        verified = true;
        send(r.auth);
      } else if (m.type === "welcome" && verified) {
        welcomed = true;
        resolve();
      }
    });
    ws.on("close", () => resolve());
  });
  await new Promise<void>((r, j) => { ws.on("open", () => r()); ws.on("error", j); });
  send(hs.hello);
  await Promise.race([done, new Promise((r) => setTimeout(r, 3000))]);
  return { verified, welcomed, sent, ws };
}

async function link(): Promise<Link> {
  const l = await startLink({ port: ++port, vaultOrigin: VAULT, agentId: 1n });
  open.push(l);
  return l;
}

describe("mutual link handshake (v2)", () => {
  it("M17 with the right token both sides prove themselves and the link is up", async () => {
    const l = await link();
    const v = await vaultSide(l.port, l.token);
    expect(v.verified).toBe(true);
    expect(v.welcomed).toBe(true);
    expect(l.linked()).toBe(true);
  });

  it("M18 a program squatting the port without the token is not trusted", async () => {
    const http = createServer();
    const squatter = new WebSocketServer({ server: http });
    const seen: string[] = [];
    squatter.on("connection", (ws) => ws.on("message", (raw) => {
      seen.push(String(raw));
      const m = JSON.parse(String(raw));
      if (m.type === "hello") ws.send(JSON.stringify({ type: "challenge", v: 2, ns: "ab".repeat(16), proof: "00".repeat(32) }));
    }));
    const p = ++port;
    await new Promise<void>((r) => http.listen(p, "127.0.0.1", () => r()));
    open.push({ close: () => new Promise((r) => { squatter.close(); http.close(() => r(undefined)); }) });
    const token = "1f".repeat(16);
    const v = await vaultSide(p, token);
    expect(v.verified).toBe(false);
    expect(seen.some((s) => s.includes('"auth"'))).toBe(false);
    expect(seen.join("")).not.toContain(token);
  });

  it("M19 a wrong proof, or auth before hello, is closed and never linked", async () => {
    const l = await link();
    for (const frames of [
      [{ type: "hello", v: 2, nv: "cd".repeat(16) }, { type: "auth", v: 2, proof: "00".repeat(32) }],
      [{ type: "auth", v: 2, proof: "00".repeat(32) }],
    ]) {
      const ws = new WebSocket(`ws://127.0.0.1:${l.port}`, { origin: VAULT });
      const closed = new Promise<void>((r) => ws.on("close", () => r()));
      await new Promise<void>((r) => ws.on("open", () => r()));
      for (const f of frames) ws.send(JSON.stringify(f));
      await closed;
      expect(l.linked()).toBe(false);
    }
  });

  it("M20 the vault never puts the token on the wire", async () => {
    const l = await link();
    const v = await vaultSide(l.port, l.token);
    expect(v.sent.length).toBeGreaterThanOrEqual(2);
    for (const s of v.sent) expect(s).not.toContain(l.token);
  });

  it("M21 WebCrypto and node:crypto proofs agree", async () => {
    const token = "0123456789abcdef0123456789abcdef";
    const nv = "aa".repeat(16);
    const ns = "bb".repeat(16);
    for (const role of ["mcp", "vault"] as const) {
      expect(await linkProof(token, role, nv, ns)).toBe(serverProof(token, role, nv, ns));
    }
    expect(serverProof(token, "mcp", nv, ns)).not.toBe(serverProof(token, "vault", nv, ns));
  });
});
