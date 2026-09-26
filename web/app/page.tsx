import type { Metadata } from "next";
import Game from "@/app/game";
import Intro, { gnoweb } from "@/app/intro";
import { CUPS, cupName, DESCRIPTION as description, SITE, TITLE as title } from "@/lib/site";

// here, not in the layout: a page without its own (the 404) must not claim the home's
export const metadata: Metadata = { alternates: { canonical: "/" } };

export default function Page() {
  const ld = {
    "@graph": [
      // the site's name in search results
      { "@type": "WebSite", name: "Gnogolf", url: `${SITE}/`, inLanguage: "en" },
      {
        "@type": "VideoGame",
        name: "Gnogolf",
        url: `${SITE}/`,
        description,
        image: `${SITE}/og/default.jpg`,
        genre: "Mini-golf",
        gamePlatform: "Web browser",
        applicationCategory: "GameApplication",
        operatingSystem: "Any",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: 0, priceCurrency: "USD" },
        author: { "@type": "Organization", name: "gno.land", url: "https://gno.land" },
      },
    ],
  };
  return (
    <>
      <Intro title={title} text={description} web={gnoweb()} links={CUPS.map((c) => ({ href: `/h/${c}/`, label: cupName(c) }))} ld={ld} />
      <Game />
    </>
  );
}
