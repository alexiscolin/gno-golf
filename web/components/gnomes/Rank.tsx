"use client";

// A player's collector rank, beside their name wherever they appear (ADR-011):
// the boards' rows and cards, a duel's ghost, the rivals, the picker, a
// player's gnomes. Worked out from what they hold (lib/gnomes/collection.ts:
// one page a player, kept for the visit), drawn once known, inline after the
// name and within its line's height: nothing moves when it lands. Nothing to
// press: it shows, it sells nothing. Off with the shop's flag.
import "@/app/collection.css";
import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import type { Chain } from "@/lib/chain";
import { SHOP } from "@/lib/gnomes/shop";
import { collectorsOf, collectorsVersion, onCollectors, rankOf, rankTitle, rankWords, ranksShown, type Rank, type RankId } from "@/lib/gnomes/collection";

// a rank's shape, read in grey too: a disc, a diamond, a star, a crown
const SHAPE: Record<RankId, ReactNode> = {
  bronze: <circle cx="8" cy="8" r="5" />,
  silver: <path d="M8 2 14 8 8 14 2 8z" />,
  gold: <path d="M8 1.8 9.8 6l4.5.4-3.4 3 1 4.4L8 11.5l-3.9 2.3 1-4.4-3.4-3L6.2 6z" />,
  legendary: <path d="M2 12 3 5l3 3 2-5 2 5 3-3 1 7z" />,
};

/** A rank as a badge: its shape on its metal, and its name (said in full, or "Gold" with "Collector" for a reader). */
export function RankBadge({ rank, full = false }: { rank: Rank; full?: boolean }) {
  return (
    <span className={`crank crank--${rank.id}${full ? " crank--full" : ""}`} title={rankTitle(rank)}>
      <svg viewBox="0 0 16 16" aria-hidden="true">{SHAPE[rank.id]}</svg>
      {full ? rankWords(rank) : <span className="crank__word"><span className="crank__sr">Collector </span>{rank.label}</span>}
    </span>
  );
}

/** A player's rank, read (or known already: collectorsOf(chain).know, a player's own gnomes) on this chain; nothing
 *  while unknown, nothing for no rank. */
export default function Collector({ chain, player, full = false }: { chain: Chain | null | undefined; player: string; full?: boolean }) {
  useSyncExternalStore(onCollectors, collectorsVersion, collectorsVersion);
  const from = ranksShown(SHOP) && player && chain ? chain : null;
  useEffect(() => {
    if (from) void collectorsOf(from).holding(player).catch(() => {});
  }, [from, player]);
  const h = from ? collectorsOf(from).peek(player) : undefined;
  const rank = h && rankOf(h);
  return rank ? <RankBadge rank={rank} full={full} /> : null;
}
