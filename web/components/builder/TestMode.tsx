"use client";

// Test mode (the GUI spec's B3; the hole-builder design's "Test mode and
// par"): the game itself (lib/engine, as the page plays a hole) on the
// draft's hole, served by builder.wasm at one clock (localchain.ts), in one
// period of each weather that moves the ball. When the ball drops, the
// round is replayed as its save would be cut (proof.ts replay): that, not
// the live play, is the proof. A chip a weather: ticked once proved, red
// with why once for a round that does not count, each with its time in
// play. The hole's id is fixed first (the author's address, the slug, the
// next version): its weather hangs on it. Prove opens on the first weather
// not proved (the others proved already, their rounds replayed by the
// editor: carry.ts). A quick test (quick) is the same game in calm weather
// only, under an id of its own: no address asked, nothing replayed, nothing
// proved. In play R or Backspace plays again from the tee, V swaps the
// overview camera, Escape goes back to Edit.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { connect, hasAdena } from "@/lib/adena";
import { isAddress, makeChain, RULES } from "@/lib/chain";
import { createGame } from "@/lib/engine";
import { camlog } from "@/lib/testhooks";
import { AUTHOR_KEY, endpoints } from "@/lib/builder/holes";
import { makeLocalChain } from "@/lib/builder/localchain";
import { FIND_BACK, replay, suggestPar, unproven, type Proof } from "@/lib/builder/proof";
import { clock, holeId, holeRow, plan, QUICK_HOLE, quickPlan, testChain } from "@/lib/builder/testmode";
import { playKey } from "@/lib/builder/keys";
import { NO_GL } from "@/lib/builder/editor";
import { hold, stageCanvas, stageRenderer } from "@/lib/builder/stage";
import { ADENA_URL } from "@/lib/network";
import { confetti } from "@/lib/builder/juice";
import { weatherName } from "@/lib/builder/carry";
import { sound } from "@/lib/feel";
import type { Draft } from "@/lib/builder/draft";
import type { BuilderHost } from "@/lib/builder/wasm";
import type { Snapshot } from "@/lib/engine/types";

/** A weather's chip: its sign and its name ("" is clear). */
const SIGNS: Record<string, string> = { "": "☀", wind: "≋", rain: "☂", storm: "⚡", snow: "❄" };
const chip = (k: string): [string, string] => [Object.hasOwn(SIGNS, k) ? SIGNS[k] : "•", weatherName(k)];
/** The celebration's confetti: a little, the same each time. */
const BITS = confetti(28);
/** How far back a weather is looked for (FIND_BACK periods), in days, for a sentence. */
const FIND_DAYS = Math.round((FIND_BACK * RULES.periodMs) / 86_400_000);

/** The address step, Prove's alone: Adena's account, or an address pasted (kept in this browser). */
function AddressStep({ onAddress }: { onAddress: (a: string) => void }) {
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
    </div>
  );
}

export default function TestMode({ host, draft, hex, proofKey, author, guess = 0, quick = false, onAuthor = () => {}, onProof = () => {}, onPar = () => {}, onRound = () => {}, onLeave }: {
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

  // a quick test's one weather: never proved, so never left
  const [holed, setHoled] = useState(0);
  const left = !id ? [] : quick ? (holed ? [] : [""]) : unproven(draft.proofs, draft.world, proofKey, id);
  const [kinds, setKinds] = useState<{ kind: string; period: number }[]>([]);
  useEffect(() => {
    if (!id) return;
    host.load(id, hex);
    setKinds(quick ? quickPlan(host, id) : plan(host, id, draft.world, Math.floor(Date.now() / RULES.periodMs)));
  }, [id, hex, host, draft.world, quick]);
  const now = (quick ? kinds[0] : kinds.find((k) => left.includes(k.kind))) ?? null;
  // each weather's time in play: from its game's start (or a play again) to its proof
  const [times, setTimes] = useState<Record<string, number>>({});
  const since = useRef(0), [tick, setTick] = useState(0);
  useEffect(() => {
    if (!now || !left.includes(now.kind)) return;
    const t = setInterval(() => setTick(performance.now()), 100);
    return () => clearInterval(t);
  }, [now?.kind, left.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const again = () => (setWhy((w) => (now ? { ...w, [now.kind]: "" } : w)), setHoled(0), (since.current = performance.now()), game.current?.reset());

  // the game on the current weather's period; a new one for the next weather
  useEffect(() => {
    if (!id || !now || !canvas) return;
    if (now.period < 0) return setNote(`No ${chip(now.kind)[1].toLowerCase()} came in the last ${FIND_DAYS} days of this hole's weather: it cannot be proved in it.`);
    const renderer = stageRenderer();
    if (!renderer) return setNote(NO_GL); // (the Editor turns Test off then: a page opened on it still says why)
    const { rpc, web } = endpoints(window.location.search);
    const local = makeLocalChain(host, holeRow(id, draft), hex, now.period);
    const g = (game.current = createGame(canvas, {
      renderer, // (the board's, lent: a game leaves no GL objects of its own on the context)
      chain: testChain(makeChain({ rpc, web }), local, hex),
      onChange: (s) => ((aiming.current = s.aiming), setSnap(s)),
      onHoled: ({ shots }) => {
        setTimes((t) => ({ ...t, [now.kind]: performance.now() - since.current }));
        if (quick) return (setHoled(shots.length), onRound(shots), sound("cup")); // (a quick test: no replay, no proof)
        setChecking(true);
        void replay(local, { key: proofKey, id, kind: now.kind, period: now.period, shots: [...shots] }).then((p) => {
          setChecking(false);
          if (typeof p === "string") return setWhy((w) => ({ ...w, [now.kind]: p }));
          setWhy((w) => ({ ...w, [now.kind]: "" }));
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

  // every weather proved: the par they suggest; proved here, by this visit's last round, a small celebration
  // (the chips fill one by one, a little confetti, a chime; Publish pulses in the header)
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

  if (!author && !quick) return <main className="tmode tmode--ask"><AddressStep onAddress={(a) => { try { localStorage.setItem(AUTHOR_KEY, a); } catch {} onAuthor(a); }} /></main>;
  const par = proved ? suggestPar(draft.proofs.filter((p) => p.key === proofKey && p.id === id)) : 0;
  const failed = now && why[now.kind];
  return (
    <main className={`tmode${party ? " tmode--party" : ""}`}>
      {party && <div className="bconfetti" aria-hidden="true">{BITS.map((b, i) => <i key={i} style={{ left: `${b.x}%`, background: b.color, animationDelay: `${b.delay}ms`, ["--drift" as string]: `${b.drift}px`, ["--turn" as string]: `${b.turn}deg` }} />)}</div>}
      <div ref={stage} className="tmode__stage" />
      <div className="tmode__strip" aria-label="The weathers to beat">
        {kinds.map(({ kind }, i) => {
          const done = !left.includes(kind), on = now?.kind === kind, bad = !!why[kind] && !done;
          const best = quick ? holed : draft.proofs.find((p) => p.kind === kind && p.key === proofKey && p.id === id)?.strokes;
          const time = Object.hasOwn(times, kind) ? times[kind] : on && tick ? tick - since.current : null;
          return <span key={kind} style={{ animationDelay: `${i * 140}ms` }} className={`tmode__chip${done ? " tmode__chip--done" : on ? " tmode__chip--now" : ""}${bad ? " tmode__chip--bad" : ""}`}>{chip(kind)[0]} {quick ? "Calm" : chip(kind)[1]}{done ? ` ✓ ${best ?? ""}` : on ? ", now" : ""}{time != null && <small className="tmode__time">{clock(time)}</small>}</span>;
        })}
        {!quick && <span className="tmode__par" title={par ? "Par, from your rounds" : guess ? "Par, the difficulty meter's guess until your rounds set it" : undefined}>{par ? `Par ${par}` : guess ? `Par ${guess}?` : "Par –"}</span>}
      </div>
      <div className="tmode__card" aria-live="polite">{checking ? "The chain's code replays your round…" : `Stroke ${snap ? snap.strokes : 0}`}</div>
      <div className="tmode__notes">
        {failed && <p className="tmode__why" role="alert">That {chip(now.kind)[1].toLowerCase()} round doesn&apos;t count: {failed} Play it again.</p>}
        {snap?.error && <p className="tmode__why" role="alert">{snap.error}</p>}
        {note && <p className="tmode__note" role="status">{note}</p>}
        {proved && <p className="tmode__done" role="status">Holed in every weather: publish it.</p>}
        {quick && <p className="tmode__note" role="status">{holed ? `Holed in ${holed}. ` : ""}Quick test: calm weather, not a proof. Prove it to publish.</p>}
      </div>
      {!proved && <Button className="tmode__again" title="R or Backspace" onClick={again}>Play it again</Button>}
    </main>
  );
}
