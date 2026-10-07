/**
 * The caller's IP for anonymous rate limits. Prefer x-real-ip (set by the platform); else the LAST x-forwarded-for
 * entry, which the nearest proxy appended. The first entry is client-controlled behind appending proxies (BUGLOG AN-4).
 */
export function clientOf(req: { headers: { get(name: string): string | null } }): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  const hops = (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean);
  return hops.at(-1) ?? "unknown";
}
