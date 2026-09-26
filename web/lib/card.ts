// The scorecard: your best score on each hole, kept in this browser. It is a
// player's own record of free play — the chain's record is the leaderboard.
import type { HoleRow } from "./types";

/** A hole as the card reads it: a row of Holes(), or as much of one as is known. */
type CardHole = Pick<HoleRow, "id"> & Partial<Pick<HoleRow, "slot" | "par" | "world">>;
/** The scorecard: a best per cardKey. */
export type Card = Record<string, number>;

// Par is the hole's own, from the chain (Holes()/State() "par"); a hole that
// does not say (or is not known yet) is a par 3.
export const parOf = (h: Partial<Pick<HoleRow, "par">> | null | undefined) => (h && h.par) || 3;

const KEY = "gnogolf.card";
const VKEY = "gnogolf.card.v"; // 2: keyed by slot (see migrate)
const save = (card: Card) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(card));
    localStorage.setItem(VKEY, "2");
  } catch {}
  return card;
};
/** A hole's cup: its world, the garden when it says nothing. */
export const cupOf = (h: Partial<Pick<HoleRow, "world">>) => h.world || "garden";

// The course was once 74 realms, one a hole; it is now data in slots
// ("garden/17"), each version its own id ("garden/17/v2"). From
// data/holes.txt: the garden's and the extras' old realm under each slot;
// every other cup's slot "<world>/<n>" was the realm "<world><n>".
const OLD_GARDEN: Record<string, string> = {
  "extras/10": "hole10", "extras/16": "hole16", "garden/1": "hole1", "garden/2": "hole2", "garden/3": "hole3", "garden/4": "hole4",
  "garden/5": "hole5", "garden/6": "hole6", "garden/7": "hole7", "garden/8": "hole8", "garden/9": "hole9", "garden/10": "hole11",
  "garden/11": "hole12", "garden/12": "hole13", "garden/13": "hole14", "garden/14": "hole15", "garden/15": "hole17",
  "garden/16": "hole18", "garden/17": "hole19", "garden/18": "hole20",
};
const OLD_REALM = "gno.land/r/gnogolf/";
const OLD_WORLDS: Record<string, number> = { island: 18, town: 18, mountain: 18 };

/** The realm a course slot's hole was before it became data ("garden/17" →
 *  "gno.land/r/gnogolf/hole19"), or "" for a slot that had none. */
export function legacyOf(slot: string | null | undefined) {
  const m = /^([a-z]+)\/(\d+)$/.exec(slot || "");
  if (!m) return "";
  if (OLD_GARDEN[m[0]]) return OLD_REALM + OLD_GARDEN[m[0]];
  const n = Number(m[2]);
  return OLD_WORLDS[m[1]] && n >= 1 && n <= OLD_WORLDS[m[1]] ? OLD_REALM + m[1] + n : "";
}

// the old realm → its slot, for the migration and for old links
let slotOfOld: Record<string, string> | null = null;
/** The slot a course hole's old realm id became ("gno.land/r/gnogolf/hole19"
 *  → "garden/17"), or "". */
export function oldToSlot(id: string) {
  if (!slotOfOld) {
    const map: Record<string, string> = (slotOfOld = {});
    for (const slot of Object.keys(OLD_GARDEN)) map[legacyOf(slot)] = slot;
    for (const [w, n] of Object.entries(OLD_WORLDS)) for (let i = 1; i <= n; i++) map[`${OLD_REALM}${w}${i}`] = `${w}/${i}`;
  }
  return slotOfOld[id] || "";
}

/** The key a hole's score is kept under: its slot (a course hole's, or a
 *  community hole's "<address>/<slug>"), the same through every version, so
 *  a new version keeps the player's own best; a realm hole's id otherwise. */
export const cardKey = (h: Pick<CardHole, "id" | "slot"> | null | undefined) => (h && (h.slot || h.id)) || "";
/** A player's best on a hole, from the card. */
export const scoreOf = (card: Card, h: Pick<CardHole, "id" | "slot">): number | undefined => card[cardKey(h)];

/** The card as version 1 kept it (by realm id) rewritten by slot, the lower
 *  score kept where two land on one slot; a key it cannot map stays as it is. */
export function migrate(old: Record<string, unknown> | null | undefined) {
  const card: Card = {};
  for (const [k, v] of Object.entries(old || {})) {
    if (typeof v !== "number" || !Number.isInteger(v) || v < 1) continue;
    const key = oldToSlot(k) || k;
    if (!card[key] || v < card[key]) card[key] = v;
  }
  return card;
}

export function loadCard(): Card {
  try {
    const card = (JSON.parse(localStorage.getItem(KEY) || "{}") as Card | null) || {};
    return localStorage.getItem(VKEY) === "2" ? card : save(migrate(card));
  } catch {
    return {};
  }
}

/** Keeps the better of the old and new score, under the hole's cardKey.
 *  Returns the updated card. */
export function recordScore(id: string, strokes: number | undefined) {
  const card = loadCard();
  // a score is a whole number of strokes; anything else is a bug upstream, not a score
  if (!id || strokes === undefined || !Number.isInteger(strokes) || strokes < 1) return (console.warn("gnogolf: no score recorded for", id, strokes), card);
  if (!card[id] || strokes < card[id]) card[id] = strokes;
  return save(card);
}

/** A new game: the card starts empty again. Gnomes already earned stay earned,
 *  and the chain's leaderboard keeps its record — that one is not ours to wipe. */
export function clearCard(): Card {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  return {};
}

/** Clears one cup's holes (their cardKeys) from the card, the rest kept.
 *  Returns the card. */
export function clearCup(ids: Iterable<string>) {
  const card = loadCard();
  for (const id of ids) delete card[id];
  return save(card);
}

export function totals(card: Card, holes: readonly CardHole[]) {
  let done = 0, strokes = 0, par = 0, aces = 0;
  for (const h of holes) {
    const sc = scoreOf(card, h);
    if (!sc) continue;
    done++;
    strokes += sc;
    par += parOf(h);
    if (sc === 1) aces++;
  }
  return { done, strokes, par, aces, all: holes.length > 0 && done === holes.length };
}

// The cups a player can win, in order. A hole's cup is its world; "extras" is
// not a cup.
const CUPS = ["garden", "island", "town", "mountain"] as const;
export type Cup = (typeof CUPS)[number];

/** A score against par as the game prints it: E, +3, −2 (a real minus sign). */
export const vsPar = (n: number) => (n === 0 ? "E" : n > 0 ? `+${n}` : `−${-n}`);

/** A cup's totals: totals(), and whether it is finished at par or under (clean) or begun (open). */
export type CupTotal = ReturnType<typeof totals> & { clean: boolean; open: boolean };
/** Totals per cup, from every hole on the chain (not only the cup on screen). */
export function cupTotals(card: Card, allHoles: readonly CardHole[]) {
  const cup = (c: Cup): CupTotal => {
    const t = totals(card, allHoles.filter((h) => cupOf(h) === c));
    return { ...t, clean: t.all && t.strokes <= t.par, open: t.done > 0 || t.all };
  };
  const out: Record<Cup, CupTotal> = { garden: cup("garden"), island: cup("island"), town: cup("town"), mountain: cup("mountain") };
  // the grand slam: every cup the chain has, finished at par or under
  const cups = CUPS.filter((c) => allHoles.some((h) => cupOf(h) === c));
  return { ...out, slam: cups.length > 1 && cups.every((c) => out[c].clean), aces: CUPS.reduce((n, c) => n + out[c].aces, 0) };
}

/** A gnome to earn: the cup whose card earns it (none for the ones earned
 *  across cups), what it takes, and whether cupTotals() has it. */
interface Unlock {
  cup?: Cup;
  need: string;
  ok: (t: ReturnType<typeof cupTotals>) => boolean;
}
// Gnomes you earn, cup by cup. Front-only, like the card they are earned on;
// ok() is given cupTotals().
export const UNLOCKS = {
  wizard: { cup: "garden", need: "Finish the Garden Cup", ok: (t) => t.garden.all },
  viking: { cup: "garden", need: "Garden Cup at par or under", ok: (t) => t.garden.clean },
  golden: { need: "Five holes-in-one", ok: (t) => t.aces >= 5 },
  pirate: { cup: "island", need: "Finish the Island Cup", ok: (t) => t.island.all },
  diver: { cup: "island", need: "Island Cup at par or under", ok: (t) => t.island.clean },
  baker: { cup: "town", need: "Finish Mushroom Town", ok: (t) => t.town.all },
  mayor: { cup: "town", need: "Mushroom Town at par or under", ok: (t) => t.town.clean },
  king: { need: "Every cup at par or under", ok: (t) => t.slam },
} satisfies Record<string, Unlock>;
export type UnlockId = keyof typeof UNLOCKS;
/** Whether finishing this cup at par or under earns a gnome (the Mountain Cup earns none). */
export const cupHasGnome = (cup: string) => Object.values<Unlock>(UNLOCKS).some((u) => u.cup === cup);

/** A medal for a finished hole: gold for one stroke, silver under par, bronze at par. */
export const medalOf = (strokes: number | null | undefined, par: number) => (!strokes ? null : strokes === 1 ? "gold" : strokes < par ? "silver" : strokes === par ? "bronze" : null);
