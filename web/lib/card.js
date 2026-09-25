// The scorecard: your best score on each hole, kept in this browser. It is a
// player's own record of free play — the chain's record is the leaderboard.

// Par is the hole's own, from the chain (Holes()/State() "par"); a hole that
// does not say (or is not known yet) is a par 3.
export const parOf = (h) => (h && h.par) || 3;

const KEY = "gnogolf.card";
const VKEY = "gnogolf.card.v"; // 2: keyed by slot (see migrate)
const save = (card) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(card));
    localStorage.setItem(VKEY, "2");
  } catch {}
  return card;
};
/** A hole's cup: its world, the garden when it says nothing. */
export const cupOf = (h) => h.world || "garden";

// The course was once 74 realms, one a hole; it is now data in slots
// ("garden/17"), each version its own id ("garden/17/v2"). From
// data/holes.txt: the garden's and the extras' old realm under each slot;
// every other cup's slot "<world>/<n>" was the realm "<world><n>".
const OLD_GARDEN = {
  "extras/10": "hole10", "extras/16": "hole16", "garden/1": "hole1", "garden/2": "hole2", "garden/3": "hole3", "garden/4": "hole4",
  "garden/5": "hole5", "garden/6": "hole6", "garden/7": "hole7", "garden/8": "hole8", "garden/9": "hole9", "garden/10": "hole11",
  "garden/11": "hole12", "garden/12": "hole13", "garden/13": "hole14", "garden/14": "hole15", "garden/15": "hole17",
  "garden/16": "hole18", "garden/17": "hole19", "garden/18": "hole20",
};
const OLD_REALM = "gno.land/r/gnogolf/";
const OLD_WORLDS = { island: 18, town: 18, mountain: 18 };

/** The realm a course slot's hole was before it became data ("garden/17" →
 *  "gno.land/r/gnogolf/hole19"), or "" for a slot that had none. */
export function legacyOf(slot) {
  const m = /^([a-z]+)\/(\d+)$/.exec(slot || "");
  if (!m) return "";
  if (OLD_GARDEN[slot]) return OLD_REALM + OLD_GARDEN[slot];
  const n = Number(m[2]);
  return OLD_WORLDS[m[1]] && n >= 1 && n <= OLD_WORLDS[m[1]] ? OLD_REALM + m[1] + n : "";
}

// the old realm → its slot, for the migration and for old links
let slotOfOld = null;
/** The slot a course hole's old realm id became ("gno.land/r/gnogolf/hole19"
 *  → "garden/17"), or "". */
export function oldToSlot(id) {
  if (!slotOfOld) {
    slotOfOld = {};
    for (const slot of Object.keys(OLD_GARDEN)) slotOfOld[legacyOf(slot)] = slot;
    for (const [w, n] of Object.entries(OLD_WORLDS)) for (let i = 1; i <= n; i++) slotOfOld[`${OLD_REALM}${w}${i}`] = `${w}/${i}`;
  }
  return slotOfOld[id] || "";
}

/** The key a hole's score is kept under: its slot (a course hole's, or a
 *  community hole's "<address>/<slug>"), the same through every version, so
 *  a new version keeps the player's own best; a realm hole's id otherwise. */
export const cardKey = (h) => (h && (h.slot || h.id)) || "";
/** A player's best on a hole, from the card. */
export const scoreOf = (card, h) => card[cardKey(h)];

/** The card as version 1 kept it (by realm id) rewritten by slot, the lower
 *  score kept where two land on one slot; a key it cannot map stays as it is. */
export function migrate(old) {
  const card = {};
  for (const [k, v] of Object.entries(old || {})) {
    if (!Number.isInteger(v) || v < 1) continue;
    const key = oldToSlot(k) || k;
    if (!card[key] || v < card[key]) card[key] = v;
  }
  return card;
}

export function loadCard() {
  try {
    const card = JSON.parse(localStorage.getItem(KEY) || "{}") || {};
    return localStorage.getItem(VKEY) === "2" ? card : save(migrate(card));
  } catch {
    return {};
  }
}

/** Keeps the better of the old and new score, under the hole's cardKey.
 *  Returns the updated card. */
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

/** Clears one cup's holes (their cardKeys) from the card, the rest kept.
 *  Returns the card. */
export function clearCup(ids) {
  const card = loadCard();
  for (const id of ids) delete card[id];
  return save(card);
}

export function totals(card, holes) {
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
    // a version-1 card: realm ids to slots, the lower score where two meet
    const m = migrate({ [`${OLD_REALM}hole19`]: 4, "garden/17": 3, [`${OLD_REALM}town5`]: 2, [`${OLD_REALM}hole10`]: 5, "gno.land/r/alice/marsh": 6, x: 0 });
    console.assert(m["garden/17"] === 3 && m["town/5"] === 2 && m["extras/10"] === 5 && m["gno.land/r/alice/marsh"] === 6 && !("x" in m), "migrated");
    console.assert(legacyOf("garden/17") === `${OLD_REALM}hole19` && legacyOf("mountain/18") === `${OLD_REALM}mountain18` && legacyOf("garden/19") === "", "legacy ids");
    console.assert(scoreOf({ "garden/17": 3 }, { id: "garden/17/v2", slot: "garden/17" }) === 3, "a new version keeps the card");
    return "ok";
  } finally {
    globalThis.localStorage = ls;
  }
}
