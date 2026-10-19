// The hole builder's palette: what an author can place, world by world,
// each piece drawn by the game's own code and bound to the physics it plays
// (ADR-006). It is generated, not typed: an entry exists where a drawing meets
// a binding. The drawings are the scene's own declarations (the shared
// tables POSTS, BARS, MOUTHS, course.ts's and zones.ts's DRAWN, and each
// world module's skins); the bindings are bindings.ts BINDINGS. A drawing that
// cannot be placed alone is in HAND_ONLY, with why. A shared drawing also
// says where it is at home (HOME: every world, the worlds named, or the
// shore's), elsewhere offered as borrowed ("From other worlds") or, a shore
// piece, not at all. So a new piece appears here by its drawing, a binding
// and, shared, its HOME, and nowhere else; a new world by its skins
// (web/test/builder-palette.test.ts holds every entry to all three).
import { POSTS, BARS, MOUTHS } from "../scene/pieces";
import { DRAWN as COURSE_DRAWN } from "../scene/course";
import { DRAWN as ZONES_DRAWN } from "../scene/zones";
import { WORLD_NAMES, loadWorld, worldOf, type Kind, type Skins } from "../scene/worlds";
import { own } from "../own";
import { FIELD, notABuilderWorld } from "./rules";
import { BINDINGS, KIND, type Binding, type Clock, type Range, type Shape } from "./bindings";

export type { Kind };
export type { Binding, Clock, Range, Shape };
export { BINDINGS };
export { WORLD_NAMES };
/** Which of the scene's drawings draws it. */
export type Draw = "POSTS" | "BARS" | "MOUTHS" | "course" | "zones" | "world";
export interface PaletteEntry extends Binding {
  /** "island/post/palm", "*\/surface/sand" */
  id: string;
  /** "*": every world */
  world: string;
  /** the exact GG1 skin ("" the plain form) */
  skin: string;
  kind: Kind;
  draw: Draw;
  /** another world's piece (HOME), offered under "From other worlds" */
  borrowed?: true;
}

/**
 * Drawings by skin that cannot be placed one by one, with why: each comes
 * back as an assembly, with its own binding and render test. (The worlds
 * declare only what they draw from the piece alone: their compositions, a
 * mill's sails, are in no list.) Only the Builder's worlds' drawings are
 * here (the Crystal Mines' are the game's alone).
 */
export const HAND_ONLY: Record<string, string> = {
  "bar/tram": "a tram line is a run of timed bars, with rails and tunnels at the board's edge (course.ts tramLines)",
};

/**
 * Where each shared drawing is at home, by kind and skin: every world ("*",
 * a plain piece any lane has), the worlds named (the game's own holes there
 * place it, or it is of their kind), or the shore ("sea": a world with a sea,
 * worlds.ts SEA; away from one a palm, a crab or the waves look wrong, and no
 * other world offers them). Elsewhere a piece is borrowed: offered under
 * "From other worlds". A world's own drawings (its module's skins) are its
 * own. Every shared drawing has one (builder-palette.test.ts), so a new one
 * says where it belongs.
 */
export const HOME: Readonly<Record<string, "*" | "sea" | readonly string[]>> = {
  "rail/": "*", "rail/rampart": ["island"],
  "bar/": "*", "bar/plank": "*", "bar/logs": ["garden", "town", "mountain"], "bar/hay": ["garden"], "bar/gate": ["garden"], "bar/gate door": ["garden"],
  "bar/hedge": ["garden"], "bar/wheelbarrow": ["garden"], "bar/stall": ["town"], "bar/awning": ["town"], "bar/clock hand": ["town"], "bar/driftwood": "sea",
  "post/": "*", "post/bumper": "*", "post/rock": "*", "post/stump": ["garden", "town", "mountain"], "post/scarecrow": ["garden"], "post/sunflower": ["garden"],
  "post/lantern": ["garden"], "post/outcrop": ["island"], "post/sandcastle": "sea", "post/palm": "sea", "post/coral": "sea", "post/buoy": "sea", "post/crab": "sea",
  "post/driftwood": "sea", "post/lamp": ["town"], "post/clock": ["town"], "post/roundabout": ["town"], "post/chimney": ["town"], "post/house": ["town"], "post/gnome statue": ["town"],
  "tunnel/": "*", "tunnel/warp": "*", "tunnel/cave": ["island"], "tunnel/well": ["town"], "tunnel/door": ["town"], "tunnel/shipwreck": "sea",
  "surface/": "*", "surface/sand": "*", "surface/wetsand": "sea", "surface/flowerbed": ["garden", "town"], "surface/soil": ["garden"], "surface/bridge": ["garden", "town"],
  "surface/ice": ["garden", "mountain"], "surface/molehill": ["garden"],
  "slope/": "*", "slope/dune": "sea", "slope/stairs": ["town"], "slope/quarter pipe": ["town"], "slope/funbox": ["town"], "slope/moon bridge": ["garden"],
  "hazard/": "*", "hazard/water": "*", "hazard/wave": "sea", "hazard/lagoon": "sea", "hazard/tidepool": "sea", "hazard/fountain": ["town"], "hazard/canal": ["town"],
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

function makeEntry(world: string, kind: Kind, skin: string, draw: Draw): PaletteEntry | null {
  const own = Object.hasOwn(BINDINGS[kind], skin) ? BINDINGS[kind][skin] : null;
  if (!own) return null;
  return { ...KIND[kind], ...own, ...(skin === "" && { plain: true }), id: `${world}/${kind}/${skin}`, world, skin, kind, draw };
}

/** The draw of a shared skin: the table that has it, or the module that declares it. */
function sharedDraw(kind: Kind, skin: string): Draw {
  if (kind === "post") return Object.hasOwn(POSTS, skin) ? "POSTS" : "course";
  if (kind === "bar") return Object.hasOwn(BARS, skin) ? "BARS" : "course";
  if (kind === "tunnel") return Object.hasOwn(MOUTHS, skin) ? "MOUTHS" : "zones";
  return DRAW_OF[kind];
}

/**
 * The palette of a world: its own entries (skins, the world module's
 * declaration), then the shared ones ("*"), a skin the world draws its own
 * way kept once, as the world's; a shared one away from its HOME borrowed,
 * and the shore's left out where there is no sea.
 */
export function paletteOf(world: string, own: Skins = {}, sea = false): PaletteEntry[] {
  const out: PaletteEntry[] = [];
  const mine = new Set<string>();
  for (const [kind, skins] of Object.entries(own) as [Kind, readonly string[]][]) {
    for (const s of skins) {
      const e = makeEntry(world, kind, s, "world");
      if (e) out.push(e), mine.add(`${kind}/${s}`);
    }
  }
  for (const [kind, skins] of Object.entries(sharedSkins()) as [Kind, readonly string[]][]) {
    for (const s of skins) {
      const home = Object.hasOwn(HOME, `${kind}/${s}`) ? HOME[`${kind}/${s}`] : [];
      if (mine.has(`${kind}/${s}`) || (home === "sea" && !sea)) continue;
      const e = makeEntry("*", kind, s, sharedDraw(kind, s));
      if (e) out.push(home === "*" || home === "sea" || home.includes(world) ? e : { ...e, borrowed: true });
    }
  }
  return out;
}

/** The pieces a first hole needs, first in the palette and named plainly (the GUI spec's B3); the world's others under "More pieces" (a Bank among them: the green walls itself, Board's Grow, so a wall by hand is an inner bank). */
export const COMMON = [["Bumper", "*/post/bumper"], ["Sand", "*/surface/sand"], ["Water", "*/hazard/water"], ["Slope", "*/slope/"]] as const;

/** A palette's common pieces, in that order, each named plainly (those it has). */
export const commonOf = (palette: readonly PaletteEntry[]) =>
  COMMON.flatMap(([name, id]) => palette.filter((e) => e.id === id).map((entry) => ({ name, entry })));

/** A world's palette, its module loaded first (its skins are declared beside its drawings). */
export async function loadPalette(world: string): Promise<readonly PaletteEntry[]> {
  if (!Object.hasOwn(FIELD, world)) throw new Error(notABuilderWorld(world));
  await loadWorld(world);
  const w = worldOf({ world });
  return paletteOf(world, w.skins, w.SEA !== undefined);
}

/** The entry of a palette by its id ("island/post/palm"), undefined for none. */
export function entry(id: string, palette: readonly PaletteEntry[]): PaletteEntry | undefined {
  return own(Object.fromEntries(palette.map((e) => [e.id, e])), id);
}
