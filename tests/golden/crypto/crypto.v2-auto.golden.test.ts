// Golden cases for contracts/crypto.md "auto-save": `"auto":true` on a policy and the `auto` review action.
// Canonical strings written by hand from the spec key order. Written before the implementation. FROZEN: add, never edit.
import { describe, expect, it } from "vitest";
import { encodeEntryV2, parseAnyEntry } from "../../../packages/crypto/src/index.js";

const utf8 = (s: string) => new TextEncoder().encode(s);
async function code(f: () => unknown) {
  try {
    await f();
  } catch (e) {
    return (e as { code?: string }).code;
  }
  return "NO_THROW";
}
const policyBase = '{"v":2,"t":5,"kind":"policy","agent":"1965","origin":"https://sage.test","labels":["preferences"],"scope":"readwrite","exp":99,"active":true';
const policyAuto = policyBase + ',"auto":true}';
const policyPlain = policyBase + "}";
const reviewAuto = '{"v":2,"t":5,"kind":"review","target":{"l":"preferences","s":"3"},"agent":"1965","action":"auto"}';

describe("auto-save entries", () => {
  it("round-trips a policy with auto and the auto review byte-exactly; a policy without auto is unchanged", () => {
    for (const s of [policyAuto, policyPlain, reviewAuto]) {
      const doc = parseAnyEntry(utf8(s));
      expect(Buffer.from(encodeEntryV2(doc as never)).toString()).toBe(s);
    }
    expect(parseAnyEntry(utf8(policyAuto))).toMatchObject({ kind: "policy", auto: true });
    expect(parseAnyEntry(utf8(policyPlain))).not.toHaveProperty("auto");
    expect(parseAnyEntry(utf8(reviewAuto))).toMatchObject({ kind: "review", action: "auto" });
  });

  it("auto:false, a non-boolean auto, and an auto review with a copy are invalid", async () => {
    for (const s of [policyBase + ',"auto":false}', policyBase + ',"auto":"yes"}', reviewAuto.replace('"action":"auto"}', '"action":"auto","copy":"4"}')]) {
      expect(await code(() => parseAnyEntry(utf8(s)))).toBe("ENTRY_INVALID");
    }
    // Encoding an invalid document is INPUT_INVALID (frozen case 21); parsing one is ENTRY_INVALID. Corrected before the
    // first commit of this file: the draft expected ENTRY_INVALID here, which contradicted case 21.
    expect(await code(() => encodeEntryV2({ ...(parseAnyEntry(utf8(policyPlain)) as object), auto: false } as never))).toBe("INPUT_INVALID");
  });
});
