// A page per hole (/h/garden-3/) and per cup (/h/garden/), built once from the
// course's slots (data/holes.txt, no chain at build time): link crawlers run no
// JavaScript, so each needs its own og: tags and card (public/og, made by
// media/og/og.mjs, which also writes the names and pars in holes.json). The
// game itself is the home page's: Golf.tsx reads the hole from the path.
import fs from "node:fs";
import type { Metadata } from "next";
import Page from "@/app/page";

// read from web/ (next build's working directory)
const txt = fs.readFileSync("../data/holes.txt", "utf8");
const SLOTS = txt.split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
const CUPS = ["garden", "island", "town", "mountain"];
let known: Record<string, { name: string; par: number }> = {};
try { known = JSON.parse(fs.readFileSync("app/h/holes.json", "utf8")) as typeof known; } catch { /* no cards made yet: plain names */ }

const cap = (w: string) => w[0].toUpperCase() + w.slice(1);
const cupName = (w: string) => (CUPS.includes(w) ? `${cap(w)} Cup` : cap(w));

export const dynamicParams = false;
export const generateStaticParams = () => [...SLOTS.map((s) => ({ slot: s.replace("/", "-") })), ...CUPS.map((slot) => ({ slot }))];

export async function generateMetadata({ params }: { params: Promise<{ slot: string }> }): Promise<Metadata> {
  const { slot } = await params;
  const [world, n] = slot.split("-");
  const h = n ? known[`${world}/${n}`] : null;
  const title = `${n ? h?.name || `${cupName(world)} ${n}` : cupName(world)} · Gnogolf`;
  const line = "Every shot is computed by the chain on gno.land.";
  const description = n
    ? `${cupName(world)}${h ? ` · par ${h.par}` : ""} · Can you hole it in one? ${line}`
    : `${SLOTS.filter((s) => s.startsWith(world + "/")).length} holes of mini-golf on-chain. ${line}`;
  const image = { url: `/og/${slot}.jpg`, width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    alternates: { canonical: `/h/${slot}/` },
    openGraph: { type: "website", url: `/h/${slot}/`, siteName: "Gnogolf", title, description, images: [image], locale: "en_US" },
    twitter: { card: "summary_large_image", title, description, images: [image.url] },
  };
}

export default function HolePage() {
  // the game's relative addresses (title/…, flags.json) are the site root's, not this folder's
  return (
    <>
      <base href="/" />
      <Page />
    </>
  );
}
