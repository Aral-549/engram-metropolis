"use client";

import { useEffect, useRef, type RefObject } from "react";
import { playHit } from "@/components/landing/glass-audio";

/**
 * Reactive Glass & Grain Field for Engram (Monad Metropolis).
 *
 * An interactive pane of liquid optical glass rendered with a WebGL2 fragment shader:
 * - Domain-warped fluid gradient fields (Monad violet, deep vault indigo, amber pop, cyber sage)
 * - Fine procedural screen-space film grain dissolving color boundaries organically
 * - Normal-mapped liquid refraction ripples on click and cursor movement
 * - Dual-harmonic wave packets propagating outward with optical chromatic dispersion
 * - Luminous caustics and specular highlights along ripple crests (pure fluid wave physics, no cracks)
 * - Accessible: aria-hidden, zero layout disruption, falls back gracefully under reduced-motion.
 */

const MAX_IMPACTS = 8;
const IMPACT_LIFE = 4.2;
const GLITCH_MS = 380;
const GLITCH_GAP_MS = 500;
const RIPPLE_SPEED = 0.72;

const VERT = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;

uniform vec2 uRes;
uniform float uScale;
uniform float uTime;
uniform vec3 uPointer; // x, y (device px), z = presence (0..1)
uniform vec4 uImp[8];  // x, y (device px), start time, intensity
uniform int uCount;
uniform vec3 uPaper;
uniform vec3 uInk;
uniform vec3 uVault;
uniform vec3 uPop;
uniform vec3 uSage;
uniform float uFlash;

float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
float h2(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

// Procedural screen-space grain hash without visual tiling
float grainHash(vec2 fc, float frame) {
  uvec2 v = uvec2(fc) + uvec2(uint(frame) * 1973u, uint(frame) * 9277u);
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  v.x += v.y * 1664525u;
  v.y += v.x * 1664525u;
  v ^= v >> 16u;
  return float(v.x) * (1.0 / 4294967296.0);
}

float vnoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(h2(i), h2(i + vec2(1.0, 0.0)), u.x),
    mix(h2(i + vec2(0.0, 1.0)), h2(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * vnoise(p);
    p = p * 2.03 + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

// Liquid domain-warped color field behind the glass:
// Warm paper -> glowing Monad violet -> electric cobalt -> engram gold ember & sage vein
vec3 scene(vec2 p) {
  float t = uTime * 0.045;
  vec2 ext = uRes / uScale;
  vec2 uv = p / ext;
  vec2 w = vec2(fbm(p * 1.05 + vec2(t, -t)), fbm(p * 1.05 + vec2(5.2 - t, 1.3 + t)));
  vec2 q = p + (w - 0.5) * 0.95;
  float f = fbm(q * 1.35 + t);

  vec2 cq = (uv - vec2(0.5, 0.45)) * vec2(1.0, ext.y > ext.x ? 0.75 : 1.3);
  float edge = smoothstep(0.18, 0.68, length(cq));
  float m = clamp(f * 2.15 - 0.5, 0.0, 1.0) * edge;

  // 1px film grain dissolves color ramps organically
  float g = grainHash(gl_FragCoord.xy, floor(uTime * 14.0)) - 0.5;
  float md = clamp(m + g * 0.22 * smoothstep(0.0, 0.3, m), 0.0, 1.0);

  vec3 peri = mix(uVault, vec3(1.0), 0.55);
  vec3 elec = mix(uVault, vec3(0.28, 0.18, 0.92), 0.65);
  vec3 gold = mix(uPop, vec3(1.0, 0.85, 0.3), 0.35);
  vec3 sage = mix(uSage, vec3(0.3, 0.9, 0.6), 0.3);

  vec3 c = mix(uPaper, peri, smoothstep(0.05, 0.35, md));
  c = mix(c, elec, smoothstep(0.35, 0.68, md));
  c = mix(c, uVault, smoothstep(0.68, 0.96, md));

  // Glowing engram gold vein and sage harmonic currents
  float vein = smoothstep(0.58, 0.72, fbm(q * 2.2 - t * 1.2) + g * 0.05) * edge;
  c = mix(c, gold, vein * 0.75);

  float sageVein = smoothstep(0.66, 0.78, fbm(q * 2.8 + t * 0.9) + g * 0.05) * edge * (0.3 + 0.7 * uv.y);
  c = mix(c, sage, sageVein * 0.6);

  return c;
}

// Surface height map: living resting liquid glass + propagating concentric ripples
float surface(vec2 p) {
  // Ambient resting fluid breathing
  float h = (fbm(p * 2.05 + uTime * 0.032) - 0.5) * 0.16;

  // Pointer wake displacement
  if (uPointer.z > 0.01) {
    vec2 pDiff = p - uPointer.xy / uScale;
    float pDist = length(pDiff);
    h += sin(pDist * 26.0 - uTime * 3.2) * exp(-pDist * pDist * 30.0) * 0.14 * uPointer.z;
  }

  // Active click/tap concentric liquid ripples
  for (int i = 0; i < 8; i++) {
    if (i >= uCount) break;
    vec4 m = uImp[i];
    float age = uTime - m.z;
    if (age < 0.0 || age > 4.2) continue;

    vec2 diff = p - m.xy / uScale;
    float d = length(diff);

    float speed = 0.72;
    float waveDist = age * speed;
    float delta = d - waveDist;

    // Amplitude attenuation with radial distance and time decay
    float amp = (0.75 + m.w * 0.25) / (1.0 + d * 2.2);
    
    // Primary circular wave pulse
    float packet1 = exp(-delta * delta * 48.0) * exp(-age * 0.85);
    float wave1 = sin(delta * 34.0) * packet1 * amp;

    // Secondary trailing harmonic ripple
    float delta2 = d - waveDist * 0.68;
    float packet2 = exp(-delta2 * delta2 * 65.0) * exp(-age * 1.15);
    float wave2 = sin(delta2 * 26.0) * packet2 * 0.45 * amp;

    h += (wave1 + wave2) * 1.25;
  }
  return h;
}

void main() {
  vec2 p = gl_FragCoord.xy / uScale;

  // Refraction surface normal calculation
  float e = 1.4 / uScale;
  float h = surface(p);
  float hx = surface(p + vec2(e, 0.0));
  float hy = surface(p + vec2(0.0, e));
  vec2 g = vec2(hx - h, hy - h) / e;
  vec3 n = normalize(vec3(-g * 0.026, 1.0));

  // Optical refraction vector
  vec2 off = n.xy * 0.07;

  // Pointer lens magnification
  vec2 dv = p - uPointer.xy / uScale;
  off -= dv * 0.15 * uPointer.z * exp(-dot(dv, dv) * 24.0);

  // Subtle fluted glass vertical ribs
  float rib = fract(p.x * 22.0);
  off.x += (rib - 0.5) * 0.008;

  // Optical chromatic dispersion (slight wavelength split across liquid ripples)
  float chroma = clamp(length(g) * 0.025, 0.0, 0.035);
  vec3 col;
  col.r = scene(p + off * (1.0 + chroma)).r;
  col.g = scene(p + off).g;
  col.b = scene(p + off * (1.0 - chroma)).b;

  // Specular light highlights reflecting off ripple crests
  vec3 L = normalize(vec3(-0.35, 0.6, 0.75));
  float spec = pow(max(dot(n, L), 0.0), 45.0);
  col += spec * 0.36;

  // Luminous caustic glow along ripple wave crests
  float crest = pow(clamp(length(g) * 1.1, 0.0, 1.0), 2.2);
  vec3 causticColor = mix(vec3(1.0), uPop, 0.3);
  col = mix(col, causticColor, crest * 0.3);

  // Subtle ripple flash highlight
  col = mix(col, uVault, uFlash * 0.08);

  // Fluted rib shading
  vec2 ext = uRes / uScale;
  vec2 cq = (p / ext - vec2(0.5, 0.45)) * vec2(1.0, ext.y > ext.x ? 0.75 : 1.3);
  float ribShade = 0.12 + 0.88 * smoothstep(0.2, 0.66, length(cq));
  col += ((rib - 0.5) * 0.025 + smoothstep(0.92, 1.0, rib) * 0.03) * ribShade;

  // Fine film grain texture
  col += (grainHash(gl_FragCoord.xy + 31.0, floor(uTime * 24.0)) - 0.5) * 0.055;

  // Frost lift toward paper
  col = mix(col, vec3(1.0), 0.035);

  outColor = vec4(col, 1.0);
}
`;

type Impact = { x: number; y: number; t0: number; w: number };

function hexToRgb(hex: string, fallback: [number, number, number]): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return fallback.map((c) => c / 255) as [number, number, number];
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

function compile(gl: WebGL2RenderingContext): WebGLProgram | null {
  const shader = (type: number, src: string) => {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn("[glass-field] shader compile error:", gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = shader(gl.VERTEX_SHADER, VERT);
  const fs = shader(gl.FRAGMENT_SHADER, FRAG);
  const prog = gl.createProgram();
  if (!vs || !fs || !prog) return null;
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    console.warn("[glass-field] program link error:", gl.getProgramInfoLog(prog));
    return null;
  }
  return prog;
}

export function GlassField({
  onInteractive,
  glitchRef,
}: {
  onInteractive?: (interactive: boolean) => void;
  glitchRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    const host = canvas?.parentElement;
    if (!canvas || !host) return;

    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
    const prog = gl ? compile(gl) : null;
    if (!gl || !prog) {
      if (canvas) canvas.style.display = "none";
      return;
    }

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const style = getComputedStyle(canvas);
    const paper = hexToRgb(style.getPropertyValue("--color-paper") || "#fff4e0", [255, 244, 224]);
    const ink = hexToRgb(style.getPropertyValue("--color-ink") || "#141414", [20, 20, 20]);
    const vault = hexToRgb(style.getPropertyValue("--color-vault") || "#8f73ff", [143, 115, 255]);
    const pop = hexToRgb(style.getPropertyValue("--color-pop") || "#ffd23f", [255, 210, 63]);
    const sage = hexToRgb(style.getPropertyValue("--color-sage") || "#2bd67b", [43, 214, 123]);

    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const u = (name: string) => gl.getUniformLocation(prog, name);
    const uRes = u("uRes");
    const uScale = u("uScale");
    const uTime = u("uTime");
    const uPointer = u("uPointer");
    const uImp = u("uImp");
    const uCount = u("uCount");
    const uFlash = u("uFlash");

    gl.uniform3fv(u("uPaper"), paper);
    gl.uniform3fv(u("uInk"), ink);
    gl.uniform3fv(u("uVault"), vault);
    gl.uniform3fv(u("uPop"), pop);
    gl.uniform3fv(u("uSage"), sage);

    let dpr = 1;
    let cssW = 0;
    let cssH = 0;
    let scaleCss = 440;
    let raf = 0;
    let visible = true;
    let impacts: Impact[] = [];
    const impBuf = new Float32Array(MAX_IMPACTS * 4);
    const pointer = { x: 0, y: 0, tx: 0, ty: 0, z: 0, tz: 0 };
    let flash = 0;
    let rippleLevel = 0;
    let lastRippleTime = -10;
    let lastGlitch = 0;

    const timers = new Set<ReturnType<typeof setTimeout>>();
    const later = (ms: number, fn: () => void) => {
      const id = setTimeout(() => {
        timers.delete(id);
        fn();
      }, ms);
      timers.add(id);
    };

    const t0 = performance.now();
    const now = () => (performance.now() - t0) / 1000;

    const render = (t: number) => {
      impacts = impacts.filter((m) => t - m.t0 < IMPACT_LIFE);
      impBuf.fill(0);
      impacts.forEach((m, i) => impBuf.set([m.x, m.y, m.t0, m.w], i * 4));

      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uScale, scaleCss * dpr);
      gl.uniform1f(uTime, t);
      gl.uniform3f(uPointer, pointer.x * dpr, (cssH - pointer.y) * dpr, pointer.z);
      gl.uniform4fv(uImp, impBuf);
      gl.uniform1i(uCount, impacts.length);
      gl.uniform1f(uFlash, flash);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const resize = () => {
      const r = host.getBoundingClientRect();
      cssW = r.width;
      cssH = r.height;
      scaleCss = Math.min(Math.max(Math.min(cssW, cssH), 420), 920);
      dpr = Math.min(window.devicePixelRatio || 1, cssW < 640 ? 1.25 : 1.5);
      canvas.width = Math.max(1, Math.round(cssW * dpr));
      canvas.height = Math.max(1, Math.round(cssH * dpr));
      gl.viewport(0, 0, canvas.width, canvas.height);
      render(reduce ? 0 : now());
    };

    const pushImpact = (x: number, y: number, w: number) => {
      impacts.push({ x: x * dpr, y: (cssH - y) * dpr, t0: now(), w });
      if (impacts.length > MAX_IMPACTS) impacts = impacts.slice(-MAX_IMPACTS);
    };

    const scheduleGlitch = (x: number, y: number) => {
      const el = glitchRef?.current;
      if (!el) return;
      const hr = host.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      const dx = r.left + r.width / 2 - hr.left - x;
      const dy = r.top + r.height / 2 - hr.top - y;
      const edge = Math.max(0, Math.hypot(dx, dy) - Math.min(r.width, r.height) / 2);

      later((edge / (RIPPLE_SPEED * scaleCss)) * 1000, () => {
        const at = performance.now();
        if (at - lastGlitch < GLITCH_GAP_MS) return;
        lastGlitch = at;
        el.classList.remove("is-glitching");
        void el.offsetWidth;
        el.classList.add("is-glitching");
        later(GLITCH_MS, () => el.classList.remove("is-glitching"));
      });
    };

    // User creates a ripple on the liquid glass pane
    const hit = (x: number, y: number) => {
      const t = now();
      const chained = t - lastRippleTime < 1.1;
      rippleLevel = chained ? (rippleLevel + 1) % 4 : 0;
      lastRippleTime = t;

      pushImpact(x, y, 1.0 + rippleLevel * 0.35);
      scheduleGlitch(x, y);

      playHit(rippleLevel);

      flash = 0.5 + rippleLevel * 0.15;
      kick();
    };

    const kick = () => {
      if (reduce || !visible || raf) return;
      loop();
    };

    const loop = () => {
      raf = 0;
      const t = now();

      pointer.x += (pointer.tx - pointer.x) * 0.12;
      pointer.y += (pointer.ty - pointer.y) * 0.12;
      pointer.z += (pointer.tz - pointer.z) * 0.08;
      if (flash > 0) flash = Math.max(0, flash - 0.035);

      render(t);

      const moving =
        Math.hypot(pointer.tx - pointer.x, pointer.ty - pointer.y) > 0.5 ||
        Math.abs(pointer.tz - pointer.z) > 0.005 ||
        flash > 0.005 ||
        impacts.length > 0;

      if (moving && visible) {
        raf = requestAnimationFrame(loop);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const r = host.getBoundingClientRect();
      pointer.tx = e.clientX - r.left;
      pointer.ty = e.clientY - r.top;
      pointer.tz = 1.0;
      kick();
    };

    const onPointerLeave = () => {
      pointer.tz = 0.0;
      kick();
    };

    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("button, a, input, [data-interactive]")) return;
      const r = host.getBoundingClientRect();
      hit(e.clientX - r.left, e.clientY - r.top);
    };

    const io = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) kick();
      },
      { threshold: 0.05 }
    );
    io.observe(host);

    window.addEventListener("resize", resize, { passive: true });
    host.addEventListener("pointermove", onPointerMove, { passive: true });
    host.addEventListener("pointerleave", onPointerLeave, { passive: true });
    host.addEventListener("pointerdown", onPointerDown);

    resize();
    onInteractive?.(true);

    // Initial soft ambient droplet ripple
    later(500, () => {
      if (host) {
        const r = host.getBoundingClientRect();
        pushImpact(r.width * 0.5, r.height * 0.42, 1.0);
        kick();
      }
    });

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach((id) => clearTimeout(id));
      window.removeEventListener("resize", resize);
      host.removeEventListener("pointermove", onPointerMove);
      host.removeEventListener("pointerleave", onPointerLeave);
      host.removeEventListener("pointerdown", onPointerDown);
      io.disconnect();
    };
  }, [glitchRef, onInteractive]);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 h-full w-full select-none"
    />
  );
}
