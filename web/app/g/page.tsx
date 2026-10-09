// The gnomes' gallery (/g/): its words and card for link crawlers; the game
// opens on the shop (Golf.tsx reads the path). Off (NEXT_PUBLIC_GNOMES
// unset), the game's home, out of search results.
import type { Metadata } from "next";
import Game from "@/app/game";
import Intro from "@/app/intro";
import { SITE } from "@/lib/site";
import { SHOP } from "@/lib/gnomes/shop";

const title = "The Gnogolf gnome shop: who's on the ball?";
const description = "720 gnomes, each one of a kind: pick the exact one you play Gnogolf with. Cosmetic only, the same ball and physics; the game stays free to play.";
const image = { url: "/og/g.jpg", type: "image/jpeg", width: 1200, height: 630, alt: title };
export const metadata: Metadata = SHOP
  ? { title, description, alternates: { canonical: "/g/" }, openGraph: { type: "website", url: "/g/", siteName: "Gnogolf", title, description, images: [image], locale: "en_US" }, twitter: { card: "summary_large_image", title, description, images: [image] } }
  : { robots: { index: false }, alternates: { canonical: "/" } };

export default function Gallery() {
  const ld = { "@type": "CollectionPage", name: title, url: `${SITE}/g/`, description };
  return (
    <>
      <base href="/" />
      <Intro title={title} text={description} web="" ld={ld} />
      <Game />
    </>
  );
}
