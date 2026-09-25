// The scorecard: your best score on each hole, kept in this browser. It is a
// player's own record of free play — the chain's record is the leaderboard.

// Par is the hole's own, from the chain (Holes()/State() "par"); a hole that
// does not say (or is not known yet) is a par 3.
export const parOf = (h) => (h && h.par) || 3;

const KEY = "gnogolf.card";
const save = (card) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(card));
  } catch {}
  return card;
};
/** A hole's cup: its world, the garden when it says nothing. */
export const cupOf = (h) => h.world || "garden";

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
  // a score is a whole number of strokes; anything else is a bug upstream, not a score
  if (!id || !Number.isInteger(strokes) || strokes < 1) return (console.warn("gnogolf: no score recorded for", id, strokes), card);
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
    par += parOf(h);
    if (sc === 1) aces++;
  }
  return { done, strokes, par, aces, all: holes.length > 0 && done === holes.length };
}

// The cups a player can win, in order. A hole's cup is its world; "extras" is
// not a cup.
const CUPS = ["garden", "island", "town", "mountain"];

/** Totals per cup, from every hole on the chain (not only the cup on screen). */
export function cupTotals(card, allHoles) {
  const out = {};
  let aces = 0;
  for (const c of CUPS) {
    const t = totals(card, allHoles.filter((h) => cupOf(h) === c));
    out[c] = { ...t, clean: t.all && t.strokes <= t.par, open: t.done > 0 || t.all };
    aces += t.aces;
  }
  // the grand slam: every cup the chain has, finished at par or under
  const cups = CUPS.filter((c) => allHoles.some((h) => cupOf(h) === c));
  out.slam = cups.length > 1 && cups.every((c) => out[c].clean);
  out.aces = aces;
  return out;
}

// Gnomes you earn, cup by cup. Front-only, like the card they are earned on;
// ok() is given cupTotals().
// cup: the cup whose card earns it (none for the ones earned across cups)
export const UNLOCKS = {
  wizard: { cup: "garden", need: "Finish the Garden Cup", ok: (t) => t.garden.all },
  viking: { cup: "garden", need: "Garden Cup at par or under", ok: (t) => t.garden.clean },
  golden: { need: "Five holes-in-one", ok: (t) => t.aces >= 5 },
  pirate: { cup: "island", need: "Finish the Island Cup", ok: (t) => t.island.all },
  diver: { cup: "island", need: "Island Cup at par or under", ok: (t) => t.island.clean },
  baker: { cup: "town", need: "Finish Mushroom Town", ok: (t) => t.town.all },
  mayor: { cup: "town", need: "Mushroom Town at par or under", ok: (t) => t.town.clean },
  king: { need: "Every cup at par or under", ok: (t) => t.slam },
};
/** Whether finishing this cup at par or under earns a gnome (the Mountain Cup earns none). */
export const cupHasGnome = (cup) => Object.values(UNLOCKS).some((u) => u.cup === cup);

/** A medal for a finished hole: gold for one stroke, silver under par, bronze at par. */
export const medalOf = (strokes, par) => (!strokes ? null : strokes === 1 ? "gold" : strokes < par ? "silver" : strokes === par ? "bronze" : null);


// the self-check: a finished hole goes on the card, the better score is kept,
// and a bad count (the undefined a count-less answer gave) changes nothing
export function demoCard() {
  const mem = {};
  const ls = globalThis.localStorage;
  globalThis.localStorage = { getItem: (k) => (k in mem ? mem[k] : null), setItem: (k, v) => (mem[k] = String(v)), removeItem: (k) => delete mem[k] };
  try {
    recordScore("h1", 4);
    recordScore("h1", 3);
    recordScore("h1", 5);
    recordScore("h2", undefined);
    const card = loadCard(), t = totals(card, [{ id: "h1", par: 3 }, { id: "h2", par: 3 }]);
    console.assert(card.h1 === 3 && !("h2" in card), "kept the best, refused undefined");
    console.assert(t.done === 1 && t.strokes === 3 && t.par === 3, "totals");
    return "ok";
  } finally {
    globalThis.localStorage = ls;
  }
}
