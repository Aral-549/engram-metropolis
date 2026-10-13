// Adversarial probes for the "flush on ready, 1500 ms fallback" helper used by apps/agent connect() (C5, C5b).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runOnReadyOrTimeout } from "../../../apps/agent/lib/flush.js";

type Cb = (s: string) => void;
function fakeStrip(initial: string) {
  let status = initial;
  const subs = new Set<Cb>();
  return {
    strip: { status: () => status, onStatus: (cb: Cb) => (subs.add(cb), () => void subs.delete(cb)) } as never,
    emit: (s: string) => { status = s; [...subs].forEach((f) => f(s)); },
    subs,
  };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("runOnReadyOrTimeout", () => {
  it("runs once when ready arrives, and the later timer does not run it again", () => {
    const f = fakeStrip("locked");
    const run = vi.fn();
    runOnReadyOrTimeout({ strip: f.strip, timeoutMs: 1500, run });
    f.emit("locked");
    expect(run).not.toHaveBeenCalled();
    f.emit("ready");
    f.emit("ready");
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(f.subs.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("runs once from the timer when ready never comes, and unsubscribes", () => {
    const f = fakeStrip("locked");
    const run = vi.fn();
    runOnReadyOrTimeout({ strip: f.strip, timeoutMs: 1500, run });
    vi.advanceTimersByTime(1499);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    f.emit("ready");
    expect(run).toHaveBeenCalledTimes(1);
    expect(f.subs.size).toBe(0);
  });
  it("an already-ready strip runs immediately, once, with no timer left", () => {
    const f = fakeStrip("ready");
    const run = vi.fn();
    runOnReadyOrTimeout({ strip: f.strip, timeoutMs: 1500, run });
    expect(run).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.subs.size).toBe(0);
  });
  it("no strip: the timer alone runs it", () => {
    const run = vi.fn();
    runOnReadyOrTimeout({ strip: null, timeoutMs: 1500, run });
    vi.advanceTimersByTime(1500);
    expect(run).toHaveBeenCalledTimes(1);
  });
  it("cancel clears the timer and subscription without running", () => {
    const f = fakeStrip("locked");
    const run = vi.fn();
    const cancel = runOnReadyOrTimeout({ strip: f.strip, timeoutMs: 1500, run });
    cancel();
    f.emit("ready");
    vi.advanceTimersByTime(5000);
    expect(run).not.toHaveBeenCalled();
    expect(f.subs.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("a strip that reports ready synchronously while subscribing does not leak the subscription", () => {
    const subs = new Set<Cb>();
    const strip = { status: () => "locked", onStatus: (cb: Cb) => { cb("ready"); subs.add(cb); return () => void subs.delete(cb); } } as never;
    const run = vi.fn();
    runOnReadyOrTimeout({ strip, timeoutMs: 1500, run });
    vi.advanceTimersByTime(5000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(subs.size).toBe(0);
  });
});
