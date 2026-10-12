"use client";

import { useEffect, useRef } from "react";

/**
 * Grainy gradient & liquid ripple ambient canvas for Sage & Wayfarer.
 *
 * Renders:
 * 1. Persona-specific liquid gradient blobs (Cyber Sage or Tangerine Wayfarer, blended with Monad purple & pop gold)
 * 2. High-frequency SVG procedural film grain overlay (mix-blend-mode: multiply)
 * 3. Reactive concentric liquid ripple canvas that expands with optical caustics on pointer clicks/taps
 *
 * Fixed behind the chat, pointer-events: none, aria-hidden, zero layout disruption.
 */

interface AgentAmbientProps {
  personaId: "assistant" | "planner";
}

interface Ripple {
  x: number;
  y: number;
  born: number;
  maxR: number;
  color: string;
}

export function AgentAmbient({ personaId }: AgentAmbientProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const isSage = personaId === "assistant";

  // Blob gradient colors tailored to the persona
  const accentRgb = isSage ? "43 214 123" : "255 138 43"; // Sage green vs Wayfarer orange
  const secondaryRgb = "143 115 255"; // Monad purple
  const tertiaryRgb = "255 210 63"; // Pop gold
  const deepRgb = isSage ? "28 160 95" : "230 110 30";

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // Respect reduced-motion preferences
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    let animId = 0;
    const ripples: Ripple[] = [];
    const rippleColor = isSage ? "rgba(43, 214, 123, " : "rgba(255, 138, 43, ";

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const onPointerDown = (e: PointerEvent) => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ripples.push({
        x: e.clientX * dpr,
        y: e.clientY * dpr,
        born: performance.now(),
        maxR: Math.max(window.innerWidth, window.innerHeight) * 0.45 * dpr,
        color: rippleColor,
      });
      // Keep max 6 active ripples
      if (ripples.length > 6) ripples.shift();
    };

    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    const render = (now: number) => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (let i = ripples.length - 1; i >= 0; i--) {
        const r = ripples[i]!;
        const elapsed = (now - r.born) / 1000;
        const dur = 1.6; // duration in seconds
        if (elapsed > dur) {
          ripples.splice(i, 1);
          continue;
        }

        const progress = elapsed / dur;
        const ease = 1 - Math.pow(1 - progress, 2.5);
        const radius = ease * r.maxR;
        const alpha = (1 - progress) * 0.32;

        // Primary caustic ring
        ctx.save();
        ctx.beginPath();
        ctx.arc(r.x, r.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `${r.color}${alpha})`;
        ctx.lineWidth = 3 + (1 - progress) * 5;
        ctx.stroke();

        // Secondary inner harmonic ripple
        if (radius > 16) {
          ctx.beginPath();
          ctx.arc(r.x, r.y, radius * 0.72, 0, Math.PI * 2);
          ctx.strokeStyle = `rgba(143, 115, 255, ${alpha * 0.45})`;
          ctx.lineWidth = 2 + (1 - progress) * 3;
          ctx.stroke();
        }
        ctx.restore();
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isSage]);

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-10 max-w-[100vw] overflow-hidden bg-paper [contain:paint]"
    >
      {/* Drifting fluid aura blobs */}
      <div
        className="ambient-blob absolute -top-[15vh] -left-[18vw] h-[80vh] w-[70vw] rounded-full blur-3xl will-change-transform"
        style={{
          background: `radial-gradient(closest-side, rgb(${accentRgb} / 0.34), transparent)`,
          // @ts-expect-error CSS vars
          "--drift": "52s",
          "--dx": "8vw",
          "--dy": "6vh",
        }}
      />
      <div
        className="ambient-blob absolute top-[25vh] -right-[15vw] h-[75vh] w-[60vw] rounded-full blur-3xl will-change-transform"
        style={{
          background: `radial-gradient(closest-side, rgb(${secondaryRgb} / 0.28), transparent)`,
          // @ts-expect-error CSS vars
          "--drift": "44s",
          "--dx": "-10vw",
          "--dy": "8vh",
          "--s": "1.2",
        }}
      />
      <div
        className="ambient-blob absolute -bottom-[20vh] left-[20vw] h-[65vh] w-[55vw] rounded-full blur-3xl will-change-transform"
        style={{
          background: `radial-gradient(closest-side, rgb(${tertiaryRgb} / 0.24), transparent)`,
          // @ts-expect-error CSS vars
          "--drift": "38s",
          "--dx": "12vw",
          "--dy": "-9vh",
        }}
      />
      <div
        className="ambient-blob absolute top-[60vh] -left-[10vw] h-[60vh] w-[45vw] rounded-full blur-3xl will-change-transform"
        style={{
          background: `radial-gradient(closest-side, rgb(${deepRgb} / 0.22), transparent)`,
          // @ts-expect-error CSS vars
          "--drift": "48s",
          "--dx": "6vw",
          "--dy": "-6vh",
        }}
      />

      {/* Reactive liquid ripple canvas */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full pointer-events-none opacity-85"
      />

      {/* High-frequency procedural film grain */}
      <svg className="film-grain" aria-hidden>
        <filter id="agent-ambient-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.82"
            numOctaves="2"
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#agent-ambient-grain)" />
      </svg>
    </div>
  );
}
