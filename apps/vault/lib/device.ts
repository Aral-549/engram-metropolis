// Stay signed in on this device (contracts/simple-flow.md B, cases C7-C14). The session's root secret is kept
// AES-GCM-encrypted under a non-extractable WebCrypto key; both live in this origin's storage (IndexedDB in the
// browser). Each storage partition (the vault site, each app's bridge) keeps its own copy.
import { EngramOwner, type EngramConfig, type OwnerSession, type SessionOptions } from "@engram/sdk";
import type { WebAuthnClient } from "@category-labs/mera";

export const STAY_MS = 7 * 24 * 3600 * 1000;

export type KV = { get(k: string): Promise<unknown>; set(k: string, v: unknown): Promise<void>; del(k: string): Promise<void> };

/** `ceremonyAt`: when the passkey was last really used (BUGLOG FL-1), so a new window keeps the 10-minute window. */
type Rec = { v: 1; owner: string; credentialId: string; iv: Uint8Array; ct: Uint8Array; exp: number; ceremonyAt?: number };

const isRec = (r: unknown): r is Rec => {
  const x = r as Rec;
  return !!x && x.v === 1 && typeof x.owner === "string" && typeof x.credentialId === "string" && !!x.credentialId &&
    x.iv instanceof Uint8Array && x.iv.length === 12 && x.ct instanceof Uint8Array && x.ct.length === 48 && Number.isFinite(x.exp) &&
    (x.ceremonyAt === undefined || Number.isFinite(x.ceremonyAt));
};
const isKey = (k: unknown): k is CryptoKey => typeof CryptoKey !== "undefined" && k instanceof CryptoKey;

export function deviceStore(opts: { kv: KV; clock?: () => number }) {
  const { kv } = opts;
  const now = opts.clock ?? Date.now;
  const subtle = globalThis.crypto.subtle;

  async function wrapKey(create: boolean): Promise<CryptoKey | null> {
    const k = await kv.get("wrap");
    if (isKey(k)) return k;
    if (!create) return null;
    const fresh = await subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
    await kv.set("wrap", fresh);
    return fresh;
  }

  async function clear() {
    await kv.del("session");
  }

  return {
    /** Keeps this session on the device for STAY_MS after now. */
    async save(session: OwnerSession) {
      if (!session.credentialId) return; // nothing to re-prompt with: never store
      const key = await wrapKey(true);
      const secret = session.exportRootSecret();
      try {
        const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
        const at = session.lastCeremonyAt;
        // The ceremony time is bound into the encryption: editing it in storage voids the record (FL-1).
        const aad = new TextEncoder().encode(`engram.device.v1:${session.owner}:${at ?? "-"}`);
        const ct = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, additionalData: aad }, key!, secret as Uint8Array<ArrayBuffer>));
        await kv.set("session", { v: 1, owner: session.owner, credentialId: session.credentialId, iv, ct, exp: now() + STAY_MS, ...(at !== undefined ? { ceremonyAt: at } : {}) } satisfies Rec);
      } finally {
        secret.fill(0);
      }
    },

    /** Re-opens the stored session without a prompt, or returns null (and deletes anything unusable). */
    async restore(o: { config: EngramConfig; rpId: string; webAuthnClient?: WebAuthnClient } & SessionOptions): Promise<OwnerSession | null> {
      let rec: unknown;
      try {
        rec = await kv.get("session");
      } catch {
        return null;
      }
      if (rec === undefined || rec === null) return null;
      if (!isRec(rec) || rec.exp < now()) {
        await clear();
        return null;
      }
      const key = await wrapKey(false);
      if (!key) {
        await clear();
        return null;
      }
      let secret: Uint8Array | undefined;
      try {
        const aad = new TextEncoder().encode(`engram.device.v1:${rec.owner}:${rec.ceremonyAt ?? "-"}`);
        secret = new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: rec.iv as Uint8Array<ArrayBuffer>, additionalData: aad }, key, rec.ct as Uint8Array<ArrayBuffer>));
        const s = await EngramOwner.restore({ ...o, prfOutput: secret, credentialId: rec.credentialId, ...(rec.ceremonyAt !== undefined ? { ceremonyAt: rec.ceremonyAt } : {}) });
        if (s.owner.toLowerCase() !== rec.owner.toLowerCase()) throw new Error("owner mismatch");
        await kv.set("session", { ...rec, exp: now() + STAY_MS }); // the 7 days restart (C8)
        return s;
      } catch {
        await clear();
        return null;
      } finally {
        secret?.fill(0);
      }
    },

    /** Restarts the 7 days (call on activity). */
    async touch() {
      const rec = await kv.get("session").catch(() => undefined);
      if (isRec(rec) && rec.exp >= now()) await kv.set("session", { ...rec, exp: now() + STAY_MS });
    },

    clear,
  };
}

export type DeviceStore = ReturnType<typeof deviceStore>;

/** Test and fallback store: lives in memory only. */
export function memoryKV(): KV {
  const m = new Map<string, unknown>();
  return { get: async (k) => m.get(k), set: async (k, v) => void m.set(k, v), del: async (k) => void m.delete(k) };
}

/** Browser store: one IndexedDB object store on this origin (partitioned per top-level site for iframes). */
export function idbKV(dbName = "engram-device"): KV {
  const db = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("kv");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const tx = async <T,>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>) => {
    const d = await db;
    return new Promise<T>((resolve, reject) => {
      const r = fn(d.transaction("kv", mode).objectStore("kv"));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  };
  return {
    get: (k) => tx("readonly", (s) => s.get(k)),
    set: async (k, v) => void (await tx("readwrite", (s) => s.put(v, k))),
    del: async (k) => void (await tx("readwrite", (s) => s.delete(k))),
  };
}

export type StorageLike = { getItem(k: string): string | null; setItem(k: string, v: string): void; removeItem(k: string): void };
const SESSION_ITEM = "engram-session";
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: unknown) => (typeof s === "string" ? Uint8Array.from(atob(s), (c) => c.charCodeAt(0)) : undefined);

/**
 * Apps' bridges keep their copy for the tab only (contracts/simple-flow.md B2): the encrypted session in
 * sessionStorage (gone when the tab closes), the wrapping key in IndexedDB (useless without it). A long-lived copy
 * left in this partition by an earlier build is deleted on sight (C42).
 */
export function tabKV(o: { session: StorageLike; persistent: KV }): KV {
  const dropLegacy = () => o.persistent.del("session").catch(() => {});
  return {
    async get(k) {
      if (k !== "session") return o.persistent.get(k);
      await dropLegacy();
      const raw = o.session.getItem(SESSION_ITEM);
      if (raw === null) return undefined;
      try {
        const r = JSON.parse(raw) as Record<string, unknown>;
        return { ...r, iv: unb64(r.iv), ct: unb64(r.ct) };
      } catch {
        return { broken: true }; // malformed: the store deletes it
      }
    },
    async set(k, v) {
      if (k !== "session") return o.persistent.set(k, v);
      await dropLegacy();
      const r = v as Record<string, unknown>;
      o.session.setItem(SESSION_ITEM, JSON.stringify({ ...r, iv: b64(r.iv as Uint8Array), ct: b64(r.ct as Uint8Array) }));
    },
    async del(k) {
      if (k !== "session") return o.persistent.del(k);
      o.session.removeItem(SESSION_ITEM);
      await dropLegacy();
    },
  };
}

/**
 * The store for one scope (BUGLOG DS-1). The vault site keeps its 7-day copy in `engram-device`; a strip keeps its
 * tab copy (and does its cleanup) in `engram-device-tab`, so even a browser that does not partition iframe storage
 * can never let a strip touch the vault site's session. Without sessionStorage a strip keeps nothing past the visit.
 */
export const SITE_DB = "engram-device";
export const TAB_DB = "engram-device-tab";
export function deviceFor(scope: "site" | "tab", o: { idb: (name: string) => KV; session?: StorageLike }): DeviceStore {
  if (scope === "site") return deviceStore({ kv: o.idb(SITE_DB) });
  return deviceStore({ kv: o.session ? tabKV({ session: o.session, persistent: o.idb(TAB_DB) }) : memoryKV() });
}
