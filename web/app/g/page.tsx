// The gnomes' gallery (/g/): its words and card for link crawlers; the game
// opens on the shop (Golf.tsx reads the path). Off (NEXT_PUBLIC_GNOMES
// unset), the game's home, out of search results.
import type { Metadata } from "next";
import Game from "@/app/game";
import Intro from "@/app/intro";
import { DESCRIPTION, SITE, TITLE } from "@/lib/site";
import { SHOP } from "@/lib/gnomes/shop";

const title = "The Gnogolf gnome shop: who's on the ball?";
const description = "720 gnomes, each one of a kind: pick the exact one you play Gnogolf with. Cosmetic only, the same ball and physics; the game stays free to play.";
const image = { url: "/og/g.jpg", type: "image/jpeg", width: 1200, height: 630, alt: title };
export const metadata: Metadata = SHOP
  ? { title, description, alternates: { canonical: "/g/" }, openGraph: { type: "website", url: "/g/", siteName: "Gnogolf", title, description, images: [image], locale: "en_US" }, twitter: { card: "summary_large_image", title, description, images: [image] } }
  : { robots: { index: false }, alternates: { canonical: "/" } };

export default function Gallery() {
  // off, the home's words and no data: nothing of the shop in the page
  const intro = SHOP ? { title, text: description, ld: { "@type": "CollectionPage", name: title, url: `${SITE}/g/`, description } } : { title: TITLE, text: DESCRIPTION };
  return (
    <>
      <base href="/" />
      <Intro {...intro} web="" />
      <Game />
    </>
  );
}
