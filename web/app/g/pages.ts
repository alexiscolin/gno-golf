// The shop's pages, read once at build time from the catalogue (data/gnomes.json,
// from web/, next build's working directory): one per gnome (/g/<id>/) and per
// earned kind (/g/<kind>/, the page a token's external_url names), each with
// its words and its link card (public/og/g/<id>.jpg once his are made,
// else the gallery's). Off (NEXT_PUBLIC_GNOMES unset), only the gallery's page
// exists, and it is the game's home.
import fs from "node:fs";
import { SHOP } from "@/lib/gnomes/shop";
import { TIER_LOOK, type Catalogue } from "@/lib/gnomes/catalogue";
import { UNLOCKS, theWorld, type UnlockId } from "@/lib/card";

const catalogue = JSON.parse(fs.readFileSync("../data/gnomes.json", "utf8")) as Catalogue;

/** A shop page's words and card. */
export interface Page { slug: string; title: string; description: string; heading: string; image: string }
export const PAGES: readonly Page[] = !SHOP ? [] : [
  ...catalogue.gnomes.map((g) => ({
    slug: String(g.id),
    heading: `${g.name}, gnome #${g.id} of Gnogolf`,
    title: `${g.name} · Gnome #${g.id} · Gnogolf`,
    description: `${g.line} A ${TIER_LOOK[g.tier].label} gnome of ${theWorld(g.home)}: one of a kind, cosmetic only, the ball you play Gnogolf with.`,
    image: fs.existsSync(`public/og/g/${g.id}.jpg`) ? `/og/g/${g.id}.jpg` : "/og/g.jpg",
  })),
  ...catalogue.earned.map((e) => ({
    slug: e.unlock,
    heading: `${e.name}, an earned gnome of Gnogolf`,
    title: `${e.name} · An earned gnome · Gnogolf`,
    description: `${e.line} Earned in play: ${UNLOCKS[e.unlock as UnlockId]?.need || "a feat on the course"}. Free, proven on the chain; never bought or sold.`,
    image: "/og/g.jpg",
  })),
];
