/**
 * Fixed ambient grainy gradient ground for the Engram landing page.
 *
 * Features slow-drifting liquid gradient fields (Monad purple, amber pop, cyber sage)
 * underneath high-frequency procedural film grain. CSS GPU-accelerated and fixed behind the
 * page, incurring zero scroll or tab-switching overhead. aria-hidden.
 */

const BLOBS: { className: string; style: React.CSSProperties }[] = [
  {
    className: "left-[-20vw] top-[-18vh] h-[85vh] w-[75vw]",
    style: {
      background: "radial-gradient(closest-side, rgb(143 115 255 / 0.32), transparent)",
      "--drift": "54s",
      "--dx": "8vw",
      "--dy": "6vh",
    } as React.CSSProperties,
  },
  {
    className: "right-[-16vw] top-[20vh] h-[75vh] w-[60vw]",
    style: {
      background: "radial-gradient(closest-side, rgb(255 210 63 / 0.25), transparent)",
      "--drift": "46s",
      "--dx": "-10vw",
      "--dy": "8vh",
      "--s": "1.2",
    } as React.CSSProperties,
  },
  {
    className: "bottom-[-22vh] left-[25vw] h-[60vh] w-[50vw]",
    style: {
      background: "radial-gradient(closest-side, rgb(43 214 123 / 0.22), transparent)",
      "--drift": "40s",
      "--dx": "12vw",
      "--dy": "-9vh",
    } as React.CSSProperties,
  },
  {
    className: "top-[55vh] left-[-10vw] h-[65vh] w-[45vw]",
    style: {
      background: "radial-gradient(closest-side, rgb(77 51 204 / 0.2), transparent)",
      "--drift": "50s",
      "--dx": "6vw",
      "--dy": "-6vh",
    } as React.CSSProperties,
  },
];

export function LandingAmbient() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 max-w-[100vw] overflow-hidden bg-paper [contain:paint]"
    >
      {BLOBS.map((b, i) => (
        <div
          key={i}
          className={`ambient-blob absolute rounded-full blur-3xl will-change-transform ${b.className}`}
          style={b.style}
        />
      ))}
      <div className="film-grain absolute inset-0" />
    </div>
  );
}
