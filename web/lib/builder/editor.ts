// What the editor's dock and palette say, from the checks (the GUI spec's
// B2): the verdict, the gauges against GG1's limits and the realm's (size,
// work), the entries a limit switches off and why, the palette by kind.
import { counts, work, WORK_WARN } from "./checks";
import { draftHole } from "./gg1";
import { FIELD } from "./rules";
import type { Cost } from "./wasm";
import type { Draft, V } from "./draft";
import { whereOf } from "./edit";
import type { PaletteEntry } from "./palette";
import type { HoleIn } from "./types";
import { MAX_BYTES, type Validated } from "./pipeline";

/** The dock's one line: what stands between the draft and the next step (off: why Test is off, testGate's; a check under way says nothing new). */
export function verdict({ pieces, errors, proved, off = "" }: { pieces: number; errors: number; proved: boolean; off?: string }) {
  if (!pieces) return { ok: false, text: "Place pieces between the tee and the cup" };
  if (errors) return { ok: false, text: `${errors} to fix` };
  if (off && off !== "Checking…") return { ok: false, text: off };
  return { ok: true, text: proved ? "Holed in every weather" : "Ready to test" };
}

/**
 * Why Test is off ("" it is on), from the last check: only a check of the
 * draft as kept now counts (an undo or a step since, and it is checking again).
 */
export function testGate(kept: Draft, checked: { of: Draft; v: Validated } | null): string {
  if (!checked || checked.of !== kept) return "Checking…";
  const errors = checked.v.issues.filter((i) => i.severity === "error").length;
  return errors ? `Fix ${errors} first` : !kept.pieces.length ? "Place a piece first" : !kept.slug ? "Give it a short name first" : "";
}

export interface Gauge {
  name: string;
  used: number;
  of: number;
  shown: string;
  level: "ok" | "warn" | "full";
}
const level = (share: number): Gauge["level"] => (share >= 1 ? "full" : share >= WORK_WARN ? "warn" : "ok");
const gauge = (name: string, used: number, of: number, shown = `${used}/${of}`): Gauge => ({ name, used, of, shown, level: level(used / of) });

/** The gauges: GG1's counts, the data's size, and the room a first shot has in the dearest weather (the realm's own numbers, check's cost). */
export function gauges(h: HoleIn, cost: Cost, bytes: number): Gauge[] {
  const c = counts(h), storm = work(cost).storm;
  return [
    gauge("Walls", ...c.walls), gauge("Posts", ...c.posts), gauge("Zones", ...c.zones), gauge("Points", ...c.points),
    gauge("Size", bytes, MAX_BYTES, `${(bytes / 1024).toFixed(1)} KB`),
    { name: "Room", used: storm.used, of: storm.of, shown: `${Math.max(0, Math.round((1 - storm.share) * 100))}%`, level: level(storm.share) },
  ];
}

/** What one piece of an entry takes of each count: a bar four walls, a polygon its points. */
const needs = (e: PaletteEntry) => ({
  walls: e.kind === "rail" ? 1 : e.kind === "bar" ? 4 : 0,
  posts: e.kind === "post" ? 1 : 0,
  zones: e.kind === "rail" || e.kind === "bar" || e.kind === "post" ? 0 : 1,
});
const NAMES = { walls: "Walls", posts: "Posts", zones: "Zones" } as const;

/** The entries a piece more of would pass a limit (E8), each with why; the rest are absent. */
export function offAtLimit(d: Draft, palette: readonly PaletteEntry[]): Map<string, string> {
  const c = counts(draftHole(d, FIELD[d.world]).hole), out = new Map<string, string>();
  for (const e of palette) {
    const n = needs(e);
    for (const k of ["walls", "posts", "zones"] as const) {
      const [used, of] = c[k];
      if (n[k] && used + n[k] > of) {
        out.set(e.id, `${NAMES[k]}: ${used} of ${of}.${n[k] > 1 ? ` A ${e.kind} takes ${n[k]}.` : ""}`);
        break;
      }
    }
  }
  return out;
}

/**
 * How far an edit moved the whole hole: what most of its points (the tee,
 * the cup, each piece kept by name) moved by. An edit that re-frames the
 * draft (gg1.ts frame) shifts everything; the board's view follows it, so
 * nothing jumps on screen. [0, 0] for an edit of a piece or two.
 */
export function commonShift(prev: Draft, next: Draft): V {
  const at = new Map(prev.pieces.map((p) => [p.id, whereOf(p.geometry)]));
  const moves: V[] = [[next.tee[0] - prev.tee[0], next.tee[1] - prev.tee[1]], [next.pin[0] - prev.pin[0], next.pin[1] - prev.pin[1]]];
  for (const p of next.pieces) {
    const w = at.get(p.id), v = whereOf(p.geometry);
    if (w) moves.push([v[0] - w[0], v[1] - w[1]]);
  }
  const tally = new Map<string, { v: V; n: number }>();
  for (const v of moves) {
    const k = v.join(" "), t = tally.get(k) ?? { v, n: 0 };
    tally.set(k, { v, n: t.n + 1 });
  }
  return [...tally.values()].reduce((a, b) => (b.n > a.n ? b : a)).v.map((x) => x + 0) as V;
}

/** The palette's groups, in the editor's order; a kind no group names goes in "More" (a new kind shows without a change here). */
const GROUPS: readonly (readonly [string, readonly string[]])[] = [
  ["Walls", ["rail", "bar"]], ["Posts", ["post"]], ["Ground", ["surface"]], ["Hazards", ["hazard"]], ["Hills", ["slope"]], ["Jumps", ["tunnel", "loop"]],
];
export function groupsOf(palette: readonly PaletteEntry[]) {
  const named = new Set(GROUPS.flatMap(([, ks]) => ks));
  return [...GROUPS.map(([name, kinds]) => ({ name, entries: palette.filter((e) => kinds.includes(e.kind)) })), { name: "More", entries: palette.filter((e) => !named.has(e.kind)) }]
    .filter((g) => g.entries.length);
}
