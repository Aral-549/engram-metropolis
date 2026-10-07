import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Bricolage_Grotesque({ subsets: ["latin"], weight: ["700", "800"], variable: "--font-bricolage" });
const sans = Figtree({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-figtree" });
const mono = JetBrains_Mono({ subsets: ["latin"], weight: ["500"], variable: "--font-jetbrains" });

export const metadata: Metadata = {
  title: "Engram vault",
  description: "One memory for every AI you use, sealed with your passkey.",
};

export const viewport: Viewport = { themeColor: "#fff4e0" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
