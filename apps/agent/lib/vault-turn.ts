// A strip that does not answer must cost at most one short wait per reply (contracts/apps.md A45-A47, BUGLOG HG-1).
// An unlocked strip is silent toward a site it has no approval for (D9), so silence is a real state, not a glitch.
export const BRIDGE_TIMEOUT_MS = 5000;
export const STUCK_NOTICE = "Your vault isn't answering this app. Press Turn on memory to reconnect.";

/** One per reply: after the first strip timeout, every later vault call in that reply fails at once. */
export function turnGuard() {
  let stuck = false;
  return {
    get stuck() {
      return stuck;
    },
    async run<T>(fn: () => Promise<T>): Promise<T> {
      if (stuck) throw Object.assign(new Error("the vault did not answer earlier in this reply"), { code: "VAULT_UNAVAILABLE" });
      try {
        return await fn();
      } catch (e) {
        if ((e as { code?: unknown } | null)?.code === "BRIDGE_TIMEOUT") stuck = true;
        throw e;
      }
    },
  };
}
export type TurnGuard = ReturnType<typeof turnGuard>;
