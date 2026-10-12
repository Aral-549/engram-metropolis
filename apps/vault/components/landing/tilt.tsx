"use client";

import { useEffect, useRef } from "react";

/**
 * Tilts children in 3D perspective toward the mouse cursor (up to 7°)
 * and computes dynamic specular sheen variables (--mx, --my).
 * Automatically disabled under prefers-reduced-motion.
 */
export function Tilt({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const wrap = ref.current;
    const el = wrap?.firstElementChild as HTMLElement | null;
    if (!wrap || !el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      el.style.transform = `rotateX(${(0.5 - y) * 12}deg) rotateY(${(x - 0.5) * 12}deg)`;
      el.style.setProperty("--mx", `${x * 100}%`);
      el.style.setProperty("--my", `${y * 100}%`);
      el.dataset.tilting = "";
    };

    const onLeave = () => {
      el.style.transform = "";
      delete el.dataset.tilting;
    };

    wrap.addEventListener("pointermove", onMove);
    wrap.addEventListener("pointerleave", onLeave);
    return () => {
      wrap.removeEventListener("pointermove", onMove);
      wrap.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  return (
    <div ref={ref} className={`tilt-wrap [perspective:900px] min-w-0 max-w-full ${className || ""}`}>
      {children}
    </div>
  );
}
