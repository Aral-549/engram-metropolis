// Popup-to-bridge unlock handoff (contracts/simple-flow.md C, cases C20-C23). The connect popup and the bridge
// iframe are both on the vault origin; posting with targetOrigin = vault origin means the browser delivers the
// secret only to frames currently on the vault origin, never to the app page that hosts them.
export const HANDOFF_TYPE = "engram:bridge:unlock";

import type { PolicyView } from "@engram/sdk";

/** `policy`: the approval the popup just wrote, so the bridge does not wait for the indexer (BUGLOG HO-2, C21b). */
export type HandoffMessage = { type: typeof HANDOFF_TYPE; v: 1; agentId: string; prf: Uint8Array; credentialId: string; policy?: PolicyView };

/** Posts the handoff to every frame of the popup's opener. Returns how many frames it was posted to. */
export function sendHandoff(opener: Window | null, msg: HandoffMessage, vaultOrigin: string): number {
  if (!opener) return 0;
  let n = 0;
  let count = 0;
  try {
    count = opener.length;
  } catch {
    return 0;
  }
  for (let i = 0; i < count; i++) {
    try {
      opener.frames[i]?.postMessage(msg, vaultOrigin);
      n++;
    } catch {
      /* a frame that went away: skip it */
    }
  }
  return n;
}

/** Validates a handoff on the bridge side; null for anything that is not exactly ours. */
export function acceptHandoff(ev: { origin: string; data: unknown }, opts: { vaultOrigin: string; agentId: bigint }): { prf: Uint8Array; credentialId: string; policy?: PolicyView } | null {
  if (ev.origin !== opts.vaultOrigin) return null;
  const d = ev.data as Partial<HandoffMessage> | null;
  if (!d || typeof d !== "object") return null;
  // Own fields only: nothing may come from a prototype (BUGLOG HO-1).
  if (!(["type", "v", "agentId", "prf", "credentialId"] as const).every((k) => Object.hasOwn(d, k))) return null;
  if (d.type !== HANDOFF_TYPE || d.v !== 1) return null;
  if (typeof d.agentId !== "string" || !/^(0|[1-9][0-9]{0,77})$/.test(d.agentId) || BigInt(d.agentId) !== opts.agentId) return null;
  if (!(d.prf instanceof Uint8Array) || d.prf.length !== 32) return null;
  if (typeof d.credentialId !== "string" || !d.credentialId || d.credentialId.length > 1024) return null;
  // The approval is checked in full by the SDK (primeApproval); here only that it is ours and well typed.
  if (Object.hasOwn(d, "policy")) {
    const p = d.policy as PolicyView | null;
    if (!p || typeof p !== "object" || typeof p.agentId !== "bigint" || p.agentId !== opts.agentId || typeof p.seq !== "bigint") return null;
    return { prf: d.prf, credentialId: d.credentialId, policy: p };
  }
  return { prf: d.prf, credentialId: d.credentialId };
}
