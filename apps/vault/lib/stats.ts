// Pure parsing/validation for GET /api/stats (spec: contracts/stats.md). No I/O here so it can be tested alone.

export type Stats = { vaults: number; memories: number; agents: number; activeToday: number };

/**
 * Counts only. Hosted Envio does not expose Hasura aggregate fields, so rows are counted: Owner and Agent ids
 * (capped at ROW_LIMIT rows per query; a list that reaches the cap is treated as UPSTREAM rather than undercounted) and memories as the sum of DailyStat.entries.
 * Today's DailyStat row has id = UTC day, YYYY-MM-DD.
 */
export const ROW_LIMIT = 1000;

export const STATS_QUERY = `query($day:String!){
  Owner(limit:${ROW_LIMIT}){ id }
  Agent(limit:${ROW_LIMIT}){ id }
  DailyStat(limit:${ROW_LIMIT}){ entries }
  DailyStat_by_pk(id:$day){ activeOwners }
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
 * field, non-integer or negative number). A missing DailyStat row for today is zero (contract case 5).
 */
export function parseStats(body: unknown): Stats | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as { data?: unknown; errors?: unknown };
  if (Array.isArray(b.errors) && b.errors.length > 0) return null;
  if (typeof b.data !== "object" || b.data === null) return null;
  const d = b.data as Record<string, unknown>;
  const owners = rowsOf(d.Owner);
  const agentRows = rowsOf(d.Agent);
  const days = rowsOf(d.DailyStat);
  if (owners === null || agentRows === null || days === null) return null;
  let memories = 0;
  for (const row of days) {
    const n = (row as { entries?: unknown } | null)?.entries;
    if (!isCount(n)) return null;
    memories += n;
  }
  if (!isCount(memories)) return null;
  const vaults = distinctIds(owners);
  const agents = distinctIds(agentRows);
  if (vaults === null || agents === null) return null;
  let activeToday = 0;
  const day = d.DailyStat_by_pk;
  if (day !== null && day !== undefined) {
    const a = (day as { activeOwners?: unknown } | null)?.activeOwners;
    if (!isCount(a)) return null;
    activeToday = a;
  }
  return { vaults, memories, agents, activeToday };
}
