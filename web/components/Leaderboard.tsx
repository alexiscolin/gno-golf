"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Snapshot } from "@/lib/engine";
import { isAddress, wait, type Chain } from "@/lib/chain";
import type { Bests, Mode, StandingRow, StrokesRow } from "@/lib/types";
import { levelFrom, levelPick, pickOne, skyWord } from "@/lib/duel";
import { ISSUES, SHARE_TAGS, siteURL } from "@/lib/site";
import { readFlags, stale, hidden, whyHidden, screen, type Flag, type Flags } from "@/lib/flags";
import { skyOf } from "@/lib/sky";
import { holePicks, coursePicks, tagWord, HARD_SKIES, type Pick } from "@/lib/featured";
import { sound } from "@/lib/feel";
import { loadFriends, saveFriends, addFriend, nameFriends } from "@/lib/friends";
import { registerName, claimRounds, gnokeyName, gnokeyClaim, type SendError } from "@/lib/adena";
import { GnokeyTx } from "@/components/Gnokey";
import { failure, track, trackError } from "@/lib/analytics";
import { Button, Segmented, Sheet, VsPar } from "@/components/ui";
import Share from "@/components/Share";
import { messageOf, shortAddr, holeLink, dareLink, parHere, HONEST, nameHint, nameRefusal, strokesWord, holesWord, AIMS, AIM_NAMES, useCopied, GNOME, byStanding, standingVs, RANKED_BY } from "@/components/common";
import { vsPar, type SkyKind } from "@/lib/card";
import { SkyIcon } from "@/components/Weather";
import { Frame } from "@/components/Worlds";
import { gnomeById } from "@/lib/scene";
import { rivalSkin, type Skin } from "@/lib/scene/gnome";

// The leaderboards (the Players sheet: this hole, the course, friends), the records to beat
// on the cups screen, a player's place and name, and the names read on-chain.

// address → gno.land name, read once a page; "" is not kept, so a name taken since shows
const names = new Map<string, Promise<string>>();
/** A page's names kept for the Who of each row: the names its rows carry (a
 *  board's), the others in one read, one query a page, not one a row. */
function primeNames(chain: Chain, rows: readonly { player: string; name?: string }[]) {
  for (const r of rows) if (r.name) names.set(r.player, Promise.resolve(r.name));
  const todo = rows.filter((r) => !names.has(r.player)).map((r) => r.player);
  if (!todo.length) return;
  const all = chain.namesOf(todo).catch(() => [] as { player: string; name: string }[]);
  // a name found is kept; "" is not, like nameOnce's
  for (const a of todo) names.set(a, all.then((l) => l.find((x) => x.player === a)?.name || "").then((n) => (n || names.delete(a), n)));
}
export function nameOnce(chain: Chain, addr: string) {
  let p = names.get(addr);
  if (!p) {
    p = chain.nameOf(addr).catch(() => "");
    names.set(addr, p);
    void p.then((n) => n || names.delete(addr));
  }
  return p;
}

/** What every board reads: the hole on screen, the chain, the player, the mode. */
export interface BoardProps {
  s: Snapshot;
  chain: Chain | null;
  me?: string | null;
  mode?: Mode;
  /** not connected: the way to (the Adena checklist) */
  onConnect?: () => void;
  /** "Race here": a duel against a player's best on the hole played (their ghost), from the tee; only in a hole */
  onRace?: (player: string) => void;
  /** the player's gnome: a ghost put forward wears another (rivalSkin) */
  gnome?: string;
}
/** A board row's way into a duel, the duel's small gold Race, saying what it does before the click:
 *  "Race here", their ghost on the hole played at once, or "Their holes", their ghosts to pick one. */
const RaceButton = ({ player, name, me, here, onClick }: { player: string; name: string; me?: string | null; here: boolean; onClick?: (p: string) => void }) => {
  if (!onClick) return null;
  const self = player === me, whose = self ? "your" : `${name}'s`;
  const says = here ? `Race ${whose} ghost on this hole` : `See ${whose} ghosts and pick a hole`;
  return (
    <Button variant="gold" className="rival__go lb__race" title={says} aria-label={says} onClick={() => onClick(player)}>
      {here ? "Race here" : self ? "Your holes" : "Their holes"}
    </Button>
  );
};
/** "Connect Adena", where a board asks for it: a link to the checklist, or the words alone. */
const ConnectLink = ({ onConnect }: { onConnect?: () => void }) =>
  onConnect ? <button className="linkish" onClick={onConnect}>Connect Adena</button> : <>Connect Adena</>;

/** An empty board's places, drawn blank: the table is there before its first row. */
const Ghosts = () => (
  <ol className="lb__ghosts" aria-hidden="true">
    {Array.from({ length: 3 }, (_, i) => (
      <li key={i}>
        <span className="lb__rank">{i + 1}</span>
        <i />
        <i />
        <i />
      </li>
    ))}
  </ol>
);

// The bot check's list (lib/flags.ts), read once a visit when a board opens, from
// the site's own root (a hole's page is /h/<slot>/). Missing or broken: nobody is hidden,
// and it is read again next time; stale: said once, to whoever watches.
let flagsOnce: Promise<ReturnType<typeof readFlags>> | null = null;
const flagsOf = (chain: Chain) =>
  (flagsOnce ||= Promise.all([fetch("/flags.json", { cache: "no-cache" }).then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status))))), chain.chainId()])
    .then(([text, id]) => {
      const f = readFlags(text, id);
      if (stale(f.hours)) track("flags_stale", { hours: Number.isFinite(f.hours) ? Math.round(f.hours) : -1 });
      return f;
    })
    .catch(() => ((flagsOnce = null), track("flags_stale", { hours: -1 }), readFlags("", ""))));
function useFlags(chain: Chain | null | undefined) {
  const [f, setF] = useState<Flags>({});
  useEffect(() => {
    if (!chain) return;
    let live = true;
    void flagsOf(chain).then((x) => live && setF(x.flags));
    return () => void (live = false);
  }, [chain]);
  return f;
}
// why, written out (a title never shows on a touch screen): only with Show all on
const FlagMark = ({ f }: { f: Flag | false | undefined }) => (hidden(f) ? <small className="flag-why">Hidden here: {whyHidden(f)}</small> : null);

/**
 * You and your friends, on this hole and across the course, in the mode shown.
 * Read with Bests / Standings, which rank anyone, named or not.
 */
function Friends({ s, chain, me, mode = "pro", inHole = true, onConnect, onRace }: BoardProps & { inHole?: boolean }) {
  const [friends, setFriends] = useState(loadFriends);
  // (a failed read shows as no rows)
  const [hole, setHole] = useState<(Partial<Bests> & { rows: readonly StrokesRow[] }) | null>(null);
  const [course, setCourse] = useState<{ holes?: number; rows: readonly StandingRow[] } | null>(null);
  const [adding, setAdding] = useState("");
  const [note, setNote] = useState<string | null>(null);
  const [copied, copy] = useCopied();
  const who = [me, ...friends.map((f) => f.addr)].filter((x): x is string => !!x);
  const key = who.join(",");
  // friends kept by their address alone (a friend link, a dare, an address typed): their names, read in one query
  const bare = friends.filter((f) => !f.name).map((f) => f.addr), bareKey = bare.join(",");
  useEffect(() => {
    if (!chain || !bare.length) return;
    let live = true;
    primeNames(chain, bare.map((player) => ({ player })));
    void Promise.all(bare.map((a) => nameOnce(chain, a))).then((ns) => live && setFriends(nameFriends(Object.fromEntries(bare.map((a, i) => [a, ns[i]])))));
    return () => void (live = false);
    // bare is keyed by its join
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, bareKey]);
  useEffect(() => {
    if (!chain || !who.length) return;
    let live = true;
    const id = s.id || "";
    if (inHole) chain.bests(id, mode, who).then((b) => live && setHole(b)).catch(() => live && setHole({ rows: [] }));
    chain.standings(mode, who).then((b) => live && setCourse(b)).catch(() => live && setCourse({ rows: [] }));
    return () => void (live = false);
    // who is keyed by its join
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, s.id, mode, key, inHole]);
  const label = (a: string) => (a === me ? "You" : friends.find((f) => f.addr === a)?.name || shortAddr(a));
  const add = async (e: FormEvent) => {
    e.preventDefault();
    const v = adding.trim().replace(/^@/, "");
    if (!v) return;
    setNote(null);
    let addr = v, name = "";
    if (!isAddress(v)) {
      // (a chain that did not answer is not a name it does not know)
      const got = chain ? await chain.resolveName(v).catch(() => null) : "";
      if (got === null) return setNote("The chain did not answer. Try again in a moment.");
      (addr = got), (name = v);
      if (!addr) return setNote(`No gno.land name “${v}” on this chain.`);
    }
    if (addr === me) return setNote("That's you — you're always here.");
    setFriends(addFriend(addr, name));
    setAdding("");
  };
  const drop = (addr: string) => setFriends(saveFriends(loadFriends().filter((f) => f.addr !== addr)));
  // (a dare link: whoever opens it adds you as a friend and races your ghost where you have one)
  const invite = me && siteURL(inHole ? holeLink(s, "", me, "board") : dareLink(me, "board"));
  const rows = <R,>(b: { rows: readonly R[] } | null, pick: (a: R, b: R) => number) => (b ? [...b.rows].sort(pick) : null);
  const h = rows(hole, (a, b) => a.strokes - b.strokes), c = rows(course, byStanding);
  return (
    <div className="lb friends">
      {!me && <p className="lb__empty"><ConnectLink onConnect={onConnect} /> to see where you stand with your friends{friends.length ? "" : ", or add one below"}.</p>}
      {who.length > 0 && (<>
      {inHole && <h3>{s.name} <small>par {(hole && hole.par) || parHere(s)}</small></h3>}
      {inHole && !h && <p className="lb__empty">Reading the chain…</p>}
      {inHole && h && h.length === 0 && <p className="lb__empty">None of you has a saved round here yet: be the first.</p>}
      {inHole && h && h.length > 0 && (
        <ol>
          {h.map((r, i) => (
            <li key={r.player} className={r.player === me ? "me" : ""}>
              <span className="lb__rank">{i + 1}</span>
              <span className="lb__who">{label(r.player)}{mode === "pro" && <em className="pro-chip pro-chip--row">PRO</em>}</span>
              <span className="lb__holes">{strokesWord(r.strokes)}</span>
              <strong><VsPar vs={r.strokes - ((hole && hole.par) || parHere(s))} /></strong>
              <RaceButton player={r.player} name={label(r.player)} me={me} here onClick={onRace} />
            </li>
          ))}
        </ol>
      )}
      <h3>The course <small>{course ? `${course.holes} holes · ${RANKED_BY}` : RANKED_BY}</small></h3>
      {!c && <p className="lb__empty">Reading the chain…</p>}
      {c && c.length === 0 && <p className="lb__empty">No saved rounds yet: be the first.</p>}
      {c && c.length > 0 && (
        <ol>
          {c.map((r, i) => (
            <li key={r.player} className={r.player === me ? "me" : ""}>
              <span className="lb__rank">{i + 1}</span>
              <span className="lb__who">{label(r.player)}</span>
              <span className="lb__holes">{holesWord(r.holes)}</span>
              <strong><VsPar vs={standingVs(r)} /></strong>
            </li>
          ))}
        </ol>
      )}
      </>)}
      <section className="friends__manage" aria-label="Your friends">
      <h4>Your friends</h4>
      <form className="friends__add" onSubmit={(e) => void add(e)}>
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add a friend: address or gno.land name" aria-label="Add a friend by address or gno.land name" />
        <Button variant="secondary" type="submit">Add</Button>
      </form>
      {note && <p className="note note--warn">{note}</p>}
      {friends.length > 0 && (
        <ul className="friends__list">
          {friends.map((f) => (
            <li key={f.addr}>
              <span>{f.name || shortAddr(f.addr, 10)}</span>
              <button className="linkish" onClick={() => drop(f.addr)} aria-label={`Remove ${f.name || f.addr}`}>remove</button>
            </li>
          ))}
        </ul>
      )}
      {invite && (
        <button
          className="linkish friends__invite"
          onClick={() => void copy(invite)}
        >
          {copied ? "Copied: they race your ghost, and you join their friends" : "Copy my dare link"}
        </button>
      )}
      </section>
    </div>
  );
}

/**
 * The leaderboards, in a sheet: this hole's best rounds, and the whole
 * course's. Read from the chain when the sheet opens, not before.
 */
// onGhosts: "Their holes", a player's ghosts to pick a hole: the course's rows without a best on the hole played (all of them off a hole)
export function Boards({ s, chain, me, onClose, goTo, mode: mine = "pro", inHole = true, onConnect, onRace, onGhosts, gnome }: BoardProps & { onClose: () => void; goTo: (id: string) => void; inHole?: boolean; onGhosts?: (player: string) => void }) {
  const [claimed, setClaimed] = useState(0); // rounds just ranked: the board is read again
  // "This hole" is the hole being played: opened from the cups, there is none.
  // Friends first in a hole once you have some (none: an empty tab is no welcome; from the cups: the course)
  const [friendsFirst] = useState(() => inHole && loadFriends().length > 0);
  const [tab, setTab] = useState<"friends" | "hole" | "course">(friendsFirst ? "friends" : inHole ? "hole" : "course");
  const [mode, setMode] = useState<Mode>(mine);
  // the connected player's gno.land name: the general boards list only named players
  const [myName, setMyName] = useState<string | null>(null);
  useEffect(() => {
    if (!chain || !me) return;
    let live = true;
    void nameOnce(chain, me).then((n) => live && setMyName(n));
    return () => void (live = false);
  }, [chain, me]);
  const self = (s.allHoles || []).find((h) => h.id === s.id);
  const newer = self && self.next;
  return (
    <Sheet className="boards" label="Players" onClose={onClose}>
        <span className="eyebrow">Players · saved on-chain</span>
        <h2>Beat a record</h2>
        <div className="boards__modes">
          <Segmented className="seg--s" role="tablist" label="Aim mode" value={mode} onChange={setMode} options={AIMS} />
          <p className="boards__word">{HONEST}</p>
        </div>
        <Segmented className="boards__tabs" full role="tablist" label="Board" value={tab} onChange={setTab} options={[...(friendsFirst ? [["friends", "Friends"] as const] : []), ...(inHole ? [["hole", "This hole"] as const] : []), ["course", "The course"] as const, ...(friendsFirst ? [] : [["friends", "Friends"] as const])]} />
        {tab === "course" && inHole && onRace && <p className="real__fine boards__legend">Race here: this hole · Their holes: pick one.</p>}
        {tab !== "friends" && (
          <p className="boards__ranked">
            Ranked: players with a gno.land name{!(me && myName) && ", taken when you save"}
          </p>
        )}
        {tab !== "friends" && me && myName && chain && <ClaimRounds chain={chain} me={me} mode={mode} onDone={() => setClaimed((n) => n + 1)} />}
        {tab === "hole" && newer && (
          <p className="note note--warn">
            Archived version — <button className="linkish" onClick={() => goTo(newer)}>play the current one</button>
          </p>
        )}
        {tab === "friends" ? <Friends s={s} chain={chain} me={me} mode={mode} inHole={inHole} onConnect={onConnect} onRace={onRace} /> : <FullBoard key={`${tab}|${mode}|${s.id}|${claimed}`} kind={tab} s={s} chain={chain} me={me} mode={mode} onConnect={onConnect} onRace={onRace} onGhosts={onGhosts} gnome={gnome} />}
        <p className="real__fine">
          Only rounds saved on-chain appear here.
          {tab !== "friends" && chain && <> · <a href={chain.boardURL(tab === "hole" ? s.id : null, mode)} target="_blank" rel="noopener noreferrer">This board on gno.land ↗</a></>}
        </p>
    </Sheet>
  );
}

/**
 * The players who finished without a gno.land name: kept by the chain, never
 * ranked (an address is free, a name is not), listed folded under the board,
 * greyed and without a place. Read only when opened, 100 by address a page,
 * named ones left out with one read of their names per page.
 */
function Unnamed({ kind, chain, id, mode, me, count }: { kind: "hole" | "course"; chain: Chain | null; id: string; mode: Mode; me?: string | null; count?: number }) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<readonly (StrokesRow & { holes?: number; par?: number })[] | null>(null);
  const [after, setAfter] = useState(""); // the next page's cursor, "" at the end
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(false);
  const load = (from: string) => {
    if (!chain || busy) return;
    setBusy(true);
    setErr(false);
    (kind === "hole" ? chain.records(id, mode, from) : chain.players(mode, from))
      .then(async (b) => {
        // names through the shared cache: one read a page, kept for the boards' rows
        primeNames(chain, b.rows);
        const named = await Promise.all(b.rows.map((r) => nameOnce(chain, r.player)));
        // no name today: a player named since their finish ranks from their next
        // one, and until then is on neither list (the realm keeps no such index)
        const page = b.rows.filter((_, i) => !named[i]);
        setRows((r) => [...(from ? r || [] : []), ...page].sort(byStanding));
        setAfter(b.next);
      })
      .catch(() => setErr(true))
      .finally(() => setBusy(false));
  };
  if (count === 0) return null;
  return (
    <details className="unnamed late" onToggle={(e) => { const o = (e.target as HTMLDetailsElement).open; setOpen(o); if (o && !rows) load(""); }}>
      <summary>Also finished, no name{count ? ` (${count})` : ""}</summary>
      {open && !rows && !err && <p className="lb__empty">Reading the chain…</p>}
      {err && <p className="note note--bad">The chain did not answer. <button className="linkish" onClick={() => load(rows ? after : "")}>Try again</button></p>}
      {rows && rows.length === 0 && !after && !err && <p className="lb__empty">Nobody without a name here.</p>}
      {rows && rows.length > 0 && (
        <ul>
          {rows.map((r) => (
            <li key={r.player} className={r.player === me ? "me" : ""}>
              {kind === "hole" && chain ? (
                <a href={chain.roundURL(id, r.player)} target="_blank" rel="noopener noreferrer">{r.player === me ? "You" : shortAddr(r.player)}</a>
              ) : (
                <span>{r.player === me ? "You" : shortAddr(r.player)}</span>
              )}
              <span>{kind === "hole" ? strokesWord(r.strokes) : `${holesWord(r.holes || 0)} · ${vsPar(standingVs(r))}`}</span>
            </li>
          ))}
        </ul>
      )}
      {after && (
        <button className="linkish" disabled={busy} onClick={() => load(after)}>
          {busy ? "Reading…" : "Show more"}
        </button>
      )}
    </details>
  );
}

/** A row of a full board: its place on the chain's board (the page's offset on), and the score (a course row's: its holes, strokes and par). */
export type Placed = StrokesRow & { holes?: number; par?: number; at: number };

/**
 * The rival screen's three quick picks, flagged players left out as on the
 * boards: the course's #1, a player at the player's level (next to their
 * place; the board's middle without one), and one at random, drawn again on
 * each visit. null while read; a pick nobody fills, null.
 */
// the three picks (the champion, your level, yourself: null while no one is connected),
// and a surprise (the board's Surprise me); a board that could not be read: retry, to read it again
export function useRivalPicks(chain: Chain | null, me: string | null | undefined, mode: Mode) {
  const [picks, setPicks] = useState<{ rows: readonly (Placed | null)[]; surprise: Placed | null; retry?: () => void } | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!chain) return;
    let live = true;
    // a page of the course's board, its places kept, the flagged out
    const page = (at: number, n: number) =>
      Promise.all([chain.courseLeaderboard(at, n, mode), flagsOf(chain)]).then(([b, f]) => ({ players: b.players, rows: screen(b.rows.map((r, i) => ({ ...r, at: at + i + 1 })), f.flags, false).rows }));
    void Promise.all([page(0, 10), me ? chain.rank(mode, me).catch(() => null) : null])
      .then(async ([top, mine]) => {
        const champ = top.rows[0] || null;
        // (a page that fails: the first one's players stand in)
        const near = await page(levelFrom(mine ? mine.rank : 0, top.players), 5).catch(() => top);
        const level = levelPick(near.rows, me, champ ? [champ.player] : []);
        const any = await page(Math.floor(Math.random() * top.players), 5).catch(() => top);
        const surprise = pickOne([...any.rows, ...top.rows], [me, champ && champ.player, level && level.player], Math.random());
        // (your row on the first page, else your rank read apart; unranked in this mode: at 0, your ghosts still read)
        const self: Placed | null = !me ? null : top.rows.find((r) => r.player === me) || { player: me, at: mine && mine.rank > 0 ? mine.rank : 0, holes: mine ? mine.holes : 0, strokes: mine ? mine.strokes : 0, par: mine ? mine.par : 0 };
        primeNames(chain, [champ, level, surprise].flatMap((r) => (r ? [r] : [])));
        if (live) setPicks({ rows: [champ, level, self], surprise });
      })
      .catch(() => live && setPicks({ rows: [null, null, null], surprise: null, retry: () => (setPicks(null), setTick((n) => n + 1)) }));
    return () => void (live = false);
  }, [chain, me, mode, tick]);
  return picks;
}

/**
 * A whole board, the hole's or the course's, read a page at a time as it is
 * scrolled: a page is O(page) on the chain however deep. Every row links to
 * what proves it, and the connected player sees their own place, pinned under
 * the list when it is further down, with a way to share it.
 */
// max: its first rows only, and nothing else (the rival's stickers: the whole board is a link away)
// onRace: a hole's rows, and the course's with a best on the hole played; onGhosts: the course's others (all of them off a hole)
/** The weather a record was played in, beside its strokes: none for a calm sky (the bar every record is read against). */
function SkyMark({ kind, mine }: { kind: SkyKind | undefined; mine: boolean }) {
  if (!kind) return null;
  const said = `Played in ${kind === "wind" ? "the wind" : skyWord(kind)}`;
  return <span className="lb__sky" role="img" aria-label={said} title={said}><SkyIcon sky={kind} mine={mine} /></span>;
}

export function FullBoard({ kind, s, chain, me, mode = "pro", onConnect, onRace, onGhosts, row, max, gnome }: BoardProps & { kind: "hole" | "course"; onGhosts?: (player: string) => void; /** a row drawn otherwise (the rival's stickers) */ row?: (r: Placed) => ReactNode; max?: number }) {
  const PAGE = 20, TOP = 5;
  const id = s.id || "";
  const [rows, setRows] = useState<readonly Placed[] | null>(null);
  const [head, setHead] = useState<{ par: number; holes: number; players: number; finished?: number } | null>(null);
  const [next, setNext] = useState(0); // the next page's offset, 0 at the end
  const [err, setErr] = useState(false); // a page the chain did not give
  const [more, setMore] = useState(false);
  const [mine, setMine] = useState<{ rank: number; of: number; strokes: number; holes?: number; par?: number } | null>(null);
  const [mineRead, setMineRead] = useState(!me); // (your place asked: the records put forward wait for it, then hold)
  const flags = useFlags(chain);
  const [showAll, setShowAll] = useState(false);
  // the course's rows with a best on the hole played, read with their page (one read a page, not one a row):
  // their Race is there, the others' (all of them if the read failed) their ghosts. A hole's rows all race there.
  const [here, setHere] = useState<ReadonlySet<string>>(() => new Set());
  // a hole's records: the block each was saved at and the weather it was played in, read with its page (one read; none said if it fails)
  const [info, setInfo] = useState<ReadonlyMap<string, { height: number; sky: SkyKind }>>(() => new Map());
  const [infoRead, setInfoRead] = useState(kind !== "hole"); // (the first page's: the records put forward wait for it)
  // the whole board, or its first rows (TOP) under the records put forward
  const [whole, setWhole] = useState(false);
  // the rows around your place when it is past the rows read: one read of five (the chain's, flagged ones in)
  const [near, setNear] = useState<readonly Placed[] | null>(null);
  const [nearRead, setNearRead] = useState(false); // (read, or not needed: the course's picks wait for the place above yours)
  const hereOn = kind === "course" && !!onRace && !!id;
  const racesHere = (p: string) => kind === "hole" || here.has(p);
  // Offsets are the chain's, not the rows shown: a name deleted since is
  // skipped in its page, which then holds fewer rows while more still follow.
  const read = (offset: number) =>
    kind === "hole"
      ? chain!.holeLeaderboard(id, offset, PAGE, mode).then((b) => ({ b, head: { par: b.par, holes: 0, players: b.players, finished: b.finished } }))
      : chain!.courseLeaderboard(offset, PAGE, mode).then((b) => ({ b, head: { par: 0, holes: b.holes, players: b.players } }));
  const alive = useRef(true);
  // set on each mount too: React's dev double mount runs the cleanup once in between
  useEffect(() => ((alive.current = true), () => void (alive.current = false)), []);
  const add = (offset: number) =>
    read(offset).then(async ({ b, head: h }) => {
      const players = b.rows.map((r) => r.player);
      // (the rows never wait for it: a page of forecasts takes the node a second or two)
      // a hole's records, one read for the page (the rows never wait for it): their skies,
      // worked out from their periods (lib/sky.ts)
      if (kind === "hole")
        void chain!.recordsOf(id, mode, players).then((kept) => {
          if (alive.current && kept.size) setInfo((was) => new Map([...was, ...[...kept].map(([p, r]): [string, { height: number; sky: SkyKind }] => [p, { height: r.height, sky: skyOf(id, s.world || "garden", r.period) }])]));
        }, () => {}).finally(() => alive.current && setInfoRead(true));
      const got = hereOn ? await chain!.bests(id, mode, players).then((x) => x.rows.map((r) => r.player), () => []) : [];
      if (!alive.current) return;
      if (got.length) setHere((was) => new Set([...was, ...got]));
      primeNames(chain!, b.rows);
      setHead(h);
      setRows((r) => {
        const had = offset ? r || [] : [];
        // a place is the rows shown before it: the chain's offsets also count
        // names deleted since, skipped in their page. A row already shown (the
        // board moved between two reads) is not listed twice.
        const seen = new Set(had.map((x) => x.player));
        const fresh = b.rows.filter((x) => !seen.has(x.player));
        return [...had, ...fresh.map((x, i) => ({ ...x, at: had.length + i + 1 }))];
      });
      setNext(b.next > offset ? b.next : 0);
    });
  useEffect(() => {
    if (!chain) return;
    add(0).catch(() => setErr(true));
    // the board is keyed by kind, mode and hole: one mount, one first page
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain]);
  useEffect(() => {
    if (!chain || !me) return;
    let live = true;
    (kind === "hole" ? chain.holeRank(id, mode, me) : chain.rank(mode, me)).then((r) => live && setMine(r.rank > 0 ? r : null)).catch(() => {}).finally(() => live && setMineRead(true));
    return () => void (live = false);
  }, [chain, me, kind, id, mode]);
  // your neighbours, when your place is past the rows read (else they are among them)
  const listed = !!rows && !!me && rows.some((r) => r.player === me);
  useEffect(() => {
    setNear(null);
    setNearRead(!me || mineRead && (!mine || listed));
    if (!chain || max || row || !mine || !rows || listed) return;
    let live = true;
    const at = Math.max(0, mine.rank - 3);
    void (kind === "hole" ? chain.holeLeaderboard(id, at, 5, mode) : chain.courseLeaderboard(at, 5, mode))
      .then((b) => (primeNames(chain, b.rows), live && setNear(b.rows.map((r, i) => ({ ...r, at: at + i + 1 })))), () => {})
      .finally(() => live && setNearRead(true));
    return () => void (live = false);
    // (rows: only whether they are read)
  }, [chain, mine, mineRead, listed, !rows, kind, id, mode, max, row]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadMore = () => {
    if (!next || more) return;
    setMore(true);
    add(next)
      .catch(() => setErr(true))
      .finally(() => setMore(false));
  };
  // the next page loads as the end of the list comes into view
  const end = useRef<HTMLLIElement>(null);
  const moreRef = useRef(loadMore);
  moreRef.current = loadMore;
  useEffect(() => {
    const el = end.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // watched inside the scroll it is in: the sheet's (the boards', the scorecard's), else the list's own (the rival's)
    const o = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && moreRef.current(), { root: el.closest(".boards, .cardsheet") || el.parentElement });
    o.observe(el);
    return () => o.disconnect();
  }, [rows, whole]);
  // places are counted on the rows shown, flagged ones left out unless shown:
  // the same numbers as the save button's
  const screened = rows ? screen(rows, flags, showAll) : null;
  const shown = screened && { ...screened, rows: screened.rows.map((r, i) => ({ ...r, at: i + 1 })) };
  const par = head ? head.par || parHere(s) : parHere(s);
  const link = (p: string) => (kind === "hole" ? chain?.roundURL(id, p) : chain?.userURL(p));
  const score = (r: { strokes: number; holes?: number; par?: number; player?: string }) =>
    kind === "hole" ? (
      <>
        <span className="lb__holes">
          {r.strokes === 1 ? <em className="ace-chip">ACE</em> : `${r.strokes} strokes`}
          <SkyMark kind={r.player ? info.get(r.player)?.sky : undefined} mine={s.world === "mines"} />
        </span>
        <strong><VsPar vs={r.strokes - par} /></strong>
      </>
    ) : (
      <>
        <span className="lb__holes">
          {r.holes}/{head ? head.holes : "–"} holes
        </span>
        <strong><VsPar vs={standingVs(r)} /></strong>
      </>
    );
  // a row of the board (or of your neighbours): its place, who (and why hidden, with Show all), its score, its Race
  const rowClass = (r: Placed) => (r.player === me ? "me " : "") + (hidden(flags[r.player]) ? "flagged " : "") + "late";
  const rowBody = (r: Placed) => (<>
    <Place at={r.at} plain />
    <span className="lb__who">
      <Who chain={chain} addr={r.player} me={me} link={link(r.player)} title={kind === "hole" ? undefined : "Player page on gno.land"} />
      <FlagMark f={showAll && flags[r.player]} />
    </span>
    {score(r)}
    <RaceButton player={r.player} name={r.name || shortAddr(r.player)} me={me} here={racesHere(r.player)} onClick={racesHere(r.player) ? onRace : onGhosts} />
  </>);
  // your place, listed or further down: said once under the list, with the game's share
  // (the place in the list shown, flagged players left out of it and of the count)
  const myRow = shown && me ? shown.rows.find((r) => r.player === me) : undefined;
  const myPlace = myRow && head && shown ? { at: myRow.at, of: head.players - shown.hidden } : mine ? { at: mine.rank, of: mine.of } : null;
  // the rows to come, blank: drawn as the rows will be (the rival's stickers, as many as it shows)
  const ghosts = row ? <ol aria-hidden="true">{Array.from({ length: max || 3 }, (_, i) => <li key={i}><StickerGhost at={i + 1} /></li>)}</ol> : <Ghosts />;
  const title = kind === "hole" ? s.name : "The course";
  const own = !max && !row; // (a board of its own, not the rival's stickers)
  const listedRows = shown ? (whole || !own ? shown.rows.slice(0, max) : shown.rows.slice(0, TOP)) : [];
  // your neighbours, two either side, when the list shown stops short of you: from the rows
  // read (their places), else the read of five, its places from yours (the line under the board's)
  const myAt = shown && me ? shown.rows.findIndex((r) => r.player === me) : -1;
  const around: readonly Placed[] | null = myAt >= 0 ? shown!.rows.slice(Math.max(own && !whole ? TOP : 0, myAt - 2), myAt + 3)
    : near && mine ? ((n) => { const i = n.findIndex((r) => r.player === me); return i < 0 ? null : n.map((r, k) => ({ ...r, at: mine.rank + k - i })); })(screen(near, flags, showAll).rows)
    : null;
  const nearRows = !own || whole || listedRows.some((r) => r.player === me) ? null : around;
  // the row just above yours, wherever it was read (the course's "within reach"): held as the board grows
  const above = ((list, i) => (list && i > 0 ? list[i - 1] : null))(around, around ? around.findIndex((r) => r.player === me) : -1);
  // the records put forward: from the first page (they hold as more is read), flagged ones always out,
  // once your place and the page's weather are read (cards drawn blank till then: nothing moves);
  // none on a board of a few rows (they would be its rows again)
  const base = rows ? screen(rows.slice(0, PAGE), flags, false).rows.map((r, i) => ({ ...r, at: i + 1 })) : [];
  const featured = own && !!head && (base.length > TOP || next > 0);
  const picks: Pick<Placed>[] = !featured || !mineRead || !infoRead ? [] : kind === "hole"
    ? holePicks(base, info, me, mine ? mine.strokes : null)
    : !nearRead ? [] : ((i) => coursePicks(base, head.holes, me, i >= 0 ? base[i] : mine, i > 0 ? base[i - 1] : above))(base.findIndex((r) => r.player === me));
  // (before the chain's answer, its line with a dash: the rows under it stay where they are)
  const sub = kind === "hole" ? `par ${par} · ${head ? head.finished : "–"} finished${head && head.finished !== head.players ? `, ${head.players} ranked` : ""}` : `${head ? head.players : "–"} ranked · ${RANKED_BY}`;
  return (
    <div className="lb lb--full">
      <h3>
        {title} <small>{sub}</small>
      </h3>
      {err && <p className="note note--bad">The chain did not answer. <button className="linkish" onClick={() => (setErr(false), rows ? loadMore() : void add(0).catch(() => setErr(true)))}>Try again</button></p>}
      {/* (the course's board is never a few rows: its cards' place held while it is read) */}
      {(featured || (own && kind === "course" && !rows && !err)) && (
        <section className="featured" aria-label="Records to beat today">
          <h4 className="featured__h">Records to beat today</h4>
          <ol className="podium__row featured__row">
            {picks.length ? picks.map((p) => {
              const go = racesHere(p.row.player) ? onRace : onGhosts;
              return (
                <li key={p.row.player}>
                  <Sticker player={p.row.player} tag={tagWord(p)} sub={kind === "hole" ? `${strokesWord(p.row.strokes)} · ${vsPar(p.row.strokes - par)}` : `${holesWord(p.row.holes || 0)} · ${vsPar(standingVs(p.row))}`} chain={chain} me={me} gnome={gnome || ""}
                    onClick={go && (() => go(p.row.player))} go={racesHere(p.row.player) ? undefined : "Their holes"} />
                </li>
              );
            }) : [0, 1, 2].map((i) => <li key={i} aria-hidden="true"><StickerGhost /></li>)}
          </ol>
        </section>
      )}
      {!rows && !err && ghosts}
      {rows && rows.length === 0 && (<>{ghosts}<p className="lb__empty late">No saved round yet: {me ? "save one and be the first." : <><ConnectLink onConnect={onConnect} /> and be the first.</>}</p></>)}
      {/* every row hidden: said, not a blank board */}
      {shown && rows && rows.length > 0 && shown.rows.length === 0 && <p className="lb__empty late">Every record here is flagged.</p>}
      {shown && shown.rows.length > 0 && (
        <ol className={own ? "lb__top" : undefined}>
          {listedRows.map((r) => <li key={r.player} className={rowClass(r)}>{row ? row(r) : rowBody(r)}</li>)}
          {next > 0 && !max && (whole || row) && (
            <li className="lb__more" ref={end}>
              <Button className="boards__more" disabled={more} onClick={loadMore}>
                {more ? "Reading…" : "Show more"}
              </Button>
            </li>
          )}
        </ol>
      )}
      {/* the rest of the board, a tap away: the ghosts above and your neighbours below come first */}
      {own && !whole && shown && shown.rows.length > 0 && (shown.rows.length > TOP || next > 0) && (
        <button className="linkish lb__whole" onClick={() => setWhole(true)}>The whole board{head ? ` (${head.players - shown.hidden} ranked)` : ""} ▾</button>
      )}
      {nearRows && nearRows.length > 0 && (
        <section className="lb__near" aria-label="Near you">
          <h4 className="featured__h">Near you</h4>
          <ol>{nearRows.map((r) => <li key={r.player} className={rowClass(r)}>{rowBody(r)}</li>)}</ol>
        </section>
      )}
      {/* told, never hidden in silence: why, that it stays on the chain, and where to say it is wrong */}
      {!max && me && hidden(flags[me]) && (
        <p className="note lb__flagged">
          Your records are off these boards: the bot check saw {whyHidden(flags[me])}. They stay on the chain, and you can still race and share them. A mistake?{" "}
          <a href={ISSUES} target="_blank" rel="noopener noreferrer">Tell us ↗</a>
        </p>
      )}
      {/* (the chain's board, on gno.land, lists them: the difference said) */}
      {!max && shown && (shown.hidden > 0 || showAll) && (
        <p className="real__fine">
          <button className="linkish" onClick={() => (setShowAll((v) => !v), setWhole(true))}>
            {showAll ? "Hide flagged players" : `Show all (${shown.hidden} flagged)`}
          </button>
          {" · "}gno.land&apos;s board lists everyone.
        </p>
      )}
      {/* (with the rows: a hole's count is known then, and with none it is not there at all) */}
      {!max && head && <Unnamed kind={kind} chain={chain} id={id} mode={mode} me={me} count={kind === "hole" && head.finished != null ? head.finished - head.players : undefined} />}
      {/* your place, when the list shown does not reach it yet */}
      {!max && mine && me && !listedRows.some((r) => r.player === me) && !nearRows?.length && (
        <ol className="lb__mine">
          <li className="me">
            <span className="lb__rank">{mine.rank}</span>
            <span className="lb__who">You</span>
            {score(mine)}
          </li>
        </ol>
      )}
      {!max && myPlace && (
        <div className="lb__myshare">
          <span>
            {me && hidden(flags[me]) ? "On gno.land's board, you are" : "You are"} <b>#{myPlace.at}</b> of {myPlace.of} {kind === "hole" ? `on ${s.name}` : "on the course"}
          </span>
          {/* a place on a board is a saved best: the link dares (friends race the ghost) */}
          <Share
            what="board"
            label="Dare a friend"
            kind="dare"
            saved
            text={`🏆 #${myPlace.at} of ${myPlace.of} ${kind === "hole" ? `on ${s.name}` : "on the whole course"} in Gnogolf (${mode}), saved on-chain. Come and take my place: race my ghost, free to play, no wallet needed.${SHARE_TAGS}`}
            link={kind === "hole" ? holeLink(s, "", me || "", "board") : dareLink(me || "", "board")}
          />
        </div>
      )}
    </div>
  );
}

/**
 * A finished hole's place on its board if saved (0: not on the first page, or
 * nothing to take), what the save would do there (the players it passes, a new
 * best of yours, the best in its weather), and whether the connected player
 * lacks the gno.land name the boards need.
 */
export function useRankNudge(s: Snapshot | null, chain: Chain | null, me: string | null | undefined, mode: Mode, saved: boolean, stale: boolean) {
  const [at, setAt] = useState(0);
  const [gain, setGain] = useState<{ pass: readonly string[]; best: boolean; sky: SkyKind }>(NO_GAIN);
  const [named, setNamed] = useState<boolean | null>(null);
  const id = (s && s.id) || "", strokes = s ? s.strokes : 0;
  // an archived version, or a community hole, ranks nobody
  const ranked = !!(s && s.official) && !((s && s.allHoles) || []).find((h) => h.id === id)?.next;
  const done = !!(s && s.holed);
  const world = (s && s.world) || "garden";
  const sky: SkyKind = s && s.period != null && id ? skyOf(id, world, s.period) : "";
  useEffect(() => {
    setAt(0);
    setGain(NO_GAIN);
    if (!chain || !done || saved || stale || !ranked || !id) return;
    let live = true;
    const PAGE = 10;
    // (your best here, wherever it is on the board; a read that failed says nothing)
    Promise.all([chain.holeLeaderboard(id, 0, PAGE, mode), flagsOf(chain), me ? chain.holeRank(id, mode, me) : null])
      .then(([board, { flags }, rank]) => {
        // (yours hidden by the bot check: no place to take on these boards)
        if (!live || (me && hidden(flags[me]))) return;
        // as the board shows it: flagged players are hidden there, so not ahead here
        const b = { ...board, rows: screen(board.rows, flags, false).rows };
        const best = rank && rank.rank > 0 ? rank.strokes : null;
        if (best != null && best <= strokes) return; // no better than the player's own best
        // equal strokes go by who got there first: a save lands last, so every tie is ahead
        const ahead = b.rows.filter((r) => r.player !== me && r.strokes <= strokes).length;
        // sorted rows: a row not ahead, or the end of the board, makes the place exact
        // (a page can hold fewer rows than asked while more follow)
        if (!(ahead < b.rows.length || b.next === 0)) return;
        setAt(ahead + 1);
        // the players passed: ahead of your best now (before your row; all the page's when your row is
        // further down), behind this round; none when you were on no board here (named: the page's)
        const was = board.rows.findIndex((r) => r.player === me);
        const aheadOfBest = best == null ? [] : was >= 0 ? board.rows.slice(0, was) : board.rows;
        const pass = b.rows.filter((r) => aheadOfBest.includes(r) && r.strokes > strokes).map((r) => r.name || shortAddr(r.player));
        setGain({ pass, best: best != null, sky: "" });
        // in a hard sky, the best in it here: no record ahead played in the same sky (one read; said only if read)
        const before = b.rows.filter((r) => r.player !== me && r.strokes <= strokes).map((r) => r.player);
        if (HARD_SKIES.includes(sky))
          void (before.length ? chain.recordsOf(id, mode, before) : Promise.resolve(new Map<string, { period: number }>()))
            .then((kept) => live && ![...kept.values()].some((r) => skyOf(id, world, r.period) === sky) && setGain((g) => ({ ...g, sky })), () => {});
      })
      .catch(() => {});
    return () => void (live = false);
  }, [chain, id, mode, me, strokes, done, saved, stale, ranked, sky, world]);
  useEffect(() => {
    if (!chain || !me) return;
    let live = true;
    const check = () => void nameOnce(chain, me).then((n) => live && setNamed(!!n));
    check();
    // a name taken in another tab (gnoweb) shows on coming back: "" is never cached
    const back = () => document.visibilityState === "visible" && check();
    document.addEventListener("visibilitychange", back);
    return () => ((live = false), document.removeEventListener("visibilitychange", back));
  }, [chain, me]);
  // a player with no name is not listed yet: the place is what a name would give
  return { at, ...gain, noName: !!me && named === false && ranked, isNamed: named, named: () => setNamed(true) };
}
const NO_GAIN = { pass: [] as readonly string[], best: false, sky: "" as SkyKind };

/** The chain's own name registrar on gnoweb (onyx, mainnet and a local gno: v0; pearl had v1), NEXT_PUBLIC_NAMEREG if set. */
function NameLink({ chain, children }: { chain: Chain | null; children: ReactNode }) {
  const [reg, setReg] = useState(process.env.NEXT_PUBLIC_NAMEREG || "");
  useEffect(() => {
    if (reg || !chain) return;
    let live = true;
    void chain.nameReg().then((r) => live && setReg(r), () => {});
    return () => void (live = false);
  }, [chain, reg]);
  if (!chain || !reg) return <>{children}</>;
  return (
    <a href={chain.web + "/" + reg.replace(/^(gno\.land)?\//, "")} target="_blank" rel="noopener noreferrer">
      {children}
    </a>
  );
}

/**
 * A name typed (what follows "nym-"), the chain asked about it once the typing
 * rests: taken, too close to one taken. why: "" free, a reason, null when the
 * chain did not answer (retry asks again), undefined while not asked yet.
 * ready: none typed, or one the chain would take. chain null: not asked.
 */
// via: typed for a save's signature, or the name form's own
export function useNameCheck(chain: Chain | null, stem: string, via: "save" | "form" = "form") {
  const name = "nym-" + stem, hint = stem ? nameHint(stem) : "";
  const [asked, setAsked] = useState<{ name: string; why: string | null } | null>(null);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    if (!chain || !stem || hint) return;
    let live = true;
    const t = setTimeout(() => void chain.nameProblem(name).then((why) => live && setAsked({ name, why }), () => live && setAsked({ name, why: null })), 400);
    return () => ((live = false), clearTimeout(t));
  }, [chain, name, stem, hint, tries]);
  const why = asked && asked.name === name ? asked.why : undefined;
  // a refusal said once the name typed rests a second on it (not each key on the way), never the name
  const refused = nameRefusal(stem, why), said = useRef(""), suggested = useRef(stem); // (the name the form offered: not the player's)
  useEffect(() => {
    if (!chain || !refused || stem === suggested.current) return;
    const t = setTimeout(() => said.current !== stem && ((said.current = stem), track("name_refused", { reason: refused, via })), 1000);
    return () => clearTimeout(t);
  }, [chain, stem, refused, via]);
  return { stem, name, hint, why, ready: !stem || why === "", retry: () => setTries((n) => n + 1) };
}
export type NameCheck = ReturnType<typeof useNameCheck>;

/**
 * Taking a gno.land name. On its own: typed, then "Get this name" signs it,
 * or gnokey does (a paste, under the form; the only way with no account
 * connected: account null). With a save (typed): the name typed and checked
 * by the card's owner, taken in the save's own signature; no button here.
 */
// folded: already inside a fold of the caller's, its gnokey panel shown without its own
export function NameForm({ chain, account, chainId, price, lead, onNamed, typed, folded }: { chain: Chain; account: string | null; chainId: string | null; price: number; lead: string; onNamed: (name: string) => void; typed?: { check: NameCheck; set: (stem: string) => void }; folded?: boolean }) {
  const [own, setOwn] = useState("");
  const mine = useNameCheck(typed ? null : chain, own);
  const { stem, name, hint, why, retry } = typed ? typed.check : mine;
  const setStem = typed ? typed.set : setOwn;
  const [err, setErr] = useState<string | null>(null); // Adena's refusal
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  // the registrar gnokey calls, as registerName's (read once there is a paste to make)
  const [reg, setReg] = useState("");
  useEffect(() => {
    if (typed) return;
    let live = true;
    void chain.nameReg().then((r) => live && setReg(r), () => {});
    return () => void (live = false);
  }, [chain, typed]);
  // a name taken with gnokey, said done: the account connected asked (gnokey's key may be another)
  const sent = async () => {
    if (!account) return;
    names.delete(account);
    const n = await nameOnce(chain, account);
    if (!n) return setErr("No name on your Adena account yet: gnokey's key may be another one.");
    setDone(n);
    onNamed(n);
    track("name_registered", { ok: true, via: "gnokey" });
  };
  const take = async (e: FormEvent) => {
    e.preventDefault();
    if (!account || hint || !stem) return;
    setErr(null);
    setBusy(true);
    try {
      const problem = await chain.nameProblem(name); // asked again: taken since?
      if (problem) return setErr(problem);
      await registerName({ address: account, registrar: await chain.nameReg(), realm: chain.realm, name, price, chainId: chainId || (await chain.chainId()), rpc: chain.rpc });
      // read back: the name is the chain's once a block has it
      for (let k = 0; k < 10; k++) {
        names.delete(account);
        if ((await nameOnce(chain, account)) === name) break;
        await wait(1000);
      }
      setDone(name);
      onNamed(name);
      track("name_registered", { ok: true, via: "form" });
    } catch (x) {
      const cancelled = !!(x as SendError).cancelled;
      track("name_registered", { ok: false, via: "form", reason: cancelled ? "cancelled" : failure(x) });
      if (!cancelled) trackError("name", x), setErr(messageOf(x));
    } finally {
      setBusy(false);
    }
  };
  if (done) return <p className="note note--good">You are <b>{done}</b> now: save your round to take your place.</p>;
  const problem = err || why;
  const bad = !!stem && !!(hint || problem || why === null); // a name typed that the chain would not take, or could not check
  return (<>
    <form className="nameform" onSubmit={(e) => void (typed || !account ? e.preventDefault() : take(e))}>
      <b className="nameform__title">{lead}</b>
      <span className="nameform__why">{typed ? "Only named players are ranked. Yours is taken with this save." : "Only named players are ranked. Take yours once."}</span>
      <span className="nameform__row">
        <label className={"nameform__field" + (bad ? " nameform__field--bad" : "")}>
          <span aria-hidden="true">nym-</span>
          <input value={stem} onChange={(e) => (setErr(null), setStem(e.target.value.toLowerCase().replace(/^nym-/, "").trim()))} aria-label="Your gno.land name, after nym-" placeholder="golfer123" spellCheck={false} autoCapitalize="off" autoComplete="off" maxLength={16} />
        </label>
        {!typed && account && <Button variant="secondary" className="btn--save" type="submit" disabled={busy || !!hint || !stem}>{busy ? "Adena…" : "Get this name"}</Button>}
      </span>
      <small className={bad ? "nameform__err" : !stem || hint || why === undefined ? "" : "nameform__ok"} aria-live="polite">
        {typed && !stem
          ? "No name: this round is saved, not ranked."
          : hint
            ? `✗ nym-… ${hint}`
            : problem
              ? `✗ ${problem}`
              : why === null
                ? <>✗ The chain did not answer. <button type="button" className="linkish" onClick={retry}>Try again</button></>
                : why === undefined
                  ? stem ? `Checking ${name}…` : "Type the name you want."
                  : `✓ ${name}`}
        {bad && typed ? " · Fix it, or clear it to save without a name." : ""} · <NameLink chain={chain}>names on gno.land ↗</NameLink>
      </small>
    </form>
    {/* (outside the form: its Copy and its key's field submit nothing) */}
    {!typed && (
      <GnokeyTx chain={chain} open={!account} summary={folded ? null : account ? "Take it with gnokey instead" : "Take it with gnokey"}
        // only a name the form found free goes in (its checks, then the registrar's shape again)
        plan={(at) => (reg && stem && !hint && why === "" ? gnokeyName({ registrar: reg, realm: chain.realm, name, rpc: chain.rpc, ...at }) : [])}
        why={reg ? "Type a name the chain takes first." : "This chain has no name registrar."}
        onSent={account ? () => void sent() : undefined}
        web={<>Or use their forms on gno.land: {reg && <><a href={chain.helpURL(reg, "Register")} target="_blank" rel="noopener noreferrer">Register ↗</a>, then </>}<a href={chain.helpURL(chain.realm, "Claim")} target="_blank" rel="noopener noreferrer">Claim ↗</a> (it ranks the rounds you saved before).</>} />
    )}
  </>);
}

/**
 * A named player whose saved rounds are on no board (the name came after
 * them): one button ranks them now, instead of at their next finish.
 */
function ClaimRounds({ chain, me, mode, onDone }: { chain: Chain; me: string; mode: Mode; onDone: () => void }) {
  const [holes, setHoles] = useState(0); // saved holes the course ranking does not hold
  const [state, setState] = useState(""); // "", "busy", "done", or what went wrong
  const [asked, setAsked] = useState(0); // a gnokey Claim said done: read again
  useEffect(() => {
    let live = true;
    chain.rank(mode, me).then((r) => live && setHoles(r.rank === 0 ? r.holes : 0)).catch(() => {});
    return () => void (live = false);
  }, [chain, me, mode, asked]); // read once: after "Rank them" the board itself is read again
  if (state === "done") return <p className="note note--good">Your rounds are on the boards.</p>;
  if (!holes) return null;
  const go = async () => {
    setState("busy");
    try {
      await claimRounds({ address: me, realm: chain.realm, chainId: await chain.chainId(), rpc: chain.rpc });
      setState("done");
      onDone();
    } catch (x) {
      setState((x as SendError).cancelled ? "" : messageOf(x));
    }
  };
  return (
    <div className="note note--warn">
      {holes} saved hole{holes === 1 ? " is" : "s are"} not ranked yet: the name came after them.{" "}
      <Button variant="secondary" disabled={state === "busy"} onClick={() => void go()}>{state === "busy" ? "Adena…" : "Rank them"}</Button>
      {state && state !== "busy" && <small className="nameform__err"> {state}</small>}
      <ClaimGnokey chain={chain} summary="Rank them with gnokey instead" onSent={() => (setAsked((n) => n + 1), onDone())} />
    </div>
  );
}

/** golf's Claim as a gnokey paste, or on its gnoweb form: the rounds saved before a name, ranked. */
const ClaimGnokey = ({ chain, summary, onSent }: { chain: Chain; summary: string; onSent?: () => void }) => (
  <GnokeyTx chain={chain} summary={summary} onSent={onSent}
    plan={(at) => gnokeyClaim({ realm: chain.realm, rpc: chain.rpc, ...at })} why="This game's realm is not one gnokey can call."
    web={<a href={chain.helpURL(chain.realm, "Claim")} target="_blank" rel="noopener noreferrer">Or use its form on gno.land ↗</a>} />
);

/** Your place on the hole's board once the round is saved: shown by the score, and in what is shared. */
export function useSavedPlace(s: Snapshot | null, chain: Chain | null, me: string | null | undefined, mode: Mode, saved: boolean) {
  const [p, setP] = useState<{ rank: number; of: number; id: string } | null>(null); // (id: the hole it is on)
  const id = (s && s.official && s.id) || "";
  useEffect(() => {
    setP(null);
    if (!chain || !me || !id || !saved) return;
    let live = true;
    // the round was just read back: the board has it too
    chain.holeRank(id, mode, me).then((r) => live && r.rank > 0 && setP({ ...r, id })).catch(() => {});
    return () => void (live = false);
  }, [chain, me, id, mode, saved]);
  return p;
}

/** A player as the boards say them: "You", their gno.land name, or a short address while it is read; and the name alone. */
export function useWho(chain: Chain | null, addr: string, me?: string | null) {
  const [name, setName] = useState("");
  useEffect(() => {
    setName("");
    if (!chain || !addr || addr === me) return;
    let live = true;
    void nameOnce(chain, addr).then((n) => live && setName(n));
    return () => void (live = false);
  }, [chain, addr, me]);
  return { label: addr === me ? "You" : name || shortAddr(addr), name };
}
/** A ranked player as the boards show them (useWho), their address under their name in full. */
function Who({ chain, addr, me, link, title = "See this round on gno.land" }: { chain: Chain | null; addr: string; me?: string | null; link?: string; title?: string }) {
  const { label, name } = useWho(chain, addr, me);
  const body = name || addr === me ? (
    <span className="who">
      <span className="who__name">{label}</span>
      <small>{shortAddr(addr)}</small>
    </span>
  ) : (
    label
  );
  return link && link !== "#" ? (
    <a href={link} target="_blank" rel="noopener noreferrer" title={title}>
      {body}
    </a>
  ) : (
    <>{body}</>
  );
}

/** The cups screen's records to beat today (featured.ts: not the top three, a few
 *  worth beating, each for a reason), flagged players left out as on the boards,
 *  as the rival board's stickers (a tap opens the board); the cards nobody fills
 *  drawn blank. Read from the course board's first page (yours among it, or not). */
export function Podium({ chain, me, mode = "pro", gnome, onOpen, extra }: { chain: Chain | null; me?: string | null; mode?: Mode; gnome: string; onOpen: () => void; extra?: ReactNode }) {
  const [top, setTop] = useState<{ picks: Pick<StandingRow & { at: number }>[]; holes: number; flagged: boolean } | null>(null);
  useEffect(() => {
    setTop(null);
    if (!chain) return;
    let live = true;
    Promise.all([chain.courseLeaderboard(0, 50, mode), flagsOf(chain)])
      .then(([b, { flags }]) => {
        const rows = screen(b.rows, flags, false).rows.map((r, i) => ({ ...r, at: i + 1 }));
        const i = me ? rows.findIndex((r) => r.player === me) : -1;
        const picks = coursePicks(rows, b.holes, me, i >= 0 ? rows[i] : null, i > 0 ? rows[i - 1] : null);
        primeNames(chain, picks.map((p) => p.row));
        if (live) setTop({ picks, holes: b.holes, flagged: b.rows.length > 0 && !rows.length });
      })
      .catch(() => {});
    return () => void (live = false);
  }, [chain, mode, me]);
  if (!chain) return null;
  const empty = !!top && !top.picks.length;
  return (
    <section className="podium" aria-label="Records to beat today">
      <header className="podium__head">
        <h3>Records to beat <small>{AIM_NAMES[mode]} · today</small></h3>
        <span className="podium__links">
          {extra}
          <button className="linkish podium__open" onClick={() => (sound("blip"), onOpen())}>All players →</button>
        </span>
      </header>
      <ol className="podium__row">
        {[0, 1, 2].map((i) => {
          const p = top && top.picks[i];
          return p ? (
            <li key={p.row.player}>
              <Sticker player={p.row.player} tag={tagWord(p)} sub={`${p.row.holes}/${top.holes} holes · ${vsPar(standingVs(p.row))}`} chain={chain} me={me} gnome={gnome} say="See them on the board" onClick={() => (sound("blip"), onOpen())} />
            </li>
          ) : (
            <li key={i} aria-hidden="true">
              <StickerGhost />
            </li>
          );
        })}
      </ol>
      {/* (its line kept, unseen, while the board is read or has players: the cards below never move) */}
      <p className="real__fine podium__empty" style={empty ? undefined : { visibility: "hidden" }} aria-hidden={!empty}>{top && top.flagged ? "Every record here is flagged: All players lists them." : "Nobody yet: save a round on-chain and be the first record here."}</p>
    </section>
  );
}

/** A place as a disc, in its metal for the first three; plain: a board row's
 *  place past them, the number alone. */
const Place = ({ at, plain = false }: { at: number; plain?: boolean }) =>
  <span className={plain && at > 3 ? "lb__rank" : `podium__medal${at <= 3 ? ` podium__medal--${at}` : ""}`}>{at}</span>;

/** A place nobody holds yet, or not yet read: a sticker drawn blank. */
const StickerGhost = ({ at = 0 }: { at?: number }) => <div className="sticker podium__ghost"><Frame className="sticker__face" />{at > 0 && <Place at={at} />}<i /></div>;
/** A board's player as a sticker: their gnome flat (in their ghost's skin;
 *  yours, your gnome), their place, name and a line under it (sub); a tap
 *  races them (onClick), else it only shows. */
// tag: why it is there (a ghost put forward), said over its corner instead of a place
// say: what a tap does, for a reader (racing them, by default)
// go: what a tagged card's tap starts, said on it (Race, by default: "Their holes" lists their ghosts)
export function Sticker({ player, at = 0, tag, sub, chain, me, gnome, onClick, say, go = "Race" }: { player: string; at?: number; tag?: string; sub: string; chain: Chain | null; me?: string | null; gnome: string; onClick?: () => void; say?: string; go?: string }) {
  const { label } = useWho(chain, player, me), mine = player === me;
  const body = (<>
    <Face skin={mine ? gnomeById(gnome) : rivalSkin(player, gnome)} />
    {tag ? <span className="sticker__tag">{tag}</span> : <Place at={at} />}
    <span className="sticker__who">{label}</span>
    <span className="sticker__sub">{sub}</span>
    {tag && onClick && !say && <span className="sticker__go" aria-hidden="true">{go} ▸</span>}
  </>);
  return onClick
    ? <button className="sticker" aria-label={`${say ? `${label}: ${say}` : mine ? "Race your best" : go === "Race" ? `Race ${label}'s ghost` : `${label}: ${go.toLowerCase()}`}: ${tag || `#${at}`}, ${sub}`} onClick={onClick}>{body}</button>
    : <div className="sticker">{body}</div>;
}
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
/** A gnome's face, flat and inked (the logo's), on a disc in his hat's colour, lighter. */
const Face = ({ skin }: { skin: Skin }) => (
  <Frame className="sticker__face">
    <circle cx="60" cy="60" r="56" style={{ fill: `color-mix(in srgb, ${hex(skin.hat)} 45%, var(--paper))` }} />
    <g transform="translate(10 7) scale(.5)" stroke="var(--ink)" strokeWidth="10" strokeLinejoin="round">
      {skin.beard !== "none" && skin.beard !== "moustache" && <path d={GNOME.beard} fill={hex(skin.hair ?? 0xffffff)} />}
      <rect {...GNOME.face} fill="var(--paper)" />
      <path d={GNOME.hat} fill={hex(skin.hat)} />
      <rect {...GNOME.brim} fill={hex(skin.hat)} />
      <circle cx="80" cy="124" r="6" fill="var(--ink)" /><circle cx="120" cy="124" r="6" fill="var(--ink)" />
      <circle cx="100" cy="136" r="10" fill="var(--nose)" strokeWidth="6" />
    </g>
  </Frame>
);
