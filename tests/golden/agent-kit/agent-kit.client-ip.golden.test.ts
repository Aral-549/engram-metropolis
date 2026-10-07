// Regression case for BUGLOG AN-4: the anonymous rate-limit key cannot be chosen by the client. FROZEN: add, never edit.
import { describe, expect, it } from "vitest";
import { clientOf } from "../../../apps/agent/lib/client-ip.js";

const req = (h: Record<string, string>) => ({ headers: { get: (k: string) => h[k.toLowerCase()] ?? null } });

describe("AN-4 client IP for anonymous limits", () => {
  it("uses the hop the nearest proxy appended, never the client's first entry", () => {
    expect(clientOf(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientOf(req({ "x-forwarded-for": "1.1.1.1, 2.2.2.2, 203.0.113.9" }))).toBe("203.0.113.9");
  });
  it("prefers x-real-ip, and falls back to one shared key", () => {
    expect(clientOf(req({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "6.6.6.6" }))).toBe("198.51.100.4");
    expect(clientOf(req({}))).toBe("unknown");
    expect(clientOf(req({ "x-forwarded-for": " , " }))).toBe("unknown");
  });
});
