// Small helpers the game screen and the leaderboards share.

import type { Snapshot } from "@/lib/engine";
import { parOf } from "@/lib/card";

/** The error's own sentence, or the value said as it is. */
export const messageOf = (e: unknown) => String((e && typeof e === "object" && "message" in e && e.message) || e);

// a player on a board: longer, a row has room
export const shortAddr = (a: string) => `${String(a).slice(0, 8)}…${String(a).slice(-4)}`;

/** The address of this hole, to put in the bar and in shared links. */
export function holeLink(s: Snapshot, gnome: string) {
  const q = new URLSearchParams();
  const keep = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  // a page pointed at another chain keeps pointing there
  for (const k of ["rpc", "web"]) { const v = keep.get(k); if (v) q.set(k, v); }
  // a cup's hole by its own page (app/h, its link card); one in no cup
  // (community, archived) by its id, never as place 1
  const slot = s.place ? /^([a-z]+)\/(\d+)(\/v\d+)?$/.exec(s.id || "") : null;
  if (!slot) q.set("hole", s.id || "");
  if (gnome) q.set("gnome", gnome);
  return (slot ? `h/${slot[1]}-${slot[2]}/` : "") + (String(q) ? `?${q}` : "");
}

/** The par of the hole being played. */
export const parHere = (s: Snapshot) => parOf(s.holes.find((h) => h.id === s.id) || (s.allHoles || []).find((h) => h.id === s.id));

/** Why each aim mode has its own board: the chain can't see a screen. */
export const HONEST = "We can't check which mode you used, so each mode has its own board.";

const enc = encodeURIComponent;
/** Each network's share page for this text and link. X shows the card of a
 *  post's last link, and takes ours apart (url=), so it comes after the text.
 *  The others (WhatsApp, Bluesky, a pasted message) preview the first link,
 *  and the text names gno.land: ours goes first, or theirs takes the card. */
export function shareLinks(text: string, url: string): [string, string][] {
  const post = enc(pasted(text, url));
  return [
    ["X", `https://x.com/intent/post?text=${enc(text)}&url=${enc(url)}`],
    ["Facebook", `https://www.facebook.com/sharer/sharer.php?u=${enc(url)}&quote=${enc(text)}`],
    ["WhatsApp", `https://wa.me/?text=${post}`],
    ["Bluesky", `https://bsky.app/intent/compose?text=${post}`],
  ];
}
/** The message a copied link pastes: the link first, for its card. */
export const pasted = (text: string, url: string) => `${url}\n\n${text}`;
