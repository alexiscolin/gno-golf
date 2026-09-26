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
  // a hole in no cup (community, archived) is linked by its id, never as place 1
  if (s.place) (q.set("cup", s.world || "garden"), q.set("hole", String(s.place)));
  else q.set("hole", s.id || "");
  if (gnome) q.set("gnome", gnome);
  return `?${q}`;
}

/** The par of the hole being played. */
export const parHere = (s: Snapshot) => parOf(s.holes.find((h) => h.id === s.id) || (s.allHoles || []).find((h) => h.id === s.id));

/** Why each aim mode has its own board: the chain can't see a screen. */
export const HONEST = "We can't check which mode you used, so each mode has its own board.";
