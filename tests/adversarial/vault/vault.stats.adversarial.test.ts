// Adversarial cases for contracts/stats.md: malformed indexer payloads and concurrency.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseStats, ROW_LIMIT } from "../../../apps/vault/lib/stats.js";

const good = () => ({
  data: { Owner: [{ id: "o" }], Agent: [{ id: "a" }], DailyStat: [{ entries: 1 }], DailyStat_by_pk: { activeOwners: 1 } },
});
const withData = (patch: Record<string, unknown>) => ({ data: { ...good().data, ...patch } });

describe("parseStats rejects bad payloads", () => {
  it("baseline is accepted", () => expect(parseStats(good())).toEqual({ vaults: 1, memories: 1, agents: 1, activeToday: 1 }));
  it.each([
    ["null", null], ["string", "x"], ["array", []], ["no data", {}], ["data null", { data: null }],
    ["errors with partial data", { ...good(), errors: [{ message: "x" }] }],
    ["entries string", withData({ DailyStat: [{ entries: "5" }] })],
    ["entries bigint-like string", withData({ DailyStat: [{ entries: "9007199254740993" }] })],
    ["entries negative", withData({ DailyStat: [{ entries: -1 }] })],
    ["entries float", withData({ DailyStat: [{ entries: 1.5 }] })],
    ["entries NaN-ish null", withData({ DailyStat: [{ entries: null }] })],
    ["entries unsafe", withData({ DailyStat: [{ entries: 2 ** 60 }] })],
    ["sum overflows safe range", withData({ DailyStat: [{ entries: Number.MAX_SAFE_INTEGER }, { entries: 1 }] })],
    ["null DailyStat row", withData({ DailyStat: [null] })],
    ["null Owner row", withData({ Owner: [null] })],
    ["Owner row without id", withData({ Owner: [{}] })],
    ["Agent id number", withData({ Agent: [{ id: 1 }] })],
    ["Owner not a list", withData({ Owner: { id: "o" } })],
    ["Agent missing", withData({ Agent: undefined })],
    ["activeOwners string", withData({ DailyStat_by_pk: { activeOwners: "3" } })],
    ["activeOwners negative", withData({ DailyStat_by_pk: { activeOwners: -3 } })],
    ["by_pk is an empty object", withData({ DailyStat_by_pk: {} })],
  ])("%s", (_n, b) => expect(parseStats(b)).toBeNull());

  it("a list at the row limit may be truncated, so it is rejected instead of undercounted", () => {
    const rows = Array.from({ length: ROW_LIMIT }, (_, i) => ({ id: `o${i}` }));
    expect(parseStats(withData({ Owner: rows }))).toBeNull();
    expect(parseStats(withData({ Owner: rows.slice(1) }))?.vaults).toBe(ROW_LIMIT - 1);
  });
  it("does not leak extra fields", () => {
    const out = parseStats(withData({ Owner: [{ id: "0xsecret", x: 1 }] }));
    expect(Object.keys(out!).sort()).toEqual(["activeToday", "agents", "memories", "vaults"]);
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
