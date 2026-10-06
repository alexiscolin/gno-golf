"use client";

// The shop's small pieces, one of each (the GUI spec's "Shared pieces"): a
// tier's chip, a gnome's tile, his card in a grid, the closing date. On the
// game's own tokens (app/gnomes.css).
import type { ReactNode } from "react";
import { TIER_LOOK, type Listed } from "@/lib/gnomes/catalogue";
import { utcDate, localDate } from "@/lib/gnomes/shop";
import type { Tier } from "@/lib/gnomes/vocab";

// a tier's shape, read in grey too: a disc, a diamond, a gem, a crown; a leaf for an earned one
const SHAPE: Record<string, ReactNode> = {
  common: <circle cx="8" cy="8" r="5" />,
  rare: <path d="M8 2 14 8 8 14 2 8z" />,
  epic: <path d="M4 3h8l3 4-7 7-7-7z" />,
  legendary: <path d="M2 12 3 5l3 3 2-5 2 5 3-3 1 7z" />,
  earned: <path d="M3 13C3 7 7 3 13 3c0 6-4 10-10 10z" />,
};
export const tierName = (t: string) => (TIER_LOOK[t as Tier] || { label: t }).label;

/** A tier's chip: its shape and its name, on its colour. */
export const TierChip = ({ tier }: { tier: string }) => (
  <span className={`tier tier--${tier}`}>
    <svg viewBox="0 0 16 16" aria-hidden="true">{SHAPE[tier] || SHAPE.common}</svg>
    {tierName(tier)}
  </span>
);

/** Where a gnome's picture is served (scripts/gnomeassets.mjs): his thumbnail. */
export const thumb = (id: number) => `/gnomes/${id}.webp`;

/** A gnome's tile: his thumbnail on his tier's stage, in his tier's rim (never: the sale closed before he found a player). */
export const Tile = ({ id, tier, never = false, lazy = true }: { id: number; tier: string; never?: boolean; lazy?: boolean }) => (
  <span className={`gtile gtile--${tier}${never ? " gtile--never" : ""}`}>
    <img src={thumb(id)} alt="" width={256} height={256} loading={lazy ? "lazy" : "eager"} decoding="async" />
  </span>
);

/** A gnome in the grid: his tile, name and number, his tier and one fact; a button that opens his sheet. */
export function GnomeCard({ g, fact, mine, never, onOpen }: { g: Listed; fact: string; mine: boolean; never: boolean; onOpen: () => void }) {
  return (
    <button type="button" className={`gcard${mine ? " gcard--mine" : ""}${never ? " gcard--never" : ""}`} onClick={onOpen}
      aria-label={`${g.name}, number ${g.id}, ${tierName(g.tier)}: ${fact}`}>
      <Tile id={g.id} tier={g.tier} never={never} />
      <span className="gcard__name">{g.name}<small>#{g.id}</small></span>
      <span className="gcard__foot"><TierChip tier={g.tier} /><span className="gcard__fact">{fact}</span></span>
    </button>
  );
}
/** A card's place while the grid is read: the same size, blank. */
export const BlankCard = () => (
  <span className="gcard gcard--skel" aria-hidden="true"><span className="gtile" /><span className="gcard__name">&nbsp;</span><span className="gcard__foot" /></span>
);

/** The closing date: a date in UTC (the player's own time on hover and for a screen reader), never a countdown. */
export function Closes({ at, now }: { at: number; now: number }) {
  return (
    <p className="closes" title={localDate(at)}>
      <span>Sale closes for good on <b aria-label={`${utcDate(at, now)}, ${localDate(at)} your time`}>{utcDate(at, now)}</b>. Unsold gnomes are never made.</span>
    </p>
  );
}
