// What the editor's dock and palette say, from the checks (the GUI spec's
// B2): the verdict, the gauges against the Builder's limits, GG1's and the
// realm's (size, work), the entries a limit switches off and why.
import { counts, work, WORK_WARN } from "./checks";
import { draftHole } from "./gg1";
import { FIELD, listed } from "./rules";
import type { Cost } from "./wasm";
import type { Draft, V } from "./draft";
import { whereOf } from "./edit";
import { weatherName } from "./carry";
import type { Level, Shown } from "./difficulty";
import type { PaletteEntry } from "./palette";
import type { HoleIn } from "./types";
import { MAX_BYTES, type Validated } from "./pipeline";
import { BUILDER_LIMITS, pieceCounts } from "./limits";

/** Weathers in a sentence: "Clear and Rain", "Clear, Wind and Rain". */
const weathers = (kinds: readonly string[]) => listed(kinds.map(weatherName));

/**
 * The dock's one line: what stands between the draft and the next step (off:
 * why Test is off, testGate's; a check under way says nothing new). rounds:
 * the proofs an edit carried over (carry.ts), the weathers still holed and
 * the lines of the rounds that broke (warn: said calm, ready to test again).
 */
export function verdict({ pieces, errors, proved, off = "", rounds }: { pieces: number; errors: number; proved: boolean; off?: string; rounds?: { kept: readonly string[]; broken: readonly string[] } | null }): { ok: boolean; warn?: boolean; text: string } {
  if (!pieces) return { ok: false, text: "Place pieces between the tee and the cup" };
  if (errors) return { ok: false, text: `${errors} ${errors === 1 ? "thing" : "things"} to fix` };
  if (off && off !== "Checking…") return { ok: false, text: off };
  if (!proved && rounds?.broken.length) {
    const more = rounds.broken.length - 1;
    return { ok: true, warn: true, text: `${rounds.broken[0]}${more ? ` · and ${more} more` : rounds.kept.length ? ` · ${weathers(rounds.kept)} still holed` : ""}` };
  }
  return { ok: true, text: proved ? "Holed in every weather: press Publish." : "Ready: press T to try it, or Prove it." };
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

/** testGate's reason in a few words, beside the big button (the full one in the checks line, ↓). */
export function shortWhy(off: string): string {
  const fix = /^Fix (\d+) first$/.exec(off);
  if (fix) return `${fix[1]} ${fix[1] === "1" ? "thing" : "things"} to fix ↓`;
  if (off === "Give it a short name first") return "Name it first ↓";
  return off;
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

/** The limits worth saying (amber from 80%), in words: the room left; nothing when the hole is far from them all (the full gauges behind a tap). */
export function nearLimits(gs: readonly Gauge[]): string[] {
  return gs.filter((g) => g.level !== "ok").map((g) => {
    if (g.name === "Room") return `Room for a shot in its stormiest weather: ${g.shown} left`;
    if (g.name === "Size") return `Size: ${g.shown} of ${Math.round(g.of / 1024)} KB`;
    const left = g.of - g.used;
    return `${g.name === "Moving" ? "Moving pieces" : g.name}: ${g.used} of ${g.of} · ${left > 0 ? `room for ${left} more` : "no room for more"}`;
  });
}

/** The gauges: GG1's counts, the data's size, and the room a first shot has in the dearest weather (the realm's own numbers, check's cost). */
export function gauges(h: HoleIn, cost: Cost, bytes: number): Gauge[] {
  const c = counts(h), storm = work(cost).storm;
  return [
    gauge("Walls", ...c.walls), gauge("Posts", ...c.posts), gauge("Zones", ...c.zones), gauge("Points", ...c.points),
    gauge("Size", bytes, MAX_BYTES, `${(bytes / 1024).toFixed(1)} KB`),
    { name: "Room", used: storm.used, of: storm.of, shown: `${Math.max(0, Math.round((1 - storm.share) * 100))}%`, level: level(storm.share) },
  ];
}

/** The Builder's own limits (limits.ts, E16), the dock's first gauges: the draft's pieces and its moving ones, known before any check. */
export function pieceGauges(d: Pick<Draft, "pieces">): Gauge[] {
  const c = pieceCounts(d);
  return [gauge("Pieces", c.pieces, BUILDER_LIMITS.pieces, `${c.pieces} / ${BUILDER_LIMITS.pieces}`), gauge("Moving", c.moving, BUILDER_LIMITS.moving, `${c.moving} / ${BUILDER_LIMITS.moving}`)];
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

/**
 * The difficulty meter as the header shows it, for the draft as kept: its level once measured; "measuring" while the
 * worker works on it; said not measured when it answered none (its shots found no way to hole it, or its worker could
 * not run): never "measuring" for ever; none while the hole has errors. It never gates anything.
 */
export function meterFace(clean: boolean, est: { of: Draft; e: Shown | null } | null, kept: Draft): { level: Level | null; word: string; title: string; busy: boolean } {
  if (!clean) return { level: null, word: "–", title: "Difficulty: measured once the hole has no error", busy: false };
  if (!est || est.of !== kept) return { level: null, word: "–", title: "Difficulty: measuring…", busy: true };
  if (!est.e) return { level: null, word: "–", title: "Difficulty: not measured: the meter's shots found no way to hole it, or it could not run here. Try it yourself; it never stops you publishing.", busy: false };
  return { level: est.e.level, word: est.e.word, title: est.e.title, busy: false };
}

