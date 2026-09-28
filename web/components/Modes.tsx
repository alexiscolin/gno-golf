"use client";

// The first choice, before the cups: play alone, race a player's ghost
// (ADR-004), or, to come, build a hole. A duel asks whom to race on a screen
// of its own (Rival), then on which of the holes they have a best on (Ghosts),
// in place of the cups. Panels of their own, a kart game's modes.
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Emblem, EXTRAS, WORLDS } from "@/components/Worlds";
import { useGnomeStage } from "@/components/Stage";
import { gnomeById } from "@/lib/scene";
import { rivalSkin, type Act, type Skin } from "@/lib/scene/gnome";
import type { Snapshot } from "@/lib/engine";
import { AboutButton, BackButton } from "@/components/About";
import { Button, Segmented } from "@/components/ui";
import { FullBoard, useRivalPicks, useWho, type Placed } from "@/components/Leaderboard";
import { ghostsWord, golfTerm, holeNumber, holesWord } from "@/components/common";
import { isAddress, type Chain } from "@/lib/chain";
import { cupOf, parOf, scoreOf, type Card } from "@/lib/card";
import { bestOf, inTurn, mapView, pathD, railRuns, showcases, shotsOf } from "@/lib/duel";
import { BALL_R, CUP_R } from "@/lib/terrain";
import { motion } from "@/lib/scene/materials";
import { sound } from "@/lib/feel";
import type { HoleRow, HoleState, Mode, Stroke, Vec2 } from "@/lib/types";

export default function Modes({ gnome, onSolo, onDuel, onBack, onAbout }: { gnome: string; onSolo: () => void; onDuel: () => void; onBack: () => void; onAbout: () => void }) {
  const skin = gnomeById(gnome);
  return (
    <div className="screen worlds front modes tint--garden">
      <BackButton label="Back to the title" onClick={() => (sound("blip"), onBack())} />
      <AboutButton onClick={onAbout} />
      <div className="worlds__in">
        <div className="front__head">
          <span className="eyebrow">Choose your game</span>
          <h2 className="worlds__title">How do we play?</h2>
        </div>
        <ul className="modes__list">
          <li><Panel kind="solo" name="Solo" line="Four cups, your best on the boards" skin={skin} onClick={onSolo} /></li>
          <li><Panel kind="duel" name="Duel" line="Race a player's ghost, stroke for stroke" skin={skin} onClick={onDuel} /></li>
          <li><Panel kind="build" name="Builder" line="Draw your own hole, dare the others" skin={skin} soon /></li>
        </ul>
      </div>
    </div>
  );
}

/** A game's panel, as a kart game's modes are: its colour edge to edge, the
 *  gnome's act in 3D (a duel's ghost taking turns with him) playing under the
 *  pointer or the focus only, its name inked big. One to come is drawn,
 *  dimmed, with its sticker (and no 3D of its own). */
function Panel({ kind, name, line, skin, soon = false, onClick }: { kind: "solo" | "duel" | "build"; name: string; line: string; skin: Skin; soon?: boolean; onClick?: () => void }) {
  const [hot, setHot] = useState(false);
  return (
    <button className={`mode mode--${kind}`} disabled={soon} aria-label={`${name}: ${line}${soon ? ". Coming soon" : ""}`}
      onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)} onFocus={() => setHot(true)} onBlur={() => setHot(false)}
      onClick={() => (sound("select"), onClick && onClick())}>
      {kind === "build" ? <span className="mode__stage"><Emblem id="build" /></span> : <Stage skin={skin} act={kind} playing={hot} />}
      <span className="mode__name">{name}</span>
      <span className="mode__line">{line}</span>
      {soon && <span className="dare mode__soon">Coming soon</span>}
    </button>
  );
}
const Stage = ({ skin, act, playing, className = "mode__stage" }: { skin: Skin; act: Act; playing: boolean; className?: string }) => <span ref={useGnomeStage<HTMLSpanElement>(skin, { act, playing })} className={className} />;

/**
 * A duel's rival, on a screen of their own: a friend's name or address typed
 * (the (i) says where to find one), three picked for the player (the
 * champion, one at their level, one at random: their gnome, and their best
 * hole played back on its map), or anyone on the course's board, a sticker a
 * tap away. Then their ghosts' holes (Ghosts).
 */
export function Rival({ s, chain, me, mode, gnome, onPick, onBack, onAbout }: { s: Snapshot; chain: Chain | null; me: string | null; mode: Mode; gnome: string; onPick: (addr: string, bests?: Bests) => void; onBack: () => void; onAbout: () => void }) {
  const [typed, setTyped] = useState("");
  const [asList, setAsList] = useState(false); // the board as the full board, not stickers
  const [note, setNote] = useState("");
  const [why, setWhy] = useState(false);
  const popId = useId();
  // the course's holes, where a ghost can be
  const holes = useMemo(() => (s.allHoles || []).filter((h) => h.official).map((h) => ({ id: h.id, name: h.name, par: parOf(h) })), [s.allHoles]);
  const picks = useRivalPicks(chain, me, mode);
  const go = async (e: FormEvent) => {
    e.preventDefault();
    const v = typed.trim();
    const addr = isAddress(v) ? v : chain ? await chain.resolveName(v).catch(() => "") : "";
    if (!addr) return setNote(`No gno.land name “${v}” here. Check the spelling, or pick someone below.`);
    // a duel is played where their ghost is: someone with no saved round has none (a failed read lets them through)
    // (their bests go with them: not read twice)
    const bests = chain && holes.length ? await chain.bestsOf(holes.map((h) => h.id), addr).catch(() => undefined) : undefined;
    if (bests && !bests.size) return setNote(`${v} has no saved round yet: no ghost to race. Pick someone below.`);
    onPick(addr, bests);
  };
  return (
    <div className="screen worlds front modes tint--garden">
      <BackButton label="Back to the games" onClick={() => (sound("blip"), onBack())} />
      <AboutButton onClick={onAbout} />
      <div className="worlds__in rival">
        <div className="front__head">
          <span className="eyebrow">Choose your rival</span>
          <h2 className="worlds__title">Who do we race?</h2>
          <p className="dare">Their best round, as a ghost. Beat it!</p>
        </div>
        {/* someone you know, typed, first; then three picked for you; then anyone on the board */}
        <section className="rival__friend">
          <h3>
            Race a friend
            <button type="button" className="aimset__info" aria-expanded={why} aria-describedby={why ? popId : undefined} aria-label="How do I get it?" onClick={() => setWhy((v) => !v)} onBlur={() => setWhy(false)}>ⓘ</button>
            {why && <span id={popId} className="aimset__pop" role="note">Their gno.land name or address. Ask them for it, or for their dare link: it opens the duel straight away, nothing to type.</span>}
          </h3>
          <form className="friends__add" onSubmit={(e) => void go(e)}>
            <input value={typed} onChange={(e) => (setTyped(e.target.value), setNote(""))} placeholder="nym-ace123 or g1…" aria-label="Your friend's gno.land name or address" />
            <Button variant="primary" type="submit" disabled={!typed.trim()}>Race</Button>
          </form>
        </section>
        {note && <p className="note note--warn rival__note">{note}</p>}
        <ul className="rival__picks">
          {PICKS.map((p, i) => (
            <li key={p.kind}><Pick {...p} row={picks && picks[i]} reading={!picks} chain={chain} me={me} gnome={gnome} holes={holes} mode={mode} onPick={onPick} /></li>
          ))}
        </ul>
        {/* the board as stickers */}
        {/* the board as stickers, or as the full board with its rows (the leaderboards' own) */}
        <section className={"rival__way rival__board" + (asList ? "" : " rival__board--cards")}>
          <div className="rival__boardhead">
            <h3 className="about__h">Or anyone on the board</h3>
            <Segmented label="Show the board as" value={asList ? "list" : "cards"} options={[["cards", "Cards"], ["list", "List"]]} onChange={(v) => (sound("blip"), setAsList(v === "list"))} />
          </div>
          <FullBoard kind="course" s={s} chain={chain} me={me} mode={mode} onRace={onPick}
            row={asList ? undefined : (r) => <Sticker row={r} chain={chain} me={me} gnome={gnome} onPick={onPick} />} />
        </section>
      </div>
    </div>
  );
}

type Bests = ReadonlyMap<string, Readonly<Record<Mode, number>>>;
type Hole = { id: string; name: string; par: number };
const MAP_MS = 3200; // a map's drawing of the path, as its CSS animation (title.css map-ink): the next hole then
const PICKS = [
  { kind: "champ", label: "The champion" },
  { kind: "level", label: "Your level" },
  { kind: "any", label: "Surprise me" },
] as const;

/** A hole's map and a rival's best on it, their ghost's path (the strokes the
 *  duel replays, read the same way). */
type Mapped = { hole: HoleState; path: Vec2[]; strokes: number };
// read once a session a rival's hole (and mode), a few at a time (a screen of
// cards is dozens of calls); a read that failed is asked again next time
const maps = new Map<string, Promise<Mapped | null>>(), mapTurn = inTurn(3);
function mapOf(chain: Chain, player: string, id: string, mode: Mode, strokes: number) {
  const key = `${player}|${id}|${mode}|${strokes}`; // (a new best: its own path)
  let p = maps.get(key);
  if (p) return p;
  p = mapTurn(() => chain.ghost(id, mode, player).then(async (g) => {
    if (!g) return null;
    const shots = shotsOf(g), hole = await chain.state(g.hole);
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
function Pick({ kind, label, row, reading, chain, me, gnome, holes, mode, onPick }: { kind: (typeof PICKS)[number]["kind"]; label: string; row: Placed | null; reading: boolean; chain: Chain | null; me: string | null; gnome: string; holes: readonly Hole[]; mode: Mode; onPick: (addr: string, bests?: Bests) => void }) {
  const [hot, setHot] = useState(false);
  const player = row ? row.player : "";
  const who = useWho(chain, player, me), show = useShow(chain, player, holes, mode);
  // their holes in turn under the pointer, one a drawing of the path (a random one first)
  const [turn, setTurn] = useState(() => Math.floor(Math.random() * 3));
  useEffect(() => {
    if (!hot || !motion) return;
    const t = setInterval(() => setTurn((n) => n + 1), MAP_MS);
    return () => clearInterval(t);
  }, [hot]);
  const map = show && show.maps.length ? show.maps[turn % show.maps.length] : null;
  const best = map && `${map.strokes === 1 ? "Ace" : golfTerm(map.strokes, map.par).replace(/!$/, "")} on ${map.name}`;
  const line = row ? [holesWord(row.holes || 0), show && ghostsWord(show.bests.size)].filter(Boolean).join(" · ") : "";
  return (
    <button className={`mode rival__pick rival__pick--${kind}`} disabled={!row} aria-label={row ? `${label}: ${who.label}, ${line}${best ? `, ${best}` : ""}. Race their ghost` : `${label}: ${reading ? "reading the board" : "nobody yet"}`}
      onPointerEnter={() => setHot(true)} onPointerLeave={() => setHot(false)} onFocus={() => setHot(true)} onBlur={() => setHot(false)}
      onClick={() => row && onPick(row.player, show ? show.bests : undefined)}>
      <span className="rival__tag">{kind === "any" ? <Dice /> : <span className={`podium__medal${row && row.at <= 3 ? ` podium__medal--${row.at}` : ""}`}>{row ? row.at : "?"}</span>}{label}</span>
      {row ? <Stage className="rival__stage" skin={rivalSkin(row.player, gnome)} act="hop" playing={hot} /> : <span className="rival__stage" />}
      <span className="rival__show">
        {map ? <HoleMap key={map.name} {...map} /> : <NoMap />}
        {best && <span className="rival__best">{best}</span>}
      </span>
      <span className="rival__name">{row ? who.label : reading ? "…" : "Nobody yet"}</span>
      <span className="rival__line">{line}</span>
      {row && <span className="rival__go">Race</span>}
    </button>
  );
}

/** A rival's best hole from above, in a round window as a cup's diorama: its
 *  walls, posts, water and sand, the tee and the cup, and their ghost's path on
 *  it in ink, drawn again, the ball rolling along it, under the pointer (CSS). */
function HoleMap({ hole, path }: { hole: HoleState; path: readonly Vec2[] }) {
  const clip = useId(), { at, k } = mapView([hole.start, hole.cup, ...path], hole), line = pathD(path, at);
  const [cx, cy] = at(hole.cup), [tx, ty] = at(hole.start);
  const walls = railRuns(hole.walls).map((run) => pathD(run, at)).join("");
  const zones = hole.zones.filter((z) => z.skin === "water" || z.skin === "sand");
  return (
    <svg viewBox="0 0 120 120" className="rival__map" aria-hidden="true">
      <defs><clipPath id={clip}><circle cx="60" cy="60" r="56" /></clipPath></defs>
      <g clipPath={`url(#${clip})`}>
        <rect width="120" height="120" className="map__turf" />
        {zones.map((z, i) => {
          const [x0, y0] = at(z.min), [x1, y1] = at(z.max), box = { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
          return <rect key={i} {...box} rx={z.round ? box.width / 2 : 2} ry={z.round ? box.height / 2 : 2} className={`map__${z.skin}`} />;
        })}
        {/* the rails: inked, paper on top */}
        {["map__walls", "map__rails"].map((c) => <path key={c} d={walls} className={c} />)}
        {hole.posts.map((p, i) => <circle key={i} cx={at(p.c)[0]} cy={at(p.c)[1]} r={Math.max(p.r * k, 1.5)} className="map__post" />)}
        <circle cx={tx} cy={ty} r="2.6" className="map__tee" />
        <circle cx={cx} cy={cy} r={Math.max(CUP_R * k, 2.5)} className="map__cup" />
        <path d={line} pathLength={100} className="map__line" />
        <circle r={Math.max(BALL_R * k, 2.4)} className="map__ball" style={{ offsetPath: `path("${line}")` }} />
        <path d={`M${cx} ${cy}V${cy - 16}`} className="w__pole" />
        <path d={`M${cx} ${cy - 16}l10 3.5l-10 3.5z`} className="w__flag" />
      </g>
      <circle cx="60" cy="60" r="56" className="w__ring" />
    </svg>
  );
}

/** A map's window, empty: while it reads, or without one. */
const NoMap = () => <svg viewBox="0 0 120 120" className="rival__map" aria-hidden="true"><circle cx="60" cy="60" r="56" className="map__turf w__ring" /></svg>;

/** A board's player as a sticker: their gnome flat (their ghost's skin), their
 *  place, name and holes; a tap races them. */
function Sticker({ row, chain, me, gnome, onPick }: { row: Placed; chain: Chain | null; me: string | null; gnome: string; onPick: (addr: string) => void }) {
  const { label } = useWho(chain, row.player, me), mine = row.player === me;
  return (
    <button className="sticker" aria-label={`${mine ? "Race your best" : `Race ${label}'s ghost`}: #${row.at}, ${holesWord(row.holes || 0)}`} onClick={() => onPick(row.player)}>
      <Face skin={mine ? gnomeById(gnome) : rivalSkin(row.player, gnome)} />
      <span className="lb__rank">{row.at}</span>
      <span className="sticker__who">{label}</span>
      <span className="sticker__holes">{holesWord(row.holes || 0)}</span>
    </button>
  );
}
const hex = (c: number) => `#${c.toString(16).padStart(6, "0")}`;
/** A gnome's face, flat and inked (the site's icon's), on a disc in his hat's colour, lighter. */
const Face = ({ skin }: { skin: Skin }) => (
  <svg viewBox="0 0 120 120" className="sticker__face" aria-hidden="true">
    <circle cx="60" cy="60" r="56" style={{ fill: `color-mix(in srgb, ${hex(skin.hat)} 45%, var(--paper))` }} className="w__ring" />
    <g transform="translate(10 7) scale(.5)" stroke="var(--ink)" strokeWidth="10" strokeLinejoin="round">
      {skin.beard !== "none" && skin.beard !== "moustache" && <path d="M 40 116 Q 34 190 100 214 Q 166 190 160 116 Q 140 146 100 142 Q 60 146 40 116 Z" fill={hex(skin.hair ?? 0xffffff)} />}
      <rect x="40" y="100" width="120" height="44" rx="6" fill="var(--paper)" />
      <path d="M 28 95 Q 40 91 48.7 76 L 96.5 7 Q 100 -1.5 103.5 7 L 151.3 76 Q 160 91 172 95 Z" fill={hex(skin.hat)} />
      <rect x="26" y="90" width="148" height="20" rx="10" fill={hex(skin.hat)} />
      <circle cx="80" cy="124" r="6" fill="var(--ink)" /><circle cx="120" cy="124" r="6" fill="var(--ink)" />
      <circle cx="100" cy="136" r="10" fill="#f2b8b0" strokeWidth="6" />
    </g>
  </svg>
);
/** A die, inked: the pick at random. */
const Dice = () => (
  <svg viewBox="0 0 24 24" className="rival__dice" aria-hidden="true">
    <rect x="2" y="2" width="20" height="20" rx="5" />
    {[[7.5, 7.5], [16.5, 7.5], [12, 12], [7.5, 16.5], [16.5, 16.5]].map(([x, y]) => <circle key={x * 99 + y} cx={x} cy={y} r="2" />)}
  </svg>
);

// the cups, then the holes in none (ranked on the course all the same)
const GROUPS = [...WORLDS, EXTRAS];
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
    <div className="screen worlds front modes tint--garden">
      <BackButton label="Back to the rivals" onClick={() => (sound("blip"), onBack())} />
      <AboutButton onClick={onAbout} />
      <div className="worlds__in rival">
        <div className="front__head">
          <span className="eyebrow">Choose your hole</span>
          <h2 className="worlds__title">Their ghosts</h2>
          <p className="dare">Racing {name}&apos;s ghost</p>
        </div>
        {bests === undefined && <p className="lb__empty">Reading their ghosts…</p>}
        {(bests === null || (bests && !bests.size)) && (
          <section className="rival__way">
            <p className="note note--warn">{bests ? `${name} has no saved round on the course yet.` : "Their ghosts could not be read. Their best waits on each hole they saved a round on."}</p>
            <Button variant="primary" onClick={() => (sound("select"), onCups())}>To the cups</Button>
          </section>
        )}
        {bests && bests.size > 0 && <p className="drawer__note rival__way">Their best on each hole, to beat; yours from your card under it.</p>}
        {/* in a frame of its own, as a board: it scrolls under its fade, the screen stays put */}
        {bests && bests.size > 0 && <div className="ghosts__list">{GROUPS.map((w) => {
          const cup = holes.filter((h) => cupOf(h) === w.id), theirs = cup.filter((h) => bests.has(h.id));
          return theirs.length > 0 && (
            <section key={w.id} className={`ghosts__cup ${w.id === EXTRAS.id ? "ghosts__cup--extras" : `tint--${w.id}`}`}>
              <h3 className="ghosts__name">{w.id !== EXTRAS.id && <Emblem id={w.id} />}{w.name}</h3>
              <ul className="ghosts__holes">
                {theirs.map((h) => (
                  <li key={h.id}><HoleCard id={h.id} name={h.name} num={holeNumber(cup, h.id)} par={parOf(h)} best={bestOf(bests.get(h.id), mode)!} mine={scoreOf(card, h)} chain={chain} player={player} onRace={onRace} /></li>
                ))}
              </ul>
            </section>
          );
        })}</div>}
      </div>
    </div>
  );
}

/** A hole of theirs as a card: its map, read once the card scrolls into view
 *  (it works without), their path drawn on it under the pointer; its number
 *  and name, their best big, par and yours (marked when you beat them); a tap races. */
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
  }, [chain, player, id, best.mode]);
  const n = best.strokes, won = !!mine && mine < n;
  return (
    <button ref={ref} className="ghost" aria-label={`Hole ${num}, ${name}: their ${n}${best.mode === "pro" ? " in pro" : ""}, par ${par}${mine ? `, you ${mine}${won ? ", beaten" : ""}` : ""}. Race it`}
      onClick={() => (sound("select"), onRace(id))}>
      <span className="lb__rank">{num}</span>
      {map ? <HoleMap {...map} /> : <NoMap />}
      <span className="ghost__name">{name}</span>
      <span className="ghost__best"><strong>{n}</strong> stroke{n === 1 ? "" : "s"}{best.mode === "pro" && <em className="pro-chip pro-chip--row">PRO</em>}</span>
      <span className="ghost__par">par {par}{mine ? <span className={"ghost__you" + (won ? " ghost__you--won" : "")}>{won ? "✓ you " : "you "}{mine}</span> : null}</span>
      <span className="rival__go">Race</span>
    </button>
  );
}

/** The game chosen, said big in the top-left corner beside Back (the rival's
 *  screen, their ghosts, the cups, the picker), in its panel's colour. */
export const ModeTag = ({ kind }: { kind: "solo" | "duel" }) => <span className={`modetag mode--${kind}`}>{kind === "duel" ? "Duel" : "Solo"}</span>;
