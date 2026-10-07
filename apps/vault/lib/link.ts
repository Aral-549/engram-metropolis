// Vault side of the MCP link (contracts/mcp.md): answers engram-mcp requests with the SDK's own disclose and propose,
// so an MCP client gets exactly what a web app would: relevant entries from approved topics, every read logged,
// writes as suggestions. Pure over the session: the /link page owns the WebSocket.
import type { OwnerSession } from "@engram/sdk";

export type LinkCtx = { agentId: bigint; origin: string };
export type LinkRes = { type: "res"; id: string; ok: true; result: unknown } | { type: "res"; id: string; ok: false; code: string; message: string };

const KINDS = new Set(["fact", "preference", "note"]);

export async function answerLink(session: OwnerSession | null, frame: unknown, ctx: LinkCtx): Promise<LinkRes> {
  const f = frame as { type?: unknown; id?: unknown; op?: unknown; args?: unknown } | null;
  const id = f && typeof f === "object" && typeof f.id === "string" ? f.id.slice(0, 64) : "";
  const bad = (message: string): LinkRes => ({ type: "res", id, ok: false, code: "BAD_REQUEST", message });
  if (!f || typeof f !== "object" || f.type !== "req" || !id) return bad("not a request");
  const args = (f.args && typeof f.args === "object" ? f.args : {}) as Record<string, unknown>;
  const ok = (result: unknown): LinkRes => ({ type: "res", id, ok: true, result });

  try {
    if (f.op === "status") {
      if (!session) return ok({ unlocked: false });
      const p = await session.approvalFor(ctx.agentId);
      const approved = !!p && p.active && p.origin === ctx.origin && p.exp > Date.now();
      return ok({ unlocked: true, approved, labels: approved ? p!.labels : [], scope: approved ? p!.scope : undefined });
    }
    if (f.op !== "recall" && f.op !== "remember") return bad("unknown operation");
    if (f.op === "recall") {
      if (typeof args.query !== "string" || [...args.query].length > 500 || (args.all !== undefined && typeof args.all !== "boolean")) return bad("recall needs a query of at most 500 characters");
    } else if (typeof args.kind !== "string" || !KINDS.has(args.kind) || typeof args.text !== "string" || !args.text.trim() || [...args.text].length > 500) {
      return bad("remember needs kind fact|preference|note and text of 1-500 characters");
    }
    if (!session) return { type: "res", id, ok: false, code: "VAULT_LOCKED", message: "the vault is locked" };
    if (f.op === "recall") {
      const r = await session.disclose({ agentId: ctx.agentId, origin: ctx.origin, query: args.query as string, mode: args.all === true ? "full" : "relevant", round: 0 });
      return ok({ entries: r.entries });
    }
    await session.propose(ctx.agentId, ctx.origin, { kind: args.kind as "fact", text: (args.text as string).trim() });
    return ok({ saved: "suggestion" });
  } catch (e) {
    const code = typeof (e as { code?: unknown }).code === "string" ? (e as { code: string }).code : "VAULT_ERROR";
    return { type: "res", id, ok: false, code, message: code === "VAULT_ERROR" ? "the vault could not answer" : String((e as Error).message ?? code).slice(0, 200) };
  }
}

// ---------------------------------------------------------------------------- v2 handshake (BUGLOG MC-1)
// The /link page proves it knows the token and checks that engram-mcp does too; the token never crosses the wire,
// so a program squatting the port learns nothing and gets no answers.

const toHex = (b: ArrayBuffer | Uint8Array) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
const HEX32 = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;

export function newNonce(): string {
  return toHex(globalThis.crypto.getRandomValues(new Uint8Array(16)));
}

export async function linkProof(token: string, role: "mcp" | "vault", nv: string, ns: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey("raw", enc.encode(token), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toHex(await globalThis.crypto.subtle.sign("HMAC", key, enc.encode(`engram.link.v2|${role}|${nv}|${ns}`)));
}

/** Equal-length, constant-time comparison of two hex strings. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export function vaultHandshake(token: string) {
  const nv = newNonce();
  return {
    hello: { type: "hello", v: 2, nv } as const,
    /** Checks the server's proof; returns the auth frame to send, or null (wrong server: close and warn). */
    async onChallenge(m: unknown): Promise<{ auth: { type: "auth"; v: 2; proof: string } } | null> {
      const c = m as { type?: unknown; v?: unknown; ns?: unknown; proof?: unknown } | null;
      if (!c || c.type !== "challenge" || c.v !== 2 || typeof c.ns !== "string" || !HEX32.test(c.ns) || typeof c.proof !== "string" || !HEX64.test(c.proof)) return null;
      if (!sameHex(c.proof, await linkProof(token, "mcp", nv, c.ns))) return null;
      return { auth: { type: "auth", v: 2, proof: await linkProof(token, "vault", nv, c.ns) } };
    },
  };
}
