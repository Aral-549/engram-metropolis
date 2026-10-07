// The Engram vault mark: a small purple safe (contracts/ui.md). Kept under its old name so every screen picks it up.
export function Seal({ size = 28, className = "", title, muted = false }: { size?: number; className?: string; title?: string; muted?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} role={title ? "img" : undefined} aria-hidden={title ? undefined : true}>
      {title ? <title>{title}</title> : null}
      <rect x="18" y="84" width="14" height="10" rx="3" fill="#141414" />
      <rect x="68" y="84" width="14" height="10" rx="3" fill="#141414" />
      <rect x="6" y="6" width="88" height="80" rx="14" fill={muted ? "#d9d2c5" : "#8f73ff"} stroke="#141414" strokeWidth="6" />
      <rect x="16" y="16" width="68" height="60" rx="8" fill="none" stroke="#141414" strokeWidth="4" />
      <circle cx="44" cy="46" r="16" fill="#ffd23f" stroke="#141414" strokeWidth="6" />
      <path d="M44 34v6M44 52v6M32 46h6M50 46h6" stroke="#141414" strokeWidth="4" strokeLinecap="round" />
      <rect x="68" y="34" width="8" height="24" rx="4" fill="#ffffff" stroke="#141414" strokeWidth="4" />
    </svg>
  );
}
