// In-site bug reports (contracts/feedback.md): checks what a reporter sent and builds the stored record. Pure: the
// route (app/api/report) owns Redis, CORS and the rate limit. Nothing here reads the vault or its session.

export const REPORT_APPS = ["vault", "sage", "wayfarer"] as const;
export type ReportApp = (typeof REPORT_APPS)[number];
export type ReportRecord = { id: string; t: number; app: ReportApp; path: string; what: string; contact?: string; ua: string; vw: number; vh: number };
export type ParsedReport = { ok: true; bot: boolean; report: Omit<ReportRecord, "id" | "t"> } | { ok: false; code: "BAD_REQUEST" };

export const MAX_WHAT = 2000;
export const MAX_CONTACT = 200;
export const MAX_BODY = 8 * 1024;

const chars = (s: string) => [...s].length;
const cut = (s: string, n: number) => [...s].slice(0, n).join("");
const size = (v: unknown) => (typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 100_000 ? v : 0);

/** The page path only: never a query or #fragment (the /link token lives there, R4). */
export function cleanPath(p: unknown): string {
  if (typeof p !== "string") return "/";
  const path = p.split(/[?#]/, 1)[0]!.trim();
  return path.startsWith("/") ? cut(path, 200) : "/";
}

export function parseReport(body: unknown): ParsedReport {
  const bad = { ok: false, code: "BAD_REQUEST" } as const;
  if (!body || typeof body !== "object" || Array.isArray(body)) return bad;
  const b = body as Record<string, unknown>;
  if (typeof b.what !== "string" || !b.what.trim() || chars(b.what) > MAX_WHAT) return bad;
  if (b.contact !== undefined && (typeof b.contact !== "string" || chars(b.contact) > MAX_CONTACT)) return bad;
  if (typeof b.app !== "string" || !(REPORT_APPS as readonly string[]).includes(b.app)) return bad;
  const contact = typeof b.contact === "string" ? b.contact.trim() : "";
  return {
    ok: true,
    // The hidden field: people never fill it (R7).
    bot: typeof b.website === "string" && b.website.length > 0,
    report: {
      app: b.app as ReportApp,
      path: cleanPath(b.path),
      what: b.what.trim(),
      ...(contact ? { contact } : {}),
      ua: typeof b.ua === "string" ? cut(b.ua, 300) : "",
      vw: size(b.vw),
      vh: size(b.vh),
    },
  };
}
