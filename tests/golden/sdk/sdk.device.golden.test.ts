// Golden tests for contracts/sdk.md "Device sessions" (#60-#66): stay signed in without a passkey prompt, while
// approving an app keeps its check. Local anvil chain. Written from the spec before the implementation.
// FROZEN: add cases, never edit.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { inspect } from "node:util";
import { EngramError, EngramOwner, createRelayHandler, inProcessRelayer, logsSource, type EngramConfig } from "../../../packages/sdk/src/index.js";
import { startLocalChain, type LocalChain } from "../../support/anvil.js";
import { FakeAuthenticator } from "../../support/fake-authenticator.js";

let chain: LocalChain;
let base: EngramConfig;
const RP = "vault.test";
const AGENT = 7n;
const ORIGIN = "https://sage.test";
const MIN = 60_000;
const DAY = 24 * 60 * MIN;

async function code(p: Promise<unknown> | (() => unknown)): Promise<string> {
  try {
    await (typeof p === "function" ? p() : p);
    return "OK";
  } catch (e) {
    if (e instanceof EngramError) return e.code;
    throw e;
  }
}
const approve = (s: Awaited<ReturnType<typeof EngramOwner.signUp>>) =>
  s.approve(AGENT, { origin: ORIGIN, labels: ["preferences"], scope: "read", expiresInSec: 3600 });

beforeAll(async () => {
  chain = await startLocalChain();
  const handler = createRelayHandler({ config: { chainId: 31337, registry: chain.registry, identityRegistry: chain.identityRegistry, rpcUrl: chain.rpcUrl } as never, wallet: chain.wallet(1) });
  base = {
    chainId: 31337, registry: chain.registry, identityRegistry: chain.identityRegistry, rpcUrl: chain.rpcUrl,
    source: logsSource({ rpcUrl: chain.rpcUrl, registry: chain.registry, fromBlock: 0n }), relayer: inProcessRelayer(handler), logger: () => {},
  };
  await chain.mintAgent(AGENT, chain.wallet(2).account.address);
});
afterAll(() => chain?.stop());

describe("device sessions", () => {
  it("#60 restore from an exported root secret: same owner, no passkey prompt", async () => {
    const auth = new FakeAuthenticator("dev-60");
    const s = await EngramOwner.signUp({ config: base, rpId: RP, rpName: "Engram", userName: "u60", webAuthnClient: auth.client });
    expect(typeof s.credentialId).toBe("string");
    const secret = s.exportRootSecret();
    const id = s.credentialId!;
    s.end();
    const before = { ...auth.calls };
    const r = await EngramOwner.restore({ config: base, rpId: RP, prfOutput: secret, credentialId: id, webAuthnClient: auth.client });
    expect(r.owner).toBe(s.owner);
    expect(auth.calls).toEqual(before);
  });

  it("#61 a restored session prompts on its first approve", async () => {
    const auth = new FakeAuthenticator("dev-61");
    const s = await EngramOwner.signUp({ config: base, rpId: RP, rpName: "Engram", userName: "u61", webAuthnClient: auth.client });
    const secret = s.exportRootSecret();
    const r = await EngramOwner.restore({ config: base, rpId: RP, prfOutput: secret, credentialId: s.credentialId!, webAuthnClient: auth.client });
    const g0 = auth.calls.get;
    await approve(r);
    expect(auth.calls.get).toBe(g0 + 1);
  });

  it("#62 a 10-minute reauth window: approve at +5 min is prompt-free, at +11 min it prompts", async () => {
    let now = 7_000_000;
    const auth = new FakeAuthenticator("dev-62");
    const s = await EngramOwner.signUp({ config: base, rpId: RP, rpName: "Engram", userName: "u62", webAuthnClient: auth.client, clock: () => now, reauthWindowMs: 10 * MIN });
    const g0 = auth.calls.get;
    now += 5 * MIN;
    await approve(s);
    expect(auth.calls.get).toBe(g0);
    now += 6 * MIN; // 11 min after the ceremony
    await approve(s);
    expect(auth.calls.get).toBe(g0 + 1);
  });

  it("#63 idleMs: a 7-day idle window keeps the session alive after 6 idle days", async () => {
    let now = 9_000_000;
    const auth = new FakeAuthenticator("dev-63");
    const long = await EngramOwner.signUp({ config: base, rpId: RP, rpName: "Engram", userName: "u63", webAuthnClient: auth.client, clock: () => now, idleMs: 7 * DAY });
    const short = await EngramOwner.fromPrf({ config: base, prfOutput: globalThis.crypto.getRandomValues(new Uint8Array(32)), clock: () => now });
    now += 6 * DAY;
    expect(await code(long.remember("preferences", { kind: "note", text: "still here" }))).toBe("OK");
    expect(await code(short.remember("preferences", { kind: "note", text: "x" }))).toBe("SESSION_EXPIRED");
  });

  it("#64 exportRootSecret after end() fails", async () => {
    const s = await EngramOwner.fromPrf({ config: base, prfOutput: globalThis.crypto.getRandomValues(new Uint8Array(32)) });
    s.end();
    expect(await code(() => s.exportRootSecret())).toBe("SESSION_ENDED");
  });

  it("#65 restore needs a credentialId and a 32-byte secret", async () => {
    const prf = globalThis.crypto.getRandomValues(new Uint8Array(32));
    expect(await code(EngramOwner.restore({ config: base, rpId: RP, prfOutput: prf, credentialId: "" }))).toBe("INPUT_INVALID");
    expect(await code(EngramOwner.restore({ config: base, rpId: RP, prfOutput: prf } as never))).toBe("INPUT_INVALID");
    expect(await code(EngramOwner.restore({ config: base, rpId: RP, prfOutput: new Uint8Array(31), credentialId: "abc" }))).toBe("INPUT_INVALID");
  });

  it("#66 a restored session serializes without secrets", async () => {
    const prf = globalThis.crypto.getRandomValues(new Uint8Array(32));
    const r = await EngramOwner.restore({ config: base, rpId: RP, prfOutput: prf, credentialId: "cred-66" });
    const hex = Buffer.from(prf).toString("hex");
    const text = JSON.stringify(r) + inspect(r, { depth: 10, showHidden: true });
    expect(text).not.toContain(hex);
    expect(text).not.toContain(Buffer.from(prf).toString("base64"));
  });
});
