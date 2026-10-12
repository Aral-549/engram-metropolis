"use client";

import { useEffect, useRef } from "react";

/**
 * Section divider for Engram: a hairline cryptographic lattice & circuit trace across the
 * width that draws itself the first time it scrolls into view. Static under reduced motion.
 */
export function LatticeDivider({ className = "" }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (el) el.classList.add("is-in");
      return;
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add("is-in");
        io.disconnect();
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      aria-hidden
      viewBox="0 0 1000 24"
      preserveAspectRatio="none"
      className={`lattice-divider block h-6 w-full text-ink/20 ${className}`}
    >
      {/* Main horizontal cryptographic trace */}
      <path
        d="M0 12 L110 12 L140 6 L220 6 L240 18 L320 18 L350 12 L470 12 L500 18 L580 18 L600 6 L680 6 L710 12 L840 12 L870 18 L1000 18"
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        vectorEffect="non-scaling-stroke"
      />
      {/* Node branches */}
      <path
        d="M140 6 L152 2 L170 2"
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M320 18 L332 22 L360 22"
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M600 6 L612 2 L635 2"
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      <path
        d="M840 12 L852 7 L868 7"
        pathLength={1}
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        vectorEffect="non-scaling-stroke"
      />
      {/* Micro circuit diamond markers */}
      <circle cx="140" cy="6" r="2" fill="currentColor" />
      <circle cx="350" cy="12" r="2" fill="currentColor" />
      <circle cx="600" cy="6" r="2" fill="currentColor" />
      <circle cx="840" cy="12" r="2" fill="currentColor" />
    </svg>
  );
}
