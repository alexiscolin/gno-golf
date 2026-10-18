"use client";

// A player's album (ADR-011), in My gnomes and on a player's gnomes: how
// much of each world, each tier and each archetype's set they hold, a row
// each, opening on its slots (a held gnome's face, a silhouette for each one
// missing). Folded to one line under their team, opened by a tap: the
// player's own says its world, its rank and the next ("Garden 4/104 · Bronze
// — Silver at 8"), another's its head. Status only: nothing to win, nothing
// given. Every figure and word is lib/gnomes/collection.ts's; a tap on a slot
// opens that gnome's sheet.
import "@/app/collection.css";
import { useMemo, useState } from "react";
import { Segmented } from "@/components/ui";
import type { Chain } from "@/lib/chain";
import { ALBUM_WORDS, album, albumSummary, howRanks, rankLine, type Album as AlbumOf, type Progress } from "@/lib/gnomes/collection";
import type { Served } from "@/lib/gnomes/served";
import Collector from "./Rank";
import { thumb } from "./parts";

type Group = "worlds" | "tiers" | "sets";
// an earned gnome's leaf (the tier chip's), and a gnome's outline for one missing
const LEAF = <path d="M3 13C3 7 7 3 13 3c0 6-4 10-10 10z" />;
const SILHOUETTE = <path d="M20 3 11 19h18L20 3Zm0 14a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z" />;

export default function Album({ cat, owned, given = null, chain, player, mine, onOpen }: {
  cat: Served;
  /** what they hold (GnomesOf's rows, every page) */
  owned: readonly { id: string; tier: string; traits?: string }[];
  /** their album worked out already (the shop's own, for the player's badge): not again */
  given?: AlbumOf | null;
  chain: Chain;
  player: string;
  /** the player's own (their next rank said), or another's */
  mine: boolean;
  /** a slot tapped: its gnome's number, or an earned kind */
  onOpen: (open: string) => void;
}) {
  const a = useMemo(() => given ?? album(cat.gnomes, cat.earned, owned), [given, cat, owned]);
  const [group, setGroup] = useState<Group>("worlds");
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const rows: Progress[] = a[group];
  const toggle = (key: string, on: boolean) => setOpen((s) => (on === s.has(key) ? s : new Set(on ? [...s, key] : [...s].filter((k) => k !== key))));
  const head = (
    <div className="galbum__head">
      <h2>{mine ? ALBUM_WORDS.title : ALBUM_WORDS.theirs}</h2>
      <Collector chain={chain} player={player} full />
    </div>
  );
  const body = (
    <>
      {mine && <p className="galbum__rank">{rankLine({ total: owned.length, rows: owned })}</p>}
      <Segmented label="Album by" options={[["worlds", ALBUM_WORDS.worlds], ["tiers", ALBUM_WORDS.tiers], ["sets", ALBUM_WORDS.sets]]} value={group} onChange={setGroup} />
      <ul className="galbum__rows">
        {rows.map((p) => (
          <li key={`${group}:${p.key}`}>
            <details className="galbum__row" open={open.has(`${group}:${p.key}`)} onToggle={(e) => toggle(`${group}:${p.key}`, e.currentTarget.open)}>
              <summary aria-label={`${p.label}: ${p.have} of ${p.of}`}>
                <b>{p.label}</b>
                <span className="galbum__count">{p.have}/{p.of}</span>
                <span className="galbum__track" aria-hidden="true"><i style={{ width: `${p.of ? (100 * p.have) / p.of : 0}%` }} /></span>
              </summary>
              {open.has(`${group}:${p.key}`) && (
                <ul className="galbum__slots">
                  {p.items.map((s) => (
                    <li key={s.key}>
                      <button type="button" className={`galbum__slot galbum__slot--${s.mine ? s.tier : "miss"}`} title={s.mine ? s.name : `${s.name}: ${ALBUM_WORDS.missing.toLowerCase()}`}
                        aria-label={s.mine ? s.name : `${s.name}, ${ALBUM_WORDS.missing.toLowerCase()}`} onClick={() => onOpen(s.unlock ?? String(s.id))}>
                        {!s.mine ? <svg viewBox="0 0 40 40" aria-hidden="true">{SILHOUETTE}</svg>
                          : s.unlock ? <svg viewBox="0 0 16 16" aria-hidden="true">{LEAF}</svg>
                          : <img src={thumb(s.id!)} alt="" width={40} height={40} loading="lazy" decoding="async" />}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </details>
          </li>
        ))}
      </ul>
      {mine && (
        <details className="more">
          <summary>How the ranks work</summary>
          <p>{howRanks()}</p>
        </details>
      )}
    </>
  );
  // folded, their gnomes first: the player's own to its one line, another player's to its head
  return (
    <details className="galbum galbum--fold" aria-label={mine ? ALBUM_WORDS.title : ALBUM_WORDS.theirs}>
      <summary>{mine ? <span className="galbum__line"><b>{ALBUM_WORDS.title}</b> {albumSummary(a, { total: owned.length, rows: owned })}</span> : head}</summary>
      {mine && head}
      {body}
    </details>
  );
}
