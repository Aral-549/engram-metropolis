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

const originOf = (u: string | undefined) => {
  try {
    return u ? new URL(u).origin : undefined;
  } catch {
    return undefined;
  }
};
const preconnect = [...new Set([originOf(process.env.NEXT_PUBLIC_RPC_URL) ?? "https://testnet-rpc.monad.xyz", originOf(process.env.NEXT_PUBLIC_INDEXER_URL)].filter((x): x is string => !!x))];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <head>
        {/* Open the RPC and indexer connections while the page loads: the first chain read otherwise pays DNS and TLS (about 1 s measured). */}
        {preconnect.map((href) => (
          <link key={href} rel="preconnect" href={href} crossOrigin="anonymous" />
        ))}
      </head>
      <body className="min-h-dvh font-sans antialiased">{children}</body>
    </html>
  );
}
