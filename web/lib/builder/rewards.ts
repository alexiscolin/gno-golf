// What an author gets back once a hole is out (the game-design review's #8),
// all of it from the chain's own records (chain.ts holesOf, savedOn): no
// likes, no server. Each hole's players, plays and best against the
// author's own; a dot for what is new since the author last looked (kept in
// this browser, for this viewer only); the Builder's badges; and the
// author's test round, saved on the chain, as the hole's first record to
// beat and its ghost. A player is an address with a round saved on the hole
// (its best in either mode): never the author, never a copy of another's
// round (the realm keeps those apart), so a badge costs real rounds by
// other addresses.
import type { Chain } from "../chain";
import { skyOf } from "../sky";
import { listHoles } from "./holes";
import type { Proof } from "./proof";
import { required } from "./rules";
import type { HoleRow, Saved } from "../types";

/** What savedOn read: the rounds, and the holes with more than one read takes. */
export interface SavedOn {
  rows: readonly Saved[];
  more: ReadonlySet<string>;
}
/** How many rounds savedOn reads a hole and mode, at most: a hole with more has at least that many players. */
export const SAVED_PAGE = 100;

/** How many holes one savedOn read takes (chain.ts MAX_SAVED_HOLES). */
const SAVED_HOLES = 12;

/** An author's published holes (holesOf's, none taken down) and the rounds saved on them, a read a dozen holes. */
export async function readRewards(chain: Pick<Chain, "holesOf" | "savedOn">, author: string, taken: ReadonlySet<string>): Promise<{ rows: HoleRow[]; saved: SavedOn }> {
  const rows = listHoles(await chain.holesOf(author), author, taken).mine, ids = rows.map((h) => h.id), reads = [];
  for (let i = 0; i < ids.length; i += SAVED_HOLES) reads.push(chain.savedOn(ids.slice(i, i + SAVED_HOLES)));
  const parts = await Promise.all(reads);
  return { rows, saved: { rows: parts.flatMap((p) => p.rows), more: new Set(parts.flatMap((p) => [...p.more])) } };
}

/** A published hole's numbers: its players (more: past what one read takes), plays, best, the author's own best (0: none saved) and the players who beat it. */
export interface HoleStats {
  players: number;
  more: boolean;
  plays: number;
  best: number;
  mine: number;
  beat: number;
}

/** Each player's best on a hole, either mode. */
function bestsOn(id: string, saved: SavedOn): Map<string, number> {
  const best = new Map<string, number>();
  for (const r of saved.rows) if (r.id === id) best.set(r.player, Math.min(r.strokes, best.get(r.player) ?? Infinity));
  return best;
}

/** A hole's numbers from its row (its plays, every round started on it) and the rounds saved on it. */
export function statsOf(row: Pick<HoleRow, "id" | "plays">, saved: SavedOn, author: string): HoleStats {
  const best = bestsOn(row.id, saved), mine = best.get(author) ?? 0;
  best.delete(author);
  const theirs = [...best.values()], all = mine ? [mine, ...theirs] : theirs;
  return {
    players: theirs.length, more: saved.more.has(row.id), plays: row.plays, best: all.length ? Math.min(...all) : 0,
    mine, beat: mine ? theirs.filter((s) => s < mine).length : 0,
  };
}

const n = (k: number, w: string) => `${k} ${w}${k === 1 ? "" : "s"}`;

/** A hole's players and plays in words: "3 players · 12 plays". */
export function statsLine(s: HoleStats): string {
  if (!s.players) return s.plays ? `${n(s.plays, "play")} · no round saved yet` : "Nobody has played it yet";
  return `${s.players}${s.more ? "+" : ""} ${s.players === 1 && !s.more ? "player" : "players"} · ${n(s.plays, "play")}`;
}

/** Its best against the author's: "Best 2 · yours 4 · 2 players beat you"; "" with no round saved. */
export function versusLine(s: HoleStats): string {
  if (!s.best) return "";
  if (!s.mine) return `Best ${s.best} · none of yours saved`;
  return `Best ${s.best} · yours ${s.mine} · ${s.beat ? `${n(s.beat, "player")} beat you` : "nobody beat you yet"}`;
}

/** The weathers a hole asks (proof.ts required) that rounds saved by other players hole it in, in that order. */
export function heldWeathers(row: Pick<HoleRow, "id" | "world">, saved: readonly Saved[], author: string): string[] {
  const kinds = new Set<string>(saved.filter((r) => r.id === row.id && r.player !== author).map((r) => skyOf(r.id, row.world, r.period)));
  return required(row.world).filter((k) => kinds.has(k));
}

/** What the Builder's badges are earned by: holes published, distinct players over them all, one holed in every weather. */
export interface BuilderFacts {
  published: number;
  players: number;
  weathers: boolean;
}

/** The facts of an author's published holes (their rows) from the rounds saved on them. */
export function factsOf(rows: readonly Pick<HoleRow, "id" | "world">[], saved: SavedOn, author: string): BuilderFacts {
  const players = new Set(saved.rows.filter((r) => r.player !== author && rows.some((h) => h.id === r.id)).map((r) => r.player));
  const most = rows.some((h) => saved.more.has(h.id)) ? SAVED_PAGE : 0;
  return {
    published: rows.length,
    players: Math.max(players.size, most),
    weathers: rows.some((h) => heldWeathers(h, saved.rows, author).length === required(h.world).length),
  };
}

/** A Builder badge: its name, its medal's picture (Badges.tsx GLYPH), what earns it. */
export interface BuilderBadge {
  id: string;
  name: string;
  glyph: string;
  need: string;
  ok: (f: BuilderFacts) => boolean;
}
export const BUILDER_BADGES: readonly BuilderBadge[] = [
  { id: "published", name: "First hole published", glyph: "published", need: "Publish a hole on gno.land", ok: (f) => f.published > 0 },
  { id: "players1", name: "First player", glyph: "player", need: "A player saves a round on one of your holes", ok: (f) => f.players >= 1 },
  { id: "players10", name: "10 players", glyph: "players", need: "10 players save a round on your holes", ok: (f) => f.players >= 10 },
  { id: "players50", name: "50 players", glyph: "players", need: "50 players save a round on your holes", ok: (f) => f.players >= 50 },
  { id: "weathers", name: "Holed in every weather", glyph: "weathers", need: "Players hole one of your holes in each of its weathers, on the chain", ok: (f) => f.weathers },
];
/** The badges these facts earn, in the list's order. */
export const earnedBadges = (f: BuilderFacts) => BUILDER_BADGES.filter((b) => b.ok(f)).map((b) => b.id);

/** Where the author's last look at their holes is kept: a hole's id, its plays and players then. */
export const SEEN_KEY = "gnogolf.builder.seen";
export type Seen = Readonly<Record<string, { plays: number; players: number }>>;

const isCount = (x: unknown) => Number.isSafeInteger(x) && (x as number) >= 0;
/** The author's last look, as this browser keeps it; nothing if it keeps nothing, or not that. */
export function loadSeen(): Seen {
  try {
    const j: unknown = JSON.parse(localStorage.getItem(SEEN_KEY) || "{}");
    if (!j || typeof j !== "object" || Array.isArray(j)) return {};
    const all = Object.values(j as Record<string, unknown>).every((v) => !!v && typeof v === "object" && isCount((v as Seen[string]).plays) && isCount((v as Seen[string]).players));
    return all ? (j as Seen) : {};
  } catch {
    return {};
  }
}
/** Keeps this look (the holes listed now: one gone is forgotten); a browser that keeps nothing keeps nothing. */
export function keepSeen(now: Seen): void {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(now));
  } catch {}
}
/** Whether a hole has new plays or players since the last look (never looked at: any play is new). */
export const isFresh = (id: string, s: { plays: number; players: number }, seen: Seen) =>
  s.plays > (seen[id]?.plays ?? 0) || s.players > (seen[id]?.players ?? 0);

/** The author's test rounds of a published version, one a weather: the fewest strokes. */
export function testRounds(proofs: readonly Proof[], id: string): Proof[] {
  const best = new Map<string, Proof>();
  for (const p of proofs) if (p.id === id && (!best.has(p.kind) || p.strokes < best.get(p.kind)!.strokes)) best.set(p.kind, p);
  return [...best.values()];
}

/**
 * The test round a save can carry now: one played in the weather of the
 * moment's period, or of the one just gone (the realm takes either), and
 * that period; null if neither's weather is one a test round was played in.
 * (Same kind is not yet the same weather, but for clear: a replay says.)
 */
export function roundNow(proofs: readonly Proof[], id: string, world: string, now: number): { proof: Proof; period: number } | null {
  const rounds = testRounds(proofs, id);
  for (const period of [now, now - 1]) {
    const proof = rounds.find((p) => p.kind === skyOf(id, world, period));
    if (proof) return { proof, period };
  }
  return null;
}

/** A day of periods: how far nextRound looks. */
const DAY = (24 * 60) / 5;
/** The next period after now in a weather a test round was played in, within a day; null if none. */
export function nextRound(proofs: readonly Proof[], id: string, world: string, now: number): number | null {
  const kinds = new Set(testRounds(proofs, id).map((p) => p.kind));
  for (let p = now + 1; kinds.size && p <= now + DAY; p++) if (kinds.has(skyOf(id, world, p))) return p;
  return null;
}
