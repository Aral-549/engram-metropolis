// The agent's mark: its initial in chunky type, in the agent's color, outlined in ink.
export function Monogram({ letter, size = 44, plain = false }: { letter: string; size?: number; plain?: boolean }) {
  return (
    <span
      aria-hidden
      className="inline-grid shrink-0 place-items-center rounded-full border-[3px] border-ink font-display text-ink"
      style={{ width: size, height: size, background: plain ? "#ffffff" : "var(--agent)", fontSize: size * 0.5, lineHeight: 1 }}
    >
      {letter}
    </span>
  );
}
