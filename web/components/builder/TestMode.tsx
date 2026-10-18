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
// rounds replayed by the editor: carry.ts); each one holed, its chip is
// stamped and the next starts on its own under a title card a moment ("Now:
// Wind"); the last ends on one card, the game's hole-finished card, with
// each weather's strokes and time and Publish (testmode.ts summary); a round
// that does not count gets that card with why (finished). Without an
// address, a round in calm weather under an id of its own (TRY_HOLE): once
// one is holed, a line of the HUD asks for the address (Adena's, or one
// pasted), and from then on every round counts, that one first: replayed
// under the author's id in its calm period, it is the calm proof if it holes
// there too (tried). Its HUD is the game's own
// (Golf.tsx): the strokes card with the par and the time in play, the
// weather card, the weathers to hole beside them. In play R or Backspace
// plays again from the tee, V swaps the overview camera, Escape goes back
// to Build.
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Button, Dialog } from "@/components/ui";
import Weather, { SkyIcon } from "@/components/Weather";
import { connect, hasAdena } from "@/lib/adena";
import { isAddress, makeChain, RULES } from "@/lib/chain";
import { createGame } from "@/lib/engine";
import { camlog } from "@/lib/testhooks";
import { AUTHOR_KEY, endpoints } from "@/lib/builder/holes";
import { makeLocalChain } from "@/lib/builder/localchain";
import { FIND_BACK, replay, suggestPar, unproven, type Proof } from "@/lib/builder/proof";
import { clock, finished, holeId, holeRow, nowSaid, parSaid, plan, summary, testChain, TRY_HOLE, tryPlan, type Act } from "@/lib/builder/testmode";
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

/** The weathers to hole, a chip each (the HUD's): its sky and name, ticked with its strokes once holed (stamped as it is), the one played lit, one that did not count red. */
function Weathers({ world, list }: { world: string; list: readonly { kind: string; done: boolean; playing?: boolean; bad?: boolean; best?: number; stamp?: boolean }[] }) {
  return (
    <div className="card tmode__weathers" role="list" aria-label="The weathers to hole">
      {list.map(({ kind, done, playing = false, bad = false, best, stamp = false }, i) => (
        <span key={kind} role="listitem" style={{ animationDelay: `${i * 140}ms` }} className={`tmode__chip${done ? " tmode__chip--done" : ""}${playing ? " tmode__chip--now" : ""}${bad ? " tmode__chip--bad" : ""}${stamp ? " tmode__chip--stamp" : ""}`}
          title={done ? `Holed in ${best ?? "?"}` : playing ? "Playing now" : "To hole"}>
          <SkyIcon sky={SKY[kind] ?? "sun"} mine={world === "mines"} className="tmode__sky" />
          <span className="weather__say">{weatherName(kind)}</span>
          <b className="tmode__tick">{done ? (best ? `✓ in ${best}` : "✓") : "\u00a0"}</b>
        </span>
      ))}
    </div>
  );
}

/** The address, asked in a line of the HUD once a try is holed: Adena's account, or one pasted (kept in this browser); nothing signed. */
function AddressLine({ strokes, onAddress }: { strokes: number; onAddress: (a: string) => void }) {
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
    <section className="card tmode__sign" aria-label="Sign your hole">
      <p title="Your address is part of the hole's name and sets its weather, so your rounds count when you publish. Nothing is signed now.">
        <b>Holed in {strokes}!</b> Add your address: this round counts, then each weather in turn.
      </p>
      {paste ? (
        <span className="tmode__addr">
          <input value={typed} placeholder="g1…" aria-label="Your address" spellCheck={false} autoCapitalize="off" autoFocus aria-invalid={!!typed && !ok} onChange={(e) => setTyped(e.target.value)} />
          <Button size="s" variant="gold" disabled={!ok} onClick={() => onAddress(typed.trim())}>Use this address</Button>
        </span>
      ) : (
        <span className="tmode__addr">
          {hasAdena() ? <Button size="s" variant="primary" onClick={() => void adena()}>Use my Adena address</Button>
            : <span className="tmode__small">No Adena here (<a href={ADENA_URL} target="_blank" rel="noopener noreferrer">get it</a>)</span>}
          <button type="button" className="linkish" onClick={() => setPaste(true)}>or paste an address</button>
        </span>
      )}
      {why && <p role="alert" className="tmode__why">{why}</p>}
    </section>
  );
}

export default function TestMode({ host, draft, hex, proofKey, author, guess = 0, tried = null, onAuthor = () => {}, onProof = () => {}, onPar = () => {}, onRound = () => {}, onPublish, onLeave }: {
  host: BuilderHost;
  draft: Draft;
  /** its canonical bytes (fit) */
  hex: string;
  /** proof.ts proofKey of the draft */
  proofKey: string;
  author: string | null;
  /** the difficulty meter's par (0: none): shown, as a guess, until the rounds set it */
  guess?: number;
  /** a try holed before the address was given, its shots: replayed first as the author's calm round */
  tried?: readonly string[] | null;
  /** the address given (a try holed first): kept in this browser, and play goes on as the author's */
  onAuthor?: (a: string) => void;
  onProof?: (p: Proof) => void;
  /** the proofs' suggested par, once every weather is proved */
  onPar?: (par: number) => void;
  /** a try's round that holed (no address yet), its shots (left on the board as a trail) */
  onRound?: (shots: readonly string[]) => void;
  /** the way on once every weather is proved, from its finished card */
  onPublish?: () => void;
  /** Escape: back to the editor (not while aiming: Escape drops the aim, the game's) */
  onLeave?: () => void;
}) {
  const [id, setId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  // no address yet: rounds in calm weather, just to try (the address asked once one is holed)
  const trying = !author;
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
      if (k === "leave" && !aiming.current && onLeave) return (e.stopPropagation(), onLeave());
      if (k === "restart" && game.current) return (e.preventDefault(), again());
      if (k === "view") game.current?.toggleView();
    };
    addEventListener("keydown", key, true); // (before the game's own: an aim it drops is still an aim here)
    return () => removeEventListener("keydown", key, true);
  });

  // the hole's id: the author's alias's next version, as the chain says (v1 if it cannot be read)
  useEffect(() => {
    if (!author) return setId(TRY_HOLE);
    if (!draft.slug) return;
    const { rpc, web } = endpoints(window.location.search), alias = `${author}/${draft.slug}`;
    makeChain({ rpc, web }).versions(alias).then(
      (v) => setId(holeId(author, draft.slug, v)),
      () => (setId(holeId(author, draft.slug, null)), setAside("The chain could not be read: played as a new hole (v1). If it has versions already, play it again once it can be.")),
    );
  }, [author, draft.slug]);

  // the round holed in the weather played (its strokes; 0 not yet), until a play again or the next weather
  const [holed, setHoled] = useState(0);
  // the title card a moment ("Now: Wind"), and the weather just holed, its chip stamped (null: none)
  const [said, setSaid] = useState(""), [stamp, setStamp] = useState<string | null>(null);
  // the weathers not proved yet (a try's one: never proved, so never left)
  const left = !id ? [] : trying ? (holed ? [] : [""]) : unproven(draft.proofs, draft.world, proofKey, id);
  const [kinds, setKinds] = useState<{ kind: string; period: number }[]>([]);
  useEffect(() => {
    if (!id) return;
    host.load(id, hex);
    setKinds(trying ? tryPlan(host, id) : plan(host, id, draft.world, Math.floor(Date.now() / RULES.periodMs)));
  }, [id, hex, host, draft.world, trying]);
  // a try holed before the address: replayed under the author's id in its calm period, the calm proof if it holes there
  // too (the replay is the proof, as for any round); the first weather waits for it, said by its title card then
  const [carry, setCarry] = useState<"" | "waiting" | "done">(tried && !trying ? "waiting" : "");
  useEffect(() => {
    if (carry !== "waiting" || !id || !kinds.length) return;
    const calm = kinds.find((k) => k.kind === "");
    if (!calm || calm.period < 0 || !left.includes("") || !tried) return setCarry("");
    void replay(makeLocalChain(host, holeRow(id, draft), hex, calm.period), { key: proofKey, id, kind: "", period: calm.period, shots: [...tried] }).then((p) => {
      if (typeof p !== "string") (onProof(p), setStamp(""), sound("cup"));
      setCarry(typeof p === "string" ? "" : "done");
    });
  }, [carry, id, kinds]); // eslint-disable-line react-hooks/exhaustive-deps
  // the weather played: the first not proved as it opens, then the next one not proved once it is
  const [on, setOn] = useState<string | null>(null);
  const first = trying ? kinds[0]?.kind : kinds.find((k) => left.includes(k.kind))?.kind;
  useEffect(() => {
    if (on !== null || first === undefined || carry === "waiting") return;
    setOn(first);
    if (carry === "done") setSaid(nowSaid(first));
  }, [on, first, carry]);
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
  const fresh = () => (setHoled(0), setTook(null), (since.current = performance.now()));
  const again = () => (setWhy((w) => (now ? { ...w, [now.kind]: "" } : w)), fresh(), game.current?.reset());
  // a weather proved (its round replayed and counted): its chip stamped, the next starts on its own under a title card a
  // moment ("Now: Wind"); the last ends on the summary
  const provedNow = !trying && !!now && holed > 0 && !checking && !why[now.kind] && !left.includes(now.kind);

  useEffect(() => {
    if (!provedNow || !now) return;
    setStamp(now.kind);
    if (first === undefined) return;
    setSaid(nowSaid(first));
    fresh();
    setOn(first);
  }, [provedNow]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!said && stamp === null) return;
    const t = setTimeout(() => (setSaid(""), setStamp(null)), 1200);
    return () => clearTimeout(t);
  }, [said, stamp]);

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
        if (trying) return (onRound(shots), sound("cup")); // (a try: no replay, no proof; the address asked)
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
  const rows = () => summary(kinds.map(({ kind }) => ({ kind, strokes: mineProofs.find((p) => p.kind === kind)?.strokes ?? 0, ms: times[kind] })), par);
  // every weather holed as it opened: the summary at once (no round to play again)
  const card = proved && !now ? { ...rows(), actions: rows().actions.filter((a) => a.act !== "again") }
    : !holed || !now || checking || trying ? null
    : provedNow ? (first === undefined ? rows() : null)
    : finished({ strokes: holed, kind: now.kind, why: why[now.kind] });
  const act: Record<Act, (() => void) | undefined> = { again, edit: onLeave, publish: onPublish };
  const sign = (a: string) => {
    try { localStorage.setItem(AUTHOR_KEY, a); } catch {}
    onAuthor(a);
  };
  return (
    <main className={`tmode${party ? " tmode--party" : ""}`}>
      {party && <div className="bconfetti" aria-hidden="true">{BITS.map((b, i) => <i key={i} style={{ left: `${b.x}%`, background: b.color, animationDelay: `${b.delay}ms`, ["--drift" as string]: `${b.drift}px`, ["--turn" as string]: `${b.turn}deg` }} />)}</div>}
      <div ref={stage} className="tmode__stage" />
      {/* the game's own HUD (Golf.tsx's hud--top): the strokes and the time, the weather now, the weathers to hole beside; Back to Build */}
      <header className="hud hud--top">
        <div className="card card--score tmode__score" aria-live="polite" aria-atomic="true">
          <span className="eyebrow">Strokes</span>
          <strong>{snap ? snap.strokes : 0}</strong>
          <span className="card__par">{[parSaid(par, guess), time != null ? clock(time) : ""].filter(Boolean).join(" · ") || "\u00a0"}</span>
        </div>
        <Weather w={snap?.weather ?? CALM} flash={snap?.flash ?? 0} night={snap?.time === "night"} world={snap?.look ?? draft.world} />
        <Weathers world={draft.world} list={(trying ? required(draft.world) : kinds.map((k) => k.kind)).map((kind) => ({ kind, done: !trying && !left.includes(kind), playing: now?.kind === kind, bad: !!why[kind] && left.includes(kind),
          best: draft.proofs.find((p) => p.kind === kind && p.key === proofKey && p.id === id)?.strokes, stamp: stamp === kind }))} />
        {onLeave && (
          <div className="hud__right">
            <Button size="m" keycap="Esc" onClick={onLeave}>Back to Build</Button>
          </div>
        )}
      </header>
      {aside && <div className={`tmode__strip${struck ? " tmode__strip--gone" : ""}`} role="status" aria-hidden={struck || undefined}><p>{aside}</p></div>}
      {/* the next weather, a moment: its title card */}
      {said && <p key={said} className="tmode__now" role="status">{said}</p>}
      {(snap?.error || lost || note || checking) && (
        <div className="tmode__notes">
          {snap?.error && <p className="tmode__why" role="alert">{snap.error}</p>}
          {lost && <p className="tmode__why" role="alert">{gone ? "The 3D view did not come back. Reloading brings it back; your draft is kept." : "The browser took the 3D view away for a moment. Bringing it back…"}{gone && <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>}</p>}
          {note && <p className="tmode__note" role="status">{note}</p>}
          {checking && <p className="tmode__note" role="status">The chain&apos;s code replays your round…</p>}
        </div>
      )}
      {now && !card && (
        <footer className="hud hud--bottom">
          {trying && holed > 0 && <AddressLine strokes={holed} onAddress={sign} />}
          {/* (nothing to play again before a first shot) */}
          {(!!snap?.strokes || holed > 0) && <Button title="R or Backspace" keycap="R" onClick={again}>Try again</Button>}
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
                  <Button key={a.act} variant={a.act === "publish" ? "gold" : a.primary ? "primary" : "secondary"} keycap={a.key} onClick={() => act[a.act]?.()}>
                    {a.text}
                  </Button>
                ))}
              </div>
            )}
          </Dialog>
        </div>
      )}
    </main>
  );
}
