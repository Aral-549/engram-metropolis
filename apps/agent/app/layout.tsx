import type { Metadata } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import { persona } from "@/lib/personas";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-bricolage" });
const sans = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-jetbrains" });

const p = persona(process.env.NEXT_PUBLIC_AGENT_PERSONA);
export const metadata: Metadata = { title: `${p.name}, ${p.tagline.toLowerCase()}`, description: p.description };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`} style={{ ["--agent" as string]: p.accent }}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
