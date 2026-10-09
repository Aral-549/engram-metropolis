// Golden tests for contracts/feedback.md (in-site bug reports): the route and its input rules, R3-R13. Redis is an
// in-memory stand-in for @upstash/redis with the same commands the route uses; the live database is checked by hand
// (contract "Status"). FROZEN: add cases, never edit.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ kv: new Map<string, number>(), lists: new Map<string, unknown[]>(), fail: false }));

vi.mock("@upstash/redis", () => {
  class Pipe {
    private ops: (() => unknown)[] = [];
    set(k: string, v: number, o: { nx?: boolean }) {
      this.ops.push(() => (o.nx && store.kv.has(k) ? null : (store.kv.set(k, v), "OK")));
      return this;
    }
    incr(k: string) {
      this.ops.push(() => {
        const n = (store.kv.get(k) ?? 0) + 1;
        store.kv.set(k, n);
        return n;
      });
      return this;
    }
    lpush(k: string, v: unknown) {
      this.ops.push(() => {
        const l = store.lists.get(k) ?? [];
        l.unshift(structuredClone(v));
        store.lists.set(k, l);
        return l.length;
      });
      return this;
    }
    ltrim(k: string, a: number, b: number) {
      this.ops.push(() => (store.lists.set(k, (store.lists.get(k) ?? []).slice(a, b + 1)), "OK"));
      return this;
    }
    async exec() {
      if (store.fail) throw new Error("redis down");
      return this.ops.map((f) => f());
    }
  }
  return { Redis: class { pipeline() { return new Pipe(); } } };
});

const SAGE = "https://engram-sage.vercel.app";
const OWN_HOST = "engram-vault.vercel.app";
const good = { app: "sage", path: "/", what: "The reply never arrived", ua: "Mozilla/5.0 test", vw: 390, vh: 844 };

function post(body: unknown, o: { origin?: string | null; ip?: string; raw?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json", host: OWN_HOST, "x-real-ip": o.ip ?? "203.0.113.7" };
  if (o.origin !== null) headers.origin = o.origin ?? SAGE;
  return new Request(`https://${OWN_HOST}/api/report`, { method: "POST", headers, body: o.raw ?? JSON.stringify(body) });
}
const reports = () => (store.lists.get("reports") ?? []) as Record<string, unknown>[];

async function route() {
  vi.resetModules();
  return import("../../../apps/vault/app/api/report/route.js");
}

beforeEach(() => {
  store.kv.clear();
  store.lists.clear();
  store.fail = false;
  vi.stubEnv("KV_REST_API_URL", "https://example.upstash.io");
  vi.stubEnv("KV_REST_API_TOKEN", "test-token");
  vi.stubEnv("NEXT_PUBLIC_SAGE_URL", SAGE);
  vi.stubEnv("NEXT_PUBLIC_WAYFARER_URL", "https://engram-wayfarer.vercel.app");
  vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("POST /api/report", () => {
  it("R3 a valid report from Sage is stored first, with app, path, ua, viewport and time; CORS allows Sage", async () => {
    const { POST } = await route();
    const res = await POST(post(good));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get("access-control-allow-origin")).toBe(SAGE);
    const [r] = reports();
    expect(r).toMatchObject({ app: "sage", path: "/", what: "The reply never arrived", ua: "Mozilla/5.0 test", vw: 390, vh: 844 });
    expect(typeof r!.id).toBe("string");
    expect(Math.abs(Date.now() - (r!.t as number))).toBeLessThan(5000);
  });

  it("R3 the vault's own pages are allowed (same origin)", async () => {
    const { POST } = await route();
    expect((await POST(post({ ...good, app: "vault" }, { origin: `https://${OWN_HOST}` }))).status).toBe(201);
  });

  it("R4 a report from /link never stores the query or the #token", async () => {
    const { POST } = await route();
    await POST(post({ ...good, app: "vault", path: "/link?port=7457&agent=2070#token=0123456789abcdef0123456789abcdef" }, { origin: `https://${OWN_HOST}` }));
    expect(reports()[0]!.path).toBe("/link");
    expect(JSON.stringify(reports())).not.toContain("0123456789abcdef");
    expect(JSON.stringify(reports())).not.toContain("port=");
  });

  it("R5 empty or whitespace-only text is 400 and nothing is stored", async () => {
    const { POST } = await route();
    for (const what of ["", "   \n\t "]) expect((await POST(post({ ...good, what }))).status).toBe(400);
    expect(reports()).toHaveLength(0);
  });

  it("R6 text over 2000 characters or contact over 200 is 400; exactly at the limits is accepted", async () => {
    const { POST } = await route();
    expect((await POST(post({ ...good, what: "x".repeat(2001) }))).status).toBe(400);
    expect((await POST(post({ ...good, contact: "c".repeat(201) }))).status).toBe(400);
    expect(reports()).toHaveLength(0);
    expect((await POST(post({ ...good, what: "x".repeat(2000), contact: "c".repeat(200) }))).status).toBe(201);
  });

  it("R7 a filled honeypot gets 201 but nothing is stored and nothing is counted", async () => {
    const { POST } = await route();
    const res = await POST(post({ ...good, website: "http://spam.example" }));
    expect(res.status).toBe(201);
    expect(reports()).toHaveLength(0);
    expect(store.kv.size).toBe(0);
  });

  it("R8 the 6th report from one IP in the window is 429; another IP is unaffected; the IP itself is never stored", async () => {
    const { POST } = await route();
    for (let i = 0; i < 5; i++) expect((await POST(post({ ...good, what: `n${i}` }))).status).toBe(201);
    const sixth = await POST(post({ ...good, what: "n5" }));
    expect(sixth.status).toBe(429);
    expect(await sixth.json()).toEqual({ ok: false, code: "RATE_LIMITED" });
    expect((await POST(post(good, { ip: "198.51.100.9" }))).status).toBe(201);
    expect(reports()).toHaveLength(6);
    const everything = JSON.stringify([...store.kv.keys(), ...reports()]);
    expect(everything).not.toContain("203.0.113.7");
    expect(everything).not.toContain("198.51.100.9");
  });

  it("R9 an origin that is not listed, or no origin at all, is 403 with no CORS header, and nothing is stored", async () => {
    const { POST, OPTIONS } = await route();
    for (const origin of ["https://evil.example", "https://engram-sage.vercel.app.evil.example", null]) {
      const res = await POST(post(good, { origin }));
      expect(res.status).toBe(403);
      expect(res.headers.get("access-control-allow-origin")).toBeNull();
    }
    expect(reports()).toHaveLength(0);
    const pre = await OPTIONS(new Request(`https://${OWN_HOST}/api/report`, { method: "OPTIONS", headers: { origin: "https://evil.example", host: OWN_HOST } }));
    expect(pre.status).toBe(403);
    const ok = await OPTIONS(new Request(`https://${OWN_HOST}/api/report`, { method: "OPTIONS", headers: { origin: SAGE, host: OWN_HOST } }));
    expect(ok.status).toBe(204);
    expect(ok.headers.get("access-control-allow-origin")).toBe(SAGE);
  });

  it("R10 no Redis credentials is 503 NOT_CONFIGURED; Redis failing is 503 SEND_FAILED", async () => {
    vi.stubEnv("KV_REST_API_URL", "");
    vi.stubEnv("KV_REST_API_TOKEN", "");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
    let res = await (await route()).POST(post(good));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, code: "NOT_CONFIGURED" });
    vi.stubEnv("KV_REST_API_URL", "https://example.upstash.io");
    vi.stubEnv("KV_REST_API_TOKEN", "test-token");
    store.fail = true;
    res = await (await route()).POST(post(good));
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ ok: false, code: "SEND_FAILED" });
  });

  it("R11 HTML and scripts are stored as the exact text, nothing else", async () => {
    const { POST } = await route();
    const what = `<script>alert(1)</script><img src=x onerror=alert(2)>`;
    await POST(post({ ...good, what }));
    expect(reports()[0]!.what).toBe(what);
  });

  it("R12 extra fields a page might add (vault address, memories, session) are never stored", async () => {
    const { POST } = await route();
    await POST(post({ ...good, owner: "0x1234", memories: ["vegetarian"], session: { k: 1 } }));
    expect(Object.keys(reports()[0]!).sort()).toEqual(["app", "id", "path", "t", "ua", "vh", "vw", "what"]);
  });

  it("R13 the route has no way to read reports: only POST and OPTIONS are exported", async () => {
    const mod = (await route()) as Record<string, unknown>;
    for (const m of ["GET", "PUT", "PATCH", "DELETE", "HEAD"]) expect(mod[m]).toBeUndefined();
  });

  it("edge: non-JSON, an array, over 8 KB, an unknown app, or a bad contact type are all 400", async () => {
    const { POST } = await route();
    expect((await POST(post(null, { raw: "not json" }))).status).toBe(400);
    expect((await POST(post([good]))).status).toBe(400);
    expect((await POST(post({ ...good, ua: "u".repeat(9000) }))).status).toBe(400);
    expect((await POST(post({ ...good, app: "evil" }))).status).toBe(400);
    expect((await POST(post({ ...good, contact: 42 }))).status).toBe(400);
    expect(reports()).toHaveLength(0);
  });

  it("edge: the list keeps only the newest 1000", async () => {
    store.lists.set("reports", Array.from({ length: 1000 }, (_, i) => ({ old: i })));
    const { POST } = await route();
    await POST(post(good));
    expect(reports()).toHaveLength(1000);
    expect(reports()[0]).toMatchObject({ what: good.what });
    expect(reports()[999]).toEqual({ old: 998 });
  });

  it("logging: one structured line per request with no report text, contact or user agent", async () => {
    const lines: string[] = [];
    vi.mocked(console.info).mockImplementation((s: string) => void lines.push(s));
    const { POST } = await route();
    await POST(post({ ...good, contact: "me@example.com" }));
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({ stage: "report", ok: true, app: "sage" });
    expect(lines[0]).not.toContain("never arrived");
    expect(lines[0]).not.toContain("me@example.com");
    expect(lines[0]).not.toContain("Mozilla");
  });
});
