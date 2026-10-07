"use client";

// The community's holes on the cups screen (the game-design review's #9):
// anyone's holes, playable outside the cups, in no cup and on no ranking.
// Each is a card: its map from above (HoleMap's SVG, no WebGL), name, author,
// world, par and players (addresses with a round saved on it, never its
// author), in the order asked: newest (the chain's order), most played, or
// hardest (the Builder's meter, worked out in this browser, in its worker,
// for the page shown only, each version once). A hole of the day above them,
// the same for everyone (lib/community.ts dayOrder: the UTC day's hash, no
// server). On a computer, "Remix" opens a hole in the Builder as a new draft,
// its maker credited (the Builder never loads on a phone). Every hole listed,
// the day's too, is first judged by the Builder's own rules (verdictOf), and
// none the site took down is ever in the list (communityOf).
import { useEffect, useMemo, useState } from "react";
import type { HoleRow } from "@/lib/types";
import { sound } from "@/lib/feel";
import { Button, Segmented } from "@/components/ui";
import { authorFirst, authorMark, chainQuery, plural } from "@/components/common";
import { HoleMap, NoMap, useHoleMaps } from "@/components/HoleMap";
import { authorOf, remixLink } from "@/lib/builder/holes";
import { LEVELS, type Level } from "@/lib/builder/levels";
import type { Meter } from "@/lib/builder/meter";
import { savedOnAll, statsOf, type SavedOn } from "@/lib/builder/rewards";
import { builderOn, onComputer } from "@/lib/builder/route";
import { worldName } from "@/lib/builder/rules";
import type { MapHole } from "@/lib/duel";
import { shortAddr, type Chain } from "@/lib/chain";
import { dayOrder, keepLevel, keptLevel, pageOf, sortHoles, verdictOf, type SortBy, type Verdicts } from "@/lib/community";

/** How many community holes a page judges and lists, one more page on each "Show more". */
const PAGE = 24;
const SORTS: readonly (readonly [SortBy, string])[] = [["new", "Newest"], ["played", "Most played"], ["hard", "Hardest"]];
/** How many holes the day's pick tries, at most, for one the Builder's rules pass. */
const DAY_TRIES = 8;

export default function Community({ community, chain, onPlay }: {
  community: readonly HoleRow[];
  chain: Pick<Chain, "bests" | "holeData" | "state" | "savedOn"> | null;
  onPlay: (id: string) => void;
}) {
  const [by, setBy] = useState<SortBy>("new");
  const [shown, setShown] = useState(PAGE);
  // the day's candidates, once a visit (they change at midnight UTC, not under the player)
  const candidates = useMemo(() => dayOrder(community, Date.now()).slice(0, DAY_TRIES), [community]);
  // most played: the whole list ordered first, then paged; hardest: the page as shown, once each of it is measured
  const ordered = useMemo(() => (by === "played" ? sortHoles(community, "played", new Map()) : community), [community, by]);
  // each hole about to be shown judged by the Builder's own rules (lib/community.ts: anyone can publish
  // past the Builder with gnokey), one after the other, once a version a browser: only those it passes are
  // listed; the day's first. One whose data or the rules could not be read now has no verdict (null): not
  // shown, never skipped for the day's, asked again on Try again
  const [verdicts, setVerdicts] = useState<Verdicts>(new Map());
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!chain) return;
    let live = true;
    void (async () => {
      const judged = new Map(verdicts);
      const judge = async (h: HoleRow) => {
        const v = judged.has(h.id) ? (judged.get(h.id) ?? null) : await verdictOf(chain, h.id).catch(() => null);
        if (live && !judged.has(h.id)) judged.set(h.id, v), setVerdicts((m) => new Map(m).set(h.id, v));
        return v;
      };
      // the day's: its candidates in turn, until one passes (or one is not read: the day waits for it)
      for (const h of candidates) if (!live || (await judge(h))?.ok !== false) break;
      for (const h of ordered.slice(0, shown)) {
        if (!live) return;
        await judge(h);
      }
    })();
    return () => void (live = false);
  }, [chain, ordered, candidates, shown, tries]); // eslint-disable-line react-hooks/exhaustive-deps -- (verdicts: judged once each, not again as they fill)
  // Try again: the holes not read asked anew
  const retry = () => (setVerdicts((m) => new Map([...m].filter(([, v]) => v !== null))), setTries((n) => n + 1));
  const page = pageOf(ordered, shown, verdicts);
  const ids = page.rows.map((h) => h.id).join(" ");
  // whether each hole listed has been holed by its author (its best on the chain), read once a hole;
  // the list put in that order once the page's answers are in (one move, not one per answer)
  const [holed, setHoled] = useState<ReadonlyMap<string, boolean>>(new Map());
  useEffect(() => {
    if (!chain || page.judging) return;
    let live = true;
    for (const h of page.rows) {
      const a = authorOf(h.id);
      if (!a || holed.has(h.id)) continue;
      const best = (mode: string) => chain.bests(h.id, mode, [a]).then((b) => b.rows.length > 0);
      void best("assisted").then((yes) => yes || best("pro")).then((yes) => live && setHoled((m) => new Map(m).set(h.id, yes)), () => {});
    }
    return () => void (live = false);
  }, [chain, page.judging, ids]); // eslint-disable-line react-hooks/exhaustive-deps -- (holed: read once each, not again as it fills)
  // the players of the page's holes and the day's (one read a dozen holes), as the page changes
  const [saved, setSaved] = useState<SavedOn | null>(null);
  // the day's hole: the first candidate the rules pass, once every one before it is judged (and read)
  const first = candidates.findIndex((h) => verdicts.get(h.id)?.ok !== false);
  const day = first >= 0 && verdicts.get(candidates[first].id)?.ok ? candidates[first] : null;
  const unread = page.unread || (first >= 0 && verdicts.get(candidates[first].id) === null);
  const seen = [...(day ? [day.id] : []), ...page.rows.map((h) => h.id)];
  useEffect(() => {
    if (!chain || !seen.length) return;
    let live = true;
    void savedOnAll(chain, seen).then((s) => live && setSaved(s), () => {});
    return () => void (live = false);
  }, [chain, seen.join(" ")]); // eslint-disable-line react-hooks/exhaustive-deps -- (seen: its ids, not the array)
  const levels = useLevels(chain, by === "hard" ? page.rows : []);
  const rating = by === "hard" && page.rows.some((h) => !levels.has(h.id));
  const settled = !page.judging && page.rows.every((h) => holed.has(h.id) || !authorOf(h.id));
  const listed = by === "hard" ? (rating ? page.rows : sortHoles(page.rows, "hard", levels)) : by === "new" && settled ? authorFirst(page.rows, holed) : page.rows;
  const maps = useHoleMaps(chain, seen);
  // the Builder opens only on a computer (lib/builder/route.ts): no Remix on a phone
  const [remix, setRemix] = useState(false);
  useEffect(() => setRemix(builderOn() && onComputer((q) => window.matchMedia(q).matches)), []);
  const card = (h: HoleRow, big = false) => (
    <HoleCard h={h} big={big} map={maps.get(h.id)} players={saved && statsOf(h, saved, authorOf(h.id) ?? "")} mark={authorMark(holed.get(h.id))}
      level={by === "hard" ? levels.get(h.id) : undefined} remix={remix} onPlay={() => (sound("select"), onPlay(h.id))} />
  );
  return (
    <section className="community" aria-label="Community holes">
      <div className="community__head">
        <h3>Community holes <small>not ranked</small></h3>
        <Segmented options={SORTS} value={by} onChange={(v) => (sound("blip"), setBy(v))} label="Order the community holes" className="community__sort" />
      </div>
      {day && (
        <div className="community__day">
          <span className="eyebrow">Hole of the day</span>
          {card(day, true)}
        </div>
      )}
      <ul className="community__cards">
        {listed.map((h) => <li key={h.id}>{card(h)}</li>)}
      </ul>
      {unread && !page.judging && <p className="note note--bad">Some holes did not load. <button className="linkish" onClick={retry}>Try again</button></p>}
      {page.judging ? (
        <p className="community__judging" aria-live="polite">Checking the holes against the Builder rules…</p>
      ) : rating ? (
        <p className="community__judging" aria-live="polite">Working out how hard each hole is…</p>
      ) : page.more > 0 && (
        <button className="linkish" onClick={() => setShown((n) => n + PAGE)}>
          Show more
        </button>
      )}
    </section>
  );
}

/** A community hole's card: its map, name, author, world and par, its players, whether its author holed it, its level when asked; Play, and Remix on a computer. */
function HoleCard({ h, big, map, players, mark, level, remix, onPlay }: {
  h: HoleRow; big: boolean; map: MapHole | undefined; players: { players: number; more: boolean } | null; mark: string; level: Level | null | undefined; remix: boolean; onPlay: () => void;
}) {
  const author = authorOf(h.id) ?? "";
  return (
    <article className={`ccard tint--${h.world}${big ? " ccard--day" : ""}`}>
      <span className="ccard__map">{map ? <HoleMap hole={map} className="ccard__svg" /> : <NoMap className="ccard__svg" />}</span>
      <span className="ccard__text">
        <b>{h.name || h.slot || h.id}</b>
        <small>by {shortAddr(author)} · {worldName(h.world)} · par {h.par}</small>
        <small>
          {players ? `${players.players}${players.more ? "+" : ""} ${plural("player", players.more ? 2 : players.players)}` : "…"}
          {level != null && ` · ${LEVELS[level]}`}
          {level === null && " · not measured"}
        </small>
        {mark && <small className="community__mark">{mark}</small>}
      </span>
      <span className="ccard__acts">
        <Button className="btn--s" onClick={onPlay}>Play</Button>
        {remix && <a className="linkish" href={remixLink(h.id, String(chainQuery()))}>Remix</a>}
      </span>
    </article>
  );
}

/** No worker in this browser: nothing measured. */
const NO_METER: Meter = { ask: () => {}, carry: () => Promise.resolve(null), rate: () => Promise.resolve(null), stop: () => {} };

/** The meter's level of each of these holes (null: not measured), each version measured once a browser (keptLevel), one after the other in the meter's worker, loaded only once one is asked. */
function useLevels(chain: Pick<Chain, "holeData"> | null, rows: readonly HoleRow[]) {
  const [levels, setLevels] = useState<ReadonlyMap<string, Level | null>>(new Map());
  const ids = rows.map((h) => h.id).join(" ");
  useEffect(() => {
    if (!chain || !ids) return;
    let live = true, meter: Meter | null = null;
    void (async () => {
      for (const id of ids.split(" ")) {
        if (!live) return;
        if (levels.has(id)) continue;
        let level = keptLevel(id);
        if (level == null) {
          const m = (meter ??= (await import("@/lib/builder/meter")).makeMeter(() => {}) ?? NO_METER);
          level = await chain.holeData(id).then((hex) => m.rate(hex), () => null);
          if (level != null) keepLevel(id, level);
        }
        if (live) setLevels((m) => new Map(m).set(id, level));
      }
    })();
    return () => {
      live = false;
      meter?.stop();
    };
  }, [chain, ids]); // eslint-disable-line react-hooks/exhaustive-deps -- (levels: measured once each, not again as they fill)
  return levels;
}
