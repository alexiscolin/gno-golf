"use client";

// Test mode (the GUI spec's B3; the hole-builder design's "Test mode and
// par"): the game itself (lib/engine, as the page plays a hole) on the
// draft's hole, served by builder.wasm at one clock (localchain.ts), in one
// period of each weather that moves the ball. When the ball drops, the
// round is replayed as its save would be cut (proof.ts replay): that, not
// the live play, is the proof. Its HUD is the game's own (Golf.tsx): the
// strokes card with the par and the time in play, the weather card, and
// beside them the weathers to prove, ticked once proved, red once for a
// round that does not count. The hole's id is fixed first (the author's
// address, the slug, the next version): its weather hangs on it. Hole it
// opens on the first weather not proved (the others proved already, their
// rounds replayed by the editor: carry.ts); each one proved, the next starts
// on its own, said a moment in the HUD, and the last ends on one card, the
// game's hole-finished card, with each weather's strokes and time and
// Publish (testmode.ts summary); a round that does not count gets that card
// with why (finished). A quick test (quick) is the same game
// in calm weather only, under an id of its own: no address asked, nothing
// replayed, nothing proved (its label says so, once). In play R or
// Backspace plays again from the tee, V swaps the overview camera, Escape
// goes back to Build.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, Dialog } from "@/components/ui";
import { FrontHead } from "@/components/About";
import Weather, { SkyIcon } from "@/components/Weather";
import { connect, hasAdena } from "@/lib/adena";
import { isAddress, makeChain, RULES } from "@/lib/chain";
import { createGame } from "@/lib/engine";
import { camlog } from "@/lib/testhooks";
import { AUTHOR_KEY, endpoints } from "@/lib/builder/holes";
import { makeLocalChain } from "@/lib/builder/localchain";
import { FIND_BACK, replay, suggestPar, unproven, type Proof } from "@/lib/builder/proof";
import { checklist, clock, finished, HOLE_IT, holeId, holeRow, parSaid, plan, provedNote, QUICK_HOLE, quickPlan, summary, testChain, type Act } from "@/lib/builder/testmode";
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
/** How far back a weather is looked for (FIND_BACK periods), in days, for a sentence. */
const FIND_DAYS = Math.round((FIND_BACK * RULES.periodMs) / 86_400_000);

/** The weathers to hole, a chip each (the HUD's, the step's first page's): its sky and name, ticked with its strokes once holed, the one played lit, one that did not count red. */
function Weathers({ world, list }: { world: string; list: readonly { kind: string; done: boolean; playing?: boolean; bad?: boolean; best?: number }[] }) {
  return (
    <div className="card tmode__weathers" role="list" aria-label="The weathers to hole">
      {list.map(({ kind, done, playing = false, bad = false, best }, i) => (
        <span key={kind} role="listitem" style={{ animationDelay: `${i * 140}ms` }} className={`tmode__chip${done ? " tmode__chip--done" : ""}${playing ? " tmode__chip--now" : ""}${bad ? " tmode__chip--bad" : ""}`}
          title={done ? `Holed in ${best ?? "?"}` : playing ? "Playing now" : "To hole"}>
          <SkyIcon sky={SKY[kind] ?? "sun"} mine={world === "mines"} className="tmode__sky" />
          <span className="weather__say">{weatherName(kind)}</span>
          <b className="tmode__tick">{done ? (best ? `✓ in ${best}` : "✓") : "\u00a0"}</b>
        </span>
      ))}
    </div>
  );
}

/** The address step, the Hole it step's first page: its one line and the weathers to hole, then Adena's account, or an address pasted (kept in this browser). */
function AddressStep({ world, onAddress }: { world: string; onAddress: (a: string) => void }) {
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
    <div className="tmode__ask">
      <FrontHead eyebrow="Hole it" title="Hole it in every weather" h1 />
      <p className="tmode__intro">{HOLE_IT}</p>
      <Weathers world={world} list={checklist(world, required(world))} />
      <section className="tmode__sign" aria-label="Sign your hole">
        <h2>Sign your hole</h2>
        <p>Your address is part of its name and sets its weather, so your proofs still count when you publish. Nothing is signed now.</p>
        {hasAdena() ? <Button variant="primary" onClick={() => void adena()}>Use my Adena address</Button>
          : <p className="tmode__small">No Adena here: get it at <a href={ADENA_URL} target="_blank" rel="noopener noreferrer">adena.app</a>, then come back.</p>}
        {paste ? (
          <>
            <label className="tmode__addr">
              <span>Your address</span>
              <input value={typed} placeholder="g1…" spellCheck={false} autoCapitalize="off" autoFocus aria-invalid={!!typed && !ok} onChange={(e) => setTyped(e.target.value)} />
            </label>
            <Button variant="gold" disabled={!ok} onClick={() => onAddress(typed.trim())}>Use this address</Button>
          </>
        ) : <button type="button" className="linkish" onClick={() => setPaste(true)}>Or paste an address (g1…)</button>}
        {why && <p role="alert" className="tmode__why">{why}</p>}
      </section>
    </div>
  );
}

export default function TestMode({ host, draft, hex, proofKey, author, guess = 0, quick = false, proveOff = "", onAuthor = () => {}, onProof = () => {}, onPar = () => {}, onRound = () => {}, onProve, onPublish, onLeave }: {
  host: BuilderHost;
  draft: Draft;
  /** its canonical bytes (fit) */
  hex: string;
  /** proof.ts proofKey of the draft */
  proofKey: string;
  author: string | null;
  /** the difficulty meter's par (0: none): shown, as a guess, until the rounds set it */
  guess?: number;
  onAuthor?: (a: string) => void;
  onProof?: (p: Proof) => void;
  /** the proofs' suggested par, once every weather is proved */
  onPar?: (par: number) => void;
  /** a quick test: calm weather, no address, no proof */
  quick?: boolean;
  /** a quick test's round that holed, its shots (left on the board as a trail) */
  onRound?: (shots: readonly string[]) => void;
  /** a quick test's way on, from its finished card: Hole it in every weather (off with why: proveOff) */
  onProve?: () => void;
  proveOff?: string;
  /** The Hole it step's way on once every weather is proved, from its finished card */
  onPublish?: () => void;
  /** Escape: back to the editor (not while aiming: Escape drops the aim, the game's) */
  onLeave?: () => void;
}) {
  const [id, setId] = useState<string | null>(null);
  const [note, setNote] = useState("");
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
  }, [!author && !quick]); // eslint-disable-line react-hooks/exhaustive-deps -- (the stage is there once an address is)
  const game = useRef<ReturnType<typeof createGame> | null>(null);
  // the keys in play (keys.ts playKey): Escape leaves, unless it drops an aim (the game's); R or Backspace from the tee; V the overview; never a field's
  const aiming = useRef(false);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, select, textarea")) return;
      const k = playKey(e);
      if (k === "leave" && !aiming.current && onLeave) return (e.stopPropagation(), onLeave());
      if (k === "restart" && game.current) return (e.preventDefault(), again());
      if (k === "view") game.current?.toggleView();
    };
    addEventListener("keydown", key, true); // (before the game's own: an aim it drops is still an aim here)
    return () => removeEventListener("keydown", key, true);
  });

  // the hole's id: the author's alias's next version, as the chain says (v1 if it cannot be read)
  useEffect(() => {
    if (quick) return setId(QUICK_HOLE);
    if (!author || !draft.slug) return;
    const { rpc, web } = endpoints(window.location.search), alias = `${author}/${draft.slug}`;
    makeChain({ rpc, web }).versions(alias).then(
      (v) => setId(holeId(author, draft.slug, v)),
      () => (setId(holeId(author, draft.slug, null)), setNote("The chain could not be read: tested as a new hole (v1). If it has versions already, test again once it can be.")),
    );
  }, [author, draft.slug, quick]);

  // the round holed in the weather played (its strokes; 0 not yet), until a play again or the next weather
  const [holed, setHoled] = useState(0);
  // the weathers not proved yet (a quick test's one: never proved, so never left)
  const left = !id ? [] : quick ? (holed ? [] : [""]) : unproven(draft.proofs, draft.world, proofKey, id);
  const [kinds, setKinds] = useState<{ kind: string; period: number }[]>([]);
  useEffect(() => {
    if (!id) return;
    host.load(id, hex);
    setKinds(quick ? quickPlan(host, id) : plan(host, id, draft.world, Math.floor(Date.now() / RULES.periodMs)));
  }, [id, hex, host, draft.world, quick]);
  // the weather played: the first not proved as it opens, then the next one not proved once it is
  const [on, setOn] = useState<string | null>(null);
  const first = quick ? kinds[0]?.kind : kinds.find((k) => left.includes(k.kind))?.kind;
  useEffect(() => void (on === null && first !== undefined && setOn(first)), [on, first]);
  const now = kinds.find((k) => k.kind === on) ?? null;
  // the round's time in play: from its game's start (or a play again) to the cup; each weather's proved on this visit (the summary's)
  const [took, setTook] = useState<number | null>(null);
  const [times, setTimes] = useState<Record<string, number>>({});
  const since = useRef(0), [tick, setTick] = useState(0);
  useEffect(() => {
    if (!now || holed) return;
    const t = setInterval(() => setTick(performance.now()), 100);
    return () => clearInterval(t);
  }, [now?.kind, holed]); // eslint-disable-line react-hooks/exhaustive-deps
  const fresh = () => (setHoled(0), setTook(null), (since.current = performance.now()));
  const again = () => (setWhy((w) => (now ? { ...w, [now.kind]: "" } : w)), fresh(), game.current?.reset());
  // a weather proved (its round replayed and counted): the next starts on its own, said a moment in the HUD; the last ends on the summary
  const provedNow = !quick && !!now && holed > 0 && !checking && !why[now.kind] && !left.includes(now.kind);
  const [said, setSaid] = useState("");
  useEffect(() => {
    if (!provedNow || !now || first === undefined) return;
    setSaid(provedNote(now.kind, first));
    fresh();
    setOn(first);
  }, [provedNow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!said) return;
    const t = setTimeout(() => setSaid(""), 3000);
    return () => clearTimeout(t);
  }, [said]);

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
      onChange: (s) => ((aiming.current = s.aiming), setSnap(s)),
      onHoled: ({ shots }) => {
        const ms = performance.now() - since.current;
        setTook(ms);
        setHoled(shots.length);
        if (quick) return (onRound(shots), sound("cup")); // (a quick test: no replay, no proof)
        setChecking(true);
        void replay(local, { key: proofKey, id, kind: now.kind, period: now.period, shots: [...shots] }).then((p) => {
          setChecking(false);
          if (typeof p === "string") return setWhy((w) => ({ ...w, [now.kind]: p }));
          setWhy((w) => ({ ...w, [now.kind]: "" }));
          setTimes((t) => ({ ...t, [now.kind]: ms }));
          sound("cup");
          onProof(p);
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
  const proved = !quick && !!id && kinds.length > 0 && !left.length;
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

  if (!author && !quick) return <main className={`tmode tmode--ask front tint--${draft.world}`}><AddressStep world={draft.world} onAddress={(a) => { try { localStorage.setItem(AUTHOR_KEY, a); } catch {} onAuthor(a); }} /></main>;
  const mineProofs = draft.proofs.filter((p) => p.key === proofKey && p.id === id);
  const par = proved ? suggestPar(mineProofs) : 0;
  const time = took ?? (now && tick ? Math.max(0, tick - since.current) : null);
  const card = !holed || !now || checking ? null
    : provedNow ? (first === undefined ? summary(kinds.map(({ kind }) => ({ kind, strokes: mineProofs.find((p) => p.kind === kind)?.strokes ?? 0, ms: times[kind] })), par) : null)
    : finished({ quick, strokes: holed, kind: now.kind, why: why[now.kind], proveOff });
  const waits = card?.actions.find((a) => a.off)?.off; // (why the way on waits, under it)
  const act: Record<Act, (() => void) | undefined> = { again, edit: onLeave, prove: onProve, publish: onPublish };
  // the step as it opens (nothing holed yet, no stroke played): its one line over the HUD
  const opening = !quick && kinds.length > 0 && left.length === kinds.length && !holed && !snap?.strokes;
  return (
    <main className={`tmode${quick ? " tmode--quick" : ""}${party ? " tmode--party" : ""}`}>
      {party && <div className="bconfetti" aria-hidden="true">{BITS.map((b, i) => <i key={i} style={{ left: `${b.x}%`, background: b.color, animationDelay: `${b.delay}ms`, ["--drift" as string]: `${b.drift}px`, ["--turn" as string]: `${b.turn}deg` }} />)}</div>}
      <div ref={stage} className="tmode__stage" />
      {/* the game's own HUD (Golf.tsx's hud--top): what is played, the strokes and the time, the weather now; the Hole it step's weathers to prove beside */}
      <header className="hud hud--top">
        {quick && (
          <div className="card card--hole tmode__label">
            <div className="card__text">
              <span className="eyebrow">{draft.title || "Your hole"}</span>
              <h1>Quick test <i className="pro-chip pro-chip--row">just to try</i></h1>
            </div>
          </div>
        )}
        <div className="card card--score tmode__score" aria-live="polite" aria-atomic="true">
          <span className="eyebrow">Strokes</span>
          <strong>{snap ? snap.strokes : 0}</strong>
          <span className="card__par">{[quick ? "" : parSaid(par, guess), time != null ? clock(time) : ""].filter(Boolean).join(" · ") || "\u00a0"}</span>
        </div>
        <Weather w={snap?.weather ?? CALM} flash={snap?.flash ?? 0} night={snap?.time === "night"} world={snap?.look ?? draft.world} />
        {!quick && (
          <Weathers world={draft.world} list={kinds.map(({ kind }) => ({ kind, done: !left.includes(kind), playing: now?.kind === kind, bad: !!why[kind] && left.includes(kind),
            best: draft.proofs.find((p) => p.kind === kind && p.key === proofKey && p.id === id)?.strokes }))} />
        )}
        {quick && onLeave && (
          <div className="hud__right">
            <Button keycap="Esc" onClick={onLeave}>Back to edit</Button>
          </div>
        )}
      </header>
      {(snap?.error || lost || note || checking || said || (proved && !now) || opening) && (
        <div className="tmode__notes">
          {opening && <p className="tmode__note tmode__intro">{HOLE_IT}</p>}
          {snap?.error && <p className="tmode__why" role="alert">{snap.error}</p>}
          {lost && <p className="tmode__why" role="alert">{gone ? "The 3D view did not come back. Reloading brings it back; your draft is kept." : "The browser took the 3D view away for a moment. Bringing it back…"}{gone && <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>}</p>}
          {note && <p className="tmode__note" role="status">{note}</p>}
          {checking && <p className="tmode__note" role="status">The chain&apos;s code replays your round…</p>}
          {said && <p className="tmode__done" role="status">{said}</p>}
          {proved && !now && <p className="tmode__done" role="status">Holed in every weather: publish it.</p>}
        </div>
      )}
      {now && !card && (
        <footer className="hud hud--bottom">
          <Button title="R or Backspace" keycap="R" onClick={again}>Try again</Button>
        </footer>
      )}
      {/* holed: the game's hole-finished card (Golf.tsx's banner--win), its ways on */}
      {card && (
        <div className="banner banner--win tmode__won">
          <Dialog className="banner__in" role="dialog" aria-modal="true" aria-label={card.rows ? "Holed in every weather" : "Hole finished"}>
            <span className="eyebrow">In the hole! · {draft.title || "Your hole"}</span>
            <h2>{card.title}</h2>
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
                  <Button key={a.act} variant={a.act === "publish" ? "chain" : a.primary ? "primary" : "secondary"} aria-disabled={a.off ? true : undefined} title={a.off || undefined}
                    keycap={a.key} onClick={() => !a.off && act[a.act]?.()}>
                    {a.text}
                  </Button>
                ))}
              </div>
            )}
            {waits && <p className="tmode__small">{waits}</p>}
          </Dialog>
        </div>
      )}
    </main>
  );
}
