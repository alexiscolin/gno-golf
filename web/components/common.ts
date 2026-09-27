// Small helpers the game screen and the leaderboards share.

import type { Snapshot } from "@/lib/engine";
import type { Mode } from "@/lib/types";
import { parOf } from "@/lib/card";
import { isAddress, isHoleId, RULES } from "@/lib/chain";

/** The error's own sentence, or the value said as it is. */
export const messageOf = (e: unknown) => String((e && typeof e === "object" && "message" in e && e.message) || e);

// a player on a board: longer, a row has room
export const shortAddr = (a: string) => `${String(a).slice(0, 8)}…${String(a).slice(-4)}`;

/** The address of this hole, to put in the bar and in shared links; by: the
 *  sharer, whose best on the chain the friend is dared to beat. */
export function holeLink(s: Snapshot, gnome: string, by = "") {
  const q = new URLSearchParams();
  const keep = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  // a page pointed at another chain keeps pointing there
  for (const k of ["rpc", "web"]) { const v = keep.get(k); if (v) q.set(k, v); }
  // a cup's hole by its own page (app/h, its link card); one in no cup
  // (community, archived) by its id, never as place 1
  const slot = s.place ? /^([a-z]+)\/(\d+)(\/v\d+)?$/.exec(s.id || "") : null;
  if (!slot) q.set("hole", s.id || "");
  if (gnome) q.set("gnome", gnome);
  if (by && isAddress(by)) q.set("by", by);
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

/** A name to start from: the gnome's (letters only, 5 to 13, "golfer" if too
 *  short) and 3 digits, as the registrar wants them. rnd: 0..1. */
export const suggestName = (gnome: string, rnd = Math.random()) => {
  const l = gnome.toLowerCase().replace(/[^a-z]/g, "").slice(0, 13);
  return (l.length >= 5 && !/^(gno|gl|g1|atom|atone|photon|cosmos)/.test(l) ? l : "golfer") + String(100 + Math.floor(rnd * 900));
};

/** "1 stroke", "3 strokes". */
export const strokesWord = (n: number) => `${n} stroke${n === 1 ? "" : "s"}`;

/** A finger, not a mouse: the device's main pointer is coarse. */
export const isTouch = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;

/** A finished round, as far as saving it goes: what the save and its gas read. */
export type SaveOf = { id: string; name?: string; shots: readonly string[]; strokes: number; period?: number | null; roundMode?: Mode | null; official?: boolean; walls?: number; pieces?: number; kind?: string; pts?: readonly number[] };
export const saveOf = (s: SaveOf): SaveOf => ({ id: s.id, name: s.name, shots: s.shots, strokes: s.strokes, period: s.period, roundMode: s.roundMode, official: s.official, walls: s.walls, pieces: s.pieces, kind: s.kind, pts: s.pts });
// a shot as the game records it: angle, power and, on a timed hole, the tick
const SHOT = /^-?\d{1,3}(\.\d{1,4})?,\d{1,2}(\.\d{1,4})?(,\d{1,5})?$/;
const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
/**
 * A round kept for the tab (sessionStorage), read back: only one in the shape
 * the save sends is taken, anything else is dropped (null). The chain checks
 * every shot again before Adena opens; this keeps the card honest about what
 * it would sign.
 */
export function pendingOf(v: unknown): SaveOf | null {
  if (!v || typeof v !== "object") return null;
  const r = v as Record<string, unknown>;
  const shots = r.shots;
  if (typeof r.id !== "string" || !isHoleId(r.id)) return null;
  if (!Array.isArray(shots) || !shots.length || shots.length > RULES.maxRoundStrokes || !shots.every((x) => typeof x === "string" && SHOT.test(x))) return null;
  if (!Number.isSafeInteger(r.strokes) || (r.strokes as number) < 1 || (r.strokes as number) > RULES.maxRoundStrokes) return null;
  if (!(r.period == null || Number.isSafeInteger(r.period))) return null;
  if (!(r.roundMode == null || r.roundMode === "pro" || r.roundMode === "assisted")) return null;
  if (![r.walls, r.pieces].every((x) => x == null || num(x)) || !(r.kind == null || typeof r.kind === "string")) return null;
  if (!(r.pts == null || (Array.isArray(r.pts) && r.pts.every(num)))) return null;
  const name = typeof r.name === "string" ? r.name.slice(0, 60) : undefined;
  return saveOf({ ...(r as SaveOf), name, official: r.official === true });
}
