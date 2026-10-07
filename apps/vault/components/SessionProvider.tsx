"use client";
// Vault session, kept on this device for 7 days (contracts/simple-flow.md B): restored without a passkey prompt,
// saved after every sign-in or handoff, deleted on Lock. Approving an app still asks for the passkey unless one
// was used in the last 10 minutes (simple-flow.md C; the SDK enforces it).
import { EngramOwner, type OwnerSession } from "@engram/sdk";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { explain, rpId, vaultConfig } from "@/lib/engram";
import { STAY_MS, deviceStore, idbKV, memoryKV, tabKV, type DeviceStore, type KV } from "@/lib/device";

type Status = "restoring" | "signed-out" | "working" | "ready" | "locked";
type Ctx = {
  status: Status;
  session: OwnerSession | null;
  error: string | null;
  signUp: () => Promise<OwnerSession | null>;
  signIn: () => Promise<OwnerSession | null>;
  /** Opens a session handed over by the connect popup (bridge only), and keeps it on this device. */
  adopt: (prf: Uint8Array, credentialId: string) => Promise<OwnerSession | null>;
  /** Ends the session and deletes this device's stored copy. */
  lock: () => void;
  /** Runs an action; an expired/ended session flips the UI to the unlock screen. */
  run: <T>(fn: (s: OwnerSession) => Promise<T>) => Promise<T | undefined>;
  clearError: () => void;
};

export const SESSION_OPTS = { reauthWindowMs: 10 * 60 * 1000, idleMs: STAY_MS };

const SessionContext = createContext<Ctx | null>(null);

/**
 * "site": the vault site and its popups keep the 7-day copy (simple-flow.md B). "tab": an app's vault strip keeps
 * its copy for the tab only (B2), so the vault site's Lock covers every long-lived copy.
 */
export type Scope = "site" | "tab";
const shared = new Map<Scope, DeviceStore>();
export function device(scope: Scope = "site"): DeviceStore {
  let s = shared.get(scope);
  if (!s) {
    let kv: KV;
    try {
      const idb = typeof indexedDB !== "undefined" ? idbKV() : memoryKV();
      kv = scope === "tab" && typeof sessionStorage !== "undefined" ? tabKV({ session: sessionStorage, persistent: idb }) : idb;
    } catch {
      kv = memoryKV(); // storage blocked: the session lasts one visit
    }
    s = deviceStore({ kv });
    shared.set(scope, s);
  }
  return s;
}

const log = (op: string, ok: boolean, reason?: string) => console.info(JSON.stringify({ stage: "vault", op, ok, ...(reason ? { reason } : {}) }));

export function SessionProvider({ children, scope = "site" }: { children: React.ReactNode; scope?: Scope }) {
  const [status, setStatus] = useState<Status>("restoring");
  const [session, setSession] = useState<OwnerSession | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hadSession = useRef(false);
  // The live session, readable from callbacks created before sign-in finished (e.g. "Unlock and approve").
  const current = useRef<OwnerSession | null>(null);
  const lastTouch = useRef(0);

  const take = useCallback((s: OwnerSession) => {
    current.current?.end();
    hadSession.current = true;
    current.current = s;
    setSession(s);
    setStatus("ready");
  }, []);

  // Stay signed in: restore this device's copy once, without a prompt (C7).
  useEffect(() => {
    let alive = true;
    void device(scope)
      .restore({ config: vaultConfig(), rpId: rpId(), ...SESSION_OPTS })
      .catch(() => null)
      .then((s) => {
        if (!alive) {
          s?.end();
          return;
        }
        log("storedUnlock", !!s, s ? "restored" : "none");
        if (s) take(s);
        else setStatus((st) => (st === "restoring" ? "signed-out" : st));
      });
    return () => {
      alive = false;
    };
  }, [take, scope]);

  const keep = useCallback(async (s: OwnerSession) => {
    try {
      await device(scope).save(s);
    } catch {
      /* storage blocked: the session still works for this visit */
    }
  }, [scope]);

  const open = useCallback(async (how: "up" | "in") => {
    setError(null);
    setStatus("working");
    try {
      const config = vaultConfig();
      const s =
        how === "up"
          ? await EngramOwner.signUp({ config, rpId: rpId(), rpName: "Engram", userName: `Engram vault ${new Date().toLocaleDateString()}`, ...SESSION_OPTS })
          : await EngramOwner.signIn({ config, rpId: rpId(), ...SESSION_OPTS });
      take(s);
      await keep(s);
      return s;
    } catch (e) {
      setError(explain(e));
      setStatus(hadSession.current ? "locked" : "signed-out");
      return null;
    }
  }, [take, keep]);

  const adopt = useCallback(async (prf: Uint8Array, credentialId: string) => {
    try {
      const s = await EngramOwner.restore({ config: vaultConfig(), rpId: rpId(), prfOutput: prf, credentialId, ...SESSION_OPTS });
      if (current.current && current.current.owner === s.owner) {
        s.end(); // already unlocked as this owner: keep the live session
        return current.current;
      }
      take(s);
      await keep(s);
      log("handoff", true);
      return s;
    } catch {
      log("handoff", false, "restore_failed");
      return null;
    } finally {
      prf.fill(0);
    }
  }, [take, keep]);

  const lock = useCallback(() => {
    current.current?.end();
    current.current = null;
    setSession(null);
    setStatus("locked");
    void device(scope).clear().catch(() => {});
  }, [scope]);

  const run = useCallback(
    async <T,>(fn: (s: OwnerSession) => Promise<T>) => {
      const s = current.current;
      if (!s) return undefined;
      try {
        setError(null);
        const r = await fn(s);
        // Activity restarts the 7 days, at most once a minute.
        if (Date.now() - lastTouch.current > 60_000) {
          lastTouch.current = Date.now();
          void device(scope).touch().catch(() => {});
        }
        return r;
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "SESSION_EXPIRED" || code === "SESSION_ENDED") {
          s.end();
          current.current = null;
          setSession(null);
          setStatus("locked");
        }
        setError(explain(e));
        return undefined;
      }
    },
    [scope],
  );

  const value = useMemo<Ctx>(
    () => ({ status, session, error, signUp: () => open("up"), signIn: () => open("in"), adopt, lock, run, clearError: () => setError(null) }),
    [status, session, error, open, adopt, lock, run],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Ctx {
  const c = useContext(SessionContext);
  if (!c) throw new Error("useSession outside SessionProvider");
  return c;
}
