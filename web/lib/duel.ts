// Ghost duels (ADR-004): a normal round raced against another player's best,
// replayed stroke by stroke on a see-through gnome. This is the pure part:
// which best a duel races, how fast a ghost's stroke plays, and how a result
// reads. The result is the client's arithmetic (V1 records no duel), from two
// numbers the chain vouches for: the player's strokes and the rival's best.
import { SHARE_TAGS } from "./site";
import type { Ghost, HoleState, Mode, Vec2, Zone } from "./types";

/** A duel under way: the ghost raced and who it is, as said on screen. */
export interface Duel {
  ghost: Ghost;
  /** the rival's gno.land name, or their short address */
  name: string;
  /** racing their own best */
  self: boolean;
}

/** The best a duel races: the rival's in the player's aim mode if they have
 *  one, else their other one (the race then marked mixed). */
export const pickGhost = (mode: Mode, ghosts: Readonly<Record<Mode, Ghost | null>>) =>
  ghosts[mode] || ghosts[mode === "pro" ? "assisted" : "pro"];

const SKIES: Readonly<Record<string, string>> = { wind: "wind", fog: "fog", rain: "rain", storm: "a storm", snow: "snow" };
/** A weather's kind (Weather() "kind"), as a duel says it; anything else is clear. */
export const skyWord = (kind: string) => (Object.hasOwn(SKIES, kind) ? SKIES[kind] : "clear skies");

/** A ghost's shots, one "angle,power,tick" each. */
export const shotsOf = (g: Ghost) => g.shots.split(";");

// a ghost's stroke plays a little faster than the player's, faster still to fit its steps in
// about 3 s (a splash or a tube keeps its own time): its turn read, never a long wait
const GHOST_MS = 3000;
/** The speed a ghost's stroke plays at, for a stroke that takes ms at the player's pace:
 *  a little faster, a long one kept to about 3 s. */
export const ghostSpeed = (ms: number) => Math.max(1.25, ms / GHOST_MS);

/** What the score card says is left, before the next stroke n of a race against a best of r:
 *  the last stroke that wins, the one that ties, else the target. */
/** What a duel's next stroke n is worth against a best of r, called out big as the player's turn comes. */
export const raceLeft = (n: number, r: number) => (n > r ? "Out of reach" : n === r ? "Hole it to tie" : n === r - 1 ? "Last one to win!" : `${r - n} strokes left to win`);
export const toBeat = (n: number, r: number) => (n > r ? "out of reach" : n === r ? "hole it to tie" : n === r - 1 ? "hole it to win" : `${r} to beat`);

/** A number of strokes as said in a title: one is a word. */
const inWords = (d: number) => (d === 1 ? "one" : String(d));

/** How a finished duel reads: the card's title and its line. */
export function duelResult(mine: number, d: Duel, term: string) {
  const theirs = d.ghost.strokes, by = inWords(Math.abs(mine - theirs));
  // the title from the player's side, short and big; who and by how much in the line under it
  const line = (who: string) => `${who}${mine === theirs ? `${mine} ${mine === 1 ? "stroke" : "strokes"} each` : `${mine} to ${d.self ? "your" : "their"} ${theirs}`} · ${term}`;
  if (mine === theirs) return { result: "tie" as const, title: d.self ? (mine === 1 ? "You matched your ace!" : "Tied your best") : mine === 1 ? "Ace for ace!" : "Tie!", line: line(d.self ? "" : `Tied with ${d.name} · `) };
  if (mine < theirs) return { result: "win" as const, title: d.self ? "New best!" : "You win!", line: line(d.self ? `Better by ${by} · ` : `You beat ${d.name} by ${by} · `) };
  return { result: "loss" as const, title: d.self ? "Your best stands" : "You lose", line: line(d.self ? `Short by ${by} · ` : `${d.name} wins by ${by} · `) };
}

/** The share text of a finished duel: once saved (a dare back), or the rival's
 *  own dare passed on by a player who can't save. */
export function duelShare(r: ReturnType<typeof duelResult>["result"], d: Duel, hole: string, mine: number, saved: boolean, mixed = false) {
  const tag = (mixed ? " (mixed aim, not a record)" : "") + SHARE_TAGS, theirs = d.ghost.strokes;
  if (!saved && r === "win" && !d.self) return `⚔ Beat ${d.name}'s ${theirs} with ${mine} on ${hole}. Can you? Free to play, no wallet needed.` + tag;
  if (!saved) return `⚔ Can you beat ${d.self ? "my" : `${d.name}'s`} ${theirs} on ${hole}? Free to play, no wallet needed.` + tag;
  if (d.self) return `⚔ ${hole} in ${mine}, raced against my own ghost. Race it too: free to play, no wallet needed.` + tag;
  if (r === "win") return `⚔ Beat ${d.name} on ${hole}, ${mine} to ${theirs}. My ghost is waiting. Free to play, no wallet needed.` + tag;
  if (r === "loss") return `⚔ ${d.name} beat me by ${inWords(mine - theirs)} on ${hole}. Race my ghost while I rematch.` + tag;
  return `⚔ ${d.name} and I both holed ${hole} in ${mine}. Settle it.` + tag;
}

// The rival's screen: its three quick picks, and the hole each one shows off.

/** The first of the board to read for a rival at the player's level: a page of
 *  n around their place (rank, 1 first), or around the board's middle without one. */
export const levelFrom = (rank: number, players: number, n = 5) => Math.max(0, (rank > 0 ? rank - 1 : Math.floor(players / 2)) - Math.floor(n / 2));

/** A rival at the player's level, from such a page: the one just above them (the
 *  one to beat), else just below, then further out; without them on it, the
 *  page's middle first. Never the player, nor one already picked (not). */
export function levelPick<R extends { player: string }>(rows: readonly R[], me: string | null | undefined, not: readonly string[] = []) {
  const at = me ? rows.findIndex((r) => r.player === me) : -1, c = at >= 0 ? at : Math.floor(rows.length / 2);
  for (let d = at >= 0 ? 1 : 0; d <= rows.length; d++)
    for (const r of [rows[c - d], rows[c + d]]) if (r && r.player !== me && !not.includes(r.player)) return r;
  return null;
}

/** One of these rows at random (r: 0..1), the player and those already picked left out. */
export function pickOne<R extends { player: string }>(rows: readonly R[], not: readonly (string | null | undefined)[], r: number) {
  const ok = [...new Map(rows.filter((x) => !not.includes(x.player)).map((x) => [x.player, x])).values()];
  return ok[Math.floor(r * ok.length)] || null;
}

/** A rival's best on a hole, the one raced: the aim mode's, else their other one (null: none). */
export function bestOf(b: Readonly<Record<Mode, number>> | undefined, mode: Mode) {
  const m: Mode = b && b[mode] ? mode : mode === "pro" ? "assisted" : "pro";
  return b && b[m] ? { mode: m, strokes: b[m] } : null;
}

/** The holes a rival shows off, the finest first (n at most): an ace, else
 *  their best against its par (bestOf); the course's order breaks a tie. */
export function showcases(bests: ReadonlyMap<string, Readonly<Record<Mode, number>>>, holes: readonly { id: string; par: number }[], mode: Mode, n = 3) {
  const worth = (t: { strokes: number; par: number }) => (t.strokes === 1 ? -Infinity : t.strokes - t.par);
  const all: { id: string; mode: Mode; strokes: number; par: number }[] = [];
  for (const h of holes) {
    const b = bestOf(bests.get(h.id), mode);
    if (b) all.push({ id: h.id, ...b, par: h.par });
  }
  return all.sort((a, b) => worth(a) - worth(b)).slice(0, n); // (a stable sort: the course's order within a worth)
}

/** A hole seen from above in a round window (0..120, centre 60, radius r),
 *  framed on what happens (fit: the tee, the cup, the path; walls past the
 *  ring are cut): its middle in the window's, as big as its corners allow (a
 *  short one no more than 8 to a board unit), the tee on the left (a wide
 *  one) or at the foot (a tall one), turned half round otherwise. */
export function mapView(fit: readonly Vec2[], { start, cup }: { start: Vec2; cup: Vec2 }, r = 56) {
  const xs = fit.map((p) => p[0]), ys = fit.map((p) => p[1]), x0 = Math.min(...xs), y0 = Math.min(...ys), w = Math.max(...xs) - x0, h = Math.max(...ys) - y0;
  const k = Math.min((1.84 * r) / Math.hypot(w + 6, h + 6), 8), s = (w >= h ? cup[0] < start[0] : cup[1] > start[1]) ? -k : k; // (3 units clear all round)
  const at = ([x, y]: Vec2): Vec2 => [+(60 + (x - x0 - w / 2) * s).toFixed(1), +(60 + (y - y0 - h / 2) * s).toFixed(1)];
  return { at, k };
}

/** What a hole's map frames: the tee, the cup and the ghost's path, and the
 *  hole's own shape (its rails' ends, a rail-less lane's outline), so an L
 *  or a loop reads as itself, not as the same pill as the next hole. */
export function mapFit(hole: Pick<HoleState, "start" | "cup" | "walls" | "zones">, path: readonly Vec2[]): Vec2[] {
  return [hole.start, hole.cup, ...path, ...hole.walls.flatMap((w) => [w.a, w.b]), ...hole.zones.flatMap((z) => (z.outside && z.poly) || [])];
}

export type MapKind = "pond" | "drop" | "sand" | "ice" | "slope" | "over";
// the hazards the ball drops down (drawn dark), not into water
const DROPS = new Set(["crevasse", "ditch", "gap", "cliff", "roof"]);
/** How a zone shows on a hole's map, by what it does to the ball: water or a
 *  drop to fall in, sand, ice, a slope, what passes over or under the lane
 *  (a tunnel, a loop, a bridge); null: not drawn (a flowerbed, the air). */
export function mapZone({ kind, skin, air }: Pick<Zone, "kind" | "skin" | "air">): MapKind | null {
  if (kind === "hazard") return DROPS.has(skin) ? "drop" : "pond";
  if (kind === "surface") return skin.includes("sand") ? "sand" : skin === "ice" ? "ice" : skin.includes("bridge") ? "over" : null;
  if (kind === "slope") return air ? null : "slope";
  return kind === "tunnel" || kind === "loop" ? "over" : null;
}

/** Your score on a hole against their best: none yet, over it (by gap),
 *  level, or under it (won, by gap). */
export function vsBest(mine: number | undefined, theirs: number) {
  const gap = mine ? mine - theirs : 0;
  return { kind: !mine ? "none" : gap > 0 ? "over" : gap < 0 ? "won" : "tie", gap: Math.abs(gap) } as const;
}

/** Points as one SVG line, its corners rounded (each bent through the middles
 *  of its two sides), a loop closed round: a ball's path (unbroken: a dash
 *  drawing it along starts again at each break; a tunnel is crossed straight),
 *  a run of rails. */
export function pathD(points: readonly Vec2[], at: (p: Vec2) => Vec2) {
  const p = points.map(at), n = p.length, xy = (q: Vec2) => q.join(" ");
  const mid = (a: Vec2, b: Vec2): Vec2 => [+((a[0] + b[0]) / 2).toFixed(1), +((a[1] + b[1]) / 2).toFixed(1)];
  if (n < 3) return p.map((q, i) => (i ? "L" : "M") + xy(q)).join("");
  if (xy(p[0]) === xy(p[n - 1])) {
    let d = `M${xy(mid(p[0], p[1]))}`;
    for (let i = 1; i < n; i++) d += `Q${xy(p[i % (n - 1)])} ${xy(mid(p[i % (n - 1)], p[(i + 1) % (n - 1)]))}`;
    return d;
  }
  let d = `M${xy(p[0])}L${xy(mid(p[0], p[1]))}`;
  for (let i = 1; i < n - 1; i++) d += `Q${xy(p[i])} ${xy(mid(p[i], p[i + 1]))}`;
  return d + `L${xy(p[n - 1])}`;
}

/** A hole's rails as runs: walls that meet end to end joined into one line
 *  each (so a run's corners round, see pathD), in the walls' order. */
export function railRuns(walls: readonly { a: Vec2; b: Vec2 }[]) {
  const same = (u: Vec2, v: Vec2) => Math.abs(u[0] - v[0]) < 1e-6 && Math.abs(u[1] - v[1]) < 1e-6;
  const left = walls.slice(), runs: Vec2[][] = [];
  while (left.length) {
    const w = left.shift()!, run: Vec2[] = [w.a, w.b];
    for (let grew = true; grew; ) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const { a, b } = left[i], end = run[run.length - 1], start = run[0];
        const add = same(a, end) ? () => run.push(b) : same(b, end) ? () => run.push(a) : same(b, start) ? () => run.unshift(a) : same(a, start) ? () => run.unshift(b) : null;
        if (add) (add(), left.splice(i, 1), (grew = true), i--);
      }
    }
    runs.push(run);
  }
  return runs;
}

/** Calls run n at a time, the others waiting their turn in order: a screen's
 *  maps read a few at once, never all of them together. */
export function inTurn(n: number) {
  let busy = 0;
  const waiting: (() => void)[] = [];
  return <T>(f: () => Promise<T>): Promise<T> => {
    // (a finished call hands its place to the next one waiting)
    const go = () => Promise.resolve().then(f).finally(() => { const next = waiting.shift(); if (next) next(); else busy--; });
    if (busy < n) return (busy++, go());
    return new Promise<void>((r) => waiting.push(r)).then(go);
  };
}
