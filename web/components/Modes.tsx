"use client";

// The first choice, before the cups: play alone, race a player's ghost
// (ADR-004), or build a hole (the Builder, once out: onBuild). A duel asks whom to race on a screen
// of its own (Rival), then on which of the holes they have a best on (Ghosts),
// in place of the cups. Panels of their own, a kart game's modes.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Emblem, WORLDS } from "@/components/Worlds";
import { HoleMap, NoMap } from "@/components/HoleMap";
import { useGnomeStage } from "@/components/Stage";
import { gnomeById } from "@/lib/scene";
import { rivalSkin, type Act, type Skin } from "@/lib/scene/gnome";
import type { Snapshot } from "@/lib/engine";
import { FrontScreen } from "@/components/About";
import { Button, Dice, InfoTip } from "@/components/ui";
import { FullBoard, Sticker, useRivalPicks, useWho, type Placed } from "@/components/Leaderboard";
import { countWord, courseCount, ghostsWord, golfTerm, holeNumber, holesWord, plural, standingVs } from "@/components/common";
import { isAddress, type Chain } from "@/lib/chain";
import { CLASSIC, cupOf, parOf, scoreOf, vsPar, type Card } from "@/lib/card";
import { bestOf, inTurn, showcases, shotsOf, vsBest } from "@/lib/duel";
import { track, type RivalKind } from "@/lib/analytics";
import { motion } from "@/lib/scene/materials";
import { sound } from "@/lib/feel";
import type { HoleRow, HoleState, Mode, Stroke, Vec2 } from "@/lib/types";

// onBuild: the Builder's page (none: it is to come); shop: a fourth panel, the gnome shop's: its gnome (one of the
// wave's, once read: null until then), its line and where it leads (the gallery)
export default function Modes({ gnome, counts = {}, onSolo, onDuel, onBuild, shop, onBack, onAbout }: { gnome: string; counts?: Readonly<Record<string, number>>; onSolo: () => void; onDuel: () => void; onBuild?: () => void; shop?: { skin: Skin | null; line: string; onOpen: () => void }; onBack: () => void; onAbout: () => void }) {
  const skin = gnomeById(gnome);
  const cups = courseCount(counts).cups || CLASSIC.length; // (the chain's, once it has answered)
  return (
    <FrontScreen className="modes" back="Back to the title" onBack={onBack} onAbout={onAbout} eyebrow="Choose your game" title="How do we play?">
      <ul className={`modes__list${shop ? " modes__list--four" : ""}`}>
        <li><Panel kind="solo" name="Solo" line={`${countWord(cups)} cups, your best on the boards`} skin={skin} onClick={onSolo} /></li>
        <li><Panel kind="duel" name="Duel" line="Race a player's ghost, stroke for stroke" skin={skin} onClick={onDuel} /></li>
        {/* the Builder: the game's Miner in his hard hat over a hole's sketch, once out; to come, the sketch alone */}
        <li><Panel kind="build" name="Builder" line={onBuild ? "Draw a hole, publish it under your name" : "Draw your own hole, dare the others"} skin={onBuild ? gnomeById("miner") : null} back={<Emblem id="build" />} soon={!onBuild} onClick={onBuild} /></li>
        {/* the gnome shop ("Shop": one line, as the games' names): one of the wave's gnomes before a stall's awning */}
        {shop && <li><Panel kind="shop" name="Shop" line={shop.line} skin={shop.skin} back={<Awning />} onClick={shop.onOpen} /></li>}
      </ul>
    </FrontScreen>
  );
}

/** A game's panel, as a kart game's modes are: its colour edge to edge, the
 *  gnome's act in 3D (a duel's ghost taking turns with him) playing under the
 *  pointer or the focus only, its name inked big. One to come is drawn,
 *  dimmed, with its sticker (and no 3D of its own). */
// skin: the gnome on the stage (null: none yet, the stage's back alone); back: what stands behind him in the disc
function Panel({ kind, name, line, skin, soon = false, back, onClick }: { kind: "solo" | "duel" | "build" | "shop"; name: string; line: string; skin: Skin | null; soon?: boolean; back?: ReactNode; onClick?: () => void }) {
  const [hot, on] = useHot();
  return (
    <button className={`mode mode--${kind}`} disabled={soon} aria-label={`${name}: ${line}${soon ? ". Coming soon" : ""}`} {...on}
      onClick={() => (sound("select"), onClick && onClick())}>
      {skin ? <Stage skin={skin} act={kind} playing={hot}>{back}</Stage> : <span className="mode__stage">{back}</span>}
      <span className="mode__name">{name}</span>
      <span className="mode__line">{line}</span>
      {soon && <span className="dare mode__soon">Coming soon</span>}
    </button>
  );
}
/** A panel under the pointer or the focus (its gnome, its map play then only): whether, and the handlers that say so. */
function useHot() {
  const [hot, setHot] = useState(false);
  return [hot, { onPointerEnter: () => setHot(true), onPointerLeave: () => setHot(false), onFocus: () => setHot(true), onBlur: () => setHot(false) }] as const;
}
// children: what stands behind the gnome (the canvas is added after them, over them)
const Stage = ({ skin, act, playing, className = "mode__stage", children }: { skin: Skin; act: Act; playing: boolean; className?: string; children?: ReactNode }) =>
  <span ref={useGnomeStage<HTMLSpanElement>(skin, { act, playing })} className={className}>{children}</span>;

/** A market stall, inked, in the shop panel's colours (behind its gnome: what says "a shop"): its striped awning,
 *  every stripe and scallop painted, on two posts. */
const STRIPES = 8;
const Awning = () => {
  const top = (k: number) => 14 + k * (92 / STRIPES), low = (k: number) => 4 + k * (112 / STRIPES); // (the awning widens downward)
  const w = 112 / STRIPES, scallop = (k: number) => `M${low(k)} 30a${w / 2} ${w / 2.2} 0 0 0 ${w} 0z`;
  return (
    <svg className="mode__awning" viewBox="0 0 120 70" aria-hidden="true">
      <path d="M14 30v38M106 30v38" className="mode__awning-post" />
      {Array.from({ length: STRIPES }, (_, k) => (
        <g key={k} className={k % 2 ? "mode__awning-paper" : "mode__awning-band"}>
          <path d={`M${top(k)} 8H${top(k + 1)}L${low(k + 1)} 30H${low(k)}z`} />
          <path d={scallop(k)} />
        </g>
      ))}
      <path d={`M14 8H106L116 30H4z${Array.from({ length: STRIPES }, (_, k) => scallop(k).replace(/z$/, "")).join("")}`} className="mode__awning-ink" />
    </svg>
  );
};

/**
 * A duel's rival, on a screen of their own: a friend's name or address typed
 * (the (i) says where to find one), three picked for the player (today's
 * rival, one at their level, yourself: their gnome, and their best
 * hole played back on its map), or anyone on the course's board, a sticker a
 * tap away (the whole board, the leaderboard's sheet: onBoard). Then their
 * ghosts' holes (Ghosts).
 */
// onConnect: Adena's own prompt (no transaction), for yourself's pick; none once connected
export function Rival({ s, chain, me, mode, gnome, onPick, onBoard, onConnect, onBack, onAbout }: { s: Snapshot; chain: Chain | null; me: string | null; mode: Mode; gnome: string; onPick: (addr: string, bests?: Bests, from?: RivalKind) => void; onBoard: () => void; onConnect?: () => void; onBack: () => void; onAbout: () => void }) {
  const [typed, setTyped] = useState("");
  const [note, setNote] = useState("");
  // the course's holes, where a ghost can be
  const holes = useMemo(() => (s.allHoles || []).filter((h) => h.official).map((h) => ({ id: h.id, name: h.name, par: parOf(h) })), [s.allHoles]);
  const picks = useRivalPicks(chain, me, mode);
  const go = async (e: FormEvent) => {
    e.preventDefault();
    const v = typed.trim();
    // (a chain that did not answer is not a name it does not know)
    const addr = isAddress(v) ? v : chain ? await chain.resolveName(v).catch(() => null) : "";
    if (addr === null) return setNote("The chain did not answer. Try again in a moment.");
    track("ui", { action: "rival_typed", found: !!addr });
    if (!addr) return setNote(`No gno.land name “${v}” here. Check the spelling, or pick someone below.`);
    // a duel is played where their ghost is: someone with no saved round has none (a failed read lets them through)
    // (their bests go with them: not read twice)
    const bests = chain && holes.length ? await chain.bestsOf(holes.map((h) => h.id), addr).catch(() => undefined) : undefined;
    if (bests && !bests.size) return setNote(`${v} has no saved round yet: no ghost to race. Pick someone below.`);
    onPick(addr, bests, "friend");
  };
  return (
    <FrontScreen className="front--fit modes" inner="rival" back="Back to the games" onBack={onBack} onAbout={onAbout} eyebrow="Choose your rival" title="Who do we race?">
      {/* someone you know, typed, first; then three picked for you; then anyone on the board, in the one frame that scrolls */}
      <section className="rival__friend">
        <h3 className="rival__h">Race a friend</h3>
        <InfoTip label="How do I get it?" note="Their gno.land name or address. Ask them for it, or for their dare link: it opens the duel straight away, nothing to type." />
        <form className="friends__add" onSubmit={(e) => void go(e)}>
          <input value={typed} onChange={(e) => (setTyped(e.target.value), setNote(""))} placeholder="A friend: nym-… or g1…" aria-label="Your friend's gno.land name or address" />
          <Button variant="gold" className="rival__go" type="submit" disabled={!typed.trim()}>Race</Button>
        </form>
        {note && <p className="note note--warn">{note}</p>}
      </section>
      {picks && picks.retry && <p className="note note--bad">The chain did not answer. <button className="linkish" onClick={picks.retry}>Try again</button></p>}
      <ul className="rival__picks">
        {PICKS.map((p, i) => (
          <li key={p.kind}><Pick {...p} first={i} row={picks && picks.rows[i]} reading={!picks} failed={!!(picks && picks.retry)} chain={chain} me={me} gnome={gnome} holes={holes} mode={mode} onPick={onPick} onConnect={p.kind === "self" ? onConnect : undefined} /></li>
        ))}
      </ul>
      {/* the board as stickers; the whole of it, the leaderboard's sheet (its rows, a Race each) */}
      {/* (a board with nobody keeps its blank stickers and says so: nothing moves once it is read) */}
      <section className="rival__board">
        <div className="rival__boardhead">
          <h3 className="rival__h">Or anyone who played</h3>
          <span className="rival__links">
            {/* (there, not pressable, while the board is read or has nobody: the links beside it do not move) */}
            {(!picks || !picks.rows[0] || picks.surprise) && <button className="linkish rival__all rival__surprise" disabled={!picks?.surprise} onClick={() => picks?.surprise && (sound("select"), onPick(picks.surprise.player, undefined, "surprise"))}><Dice /> Surprise me</button>}
            <button className="linkish rival__all" onClick={() => (sound("blip"), onBoard())}>All players →</button>
          </span>
        </div>
        <FullBoard kind="course" s={s} chain={chain} me={me} mode={mode} max={8} onConnect={onConnect}
          row={(r) => <Sticker player={r.player} sub={`${holesWord(r.holes || 0)} · ${vsPar(standingVs(r))}`} chain={chain} me={me} gnome={gnome} onClick={() => onPick(r.player)} />} />
      </section>
    </FrontScreen>
  );
}

type Bests = ReadonlyMap<string, Readonly<Record<Mode, number>>>;
type Hole = { id: string; name: string; par: number };
const MAP_MS = 3200; // a map's drawing of the path, as its CSS animation (title.css map-ink): the next hole then
// each in a colour of the game's own: today's rival the sun's, your level the fairway's, yourself the mountain's
const PICKS = [
  { kind: "today", label: "Today's rival", tint: "mode--build" },
  { kind: "level", label: "Your level", tint: "mode--solo" },
  { kind: "self", label: "Yourself", tint: "tint--mountain" },
] as const;

/** A hole's map and a rival's best on it, their ghost's path (the strokes the
 *  duel replays, read the same way). */
type Mapped = { hole: HoleState; path: Vec2[]; strokes: number };
// read once a session a rival's hole (and mode), a few at a time (a screen of
// cards is dozens of calls); a read that failed is asked again next time
const maps = new Map<string, Promise<Mapped | null>>(), mapTurn = inTurn(3);
// a hole's state, read once a session for every ghost on it (two picks often
// show the same hole): its map is its lanes, which its version id fixes
const states = new Map<string, Promise<HoleState>>();
function stateOf(chain: Chain, id: string) {
  let p = states.get(id);
  if (!p) states.set(id, (p = chain.state(id))), p.catch(() => states.delete(id));
  return p;
}
function mapOf(chain: Chain, player: string, id: string, mode: Mode, strokes: number) {
  const key = `${player}|${id}|${mode}|${strokes}`; // (a new best: its own path)
  let p = maps.get(key);
  if (p) return p;
  p = mapTurn(() => chain.ghost(id, mode, player).then(async (g) => {
    if (!g) return null;
    const shots = shotsOf(g), hole = await stateOf(chain, g.hole);
    let at: Stroke = await chain.replayRound(g.hole, [shots[0]], g.period);
    const path = [...at.path];
    for (let n = 1; n < shots.length && !at.holed; n++) path.push(...(at = await chain.simulateFrom(g.hole, at.rest, shots[n], n, g.period)).path);
    return { hole, path, strokes: g.strokes };
  }));
  maps.set(key, p);
  p.catch(() => maps.delete(key));
  return p;
}

/** A rival's bests, and their finest holes shown off (three at most), mapped. */
type Shown = Mapped & { name: string; par: number };
interface Show {
  bests: Bests;
  maps: Shown[];
}
// read once a session a player (and mode); a read that failed is asked again next time
const shows = new Map<string, Promise<Show>>();
function showOf(chain: Chain, player: string, holes: readonly Hole[], mode: Mode) {
  const key = `${player}|${mode}`;
  let p = shows.get(key);
  if (p) return p;
  p = chain.bestsOf(holes.map((h) => h.id), player).then(async (bests) => {
    // (the tile works without its maps: one that fails to read is left out)
    const shown = await Promise.all(showcases(bests, holes, mode).map((top) => mapOf(chain, player, top.id, top.mode, top.strokes)
      .then((m) => m && { ...m, name: holes.find((h) => h.id === top.id)!.name, par: top.par }, () => null)));
    return { bests, maps: shown.filter((m): m is Shown => !!m) };
  });
  shows.set(key, p);
  p.catch(() => shows.delete(key));
  return p;
}
function useShow(chain: Chain | null, player: string, holes: readonly Hole[], mode: Mode) {
  const [show, setShow] = useState<Show | null>(null);
  useEffect(() => {
    setShow(null);
    if (!chain || !player || !holes.length) return;
    let live = true;
    showOf(chain, player, holes, mode).then((x) => live && setShow(x), () => {});
    return () => void (live = false);
  }, [chain, player, holes, mode]);
  return show;
}

/** A quick pick, a game's panel as the game's choice's: the rival's gnome in
 *  3D (in the skin their ghost wears), their best hole played back on its map,
 *  both under the pointer or the focus only; their name, and Race. */
// failed: the board could not be read (not a board with nobody on it)
function Pick({ kind, label, tint, first, row, reading, failed, chain, me, gnome, holes, mode, onPick, onConnect }: (typeof PICKS)[number] & { first: number; row: Placed | null; reading: boolean; failed: boolean; chain: Chain | null; me: string | null; gnome: string; holes: readonly Hole[]; mode: Mode; onPick: (addr: string, bests?: Bests, from?: RivalKind) => void; onConnect?: () => void }) {
  const [hot, on] = useHot();
  const player = row ? row.player : "";
  const who = useWho(chain, player, me), show = useShow(chain, player, holes, mode);
  // their holes in turn under the pointer, one a drawing of the path (each tile from its own: two rarely open on one hole)
  const [turn, setTurn] = useState(first);
  useEffect(() => {
    if (!hot || !motion) return;
    const t = setInterval(() => setTurn((n) => n + 1), MAP_MS);
    return () => clearInterval(t);
  }, [hot]);
  const map = show && show.maps.length ? show.maps[turn % show.maps.length] : null;
  const best = map && `${map.strokes === 1 ? "Ace" : golfTerm(map.strokes, map.par).replace(/!$/, "")} on ${map.name}`;
  // yourself: not connected, or no ghost of yours yet (a round to save first)
  const none = kind === "self" && (!me || (!!show && show.bests.size === 0)), open = !!row && !none;
  const connect = kind === "self" && !me && onConnect; // (a tap connects: then it is yours)
  // (each part whole: the narrow line breaks only at a " · ", never inside "18 ghosts")
  const line = kind === "self" && !me ? (onConnect ? "Beat your own best" : "Connect Adena to race it") : none ? "Save a round first" : row ? [holesWord(row.holes || 0), !!row.holes && vsPar(standingVs(row)), show && ghostsWord(show.bests.size)].filter(Boolean).map((p) => String(p).replace(/ /g, "\u00a0")).join(" · ") : "";
  return (
    <button className={`mode rival__pick ${tint}`} data-kind={connect ? "self_connect" : kind} disabled={!open && !connect} aria-label={connect ? `${label}: connect Adena to race your own ghost` : open ? `${label}: ${who.label}, ${line}${best ? `, ${best}` : ""}. ${kind === "self" ? "Race your best" : "Race their ghost"}` : `${label}: ${reading ? "reading the board" : failed ? "the board could not be read" : line || "nobody yet"}`} {...on}
      onClick={() => (connect ? (sound("select"), connect()) : open && row && onPick(row.player, show ? show.bests : undefined, kind))}>
      <span className="tag rival__tag">
        {kind === "self"
          ? <span className="podium__medal rival__you"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 20v-8a6 6 0 0 1 12 0v8l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5zM10 11v1M14 11v1" /></svg></span>
          : null /* (no place said: a rival to race, not a rank) */}
        {label}
      </span>
      {/* (yourself: your own gnome, connected or not) */}
      {row || kind === "self" ? <Stage className="rival__stage" skin={kind === "self" ? gnomeById(gnome) : rivalSkin(row!.player, gnome)} act="hop" playing={hot} /> : <span className="rival__stage" />}
      <span className="rival__show">
        {map ? <HoleMap key={map.name} {...map} /> : <NoMap />}
        {/* (its room kept when there is none: the circles the same size in every pick) */}
        <span className="rival__best" hidden={!best} aria-hidden={!best}>{best || "\u00a0"}</span>
      </span>
      <span className="rival__name">{row ? who.label : kind === "self" ? "Your ghost" : reading ? "…" : failed ? "Not read" : "Nobody yet"}</span>
      <span className="rival__line">{line}</span>
      <span className="rival__go" hidden={!(open || connect)}>{connect ? "Connect" : "Race"}</span>
    </button>
  );
}

/**
 * A duel's holes, in place of the cups: each one the rival has a best on, a
 * card in its cup's band, their best (the one raced: the aim mode's, else the
 * other) big over the card's own, their path on the hole's map, and a Race
 * into it. A read that failed leaves the cups.
 */
export function Ghosts({ holes, name, player, chain, bests, card, mode, onRace, onCups, onBack, onAbout }: {
  holes: readonly HoleRow[];
  name: string;
  /** the rival's address, and the chain their maps are read on */
  player: string;
  chain: Chain | null;
  /** their bests by hole: undefined while read, null if the read failed */
  bests: Bests | null | undefined;
  card: Card;
  mode: Mode;
  onRace: (hole: string) => void;
  onCups: () => void;
  onBack: () => void;
  onAbout: () => void;
}) {
  return (
    <FrontScreen className="front--fit modes" inner="rival" back="Back to the rivals" onBack={onBack} onAbout={onAbout} eyebrow="Choose your hole" title="Their ghosts" dare={<><p className="dare">Racing {name}</p>{chain && isAddress(player) && <a className="real__fine" href={chain.userURL(player)} target="_blank" rel="noopener noreferrer">Player page on gno.land ↗</a>}</>}>
      {/* while read: a band of blank cards, in the frame's place */}
      {bests === undefined && (
        <div className="ghosts__list">
          <section className="ghosts__cup">
            <h3 className="ghosts__name">Reading their ghosts…</h3>
            <ul className="ghosts__holes" aria-hidden="true">{[0, 1, 2, 3].map((i) => <li key={i}><span className="ghost podium__ghost"><NoMap /><i /><i /></span></li>)}</ul>
          </section>
        </div>
      )}
      {(bests === null || (bests && !bests.size)) && (
        <section className="ghosts__none">
          <p className="note note--warn">{bests ? `${name} has no saved round on the course yet.` : "Their ghosts could not be read. Their best waits on each hole they saved a round on."}</p>
          <Button variant="primary" onClick={() => (sound("select"), onCups())}>To the cups</Button>
        </section>
      )}
      {/* in a frame of its own, as a board: it scrolls under its fades, each cup's name held at its top, the screen stays put */}
      {bests && bests.size > 0 && <div className="ghosts__list">{WORLDS.map((w) => {
        const cup = holes.filter((h) => cupOf(h) === w.id), theirs = cup.filter((h) => bests.has(h.id));
        return theirs.length > 0 && (
          <section key={w.id} className={`ghosts__cup tint--${w.id}`}>
            <h3 className="ghosts__name"><Emblem id={w.id} />{w.name}</h3>
            <ul className="ghosts__holes">
              {theirs.map((h) => (
                <li key={h.id}><HoleCard id={h.id} name={h.name} num={holeNumber(cup, h.id)} par={parOf(h)} best={bestOf(bests.get(h.id), mode)!} mine={scoreOf(card, h)} chain={chain} player={player} onRace={onRace} /></li>
              ))}
            </ul>
          </section>
        );
      })}</div>}
    </FrontScreen>
  );
}

/** A hole of theirs as a card: its number (the menu's, the HUD's) and name,
 *  its map with its par on a ribbon (read once the card scrolls into view: it
 *  works without), their path drawn on it under the pointer; their best big,
 *  yours against it on one line (marked when you beat them); a tap races. */
function HoleCard({ id, name, num, par, best, mine, chain, player, onRace }: { id: string; name: string; num: string; par: number; best: { mode: Mode; strokes: number }; mine: number | undefined; chain: Chain | null; player: string; onRace: (hole: string) => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [map, setMap] = useState<Mapped | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !chain || !player || typeof IntersectionObserver === "undefined") return;
    let live = true;
    // (a card or so ahead of the frame's edge, so its map is there as it comes in)
    const o = new IntersectionObserver((es) => {
      if (!es.some((e) => e.isIntersecting)) return;
      o.disconnect();
      mapOf(chain, player, id, best.mode, best.strokes).then((m) => live && setMap(m), () => {});
    }, { root: el.closest(".ghosts__list"), rootMargin: "240px 0px" });
    o.observe(el);
    return () => ((live = false), o.disconnect());
  }, [chain, player, id, best.mode, best.strokes]);
  const n = best.strokes, you = vsBest(mine, n);
  const said = { none: "not played by you yet", over: `you ${mine}, ${you.gap} over their best`, tie: `you ${mine}, level with them`, won: `you ${mine}: you beat them` }[you.kind];
  return (
    <button ref={ref} className="ghost" aria-label={`Hole ${num}, ${name}, par ${par}: their best ${n}${best.mode === "pro" ? " in pro" : ""}, ${said}. Race it`}
      onClick={() => (sound("select"), onRace(id))}>
      <span className="ghost__head"><span className="tile__num">{num}</span><span className="ghost__name">{name}</span></span>
      <span className="rival__show">
        {map ? <HoleMap {...map} /> : <NoMap />}
        <span className="rival__best">Par {par}</span>
      </span>
      <span className="ghost__label">Their best</span>
      <span className="ghost__best"><strong>{n}</strong> {plural("stroke", n)}{best.mode === "pro" && <em className="pro-chip pro-chip--row">PRO</em>}</span>
      <span className={`ghost__you ghost__you--${you.kind}`}>
        {you.kind === "none" ? "Not played yet" : you.kind === "won" ? `✓ You beat them: ${mine}` : <>You <b>{mine}</b> · {you.kind === "over" ? <b className="bad">+{you.gap}</b> : "tied"}</>}
      </span>
      <span className="rival__go">Race</span>
    </button>
  );
}

/** The game chosen, said big in the top-left corner beside Back (the rival's
 *  screen, their ghosts, the cups, the picker), in its panel's colour. */
export const ModeTag = ({ kind }: { kind: "solo" | "duel" }) => <span className={`modetag mode--${kind}`}>{kind === "duel" ? "Duel" : "Solo"}</span>;
