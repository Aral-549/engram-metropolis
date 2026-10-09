// POST /api/report -- in-site bug reports (contracts/feedback.md). Stores each report in Upstash Redis (list
// `reports`, newest first). Nothing on the site can read reports back: only POST and its CORS preflight exist (R13).
import { createHmac, randomUUID } from "node:crypto";
import { Redis } from "@upstash/redis";
import { MAX_BODY, parseReport, type ReportApp } from "@/lib/report";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIST = "reports";
const KEEP = 1000;
const WINDOW_SEC = 600;
const PER_WINDOW = 5;

let redis: Redis | null | undefined;
function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  redis = url && token ? new Redis({ url, token }) : null;
  return redis;
}

const originOf = (u: string | undefined) => {
  try {
    return u ? new URL(u).origin : null;
  } catch {
    return null;
  }
};

/** This site, Sage and Wayfarer (R9). */
function allowedOrigin(req: Request): string | null {
  const origin = req.headers.get("origin");
  if (!origin) return null;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const own = host ? `${/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? "http" : "https"}://${host}` : null;
  const ok = [own, originOf(process.env.NEXT_PUBLIC_SAGE_URL), originOf(process.env.NEXT_PUBLIC_WAYFARER_URL)];
  return ok.includes(origin) ? origin : null;
}

const cors = (origin: string) => ({ "access-control-allow-origin": origin, "access-control-allow-methods": "POST", "access-control-allow-headers": "content-type", vary: "Origin" });

/** Same rule as the agent app (BUGLOG AN-4): x-real-ip, else the last x-forwarded-for hop. */
function clientIp(req: Request): string {
  const real = req.headers.get("x-real-ip")?.trim();
  if (real) return real;
  return (req.headers.get("x-forwarded-for") ?? "").split(",").map((h) => h.trim()).filter(Boolean).at(-1) ?? "unknown";
}

export async function OPTIONS(req: Request) {
  const origin = allowedOrigin(req);
  return origin ? new Response(null, { status: 204, headers: cors(origin) }) : new Response(null, { status: 403 });
}

export async function POST(req: Request) {
  const t0 = Date.now();
  let app: ReportApp | "?" = "?";
  const log = (ok: boolean, code?: string) => console.info(JSON.stringify({ stage: "report", ok, ...(code ? { code } : {}), app, durationMs: Date.now() - t0 }));
  const origin = allowedOrigin(req);
  if (!origin) {
    log(false, "FORBIDDEN");
    return Response.json({ ok: false, code: "FORBIDDEN" }, { status: 403 });
  }
  const headers = { ...cors(origin), "cache-control": "no-store" };
  const answer = (status: number, code?: string) => {
    log(status < 300, code);
    return Response.json(code ? { ok: false, code } : { ok: true }, { status, headers });
  };

  if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY) return answer(400, "BAD_REQUEST");
  const text = await req.text();
  if (text.length > MAX_BODY) return answer(400, "BAD_REQUEST");
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return answer(400, "BAD_REQUEST");
  }
  const parsed = parseReport(body);
  if (!parsed.ok) return answer(400, "BAD_REQUEST");
  app = parsed.report.app;
  if (parsed.bot) return answer(201); // looks sent; nothing stored (R7)

  const r = getRedis();
  if (!r) return answer(503, "NOT_CONFIGURED");
  try {
    // Count per IP without storing it: a keyed hash that expires with the window (R8).
    const who = createHmac("sha256", process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN ?? "")
      .update(clientIp(req))
      .digest("hex")
      .slice(0, 32);
    const key = `report:rl:${who}`;
    const counted = await r.pipeline().set(key, 0, { nx: true, ex: WINDOW_SEC }).incr(key).exec<[unknown, number]>();
    if (counted[1] > PER_WINDOW) return answer(429, "RATE_LIMITED");
    await r.pipeline().lpush(LIST, { id: randomUUID(), t: Date.now(), ...parsed.report }).ltrim(LIST, 0, KEEP - 1).exec();
    return answer(201);
  } catch {
    return answer(503, "SEND_FAILED");
  }
}
