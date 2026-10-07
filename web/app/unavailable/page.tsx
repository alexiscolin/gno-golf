import type { Metadata } from "next";
import { buttonClass } from "@/components/button";

// What a gnome's page is where the shop is not offered (netlify.toml's
// country rules, lib/gnomes/geo.ts): the shop is not here, the game is.
// Out of search results, as the 404 is.
export const metadata: Metadata = { title: "Not available in your region · Gnogolf", robots: { index: false }, alternates: { canonical: null } };

export default function Unavailable() {
  return (
    <div className="banner" role="alertdialog" aria-labelledby="away-title">
      <div className="banner__in">
        <h2 id="away-title">The gnome shop is not available in your region</h2>
        <p>The game itself is free to play, here as everywhere.</p>
        <div className="banner__row">
          <a className={buttonClass({ variant: "primary" })} href="/">Play Gnogolf</a>
        </div>
      </div>
    </div>
  );
}
