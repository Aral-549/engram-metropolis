"use client";
// Live usage strip (contracts/stats.md). Renders nothing visible until /api/stats answers ok; on any failure it
// stays hidden (never an error, never a fake number). Height is reserved so the page does not jump.
import { useEffect, useState } from "react";

type Data = { vaults: number; memories: number; peakDay: number };

const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0;

const fmt = (n: number) => n.toLocaleString("en-US");

export function StatsStrip() {
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const ctl = new AbortController();
    fetch("/api/stats", { signal: ctl.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (j && j.ok === true && isCount(j.vaults) && isCount(j.memories) && isCount(j.peakDay)) {
          setData({ vaults: j.vaults, memories: j.memories, peakDay: j.peakDay });
        } else setFailed(true);
      })
      .catch((e) => {
        if (!(e instanceof DOMException && e.name === "AbortError")) setFailed(true);
      });
    return () => ctl.abort();
  }, []);

  const items: [string, number][] = data
    ? [
        ["vaults", data.vaults],
        ["memories saved", data.memories],
        ["most vaults active in a day", data.peakDay],
      ]
    : [];

  return (
    <section aria-label="Live usage" className={failed ? undefined : "min-h-[190px] sm:min-h-[120px]"}>
      {data && (
        <div className="rounded-[14px] border-[3px] border-ink bg-card p-4 shadow-[5px_5px_0_var(--color-ink)]">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {items.map(([label, n]) => (
              <div key={label} className="flex flex-col-reverse">
                <dt className="text-sm text-ink-soft">{label}</dt>
                <dd className="text-2xl font-extrabold text-ink">{fmt(n)}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-2 text-sm text-ink-soft">since launch, from Monad testnet</p>
        </div>
      )}
    </section>
  );
}
