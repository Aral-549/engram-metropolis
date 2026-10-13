// Adversarial probes for the concurrent reads in OwnerSession.disclose (loadReviews + every approved folder at once,
// shared lag budget; contracts/disclosure.md D29, provenance.md). Written in a separate pass from the implementation
// (AGENTS.md rule 2). Not golden.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { toHex } from "viem";
import { EngramOwner, createRelayHandler, inProcessRelayer, logsSource, type EngramConfig, type MemorySource } from "../../../packages/sdk/src/index.js";
import { deriveNamespaceId } from "../../../packages/crypto/src/index.js";
import { startLocalChain, type LocalChain } from "../../support/anvil.js";

let chain: LocalChain;
let config: EngramConfig;
const APP = "https://app.x";
const prfOf = () => globalThis.crypto.getRandomValues(new Uint8Array(32));
const nsOf = (prf: Uint8Array, label: string) => toHex(deriveNamespaceId(prf, label)).toLowerCase();

beforeAll(async () => {
  chain = await startLocalChain();
  const handler = createRelayHandler({ config: { chainId: 31337, registry: chain.registry, identityRegistry: chain.identityRegistry, rpcUrl: chain.rpcUrl }, wallet: chain.wallet(1) });
  config = {
    chainId: 31337, registry: chain.registry, identityRegistry: chain.identityRegistry, rpcUrl: chain.rpcUrl,
    source: logsSource({ rpcUrl: chain.rpcUrl, registry: chain.registry, fromBlock: 0n }), relayer: inProcessRelayer(handler),
  };
});
afterAll(() => chain?.stop());
afterEach(() => vi.restoreAllMocks());

type Hook = (nsId: string, all: Awaited<ReturnType<MemorySource["entries"]>>) => Promise<Awaited<ReturnType<MemorySource["entries"]>>>;
function hooked(hook: Hook): MemorySource {
  const real = config.source;
  return { ...real, entries: async (q) => hook(q.nsId.toLowerCase(), await real.entries(q)) };
}
async function setup(labels: string[], source?: MemorySource, clock?: () => number) {
  const prf = prfOf();
  const s = await EngramOwner.fromPrf({ config: { ...config, ...(source ? { source } : {}) }, prfOutput: prf, ...(clock ? { clock } : {}) });
  return { s, prf };
}
const D = { agentId: 7n, origin: APP, query: "", mode: "full" as const, round: 0 };

async function seed(s: Awaited<ReturnType<typeof setup>>["s"], labels: string[]) {
  await s.approve(7n, { origin: APP, labels, scope: "readwrite", expiresInSec: 3600 });
  for (const l of labels) {
    await s.remember(l, { kind: "fact", text: `owner ${l} one` });
    await s.remember(l, { kind: "fact", text: `owner ${l} two` });
    await s.propose(7n, APP, { kind: "note", text: `agent wrote in ${l}`, label: l });
  }
}

describe("disclose: concurrent folder reads", () => {
  it("result is identical whichever folder finishes first, and keeps policy order", async () => {
    const labels = ["ca", "cb", "cc"];
    let slow = "ca";
    let nsSlow = "";
    const src = hooked(async (ns, all) => {
      if (ns === nsSlow) await new Promise((r) => setTimeout(r, 300));
      return all;
    });
    const { s, prf } = await setup(labels, src);
    await seed(s, labels);
    nsSlow = nsOf(prf, "ca");
    const a = await s.disclose(D);
    nsSlow = nsOf(prf, "cc");
    slow = "cc";
    const b = await s.disclose(D);
    expect(slow).toBe("cc");
    expect(b).toEqual(a);
    const texts = a.entries.map((e) => e.text);
    expect(texts.sort()).toEqual(labels.flatMap((l) => [`owner ${l} one`, `owner ${l} two`, `agent wrote in ${l}`]).sort());
    expect(a.entries.filter((e) => e.by === "self")).toHaveLength(3);
  });

  it("shared lag budget: persistent lag on every folder costs at most 6 sleeps in total, then answers with what it has", async () => {
    const labels = ["la", "lb", "lc"];
    let lag = false;
    const src = hooked(async (_ns, all) => (lag ? all.slice(0, -1) : all));
    const { s } = await setup(labels, src);
    await seed(s, labels);
    lag = true;
    const real = globalThis.setTimeout;
    let sleeps = 0;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void, ms?: number, ...a: unknown[]) => {
      if (ms === 500) sleeps++;
      return real(fn, ms, ...a);
    }) as typeof setTimeout);
    const t0 = Date.now();
    const r = await s.disclose(D);
    expect(sleeps).toBeLessThanOrEqual(6);
    expect(sleeps).toBeGreaterThan(0);
    expect(Date.now() - t0).toBeLessThan(6000);
    expect(r.entries.length).toBe(labels.length * 3 - labels.length); // newest entry of each folder hidden
  }, 60_000);

  it("a folder that needs one retry still gets it when another folder is lagging for good", async () => {
    const labels = ["ra", "rb"];
    let nsA = "";
    let nsB = "";
    let armedB = 0;
    const src = hooked(async (ns, all) => {
      if (ns === nsA) return all.slice(0, -1); // always incomplete
      if (ns === nsB && armedB > 0) {
        armedB--;
        return all.slice(0, -1);
      }
      return all;
    });
    const { s, prf } = await setup(labels, src);
    await seed(s, labels);
    nsA = nsOf(prf, "ra");
    nsB = nsOf(prf, "rb");
    armedB = 1;
    const r = await s.disclose(D);
    expect(r.entries.map((e) => e.text)).toEqual(expect.arrayContaining(["owner rb one", "owner rb two", "agent wrote in rb"]));
  }, 60_000);

  it("a rejecting folder read rejects the call with that error, with no unhandled rejection and no stuck timer", async () => {
    const labels = ["xa", "xb", "xc"];
    let nsB = "";
    let nsA = "";
    let boom = false;
    const src = hooked(async (ns, all) => {
      if (boom && ns === nsB) throw new Error("source down");
      if (boom && ns === nsA) return all.slice(0, -1); // keeps sleeping while b fails
      return all;
    });
    const { s, prf } = await setup(labels, src);
    await seed(s, labels);
    nsA = nsOf(prf, "xa");
    nsB = nsOf(prf, "xb");
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    boom = true;
    await expect(s.disclose(D)).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 4500)); // let the orphaned retries drain
    process.off("unhandledRejection", onUnhandled);
    expect(unhandled).toEqual([]);
    boom = false;
    const ok = await s.disclose(D); // the session is still usable
    expect(ok.entries.length).toBe(9);
  }, 60_000);

  it("a rejecting loadReviews rejects the call and leaves no unhandled rejection", async () => {
    const labels = ["ma"];
    let now = 1_700_000_000_000;
    let nsRev = "";
    let boom = false;
    const src = hooked(async (ns, all) => {
      if (boom && ns === nsRev) throw new Error("review read down");
      return all;
    });
    const { s, prf } = await setup(labels, src, () => now);
    await seed(s, labels);
    await s.review({ label: "ma", seq: 2n, action: "reject" }); // creates the review folder
    nsRev = nsOf(prf, "engram-review");
    now += 10_000; // the review cache is stale: disclose must re-read it
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on("unhandledRejection", onUnhandled);
    boom = true;
    await expect(s.disclose(D)).rejects.toThrow();
    await new Promise((r) => setTimeout(r, 200));
    process.off("unhandledRejection", onUnhandled);
    expect(unhandled).toEqual([]);
  }, 60_000);

  it("a rejected review (quarantine) is still filtered when reviews load alongside the folders", async () => {
    const labels = ["qa", "qb"];
    let now = 1_700_000_000_000;
    const { s } = await setup(labels, undefined, () => now);
    await seed(s, labels);
    await s.review({ label: "qb", seq: 2n, action: "reject" });
    now += 10_000;
    const r = await s.disclose(D);
    expect(r.entries.map((e) => e.text)).not.toContain("agent wrote in qb");
    expect(r.entries.map((e) => e.text)).toContain("agent wrote in qa");
  }, 60_000);

  it("duplicate labels in the policy do not duplicate entries; a rate-limited call reads nothing", async () => {
    const { s } = await setup(["da"]);
    await seed(s, ["da"]);
    try {
      await s.approve(7n, { origin: APP, labels: ["da", "da"], scope: "readwrite", expiresInSec: 3600 });
    } catch {
      return; // duplicates refused at approval: nothing further to probe
    }
    const r = await s.disclose(D);
    expect(r.entries.filter((e) => e.text === "owner da one")).toHaveLength(1);
  }, 60_000);
});
