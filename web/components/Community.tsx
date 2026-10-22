"use client";

// The community's holes, on a screen of their own (the band under the cups opens it; the game-design review's #9):
// the hole of the day and the most played up top, then every hole, searched by name or maker, one world's or all.
// Anyone's holes, playable outside the cups, in no cup and on no ranking.
// Each is a card: its map from above (HoleMap's SVG, no WebGL), name, author,
// world, par and players (addresses with a round saved on it, never its
// author), in the order asked: newest (the chain's order), most played, or
// hardest (the Builder's meter, worked out in this browser, in its worker,
// for the page shown only, each version once). A hole of the day above them,
// the same for everyone all day (lib/community.ts dayRows and dayHole: the
// realm's DayCandidates from the UTC day's point in alias order, those
// published before the day began, no server). On a computer, "Remix" opens a hole in the Builder as a new draft,
// its maker credited (the Builder never loads on a phone). Every hole listed,
// the day's too, is first judged by the Builder's own rules (listVerdict), and
// none the site took down is ever in the list (communityOf), and none whose
// author holds no best on it (listVerdict: the chain's word that it holes).
import { useEffect, useMemo, useRef, useState } from "react";
import type { DayRow, HoleRow } from "@/lib/types";
import { sound } from "@/lib/feel";
import { Button, Segmented } from "@/components/ui";
import { authorFirst, authorMark, chainQuery, plural } from "@/components/common";
import { HoleMap, NoMap, useHoleMaps } from "@/components/HoleMap";
import { authorOf, holeByline, remixLink } from "@/lib/builder/holes";
import { LEVELS, type Level } from "@/lib/builder/levels";
import type { Meter } from "@/lib/builder/meter";
import { savedOnMore, statsOf, type SavedRead } from "@/lib/builder/rewards";
import { builderOn, onComputer } from "@/lib/builder/route";
import { inTurn, type MapHole } from "@/lib/duel";
import { undeclared, type Chain } from "@/lib/chain";
import { aliasOf, authorHoled, BESTS_AT_ONCE, shownOnly, bornBefore, dayHole, dayRows, dayStart, heldBefore, heldFor, keepDay, keepLevel, keptDay, keptLevel, pageOf, sortHoles, verdictOf, type Helds, type SortBy, type Verdict, type Verdicts } from "@/lib/community";
import { takedownOf, takenDown } from "@/lib/takedown";
import { cap } from "@/lib/builder/rules";
import { CUPS } from "@/lib/card";

/** How many community holes a page judges and lists, one more page on each "Show more". */
const PAGE = 24;
const SORTS: readonly (readonly [SortBy, string])[] = [["new", "Newest"], ["played", "Most played"], ["hard", "Hardest"]];
/** How many community holes are judged at once (their data read side by side). */
const JUDGE_AT_ONCE = 4;

/** The worlds a filter offers: every one a community hole is in, in the cups' order, "all" first. */
const worldsOf = (holes: readonly HoleRow[]) => ["all", ...CUPS.filter((w) => holes.some((h) => h.world === w))];
/** A hole a search finds: the words typed in its name, its slot or its author's address. */
const found = (h: HoleRow, q: string) => !q || [h.name, h.slot, authorOf(h.id)].some((t) => !!t && t.toLowerCase().includes(q));
/** How many holes the trending row shows (the most played of those open), and how many of the most played are judged for it. */
const TRENDING = 3, TREND_JUDGED = 8;

export default function Community({ community, chain, me = null, onPlay, page: own = false }: {
  community: readonly HoleRow[];
  chain: Pick<Chain, "bests" | "blockTime" | "dayCandidates" | "ghost" | "holeData" | "chainId" | "genesis" | "realm" | "state" | "savedOn"> | null;
  /** the player's address, if known: their own holes listed before they hold a best on them */
  me?: string | null;
  onPlay: (id: string) => void;
  /** on a screen of their own (its title the screen's): no heading of the section's */
  page?: boolean;
}) {
  const [by, setBy] = useState<SortBy>("new");
  // one world's holes, or every one (offered once there are holes in two worlds)
  const [world, setWorld] = useState("all");
  const worlds = useMemo(() => worldsOf(community), [community]);
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const inWorld = useMemo(() => community.filter((h) => (world === "all" || h.world === world) && found(h, q)), [community, world, q]);
  // the most played of all, whatever the filters: the trending row's candidates, judged with the page
  const played = useMemo(() => sortHoles(community, "played", new Map()).filter((h) => h.plays > 0).slice(0, TREND_JUDGED), [community]);
  const [shown, setShown] = useState(PAGE);
  // the visit's UTC day: its hole changes at midnight UTC, not under the player
  const [now] = useState(() => Date.now());
  // most played: the whole list ordered first, then paged; hardest: the page as shown, once each of it is measured
  const ordered = useMemo(() => (by === "played" ? sortHoles(inWorld, "played", new Map()) : inWorld), [inWorld, by]);
  // each hole about to be shown judged by the Builder's own rules (lib/community.ts: anyone can publish
  // past the Builder with gnokey), a few at a time, once a version a browser, and whether it is open to the
  // player (heldFor: its author holds a best on it, or it is theirs): only those both pass are listed; the
  // day's first. One whose data, the rules or its best could not be read now (null): not shown, never skipped
  // for the day's, asked again on Try again
  const [verdicts, setVerdicts] = useState<Verdicts>(new Map());
  const [opens, setOpens] = useState<Helds>(new Map());
  const [tries, setTries] = useState(0);
  const [turn] = useState(() => inTurn(JUDGE_AT_ONCE));
  const asked = useRef(new Map<string, Promise<Verdict | null>>()); // (the judgings under way)
  const judge = (c: NonNullable<typeof chain>, h: Pick<HoleRow, "id">): Promise<Verdict | null> => {
    if (verdicts.has(h.id)) return Promise.resolve(verdicts.get(h.id) ?? null);
    let p = asked.current.get(h.id);
    if (!p) {
      p = turn(() => verdictOf(c, h.id).catch(() => null)).then((v) => (asked.current.delete(h.id), setVerdicts((m) => new Map(m).set(h.id, v)), v));
      asked.current.set(h.id, p);
    }
    return p;
  };
  useEffect(() => {
    if (!chain) return;
    let live = true;
    for (const h of [...ordered.slice(0, shown), ...played]) {
      void judge(chain, h);
      if (!opens.has(h.id)) void heldFor(chain, h.id, me).catch(() => null).then((b) => live && setOpens((m) => new Map(m).set(h.id, b)));
    }
    return () => void (live = false);
  }, [chain, ordered, played, shown, tries, me]); // eslint-disable-line react-hooks/exhaustive-deps -- (verdicts, opens: asked once each, not again as they fill)
  // the hole of the day (lib/community.ts dayHole, its rules there alone): asked what it waits on, that read, asked
  // again, until it has its pick (or is not read now): the realm's candidates from the day's point a page at a time
  // (dayRows), the next page's authors' bests asked ahead (BESTS_AT_ONCE at a time, decided in order). None searched
  // if this browser kept the day's pick already (and not taken down since): a best bettered today reads as today's,
  // so a fresh read could pick another; a realm change would make it the same in every browser
  const [kept, setKept] = useState<DayRow | null | undefined>(undefined);
  const [today, setToday] = useState<{ day: DayRow | null; unread: boolean }>({ day: null, unread: false });
  const [dayDown, setDayDown] = useState(false);
  useEffect(() => {
    if (!chain) return;
    let live = true;
    setToday({ day: null, unread: false });
    setDayDown(false);
    void (async () => {
      const [taken, day] = await Promise.all([takedownOf(chain), keptDay(chain, now)]);
      if (!live) return;
      const known = day && !takenDown(taken, day.id) ? day : null;
      setKept(known);
      if (known) return;
      const list: DayRow[] = [], born = new Map<string, boolean | null>(), held = new Map<string, boolean | null>(), rules = new Map<string, Verdict | null>();
      const ahead = new Map<string, Promise<boolean | null>>(), aheadTurn = inTurn(BESTS_AT_ONCE), start = dayStart(now);
      const pages = dayRows(chain, now, taken);
      for (;;) {
        const r = dayHole(list, born, rules, held);
        if (r.day || r.unread || !r.need) {
          // (none needed and none found: the next page, if any; a cap reached (done): none today, no page more read)
          if (r.day || r.unread || r.done) return live && setToday({ day: r.day, unread: r.unread });
          const next = await pages.next();
          if (!live) return;
          if (next.done) return setToday({ day: null, unread: false });
          list.push(...next.value);
          for (const h of next.value) ahead.set(h.id, aheadTurn(() => heldBefore(chain, h.id, start).catch(() => null)));
          continue;
        }
        const { what, h } = r.need;
        if (what === "born") born.set(aliasOf(h), await bornBefore(chain, h as DayRow, start).catch(() => null));
        else if (what === "held") held.set(h.id, await (ahead.get(h.id) ?? heldBefore(chain, h.id, start).catch(() => null)));
        else rules.set(h.id, await judge(chain, h));
        if (!live) return;
      }
    })().catch((e: unknown) => live && !undeclared(e, "DayCandidates") && setDayDown(true)); // (a realm without it: no hole of the day, nothing amiss)
    return () => void (live = false);
  }, [chain, tries]); // eslint-disable-line react-hooks/exhaustive-deps -- (judge: its cache, not a reason to search again)
  // Try again: the holes not read asked anew
  const retry = () => {
    const known = <T,>(m: ReadonlyMap<string, T | null>) => new Map([...m].filter(([, v]) => v !== null));
    setVerdicts(known);
    setOpens(known);
    setTries((n) => n + 1);
  };
  const page = pageOf(ordered, shown, verdicts, opens);
  const ids = page.rows.map((h) => h.id).join(" ");
  // whether each hole listed has been holed by its author (its best on the chain, authorHoled: kept once it has), read
  // once a hole; the list put in that order once the page's answers are in (one move, not one per answer)
  const [holed, setHoled] = useState<ReadonlyMap<string, boolean>>(new Map());
  useEffect(() => {
    if (!chain || page.judging) return;
    let live = true;
    for (const h of page.rows) if (authorOf(h.id) && !holed.has(h.id)) void authorHoled(chain, h.id).then((yes) => live && setHoled((m) => new Map(m).set(h.id, yes)), () => {});
    return () => void (live = false);
  }, [chain, page.judging, ids]); // eslint-disable-line react-hooks/exhaustive-deps -- (holed: read once each, not again as it fills)
  // the players of the page's holes and the day's (one read a dozen holes), once the page is judged, each hole read once
  const [saved, setSaved] = useState<SavedRead | null>(null);
  // the day's hole: this browser's for the day, else the one dayHole picked (kept for the day once found)
  const day = kept ?? (kept === null ? today.day : null), unread = page.unread || (!kept && today.unread) || dayDown;
  useEffect(() => {
    if (chain && kept === null && today.day) void keepDay(chain, now, today.day);
  }, [chain, kept, today.day?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- (now: the visit's; today.day: by its id)
  const seen = [...(day ? [day.id] : []), ...page.rows.map((h) => h.id)];
  useEffect(() => {
    if (!chain || page.judging || !seen.length) return;
    let live = true;
    void savedOnMore(chain, saved, seen).then((s) => live && setSaved(s), () => {});
    return () => void (live = false);
  }, [chain, page.judging, seen.join(" ")]); // eslint-disable-line react-hooks/exhaustive-deps -- (seen: its ids, not the array; saved: read once each, not again as it fills)
  // the levels measured once the page is judged (not one meter run per verdict as it fills)
  const levels = useLevels(chain, by === "hard" && !page.judging ? page.rows : []);
  const rating = by === "hard" && page.rows.some((h) => !levels.has(h.id));
  const settled = !page.judging && page.rows.every((h) => holed.has(h.id) || !authorOf(h.id));
  const listed = by === "hard" ? (rating ? page.rows : sortHoles(page.rows, "hard", levels)) : by === "new" && settled ? authorFirst(page.rows, holed) : page.rows;
  const maps = useHoleMaps(chain, seen);
  // the Builder opens only on a computer (lib/builder/route.ts): no Remix on a phone
  const [remix, setRemix] = useState(false);
  useEffect(() => setRemix(builderOn() && onComputer((q) => window.matchMedia(q).matches)), []);
  const card = (h: HoleRow, big = false) => (
    <HoleCard h={h} big={big} map={maps.get(h.id)} players={saved && statsOf(h, saved.saved, authorOf(h.id) ?? "")} mark={authorMark(holed.get(h.id))}
      level={by === "hard" ? levels.get(h.id) : undefined} remix={remix} onPlay={() => (sound("select"), onPlay(h.id))} />
  );
  // trending: the most played holes open to the player, none the day's
  const trending = shownOnly(played, verdicts, opens).filter((h) => h.id !== day?.id).slice(0, TRENDING);
  return (
    <section className="community" aria-label="Community holes">
      {(day || trending.length > 0) && (
        <div className="community__featured">
          {day && (
            <div className="community__day">
              <span className="eyebrow">Hole of the day</span>
              {card(day, true)}
            </div>
          )}
          {trending.length > 0 && (
            <div className="community__trending">
              <span className="eyebrow">Most played</span>
              <ul className="community__cards">{trending.map((h) => <li key={h.id}>{card(h)}</li>)}</ul>
            </div>
          )}
        </div>
      )}
      <div className="community__head">
        {!own ? <h3 className="h-section">Community holes <small>not ranked</small></h3> : <h3 className="h-section">Every hole</h3>}
        <Segmented options={SORTS} value={by} onChange={(v) => (sound("blip"), setBy(v))} label="Order the community holes" className="community__sort" />
      </div>
      <div className="community__filters">
        <label className="csearch" role="search">
          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
          <input type="search" placeholder="A hole's name or its maker's address" aria-label="Find a community hole by its name or its maker" value={query}
            onChange={(e) => (setQuery(e.target.value), setShown(PAGE))} spellCheck={false} autoCapitalize="off" autoComplete="off" />
        </label>
        {worlds.length > 2 && (
          <Segmented options={worlds.map((w) => [w, w === "all" ? "Every world" : cap(w)] as const)} value={world} onChange={(v) => (sound("blip"), setWorld(v), setShown(PAGE))}
            label="The community holes of one world" className="community__worlds" />
        )}
      </div>
      <ul className="community__cards">
        {listed.map((h) => <li key={h.id}>{card(h)}</li>)}
      </ul>
      {!page.judging && !rating && !unread && !listed.length && (
        <p className="community__none">{q || world !== "all" ? "No hole here: try other words or another world." : "No hole open here yet: a community hole shows once its maker has holed it, saved on-chain."}</p>
      )}
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
        <small>{holeByline({ author, world: h.world, par: h.par })}</small>
        <small>
          {players ? `${players.players}${players.more ? "+" : ""} ${plural("player", players.more ? 2 : players.players)}` : "…"}
          {level != null && ` · ${LEVELS[level]}`}
          {level === null && " · not measured"}
        </small>
        {mark && <small className="community__mark">{mark}</small>}
      </span>
      <span className="ccard__acts">
        <Button size="s" onClick={onPlay}>Play</Button>
        {remix && <a className="linkish" href={remixLink(h.id, String(chainQuery()))}>Remix</a>}
      </span>
    </article>
  );
}

/** The meter's level of each of these holes (null: not measured), each version measured once a browser (keptLevel), one after the other in the meter's worker, loaded only once one is asked and kept till the list goes. */
function useLevels(chain: Pick<Chain, "holeData" | "chainId" | "genesis" | "realm"> | null, rows: readonly HoleRow[]) {
  const [levels, setLevels] = useState<ReadonlyMap<string, Level | null>>(new Map());
  const meter = useRef<Meter | null>(null);
  useEffect(() => () => (meter.current?.stop(), void (meter.current = null)), []);
  const ids = rows.map((h) => h.id).join(" ");
  useEffect(() => {
    if (!chain || !ids) return;
    let live = true;
    void (async () => {
      for (const id of ids.split(" ")) {
        if (!live) return;
        if (levels.has(id)) continue;
        let level = await keptLevel(chain, id);
        if (level == null) {
          const { makeMeter } = await import("@/lib/builder/meter");
          const m = (meter.current ??= makeMeter(() => {}));
          level = await chain.holeData(id).then((hex) => m.rate(hex), () => null);
          if (level != null) void keepLevel(chain, id, level);
        }
        // (a level measured is kept and shown, even if the rows changed meanwhile)
        setLevels((m) => new Map(m).set(id, level));
      }
    })();
    return () => void (live = false);
  }, [chain, ids]); // eslint-disable-line react-hooks/exhaustive-deps -- (levels: measured once each, not again as they fill)
  return levels;
}
