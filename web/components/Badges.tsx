"use client";

import { BADGES, type Badge, type Finish } from "@/lib/card";
import { badgesEarned } from "@/lib/prefs";
import { Sheet } from "@/components/ui";

// The badges: an inked medal each on its ribbon, its colour its family's, its
// glyph drawn in the game's own strokes (24×24, as the title's facts' icons).
const GLYPH: Record<string, string> = {
  first: "M4 17 6 8l4 4 2-6 2 6 4-4 2 9Z",
  perfect: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.8l-5.3 2.6 1.2-6-4.5-4.1 6-.7Z",
  ace: "M10 18V5l7 3-7 3M6 19h12",
  weathers: "M9 5.5a3.5 3.5 0 1 1 0 7M8 19h9a3 3 0 0 0 0-6 4.5 4.5 0 0 0-8.6 1.2A2.5 2.5 0 0 0 8 19Z",
  eagle: "M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6ZM12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5",
  pro: "M12 5a7 7 0 1 1 0 14 7 7 0 0 1 0-14M12 2v5M12 17v5M2 12h5M17 12h5",
  clock: "M12 4a8 8 0 1 1 0 16 8 8 0 0 1 0-16M12 8v4l3 2",
  storm: "M13 3 6 13h5l-2 8 8-11h-5Z",
  snow: "M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9",
  fog: "M4 8h16M6 12h12M4 16h16",
  chain: "M9.5 14.5l5-5M8 11 6 13a3 3 0 0 0 5 5l2-2M16 13l2-2a3 3 0 0 0-5-5l-2 2",
  snail: "M13 17a5 5 0 1 1 5-5c0 2-1.6 3.5-3.5 3.5a2.5 2.5 0 1 1 2.5-2.5M3 19h15l3-3",
  ghost: "M6 20v-8a6 6 0 0 1 12 0v8l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5zM10 11v1M14 11v1",
  sport: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z",
};
// the families, in the sheet's order, as they are said
const FAMILIES: readonly [Badge["family"], string][] = [["skill", "Skill"], ["weather", "Weather"], ["chain", "On-chain"], ["fun", "Just for fun"]];

/** A badge's medal: a paper rim inked round its family's colour, on a red
 *  ribbon; a dashed grey one until it is earned. */
export function Medal({ b, on }: { b: Badge; on: boolean }) {
  return (
    <svg viewBox="0 0 48 54" className={`medal medal--${b.family}` + (on ? "" : " medal--off")} aria-hidden="true">
      <path d="M15 34 11 52l6-3 4 4 3-16M33 34l4 18-6-3-4 4-3-16" className="medal__ribbon" />
      <circle cx="24" cy="24" r="20" className="medal__rim" />
      <circle cx="24" cy="24" r="15" className="medal__face" />
      <path d={GLYPH[b.id]} transform="translate(13.2 13.2) scale(.9)" className="medal__glyph" />
    </svg>
  );
}

/** A hole's badges on the cup card, their medals pressed askew on its score:
 *  the ones earned on it (at), and the one its score alone earns (an ace, two
 *  under, fifteen strokes or more) wherever that was first; fresh: the ones
 *  just earned, pressed on as the card shows. */
export function CardStamps({ at, strokes, par, seed, fresh }: { at: readonly string[]; strokes: number; par: number; seed: number; fresh: readonly string[] }) {
  // (by card.ts's own rules, the first that holds: an ace on a par 3 stamps the ace)
  const own = BADGES.find((b) => (b.id === "ace" || b.id === "eagle" || b.id === "snail") && b.ok!({ strokes, par } as Finish))?.id;
  const list = BADGES.filter((b) => at.includes(b.id) || b.id === own);
  if (!list.length) return null;
  return (
    <span className="stamp" style={{ rotate: `${((seed * 37) % 30) - 15}deg` }}>
      {list.map((b) => (
        <span key={b.id} className={fresh.includes(b.id) ? "earned__fresh" : undefined}>
          <Medal b={b} on />
        </span>
      ))}
    </span>
  );
}

/** The seal on a cup card's score that is on the chain too: the chain's glyph on its green. */
export const ChainSeal = () => (
  <svg viewBox="0 0 24 24" className="seal" aria-label="Saved on-chain" role="img">
    <circle cx="12" cy="12" r="10.5" className="seal__face" />
    <path d={GLYPH.chain} transform="translate(3.6 3.6) scale(.7)" className="medal__glyph" />
  </svg>
);

/** The badges' sheet: how many are earned, then every badge by family, earned
 *  or not, with what earns it; fresh: the ones this round just earned. */
export function Badges({ onClose, fresh = [] }: { onClose: () => void; fresh?: readonly string[] }) {
  const had = badgesEarned();
  return (
    <Sheet className="about" label="Badges" onClose={onClose}>
      <span className="eyebrow">Badges</span>
      <h2>{had.length ? `${had.length} of ${BADGES.length} earned` : "Earn them all"}</h2>
      <span className="bar badges__bar" aria-hidden="true"><span style={{ width: `${Math.round((had.length / BADGES.length) * 100)}%` }} /></span>
      {FAMILIES.map(([family, title]) => (
        <section key={family}>
          <h3 className="about__h">{title}</h3>
          <ul className="badges">
            {BADGES.filter((b) => b.family === family).map((b) => (
              <li key={b.id} className={had.includes(b.id) ? "" : "badges__off"}>
                <Medal b={b} on={had.includes(b.id)} />
                <b>{b.name}</b>
                <span>{b.need}</span>
                {fresh.includes(b.id) && <em className="badges__new">New!</em>}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <p className="real__fine">Kept in this browser, like your cup card.</p>
    </Sheet>
  );
}

/** The badges earned, their medals in a row (the cup's card), the ones just
 *  earned pressed on like a stamp, the whole sheet a tap away. */
export function EarnedBadges({ fresh = [], onOpen }: { fresh?: readonly string[]; onOpen: () => void }) {
  const had = badgesEarned();
  const list = BADGES.filter((b) => had.includes(b.id));
  if (!list.length) return null;
  return (
    <p className="earned">
      {list.map((b) => (
        <span key={b.id} className={fresh.includes(b.id) ? "earned__fresh" : undefined} title={b.name}>
          <Medal b={b} on />
        </span>
      ))}
      <button className="linkish" onClick={onOpen}>{had.length}/{BADGES.length} badges →</button>
    </p>
  );
}

/** The win card's line: the rarest badge just earned, its medal, how many
 *  more, a tap from the sheet. */
export function NewBadges({ ids, onOpen }: { ids: readonly string[]; onOpen: () => void }) {
  const b = BADGES.find((x) => x.id === ids[0]);
  if (!b) return null;
  return (
    <p className="note note--good newbadge">
      <Medal b={b} on />
      <span>
        New badge: <b>{b.name}</b>
        {ids.length > 1 && ` +${ids.length - 1} more`} · <button className="linkish" onClick={onOpen}>See your badges →</button>
      </span>
    </p>
  );
}
