/**
 * Decorative cryptographic tokens and memory fragments that drift off the Engram wordmark.
 *
 * Deterministic pseudo-random seed guarantees identical SSR and client hydration.
 * Sized in em so it scales with the font size of the parent header.
 */

const TOKENS = [
  "0x8004", "PRF", "AES", "10k", "EIP-712", "0x733d", "MONAD", "ZK", "01", "10",
  "GCM", "0x1965", "SEAL", "MERA", "ENVIO", "PASSKEY", "0x", "1", "0"
];

const COLS = 10;
const ROWS = 6;

const FRAGMENTS = (() => {
  let seed = 8004;
  const next = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };

  const out: {
    text: string;
    left: number;
    top: number;
    size: number;
    opacity: number;
    bold: boolean;
    delay: number;
    dur: number;
    dx: number;
    dy: number;
  }[] = [];

  for (let c = 0; c < COLS; c++) {
    for (let r = 0; r < ROWS; r++) {
      const t = c / (COLS - 1);
      const keep = next() < 0.8 - t * 0.65;
      if (!keep) continue;

      const jx = next();
      const jy = next();
      const text = TOKENS[Math.floor(next() * TOKENS.length)];
      const bold = next() < 0.45;
      const delay = +(next() * -5).toFixed(2);
      const dur = +(2.0 + next() * 2.8).toFixed(2);
      const dx = +((next() - 0.2) * 3.5).toFixed(2);
      const dy = +((next() - 0.5) * 2.5).toFixed(2);

      out.push({
        text,
        left: +(((c + 0.1 + jx * 0.5) / COLS) * 100).toFixed(1),
        top: +(((r + 0.1 + jy * 0.5) / ROWS) * 100).toFixed(1),
        size: +(0.14 - t * 0.07).toFixed(3),
        opacity: +(0.85 - t * 0.7).toFixed(2),
        bold,
        delay,
        dur,
        dx,
        dy,
      });
    }
  }
  return out;
})();

export function TokenDrift({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`pointer-events-none ${className || ""}`}>
      {FRAGMENTS.map((d, i) => (
        <span
          key={i}
          className="digit-flicker font-mono absolute leading-none text-vault-ink"
          style={{
            left: `${d.left}%`,
            top: `${d.top}%`,
            fontSize: `${d.size}em`,
            opacity: d.opacity,
            ["--o" as string]: d.opacity,
            ["--dx" as string]: `${d.dx}em`,
            ["--dy" as string]: `${d.dy}em`,
            animationDelay: `${d.delay}s`,
            animationDuration: `${d.dur}s`,
            fontWeight: d.bold ? 700 : 500,
          }}
        >
          {d.text}
        </span>
      ))}
    </span>
  );
}
