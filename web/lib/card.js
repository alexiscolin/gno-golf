// The scorecard: your best score on each hole, kept in this browser. It is a
// player's own record of free play — the chain's record is the leaderboard.

// Par is the hole's own, from the chain (Holes()/State() "par"); a hole that
// does not say is a par 3. setPars is fed the hole list once it is read.
const PAR = new Map();
export const setPars = (holes) => holes.forEach((h) => h.par && PAR.set(h.id, h.par));
export const parOf = (id) => PAR.get(id) || 3;

const KEY = "gnogolf.card";
const save = (card) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(card));
  } catch {}
  return card;
};
/** A hole's cup: its world, the garden when it says nothing. */
export const worldOf = (h) => h.world || "garden";

export function loadCard() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}") || {};
  } catch {
    return {};
  }
}

/** Keeps the better of the old and new score. Returns the updated card. */
export function recordScore(id, strokes) {
  const card = loadCard();
  if (!card[id] || strokes < card[id]) card[id] = strokes;
  return save(card);
}

/** A new game: the card starts empty again. Gnomes already earned stay earned,
 *  and the chain's leaderboard keeps its record — that one is not ours to wipe. */
export function clearCard() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
  return {};
}

/** Clears one cup's holes from the card, the rest kept. Returns the card. */
export function clearCup(ids) {
  const card = loadCard();
  for (const id of ids) delete card[id];
  return save(card);
}

export function totals(card, holes) {
  let done = 0, strokes = 0, par = 0, aces = 0;
  for (const h of holes) {
    const sc = card[h.id];
    if (!sc) continue;
    done++;
    strokes += sc;
    par += parOf(h.id);
    if (sc === 1) aces++;
  }
  return { done, strokes, par, aces, all: holes.length > 0 && done === holes.length };
}

// The cups a player can win, in order. A hole's cup is its world; "extras" is
// not a cup.
export const CUPS = ["garden", "island", "town", "mountain"];

/** Totals per cup, from every hole on the chain (not only the cup on screen). */
export function cupTotals(card, allHoles) {
  const out = {};
  let aces = 0;
  for (const c of CUPS) {
    const t = totals(card, allHoles.filter((h) => worldOf(h) === c));
    out[c] = { ...t, clean: t.all && t.strokes <= t.par, open: t.done > 0 || t.all };
    aces += t.aces;
  }
  // the grand slam: every cup the chain has, finished at par or under
  const cups = CUPS.filter((c) => allHoles.some((h) => worldOf(h) === c));
  out.slam = cups.length > 1 && cups.every((c) => out[c].clean);
  out.aces = aces;
  return out;
}

// Gnomes you earn, cup by cup. Front-only, like the card they are earned on;
// ok() is given cupTotals().
export const UNLOCKS = {
  wizard: { need: "Finish the Garden Cup", ok: (t) => t.garden.all },
  viking: { need: "Finish the Garden Cup at par or under", ok: (t) => t.garden.clean },
  golden: { need: "Make a hole-in-one on five holes", ok: (t) => t.aces >= 5 },
  pirate: { need: "Finish the Island Cup", ok: (t) => t.island.all },
  diver: { need: "Finish the Island Cup at par or under", ok: (t) => t.island.clean },
  baker: { need: "Finish the Mushroom Town Cup", ok: (t) => t.town.all },
  mayor: { need: "Finish the Mushroom Town Cup at par or under", ok: (t) => t.town.clean },
  king: { need: "The grand slam: every cup at par or under", ok: (t) => t.slam },
};

/** A medal for a finished hole: gold for one stroke, silver under par, bronze at par. */
export const medalOf = (strokes, par) => (!strokes ? null : strokes === 1 ? "gold" : strokes < par ? "silver" : strokes === par ? "bronze" : null);

// the self-check: a cup counts its own holes only, and a slam wants them all clean
export function demo() {
  PAR.set("g1", 2), PAR.set("i1", 3);
  const holes = [{ id: "g1", world: "garden" }, { id: "i1", world: "island" }, { id: "t1", world: "town" }];
  const t = cupTotals({ g1: 2, i1: 5 }, holes);
  console.assert(t.garden.clean && t.island.all && !t.island.clean && !t.slam, "per cup");
  console.assert(cupTotals({ g1: 1, i1: 3, t1: 3 }, holes).slam, "slam");
  console.assert(medalOf(1, 3) === "gold" && medalOf(2, 3) === "silver" && medalOf(3, 3) === "bronze" && !medalOf(4, 3), "medals");
  return "ok";
}
