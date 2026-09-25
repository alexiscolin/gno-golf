import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

// Link previews need absolute URLs. Set NEXT_PUBLIC_SITE_URL to where the
// static export is served (Netlify, Vercel, IPFS gateway…) before building.
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3300";

const title = "Gnogolf — mini-golf on-chain";
const description =
  "A 3D mini-golf where every hole is a smart contract someone deployed on gno.land and every shot is computed by the chain. Pick a gnome, pull the slingshot, play free in your browser — no wallet needed. Connect Adena to put your score on-chain.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title,
  description,
  applicationName: "Gnogolf",
  keywords: ["mini-golf", "gno.land", "gnolang", "on-chain game", "web3 game", "three.js", "Adena", "smart contracts"],
  authors: [{ name: "gno.land" }],
  openGraph: {
    type: "website",
    url: "/",
    siteName: "Gnogolf",
    title,
    description:
      "Every hole is a contract. Every shot is computed by the chain. Play free in your browser.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Gnogolf: a gnome on a 3D mini-golf hole, with a tunnel, a bunker and a mountain" }],
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title,
    description: "Every hole is a contract. Every shot is computed by the chain. Play free in your browser.",
    images: ["/og.png"],
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
