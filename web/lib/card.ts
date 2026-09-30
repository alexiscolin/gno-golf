// The scorecard: your score on each hole, the latest round's, kept in this
// browser: the player's own run of free play. The chain keeps the best, on
// the leaderboard.
import type { HoleRow } from "./types";

/** A hole as the card reads it: a row of Holes(), or as much of one as is known. */
type CardHole = Pick<HoleRow, "id"> & Partial<Pick<HoleRow, "slot" | "par" | "world">>;
/** The scorecard: a best per cardKey. */
export type Card = Record<string, number>;

// Par is the hole's own, from the chain (Holes()/HoleState() "par"); a hole that
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
// data/holes.txt: the garden's old realm under each slot;
// every other cup's slot "<world>/<n>" was the realm "<world><n>".
const OLD_GARDEN: Record<string, string> = {
  "garden/1": "hole1", "garden/2": "hole2", "garden/3": "hole3", "garden/4": "hole4", "garden/5": "hole5",
  "garden/6": "hole6", "garden/7": "hole7", "garden/8": "hole8", "garden/9": "hole9", "garden/10": "hole11",
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

// The card's scores that are on the chain too: the strokes a save put there,
// per cardKey. A cell shows the seal while its score is that one (the latest
// round replaced by another, it goes).
const CHAIN_KEY = "gnogolf.onchain";
/** The scores saved on-chain, per cardKey. */
export function loadOnChain(): Card {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(CHAIN_KEY) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? migrate(v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
/** A score saved on-chain, kept. Returns them all. */
export function markOnChain(key: string, strokes: number) {
  const all = { ...loadOnChain(), [key]: strokes };
  try { localStorage.setItem(CHAIN_KEY, JSON.stringify(all)); } catch {}
  return all;
}

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

/** The latest round on a hole replaces the one before, under its cardKey.
 *  Returns the updated card. */
export function recordScore(id: string, strokes: number | undefined) {
  const card = loadCard();
  // a score is a whole number of strokes; anything else is a bug upstream, not a score
  if (!id || strokes === undefined || !Number.isInteger(strokes) || strokes < 1) return (console.warn("gnogolf: no score recorded for", id, strokes), card);
  card[id] = strokes;
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
  let done = 0, strokes = 0, par = 0, aces = 0, under = 0;
  for (const h of holes) {
    const sc = scoreOf(card, h);
    if (!sc) continue;
    done++;
    strokes += sc;
    par += parOf(h);
    if (sc === 1) aces++;
    if (sc < parOf(h)) under++;
  }
  return { done, strokes, par, aces, under, all: holes.length > 0 && done === holes.length };
}

// The cups a player can win, in order. A hole's cup is its world.
export const CUPS = ["garden", "island", "town", "mountain"] as const;
export type Cup = (typeof CUPS)[number];
/** A cup's name, as the game calls it. */
export const CUP_NAMES: Readonly<Record<Cup, string>> = { garden: "Garden Cup", island: "Island Cup", town: "Mushroom Town", mountain: "Mountain Cup" };

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

/** A course hole finished, as the badges read it: its strokes and par, Pro
 *  aim or not, its weather (the forecast's kind, "" calm), moving pieces or
 *  not, the cups after it, and every weather a hole was finished in. */
export interface Finish {
  strokes: number;
  par: number;
  pro: boolean;
  kind: string;
  timed: boolean;
  cups: ReturnType<typeof cupTotals>;
  weathers: readonly string[];
  /** a duel's finish: its result, the best raced, whether it was one's own or of the other aim mode */
  duel?: { result: "win" | "loss" | "tie"; theirs: number; self: boolean; mixed: boolean } | null;
}
/** A badge: a moment to collect. family: its medal's colour; ok: earned by a
 *  finish (none: given by a save, the chain's two). */
export interface Badge {
  id: string;
  name: string;
  need: string;
  family: "skill" | "weather" | "chain" | "fun";
  ok?: (f: Finish) => boolean;
}
/** The six weathers (the forecast's kinds; "" is the calm one). */
const WEATHERS = ["", "wind", "fog", "rain", "storm", "snow"] as const;
// Badges, front-only as the gnomes, earned once and kept (lib/prefs.ts). In the
// order they are said when several come at once: the rarest first.
export const BADGES: readonly Badge[] = [
  { id: "first", name: "Number one", need: "Take first place on a hole's board", family: "chain" },
  { id: "perfect", name: "Perfect cup", need: "A whole cup, every hole under par", family: "skill", ok: (f) => CUPS.some((c) => f.cups[c].all && f.cups[c].under === f.cups[c].done) },
  { id: "ace", name: "Hole in one", need: "Hole a ball in one stroke", family: "skill", ok: (f) => f.strokes === 1 },
  // (another player's ghost at par or under, in the same aim mode: the cheap wins don't count)
  { id: "ghost", name: "Ghost buster", need: "Beat another player's ghost at par or under", family: "skill", ok: (f) => !!f.duel && f.duel.result === "win" && !f.duel.self && !f.duel.mixed && f.duel.theirs <= f.par },
  { id: "weathers", name: "All weathers", need: "Finish a hole in all six weathers", family: "weather", ok: (f) => WEATHERS.every((k) => f.weathers.includes(k)) },
  { id: "eagle", name: "Eagle eye", need: "Two under par on a hole", family: "skill", ok: (f) => f.strokes <= f.par - 2 },
  { id: "pro", name: "Pro shot", need: "Under par with no aim line (Pro)", family: "skill", ok: (f) => f.pro && f.strokes < f.par },
  { id: "clock", name: "Clockwork", need: "Par or better on a hole with moving pieces", family: "skill", ok: (f) => f.timed && f.strokes <= f.par },
  { id: "storm", name: "Storm chaser", need: "Finish a hole in a storm", family: "weather", ok: (f) => f.kind === "storm" },
  { id: "snow", name: "Snow day", need: "Finish a hole in the snow", family: "weather", ok: (f) => f.kind === "snow" },
  { id: "fog", name: "Fog walker", need: "Par or better in the fog", family: "weather", ok: (f) => f.kind === "fog" && f.strokes <= f.par },
  { id: "chain", name: "On the chain", need: "Save a round on-chain", family: "chain" },
  { id: "snail", name: "Never give up", need: "Finish a hole in 15 strokes or more", family: "fun", ok: (f) => f.strokes >= 15 },
  // (as Ghost buster: another player's ghost, the same aim mode; a mixed race earns nothing, ADR-004)
  { id: "sport", name: "Good sport", need: "Finish a duel you lost to another player", family: "fun", ok: (f) => !!f.duel && f.duel.result === "loss" && !f.duel.self && !f.duel.mixed },
];
/** The badges a finish earns that are not earned yet, rarest first. */
export const badgesFor = (f: Finish, had: readonly string[]) => BADGES.filter((b) => b.ok && !had.includes(b.id) && b.ok(f)).map((b) => b.id);
/** Badge ids, rarest first (the order the win card says them in). */
export const byRarity = (ids: readonly string[]) => BADGES.filter((b) => ids.includes(b.id)).map((b) => b.id);
