// The records a board puts forward: not its top three, a few worth beating today,
// each for a reason said on its card (within reach, a hole in one, the best in a
// storm, the latest, a rising player…). One card a player, never you, never the
// board's first three (but the place just above yours), the flagged left out by
// the caller (flags.ts screen); drawn again each day (today), so a board's
// champion is not its face.
import type { SkyKind } from "./card";

/** What a card says of its player, and why it is there. */
export type Tag = "reach" | "next" | "start" | "ace" | "sky" | "fresh" | "rising" | "sharp" | "day" | "more";
export interface Pick<R> { row: R; tag: Tag; sky?: SkyKind }

/** The day, a number: the picks hold for it, and change with it. */
export const today = (now = Date.now()) => Math.floor(now / 864e5);
// a player's draw for a day: the same all day, another the next
const draw = (player: string, day: number) => {
  let h = 2166136261 ^ day;
  for (let i = 0; i < player.length; i++) h = Math.imul(h ^ player.charCodeAt(i), 16777619);
  return h >>> 0;
};
const drawn = <R extends { player: string }>(rows: readonly R[], day: number) => (rows.length ? rows.reduce((a, b) => (draw(b.player, day) < draw(a.player, day) ? b : a)) : undefined);

// the board's first places: no card of their own (but the place above yours: "reach", "next")
const PODIUM = 3;
/** Picks, in order, from candidates (a tag and the rows that could carry it): the first of
 *  each its own player, at most n, one card a player, never `me`; today's pick fills the rest. */
function choose<R extends { player: string; at: number }>(cands: readonly [Tag, readonly R[], ((r: R) => SkyKind | undefined)?][], me: string | null | undefined, day: number, n: number) {
  const out: Pick<R>[] = [], used = new Set<string>(me ? [me] : []);
  for (const [tag, rows, sky] of cands)
    // (today's pick fills the cards the others left: as many as it takes)
    for (let again = true; again && out.length < n; again = tag === "day") {
      const r = drawn(rows.filter((x) => !used.has(x.player) && (tag === "reach" || tag === "next" || x.at > PODIUM)), day);
      if (!r) break;
      used.add(r.player);
      out.push(sky ? { row: r, tag, sky: sky(r) } : { row: r, tag: tag === "day" && out.some((p) => p.tag === "day") ? "more" : tag });
    }
  return out;
}

/** The skies a record is worth more in (fog only hides the view: not one). */
export const HARD_SKIES: readonly SkyKind[] = ["storm", "snow", "rain", "wind"];

/** A hole's board's picks. rows: in the board's order with their places, the flagged out;
 *  info: a record's block and sky (recordsOf, sky.ts); mine: your best here (strokes), null if none. */
export function holePicks<R extends { player: string; strokes: number; at: number }>(rows: readonly R[], info: ReadonlyMap<string, { height: number; sky?: SkyKind }>, me: string | null | undefined, mine: number | null, day = today(), n = 3) {
  const others = rows.filter((r) => r.player !== me);
  // the next step up from your best: one stroke fewer, else the closest under it
  const under = mine ? others.filter((r) => r.strokes < mine) : [];
  const step = under.length ? Math.max(...under.map((r) => r.strokes)) : 0;
  // no best of yours here yet: a first target, the board's middle (a record a newcomer can beat)
  const mid = mine == null && others.length ? others[Math.floor(others.length / 2)] : undefined;
  // the best in each hard sky (board order: the first of its sky, yours too; one of the first places or yours: no card, the title is theirs)
  const bestInSky = HARD_SKIES.flatMap((k) => rows.find((r) => info.get(r.player)?.sky === k) ?? []).filter((r) => r.player !== me);
  const fresh = Math.max(0, ...others.map((r) => info.get(r.player)?.height ?? 0));
  return choose<R>([
    ["reach", under.filter((r) => r.strokes === step)],
    ["start", mid ? [mid] : []],
    ["ace", others.filter((r) => r.strokes === 1)],
    ["sky", bestInSky, (r) => info.get(r.player)?.sky],
    ["fresh", fresh ? others.filter((r) => info.get(r.player)?.height === fresh) : []],
    ["day", others],
  ], me, day, n);
}

/** The course board's picks. rows: in its order with their places, the flagged out; holes: the
 *  course's; mine: your row (null: not on it); above: the row just above yours, if read. */
export function coursePicks<R extends { player: string; holes?: number; strokes: number; par?: number; at: number }>(rows: readonly R[], holes: number, me: string | null | undefined, mine: { holes?: number } | null, above: R | null, day = today(), n = 3) {
  const others = rows.filter((r) => r.player !== me);
  const holesOf = (r: { holes?: number }) => r.holes || 0, perHole = (r: R) => (r.strokes - (r.par || 0)) / holesOf(r);
  // rising: a third of the course or less, at par or better on it
  const rising = others.filter((r) => holesOf(r) > 0 && holesOf(r) <= Math.max(1, Math.floor(holes / 3)) && perHole(r) <= 0);
  // the sharpest: a fair share of the course played (a third of it, nine holes at least), the best against par a hole
  const many = others.filter((r) => holesOf(r) >= Math.max(9, Math.floor(holes / 3))), best = many.length ? Math.min(...many.map(perHole)) : 0;
  // the place above yours: within reach on as many holes as yours, else the next one up
  const reach = !!above && !!mine && holesOf(above) === holesOf(mine);
  return choose<R>([
    [reach ? "reach" : "next", above ? [above] : []],
    ["rising", rising],
    ["sharp", many.filter((r) => perHole(r) === best)],
    ["day", others],
  ], me, day, n);
}

/** A tag in words, for the card: a dozen letters at most (a phone's card is narrow). */
export function tagWord(p: { tag: Tag; sky?: SkyKind }) {
  switch (p.tag) {
    case "reach": return "Within reach";
    case "next": return "One place up";
    case "start": return "First target";
    case "ace": return "Hole in one";
    case "sky": return p.sky === "storm" ? "Storm master" : p.sky === "snow" ? "Snow master" : p.sky === "rain" ? "Rain master" : "Wind master";
    case "fresh": return "Latest";
    case "rising": return "Fast start";
    case "sharp": return "Best average";
    case "day": return "Today's pick";
    case "more": return "Also today";
  }
}

/** What a save does on its hole's board, said on the save button (useRankNudge): the players it
 *  passes, the best in its weather here, a new best of yours, else your first record here; the place after. */
export const saveLine = (g: { pass: readonly string[]; best: boolean; sky: SkyKind }, at: number) =>
  `${g.pass.length ? `Pass ${g.pass[0]}${g.pass.length > 1 ? ` +${g.pass.length - 1}` : ""}` : g.sky ? `${tagWord({ tag: "sky", sky: g.sky })} here` : g.best ? "Your new best" : "Your first record"} · #${at}`;
