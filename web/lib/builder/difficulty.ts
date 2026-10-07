// The difficulty meter (the editor's live guidance): how hard a hole the
// rules let through is to play, guessed while it is built. The rules refuse
// what is impossible; this only says what is hard, in a word (Easy, Medium,
// Hard, Very hard), with the piece most to blame named in a sentence, and a
// par to expect until the author's own rounds (proof.ts suggestPar) replace
// it. Never a gate: nothing here stops a test or a publish.
//
// The guess is the realm's own physics (builder.wasm's round and from, the
// shots a player's client previews), played on a budget: a fan of shots
// from the tee aimed along the way to the cup (angles either side of it, a
// spread of powers), then from the best places those reach, stroke after
// stroke as a careful player would go (holing), and from two other good
// second-shot spots. The shares that hole or stop near the cup, the strokes
// the best line takes, the narrowest gap the way squeezes through (checks.ts
// passages) and the timed pieces it must pass make the level. In calm
// weather: the weathers are the test's.
import { RULES, shotOf } from "../chain";
import { inZone, segDist } from "../terrain";
import { LOOSE, nameIn, passages, type Passage } from "./checks";
import type { Draft, V } from "./draft";
import { frame, keyOf, piecesBy, writeDraft } from "./gg1";
import { pieceName } from "./names";
import { CELL, gridOf, reach } from "./lane";
import { cap, FIELD, MAX_PAR } from "./rules";
import type { GHole, GZone } from "./types";
import type { BuilderHost } from "./wasm";
import type { PieceRef } from "../scene/census";
import { calmPeriod } from "./quickshot";

/** The calls the meter plays with: builder.wasm's (the editor's worker has its own host). */
export type Sim = Pick<BuilderHost, "load" | "setperiod" | "find" | "round" | "from" | "fit" | "decode">;

/** A fan of shots round an aim: the angles spread either side of it in steps (degrees), each at every power. */
export interface Fan {
  spread: number;
  step: number;
  powers: readonly number[];
}
/** n powers from lo to hi, in the realm's steps of 0.01. */
const powers = (lo: number, hi: number, n: number) => Array.from({ length: n }, (_, k) => Math.round((lo + ((hi - lo) * k) / (n - 1)) * 100) / 100);
/** scripts/starters.ts' search for a holing round: fine, for one hole at a time. */
export const SEARCH_FAN: Fan = { spread: 40, step: 2, powers: powers(0.5, 10, 39) };
/** The meter's: 33 angles by 16 powers (528 shots a fan). */
export const METER_FAN: Fan = { spread: 40, step: 2.5, powers: powers(0.5, RULES.maxPower, 16) };

/** What the meter may spend: shots played, and time (ms). Past either, it says what it has (cut). */
export interface Budget {
  shots: number;
  ms: number;
}
export const BUDGET: Budget = { shots: 6000, ms: 1500 };
/** Strokes the best line is followed for, at most: past them, no round found. */
export const MAX_STROKES = 6;
/** Near the cup: a ball this close (along the way) is a short putt. */
export const NEAR = 3;
/** A shot about as good as a fan's best: it stops this much further from the cup, at most. */
export const GOOD = 2;
/** A little off a shot: its angle by up to 3° either way, its power by up to a tenth. */
export const JITTER = { angles: [-3, -2, -1, 0, 1, 2, 3], powers: [0.9, 0.95, 1, 1.05, 1.1] } as const;
/** A gap the way needs narrower than this many balls is named. */
export const NARROW = 2;
/** A timed piece in the way that lets the ball by this share of the time or less is named. */
export const RARE = 1 / 2;

/** One shot played: where it stopped, whether it holed, the ball's path (for the zones it crossed). */
export interface Played {
  shot: string;
  holed: boolean;
  rest: V;
  path: readonly V[];
}

/** The sentences and their weight: the heaviest is the one line the dock shows; piece, the draft piece it is about (Show me). */
export interface Reason {
  text: string;
  piece?: string;
  weight: number;
}
import { LEVELS, type Level } from "./levels";
export { LEVELS, type Level };

/** A fan's shares: of the shots played (the realm refuses none from a resting ball), those that holed, and those that holed or stopped near. */
export interface Shares {
  n: number;
  holed: number;
  near: number;
}
export interface Estimate {
  /** null: not measured (the budget ran out before any line holed it) */
  level: Level | null;
  /** the strongest first */
  reasons: Reason[];
  /** the par the meter expects (the best line's strokes, plus one); 0 when it found no round */
  par: number;
  /** the best line's strokes; null when it found none in MAX_STROKES */
  strokes: number | null;
  tee: Shares;
  /** the second-shot spots' together */
  spots: Shares;
  /**
   * each stroke of the best line, how forgiving it is: of shots a little off
   * it (JITTER), the share as good (stopping within GOOD of it along the way;
   * for the stroke that holes, holing or stopping near)
   */
  forgiving: number[];
  /** the narrowest gap the way needs, in balls; null if none under NARROW */
  narrowest: number | null;
  /** shots played, the time it took (ms), and whether the budget cut it short */
  shots: number;
  ms: number;
  cut: boolean;
  /** the best line's paths, a stroke each (as far as it went), for Edit's "Show the line" */
  path: V[][];
  /** where the meter's shots stopped: [x, y, how many] for each unit cell some stopped in, by its middle */
  heat: [number, number, number][];
}

const share = (s: Shares, k: "holed" | "near") => (s.n ? s[k] / s.n : 0);
const add = (a: Shares, b: Shares): Shares => ({ n: a.n + b.n, holed: a.holed + b.holed, near: a.near + b.near });
const NONE: Shares = { n: 0, holed: 0, near: 0 };

/**
 * One fan from a ball at stroke (the tee's first: SimulateRoundAt, the others
 * SimulateFrom, as a round is played), round toward (degrees), in the order
 * the search has always taken them: each played shot handed to each; false
 * from it stops the fan.
 */
function playFan(sim: Sim, id: string, at: V, stroke: number, period: number, toward: number, fan: Fan, each: (p: Played) => boolean | void) {
  for (let da = -fan.spread; da <= fan.spread; da += fan.step) {
    for (const pw of fan.powers) {
      const shot = shotOf(Math.round((toward + da) * 100) / 100, pw);
      const out = stroke === 0 ? sim.round(id, shot, period) : sim.from(id, at[0], at[1], shot, stroke, period);
      if (out.startsWith("panic: ")) continue;
      const r = JSON.parse(out) as { holed: boolean; rest: V; path?: V[] };
      if (each({ shot, holed: r.holed, rest: r.rest, path: r.path ?? [] }) === false) return;
    }
  }
}

/** How the search goes: its fan, how far a ball is from the cup, where to aim from a ball, the strokes at most; each fan's shots seen; stop: give up (a budget). */
export interface Search {
  fan?: Fan;
  dist?: (p: V) => number;
  aim?: (p: V) => number;
  max?: number;
  /** each fan's shots once played, from where, and the one the search took */
  seen?: (stroke: number, from: V, shots: readonly Played[], chosen: Played | null) => void;
  stop?: () => boolean;
  /** every fan played whole, past a shot that holes (the meter's shares count them all) */
  whole?: boolean;
  /** between fans (the worker lets a newer run in): false, and the search ends */
  pause?: () => Promise<boolean>;
}

/**
 * A holing round by search, as a careful player goes: each stroke the best
 * of a fan of shots along the aim (one that holes, else the one that stops
 * nearest), MAX_STROKES at most (scripts/starters.ts finds its rounds so, 8
 * strokes, straight at the cup). The shots, or null if none holed.
 */
export async function holing(sim: Sim, id: string, tee: V, pin: V, period: number, o: Search = {}): Promise<string[] | null> {
  const fan = o.fan ?? SEARCH_FAN, dist = o.dist ?? ((p: V) => Math.hypot(p[0] - pin[0], p[1] - pin[1]));
  const aim = o.aim ?? ((p: V) => (Math.atan2(pin[1] - p[1], pin[0] - p[0]) * 180) / Math.PI);
  const shots: string[] = [];
  let rest = tee;
  sim.setperiod(period);
  for (let k = 0; k < (o.max ?? 8); k++) {
    if (o.pause && !(await o.pause())) return null;
    const r: { best: Played | null; d: number; holed: Played | null; halted: boolean } = { best: null, d: Infinity, holed: null, halted: false };
    const seen: Played[] = [];
    playFan(sim, id, rest, k, period, aim(rest), fan, (p) => {
      if (o.stop?.()) return (r.halted = true), false;
      if (o.seen) seen.push(p);
      if (p.holed) return (r.holed ??= p), !!o.whole;
      const d = dist(p.rest);
      if (!r.best || d < r.d) (r.best = p), (r.d = d);
    });
    if (!r.halted) o.seen?.(k, rest, seen, r.holed ?? r.best);
    if (r.holed) return [...shots, r.holed.shot];
    if (!r.best || r.halted) return null;
    shots.push(r.best.shot);
    rest = r.best.rest;
  }
  return null;
}

/**
 * The way's distance to the cup from any point: a flood out from the cup's
 * cells over the lane (fixed walls, posts and hazards shut, at the ball's
 * clearance), straight steps 1 and diagonal ones √2, in grid units; and from
 * a point, the direction (degrees) to the furthest cell along the way it can
 * see. Infinity where the way does not reach (a hole crossed only by a
 * tunnel or a hop): the meter then measures straight to the cup.
 */
function wayOf(h: GHole) {
  const g = gridOf(h, LOOSE(h), true), n = g.nx * g.ny, cost = new Float64Array(n).fill(Infinity), next = new Int32Array(n).fill(-1);
  // a bucket queue on whole tenths: a step is 10, a diagonal 14
  const buckets: number[][] = [];
  const push = (k: number, c: number) => ((cost[k] = c), (buckets[c] ??= []).push(k));
  for (let k = 0; k < n; k++) {
    const [x, y] = g.centre(k);
    if (!g.shut[k] && Math.hypot(x - h.pin[0], y - h.pin[1]) <= h.cupR) push(k, 0);
  }
  const steps = [[1, 0, 10], [-1, 0, 10], [0, 1, 10], [0, -1, 10], [1, 1, 14], [1, -1, 14], [-1, 1, 14], [-1, -1, 14]] as const;
  for (let c = 0; c < buckets.length; c++) {
    for (const k of buckets[c] ?? []) {
      if (cost[k] !== c) continue;
      const i = k % g.nx, j = (k - i) / g.nx;
      for (const [di, dj, w] of steps) {
        const a = i + di, b = j + dj, q = b * g.nx + a;
        if (a < 0 || b < 0 || a >= g.nx || b >= g.ny || g.shut[q] || cost[q] <= c + w) continue;
        // a diagonal only between two open cells: no squeezing past a corner
        if (di && dj && (g.shut[j * g.nx + a] || g.shut[b * g.nx + i])) continue;
        next[q] = k;
        push(q, c + w);
      }
    }
  }
  // a ball at rest touches a wall: its own cell may be shut, so the nearest open one round it
  const cellOf = (p: V) => {
    let best = -1;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const k = g.cell([p[0] + di * CELL, p[1] + dj * CELL]);
      if (k >= 0 && cost[k] < Infinity && (best < 0 || cost[k] < cost[best])) best = k;
    }
    return best;
  };
  const sees = (p: V, q: V) => {
    const l = Math.hypot(q[0] - p[0], q[1] - p[1]), m = Math.ceil(l / CELL);
    for (let s = 1; s < m; s++) {
      const k = g.cell([p[0] + ((q[0] - p[0]) * s) / m, p[1] + ((q[1] - p[1]) * s) / m]);
      if (k < 0 || g.shut[k]) return false;
    }
    return true;
  };
  const straight = (p: V) => Math.hypot(p[0] - h.pin[0], p[1] - h.pin[1]);
  return {
    dist: (p: V) => {
      const k = cellOf(p);
      return k < 0 ? Infinity : (cost[k] / 10) * CELL;
    },
    reached: (p: V) => cellOf(p) >= 0,
    straight,
    aim: (p: V) => {
      let k = cellOf(p), to: V = h.pin;
      for (; k >= 0; k = next[k]) {
        const c = g.centre(k);
        if (sees(p, c)) to = c;
        else if (straight(c) > 2) break; // round a corner: the last cell seen before it
      }
      if (k < 0 && sees(p, h.pin)) to = h.pin;
      return (Math.atan2(to[1] - p[1], to[0] - p[0]) * 180) / Math.PI;
    },
  };
}

/** A share in a few words: 1/8, 1/3, else a percentage. */
export function fraction(x: number): string {
  for (let d = 2; d <= 12; d++) if (Math.abs(x * d - Math.round(x * d)) < 1e-9 && Math.round(x * d) >= 1) return `${Math.round(x * d)}/${d}`;
  return `${Math.round(x * 100)}%`;
}

/** A piece of the hole in a sentence, with the draft piece it came from (none for a course hole's), and whether it is a plain rail (the lane's edge, as a rule). */
interface Named {
  name: string;
  piece?: string;
  rail: boolean;
}
const shapeOf = (z: GZone) => ({ min: z.min, max: z.max, round: z.round, poly: z.poly, outside: z.outside });

/** The timed pieces (within a stroke, or in a pulse) the way to the cup cannot get round when they are there, each with the share of the time it lets the ball by (RARE or less), the rarest first. */
function timedOnWay(h: GHole): { ref: PieceRef; open: number; pulse: boolean }[] {
  const out: { ref: PieceRef; open: number; pulse: boolean }[] = [], loose = LOOSE(h);
  const blocks = (hh: GHole) => !reach(hh, loose).reached;
  const fixed = <T extends { every: number }>(x: T): T => ({ ...x, every: 0 });
  const note = (ref: PieceRef, open: number, pulse: boolean) => open <= RARE && out.push({ ref, open, pulse });
  h.walls.forEach((w, i) => w.every && blocks({ ...h, walls: h.walls.map((x, k) => (k === i ? fixed(x) : x)) }) && note({ set: "wall", i }, 1 - w.on / w.every, false));
  h.zones.forEach((z, i) => z.every && z.kind === "hazard" && blocks({ ...h, zones: h.zones.map((x, k) => (k === i ? fixed(x) : x)) }) && note({ set: "zone", i }, 1 - z.on / z.every, false));
  h.pulses.forEach((p, k) => {
    const open = 1 - p.on / p.every;
    if (open > RARE) return;
    p.walls.forEach((w, i) => blocks({ ...h, walls: [...h.walls, fixed(w)] }) && note({ set: "wall", i, pulse: k }, open, true));
    p.posts.forEach((q, i) => blocks({ ...h, posts: [...h.posts, q] }) && note({ set: "post", i, pulse: k }, open, true));
    p.zones.forEach((z, i) => z.kind === "hazard" && blocks({ ...h, zones: [...h.zones, fixed(z)] }) && note({ set: "zone", i, pulse: k }, open, true));
  });
  return out.sort((a, b) => a.open - b.open);
}

/** How far a point is from each fixed wall and post: what a ball stops against. */
function solidsOf(h: GHole): { ref: PieceRef; d: (p: V) => number }[] {
  return [
    ...h.walls.map((w, i) => ({ ref: { set: "wall" as const, i }, d: (p: V) => segDist(p[0], p[1], w.a, w.b) })),
    ...h.posts.map((q, i) => ({ ref: { set: "post" as const, i }, d: (p: V) => Math.hypot(p[0] - q.c[0], p[1] - q.c[1]) - q.r })),
  ];
}

/**
 * The level from what was measured: the strokes the best line takes (past
 * two, each a little harder), and the strokes a shot a little off would cost
 * along it (one for each stroke, by how unforgiving it is); at least Medium
 * through a gap under 1.5 balls or past a piece that lets the ball by half
 * the time or less, at least Hard past one that does a quarter of the time or
 * less. No line found: Very hard; none found before the budget ran out
 * (cut): not measured, null. Thresholds tried on the starters, the course
 * and holes made hard on purpose (builder-difficulty.test.ts).
 */
export function levelOf(m: { strokes: number | null; forgiving: readonly number[]; narrowest: number | null; rarest: number | null; cut?: boolean }): Level | null {
  if (m.strokes == null) return m.cut ? null : 3;
  const lost = m.forgiving.reduce((n, f) => n + (1 - f), 0), score = lost + 0.4 * Math.max(0, m.strokes - 2);
  let level: Level = score < 1 ? 0 : score < 1.7 ? 1 : score < 2.5 ? 2 : 3;
  const floor = (l: Level) => (level = Math.max(level, l) as Level);
  if (m.narrowest != null && m.narrowest < 1.5) floor(1);
  if (m.rarest != null) floor(m.rarest <= 0.25 ? 2 : 1);
  return level;
}

/** The id the meter loads a hole under in its host (the editor's checks use their own). */
export const METER_ID = "meter/v1";
/** How the meter runs: its budget and fan, and pause (between fans: false, a newer run took over, and it gives up). */
export interface Run {
  budget?: Budget;
  fan?: Fan;
  pause?: () => Promise<boolean>;
}

/**
 * The meter's estimate of a draft (framed, written and fit as it will be
 * published); null if fit refuses it (the checks say why) or a newer run took
 * over. A hole the rules refuse is measured all the same: nothing here throws
 * on a bad hole.
 */
export async function estimate(sim: Sim, draft: Draft, o: Run = {}): Promise<Estimate | null> {
  const t0 = performance.now(), d = frame(draft), { hex, bars, refs } = writeDraft(d, FIELD[d.world]);
  const f = sim.fit(hex, bars);
  if (!f.ok) return null;
  const by = piecesBy(d, refs);
  return estimateHole(sim, f.hex, (r) => {
    const p = by.get(keyOf(r));
    return p && { name: pieceName(p), piece: p.id, rail: p.entry === "*/rail/" };
  }, o, t0);
}

/**
 * The meter's estimate of a hole's data (hex, canonical; null if it is no hole's), its pieces named
 * by named (a draft's, with their ids; else the hole's own words), within a
 * budget: the shots played and the time they took said, and cut if the
 * budget ran out first (what was measured by then is the estimate).
 */
export async function estimateHole(sim: Sim, hex: string, named: (r: PieceRef) => Named | undefined = () => undefined, o: Run = {}, t0 = performance.now()): Promise<Estimate | null> {
  const budget = o.budget ?? BUDGET, fan = o.fan ?? METER_FAN;
  let h: GHole;
  try {
    h = sim.decode(hex);
  } catch {
    return null; // no hole's data (the checks say why)
  }
  const plain = nameIn(h), of = (r: PieceRef): Named => named(r) ?? { name: plain(r), rail: false };
  sim.load(METER_ID, hex);
  const period = calmPeriod(sim, METER_ID); // (a hole the realm refuses to forecast is still measured, at the clock itself)
  const way = wayOf(h), along = way.reached(h.tee);
  const dist = along ? (p: V) => Math.min(way.dist(p), 1e6 + way.straight(p)) : way.straight;
  const aim = along ? way.aim : (p: V) => (Math.atan2(h.pin[1] - p[1], h.pin[0] - p[0]) * 180) / Math.PI;
  const near = (p: Played) => p.holed || dist(p.rest) <= NEAR;
  const sharesOf = (ps: readonly Played[]): Shares => ({ n: ps.length, holed: ps.filter((p) => p.holed).length, near: ps.filter(near).length });
  // where every shot played stopped, by unit cell (Edit's heat map); the best line's paths
  const stops = new Map<string, [number, number, number]>(), path: V[][] = [];
  const counted = (ps: readonly Played[]) => {
    for (const p of ps) {
      const x = Math.floor(p.rest[0]) + 0.5, y = Math.floor(p.rest[1]) + 0.5, k = `${x} ${y}`;
      stops.set(k, [x, y, (stops.get(k)?.[2] ?? 0) + 1]);
    }
  };

  let shots = 0, cut = false, stopped = false;
  const stop = () => (++shots > budget.shots || performance.now() - t0 > budget.ms ? (cut = true) : false);
  const pause = o.pause && (async () => ((stopped = !(await o.pause!())), !stopped));
  // the best line, its first fan the tee's and its second the best spot's
  let teeShots: Played[] = [], spots = NONE;
  const forgiving: number[] = [], misses: Played[][] = [];
  const line = await holing(sim, METER_ID, h.tee, h.pin, period, {
    fan, dist, aim, max: MAX_STROKES, stop, pause, whole: true,
    seen: (k, from, ps, chosen) => {
      if (k === 0) teeShots = [...ps];
      if (k === 1) spots = add(spots, sharesOf(ps));
      counted(ps);
      if (!chosen) return;
      path.push([...chosen.path]);
      // the chosen shot played a little off, as a player would
      const [a, pw] = chosen.shot.split(",").map(Number), d = dist(chosen.rest), off: Played[] = [];
      const jittered: Fan = { spread: 0, step: 1, powers: [...new Set(JITTER.powers.map((x) => Math.min(RULES.maxPower, Math.round(pw * x * 100) / 100)))] };
      for (const da of JITTER.angles) playFan(sim, METER_ID, from, k, period, a + da, jittered, (p) => (stop() ? false : void off.push(p)));
      const good = (p: Played) => (chosen.holed ? near(p) : p.holed || dist(p.rest) <= d + GOOD);
      if (off.length) forgiving.push(off.filter(good).length / off.length), misses.push(off.filter((p) => !good(p)));
    },
  });
  if (stopped) return null;
  // two more second-shot spots: the next best places the tee's shots reach, apart from the first
  const picked: V[] = [];
  for (const p of teeShots.filter((q) => !q.holed).sort((a, b) => dist(a.rest) - dist(b.rest))) {
    if (picked.length === 3) break;
    if (picked.every((q) => Math.hypot(q[0] - p.rest[0], q[1] - p.rest[1]) > 2)) picked.push(p.rest);
  }
  for (const at of picked.slice(1)) {
    if (cut || (pause && !(await pause()))) break;
    const ps: Played[] = [];
    playFan(sim, METER_ID, at, 1, period, aim(at), fan, (p) => (stop() ? false : void ps.push(p)));
    spots = add(spots, sharesOf(ps));
    counted(ps);
  }
  if (stopped) return null;

  // what the way squeezes through and waits for
  // (a gap in balls as a ball has it: beside a hazard, it needs its radius only)
  const ball = 2 * h.ballR, balls = (g: Passage) => (g.gap - g.need + ball) / ball, gaps = passages(h, (NARROW - 1) * ball).sort((x, y) => balls(x) - balls(y)), timed = timedOnWay(h);
  const tee = sharesOf(teeShots), strokes = line ? line.length : null, narrowest = gaps.length ? balls(gaps[0]) : null;
  const level = levelOf({ strokes, forgiving, narrowest, rarest: timed.length ? timed[0].open : null, cut });
  const reasons: Reason[] = [], about = (n: Named) => (n.piece ? { piece: n.piece } : {});
  const say = (text: string, weight: number, n?: Named) => reasons.some((r) => r.text === text) || reasons.push({ text, weight, ...(n && about(n)) });
  const pairs = new Set<string>();
  for (const g of gaps) {
    // the piece placed in the way named first, not the lane's edge; a pair said once, at its narrowest
    const x = of(g.a), y = of(g.b), [first, other] = x.rail && !y.rail ? [y, x] : [x, y], wide = balls(g);
    if (pairs.has(`${first.piece ?? first.name} ${other.piece ?? other.name}`)) continue;
    pairs.add(`${first.piece ?? first.name} ${other.piece ?? other.name}`);
    const between = first.name === other.name ? `two ${first.name.replace(/^the /, "")}s` : `${first.name} and ${other.name}`;
    say(`The gap between ${between} is only ${wide.toFixed(1)} balls wide: ${wide < 1.5 ? "most shots will catch an edge" : "a shot must be straight to pass"}.`, 3 - wide, first);
  }
  for (const t of timed) {
    const n = of(t.ref);
    say(`${cap(n.name)} lets the ball by only ${t.pulse ? `on ${fraction(t.open)} of the strokes` : `${fraction(t.open)} of the time`}.`, 2 - t.open, n);
  }
  // the least forgiving stroke of the line, and what its shots a little off run into: a hazard, a piece (not the lane's edge)
  const k = forgiving.indexOf(Math.min(...forgiving)), f = forgiving[k];
  if (k >= 0 && f < 0.4) {
    const where = k === 0 ? "from the tee" : k === forgiving.length - 1 && strokes ? "at the cup" : `on stroke ${k + 1}`, off = misses[k];
    const wet = h.zones.map((z, i) => ({ z, i })).filter(({ z }) => z.kind === "hazard" && !z.outside)
      .map(({ z, i }) => ({ n: of({ set: "zone", i }), k: off.filter((p) => p.path.some((q) => inZone(shapeOf(z), q[0], q[1]))).length }))
      .sort((x, y) => y.k - x.k)[0];
    const solids = solidsOf(h), tally = new Map<string, { n: Named; k: number }>();
    for (const p of off) {
      const s0 = solids.filter((x) => x.d(p.rest) < h.ballR + 0.3).sort((x, y) => x.d(p.rest) - y.d(p.rest))[0], n = s0 && of(s0.ref);
      if (n && !n.rail) tally.set(n.piece ?? n.name, { n, k: (tally.get(n.piece ?? n.name)?.k ?? 0) + 1 });
    }
    const stop = [...tally.values()].sort((x, y) => y.k - x.k)[0], w = 1 + (0.4 - f);
    if (wet && wet.k >= 0.3 * off.length) say(`Most shots a little off ${where} end in ${wet.n.name}.`, w, wet.n);
    else if (stop && stop.k >= 0.3 * off.length) say(`Most shots a little off ${where} stop at ${stop.n.name}.`, w, stop.n);
    else say(`Shots ${where} must be just right: one a little off ${where === "at the cup" ? "misses it" : "goes astray"}.`, w);
  }
  if (strokes != null && strokes >= 4 && share(tee, "near") < 0.02) say(`Few shots get near the cup from the tee: it takes ${strokes} good ones.`, 0.7 + 0.1 * (strokes - 4));
  if (strokes == null) say(cut ? "The meter ran out of time on this hole: the test will tell." : `No line the meter tried holed it in ${MAX_STROKES} strokes: it may be very hard to play.`, 1.3);
  return {
    level,
    // an easy hole: nothing to say of it
    reasons: level !== 0 ? reasons.sort((x, y) => y.weight - x.weight) : [],
    par: strokes ? Math.min(MAX_PAR, strokes + 1) : 0,
    strokes, tee, spots, forgiving, narrowest,
    shots: Math.min(shots, budget.shots), ms: Math.round(performance.now() - t0), cut,
    path, heat: [...stops.values()],
  };
}

/** The par in words: "par 3 likely", or nothing when the meter found no round. */
const parWords = (e: Pick<Estimate, "par">) => (e.par ? `par ${e.par} likely` : "");

/** The dock's one line: the strongest reason (and the piece it is about), or, for an easy hole, a calm word and the par it suggests. */
export function meterLine(e: Estimate): { text: string; piece?: string } {
  const top = e.reasons[0];
  if (top) return { text: top.text, ...(top.piece && { piece: top.piece }) };
  return { text: e.level == null ? "Not measured: the test will tell." : `${LEVELS[e.level]} to play${e.par ? `: ${parWords(e)}` : ""}.` };
}

/** The meter's chip in full, for its tooltip and a screen reader: the level, the par it suggests until the test's rounds do, what it took. */
export function meterTitle(e: Estimate): string {
  const par = e.par ? ` ${cap(parWords(e))}, until your test rounds set it.` : "";
  return `Difficulty, the meter's guess: ${e.level == null ? "not measured" : LEVELS[e.level]}.${par} (${e.shots.toLocaleString("en")} shots in ${e.ms} ms${e.cut ? ", cut short" : ""}.)`;
}

/** What the editor shows of an estimate (made in the meter's worker: the editor's own chunk carries none of the meter): the level and its word, the dock's line, the chip's words in full, the par. */
export interface Shown extends Pick<Estimate, "level" | "par" | "path" | "heat"> {
  word: string;
  line: { text: string; piece?: string };
  title: string;
}
export const shown = (e: Estimate): Shown => ({ level: e.level, word: e.level == null ? "–" : LEVELS[e.level], line: meterLine(e), title: meterTitle(e), par: e.par, path: e.path, heat: e.heat });
