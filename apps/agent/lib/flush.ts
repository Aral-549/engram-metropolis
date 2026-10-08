// Sends memories that waited for a vault once memory is on (contracts/simple-flow.md C5, C5b; BUGLOG FL-2). The strip
// may not be unlocked yet right after connecting, so failures are retried with growing delays; each item is dropped
// from the waiting list as soon as it is written, so nothing is sent twice.
export const FLUSH_DELAYS_MS = [2000, 3000, 5000, 8000, 13000] as const;

export async function flushWithRetry<T>(o: {
  take: () => T[];
  propose: (item: T) => Promise<void>;
  drop: (item: T) => void;
  isActive?: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}): Promise<boolean> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const active = o.isActive ?? (() => true);
  for (let attempt = 0; ; attempt++) {
    for (const item of [...o.take()]) {
      try {
        await o.propose(item);
        o.drop(item);
      } catch {
        break; // locked or offline: wait and try again
      }
    }
    if (!o.take().length) return true;
    if (attempt >= FLUSH_DELAYS_MS.length || !active()) return false;
    await sleep(FLUSH_DELAYS_MS[attempt]!);
  }
}
