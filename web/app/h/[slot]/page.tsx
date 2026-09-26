// A page per hole (/h/garden-3/) and per cup (/h/garden/), built once from the
// course's slots (data/holes.txt, no chain at build time): link crawlers run no
// JavaScript, so each needs its own og: tags and card (public/og, made by
// media/og/og.mjs, which also writes the names and pars in holes.json). The
// game itself is the home page's: Golf.tsx reads the hole from the path.
import fs from "node:fs";
import type { Metadata } from "next";
import Game from "@/app/game";
import Intro, { gnoweb } from "@/app/intro";
import { CUPS, cupName, SITE } from "@/lib/site";

// read from web/ (next build's working directory)
const txt = fs.readFileSync("../data/holes.txt", "utf8");
const SLOTS = txt.split("\n").filter(Boolean).map((l) => l.split(" ")[0]);
let known: Record<string, { name: string; par: number }> = {};
try { known = JSON.parse(fs.readFileSync("app/h/holes.json", "utf8")) as typeof known; } catch { /* no cards made yet: plain names */ }

export const dynamicParams = false;
export const generateStaticParams = () => [...SLOTS.map((s) => ({ slot: s.replace("/", "-") })), ...CUPS.map((slot) => ({ slot }))];

type Props = { params: Promise<{ slot: string }> };

/** What a hole's or a cup's page is called and says: unique per page, for search results and link cards. */
function about(slot: string) {
  const [world, n] = slot.split("-");
  const h = n ? known[`${world}/${n}`] : null;
  const cup = cupName(world);
  const place = `${cup} ${n}`;
  const name = h?.name || (n ? place : cup);
  const holes = SLOTS.filter((s) => s.startsWith(world + "/"));
  const heading = !n
    ? `${cup}: ${holes.length} holes of mini-golf on-chain`
    : h ? `${name}, ${CUPS.includes(world) ? `hole ${n} of the ${cup}` : `${cup} hole ${n}`}, par ${h.par}` : place;
  return {
    world, n, name, heading, holes,
    title: `${n ? (h ? `${name} · ${place}` : place) : heading} · Gnogolf`,
    description: n
      ? `${heading}: can you hole it in one? Free 3D mini-golf in your browser, every shot computed by the chain on gno.land.`
      : `The ${cup}: ${holes.length} holes of free 3D mini-golf in your browser. Every hole is a smart contract on gno.land, every shot is computed by the chain.`,
  };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slot } = await params;
  const { title, description } = about(slot);
  const image = { url: `/og/${slot}.jpg`, type: "image/jpeg", width: 1200, height: 630, alt: title };
  return {
    title,
    description,
    alternates: { canonical: `/h/${slot}/` },
    openGraph: { type: "website", url: `/h/${slot}/`, siteName: "Gnogolf", title, description, images: [image], locale: "en_US" },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function HolePage({ params }: Props) {
  const { slot } = await params;
  const { world, n, name, heading, description, holes } = about(slot);
  // the way back up, as search results show it: Gnogolf › Garden Cup › The Shelf
  const trail = [
    { name: "Gnogolf", url: `${SITE}/` },
    ...(CUPS.includes(world) ? [{ name: cupName(world), url: `${SITE}/h/${world}/` }] : []),
    ...(n ? [{ name, url: `${SITE}/h/${slot}/` }] : []),
  ];
  const ld = { "@type": "BreadcrumbList", itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: t.url })) };
  // a cup links its holes; a hole, its way back up
  const links = n
    ? trail.slice(0, -1).map((t) => ({ href: t.url, label: t.name }))
    : holes.map((s) => ({ href: `/h/${s.replace("/", "-")}/`, label: known[s]?.name || `${cupName(world)} ${s.split("/")[1]}` }));
  // the game's relative addresses (title/…, flags.json) are the site root's, not this folder's
  return (
    <>
      <base href="/" />
      <Intro title={heading} text={description} web={gnoweb(n ? `${world}/${n}` : world)} links={links} ld={ld} />
      <Game />
    </>
  );
}
