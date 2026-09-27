import type { Metadata } from "next";

// an address with no page (Netlify serves it as 404.html): out of search
// results, and not taken for the home page the layout describes
export const metadata: Metadata = { title: "No such page · Gnogolf", robots: { index: false }, alternates: { canonical: null } };

export default function NotFound() {
  return (
    <div className="banner" role="alertdialog" aria-labelledby="lost-title">
      <div className="banner__in">
        <h2 id="lost-title">No such page</h2>
        <p>This ball rolled off the course.</p>
        <div className="banner__row">
          <a className="btn btn--main" href="/">Play Gnogolf</a>
        </div>
      </div>
    </div>
  );
}
