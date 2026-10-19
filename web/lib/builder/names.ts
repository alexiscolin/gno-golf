// One name per piece (the game-design review's quick win 5, then its piece
// names): every palette entry has one clean name of its own, said on the
// board, in the inspector and the looks, in the glossary and the toasts, and
// in every sentence the checks say ("the wall", "the wet sand", "the lagoon",
// "the blinking hand"). A look is named by its skin ("lagoon": the Lagoon); a
// plain form, or a skin two kinds share or that says too little, by NAMED.
// The palette's tiles (what a piece does: Wall, Water, Barrier) are named
// here too. Plain data on the bindings (no scene), so the checks, the worker
// and the palette (tiles.ts) name alike.
import { BINDINGS, KIND, type Binding } from "./bindings";
import { entryParts } from "./gg1";
import { cap, kicks } from "./rules";
import type { Draft } from "./draft";
import type { Kind } from "../scene/worlds";

/** What naming reads of an entry: its kind, its skin, how it plays. */
export type Named = Pick<Binding, "clocks" | "scale"> & { kind: string; skin: string };

/** The palette's groups under "More", in order. */
export const GROUPS = ["Walls", "Obstacles", "Ground", "Traps", "Moving pieces"] as const;
export type Group = (typeof GROUPS)[number];


// the mountain's drops: a hazard as a pond is, but what they look like is a fall, not water
const DROPS = new Set(["cliff", "serac", "crevasse"]);

/**
 * The tiles by what a piece does, the first that takes an entry its tile: a
 * bar that blinks from the start (a clock's hand), moving air, a tunnel or a
 * hazard timed from the start (a blowhole, a serac), a rail, a bar, a post
 * that kicks, any post, a surface by its grip (faster than grass, much
 * slower, about as grass), a hill, a hazard (a drop or water), a tunnel.
 * An entry none takes gets a tile of its own (a new kind shows without a change here).
 */
export const TILES: readonly { key: string; name: string; does: string; group: Group; takes: (e: Named) => boolean }[] = [
  { key: "timed", name: "Blinking bar", does: "comes and goes", group: "Moving pieces", takes: (e) => e.kind === "bar" && e.clocks[0] !== "fixed" },
  { key: "air", name: "Moving air", does: "blows in bursts", group: "Moving pieces", takes: (e) => e.kind === "air" },
  { key: "spout", name: "Timed tunnel", does: "throws, then rests", group: "Moving pieces", takes: (e) => e.kind === "tunnel" && e.clocks[0] !== "fixed" },
  { key: "fall", name: "Timed trap", does: "now and then", group: "Moving pieces", takes: (e) => e.kind === "hazard" && e.clocks[0] !== "fixed" },
  { key: "wall", name: "Wall", does: "an inner bank", group: "Walls", takes: (e) => e.kind === "rail" },
  { key: "barrier", name: "Barrier", does: "blocks the way", group: "Walls", takes: (e) => e.kind === "bar" },
  { key: "bumper", name: "Bumper", does: "bounces hard", group: "Obstacles", takes: (e) => e.kind === "post" && kicks(e.skin) },
  { key: "obstacle", name: "Obstacle", does: "in the way", group: "Obstacles", takes: (e) => e.kind === "post" },
  { key: "ice", name: "Ice", does: "speeds it up", group: "Ground", takes: (e) => e.kind === "surface" && !!e.scale && e.scale.min > 1 },
  { key: "sand", name: "Sand", does: "slows the ball", group: "Ground", takes: (e) => e.kind === "surface" && !!e.scale && e.scale.def < 0.8 },
  { key: "floor", name: "Floor", does: "rolls like grass", group: "Ground", takes: (e) => e.kind === "surface" },
  { key: "slope", name: "Slope", does: "pushes the ball", group: "Ground", takes: (e) => e.kind === "slope" },
  { key: "drop", name: "Drop", does: "sends it back", group: "Traps", takes: (e) => e.kind === "hazard" && DROPS.has(e.skin) },
  { key: "water", name: "Water", does: "sends it back", group: "Traps", takes: (e) => e.kind === "hazard" },
  { key: "tunnel", name: "Tunnel", does: "pops out further", group: "Traps", takes: (e) => e.kind === "tunnel" },
];


/**
 * The names a skin alone does not give, by kind and skin: the plain forms
 * (named as they are drawn: the plain tunnel is a pipe, the plain post a
 * mushroom), a skin two kinds share (driftwood, a stall: a log and a post, a
 * counter and a stand), and a skin that says too little or too much
 * ("wetsand", "saddle crest"). Every name unique in its world, no word twice
 * (builder-tiles.test.ts).
 */
const NAMED: Readonly<Record<string, string>> = {
  "rail/": "Wall", "bar/": "Barrier", "post/": "Mushroom", "surface/": "Dirt", "slope/": "Slope", "hazard/": "Pond", "tunnel/": "Pipe",
  "bar/driftwood": "Driftwood log", "post/driftwood": "Driftwood post", "bar/stall": "Market stall", "post/stall": "Sweet stand",
  "bar/logs": "Fallen log", "bar/hay": "Hay bales", "bar/rail": "Railing", "bar/gate": "Castle gate", "bar/gate door": "Garden gate",
  "post/clock": "Clock tower", "post/palm": "Palm tree", "post/pine": "Pine tree", "post/lamp": "Street lamp", "post/stump": "Tree stump",
  "surface/wetsand": "Wet sand", "surface/soil": "Vegetable patch", "surface/brick": "Bricks", "surface/herringbone": "Herringbone paving",
  "bar/clock hand": "Blinking hand", // (drawn as a clock's hand, it blinks: it never sweeps)
  "air/gust": "Snow cannon", // (drawn as the cannon that blows it)
  "slope/slope": "Ski slope", "slope/saddle crest": "Saddle", "hazard/wave": "Waves", "hazard/tidepool": "Tide pool",
};

/** An entry's one name ("Wall", "Wet sand", "Lagoon"): NAMED's, else its skin's, else (a plain form of a new kind) its tile's. */
export function entryName(e: Named): string {
  const own = `${e.kind}/${e.skin}`;
  if (Object.hasOwn(NAMED, own)) return NAMED[own];
  return cap(e.skin || (TILES.find((t) => t.takes(e))?.name ?? e.kind));
}

/** An entry by its id, as naming reads it: its kind and skin, with their binding (none: the plain form). */
const namedOf = (id: string): Named => {
  const { kind, skin } = entryParts(id), k = Object.hasOwn(KIND, kind) ? KIND[kind as Kind] : null;
  const own = k && Object.hasOwn(BINDINGS[kind as Kind], skin) ? BINDINGS[kind as Kind][skin] : {};
  return { clocks: ["fixed"], ...k, ...own, kind, skin };
};

/** A piece's name in a sentence: "the wall", "the plank", "the lagoon". */
export const pieceName = (p: Pick<Draft["pieces"][number], "entry">) => `the ${entryName(namedOf(p.entry)).toLowerCase()}`;
