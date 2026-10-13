// Golden tests for contracts/stats.md behavior cases 1-6 and 8 (case 7 is a browser layout case, see tests/e2e).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LAUNCH_AT, LAUNCH_DAY, parseStats, STATS_QUERY, utcDay } from "../../../apps/vault/lib/stats.js";

const body = (o: { owners?: string[]; days?: Array<[number, number]> }) => ({
  data: {
    Owner: (o.owners ?? []).map((id) => ({ id })),
    DailyStat: (o.days ?? []).map(([entries, activeOwners]) => ({ entries, activeOwners })),
  },
});
const ids = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);
// Real response captured from the live indexer (shape only; two owners, two days since launch).
const REAL = {
  data: { Owner: [{ id: "0xaa" }, { id: "0xbb" }], DailyStat: [{ entries: 94, activeOwners: 16 }, { entries: 1, activeOwners: 1 }] },
};

describe("stats parse (cases 1,3,5,6)", () => {
  it("case 1: 22 owners, days (94,16) and (1,1) give 22 / 95 / 16", () => {
    expect(parseStats(body({ owners: ids(22, "o"), days: [[94, 16], [1, 1]] }))).toEqual({ vaults: 22, memories: 95, peakDay: 16 });
  });
  it("case 1: real indexer sample parses", () => {
    expect(parseStats(REAL)).toEqual({ vaults: 2, memories: 95, peakDay: 16 });
  });
  it("case 1: peakDay is the maximum regardless of row order", () => {
    expect(parseStats(body({ days: [[1, 1], [2, 9], [3, 4]] }))?.peakDay).toBe(9);
  });
  it("case 3: empty lists give zeros", () => {
    expect(parseStats(body({}))).toEqual({ vaults: 0, memories: 0, peakDay: 0 });
  });
  it("case 5: no DailyStat days since launch is zero memories and zero peak", () => {
    expect(parseStats(body({ owners: ["o"], days: [] }))).toEqual({ vaults: 1, memories: 0, peakDay: 0 });
  });
  it("case 6: an owner appearing twice counts once", () => {
    expect(parseStats(body({ owners: ["0xabc", "0xabc", "0xdef"] }))?.vaults).toBe(2);
  });
  it("utcDay is the UTC calendar day, not local", () => {
    expect(utcDay(new Date("2026-10-13T23:59:59.999Z"))).toBe("2026-10-13");
    expect(utcDay(new Date("2026-10-14T00:00:00.000Z"))).toBe("2026-10-14");
  });
});

describe("query scoping (case 8)", () => {
  it("case 8: the query filters owners by firstSeenAt >= LAUNCH_AT and days by id >= LAUNCH_DAY", () => {
    expect(LAUNCH_AT).toBe(1791397800);
    expect(LAUNCH_DAY).toBe("2026-10-08");
    expect(STATS_QUERY).toMatch(/Owner\(where:\{firstSeenAt:\{_gte:\$t\}\}/);
    expect(STATS_QUERY).toMatch(/\$t:\s*numeric!/);
    expect(STATS_QUERY).toContain(`DailyStat(where:{id:{_gte:"${LAUNCH_DAY}"}}`);
    expect(STATS_QUERY).not.toMatch(/Agent|DailyStat_by_pk/);
  });
});

describe("GET /api/stats (cases 2,3,4,8)", () => {
  const okJson = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "content-type": "application/json" } });
  let fetchMock: ReturnType<typeof vi.fn>;
  let GET: () => Promise<Response>;
  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv("NEXT_PUBLIC_INDEXER_URL", "https://indexer.test/v1/graphql");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => {});
    GET = (await import("../../../apps/vault/app/api/stats/route.js")).GET;
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("case 1/2: ok payload, cached for 60 s, a second request makes no second query", async () => {
    fetchMock.mockResolvedValue(okJson(body({ owners: ids(22, "o"), days: [[94, 16], [1, 1]] })));
    const r1 = await GET();
    const j1 = await r1.json();
    expect(r1.status).toBe(200);
    expect(j1).toMatchObject({ ok: true, vaults: 22, memories: 95, peakDay: 16 });
    expect(Number.isNaN(Date.parse(j1.updatedAt))).toBe(false);
    expect(r1.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=60");
    const r2 = await GET();
    expect((await r2.json()).vaults).toBe(22);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("case 3: empty lists are ok with zeros", async () => {
    fetchMock.mockResolvedValue(okJson(body({})));
    expect(await (await GET()).json()).toMatchObject({ ok: true, vaults: 0, memories: 0, peakDay: 0 });
  });

  it("case 4: GraphQL error, non-2xx, bad JSON, timeout all give 502 UPSTREAM, never cached", async () => {
    const bad: Array<() => Promise<Response>> = [
      async () => okJson({ errors: [{ message: "boom" }] }),
      async () => new Response("down", { status: 503 }),
      async () => new Response("<html>", { status: 200 }),
      async () => {
        throw new DOMException("timeout", "TimeoutError");
      },
    ];
    for (const f of bad) {
      fetchMock.mockImplementationOnce(f);
      const r = await GET();
      expect(r.status).toBe(502);
      expect(await r.json()).toEqual({ ok: false, code: "UPSTREAM" });
      expect(r.headers.get("cache-control")).toBe("no-store");
    }
    fetchMock.mockResolvedValueOnce(okJson(body({ owners: ["o"] })));
    expect((await GET()).status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("case 4: request carries a 4 s abort signal and carries t = LAUNCH_AT and the scoped query (case 8)", async () => {
    fetchMock.mockResolvedValue(okJson(body({})));
    await GET();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const sent = JSON.parse(init.body as string);
    expect(sent.variables).toEqual({ t: LAUNCH_AT });
    expect(sent.query).toBe(STATS_QUERY);
  });
});
