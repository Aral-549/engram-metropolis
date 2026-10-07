// The local link between engram-mcp and the user's vault tab (contracts/mcp.md "Pairing", "Link protocol").
// One vault connection at a time; it must come from the vault origin and present this process's one-time token.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer, type WebSocket } from "ws";

export class LinkError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export type Link = {
  readonly port: number;
  readonly token: string;
  /** The page the user opens to link their vault. */
  url(): string;
  linked(): boolean;
  setClient(name: string): void;
  /** Sends one request to the vault tab; resolves with its result or throws LinkError. */
  request(op: "recall" | "remember" | "status", args: Record<string, unknown>): Promise<unknown>;
  close(): Promise<void>;
};

const MAX_FRAME = 64 * 1024;
const HEX32 = /^[0-9a-f]{32}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/** proof(role) for the v2 handshake (contracts/mcp.md, BUGLOG MC-1). The token itself never crosses the wire. */
export function serverProof(token: string, role: "mcp" | "vault", nv: string, ns: string): string {
  return createHmac("sha256", Buffer.from(token, "utf8")).update(`engram.link.v2|${role}|${nv}|${ns}`).digest("hex");
}
const sameHex = (a: unknown, b: string) => typeof a === "string" && HEX64.test(a) && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
const HELLO_MS = 5_000;

export async function startLink(o: {
  port: number; vaultOrigin: string; agentId: bigint; token?: string; timeoutMs?: number; log?: (line: Record<string, unknown>) => void;
}): Promise<Link> {
  const token = o.token ?? randomBytes(16).toString("hex");
  const log = o.log ?? (() => {});
  const timeoutMs = o.timeoutMs ?? 20_000;
  let client = "unknown";
  let current: WebSocket | null = null;
  const pending = new Map<string, { resolve: (v: unknown) => void; reject: (e: LinkError) => void; timer: NodeJS.Timeout }>();

  const wss = new WebSocketServer({ host: "127.0.0.1", port: o.port, maxPayload: 1024 * 1024 });
  await new Promise<void>((resolve, reject) => {
    wss.once("listening", () => resolve());
    wss.once("error", (e: NodeJS.ErrnoException) =>
      reject(e.code === "EADDRINUSE" ? new Error(`port ${o.port} is already in use; set ENGRAM_PORT to another port`) : e));
  });

  const sameToken = (t: unknown) =>
    typeof t === "string" && t.length === token.length && timingSafeEqual(Buffer.from(t), Buffer.from(token));
  const welcome = (ws: WebSocket) => ws.send(JSON.stringify({ type: "welcome", v: 1, client }));

  wss.on("connection", (ws, req) => {
    // Other websites in the browser (M4) and a second vault tab (M5) are refused outright.
    if (req.headers.origin !== o.vaultOrigin) {
      log({ stage: "mcp", op: "link", ok: false, code: "LINK_REJECTED", why: "origin" });
      ws.close(1008, "origin");
      return;
    }
    if (current) {
      log({ stage: "mcp", op: "link", ok: false, code: "LINK_REJECTED", why: "already-linked" });
      ws.close(1008, "already linked");
      return;
    }
    let authed = false;
    let v2: { nv: string; ns: string } | null = null;
    const accept = () => {
      authed = true;
      clearTimeout(helloTimer);
      current = ws;
      log({ stage: "mcp", op: "link", ok: true });
      welcome(ws);
    };
    const reject = (why: string) => {
      log({ stage: "mcp", op: "link", ok: false, code: "LINK_REJECTED", why });
      ws.close(1008, why);
    };
    const helloTimer = setTimeout(() => !authed && ws.close(1008, "no hello"), HELLO_MS);
    ws.on("message", (raw, isBinary) => {
      if (isBinary || (raw as Buffer).length > MAX_FRAME) return; // M14: ignored, connection kept
      let m: Record<string, unknown>;
      try {
        m = JSON.parse(String(raw)) as Record<string, unknown>;
      } catch {
        return;
      }
      if (!m || typeof m !== "object") return;
      if (!authed) {
        if (current) return reject("already-linked");
        // v2 (what the vault page sends): mutual proof, the token never crosses the wire (MC-1).
        if (m.type === "hello" && m.v === 2 && !v2 && typeof m.nv === "string" && HEX32.test(m.nv)) {
          v2 = { nv: m.nv, ns: randomBytes(16).toString("hex") };
          ws.send(JSON.stringify({ type: "challenge", v: 2, ns: v2.ns, proof: serverProof(token, "mcp", v2.nv, v2.ns) }));
          return;
        }
        if (m.type === "auth" && m.v === 2 && v2 && sameHex(m.proof, serverProof(token, "vault", v2.nv, v2.ns))) return accept();
        // v1, kept for compatibility: the token in the frame.
        if (m.type === "hello" && m.v === 1 && !v2 && sameToken(m.token)) return accept();
        return reject("token");
      }
      if (m.type !== "res" || typeof m.id !== "string") return;
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.ok === true) p.resolve(m.result);
      else p.reject(new LinkError(typeof m.code === "string" ? m.code.slice(0, 40) : "VAULT_ERROR", typeof m.message === "string" ? m.message.slice(0, 200) : "the vault refused"));
    });
    ws.on("close", () => {
      clearTimeout(helloTimer);
      if (current !== ws) return;
      current = null;
      log({ stage: "mcp", op: "link", ok: false, code: "UNLINKED" });
      for (const [id, p] of pending) {
        clearTimeout(p.timer);
        p.reject(new LinkError("NOT_LINKED", "the vault tab went away"));
        pending.delete(id);
      }
    });
  });

  return {
    port: o.port,
    token,
    url: () => `${o.vaultOrigin}/link?port=${o.port}&agent=${o.agentId}#token=${token}`,
    linked: () => current !== null && current.readyState === current.OPEN,
    setClient(name) {
      client = String(name).slice(0, 64) || "unknown";
      if (current) welcome(current);
    },
    request(op, args) {
      const ws = current;
      if (!ws || ws.readyState !== ws.OPEN) return Promise.reject(new LinkError("NOT_LINKED", "no vault tab is linked"));
      const id = randomBytes(8).toString("hex");
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new LinkError("VAULT_TIMEOUT", "the vault did not answer in time"));
        }, timeoutMs);
        pending.set(id, { resolve, reject, timer });
        ws.send(JSON.stringify({ type: "req", id, op, args }));
      });
    },
    async close() {
      for (const p of pending.values()) clearTimeout(p.timer);
      pending.clear();
      for (const c of wss.clients) c.terminate();
      await new Promise<void>((r) => wss.close(() => r()));
    },
  };
}
