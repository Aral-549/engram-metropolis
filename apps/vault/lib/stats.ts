// Pure parsing/validation for GET /api/stats (spec: contracts/stats.md). No I/O here so it can be tested alone.

export type Stats = { vaults: number; memories: number; peakDay: number };

/**
 * The indexer is shared with the earlier hacksprint project (same registry), so every number is scoped to the Engram
 * launch: owners first seen at or after LAUNCH_AT, and DailyStat days from LAUNCH_DAY on (contracts/stats.md).
 * Hosted Envio has no Hasura aggregate fields, so rows are counted: Owner ids (capped at ROW_LIMIT rows; a list that
 * reaches the cap is treated as UPSTREAM rather than undercounted), memories as the sum of DailyStat.entries, and
 * peakDay as the largest DailyStat.activeOwners (the most vault owners active in one UTC day).
 */
export const ROW_LIMIT = 1000;
export const LAUNCH_AT = 1791397800; // 2026-10-08 00:00 IST, unix seconds
export const LAUNCH_DAY = "2026-10-08";

export const STATS_QUERY = `query($t:numeric!){
  Owner(where:{firstSeenAt:{_gte:$t}}, limit:${ROW_LIMIT}){ id }
  DailyStat(where:{id:{_gte:"${LAUNCH_DAY}"}}, limit:${ROW_LIMIT}){ entries activeOwners }
}`;

/** UTC day string the indexer uses as the DailyStat id. */
export const utcDay = (now: Date): string => now.toISOString().slice(0, 10);

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

const rowsOf = (v: unknown): unknown[] | null => (Array.isArray(v) && v.length < ROW_LIMIT ? v : null);

/** Distinct string ids; null if any row is malformed. A list at ROW_LIMIT may be truncated, so rowsOf rejects it. */
function distinctIds(rows: unknown[]): number | null {
  const ids = new Set<string>();
  for (const r of rows) {
    const id = (r as { id?: unknown } | null)?.id;
    if (typeof id !== "string" || id === "") return null;
    ids.add(id);
  }
  return ids.size;
}

/**
 * Turns a raw indexer GraphQL response body into Stats, or null when anything is wrong (errors array, missing
 * field, non-integer or negative number). No activity yet is zero, not a failure.
 */
export function parseStats(body: unknown): Stats | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as { data?: unknown; errors?: unknown };
  if (Array.isArray(b.errors) && b.errors.length > 0) return null;
  if (typeof b.data !== "object" || b.data === null) return null;
  const d = b.data as Record<string, unknown>;
  const owners = rowsOf(d.Owner);
  const days = rowsOf(d.DailyStat);
  if (owners === null || days === null) return null;
  let memories = 0;
  let peakDay = 0;
  for (const row of days) {
    const r = row as { entries?: unknown; activeOwners?: unknown } | null;
    if (!isCount(r?.entries) || !isCount(r?.activeOwners)) return null;
    memories += r.entries;
    peakDay = Math.max(peakDay, r.activeOwners);
  }
  if (!isCount(memories)) return null;
  const vaults = distinctIds(owners);
  if (vaults === null) return null;
  return { vaults, memories, peakDay };
}
