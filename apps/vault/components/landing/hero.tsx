"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { GlassField } from "./glass-field";
import { TokenDrift } from "./token-drift";
import { Tilt } from "./tilt";
import { setGlassSound, soundStore } from "./glass-audio";
import { Seal } from "@/components/Seal";
import { Words } from "@/components/Words";

const SAGE_URL = process.env.NEXT_PUBLIC_SAGE_URL ?? "http://localhost:3201";
const WAYFARER_URL = process.env.NEXT_PUBLIC_WAYFARER_URL ?? "http://localhost:3202";

const HALO = "[text-shadow:0_0_14px_var(--color-paper),0_0_28px_var(--color-paper),0_0_4px_var(--color-paper)]";
const FROST = "rounded-2xl bg-card/75 px-4 py-1.5 border border-white/60 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.06)]";

export function Hero({
  locked = false,
  busy = false,
  signUp,
  signIn,
  open,
  setOpen,
}: {
  locked?: boolean;
  busy?: boolean;
  signUp: () => void;
  signIn: () => void;
  open: boolean;
  setOpen: (open: boolean) => void;
}) {
  const [interactive, setInteractive] = useState(false);
  const sound = useSyncExternalStore(
    soundStore.subscribe,
    soundStore.getSnapshot,
    soundStore.getServerSnapshot
  );
  const wordmarkRef = useRef<HTMLDivElement>(null);

  const vaultButtons = (
    <div className="settle flex flex-col gap-3 sm:flex-row">
      {locked ? null : (
        <button
          className="btn btn-primary justify-center px-6"
          onClick={() => void signUp()}
          disabled={busy}
        >
          {busy ? "Waiting for your passkey…" : "Create my memory vault"}
        </button>
      )}
      <button
        className={`btn justify-center px-6 ${locked ? "btn-primary" : ""}`}
        onClick={() => void signIn()}
        disabled={busy}
      >
        {locked
          ? busy
            ? "Waiting for your passkey…"
            : "Unlock vault"
          : "I already have one, unlock it"}
      </button>
    </div>
  );

  return (
    <section className="relative isolate overflow-hidden rounded-3xl border-[3px] border-ink bg-paper/40 shadow-[8px_8px_0_#141414] backdrop-blur-xl">
      <GlassField onInteractive={setInteractive} glitchRef={wordmarkRef} />

      {/* Floating sound toggle */}
      {interactive && (
        <button
          type="button"
          aria-pressed={sound}
          onClick={() => setGlassSound(!sound)}
          className="pressable absolute top-3 right-3 z-20 flex min-h-11 min-w-11 items-center justify-center gap-1.5 rounded-xl border-2 border-ink bg-card/85 px-3 py-1.5 font-mono text-xs font-bold text-ink shadow-[3px_3px_0_#141414] backdrop-blur-md transition-colors hover:bg-pop"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            {sound ? (
              <>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              </>
            ) : (
              <>
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                <line x1="23" y1="9" x2="17" y2="15" />
                <line x1="17" y1="9" x2="23" y2="15" />
              </>
            )}
          </svg>
          <span className="hidden sm:inline">{sound ? "Sound on" : "Sound off"}</span>
        </button>
      )}

      <div className="relative mx-auto flex max-w-4xl flex-col items-center px-4 pt-16 pb-12 text-center sm:px-8 sm:pt-10 sm:pb-16">
        {/* Monad Live Status Pill */}
        <div
          className="hero-rise mb-3 flex items-center gap-2 rounded-2xl border-2 border-ink bg-pop px-3.5 py-1 font-mono text-xs font-bold text-ink shadow-[2px_2px_0_#141414]"
          style={{ animationDelay: "0.05s" }}
        >
          <span className="live-dot" />
          <span>Monad Testnet · 10,000 TPS · Gasless EIP-712</span>
        </div>

        {/* Wordmark with TokenDrift */}
        <div
          className="hero-rise relative my-1 flex items-center justify-center gap-3 sm:my-2"
          style={{ animationDelay: "0.12s" }}
        >
          <div ref={wordmarkRef} className="glitch-target relative flex items-center gap-3">
            <Seal size={42} className="shrink-0 drop-shadow-[2px_2px_0_#141414]" />
            <span className="font-display text-3xl font-extrabold tracking-tight sm:text-5xl">
              Engram
            </span>
            <TokenDrift className="pointer-events-none absolute top-[-0.2em] left-[calc(100%+0.1em)] block h-[1.2em] w-[2.2em]" />
          </div>
        </div>

        {/* Main Hero Title */}
        <h1
          className={`hero-rise font-display mt-3 text-[clamp(2.2rem,5.5vw,4.4rem)] leading-[0.98] text-balance ${HALO}`}
          style={{ animationDelay: "0.2s" }}
        >
          {locked ? (
            <Words>Your vault is locked.</Words>
          ) : (
            <>
              <Words>Tell one AI. Every app you approve</Words>{" "}
              <em className="mt-1.5 inline-block -rotate-2 rounded-2xl border-[3px] border-ink bg-pop px-3.5 py-0.5 not-italic shadow-[4px_4px_0_#141414]">
                remembers.
              </em>
            </>
          )}
        </h1>

        {/* Subtitle */}
        <p
          className={`hero-rise mt-4 max-w-xl text-base sm:text-lg font-medium leading-relaxed text-ink-soft ${FROST} ${HALO}`}
          style={{ animationDelay: "0.32s" }}
        >
          {locked
            ? "Unlock it with your passkey to see and control your memory."
            : "Your memory lives in your vault. Apps ask it, it answers, and you see every move."}
        </p>

        {/* Model Cards for Sage & Wayfarer (Above fold for mobile & desktop) */}
        {!locked && (
          <div
            className="hero-rise mt-6 grid w-full max-w-xl grid-cols-1 gap-3.5 sm:grid-cols-2 text-left"
            style={{ animationDelay: "0.42s" }}
          >
            <Tilt className="flex">
              <a
                href={SAGE_URL}
                className="paper-card lift glass-panel glass-sheen flex flex-1 flex-col gap-1 bg-sage! p-4 transition-transform"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl font-bold">Sage</span>
                  <span className="rounded-full border border-ink/20 bg-ink/10 px-2 py-0.5 font-mono text-[10px] font-bold">
                    App 1
                  </span>
                </div>
                <span className="text-xs font-medium text-ink/80">Remembers what you tell it</span>
                <span className="mt-2 font-bold text-sm text-ink flex items-center gap-1">
                  Chat with Sage →
                </span>
              </a>
            </Tilt>

            <Tilt className="flex">
              <a
                href={WAYFARER_URL}
                className="paper-card lift glass-panel glass-sheen flex flex-1 flex-col gap-1 bg-wayfarer! p-4 transition-transform"
              >
                <div className="flex items-center justify-between">
                  <span className="font-display text-2xl font-bold">Wayfarer</span>
                  <span className="rounded-full border border-ink/20 bg-ink/10 px-2 py-0.5 font-mono text-[10px] font-bold">
                    App 2
                  </span>
                </div>
                <span className="text-xs font-medium text-ink/80">Plans trips and meals for you</span>
                <span className="mt-2 font-bold text-sm text-ink flex items-center gap-1">
                  Chat with Wayfarer →
                </span>
              </a>
            </Tilt>
          </div>
        )}

        {/* Action Button: "Open my vault" / "Unlock vault" */}
        <div
          className="hero-rise mt-6 flex flex-col items-center justify-center gap-3"
          style={{ animationDelay: "0.52s" }}
        >
          {locked ? (
            <div className="mt-2">{vaultButtons}</div>
          ) : (
            <div className="mt-2">
              {open ? (
                vaultButtons
              ) : (
                <button
                  type="button"
                  className="btn btn-primary px-6"
                  onClick={() => setOpen(true)}
                >
                  <Seal size={20} /> Open my vault
                </button>
              )}
            </div>
          )}
        </div>

        {/* Security Note */}
        <p
          className={`hero-rise mt-5 max-w-md text-xs font-medium text-ink-soft ${FROST}`}
          style={{ animationDelay: "0.62s" }}
        >
          Encrypted on your device before it goes to Monad. No company can read it, us included.
        </p>

        {/* Interactive Tap Hint */}
        {interactive && (
          <p
            className="hero-rise mt-3 flex items-center gap-1.5 font-mono text-[11px] font-semibold text-ink-soft"
            style={{ animationDelay: "0.7s" }}
          >
            <span className="inline-block animate-pulse text-pop">✦</span>
            <span>Tap anywhere to send ripples across the vault glass</span>
          </p>
        )}
      </div>
    </section>
  );
}
