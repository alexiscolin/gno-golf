import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { DESCRIPTION as description, PREVIEW, SITE, TITLE as title } from "@/lib/site";

// the link card's: shorter than the search result's
const card = "Every hole is a contract. Every shot is computed by the chain. Play free in your browser.";
const image = { url: "/og/default.jpg", type: "image/jpeg", width: 1200, height: 630, alt: "Gnogolf: the gnome badge, mini-golf on-chain, every shot computed by the chain" };

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title,
  description,
  applicationName: "Gnogolf",
  keywords: ["mini-golf", "gno.land", "gnolang", "on-chain game", "web3 game", "three.js", "Adena", "smart contracts"],
  authors: [{ name: "gno.land" }],
  // a preview is a copy of the site: kept out of search results
  robots: PREVIEW ? { index: false, follow: false } : { index: true, follow: true },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Gnogolf",
    title,
    description: card,
    images: [image],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: card,
    images: [image],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#fdf6e9",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* the game's font, from this host (globals.css): asked at once, not once the CSS is read */}
        <link rel="preload" href="/fonts/fredoka.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
