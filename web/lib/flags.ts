// The bot check's list (the bot check writes it, docs/leaderboards.md; the site serves it at
// /flags.json) as the boards read it: only what it should hold, from the chain the
// game plays on.
import { isAddress } from "./chain";
import { PLAYS_LIKE_A_PROGRAM } from "./botproof";

/** What the check says of one player: a score (0..1, hidden from HIDE_AT) and why, in plain words. */
export interface Flag { score: number; said: string[]; proof?: boolean }
export type Flags = Readonly<Record<string, Flag>>;
export const HIDE_AT = 0.5;
/** The bot check runs every 12 hours: a list a day and a half old says it stopped (two runs missed). */
export const STALE_HOURS = 36;
// what a list may hold before it is not read at all (a few hundred hidden players: some 30 kB)
const MAX_BYTES = 1 << 20, MAX_SAID = 3, MAX_WORDS = 120;

/** The list, read: the flags (hidden or not), and whether it is stale (its hours, NaN unknown);
 *  no flags if it is too big, not JSON, or another chain's. */
export function readFlags(text: string, chainId: string, now = Date.now()) {
  const none = { flags: {} as Flags, hours: NaN };
  if (text.length > MAX_BYTES) return none;
  let j: unknown;
  try { j = JSON.parse(text); } catch { return none; }
  if (!j || typeof j !== "object") return none;
  const { flags, updated, chain } = j as Record<string, unknown>;
  const hours = typeof updated === "string" && updated ? (now - Date.parse(updated)) / 3.6e6 : NaN;
  if (typeof chain === "string" && chain && chain !== chainId) return { ...none, hours };
  const out: Record<string, Flag> = {};
  if (flags && typeof flags === "object")
    for (const [p, f] of Object.entries(flags as Record<string, unknown>)) {
      if (!isAddress(p) || !f || typeof f !== "object") continue;
      const { score, said, proof } = f as Record<string, unknown>;
      if (typeof score !== "number" || !(score >= 0 && score <= 1)) continue;
      const words = Array.isArray(said) ? said.filter((x): x is string => typeof x === "string").slice(0, MAX_SAID).map((x) => x.slice(0, MAX_WORDS)) : [];
      out[p] = { score, said: words, ...(proof === true ? { proof } : {}) };
    }
  return { flags: out as Flags, hours };
}

/** Whether a list is too old, or says nothing of its age: its run stopped, or never ran. */
export const stale = (hours: number) => !(hours <= STALE_HOURS);

export const hidden = (f: Flag | false | undefined): f is Flag => !!f && f.score >= HIDE_AT;
/** Why a player is hidden, in plain words. */
export const whyHidden = (f: Flag) => f.said.join("; ") || PLAYS_LIKE_A_PROGRAM;

/** Rows with the hidden ones taken out unless all are shown; the count taken out. */
export function screen<R extends { player: string }>(rows: readonly R[], flags: Flags, all: boolean) {
  const out = all ? rows : rows.filter((r) => !hidden(flags[r.player]));
  return { rows: out, hidden: rows.length - out.length };
}
