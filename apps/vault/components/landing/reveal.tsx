"use client";

import { useEffect, useRef } from "react";

/**
 * Scroll reveal for landing sections: children marked `data-reveal` slide in, staggered,
 * the first time the group scrolls into view. Content is visible by default (no JS, reduced motion);
 * the hidden starting state is only applied once this effect runs on client.
 */
export function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    el.querySelectorAll<HTMLElement>("[data-reveal]").forEach((item, i) =>
      item.style.setProperty("--i", String(i))
    );
    el.classList.add("reveal-pending");

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        el.classList.add("is-in");
        io.disconnect();
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
