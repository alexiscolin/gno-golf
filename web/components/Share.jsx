"use client";

import { useEffect, useRef, useState } from "react";
import { sound } from "@/lib/feel";

// Sharing a moment on the networks: a small cluster of round icons that sits
// with the score (X, Facebook, WhatsApp, Bluesky, copy link), each opening
// that network's own share page with the text and the link. On a phone one
// more icon opens the system share sheet, with a picture of the course.

const enc = encodeURIComponent;

// simple filled glyphs, 24×24
const GLYPH = {
  X: "M17.8 3h3.1l-6.8 7.8L22 21h-6.2l-4.9-6.4L5.3 21H2.2l7.3-8.3L2 3h6.4l4.4 5.8L17.8 3zm-1.1 16.2h1.7L7.4 4.7H5.6l11.1 14.5z",
  Facebook: "M13.5 21v-8h2.7l.4-3.2h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.4c-.3 0-1.3-.1-2.4-.1-2.4 0-4 1.5-4 4.1v2.4H7.7V13h2.7v8h3.1z",
  WhatsApp: "M12 2.5a9.4 9.4 0 0 0-8.1 14.2L2.5 21.5l4.9-1.3A9.4 9.4 0 1 0 12 2.5zm0 17.1c-1.4 0-2.8-.4-4-1.1l-.3-.2-2.9.8.8-2.8-.2-.3a7.7 7.7 0 1 1 6.6 3.6zm4.2-5.7c-.2-.1-1.4-.7-1.6-.8-.2-.1-.4-.1-.5.1l-.7.9c-.1.2-.3.2-.5.1a6.3 6.3 0 0 1-3.1-2.7c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.7-1.7c-.2-.4-.4-.4-.5-.4h-.5a.9.9 0 0 0-.6.3 2.6 2.6 0 0 0-.8 1.9 4.5 4.5 0 0 0 1 2.4 10.3 10.3 0 0 0 4 3.5c1.5.6 2 .7 2.8.6.4-.1 1.4-.6 1.6-1.1.2-.5.2-1 .1-1.1l-.5-.3z",
  Bluesky: "M6.3 4.4C8.6 6.1 11 9.6 12 11.5c1-1.9 3.4-5.4 5.7-7.1 1.6-1.2 4.3-2.2 4.3.9 0 .6-.4 5.2-.6 5.9-.7 2.6-3.3 3.2-5.6 2.8 4 .7 5 3 2.8 5.2-4.2 4.3-6-1.1-6.5-2.5l-.1-.3-.1.3c-.5 1.4-2.3 6.8-6.5 2.5-2.2-2.2-1.2-4.5 2.8-5.2-2.3.4-4.9-.2-5.6-2.8C2.4 10.5 2 5.9 2 5.3c0-3.1 2.7-2.1 4.3-.9z",
};

export default function Share({ text, snapshot, link = "" }) {
  const [copied, setCopied] = useState(false);
  const copiedT = useRef(0); // the "copied" note's timer, cleared if the card goes first
  useEffect(() => () => clearTimeout(copiedT.current), []);
  // the game's public address (set NEXT_PUBLIC_SITE_URL when building for
  // Netlify); a local dev address is never worth sharing, the page is
  const site = process.env.NEXT_PUBLIC_SITE_URL;
  const here = typeof window !== "undefined" ? window.location.origin + window.location.pathname : "";
  const origin = site && /localhost|127\.0\.0\.1/.test(here) ? site.replace(/\/$/, "") : here.replace(/\/$/, "");
  // this hole, this cup, this gnome (link is the page's "?cup=…&hole=…&gnome=…")
  const url = origin + (link ? "/" + link.replace(/^\/?/, "") : "");
  // the system sheet only where it is the phone's own (on a desktop it is a
  // bare OS panel without the networks people mean)
  const phone = typeof navigator !== "undefined" && !!navigator.share && typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const sheet = async () => {
    sound("blip");
    try {
      const blob = snapshot ? await snapshot() : null;
      const file = blob && new File([blob], "gnogolf.png", { type: "image/png" });
      const data = { title: "Gnogolf", text, url };
      if (file && navigator.canShare && navigator.canShare({ files: [file] })) data.files = [file];
      await navigator.share(data);
    } catch {} // cancelled, or refused: nothing to say
  };
  const copy = async () => {
    sound("blip");
    try {
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      clearTimeout(copiedT.current);
      copiedT.current = setTimeout(() => setCopied(false), 1800);
    } catch {}
  };
  const links = [
    ["X", `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(text)}`],
    ["WhatsApp", `https://wa.me/?text=${enc(`${text} ${url}`)}`],
    ["Bluesky", `https://bsky.app/intent/compose?text=${enc(`${text} ${url}`)}`],
  ];
  return (
    <span className="share" role="group" aria-label="Share">
      <span className="share__label">Share</span>
      {links.map(([name, href]) => (
        <a key={name} className={"share__icon share__icon--" + name.toLowerCase()} target="_blank" rel="noopener noreferrer" href={href} aria-label={`Share on ${name}`} title={name} onClick={() => sound("blip")}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d={GLYPH[name]} /></svg>
        </a>
      ))}
      <button className="share__icon share__icon--copy" aria-label={copied ? "Link copied" : "Copy the link"} title={copied ? "Copied" : "Copy link"} onClick={copy}>
        <svg viewBox="0 0 24 24" aria-hidden="true" className="share__stroke">{copied ? <path d="M5 12l5 5 9-10" /> : <path d="M9 15l6-6M10.5 6.5l1.8-1.8a4 4 0 0 1 5.7 5.7l-1.8 1.8M13.5 17.5l-1.8 1.8a4 4 0 0 1-5.7-5.7l1.8-1.8" />}</svg>
      </button>
      {phone && (
        <button className="share__icon share__icon--more" aria-label="More ways to share" title="More" onClick={sheet}>
          <svg viewBox="0 0 24 24" aria-hidden="true" className="share__stroke"><path d="M12 3v12M7 8l5-5 5 5M5 13v6h14v-6" /></svg>
        </button>
      )}
    </span>
  );
}
