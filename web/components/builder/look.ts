// How the board draws a piece from above: its kind's colour, or a skin's
// when the skin names a material (water, lava, sand, ice...). Data, not
// code: a new skin shows in its kind's colour until a word here names it.
import { entryParts } from "@/lib/builder/gg1";

/** A skin's material, by a word in it, first match wins. */
const MATERIALS: readonly (readonly [RegExp, string])[] = [
  [/lava|magma|ember/, "#e0572e"], [/water|pond|sea|river|lake|pool|spring|canal/, "#5aa8d8"], [/ice|frost|snow/, "#d9f0f7"],
  [/sand|dune|beach/, "#ecd28c"], [/mud|bog|swamp|dirt/, "#8a6a45"], [/flower|bed/, "#e58fb5"], [/grass|lawn|green/, "#86c06c"],
  [/void|shaft|pit|hole/, "#2b2440"], [/rock|stone|boulder|crystal/, "#9a9aa8"],
];
/** Each kind's own colour. */
const KINDS: Record<string, string> = {
  rail: "#2a2a2a", bar: "#a8743f", post: "#7b5a3a", surface: "#c9b27a", hazard: "#5aa8d8", slope: "#5f9c63", tunnel: "#3b3550", loop: "#6b5ca5", air: "#b8d8f0",
};

/** The fill of a piece of this entry ("*\/hazard/lava"). */
export function fillOf(entry: string): string {
  const { kind, skin } = entryParts(entry);
  return MATERIALS.find(([re]) => re.test(skin))?.[1] ?? KINDS[kind] ?? "#999";
}
