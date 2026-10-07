// POST /api/chat { messages, disclosed?, memory? } -> KIMI reply. In Disclosure mode the page sends what the user's
// vault disclosed for this message; tool calls come back as { pending, continuation } (contracts/disclosure.md).
import { guardRequest } from "@engram/agent-kit";
import { cookies } from "next/headers";
import { COOKIE, agentServer, clientOf } from "@/lib/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const g = await guardRequest(req, { origin: process.env.APP_ORIGIN ?? "", maxBytes: 160 * 1024 });
  if (!g.ok) return Response.json({ saved: [], accessRevoked: false, code: g.code }, { status: g.status });
  const cookie = (await cookies()).get(COOKIE)?.value;
  const body = (g.json ?? {}) as { messages?: unknown; disclosed?: unknown; memory?: unknown };
  try {
    const res = await agentServer().chat({ cookie, client: clientOf(req), messages: (body.messages ?? []) as never, disclosed: body.disclosed as never, memory: body.memory as never });
    return Response.json(res.body, { status: res.status, headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ saved: [], accessRevoked: false, code: "UNEXPECTED", message: "something went wrong" }, { status: 500 });
  }
}
