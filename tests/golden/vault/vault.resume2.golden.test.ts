// Regression case for BUGLOG RS-1: a failed lookup is never shown as "not approved". FROZEN: add, never edit.
import { describe, expect, it } from "vitest";
import { resumeMessage } from "../../../apps/vault/lib/resume.js";

describe("RS-1 resume messages", () => {
  it("an unreachable vault says so and does not tell the user to re-approve", () => {
    const m = resumeMessage({ ok: false, reason: "UNREACHABLE" })!;
    expect(m).toMatch(/couldn't reach your vault/i);
    expect(m).not.toMatch(/approve/i);
  });
  it("a real refusal names the reason; success says nothing", () => {
    expect(resumeMessage({ ok: false, reason: "NOT_APPROVED" })).toMatch(/isn't approved/);
    expect(resumeMessage({ ok: true })).toBeNull();
  });
});
