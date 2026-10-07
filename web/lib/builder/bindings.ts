// What each kind of piece is to the physics, and each skin's changes to it
// (the palette's bindings): plain data, no drawing, so the names (names.ts)
// and a worker read them without the scene.
import { MAX_BOUNCE } from "./rules";
import type { Kind } from "../scene/worlds";

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
  /** what it may lie on or in (E13): kinds ("wall" for a rail or a bar, "post", a zone's kind) the scene draws it well with */
  overlaps?: readonly string[];
}
const r = (min: number, max: number, step: number, def: number): Range => ({ min, max, step, def });
const PASSIVE = r(0, MAX_BOUNCE, 0.05, 0); // (0: the field's; a passive piece plays MaxBounce at most, so no more is offered)

/**
 * Each kind's binding; BINDINGS narrows it skin by skin. The ranges take in
 * what the course's own pieces play (data/holes.txt), and keep each piece
 * drawn as itself: a bar no thicker than course.ts reads as one (1.6), a
 * surface's scale at most 1 unless it is ice (above 1 it is drawn as ice).
 */
export const KIND: Record<Kind, Binding> = {
  rail: { size: r(0.5, 93, 0.25, 6), bounce: PASSIVE, clocks: ["fixed"] }, // (93: the board's 96 less Fit's margins)
  bar: { size: r(0.5, 40, 0.25, 3), thick: r(0.25, 1.6, 0.05, 0.5), bounce: PASSIVE, clocks: ["fixed", "substep", "stroke"] },
  post: { size: r(0.3, 4.5, 0.05, 0.8), bounce: PASSIVE, clocks: ["fixed", "stroke"] },
  surface: { shapes: ["rect", "round", "poly"], size: r(1, 80, 0.25, 6), scale: r(0.3, 1, 0.01, 0.5), clocks: ["fixed"], overlaps: ["slope", "hazard"] },
  // (a slope is the ground's relief: what lies on it is drawn on it)
  slope: { shapes: ["rect", "round", "poly"], size: r(1, 80, 0.25, 8), grade: r(0.05, 0.35, 0.01, 0.2), clocks: ["fixed"], overlaps: ["surface", "hazard", "tunnel"] },
  air: { shapes: ["rect", "round"], size: r(2, 40, 0.25, 6), grade: r(0.05, 0.35, 0.01, 0.25), clocks: ["substep", "fixed"] },
  // a mouth at least 1.5 across: thinner, a fast ball steps over it (E5)
  tunnel: { shapes: ["round", "rect"], size: r(1.5, 8, 0.25, 3), clocks: ["fixed"], overlaps: ["slope"] },
  hazard: { shapes: ["rect", "round", "poly"], size: r(1.5, 80, 0.25, 6), clocks: ["fixed", "stroke"], overlaps: ["slope", "surface"] },
  loop: { shapes: ["rect"], size: r(1.5, 6, 0.1, 2), scale: r(1, 3.5, 0.1, 2), clocks: ["fixed"] },
};

const KICK = { bounce: r(0, 1.5, 0.05, 1.2) };
const ICE = { scale: r(1.01, 1.3, 0.01, 1.18) };
const BIG = { size: r(1, 4.5, 0.05, 2.2) };
// rock among rock: a cluster of them, or one set into a rock wall, reads as one outcrop (the mountain's)
const ROCKY = { overlaps: ["wall", "post"] };

/**
 * Bindings by kind, then skin: the kind's binding with these changes. A
 * drawing with no binding is not in the palette (and must be in HAND_ONLY).
 */
export const BINDINGS: Record<Kind, Record<string, Partial<Binding>>> = {
  rail: { "": {}, rampart: {} },
  bar: {
    "": {}, driftwood: {}, plank: {}, "clock hand": { clocks: ["substep", "fixed"] }, stall: {}, awning: {}, wheelbarrow: {},
    logs: {}, hay: {}, gate: {}, "gate door": {}, hedge: {}, "rowing boat": {}, rail: {}, ledge: {}, net: {},
  },
  post: {
    "": {}, bumper: { ...KICK, plain: true }, scarecrow: {}, sunflower: {}, lantern: {}, sandcastle: { ...BIG, overlaps: ["wall"] }, palm: {}, coral: {}, buoy: {}, crab: {},
    // (a clock's hands turn over it)
    lamp: {}, clock: { overlaps: ["wall"] }, roundabout: BIG, chimney: {}, outcrop: {}, driftwood: {}, house: BIG, "gnome statue": {}, rock: {}, stump: {},
    cat: {}, bandstand: BIG, obelisk: {}, pigeon: {}, stall: {},
    pine: {}, boulder: ROCKY, snowman: {}, chalet: BIG, skater: {},
  },
  surface: {
    "": {}, sand: {}, wetsand: {}, flowerbed: {}, soil: {}, bridge: { scale: r(1, 1, 0.01, 1) }, ice: ICE, molehill: { scale: r(1, 1, 0.01, 1) },
    brick: { scale: r(0.8, 1, 0.01, 0.92) }, herringbone: { scale: r(0.8, 1, 0.01, 0.88) }, marble: { scale: r(1, 1.2, 0.01, 1.05) },
    "plank bridge": { scale: r(1, 1, 0.01, 1) }, snowdrift: {},
  },
  slope: {
    "": {}, dune: {}, stairs: {}, "quarter pipe": {}, funbox: {}, "moon bridge": {},
    kicker: {}, terrace: {}, downhill: {}, slope: {}, "saddle crest": {}, bank: {},
  },
  air: {},
  tunnel: { "": {}, cave: {}, well: {}, door: {}, shipwreck: {}, warp: {}, "ice cave": {} },
  hazard: {
    "": {}, water: {}, wave: {}, lagoon: {}, tidepool: {}, fountain: {}, canal: {},
    cliff: {}, serac: {}, crevasse: {},
  },
  loop: {},
};

