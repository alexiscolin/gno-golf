// The render census as the pipeline takes it (pipeline.ts ValidateOptions
// census, E12): what drew each of a hole's pieces, by buildHole on the hole
// as a player's client gets it, keyed "wall4", "post0", "zone2p1". Its own
// module: it brings the scene (three) in, which the checks themselves do not.
import { buildHole } from "../scene/course";
import { keyOf } from "./gg1";
import type { Drawn } from "../scene/census";
import type { Hole } from "../scene/data";

export function census(s: Hole): Map<string, Drawn> {
  const out = new Map<string, Drawn>();
  buildHole(s, { census: (p, d) => out.set(keyOf(p), d) });
  return out;
}
