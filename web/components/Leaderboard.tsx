"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { Snapshot } from "@/lib/engine";
import { isAddress, wait, type Chain } from "@/lib/chain";
import type { Bests, Mode, StandingRow, StrokesRow } from "@/lib/types";
import { levelFrom, levelPick, pickOne } from "@/lib/duel";
import { SHARE_TAGS, siteURL } from "@/lib/site";
import { sound } from "@/lib/feel";
import { loadFriends, saveFriends, addFriend, nameFriends } from "@/lib/friends";
import { registerName, claimRounds, gnokeyName, gnokeyClaim, type SendError } from "@/lib/adena";
import { GnokeyTx } from "@/components/Gnokey";
import { failure, track, trackError } from "@/lib/analytics";
import { Button, Segmented, Sheet, VsPar } from "@/components/ui";
import Share from "@/components/Share";
import { messageOf, shortAddr, holeLink, dareLink, parHere, HONEST, nameHint, strokesWord, holesWord, AIMS, AIM_NAMES, useCopied, GNOME, byStanding, standingVs, RANKED_BY } from "@/components/common";
import { vsPar } from "@/lib/card";
import { Frame } from "@/components/Worlds";
import { gnomeById } from "@/lib/scene";
import { rivalSkin, type Skin } from "@/lib/scene/gnome";

// The leaderboards: the sheet (this hole, the course, friends), the top three
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

// Players another script flags as likely bots (public/flags.json: { flags:
// { addr: { score, reasons } } }), read once a session when a board opens.
// Missing or broken: nobody is hidden.
/** What the checker says of one player: a score (0..1) and its reasons. */
interface Flag {
  score: number;
  reasons?: string[];
}
type Flags = Record<string, Flag | undefined>;
let flagsOnce: Promise<Flags> | null = null;
const flagsOf = () =>
  (flagsOnce ||= fetch("flags.json", { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<unknown>) : {}))
    .then((j) => (j && typeof j === "object" && "flags" in j && j.flags && typeof j.flags === "object" ? (j.flags as Flags) : {}))
    .catch(() => ({})));
const HIDE_AT = 0.5; // the checker's own self-test bot scores 0.61, a strong human up to 0.35
function useFlags() {
  const [f, setF] = useState<Flags>({});
  useEffect(() => {
    let live = true;
    void flagsOf().then((x) => live && setF(x));
    return () => void (live = false);
  }, []);
  return f;
}
/** Rows with the flagged ones taken out unless shown; the count taken out. */
const screen_ = <R extends { player: string }>(rows: readonly R[], flags: Flags, all: boolean) => {
  const out = all ? rows : rows.filter((r) => !((flags[r.player]?.score ?? 0) >= HIDE_AT));
  return { rows: out, hidden: rows.length - out.length };
};
const FlagMark = ({ f }: { f: Flag | false | undefined }) =>
  f && f.score >= HIDE_AT ? (
    <em className="flag-mark" tabIndex={0} title={`Possibly automated: ${(f.reasons || []).join(", ") || "flagged"}`} aria-label={`Possibly automated: ${(f.reasons || []).join(", ")}`}>?</em>
  ) : null;

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
  const invite = me && siteURL(inHole ? holeLink(s, "", me) : dareLink(me));
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
export function Boards({ s, chain, me, onClose, goTo, mode: mine = "pro", inHole = true, onConnect, onRace, onGhosts }: BoardProps & { onClose: () => void; goTo: (id: string) => void; inHole?: boolean; onGhosts?: (player: string) => void }) {
  const [claimed, setClaimed] = useState(0); // rounds just ranked: the board is read again
  // "This hole" is the hole being played: opened from the cups, there is none
  const [tab, setTab] = useState<"friends" | "hole" | "course">(inHole ? "hole" : "course");
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
    <Sheet className="boards" label="Leaderboard" onClose={onClose}>
        <span className="eyebrow">Saved on-chain</span>
        <h2>Leaderboard</h2>
        <div className="boards__modes">
          <Segmented className="seg--s" role="tablist" label="Aim mode" value={mode} onChange={setMode} options={AIMS} />
          <p className="boards__word">{HONEST}</p>
        </div>
        <Segmented className="boards__tabs" full role="tablist" label="Board" value={tab} onChange={setTab} options={inHole ? [["hole", "This hole"], ["course", "The course"], ["friends", "Friends"]] : [["course", "The course"], ["friends", "Friends"]]} />
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
        {tab === "friends" ? <Friends s={s} chain={chain} me={me} mode={mode} inHole={inHole} onConnect={onConnect} onRace={onRace} /> : <FullBoard key={`${tab}|${mode}|${s.id}|${claimed}`} kind={tab} s={s} chain={chain} me={me} mode={mode} onConnect={onConnect} onRace={onRace} onGhosts={onGhosts} />}
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
    <details className="unnamed" onToggle={(e) => { const o = (e.target as HTMLDetailsElement).open; setOpen(o); if (o && !rows) load(""); }}>
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
      Promise.all([chain.courseLeaderboard(at, n, mode), flagsOf()]).then(([b, f]) => ({ players: b.players, rows: screen_(b.rows.map((r, i) => ({ ...r, at: at + i + 1 })), f, false).rows }));
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
export function FullBoard({ kind, s, chain, me, mode = "pro", onConnect, onRace, onGhosts, row, max }: BoardProps & { kind: "hole" | "course"; onGhosts?: (player: string) => void; /** a row drawn otherwise (the rival's stickers) */ row?: (r: Placed) => ReactNode; max?: number }) {
  const PAGE = 20;
  const id = s.id || "";
  const [rows, setRows] = useState<readonly Placed[] | null>(null);
  const [head, setHead] = useState<{ par: number; holes: number; players: number; finished?: number } | null>(null);
  const [next, setNext] = useState(0); // the next page's offset, 0 at the end
  const [err, setErr] = useState(false); // a page the chain did not give
  const [more, setMore] = useState(false);
  const [mine, setMine] = useState<{ rank: number; of: number; strokes: number; holes?: number; par?: number } | null>(null);
  const flags = useFlags();
  const [showAll, setShowAll] = useState(false);
  // the course's rows with a best on the hole played, read with their page (one read a page, not one a row):
  // their Race is there, the others' (all of them if the read failed) their ghosts. A hole's rows all race there.
  const [here, setHere] = useState<ReadonlySet<string>>(() => new Set());
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
      const got = hereOn ? await chain!.bests(id, mode, b.rows.map((r) => r.player)).then((x) => x.rows.map((r) => r.player), () => []) : [];
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
    (kind === "hole" ? chain.holeRank(id, mode, me) : chain.rank(mode, me)).then((r) => live && setMine(r.rank > 0 ? r : null)).catch(() => {});
    return () => void (live = false);
  }, [chain, me, kind, id, mode]);
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
    // watched inside the list's own scroll: it comes into view only at the end
    const o = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && moreRef.current(), { root: el.parentElement });
    o.observe(el);
    return () => o.disconnect();
  }, [rows]);
  // places are counted on the rows shown, flagged ones left out unless shown:
  // the same numbers as the podium and the save button's
  const screened = rows ? screen_(rows, flags, showAll) : null;
  const shown = screened && { ...screened, rows: screened.rows.map((r, i) => ({ ...r, at: i + 1 })) };
  const listed = !!rows && !!me && rows.some((r) => r.player === me);
  const par = head ? head.par || parHere(s) : parHere(s);
  const link = (p: string) => (kind === "hole" ? chain?.roundURL(id, p) : chain?.userURL(p));
  const score = (r: { strokes: number; holes?: number; par?: number }) =>
    kind === "hole" ? (
      <>
        <span className="lb__holes">
          {r.strokes === 1 ? <em className="ace-chip">ACE</em> : `${r.strokes} strokes`}
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
  // your place, listed or further down: said once under the list, with the game's share
  // (the place in the list shown, flagged players left out of it and of the count)
  const myRow = shown && me ? shown.rows.find((r) => r.player === me) : undefined;
  const myPlace = myRow && head && shown ? { at: myRow.at, of: head.players - shown.hidden } : mine ? { at: mine.rank, of: mine.of } : null;
  const title = kind === "hole" ? s.name : "The course";
  const sub = !head ? "" : kind === "hole" ? `par ${par} · ${head.finished} finished${head.finished !== head.players ? `, ${head.players} ranked` : ""}` : `${head.players} ranked · ${RANKED_BY}`;
  return (
    <div className="lb lb--full">
      <h3>
        {title} <small>{sub}</small>
      </h3>
      {err && <p className="note note--bad">The chain did not answer. <button className="linkish" onClick={() => (setErr(false), rows ? loadMore() : void add(0).catch(() => setErr(true)))}>Try again</button></p>}
      {!rows && !err && <Ghosts />}
      {rows && rows.length === 0 && (<><Ghosts /><p className="lb__empty">No saved round yet: {me ? "save one and be the first." : <><ConnectLink onConnect={onConnect} /> and be the first.</>}</p></>)}
      {shown && shown.rows.length > 0 && (
        <ol>
          {shown.rows.slice(0, max).map((r) => (
            <li key={r.player} className={(r.player === me ? "me " : "") + (r.at <= 3 ? `medal medal--${r.at}` : "")}>
              {row ? row(r) : (
                <>
                  <Place at={r.at} plain />
                  <span className="lb__who">
                    <Who chain={chain} addr={r.player} me={me} link={link(r.player)} title={kind === "hole" ? undefined : "Player page on gno.land"} />
                    <FlagMark f={showAll && flags[r.player]} />
                  </span>
                  {score(r)}
                  <RaceButton player={r.player} name={r.name || shortAddr(r.player)} me={me} here={racesHere(r.player)} onClick={racesHere(r.player) ? onRace : onGhosts} />
                </>
              )}
            </li>
          ))}
          {next > 0 && !max && (
            <li className="lb__more" ref={end}>
              <Button className="boards__more" disabled={more} onClick={loadMore}>
                {more ? "Reading…" : "Show more"}
              </Button>
            </li>
          )}
        </ol>
      )}
      {!max && shown && (shown.hidden > 0 || showAll) && (
        <button className="linkish" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Hide flagged players" : `Show all (${shown.hidden} hidden)`}
        </button>
      )}
      {!max && <Unnamed kind={kind} chain={chain} id={id} mode={mode} me={me} count={head && kind === "hole" && head.finished != null ? head.finished - head.players : undefined} />}
      {/* your place, when the list shown does not reach it yet */}
      {!max && mine && me && !listed && (
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
            You are <b>#{myPlace.at}</b> of {myPlace.of} {kind === "hole" ? `on ${s.name}` : "on the course"}
          </span>
          {/* a place on a board is a saved best: the link dares (friends race the ghost) */}
          <Share
            what="board"
            label="Dare a friend"
            text={`🏆 #${myPlace.at} of ${myPlace.of} ${kind === "hole" ? `on ${s.name}` : "on the whole course"} in Gnogolf (${mode}), saved on-chain. Come and take my place: race my ghost, free to play, no wallet needed.${SHARE_TAGS}`}
            link={kind === "hole" ? holeLink(s, "", me || "") : dareLink(me || "")}
          />
        </div>
      )}
    </div>
  );
}

/**
 * A finished hole's place on its board if saved (0: not on the first page, or
 * nothing to take), and whether the connected player lacks the gno.land name
 * the boards need.
 */
export function useRankNudge(s: Snapshot | null, chain: Chain | null, me: string | null | undefined, mode: Mode, saved: boolean, stale: boolean) {
  const [at, setAt] = useState(0);
  const [named, setNamed] = useState<boolean | null>(null);
  const id = (s && s.id) || "", strokes = s ? s.strokes : 0;
  // an archived version, or a community hole, ranks nobody
  const ranked = !!(s && s.official) && !((s && s.allHoles) || []).find((h) => h.id === id)?.next;
  const done = !!(s && s.holed);
  useEffect(() => {
    setAt(0);
    if (!chain || !done || saved || stale || !ranked || !id) return;
    let live = true;
    const PAGE = 10;
    Promise.all([chain.holeLeaderboard(id, 0, PAGE, mode), flagsOf()])
      .then(([board, flags]) => {
        if (!live) return;
        // as the board shows it: flagged players are hidden there, so not ahead here
        const b = { ...board, rows: screen_(board.rows, flags, false).rows };
        const mine = me ? b.rows.find((r) => r.player === me) : undefined;
        if (mine && mine.strokes <= strokes) return; // no better than the player's own best
        // equal strokes go by who got there first: a save lands last, so every tie is ahead
        const ahead = b.rows.filter((r) => r.player !== me && r.strokes <= strokes).length;
        // sorted rows: a row not ahead, or the end of the board, makes the place exact
        // (a page can hold fewer rows than asked while more follow)
        if (ahead < b.rows.length || b.next === 0) setAt(ahead + 1);
      })
      .catch(() => {});
    return () => void (live = false);
  }, [chain, id, mode, me, strokes, done, saved, stale, ranked]);
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
  return { at, noName: !!me && named === false && ranked, isNamed: named, named: () => setNamed(true) };
}

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
export function useNameCheck(chain: Chain | null, stem: string) {
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
                  ? `Checking ${name}…`
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

/** The course's top three on the cups screen, flagged players left out, as
 *  the rival board's stickers (they only show: the board is a tap away);
 *  the places nobody holds drawn blank. */
export function Podium({ chain, me, mode = "pro", gnome, onOpen, extra }: { chain: Chain | null; me?: string | null; mode?: Mode; gnome: string; onOpen: () => void; extra?: ReactNode }) {
  const [top, setTop] = useState<{ rows: readonly StandingRow[]; holes: number } | null>(null);
  useEffect(() => {
    setTop(null);
    if (!chain) return;
    let live = true;
    Promise.all([chain.leaderboard(mode), flagsOf()])
      .then(([b, flags]) =>
        {
          const rows = screen_(b.rows, flags, false).rows.slice(0, 3);
          primeNames(chain, rows);
          if (live) setTop({ rows, holes: b.holes });
        },
      )
      .catch(() => {});
    return () => void (live = false);
  }, [chain, mode]);
  if (!chain) return null;
  const empty = !!top && !top.rows.length;
  return (
    <section className="podium" aria-label="Top players">
      <header className="podium__head">
        <h3>Top players <small>{AIM_NAMES[mode]} · on-chain</small></h3>
        <span className="podium__links">
          {extra}
          <button className="linkish podium__open" onClick={() => (sound("blip"), onOpen())}>See the leaderboard →</button>
        </span>
      </header>
      <ol className="podium__row">
        {[0, 1, 2].map((i) => {
          const r = top && top.rows[i];
          return r ? (
            <li key={r.player} className={r.player === me ? "me" : ""}>
              <Sticker player={r.player} at={i + 1} sub={`${r.holes}/${top.holes} holes · ${vsPar(standingVs(r))}`} chain={chain} me={me} gnome={gnome} />
            </li>
          ) : (
            <li key={i} aria-hidden="true">
              <div className="sticker podium__ghost"><Frame className="sticker__face" /><Place at={i + 1} /><i /></div>
            </li>
          );
        })}
      </ol>
      {empty && <p className="real__fine podium__empty">Nobody yet: save a round on-chain to take the first place.</p>}
    </section>
  );
}

/** A place as a disc, in its metal for the first three; plain: a board row's
 *  place past them, the number alone. */
const Place = ({ at, plain = false }: { at: number; plain?: boolean }) =>
  <span className={plain && at > 3 ? "lb__rank" : `podium__medal${at <= 3 ? ` podium__medal--${at}` : ""}`}>{at}</span>;

/** A board's player as a sticker: their gnome flat (in their ghost's skin;
 *  yours, your gnome), their place, name and a line under it (sub); a tap
 *  races them (onClick), else it only shows. */
export function Sticker({ player, at, sub, chain, me, gnome, onClick }: { player: string; at: number; sub: string; chain: Chain | null; me?: string | null; gnome: string; onClick?: () => void }) {
  const { label } = useWho(chain, player, me), mine = player === me;
  const body = (<>
    <Face skin={mine ? gnomeById(gnome) : rivalSkin(player, gnome)} />
    <Place at={at} />
    <span className="sticker__who">{label}</span>
    <span className="sticker__sub">{sub}</span>
  </>);
  return onClick
    ? <button className="sticker" aria-label={`${mine ? "Race your best" : `Race ${label}'s ghost`}: #${at}, ${sub}`} onClick={onClick}>{body}</button>
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
