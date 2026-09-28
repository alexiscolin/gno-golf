// Small helpers the game screen and the leaderboards share.

import { useEffect, useRef, useState } from "react";
import type { Snapshot } from "@/lib/engine";
import type { HoleRow, Mode } from "@/lib/types";
import { CUPS, parOf, scoreOf, type Card, type Cup } from "@/lib/card";
import { costOf } from "@/lib/adena";
import { isAddress, isHoleId, RULES } from "@/lib/chain";

/** The gnome's head as the logo draws it (a 200 box; app/icon.svg keeps its
 *  own copy): its face, beard, hat and brim. */
export const GNOME = {
  face: { x: 40, y: 100, width: 120, height: 44, rx: 6 },
  beard: "M 40 116 Q 34 190 100 214 Q 166 190 160 116 Q 140 146 100 142 Q 60 146 40 116 Z",
  hat: "M 28 95 Q 40 91 48.7 76 L 96.5 7 Q 100 -1.5 103.5 7 L 151.3 76 Q 160 91 172 95 Z",
  brim: { x: 26, y: 90, width: 148, height: 20, rx: 10 },
} as const;

/** The error's own sentence, or the value said as it is. */
export const messageOf = (e: unknown) => String((e && typeof e === "object" && "message" in e && e.message) || e);

/** An address shortened: its first head and last tail characters ("g1jg8mtu…sqf5"). */
export const shortAddr = (a: string, head = 8, tail = 4) => `${String(a).slice(0, head)}…${String(a).slice(-tail)}`;

/** A new query for a link of the game's: a page pointed at another chain
 *  (?rpc=, ?web=) keeps pointing there, and nothing else is kept. */
export function chainQuery() {
  const q = new URLSearchParams();
  const keep = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  for (const k of ["rpc", "web"]) {
    const v = keep.get(k);
    if (v) q.set(k, v);
  }
  return q;
}

/** The address of this hole, to put in the bar and in shared links; by: the
 *  sharer, whose best on the chain the friend is dared to beat. */
export function holeLink(s: Snapshot, gnome: string, by = "") {
  const q = chainQuery();
  // a cup's hole by its own page (app/h, its link card); one in no cup
  // (community, archived) by its id, never as place 1
  const slot = s.place ? /^([a-z]+)\/(\d+)(\/v\d+)?$/.exec(s.id || "") : null;
  if (!slot) q.set("hole", s.id || "");
  if (gnome) q.set("gnome", gnome);
  if (by && isAddress(by)) q.set("by", by);
  return (slot ? `h/${slot[1]}-${slot[2]}/` : "") + (String(q) ? `?${q}` : "");
}

/** A dare to the whole course: friends race the player's ghost on every hole they have a best on. */
export function dareLink(by: string) {
  const q = chainQuery();
  if (isAddress(by)) q.set("by", by);
  return String(q) ? `?${q}` : "";
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

/** What a gno.land name may not start with (the registrar's reserved words). */
const RESERVED = /^(gno|gl|g1|atom|atone|photon|cosmos)/;
/** A name to start from: the gnome's (letters only, 5 to 13, "golfer" if too
 *  short) and 3 digits, as the registrar wants them. rnd: 0..1. */
export const suggestName = (gnome: string, rnd = Math.random()) => {
  const l = gnome.toLowerCase().replace(/[^a-z]/g, "").slice(0, 13);
  return (l.length >= 5 && !RESERVED.test(l) ? l : "golfer") + String(100 + Math.floor(rnd * 900));
};

/** The registrar's rule for what follows "nym-", said while typing ("" once it holds). */
export const nameHint = (stem: string) =>
  !stem
    ? "5 to 13 letters, then 3 digits"
    : !/^[a-z]+\d{0,3}$/.test(stem)
      ? "lowercase letters, then digits"
      : RESERVED.test(stem)
        ? "it cannot start with gno, gl, g1, atom, atone, photon or cosmos"
        : !/^[a-z]{5,13}(\d|$)/.test(stem)
          ? "5 to 13 letters"
          : !/^[a-z]{5,13}\d{3}$/.test(stem)
            ? "and 3 digits to end"
            : "";

/** "Copied ✓" for a moment: copy(text) puts it on the clipboard, copied says
 *  so for ms (its timer goes with the component). */
export function useCopied(ms = 1800) {
  const [copied, setCopied] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  const copy = (text: string) =>
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      clearTimeout(t.current);
      t.current = setTimeout(() => setCopied(false), ms);
    }, () => {});
  return [copied, copy] as const;
}

const counted = (word: string) => (n: number) => `${n} ${word}${n === 1 ? "" : "s"}`;
/** "1 stroke", "3 strokes"; "1 hole", "6 holes"; "1 ghost", "4 ghosts". */
export const strokesWord = counted("stroke"), holesWord = counted("hole"), ghostsWord = counted("ghost");


/** A finished round, as far as saving it goes: what the save and its gas read. */
export type SaveOf = { id: string; name?: string; shots: readonly string[]; strokes: number; period?: number | null; roundMode?: Mode | null; official?: boolean; walls?: number; pieces?: number; kind?: string; pts?: readonly number[]; works?: readonly number[]; fixed?: number };
export const saveOf = (s: SaveOf): SaveOf => ({ id: s.id, name: s.name, shots: s.shots, strokes: s.strokes, period: s.period, roundMode: s.roundMode, official: s.official, walls: s.walls, pieces: s.pieces, kind: s.kind, pts: s.pts, works: s.works, fixed: s.fixed });
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
  if (![r.walls, r.pieces, r.fixed].every((x) => x == null || num(x)) || !(r.kind == null || typeof r.kind === "string")) return null;
  if (![r.pts, r.works].every((l) => l == null || (Array.isArray(l) && l.every(num)))) return null;
  const name = typeof r.name === "string" ? r.name.slice(0, 60) : undefined;
  return saveOf({ ...(r as SaveOf), name, official: r.official === true });
}

// The win card's words and numbers, pure: said, and tested, here.

// A round is saved in the weather it was played in: the chain takes it while
// that period is the current one or the one just gone, so until the start of
// period + 2 (weather.gno, five-minute periods), by the time of the block that
// takes the transaction. On the chain's clock (chain.now: the last block time
// read), and SAVE_MARGIN early: the signing and the block's inclusion.
const SAVE_MARGIN = 15 * 1000;
export const saveBy = (period: number) => (period + 2) * RULES.periodMs - SAVE_MARGIN;
/** A time left, as a clock says it ("4:07"). */
export const mmss = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** A round's cost in one short line: the total, and whether it is a first save
 *  there. deposit: what the save stores, in ugnot; test: a testnet's GNOT. */
export const costLine = (gas: number, gasPrice: number, saved: boolean | null, deposit: number, test = false) => {
  const g = Number(costOf(gas, gasPrice)), d = deposit / 1e6, unit = test ? "test GNOT" : "GNOT";
  return saved === true ? `About ${g.toFixed(2)} ${unit}` : `About ${(g + d).toFixed(2)} ${unit} (first save on this hole)`;
};

/** A node on this machine sends this address some GNOT from its test1 account:
 *  gnokey's command, "" unless every part checks (it is pasted into a shell). */
export const fundCmd = (address: string, chainId: string, rpc: string) => {
  let host = "";
  try { host = new URL(rpc).host; } catch {}
  return isAddress(address) && /^[\w.-]+$/.test(chainId) && /^[\w.:[\]-]+$/.test(host)
    ? `gnokey maketx send -send 50000000ugnot -to ${address} -gas-fee 1000000ugnot -gas-wanted 2000000 -chainid ${chainId} -remote ${host} -broadcast test1`
    : "";
};

/** The number a hole shows: its place in its cup's course, as the chain
 *  orders it (not the number in its old realm's name: hole19 is the 17th of
 *  the garden); "–" for a hole in no cup (community, archived), never "1". */
export function holeNumber(holes: readonly Pick<HoleRow, "id">[], id: string | null) {
  const i = holes.findIndex((h) => h.id === id);
  return i >= 0 ? String(i + 1) : "–";
}

/** The cup after this one that has holes ("" after the last). */
export const nextCup = (cup: string, counts: Readonly<Record<string, number>>) =>
  CUPS.slice(CUPS.indexOf(cup as Cup) + 1).find((c) => (counts[c] || 0) > 0) || "";

/** A score in golf's own words, from the strokes against par. */
/** What the next stroke n is worth on a par, called out big before it (solo): for an ace, eagle,
 *  birdie, par, bogey; past that, how far over par the round already is. */
export const strokeFor = (n: number, par: number) =>
  n === 1 ? "For an ace!" : n <= par - 2 ? "For eagle!" : n === par - 1 ? "For birdie!" : n === par ? "For par!" : n === par + 1 ? "For bogey" : `${n - 1 - par} over par`;

export function golfTerm(strokes: number, par: number) {
  if (strokes === 1) return "Hole in one!";
  const d = strokes - par;
  return d <= -3 ? "Albatross!" : d === -2 ? "Eagle!" : d === -1 ? "Birdie!" : d === 0 ? "Par" : d === 1 ? "Bogey" : d === 2 ? "Double bogey" : d === 3 ? "Triple bogey" : `${d} over par`;
}

/** The hole to play next: the first after this one not yet played, else the first not played at all. */
// only: the holes that may come next (a duel's: where their ghost is), played ones too when none is left unplayed, never this one
export const nextHole = <H extends Pick<HoleRow, "id" | "slot">>(s: { holes: readonly H[]; id: string | null }, card: Card, only?: (h: H) => boolean) => {
  const at = s.holes.findIndex((h) => h.id === s.id), open = (h: H) => (!only || only(h)) && !scoreOf(card, h);
  return s.holes.find((h, i) => i > at && open(h)) || s.holes.find(open) || (only && (s.holes.find((h, i) => i > at && only(h)) || s.holes.find((h) => h.id !== s.id && only(h))));
};
