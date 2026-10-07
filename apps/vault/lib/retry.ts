// Approval retries (contracts/simple-flow.md C18, amended 2026-10-08): network failures are retried with backoff;
// user, rule and chain errors never are. Errors are told apart by their code string, not by class, because the
// vault and the tests may load different copies of the SDK.
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 16000] as const;

const RETRYABLE = new Set(["RELAYER_UNAVAILABLE", "SOURCE_UNAVAILABLE"]);

export function isRetryable(e: unknown): boolean {
  const code = (e as { code?: unknown } | null)?.code;
  if (typeof code === "string") return RETRYABLE.has(code);
  return e instanceof Error; // not an Engram error: a failed fetch or RPC read
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  o: { sleep?: (ms: number) => Promise<void>; onRetry?: (attempt: number, of: number) => void } = {},
): Promise<T> {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (attempt >= RETRY_DELAYS_MS.length || !isRetryable(e)) throw e;
      o.onRetry?.(attempt + 1, RETRY_DELAYS_MS.length);
      await sleep(RETRY_DELAYS_MS[attempt]!);
    }
  }
}
