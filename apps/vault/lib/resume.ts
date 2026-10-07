// "Resume memory" (contracts/simple-flow.md B2, cases C37-C39): an app tab that was closed gets its vault strip back
// with one click, from the vault site's own copy. Resuming never widens access: it needs an active approval for
// exactly this agent and this app origin, and the resume popup has no approve control.
import type { PolicyView } from "@engram/sdk";

const exact = (s: unknown): string | null => {
  if (typeof s !== "string" || !s) return null;
  try {
    const u = new URL(s);
    return (u.protocol === "https:" || u.protocol === "http:") && u.origin !== "null" ? u.origin : null;
  } catch {
    return null;
  }
};

/** The app page's origin as the browser reports it (ancestorOrigins, else the referrer), or null. */
export function embedderOrigin(o: { ancestorOrigins?: ArrayLike<string>; referrer: string }): string | null {
  const first = o.ancestorOrigins && o.ancestorOrigins.length ? o.ancestorOrigins[0] : undefined;
  if (first !== undefined) return exact(first);
  return exact(o.referrer);
}

export type ResumeResult = { ok: true } | { ok: false; reason: "UNKNOWN_ORIGIN" | "NOT_APPROVED" | "ORIGIN" | "EXPIRED" };

export function resumeCheck(o: { policy: PolicyView | undefined; agentId: bigint; origin: string | null; now: number }): ResumeResult {
  if (!o.origin) return { ok: false, reason: "UNKNOWN_ORIGIN" };
  const p = o.policy;
  if (!p || p.agentId !== o.agentId || !p.active) return { ok: false, reason: "NOT_APPROVED" };
  if (p.origin !== o.origin) return { ok: false, reason: "ORIGIN" };
  if (p.exp <= o.now) return { ok: false, reason: "EXPIRED" };
  return { ok: true };
}

export function resumeUrl(vaultOrigin: string, agentId: bigint, appOrigin: string): string {
  const u = new URL("/resume", vaultOrigin);
  u.searchParams.set("agentId", agentId.toString());
  u.searchParams.set("origin", appOrigin);
  return u.toString();
}

/** What the resume popup says. A failed lookup is never reported as a refusal (BUGLOG RS-1). */
export function resumeMessage(r: ResumeResult | { ok: false; reason: "UNREACHABLE" }): string | null {
  if (r.ok) return null;
  switch (r.reason) {
    case "UNREACHABLE": return "Couldn't reach your vault just now. Close this window and press Resume again.";
    case "UNKNOWN_ORIGIN": return "This request doesn't say which app it came from.";
    case "NOT_APPROVED": return "This app isn't approved. Open it and press Turn on memory.";
    case "ORIGIN": return "This app is approved for a different site, so nothing was shared.";
    case "EXPIRED": return "This app's approval has expired. Open it and press Turn on memory.";
  }
}
