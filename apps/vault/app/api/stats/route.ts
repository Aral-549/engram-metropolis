// GET /api/stats -- public usage counts from the indexer (contracts/stats.md). Counts only; no addresses, no auth.
import { LAUNCH_AT, parseStats, STATS_QUERY, type Stats } from "@/lib/stats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TIMEOUT_MS = 4000;
const TTL_MS = 60_000;
const CACHE = "public, s-maxage=60, stale-while-revalidate=60";

let cached: { at: number; stats: Stats } | null = null;
// One in-flight upstream query shared by concurrent requests (contract case 2).
let inflight: Promise<{ stats: Stats; at: number } | { reason: string; status?: number }> | null = null;

const fail = () => Response.json({ ok: false, code: "UPSTREAM" }, { status: 502, headers: { "cache-control": "no-store" } });

export async function GET() {
  const t0 = Date.now();
  const log = (ok: boolean, extra: Record<string, unknown> = {}) =>
    console.info(JSON.stringify({ stage: "stats", ok, durationMs: Date.now() - t0, ...extra }));

  const respond = (s: Stats, at: number) =>
    Response.json({ ok: true, ...s, updatedAt: new Date(at).toISOString() }, { headers: { "cache-control": CACHE } });

  if (cached && Date.now() - cached.at < TTL_MS) {
    log(true, { cache: "hit" });
    return respond(cached.stats, cached.at);
  }

  const url = process.env.NEXT_PUBLIC_INDEXER_URL;
  if (!url) {
    log(false, { code: "UPSTREAM", reason: "no_indexer_url" });
    return fail();
  }
  inflight ??= query(url).finally(() => {
    inflight = null;
  });
  const r = await inflight;
  if ("stats" in r) {
    log(true, { cache: "miss", ...r.stats });
    return respond(r.stats, r.at);
  }
  log(false, { code: "UPSTREAM", ...r });
  return fail();
}

async function query(url: string): Promise<{ stats: Stats; at: number } | { reason: string; status?: number }> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: STATS_QUERY, variables: { t: LAUNCH_AT } }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { reason: "http_status", status: res.status };
    const stats = parseStats(await res.json());
    if (!stats) return { reason: "bad_payload" };
    cached = { at: Date.now(), stats };
    return { stats, at: cached.at };
  } catch (e) {
    return { reason: e instanceof Error ? e.name : "error" };
  }
}
