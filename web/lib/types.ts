// The hub's JSON, as this page reads it: what gno.land/r/gnogolf/golf prints
// (state.gno, weather.gno). Every object the realm returns carries "version".
// lib/chain.ts is the one place these are parsed; the rest of the client takes
// them as typed.
//
// Numbers are the realm's: board units, 3 decimals ("ball", path points), or
// exact (the "rest" of a shot, its shortest round-trip form). Angles are
// degrees on the way in, radians inside the physics.

/** A board point [x, y] (the scene's x, z). */
export type Vec2 = readonly [number, number];
/** A board point the client builds and fills itself. */
export type MutVec2 = [number, number];

/** An aim mode: the realm ranks each apart. */
export type Mode = "assisted" | "pro";

/** A cup (a world): "garden", "island", "town", "mountain" on the course. */
export type World = string;

interface Versioned {
  version: number;
}

/** A timed piece's clock (a tram, a gate, a storm's gusts): on for `on` of every `every` substeps, from `phase`. */
export interface Timing {
  every?: number;
  on?: number;
  phase?: number;
}

export interface Wall extends Timing {
  a: Vec2;
  b: Vec2;
  skin: string;
}

export interface Post {
  c: Vec2;
  r: number;
  skin: string;
}

/** physics.ZoneKind's names. */
export type ZoneKind = "surface" | "slope" | "tunnel" | "hazard" | "loop" | "unknown";

export interface Zone extends Timing {
  kind: ZoneKind;
  min: Vec2;
  max: Vec2;
  vec: Vec2;
  scale: number;
  round: boolean;
  /** a polygon zone's outline (3 points or more), and whether the zone is its outside */
  poly?: readonly Vec2[];
  outside?: boolean;
  /** moving air, and air that stops at a ceiling: printed only when true (a hole's zones, not the weather's) */
  air?: boolean;
  capped?: boolean;
  skin: string;
}

/** A hole's weather in one period (forecastJSON). */
export interface Forecast {
  period: number;
  kind: string;
  wind: Vec2;
  zones: readonly Zone[];
}

/** Weather(): a forecast on its own. */
export interface Weather extends Versioned, Forecast {}

export interface Board {
  w: number;
  h: number;
}

export interface Wear {
  w: number;
  h: number;
  cells: readonly number[];
}

/** HoleState(): one hole's geometry, skins, weather and wear. */
export interface HoleState extends Versioned {
  /** the version's id, the one to write with */
  hole: string;
  name: string;
  official: boolean;
  /** a data version's alias ("garden/7") and number */
  slot?: string;
  v?: number;
  /** an archived version: the one that took its place */
  next?: string;
  board: Board;
  par: number;
  world: World;
  order: number;
  timed: boolean;
  period: number;
  /** null in the title's baked snapshot (lib/scene/title-holes.json) */
  weather: Forecast | null;
  start: Vec2;
  cup: Vec2;
  walls: readonly Wall[];
  posts: readonly Post[];
  zones: readonly Zone[];
  wear: Wear;
}

/** One round as State and Rounds list it (no path). */
interface RoundRow extends Versioned {
  player: string;
  /** where it lies (3 decimals), and the same ball exactly */
  ball: Vec2;
  rest: Vec2;
  strokes: number;
  done: boolean;
  period: number;
  mode: Mode;
  /** "angle,power[,tick]" joined by ";" */
  shots: string;
}

/** State(): HoleState with the play count and the latest rounds. */
export interface State extends HoleState {
  plays: number;
  roundsTotal: number;
  rounds: readonly RoundRow[];
}

/** Round(): one player's round, its last stroke replayed; null when there is none. */
export interface Round extends RoundRow {
  path: readonly Vec2[];
  air: string;
  cause: string;
}

/** A shot's flight: its path, one air flag and one cause letter per point, and its exact resting point. */
export interface Flight {
  path: readonly Vec2[];
  air: string;
  cause: string;
  rest: Vec2;
}

/** SimulateFrom() (and Simulate()): one stroke. */
export interface SimulateFrom extends Versioned, Flight {
  holed: boolean;
  bounces: number;
}

/** SimulateRound(), SimulateRoundAt(), SimulateCommit(): the last stroke of a list, and the count after it. */
export interface SimulateRound extends SimulateFrom {
  strokes: number;
  period: number;
}

/** Either stroke answer: SimulateFrom has no count (a stroke is a shot). */
export type Stroke = SimulateFrom & Partial<Pick<SimulateRound, "strokes" | "period">>;

/** Extras(): what a timed hole lays down at one stroke. */
export interface Extras extends Versioned {
  walls: readonly Wall[];
  posts: readonly Post[];
  zones: readonly Zone[];
}

/** One hole as Holes() and Community() list it. */
export interface HoleRow {
  id: string;
  name: string;
  official: boolean;
  plays: number;
  best: number;
  proBest: number;
  par: number;
  world: World;
  order: number;
  /** "" unless archived: the version that took its place */
  next: string;
  slot?: string;
}

/** Holes(): the holes a menu lists, the 3D client's link and the realm the course moved to ("" if none). */
export interface Holes extends Versioned {
  play: string;
  successor: string;
  holes: readonly HoleRow[];
}

/** Community(): a page of every community hole, every version. */
export interface Community extends Versioned {
  rows: readonly HoleRow[];
  /** the `after` of the next page, "" at the end */
  next: string;
}

export interface StrokesRow {
  player: string;
  strokes: number;
}

export interface StandingRow extends StrokesRow {
  holes: number;
}

/** Leaderboard(): a mode's course-wide top ten. */
export interface Leaderboard extends Versioned {
  mode: Mode;
  /** the course's current holes */
  holes: number;
  rows: readonly StandingRow[];
}

/** Bests(): these players' best rounds on one hole. */
export interface Bests extends Versioned {
  hole: string;
  mode: Mode;
  par: number;
  rows: readonly StrokesRow[];
}

/** Standings(): these players across the course. */
export interface Standings extends Versioned {
  mode: Mode;
  holes: number;
  rows: readonly StandingRow[];
}

/** Rank(): a player's place in a mode's course ranking (rank 0: not ranked). */
export interface Rank extends Versioned {
  mode: Mode;
  player: string;
  rank: number;
  of: number;
  holes: number;
  strokes: number;
}

/** HoleLeaderboard(): a page of one hole's board. */
export interface HoleLeaderboard extends Versioned {
  hole: string;
  mode: Mode;
  par: number;
  /** named players on the board, and everyone who finished it */
  players: number;
  finished: number;
  offset: number;
  rows: readonly StrokesRow[];
  /** the next page's offset, 0 at the end */
  next: number;
}
