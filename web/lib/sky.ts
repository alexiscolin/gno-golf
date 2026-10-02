// A record's weather from its period, as the realm draws it (course.ForecastFor):
// 64-bit FNV-1a of "<hole id>#<period>", mod 100, read in the world's climate
// (the mines have none of their own: the garden's). Only the kind: the wind and
// the puddles, which a board does not show, are what costs the chain's reads.
// The climates are the realm's (gno.land/p/gnogolf/course/course.gno climates),
// which scripts/selfcheck.ts holds this table to.
import type { SkyKind } from "./card";

export const CLIMATES: Readonly<Record<string, readonly (readonly [number, SkyKind])[]>> = {
  garden: [[55, ""], [20, "wind"], [15, "rain"], [10, "fog"]],
  island: [[50, ""], [25, "wind"], [15, "rain"], [10, "storm"]],
  town: [[50, ""], [20, "rain"], [15, "fog"], [15, "wind"]],
  mountain: [[40, ""], [25, "snow"], [20, "wind"], [15, "fog"]],
};

const OFFSET = 14695981039346656037n, PRIME = 1099511628211n, MASK = (1n << 64n) - 1n;
/** course.gno hash: 64-bit FNV-1a over the string's bytes. */
export function fnv1a(s: string) {
  let h = OFFSET;
  for (const b of new TextEncoder().encode(s)) h = ((h ^ BigInt(b)) * PRIME) & MASK;
  return h;
}

/** The kind of a hole's weather in a period (id: the hole's version, "garden/2/v1"). */
export function skyOf(id: string, world: string, period: number): SkyKind {
  let roll = Number(fnv1a(`${id}#${period}`) % 100n);
  for (const [percent, kind] of CLIMATES[world] || CLIMATES.garden) {
    if (roll < percent) return kind;
    roll -= percent;
  }
  return "";
}
