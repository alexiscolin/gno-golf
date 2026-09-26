// What a page says without its game, for search engines and a browser with no
// JavaScript: the static HTML is only the loading screen otherwise. A heading
// kept off screen (the logo is the one people see), the page's words and links
// in a <noscript> card, and its JSON-LD. Nothing here shows while the game runs.
import type { CSSProperties } from "react";
import { REALM_PATH } from "@/lib/chain";

/** The gnoweb page of the course, or of one of its paths ("garden", "garden/3"): the game as text. */
export const gnoweb = (path = "") => (process.env.NEXT_PUBLIC_WEB ? `${process.env.NEXT_PUBLIC_WEB.replace(/\/$/, "")}${REALM_PATH}${path && ":" + path}` : "");

const OFF: CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };
const CARD: CSSProperties = { position: "fixed", zIndex: 10, left: 16, right: 16, bottom: 16, maxWidth: 560, margin: "0 auto", padding: "12px 16px", borderRadius: 12, background: "#fdf6e9", color: "#144134", lineHeight: 1.4 };

export default function Intro({ title, text, web, links = [], ld }: { title: string; text: string; web: string; links?: { href: string; label: string }[]; ld: object }) {
  return (
    <>
      <h1 style={OFF}>{title}</h1>
      <noscript>
        <div style={CARD}>
          <p>{text}</p>
          <p>
            The 3D game needs JavaScript.{web && <> <a href={web}>Play it as text on gno.land</a>.</>}
          </p>
          {links.length > 0 && (
            <ul>
              {links.map((l) => (
                <li key={l.href}><a href={l.href}>{l.label}</a></li>
              ))}
            </ul>
          )}
        </div>
      </noscript>
      {/* "<" escaped: a name can't close the script */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ "@context": "https://schema.org", ...ld }).replace(/</g, "\\u003c") }} />
    </>
  );
}
