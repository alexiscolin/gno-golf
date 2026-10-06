// The hole builder's palette: what an author can place, world by world,
// each piece drawn by the game's own code and bound to the physics it plays
// (ADR-006). It is generated, not typed: an entry exists where a drawing meets
// a binding. The drawings are the scene's own declarations (the shared
// tables POSTS, BARS, MOUTHS, course.ts's and zones.ts's DRAWN, and each
// world module's skins); the bindings are BINDINGS below. A drawing that
// cannot be placed alone is in HAND_ONLY, with why. So a new piece, or a new
// world, appears here by its drawing and a binding, and nowhere else
// (web/test/builder-palette.test.ts holds every entry to both).
import { POSTS, BARS, MOUTHS } from "../scene/pieces";
import { DRAWN as COURSE_DRAWN } from "../scene/course";
import { DRAWN as ZONES_DRAWN } from "../scene/zones";
import { WORLD_NAMES, type Kind, type Skins } from "../scene/worlds";
import { MAX_BOUNCE } from "./rules";

export type { Kind };
export { WORLD_NAMES };
/** A zone's shape: its box, the ellipse in it, a polygon, or all of the box but a polygon. */
export type Shape = "rect" | "round" | "poly" | "outside";
/** How a piece comes and goes: always there, within a stroke (Every/On/Phase), from stroke to stroke (a pulse). */
export type Clock = "fixed" | "substep" | "stroke";
/** A parameter's bounds, its snapping step and its default. */
export interface Range {
  min: number;
  max: number;
  step: number;
  def: number;
}
/** What a piece is to the physics: what an author may set, and within what. */
export interface Binding {
  /** zones: the shapes it may take */
  shapes?: readonly Shape[];
  /** a post's radius, a bar's or a rail's length, a zone's side */
  size: Range;
  /** a bar's thickness */
  thick?: Range;
  /** above MAX_BOUNCE only where the skin kicks (rules.ts KICKS) */
  bounce?: Range;
  /** a surface's rolling resistance; a loop's speed to go round */
  scale?: Range;
  /** a slope's or air's push (|Vec|), at most G·MaxSin */
  grade?: Range;
  /** the clocks it may take; the first is its default */
  clocks: readonly Clock[];
  /** drawn as the plain form on purpose: the plain entries, and the garden's bumper (its mushroom) */
  plain?: boolean;
}
/** Which of the scene's drawings draws it. */
export type Draw = "POSTS" | "BARS" | "MOUTHS" | "course" | "zones" | "world";
export interface PaletteEntry extends Binding {
  /** "island/post/palm", "*\/surface/sand" */
  id: string;
  /** "*": every world */
  world: string;
  label: string;
  /** the exact GG1 skin ("" the plain form) */
  skin: string;
  kind: Kind;
  draw: Draw;
}

const r = (min: number, max: number, step: number, def: number): Range => ({ min, max, step, def });
const PASSIVE = r(0, MAX_BOUNCE, 0.05, 0); // (0: the field's; a passive piece plays MaxBounce at most, so no more is offered)

/**
 * Each kind's binding; BINDINGS narrows it skin by skin. The ranges take in
 * what the course's own pieces play (data/holes.txt), and keep each piece
 * drawn as itself: a bar no thicker than course.ts reads as one (1.6), a
 * surface's scale at most 1 unless it is ice (above 1 it is drawn as ice).
 */
const KIND: Record<Kind, Binding> = {
  rail: { size: r(0.5, 93, 0.25, 6), bounce: PASSIVE, clocks: ["fixed"] }, // (93: the board's 96 less Fit's margins)
  bar: { size: r(0.5, 40, 0.25, 3), thick: r(0.25, 1.6, 0.05, 0.5), bounce: PASSIVE, clocks: ["fixed", "substep", "stroke"] },
  post: { size: r(0.3, 4.5, 0.05, 0.8), bounce: PASSIVE, clocks: ["fixed", "stroke"] },
  surface: { shapes: ["rect", "round", "poly"], size: r(1, 80, 0.25, 6), scale: r(0.3, 1, 0.01, 0.5), clocks: ["fixed"] },
  slope: { shapes: ["rect", "round", "poly"], size: r(1, 80, 0.25, 8), grade: r(0.05, 0.35, 0.01, 0.2), clocks: ["fixed"] },
  air: { shapes: ["rect", "round"], size: r(2, 40, 0.25, 6), grade: r(0.05, 0.35, 0.01, 0.25), clocks: ["substep", "fixed"] },
  tunnel: { shapes: ["round", "rect"], size: r(1.2, 8, 0.1, 3), clocks: ["fixed"] },
  hazard: { shapes: ["rect", "round", "poly"], size: r(1, 80, 0.25, 6), clocks: ["fixed", "stroke"] },
  loop: { shapes: ["rect"], size: r(1.5, 6, 0.1, 2), scale: r(1, 3.5, 0.1, 2), clocks: ["fixed"] },
};

const KICK = { bounce: r(0, 1.5, 0.05, 1.2) };
const ICE = { scale: r(1.01, 1.3, 0.01, 1.18) };
const MOVES = { clocks: ["substep"] } as const satisfies Partial<Binding>; // a machine: drawn only while it runs
const BIG = { size: r(1, 4.5, 0.05, 2.2) };

/**
 * Bindings by kind, then skin: the kind's binding with these changes. A
 * drawing with no binding is not in the palette (and must be in HAND_ONLY).
 */
export const BINDINGS: Record<Kind, Record<string, Partial<Binding>>> = {
  rail: { "": {}, rampart: {}, rockface: {}, crystal: {}, "crystal bumper": KICK, grate: {}, rope: {}, railguard: {} },
  bar: {
    "": {}, driftwood: {}, plank: {}, "clock hand": { clocks: ["substep", "fixed"] }, stall: {}, awning: {}, wheelbarrow: {},
    logs: {}, hay: {}, gate: {}, "gate door": {}, hedge: {}, "rowing boat": {}, rail: {}, ledge: {}, net: {},
    rockface: {}, crystal: {}, "crystal bumper": KICK, grate: {}, rope: {}, railguard: {},
    stamp: MOVES, paddle: MOVES, pickaxe: MOVES, drill: MOVES, piston: MOVES, "swing door": MOVES, "safe door": MOVES,
    boulder: MOVES, "cage door": MOVES, "crystal gate": MOVES, tripwire: MOVES, stalactite: MOVES,
  },
  post: {
    "": {}, bumper: { ...KICK, plain: true }, scarecrow: {}, sunflower: {}, lantern: {}, sandcastle: BIG, palm: {}, coral: {}, buoy: {}, crab: {},
    lamp: {}, clock: {}, roundabout: BIG, chimney: {}, outcrop: {}, driftwood: {}, house: BIG, "gnome statue": {}, rock: {}, stump: {},
    cat: {}, bandstand: BIG, obelisk: {}, pigeon: {}, stall: {},
    pine: {}, boulder: {}, snowman: {}, chalet: BIG, skater: {},
    stalagmite: {}, prop: {}, buffer: {}, "crystal bumper": KICK, "jewel bumper": KICK, "frozen fall": {}, bat: {},
  },
  surface: {
    "": {}, sand: {}, wetsand: {}, flowerbed: {}, soil: {}, bridge: { scale: r(1, 1, 0.01, 1) }, ice: ICE, molehill: { scale: r(1, 1, 0.01, 1) },
    brick: { scale: r(0.8, 1, 0.01, 0.92) }, herringbone: { scale: r(0.8, 1, 0.01, 0.88) }, marble: { scale: r(1, 1.2, 0.01, 1.05) },
    "plank bridge": { scale: r(1, 1, 0.01, 1) }, snowdrift: {},
    rubble: {}, ore: {}, ballast: {}, "drip pool": {}, gold: ICE, causeway: { scale: r(1, 1, 0.01, 1) },
  },
  slope: {
    "": {}, dune: {}, stairs: {}, "quarter pipe": {}, funbox: {}, "moon bridge": {},
    kicker: {}, terrace: {}, downhill: {}, slope: {}, "saddle crest": {}, bank: {},
    incline: {}, "ledge bank": {}, conveyor: {},
  },
  air: { gust: {}, vent: {}, booster: {}, magnet: {} },
  tunnel: { "": {}, cave: {}, well: {}, door: {}, shipwreck: {}, warp: {}, "ice cave": {} },
  hazard: {
    "": {}, water: {}, wave: {}, lagoon: {}, tidepool: {}, fountain: {}, canal: {},
    cliff: {}, serac: {}, crevasse: {}, lava: {}, shaft: {}, sump: {}, "hot spring": {}, "ore bin": {},
  },
  loop: {},
};

/**
 * Drawings by skin that cannot be placed one by one, with why: each comes
 * back as an assembly, with its own binding and render test. (The worlds
 * declare only what they draw from the piece alone: their compositions, a
 * mines ride or a mill's sails, are in no list.)
 */
export const HAND_ONLY: Record<string, string> = {
  "bar/tram": "a tram line is a run of timed bars, with rails and tunnels at the board's edge (course.ts tramLines)",
};

/** The shared drawings (any world), by kind: the scene's tables and declarations. */
export function sharedSkins(): Skins {
  const add = (...lists: (readonly string[] | undefined)[]) => [...new Set(lists.flatMap((l) => l ?? []))];
  return {
    post: add(Object.keys(POSTS), COURSE_DRAWN.post),
    bar: add(Object.keys(BARS), COURSE_DRAWN.bar),
    rail: add(COURSE_DRAWN.rail),
    tunnel: add(Object.keys(MOUTHS), ZONES_DRAWN.tunnel),
    surface: add(ZONES_DRAWN.surface),
    slope: add(COURSE_DRAWN.slope, ZONES_DRAWN.slope),
    hazard: add(ZONES_DRAWN.hazard),
  };
}

const DRAW_OF: Record<Kind, Draw> = { rail: "course", bar: "BARS", post: "POSTS", surface: "zones", slope: "zones", air: "zones", tunnel: "MOUTHS", hazard: "zones", loop: "zones" };
const label = (skin: string, kind: Kind) => (skin ? skin[0].toUpperCase() + skin.slice(1) : `Plain ${kind}`);

function entry(world: string, kind: Kind, skin: string, draw: Draw): PaletteEntry | null {
  const own = Object.hasOwn(BINDINGS[kind], skin) ? BINDINGS[kind][skin] : null;
  if (!own) return null;
  return { ...KIND[kind], ...own, ...(skin === "" && { plain: true }), id: `${world}/${kind}/${skin}`, world, label: label(skin, kind), skin, kind, draw };
}

/** The draw of a shared skin: the table that has it, or the module that declares it. */
function sharedDraw(kind: Kind, skin: string): Draw {
  if (kind === "post") return Object.hasOwn(POSTS, skin) ? "POSTS" : "course";
  if (kind === "bar") return Object.hasOwn(BARS, skin) ? "BARS" : "course";
  if (kind === "tunnel") return Object.hasOwn(MOUTHS, skin) ? "MOUTHS" : "zones";
  return DRAW_OF[kind];
}

/**
 * The palette of a world: the shared entries ("*") and its own (skins, the
 * world module's declaration), a skin the world draws its own way kept once,
 * as the world's.
 */
export function paletteOf(world: string, own: Skins = {}): PaletteEntry[] {
  const out: PaletteEntry[] = [];
  const mine = new Set<string>();
  for (const [kind, skins] of Object.entries(own) as [Kind, readonly string[]][]) {
    for (const s of skins) {
      const e = entry(world, kind, s, "world");
      if (e) out.push(e), mine.add(`${kind}/${s}`);
    }
  }
  for (const [kind, skins] of Object.entries(sharedSkins()) as [Kind, readonly string[]][]) {
    for (const s of skins) {
      if (mine.has(`${kind}/${s}`)) continue;
      const e = entry("*", kind, s, sharedDraw(kind, s));
      if (e) out.push(e);
    }
  }
  return out;
}
