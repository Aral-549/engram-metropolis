"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";

/**
 * Leans an element toward nearby mouse cursor within radius px.
 */
export function useMagnetic(max = 6, radius = 140) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy);
      const k = d < radius ? (1 - d / radius) * max : 0;
      el.style.translate = k ? `${(dx / (d || 1)) * k}px ${(dy / (d || 1)) * k}px` : "";
    };

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [max, radius]);

  return ref;
}

interface VaultButtonProps {
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  size?: "sm" | "lg";
  variant?: "primary" | "secondary" | "gold";
  className?: string;
}

export function VaultButton({
  href,
  onClick,
  disabled = false,
  children,
  size = "lg",
  variant = "primary",
  className = "",
}: VaultButtonProps) {
  const magnetRef = useMagnetic();

  const variantClass =
    variant === "primary"
      ? "vault-btn-primary"
      : variant === "gold"
      ? "vault-btn-gold"
      : "vault-btn-secondary";

  const sizeClass = size === "sm" ? "vault-btn-sm" : "";

  const content = (
    <>
      <span aria-hidden className="vault-brackets" />
      <span aria-hidden className="vault-prompt">
        &gt;
      </span>
      <span className="relative z-10 flex items-center gap-2 font-display">{children}</span>
      <span aria-hidden className="vault-caret" />
    </>
  );

  if (href) {
    return (
      <div ref={magnetRef} className="w-full transition-[translate] duration-200 ease-out sm:w-auto">
        <Link
          href={href}
          className={`vault-btn ${variantClass} ${sizeClass} ${className}`}
        >
          {content}
        </Link>
      </div>
    );
  }

  return (
    <div ref={magnetRef} className="w-full transition-[translate] duration-200 ease-out sm:w-auto">
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={`vault-btn ${variantClass} ${sizeClass} ${className}`}
      >
        {content}
      </button>
    </div>
  );
}
