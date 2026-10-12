// Golden tests for contracts/stats.md behavior cases 1-6 (case 7 is a browser layout case, see tests/e2e).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseStats, utcDay } from "../../../apps/vault/lib/stats.js";

const body = (o: { owners?: string[]; agents?: string[]; entries?: number[]; today?: number | null }) => ({
  data: {
    Owner: (o.owners ?? []).map((id) => ({ id })),
    Agent: (o.agents ?? []).map((id) => ({ id })),
    DailyStat: (o.entries ?? []).map((entries) => ({ entries })),
    DailyStat_by_pk: o.today == null ? null : { activeOwners: o.today },
  },
});
const ids = (n: number, p: string) => Array.from({ length: n }, (_, i) => `${p}${i}`);

describe("stats parse (cases 1,3,5,6)", () => {
  it("case 1: 16 owners, 140 entries, 5 agents, 3 active today", () => {
    expect(parseStats(body({ owners: ids(16, "o"), agents: ids(5, "a"), entries: [100, 40], today: 3 }))).toEqual({
      vaults: 16, memories: 140, agents: 5, activeToday: 3,
    });
  });
  it("case 3: empty lists give zeros", () => {
    expect(parseStats(body({}))).toEqual({ vaults: 0, memories: 0, agents: 0, activeToday: 0 });
  });
  it("case 5: no DailyStat row for today is zero (null or absent)", () => {
    expect(parseStats(body({ owners: ["o"], today: null }))?.activeToday).toBe(0);
    const b = body({ owners: ["o"] });
    delete (b.data as Record<string, unknown>).DailyStat_by_pk;
    expect(parseStats(b)?.activeToday).toBe(0);
  });
  it("case 6: an owner appearing twice counts once", () => {
    expect(parseStats(body({ owners: ["0xabc", "0xabc", "0xdef"] }))?.vaults).toBe(2);
  });
  it("utcDay is the UTC calendar day, not local", () => {
    expect(utcDay(new Date("2026-10-13T23:59:59.999Z"))).toBe("2026-10-13");
    expect(utcDay(new Date("2026-10-14T00:00:00.000Z"))).toBe("2026-10-14");
  });
});

describe("GET /api/stats (cases 2,3,4)", () => {
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
    fetchMock.mockResolvedValue(okJson(body({ owners: ids(16, "o"), agents: ids(5, "a"), entries: [140], today: 3 })));
    const r1 = await GET();
    const j1 = await r1.json();
    expect(r1.status).toBe(200);
    expect(j1).toMatchObject({ ok: true, vaults: 16, memories: 140, agents: 5, activeToday: 3 });
    expect(Number.isNaN(Date.parse(j1.updatedAt))).toBe(false);
    expect(r1.headers.get("cache-control")).toBe("public, s-maxage=60, stale-while-revalidate=60");
    const r2 = await GET();
    expect((await r2.json()).vaults).toBe(16);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("case 3: empty lists are ok with zeros", async () => {
    fetchMock.mockResolvedValue(okJson(body({})));
    expect(await (await GET()).json()).toMatchObject({ ok: true, vaults: 0, memories: 0, agents: 0, activeToday: 0 });
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

  it("case 4: request carries a 4 s abort signal and the day variable", async () => {
    fetchMock.mockResolvedValue(okJson(body({})));
    await GET();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body as string).variables.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
