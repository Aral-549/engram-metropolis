// Golden tests for contracts/mcp.md, vault side: the link tab answers MCP requests with the SDK's own disclose and
// propose rules (M6-M9, M11, M12, status, malformed requests). Local anvil chain.
// Written from the spec before the implementation. FROZEN: add cases, never edit.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EngramOwner, createRelayHandler, inProcessRelayer, logsSource, type EngramConfig } from "../../../packages/sdk/src/index.js";
import { answerLink } from "../../../apps/vault/lib/link.js";
import { startLocalChain, type LocalChain } from "../../support/anvil.js";

let chain: LocalChain;
let config: EngramConfig;
const AGENT = 1999n;
const ORIGIN = "http://127.0.0.1:7457";
const ctx = { agentId: AGENT, origin: ORIGIN };

beforeAll(async () => {
  chain = await startLocalChain();
  const handler = createRelayHandler({ config: { chainId: 31337, registry: chain.registry, identityRegistry: chain.identityRegistry, rpcUrl: chain.rpcUrl }, wallet: chain.wallet(1) });
  config = { chainId: 31337, registry: chain.registry, identityRegistry: chain.identityRegistry, rpcUrl: chain.rpcUrl, source: logsSource({ rpcUrl: chain.rpcUrl, registry: chain.registry, fromBlock: 0n }), relayer: inProcessRelayer(handler) };
});
afterAll(() => chain?.stop());

async function vaultWith(scope: "read" | "readwrite") {
  const s = await EngramOwner.fromPrf({ config, prfOutput: globalThis.crypto.getRandomValues(new Uint8Array(32)) });
  await s.remember("preferences", { kind: "preference", text: "vegetarian" });
  await s.remember("health", { kind: "fact", text: "allergic to peanuts" });
  await s.approve(AGENT, { origin: ORIGIN, labels: ["preferences"], scope, expiresInSec: 3600 });
  return s;
}
const req = (op: string, args: Record<string, unknown> = {}) => ({ type: "req", id: "r1", op, args });

describe("vault link answers", () => {
  it("M6 M7 recall returns relevant entries from approved topics only", async () => {
    const s = await vaultWith("read");
    const r = await answerLink(s, req("recall", { query: "diet vegetarian peanuts", all: false }), ctx);
    expect(r).toMatchObject({ type: "res", id: "r1", ok: true });
    const texts = (r as { result: { entries: { text: string }[] } }).result.entries.map((e) => e.text);
    expect(texts).toEqual(["vegetarian"]); // health is not approved
  }, 60_000);

  it("M8 remember becomes a suggestion in the vault", async () => {
    const s = await vaultWith("readwrite");
    const r = await answerLink(s, req("remember", { kind: "preference", text: "uses pnpm" }), ctx);
    expect(r).toMatchObject({ ok: true, result: { saved: "suggestion" } });
    const pending = await s.proposals(["preferences"]);
    expect(pending.map((p) => p.text)).toContain("uses pnpm");
  }, 60_000);

  it("M9 remember on a read-only approval is refused", async () => {
    const s = await vaultWith("read");
    expect(await answerLink(s, req("remember", { kind: "fact", text: "x" }), ctx)).toMatchObject({ ok: false, code: "READ_ONLY" });
  }, 60_000);

  it("M11 a locked vault answers VAULT_LOCKED", async () => {
    expect(await answerLink(null, req("recall", { query: "x" }), ctx)).toMatchObject({ ok: false, code: "VAULT_LOCKED" });
  });

  it("M12 after a revoke the link answers NOT_APPROVED", async () => {
    const s = await vaultWith("read");
    await s.disapprove(AGENT);
    expect(await answerLink(s, req("recall", { query: "vegetarian" }), ctx)).toMatchObject({ ok: false, code: "NOT_APPROVED" });
  }, 60_000);

  it("status reports unlocked, approval, topics and scope", async () => {
    const s = await vaultWith("readwrite");
    expect(await answerLink(s, req("status"), ctx)).toMatchObject({ ok: true, result: { unlocked: true, approved: true, labels: ["preferences"], scope: "readwrite" } });
    expect(await answerLink(null, req("status"), ctx)).toMatchObject({ ok: true, result: { unlocked: false } });
  }, 60_000);

  it("malformed requests are refused with BAD_REQUEST, never thrown", async () => {
    const s = await vaultWith("read");
    for (const bad of [req("delete"), req("recall", { query: 5 }), req("remember", { kind: "secret", text: "x" }), { type: "req", op: "recall" }, null, "x"]) {
      const r = await answerLink(s, bad as never, ctx);
      expect(r).toMatchObject({ ok: false, code: "BAD_REQUEST" });
    }
  }, 60_000);
});
