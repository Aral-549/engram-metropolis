// Adversarial cases for contracts/stats.md: malformed indexer payloads and concurrency.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseStats, ROW_LIMIT } from "../../../apps/vault/lib/stats.js";

const good = () => ({
  data: { Owner: [{ id: "o" }], DailyStat: [{ entries: 1, activeOwners: 1 }] },
});
const withData = (patch: Record<string, unknown>) => ({ data: { ...good().data, ...patch } });

describe("parseStats rejects bad payloads", () => {
  it("baseline is accepted", () => expect(parseStats(good())).toEqual({ vaults: 1, memories: 1, peakDay: 1 }));
  it.each([
    ["null", null], ["string", "x"], ["array", []], ["no data", {}], ["data null", { data: null }],
    ["errors with partial data", { ...good(), errors: [{ message: "x" }] }],
    ["entries string", withData({ DailyStat: [{ entries: "5", activeOwners: 1 }] })],
    ["entries bigint-like string", withData({ DailyStat: [{ entries: "9007199254740993", activeOwners: 1 }] })],
    ["entries negative", withData({ DailyStat: [{ entries: -1, activeOwners: 1 }] })],
    ["entries float", withData({ DailyStat: [{ entries: 1.5, activeOwners: 1 }] })],
    ["entries null", withData({ DailyStat: [{ entries: null, activeOwners: 1 }] })],
    ["entries unsafe", withData({ DailyStat: [{ entries: 2 ** 60, activeOwners: 1 }] })],
    ["sum overflows safe range", withData({ DailyStat: [{ entries: Number.MAX_SAFE_INTEGER, activeOwners: 1 }, { entries: 1, activeOwners: 1 }] })],
    ["null DailyStat row", withData({ DailyStat: [null] })],
    ["DailyStat row is a string", withData({ DailyStat: ["x"] })],
    ["null Owner row", withData({ Owner: [null] })],
    ["Owner row without id", withData({ Owner: [{}] })],
    ["Owner id number", withData({ Owner: [{ id: 1 }] })],
    ["Owner id empty", withData({ Owner: [{ id: "" }] })],
    ["Owner not a list", withData({ Owner: { id: "o" } })],
    ["Owner missing", withData({ Owner: undefined })],
    ["DailyStat missing", withData({ DailyStat: undefined })],
    ["DailyStat null", withData({ DailyStat: null })],
    ["entries ok but activeOwners missing", withData({ DailyStat: [{ entries: 5 }] })],
    ["activeOwners null", withData({ DailyStat: [{ entries: 5, activeOwners: null }] })],
    ["activeOwners string", withData({ DailyStat: [{ entries: 5, activeOwners: "3" }] })],
    ["activeOwners negative", withData({ DailyStat: [{ entries: 5, activeOwners: -3 }] })],
    ["activeOwners float", withData({ DailyStat: [{ entries: 5, activeOwners: 2.5 }] })],
    ["activeOwners NaN", withData({ DailyStat: [{ entries: 5, activeOwners: NaN }] })],
    ["activeOwners Infinity", withData({ DailyStat: [{ entries: 5, activeOwners: Infinity }] })],
    ["activeOwners huge", withData({ DailyStat: [{ entries: 5, activeOwners: 2 ** 60 }] })],
    ["one bad row among good rows", withData({ DailyStat: [{ entries: 1, activeOwners: 1 }, { entries: 1, activeOwners: "x" }] })],
    ["legacy shape only (no DailyStat rows fields)", withData({ DailyStat: [{ entries: 1 }], DailyStat_by_pk: { activeOwners: 1 } })],
  ])("%s", (_n, b) => expect(parseStats(b)).toBeNull());

  it("a list at the row limit may be truncated, so it is rejected instead of undercounted", () => {
    const rows = Array.from({ length: ROW_LIMIT }, (_, i) => ({ id: `o${i}` }));
    expect(parseStats(withData({ Owner: rows }))).toBeNull();
    expect(parseStats(withData({ Owner: rows.slice(1) }))?.vaults).toBe(ROW_LIMIT - 1);
  });
  it("a DailyStat list at the row limit is rejected too", () => {
    const rows = Array.from({ length: ROW_LIMIT }, () => ({ entries: 1, activeOwners: 1 }));
    expect(parseStats(withData({ DailyStat: rows }))).toBeNull();
    expect(parseStats(withData({ DailyStat: rows.slice(1) }))?.memories).toBe(ROW_LIMIT - 1);
  });
  it("duplicate owner ids count once; extra unknown fields and legacy keys are ignored", () => {
    const out = parseStats(withData({ Owner: [{ id: "a" }, { id: "a" }, { id: "A" }], Agent: [{ id: 1 }] }));
    expect(out?.vaults).toBe(2);
  });
  it("zero-valued days are valid", () => {
    expect(parseStats(withData({ DailyStat: [{ entries: 0, activeOwners: 0 }] }))).toEqual({ vaults: 1, memories: 0, peakDay: 0 });
  });
  it("does not leak extra fields", () => {
    const out = parseStats(withData({ Owner: [{ id: "0xsecret", x: 1 }] }));
    expect(Object.keys(out!).sort()).toEqual(["memories", "peakDay", "vaults"]);
  });
});

describe("route concurrency and env", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_INDEXER_URL", "https://indexer.test/g");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("concurrent cold requests share one upstream query", async () => {
    fetchMock.mockImplementation(async () => new Response(JSON.stringify(good())));
    const { GET } = await import("../../../apps/vault/app/api/stats/route.js");
    const rs = await Promise.all([GET(), GET(), GET(), GET(), GET()]);
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a failed shared query is not cached and the next request retries", async () => {
    fetchMock.mockResolvedValueOnce(new Response("x", { status: 500 }));
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(good())));
    const { GET } = await import("../../../apps/vault/app/api/stats/route.js");
    const [a, b] = await Promise.all([GET(), GET()]);
    expect([a.status, b.status]).toEqual([502, 502]);
    expect((await GET()).status).toBe(200);
  });

  it("missing env is 502 UPSTREAM without calling fetch", async () => {
    vi.stubEnv("NEXT_PUBLIC_INDEXER_URL", "");
    const { GET } = await import("../../../apps/vault/app/api/stats/route.js");
    const r = await GET();
    expect(r.status).toBe(502);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("expired cache triggers a new query", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      fetchMock.mockImplementation(async () => new Response(JSON.stringify(good())));
      const { GET } = await import("../../../apps/vault/app/api/stats/route.js");
      await GET();
      vi.setSystemTime(Date.now() + 61_000);
      await GET();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
