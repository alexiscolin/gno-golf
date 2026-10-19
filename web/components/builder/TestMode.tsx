"use client";

// Play (the GUI spec's B3; the hole-builder design's "Test mode and par"),
// over the editor: the game itself (lib/engine, as the page plays a hole) on
// the draft's hole, served by builder.wasm at one clock (localchain.ts), in
// one period of each weather that moves the ball. With the author's address
// known, every round is a try at the next weather not holed: when the ball
// drops, the round is replayed as its save would be cut (proof.ts replay):
// that, not the live play, is the proof. The hole's id is fixed first (the
// author's address, the slug, the next version): its weather hangs on it.
// It opens on the first weather not holed (the others holed already, their
// rounds replayed by the editor: carry.ts), named by a title card a moment
// ("Round 1 of 3: Clear"); each one holed, its shots are replayed in the
// weathers left (carry.ts holdsToo: one it holes in is proved by that
// replay, not played), its chip stamped and the next starts on its own
// under its title card; a chip pressed plays that weather next. The last
// ends on one card, the game's hole-finished card, with each weather's
// strokes and time and Publish (testmode.ts summary); a round that does not
// count gets that card with why (finished). Without an address, it is asked
// once on the start card as Play opens (Adena's, or one pasted), or put by
// for a try: a round in calm weather under an id of its own (TRY_HOLE), the
// address asked once it is holed, then replayed under the author's id in each
// weather (carry.ts holdsIn), proved in each it holes in (tried): practice
// counts. Its HUD is the game's own
// (Golf.tsx): the strokes card with the par and the time in play, the
// weather card, the weathers to hole beside them. In play R or Backspace
// plays again from the tee, V swaps the overview camera, Escape goes back
// to Build.
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Button, Dialog } from "@/components/ui";
import { useFlash } from "@/components/common";
import { CamButton } from "@/components/CamButton";
import Weather, { SkyIcon } from "@/components/Weather";
import { connect, hasAdena } from "@/lib/adena";
import { isAddress, makeChain, RULES } from "@/lib/chain";
import { createGame } from "@/lib/engine";
import { camlog } from "@/lib/testhooks";
import { endpoints, keepAuthor } from "@/lib/builder/holes";
import { makeLocalChain } from "@/lib/builder/localchain";
import { holdsIn, holdsToo } from "@/lib/builder/carry";
import { FIND_BACK, replay, suggestPar, unproven, type Proof } from "@/lib/builder/proof";
import { askSaid, clock, finished, heldSaid, toGo, holeRow, nowSaid, parSaid, plan, summary, testChain, TRY_HOLE, tryPlan, type Act } from "@/lib/builder/testmode";
import { playKey } from "@/lib/builder/keys";
import { NO_GL } from "@/lib/builder/editor";
import { hold, onStage, stageCanvas, stageRenderer, stageUp } from "@/lib/builder/stage";
import { ADENA_URL } from "@/lib/network";
import { confetti } from "@/lib/builder/juice";
import { required, weatherName } from "@/lib/builder/rules";
import { sound } from "@/lib/feel";
import type { Draft } from "@/lib/builder/draft";
import type { BuilderHost } from "@/lib/builder/wasm";
import type { Snapshot } from "@/lib/engine/types";
import type { WeatherNow } from "@/lib/scene/weather";

/** A weather to prove, as the game's weather card pictures its sky ("" is clear); and a calm sky's weather, for the card before the game says one. */
const SKY: Record<string, "sun" | "wind" | "rain" | "snow" | "storm"> = { "": "sun", wind: "wind", rain: "rain", storm: "storm", snow: "snow" };
const CALM: WeatherNow = { wind: null, rain: false, fog: false, storm: false, snow: false };
/** The celebration's confetti: a little, the same each time. */
const BITS = confetti(28);
/** No chip stamped. */
const NONE: readonly string[] = [];
/** The start card's line, no address known as Play opens. */
const START_LINE = "Your address names the hole and sets its weather. Nothing is signed until you publish.";
/** Said when a try holed before the address holes in no weather under it: the line promised it would count. */
const NOT_CARRIED = "Your practice round did not hold under your address: sink it in each weather.";
/** How far back a weather is looked for (FIND_BACK periods), in days, for a sentence. */
const FIND_DAYS = Math.round((FIND_BACK * RULES.periodMs) / 86_400_000);

/** The weathers to hole, a chip each (the HUD's, under the strokes card's eyebrow): its sky and name, ticked with its strokes once holed
 *  (stamped as it is), the one played lit, one that did not count red; with onPick (the address known) each a button, the weather played next. */
function Weathers({ world, list, onPick }: { world: string; list: readonly { kind: string; done: boolean; playing?: boolean; bad?: boolean; best?: number; stamp?: boolean }[]; onPick?: (kind: string) => void }) {
  return (
    <div className="card tmode__weathers">
      <span className="eyebrow" aria-live="polite">{toGo(list.length, list.filter((w) => w.done).length)}</span>
      <div className="tmode__chips" role={onPick ? "group" : "list"} aria-label="The weathers to hole">
        {list.map(({ kind, done, playing = false, bad = false, best, stamp = false }, i) => {
          const face = (
            <>
              <SkyIcon sky={SKY[kind] ?? "sun"} mine={world === "mines"} className="tmode__sky" />
              <span className="weather__say">{weatherName(kind)}</span>
              <b className="tmode__tick">{done ? (best ? `✓ in ${best}` : "✓") : "\u00a0"}</b>
            </>
          );
          const at = { style: { animationDelay: `${i * 140}ms` }, className: `tmode__chip${done ? " tmode__chip--done" : ""}${playing ? " tmode__chip--now" : ""}${bad ? " tmode__chip--bad" : ""}${stamp ? " tmode__chip--stamp" : ""}` };
          const said = done ? `Holed in ${best ?? "?"}` : playing ? "Playing now" : "To hole";
          return onPick ? (
            <button key={kind} type="button" {...at} aria-pressed={playing} title={playing ? `${said}: play it again (R)` : `${said}: play it now`} onClick={() => onPick(kind)}>{face}</button>
          ) : (
            <span key={kind} role="listitem" {...at} title={said}>{face}</span>
          );
        })}
      </div>
    </div>
  );
}

/** The game's hole-finished card (Golf.tsx's banner--win): the hole's name in its pill, what happened its title, then what is given. */
const WonCard = ({ title, head, label, kicker = "In the hole!", className = "", children }: { title: string; head: string; label: string; kicker?: string; className?: string; children: ReactNode }) => (
  <div className="banner banner--win tmode__won">
    <Dialog className={`banner__in ${className}`.trim()} role="dialog" aria-modal="true" aria-label={label}>
      <span className="eyebrow">{kicker} · {title}</span>
      <h2>{head}</h2>
      {children}
    </Dialog>
  </div>
);

/** The round's time, each digit in a box of one width (the font's own are not): it ticks in place, nothing beside it moves. */
const Clock = ({ text }: { text: string }) => <span className="tmode__clock">{[...text].map((c, i) => /\d/.test(c) ? <i key={i}>{c}</i> : c)}</span>;

/** The address, asked once on the game's card: as Play opens (none known yet: the start card, round 1 named, or just a try) or
 *  once a try is holed (how far, what comes next): Adena's account, or one pasted (kept in this browser); nothing signed. */
function AddressLine({ start, title, head, line, note, onAddress, children }: { start?: boolean; title: string; head: string; line: string; note?: ReactNode; onAddress: (a: string) => void; children: ReactNode }) {
  const [typed, setTyped] = useState("");
  const [paste, setPaste] = useState(false);
  const [why, setWhy] = useState("");
  const ok = isAddress(typed.trim());
  const adena = async () => {
    try {
      const { rpc } = endpoints(window.location.search);
      onAddress((await connect({ rpc })).address);
    } catch (e) {
      setWhy(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <WonCard title={title} head={head} kicker={start ? "Before you tee off" : undefined} label={start ? "Your address first" : "Holed: your address next"} className={start ? "tmode__sign tmode__sign--start" : "tmode__sign"}>
        <p>{line}</p>
        {paste ? (
          <span className="tmode__addr">
            <input value={typed} placeholder="g1…" aria-label="Your address" spellCheck={false} autoCapitalize="off" autoFocus aria-invalid={!!typed && !ok} onChange={(e) => setTyped(e.target.value)} />
            <Button variant="primary" disabled={!ok} onClick={() => onAddress(typed.trim())}>Use this address</Button>
          </span>
        ) : !hasAdena() && <p className="tmode__small">No Adena here (<a href={ADENA_URL} target="_blank" rel="noopener noreferrer">get it</a>), or paste an address.</p>}
        {why && <p role="alert" className="tmode__why">{why}</p>}
        <div className="banner__row">
          {/* pasting: back to Adena's way at a press */}
          {paste && <Button onClick={() => (setPaste(false), setTyped(""))}>← Back</Button>}
          {children}
          {!paste && <Button onClick={() => setPaste(true)}>Paste an address</Button>}
          {!paste && hasAdena() && <Button variant="primary" onClick={() => void adena()}>Use my Adena address</Button>}
        </div>
        {note && <p className="tmode__small">{note}</p>}
    </WonCard>
  );
}

export default function TestMode({ host, draft, hex, proofKey, author, next, guess = 0, tried = null, onAuthor, onProof, onPar, onRound, onTried, onPublish, onLeave }: {
  host: BuilderHost;
  draft: Draft;
  /** its canonical bytes (fit) */
  hex: string;
  /** proof.ts proofKey of the draft */
  proofKey: string;
  author: string | null;
  /** the author's id: the alias's next version as the editor read it (testmode.ts nextId; read: false, unread: v1); null
   *  while it is read */
  next: { id: string; read: boolean } | null;
  /** the difficulty meter's par (0: none): shown, as a guess, until the rounds set it */
  guess?: number;
  /** a try holed before the address was given, its shots: replayed first in each weather, the author's rounds where it holds */
  tried?: readonly string[] | null;
  /** that try replayed (counted where it held): not replayed again */
  onTried: () => void;
  /** the address given (a try holed first): kept in this browser, and play goes on as the author's */
  onAuthor: (a: string) => void;
  onProof: (p: Proof) => void;
  /** the proofs' suggested par, once every weather is proved */
  onPar: (par: number) => void;
  /** a try's round that holed (no address yet), its shots (left on the board as a trail) */
  onRound: (shots: readonly string[]) => void;
  /** the way on once every weather is proved, from its finished card */
  onPublish: () => void;
  /** Escape: back to the editor (not while aiming: Escape drops the aim, the game's) */
  onLeave: () => void;
}) {
  const [note, setNote] = useState("");
  // no address yet: rounds in calm weather, just to try (the address asked once one is holed)
  const trying = !author;
  // the start card put by for a calm try, the address asked once it is holed
  const [justTry, setJustTry] = useState(false);
  // the chain unread: said in a strip under the weathers, gone once a shot is struck
  const [aside, setAside] = useState("");
  const [struck, setStruck] = useState(false);
  const [why, setWhy] = useState<Record<string, string>>({});
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [checking, setChecking] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  // the game's canvas: the Builder's one (stage.ts), lent for the visit (no context of its own: a browser holds about
  // sixteen), the game's #stage while it is here; each weather's game reuses it, and the board has it back after
  const [canvas, setCanvas] = useState<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!stage.current) return;
    const give = hold(stage.current), el = stageCanvas();
    el.id = "stage";
    setCanvas(el);
    return give;
  }, []);
  const game = useRef<ReturnType<typeof createGame> | null>(null);
  // the keys in play (keys.ts playKey): Escape leaves, unless it drops an aim (the game's); R or Backspace from the tee; V the overview; never a field's
  const aiming = useRef(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      const k = playKey(e);
      if (k === "leave" && !aiming.current) return (e.stopPropagation(), onLeave());
      if (k === "restart" && game.current) return (e.preventDefault(), again());
      if (k === "view") game.current?.toggleView();
    };
    addEventListener("keydown", key, true); // (before the game's own: an aim it drops is still an aim here)
    return () => removeEventListener("keydown", key, true);
  });

  // the hole's id: the author's alias's next version, as the editor read it (v1 if it cannot be read), the one the stepper
  // and Publish go by; a try's its own
  const id = !author ? TRY_HOLE : next?.id ?? null, unread = !!author && next?.read === false;
  useEffect(() => void (unread && setAside("The chain could not be read: played as a new hole (v1). If it has versions already, play it again once it can be.")), [unread]);

  // the round holed in the weather played (its strokes; 0 not yet), until a play again or the next weather
  const [holed, setHoled] = useState(0);
  const landed = useRef<(() => void) | null>(null), dropped = useRef(false); // (the holing stroke's ball dropped: the game's holed)
  // the title card a moment ("Round 2 of 3: Wind"), the weathers just holed, their chips stamped, and those a round held in too, said
  const [said, setSaid] = useFlash(1200, ""), [stamp, setStamp] = useFlash(1200, NONE), [held, setHeld] = useFlash(3600, "");
  // the weathers not proved yet (a try's one: never proved, so never left); the latest, for a replay's chain
  const left = !id ? [] : trying ? (holed ? [] : [""]) : unproven(draft.proofs, draft.world, proofKey, id);
  const leftNow = useRef(left);
  leftNow.current = left;
  // the weathers a round just proved held in too (holdsToo): stamped with its own
  const alsoHeld = useRef<string[]>([]);
  const [kinds, setKinds] = useState<{ kind: string; period: number }[]>([]);
  useEffect(() => {
    if (!id) return;
    host.load(id, hex);
    setKinds(trying ? tryPlan(host, id) : plan(host, id, draft.world, Math.floor(Date.now() / RULES.periodMs)));
  }, [id, hex, host, draft.world, trying]);
  // a round proved: its shots replayed in each weather still to prove, at plan's period (carry.ts holdsToo); each it holes in
  // proved by that replay, as any round's, and said ("Your Clear round holds in Rain too ✓")
  const chain = async (p: Proof) => {
    const more = await holdsToo(host, draft, hex, p, kinds.filter((k) => leftNow.current.includes(k.kind)));
    more.forEach(onProof);
    alsoHeld.current = more.map((q) => q.kind);
    if (more.length) setHeld(heldSaid(p.kind, alsoHeld.current));
  };
  // the title card's place among the weathers to sink ("Round 2 of 3"): the ones sunk before it, then this one (a try's: the first)
  const atOf = (kind: string) => {
    const of = required(draft.world).length;
    return trying ? { n: 1, of } : leftNow.current.includes(kind) ? { n: of - leftNow.current.length + 1, of } : undefined;
  };
  // a try holed before the address: replayed under the author's id in each weather left, at its period, proved in each it
  // holes in (the replay is the proof, as for any round) and said ("Your practice round holds in Clear and Wind ✓"); the
  // first weather waits for it, said by its title card then
  const [carry, setCarry] = useState<"" | "waiting" | "done">(tried && !trying ? "waiting" : "");
  useEffect(() => {
    if (carry !== "waiting" || !id || !kinds.length) return;
    const ways = kinds.filter((k) => left.includes(k.kind));
    if (!ways.length || !tried) return setCarry("");
    void holdsIn(host, draft, hex, { key: proofKey, id, shots: tried }, ways).then((more) => {
      onTried();
      if (!more.length) return (setAside(NOT_CARRIED), setCarry("")); // (said plainly: the round the line promised did not count)
      more.forEach(onProof);
      sound("cup");
      setStamp(more.map((p) => p.kind));
      setHeld(heldSaid(null, more.map((p) => p.kind)));
      setCarry("done");
    });
  }, [carry, id, kinds]); // eslint-disable-line react-hooks/exhaustive-deps
  // the weather played: the first not proved as it opens, then the next one not proved once it is
  const [on, setOn] = useState<string | null>(null);
  const first = trying ? kinds[0]?.kind : kinds.find((k) => left.includes(k.kind))?.kind;
  useEffect(() => {
    if (on !== null || first === undefined || carry === "waiting") return;
    setOn(first);
    if (!trying || justTry) setSaid(nowSaid(first, atOf(first))); // (the first round named too, as it opens; the start card names it with no address)
  }, [on, first, carry, setSaid]); // eslint-disable-line react-hooks/exhaustive-deps -- (atOf: the render's own)
  const now = kinds.find((k) => k.kind === on) ?? null;
  // the round's time in play: from its game's start (or a play again) to the cup; each weather's proved on this visit (the summary's)
  useEffect(() => void (snap?.strokes && setStruck(true)), [snap?.strokes]);
  const [took, setTook] = useState<number | null>(null);
  const [times, setTimes] = useState<Record<string, number>>({});
  const since = useRef(0), [tick, setTick] = useState(0);
  useEffect(() => {
    if (!now || holed) return;
    const t = setInterval(() => setTick(performance.now()), 100);
    return () => clearInterval(t);
  }, [now?.kind, holed]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = () => (setHoled(0), setTook(null), (since.current = performance.now()), (landed.current = null), (dropped.current = false));
  const again = () => (setWhy((w) => (now ? { ...w, [now.kind]: "" } : w)), fresh(), game.current?.reset());
  // a weather chip pressed: that weather played next (its plan period), one sunk already played again; the one playing, from the tee
  const pick = (kind: string) => {
    if (kind === now?.kind) return again();
    setWhy((w) => ({ ...w, [kind]: "" }));
    setNote("");
    fresh();
    setOn(kind);
    setSaid(nowSaid(kind, atOf(kind)));
  };
  // a weather proved (its round replayed and counted): its chip stamped, the next starts on its own under a title card a
  // moment ("Round 2 of 3: Wind"); the last ends on the summary
  const provedNow = !trying && !!now && holed > 0 && !checking && !why[now.kind] && !left.includes(now.kind);

  useEffect(() => {
    if (!provedNow || !now) return;
    setStamp([now.kind, ...alsoHeld.current]);
    alsoHeld.current = [];
    if (first === undefined) return;
    setSaid(nowSaid(first, atOf(first)));
    fresh();
    setOn(first);
  }, [provedNow]); // eslint-disable-line react-hooks/exhaustive-deps

  // the game on the current weather's period; a new one for the next weather
  useEffect(() => {
    if (!id || !now || !canvas) return;
    if (now.period < 0) return setNote(`No ${weatherName(now.kind).toLowerCase()} came in the last ${FIND_DAYS} days of this hole's weather: it cannot be proved in it.`);
    const renderer = stageRenderer();
    if (!renderer) return setNote(NO_GL); // (the Editor turns Test off then: a page opened on it still says why)
    const { rpc, web } = endpoints(window.location.search);
    const local = makeLocalChain(host, holeRow(id, draft), hex, now.period);
    const g = (game.current = createGame(canvas, {
      renderer, // (the board's, lent: a game leaves no GL objects of its own on the context)
      chain: testChain(makeChain({ rpc, web }), local, hex),
      onChange: (s) => ((aiming.current = s.aiming), setSnap(s), (dropped.current = s.holed) && landed.current?.()),
      // known holed as the stroke is struck: what follows waits for the ball to drop (the game's own moment, its cup's
      // sound and the confetti), never a card or the next weather over a ball still rolling
      onHoled: ({ shots }) => {
        const ms = performance.now() - since.current;
        const drop = new Promise<void>((r) => (landed.current = () => ((landed.current = null), r())));
        if (dropped.current) landed.current?.(); // (the check answered after the drop)
        if (trying) return void drop.then(() => (setTook(ms), setHoled(shots.length), onRound(shots))); // (a try: no replay, no proof; the address asked)
        const proof = replay(local, { key: proofKey, id, kind: now.kind, period: now.period, shots: [...shots] }); // (meanwhile)
        void drop.then(() => (setTook(ms), setHoled(shots.length), setChecking(true), proof)).then(async (p) => {
          if (typeof p === "string") return (setChecking(false), setWhy((w) => ({ ...w, [now.kind]: p })));
          setWhy((w) => ({ ...w, [now.kind]: "" }));
          setTimes((t) => ({ ...t, [now.kind]: ms }));
          onProof(p);
          await chain(p); // (the next weather waits for it: one this round holds in is not played)
          setChecking(false);
        });
      },
    }));
    if (camlog()) window.__g = g; // (the rigs' hook, as the game's: ?camlog in a dev or test build only)
    void g.start(id).then(() => ((since.current = performance.now()), g.play(true)), (e: unknown) => setNote(e instanceof Error ? e.message : String(e)));
    return () => {
      if (window.__g === g) delete window.__g;
      game.current = null;
      g.destroy();
    };
    // (one game per weather: a proof of this one moves to the next)
  }, [id, now?.kind, now?.period, canvas]); // eslint-disable-line react-hooks/exhaustive-deps

  // the shared canvas's context taken away (a GPU reset): said, as the game says it; not back in 3 s, a reload offered
  const lost = useSyncExternalStore(onStage, () => !!stageRenderer() && !stageUp());
  const [gone, setGone] = useState(false);
  useEffect(() => {
    setGone(false);
    if (!lost) return;
    const t = setTimeout(() => setGone(true), 3000);
    return () => clearTimeout(t);
  }, [lost]);

  // every weather proved: the par they suggest; proved here, by this visit's last round, a small celebration
  // (the weathers tick one by one, a little confetti, a chime; Publish pulses in the header)
  const proved = !trying && !!id && kinds.length > 0 && !left.length;
  const [party, setParty] = useState(false), wasProved = useRef<boolean | null>(null);
  useEffect(() => {
    if (kinds.length && wasProved.current === null) wasProved.current = proved; // (proved as it opened: no party)
    if (!proved) return;
    onPar(suggestPar(draft.proofs.filter((p) => p.key === proofKey && p.id === id)));
    if (wasProved.current !== false) return;
    wasProved.current = true;
    sound("start"); // (the game's own fanfare has just played for the hole: Publish's chime after it)
    setParty(true);
    const t = setTimeout(() => setParty(false), 2400);
    return () => clearTimeout(t);
  }, [proved, kinds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const mineProofs = draft.proofs.filter((p) => p.key === proofKey && p.id === id);
  const par = proved ? suggestPar(mineProofs) : 0;
  const time = took ?? (now && tick ? Math.max(0, tick - since.current) : null);
  const rows = proved || provedNow ? summary(kinds.map(({ kind }) => ({ kind, strokes: mineProofs.find((p) => p.kind === kind)?.strokes ?? 0, ms: times[kind] })), par) : null;
  // every weather holed as it opened: the summary at once
  const card = proved && !now ? rows
    : !holed || !now || checking || trying ? null
    : provedNow ? (first === undefined ? rows : null)
    : finished({ strokes: holed, kind: now.kind, why: why[now.kind] });
  const act: Record<Act, () => void> = { again, edit: onLeave, publish: onPublish };
  const sign = (a: string) => (keepAuthor(a), onAuthor(a));
  const said_ = parSaid(par, guess), asking = trying && holed > 0; // (the score card's par; a try holed: its address asked)
  return (
    <main className={`tmode${party ? " tmode--party" : ""}`}>
      {party && <div className="bconfetti" aria-hidden="true">{BITS.map((b, i) => <i key={i} style={{ left: `${b.x}%`, background: b.color, animationDelay: `${b.delay}ms`, ["--drift" as string]: `${b.drift}px`, ["--turn" as string]: `${b.turn}deg` }} />)}</div>}
      <div ref={stage} />
      {/* the game's own HUD (Golf.tsx's hud--top): the strokes and the time, the weather now, the weathers to hole beside; Back to Build */}
      <header className="hud hud--top">
        <div className="card card--score tmode__score" aria-live="polite" aria-atomic="true">
          <span className="eyebrow">Strokes</span>
          <strong>{snap ? snap.strokes : 0}</strong>
          <span className="card__par">{said_ || (time == null && "\u00a0")}{said_ && time != null && " · "}{time != null && <Clock text={clock(time)} />}</span>
        </div>
        <Weather w={snap?.weather ?? CALM} flash={snap?.flash ?? 0} night={snap?.time === "night"} world={snap?.look ?? draft.world} />
        <Weathers world={draft.world} list={(trying ? required(draft.world) : kinds.map((k) => k.kind)).map((kind) => ({ kind, done: !trying && !left.includes(kind), playing: now?.kind === kind, bad: !!why[kind] && left.includes(kind),
          best: draft.proofs.find((p) => p.kind === kind && p.key === proofKey && p.id === id)?.strokes, stamp: stamp.includes(kind) }))}
          onPick={!trying && id && kinds.length && !checking && carry !== "waiting" ? pick : undefined} />
        <div className="hud__right">
          <Button size="m" keycap="Esc" onClick={onLeave}>Back to Build</Button>
        </div>
      </header>
      {/* under the HUD, one column: the strip, then the notes under it */}
      <div className="tmode__side">
        {aside && <div className={`tmode__strip${struck ? " tmode__strip--gone" : ""}`} role="status" aria-hidden={struck || undefined}><p>{aside}</p></div>}
        {(snap?.error || lost || note || checking || held) && (
          <div className="tmode__notes">
            {snap?.error && <p className="tmode__why" role="alert">{snap.error}</p>}
            {lost && <p className="tmode__why" role="alert">{gone ? "The 3D view did not come back. Reloading brings it back; your draft is kept." : "The browser took the 3D view away for a moment. Bringing it back…"}{gone && <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>}</p>}
            {note && <p className="tmode__note" role="status">{note}</p>}
            {checking && <p className="tmode__note" role="status">The chain&apos;s code replays your round…</p>}
            {held && !checking && <p className="tmode__note" role="status">{held}</p>}
          </div>
        )}
      </div>
      {/* the next weather, a moment: its title card */}
      {said && <p key={said} className="tmode__now" role="status">{said}</p>}
      {now && !card && (
        <footer className="hud hud--bottom">
          {/* (nothing to play again before a first shot; holed on a try, the card's) */}
          {(!!snap?.strokes || holed > 0) && !asking && <Button title="R or Backspace" keycap="R" onClick={again}>Try again</Button>}
          {/* the game's view button: classic, third person, far (V swaps to the overview) */}
          {snap && <CamButton cam={snap.cam} onCam={(next) => game.current?.setCam(next)} />}
        </footer>
      )}
      {/* no address yet: asked once as Play opens, before round 1 (or just a try: asked again once it is holed) */}
      {now && !card && trying && !holed && !justTry && (
        <AddressLine start title={draft.title || "Your hole"} head={nowSaid("", atOf(""))} line={START_LINE} onAddress={sign}
          note="Practice first plays Clear only: add your address once it's holed and it counts in each weather it holds in.">
          <Button onClick={() => (setJustTry(true), fresh(), setSaid(nowSaid("", atOf(""))))}>Practice first</Button>
        </AddressLine>
      )}
      {now && !card && asking && (
        <AddressLine title={draft.title || "Your hole"} head={`Holed in ${holed}!`} line={askSaid(draft.world)} onAddress={sign}>
          <Button keycap="R" title="R or Backspace" onClick={again}>Try again</Button>
        </AddressLine>
      )}
      {/* holed: the game's hole-finished card (Golf.tsx's banner--win), its ways on */}
      {card && (
        <WonCard title={draft.title || "Your hole"} head={card.title} label={card.rows ? "Holed in every weather" : "Hole finished"}>
            {card.line && <p aria-live="polite">{card.line}</p>}
            {card.rows && (
              <table className="tmode__sum">
                <thead><tr><th scope="col">Weather</th><th scope="col">Strokes</th><th scope="col">Time</th></tr></thead>
                <tbody>{card.rows.map((r) => <tr key={r.weather}><th scope="row">{r.weather}</th><td>{r.strokes}</td><td>{r.time}</td></tr>)}</tbody>
              </table>
            )}
            {card.actions.length > 0 && (
              <div className="banner__row">
                {card.actions.map((a) => (
                  <Button key={a.act} variant={a.act === "publish" ? "gold" : a.primary ? "primary" : "secondary"} keycap={a.key} onClick={act[a.act]}>
                    {a.text}
                  </Button>
                ))}
              </div>
            )}
        </WonCard>
      )}
    </main>
  );
}
