"use client";

// The editor (the GUI spec's B1 and B2): the header, the palette, the board
// with its checks docked under it, the selected piece and the player's
// view. The draft lives in a session (its history; a drag one step); every
// change is checked by the whole pipeline (pipeline.ts validate, the render
// census included) 150 ms after the last, and nothing that breaks the hole
// is ever made: the board, the inspector and the keys all ask first
// (edit.ts). The ball shows in Build too: quick shots pulled on the board,
// played on the hole as it is (quickshot.ts), and the meter's best line;
// never a proof. Play (T) plays the hole over the editor (kept open below
// it: the same zoom, selection and history after): with the author's
// address, each round a try at the next weather not holed, its proof kept
// in the draft (TestMode); the difficulty's change said as it comes ("par 3
// → 4"), and a ghost ball runs the meter's line after a drop.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui";
import { useFlash } from "@/components/common";
import { census } from "@/lib/builder/drawn";
import { canPlace, toWorld, copyPiece, dropEnd, errorsOf, fixOf, movePiece, newErrors, placeNear, placePiece, removePiece, roomFor, whereOf, clampMove } from "@/lib/builder/edit";
import { brokenLine, CHECKING, gauges, meterFace, NO_GL, offAtLimit, pieceGauges, playWhenAsked, sameShape, testGate } from "@/lib/builder/editor";
import { stageRenderer } from "@/lib/builder/stage";
import { retitle } from "@/lib/builder/templates";
import { frame } from "@/lib/builder/gg1";
import { notTurned, QUARTER, snap, turnPiece } from "@/lib/builder/handles";
import { loadPalette, type PaletteEntry } from "@/lib/builder/palette";
import { atFault, validate, type ValidateOptions, type Validated } from "@/lib/builder/pipeline";
import { canonicalHex, parAllowed, proofKey, provedAs, type Proof } from "@/lib/builder/proof";
import { dropped, toCarry, withCarried } from "@/lib/builder/carry";
import { FIELD, listed, weatherName } from "@/lib/builder/rules";
import { makeSession } from "@/lib/builder/session";
import type { Issue } from "@/lib/builder/checks";
import type { Draft, V } from "@/lib/builder/draft";
import type { BuilderHost } from "@/lib/builder/wasm";
import type { Hole } from "@/lib/scene/data";
import Board from "./Board";
import Checks from "./Checks";
import Header from "./Header";
import Inspector, { MOD, useOnce } from "./Inspector";
import Palette from "./Palette";
import { refusalOf } from "@/lib/builder/explain";
import type { Shown } from "@/lib/builder/difficulty";
import { makeMeter, type Meter } from "@/lib/builder/meter";
import Hints from "./Hints";
import TestMode from "./TestMode";
import PlayerView from "./PlayerView";
import type { Eye } from "./Scene";
import { keyAction } from "@/lib/builder/keys";
import { seedOf, suggestName } from "@/lib/builder/naming";
import { armedByKey } from "@/lib/builder/tiles";
import { sound } from "@/lib/feel";
import { quickShots, roundOf, type QuickShot } from "@/lib/builder/quickshot";
import { FLAT, fromPlane, TILT, type Look } from "@/lib/builder/view";

/** How long after the last change the whole pipeline runs. */
const CHECK_MS = 150;
/** How long after a clean check the difficulty meter is asked (about 400 ms after the last change). */
const METER_MS = 250;
/** The Builder's worlds, for the header's "…" menu. */
const WORLDS = Object.keys(FIELD);
/** Quick shots kept on the board: the latest and three faded. */
const SHOTS_KEPT = 4;

export default function Editor({ host, first, author, onSave, onBack, onPublish, onAuthor, play: playFirst = false, hints = false, onHinted = () => {}, opened = "" }: {
  host: BuilderHost;
  first: Draft;
  author: string | null;
  /** the draft as it stands, after each step: kept in the browser */
  onSave: (d: Draft) => void;
  onBack: () => void;
  /** Publish: the draft proved in every weather as it is */
  onPublish: (d: Draft) => void;
  /** the author's address, given in play (kept in this browser) */
  onAuthor: (a: string) => void;
  /** Play as soon as the hole is checked (back from Publish to play it again) */
  play?: boolean;
  /** the first run's three hints shown (Hints), gone at the first drag */
  hints?: boolean;
  onHinted?: () => void;
  /** a file opened as it is: why it is broken, said until it passes ("" none) */
  opened?: string;
}) {
  // one session (its undo history) while the editor is open: a step saved and handed back is not a new draft (its key opens a new one)
  const [session] = useState(() => makeSession(first));
  const [, bump] = useState(0);
  const [again, setAgain] = useState(false); // the hints asked for again (the header's "?")
  const draft = session.now(), kept = session.kept();
  // the hole as kept, as checked: the same object while only its proofs or par change (a round holed in play is no
  // reason to validate, census and meter it again mid-game); every check, key and meter answer is of it
  const shapeOf = useRef(kept);
  if (!sameShape(shapeOf.current, kept)) shapeOf.current = kept;
  const shape = shapeOf.current;
  const [palette, setPalette] = useState<readonly PaletteEntry[] | null>(null);
  // the world the palette is of (a switch hands it over with the draft: nothing unmounts to load it again)
  const paletteWorld = useRef("");
  // its load failed (offline, an old deploy's chunk gone), and each Try again (the world's loader forgets a failed load)
  const [unloaded, setUnloaded] = useState(false), [tries, setTries] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [show, setShow] = useState<{ id: string; n: number } | null>(null); // Show me: the piece to frame
  const [armed, setArmed] = useState<PaletteEntry | null>(null);
  const [binShown, setBinShown] = useState(false); // a piece carried on the board: the palette's bin shown
  const [said, setSaid] = useState("");
  const [checked, setChecked] = useState<{ of: Draft; v: Validated; state: Hole | null } | null>(null);
  const [fine, setFine] = useState(false);
  // the die by the name: a name suggested from the draft as opened, another at each roll
  const [dice, setDice] = useState(0), seed = useMemo(() => seedOf(first), [first]);
  // Space held: a drag pans the board; F: the hole framed again (asked n times); each tile's look as chosen (the keys arm it)
  const [pan, setPan] = useState(false);
  const [frameAsk, setFrameAsk] = useState(0);
  const [chosen, setChosen] = useState<{ world: string; looks: Record<string, string> }>({ world: first.world, looks: {} });
  const looks = chosen.world === draft.world ? chosen.looks : {};
  const [key, setKey] = useState<{ of: Draft; key: string | null } | null>(null);
  const sayTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // the difficulty meter (its worker), and its last answer with the draft it is of
  const meter = useRef<Meter | null>(null);
  const [est, setEst] = useState<{ of: Draft; e: Shown | null } | null>(null);
  // the proofs an edit carried over (carry.ts, in the worker): the draft being carried (Play waits for it), what
  // came of it for the hole as it is now (its key), the key before it, and the toast of the proofs an edit dropped
  const [carrying, setCarrying] = useState<Draft | null>(null);
  const [rounds, setRounds] = useState<{ key: string; kept: string[]; broken: string[] } | null>(null);
  const prevKey = useRef<string | null>(null);
  const [toast, setToast] = useState("");
  // quick shots: the last few pulled (their specs, played again on the hole as it is now), the one being pulled, and the meter's line shown
  const [shots, setShots] = useState<QuickShot[]>([]);
  const [aim, setAim] = useState<QuickShot | null>(null);
  const [lineOn, setLineOn] = useState(false);
  // the meter's par last measured (a change said a moment by the chip: "par 3 → 4"); a drop that held, waiting for the
  // ghost ball's run on the hole it made ("next": the change it makes, bound as it is kept; any other change since drops
  // it); the run, a moment
  const lastPar = useRef(0), [parBump, setParBump] = useFlash(1800, ""), landed = useRef<Draft | "next" | null>(null);
  const [roll, setRoll] = useFlash<{ path: V[][]; n: number } | null>(1300, null);
  // the keys line at the board's foot, a browser's first visit only (and the rest of it); the player's view large (P)
  const keysLine = useOnce("keys"), [large, setLarge] = useState(false);
  // how the board is looked at: V tilts it, Q turns it a quarter (the 3D board; the 2D one too)
  const [look, setLook] = useState<Look>(FLAT);
  // a timed piece's blinking played, in the inspector and on the board (its pause holds both)
  const [blinking, setBlinking] = useState(true);
  // Play (T): the hole as kept, its canonical bytes and proof key, played over the editor (kept open: the same zoom, selection and history after)
  // (the author it opened with: one Adena shares late never swaps a game under way; the address given in play does)
  const [playing, setPlaying] = useState<{ hex: string; key: string; author: string | null } | null>(null), [want, setWant] = useState(playFirst);
  // the last try's round that holed (no address yet), left on the board as a dotted trail (played again as the hole changes)
  const [trail, setTrail] = useState<QuickShot[]>([]), [tried, setTried] = useState<readonly string[] | null>(null);
  // the player's view (PlayerView.tsx), painted by the board's 3D scene
  const [eye] = useState<Eye>(() => ({ canvas: null, paint: () => {} }));
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const refresh = () => bump((n) => n + 1);
  const say = useCallback((text: string) => {
    setSaid(text);
    clearTimeout(sayTimer.current);
    sayTimer.current = setTimeout(() => setSaid(""), 4000);
  }, []);
  useEffect(() => () => (clearTimeout(sayTimer.current), clearTimeout(toastTimer.current)), []);

  // the world's palette, loaded with its module
  useEffect(() => {
    if (palette && paletteWorld.current === draft.world) return;
    let stale = false;
    setPalette(null);
    setUnloaded(false);
    void loadPalette(draft.world).then((p) => !stale && ((paletteWorld.current = draft.world), setPalette(p)), () => !stale && setUnloaded(true));
    return () => void (stale = true);
  }, [draft.world, tries]); // eslint-disable-line react-hooks/exhaustive-deps -- (palette: read, not a reason to load)

  const quick: ValidateOptions | null = useMemo(() => palette && { host, palette, slug: draft.slug || undefined }, [host, palette, draft.slug]);
  const full: ValidateOptions | null = useMemo(() => quick && { ...quick, census }, [quick]);

  // the whole pipeline on the hole as kept (a drag's own checks are the board's), 150 ms after the last change; the 3D from its canonical bytes
  useEffect(() => {
    if (!full) return;
    const t = setTimeout(() => {
      const v = validate(shape, full); // (its state, read for the census, is what the preview draws)
      setChecked({ of: shape, v, state: v.state ?? null });
      void proofKey(shape, host).then((k) => setKey({ of: shape, key: k }));
    }, CHECK_MS);
    return () => clearTimeout(t);
  }, [shape, full, host]);

  // each step kept in the browser
  useEffect(() => onSave(kept), [kept, onSave]);

  // the meter: its worker while the editor is open, asked METER_MS after a check of the draft as kept finds no error
  useEffect(() => {
    const m = (meter.current = makeMeter((of, e) => setEst({ of, e })));
    return () => m?.stop();
  }, []);
  const clean = !!checked && checked.of === shape && !checked.v.issues.some((i) => i.severity === "error");
  useEffect(() => {
    if (!clean) return;
    const t = setTimeout(() => meter.current?.ask(shape), METER_MS);
    return () => clearTimeout(t);
  }, [clean, shape]);
  const guess = clean && est?.e ? est.e : null;
  // the quick shots on the hole as shown (a drag's too: they replay live), the one being pulled last
  const shotsPlayed = useMemo(() => quickShots(host, draft, aim ? [...shots, aim] : shots) ?? [], [host, draft, shots, aim]);
  const shotsShown = aim ? shotsPlayed.slice(0, -1) : shotsPlayed;
  const trailed = useMemo(() => quickShots(host, draft, trail) ?? [], [host, draft, trail]);
  // a new quick shot holed: the cup's sound (its putt is played as it is let go)
  const shotSeen = useRef<QuickShot | undefined>(undefined);
  useEffect(() => {
    if (shots.at(-1) === shotSeen.current || aim) return;
    shotSeen.current = shots.at(-1);
    if (shotsShown.at(-1)?.holed) sound("cup");
  }, [shots, aim, shotsShown]);
  // the meter's answer for the hole as kept: a change of par said a moment by the chip, with a chime (up: lower, harder);
  // after a drop that held, the ghost ball runs its line (the answer for the hole the drop made, never a later one's)
  useEffect(() => void (landed.current = landed.current === "next" ? shape : null), [shape]);
  useEffect(() => {
    if (est?.of !== shape) return;
    const par = est.e?.par ?? 0, was = lastPar.current;
    lastPar.current = par || was;
    if (par && was && par !== was) (setParBump(`par ${was} → ${par}`), sound("chime", par > was ? 0 : 4));
    if (landed.current === shape && est.e?.path.length) setRoll((r) => ({ path: est.e!.path, n: (r?.n ?? 0) + 1 }));
    landed.current = null;
  }, [est, shape, setParBump, setRoll]);

  // a new key for the hole as kept: the author's rounds of the hole before replayed on its bytes, off the main
  // thread; those that still hole in their strokes are its proofs (the step amended, never one of its own), the
  // others said; the weathers the edit dropped said once in a toast, an undo away from kept
  useEffect(() => {
    const k = key?.of === shape ? key.key : null, prev = prevKey.current;
    if (!k || k === prev) return;
    prevKey.current = k;
    const sayDropped = (proofs: Draft["proofs"]) => {
      const gone = dropped(proofs, prev, k).map(weatherName);
      if (!gone.length) return;
      setToast(`This drops your ${listed(gone)} proof${gone.length > 1 ? "s" : ""} · ${MOD}Z keeps ${gone.length > 1 ? "them" : "it"}`);
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(""), 5000);
    };
    const hex = author && kept.slug && meter.current && toCarry(kept.proofs, k, author, kept.slug).length ? canonicalHex(kept, host) : null;
    if (!author || hex == null || !meter.current) return sayDropped(kept.proofs);
    setCarrying(kept);
    void meter.current.carry(kept, hex, k, author).then((c) => {
      setCarrying((x) => (x === kept ? null : x));
      if (session.kept() !== kept) return; // (an edit since: its own carry)
      const proofs = c?.proofs.length ? withCarried(kept.proofs, c.proofs) : kept.proofs;
      if (proofs !== kept.proofs) (session.amend({ ...kept, proofs }), refresh());
      setRounds({ key: k, kept: c?.proofs.map((p) => p.kind) ?? [], broken: c?.broken.map((b) => b.why) ?? [] });
      sayDropped(proofs);
    });
  }, [key, kept, shape, author, host, session]);

  const set = (d: Draft) => (session.set(frame(d)), refresh());
  const preview = (d: Draft) => (session.preview(d), refresh());
  const commit = () => (session.commit(), refresh());
  const cancel = () => (session.cancel(), refresh());

  /** A one-step edit, made only if the hole holds (census and all). */
  const tryEdit = (next: Draft | null, fail: string) => {
    if (!next || !full) return say(fail);
    const why = newErrors(errorsOf(draft, full), next, full);
    if (why.length) return say(refusalOf(why[0]));
    set(next);
  };
  const piece = draft.pieces.find((p) => p.id === selected) ?? null;
  const turn = () => {
    if (!piece || !full) return;
    const same = notTurned(piece, draft.tee);
    if (same) return say(same);
    const t = turnPiece(piece, draft.tee), why = canPlace(draft, t, full);
    if (why.length) return say(refusalOf(why[0]));
    set({ ...draft, pieces: draft.pieces.map((p) => (p.id === piece.id ? t : p)) });
  };
  // a copy, or the keyboard's drop, past the Builder's limits: refused with why (the ghost says it on the board)
  const copy = () => piece && quick && tryEdit(copyPiece(draft, piece.id, quick), roomFor(draft, piece) || "No room near it for a copy.");
  // deleted: the focus to the board (Tab goes on to its pieces), not lost with the Inspector's button
  const remove = () => {
    if (!piece) return;
    tryEdit(removePiece(draft, piece.id), "");
    setSelected(null);
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".board")?.focus());
  };
  const nudge = (d: V) => {
    if (!piece || !quick || !full) return;
    const w = whereOf(piece.geometry), to = clampMove(draft, piece.id, snap([w[0] + d[0], w[1] + d[1]], QUARTER, draft.tee), quick);
    tryEdit({ ...draft, pieces: draft.pieces.map((p) => (p.id === piece.id ? movePiece(piece, to) : p)) }, "");
  };
  const fix = (i: Issue) => quick && tryEdit(fixOf(i, draft, quick), "No free place near it: move it by hand.");
  // the keyboard: the tee or the cup moved as a drag lets it go; the armed piece dropped between them, then selected
  const moveEnd = (which: "tee" | "pin", d: V) => {
    if (!quick || !full) return;
    const r = dropEnd(draft, which, snap([draft[which][0] + d[0], draft[which][1] + d[1]], QUARTER, draft.tee), quick, full);
    if ("why" in r) return r.why && say(r.why);
    set(r);
  };
  const dropArmed = () => {
    if (!armed || !quick || !full) return;
    const at: V = [(draft.tee[0] + draft.pin[0]) / 2, (draft.tee[1] + draft.pin[1]) / 2], r = placeNear(draft, armed, at, quick, full);
    if (!r) return say(roomFor(draft, placePiece(armed, "", at)) || "No free place for it between the tee and the cup.");
    if ("why" in r) return say(r.why);
    set(r.draft);
    setArmed(null);
    setSelected(r.id);
  };
  // another world: judged there before it is made (edit.ts toWorld), on the draft as it is once that world's pieces are in
  const world = (w: string) => {
    if (!full) return;
    void loadPalette(w).then((p) => {
      const r = toWorld(session.kept(), w, p, full);
      if ("refused" in r) return say(`The ${w} has no ${r.refused.join(", ")}.`);
      if ("why" in r) return say(`Not in the ${w}: ${r.why}`);
      // (its pieces with it, in the same render: the board and the column stay mounted, the hole built once)
      paletteWorld.current = w;
      setPalette(p);
      set(r);
    }, () => say(`The ${w}'s pieces could not load: try again.`)); // (offline, a deploy mid-flight: the hole stays where it is)
  };

  // the keys: always the editor's, never a field's
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (playing) return; // (in play, the keys are the game's)
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea, [contenteditable], dialog, [role=dialog], [role=alertdialog]")) return; // (a dialog's keys are its own)
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Alt") return setFine(true);
      // Space: held, a drag pans (a button keeps its Space unless the pointer is on the board)
      if (e.key === " " && !mod && (!t.closest("button, a, summary") || document.querySelector(".board:hover"))) return (e.preventDefault(), setPan(true));
      const act = keyAction(e);
      if (act?.t === "arm" && palette) {
        const en = armedByKey(palette, act.n, looks);
        if (!en) return;
        if (off.has(en.id)) return say(off.get(en.id)!);
        if (armed?.id !== en.id) sound("select");
        return setArmed(en);
      }
      if (act?.t === "frame") return setFrameAsk((n) => n + 1);
      if (act?.t === "help") return setAgain(true);
      if (act?.t === "tilt") return setLook((l) => ({ ...l, tilt: l.tilt ? 0 : TILT }));
      if (act?.t === "turn") return setLook((l) => ({ ...l, turns: (l.turns + act.by + 4) % 4 }));
      if (act?.t === "play") return play();
      if (act?.t === "view") return setLarge(true);
      if (mod && e.key.toLowerCase() === "z") return (e.preventDefault(), e.shiftKey ? session.redo() : session.undo(), refresh());
      if (e.key === "Escape") return (setArmed(null), setSelected(null), setShots([]), setTrail([]));
      const arrows: Record<string, V> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      // (an arrow moves a piece the way it points on the screen, however the board is turned)
      const step = (k: string) => fromPlane(arrows[k].map((x) => x * (e.shiftKey ? 2 : 0.5)) as V, { turns: look.turns, tilt: 0 });
      if (e.key === "Enter" && armed && !t.closest("button, a")) return (e.preventDefault(), dropArmed());
      if ((selected === "tee" || selected === "pin") && arrows[e.key]) return (e.preventDefault(), moveEnd(selected, step(e.key)));
      if (!piece) return;
      if (mod && e.key.toLowerCase() === "d") return (e.preventDefault(), copy());
      if (e.key === "Delete" || e.key === "Backspace") return (e.preventDefault(), remove());
      if (e.key.toLowerCase() === "r" && !mod) return turn();
      if (arrows[e.key]) return (e.preventDefault(), nudge(step(e.key)));
    };
    const up = (e: KeyboardEvent) => (e.key === "Alt" && setFine(false), e.key === " " && setPan(false));
    const away = () => (setPan(false), setFine(false));
    window.addEventListener("blur", away);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", up);
    return () => (window.removeEventListener("keydown", key), window.removeEventListener("keyup", up), window.removeEventListener("blur", away));
  });

  const v = checked?.v, fresh = checked?.of === shape;
  const errors = v ? v.issues.filter((i) => i.severity === "error") : [];
  const bad = v ? atFault(v, kept.pieces.map((p) => p.id)) : new Set<string>(); // (both of an overlap, each piece an error meets)
  const gl = !!stageRenderer();
  const off = palette ? offAtLimit(draft, palette) : new Map<string, string>();
  // Play: the hole as kept, checked with no error, named, its proofs carried over and its key known
  const playOff = testGate(shape, checked, gl) || (carrying === kept || key?.of !== shape || !key.key ? CHECKING : "");
  function play() {
    const hex = !playOff && key?.key ? canonicalHex(kept, host) : null;
    if (hex != null) (setArmed(null), setAim(null), setTried(null), setPlaying({ hex, key: key!.key!, author }), onHinted());
  }
  // back from Publish to play it again: as soon as the hole is checked; dropped if it cannot start (never opened later, unasked)
  useEffect(() => {
    const now = playWhenAsked(want, playOff);
    if (now !== "wait") (setWant(false), now === "play" && play());
  }, [want, playOff]); // eslint-disable-line react-hooks/exhaustive-deps -- (play: the render's own)
  // proved as it is now: Publish open and lit (proofs keep while the hole is the same: an undo brings them back)
  const proved = !playOff && !!author && !!provedAs(kept.proofs, kept.world, key!.key!, author, kept.slug);
  // a round of play's proof, kept in the draft as kept (the step amended: an undo before it drops it with the edit)
  const amend = (f: (k: Draft) => Draft) => (session.amend(f(session.kept())), refresh());
  const prove = (p: Proof) => amend((k) => ({ ...k, proofs: [...k.proofs.filter((q) => !(q.kind === p.kind && q.id === p.id && q.key === p.key)), p] }));
  const setPar = (par: number) => playing && amend((k) => (parAllowed(k.proofs.filter((q) => q.key === playing.key), k.par) ? k : { ...k, par }));
  // the first run's hints: gone at the first drag (a piece taken from the palette, or one carried on the board)
  useEffect(() => void (hints && (armed || binShown) && onHinted()), [hints, armed, binShown, onHinted]);
  return (
    <main className={`bench tint--${draft.world}`}>
      <Header title={draft.title} world={draft.world} worlds={WORLDS} step="edit"
        steps={{ edit: { locked: "", done: false }, play: { locked: playOff && playOff !== CHECKING ? (gl ? playOff : NO_GL) : "", done: proved }, publish: { locked: proved ? "" : "Sink it in every weather first", done: false } }}
        action={{ text: "Play", key: "T", off: playOff, onClick: play }}
        meter={meterFace(clean, est, shape)} lineOn={lineOn} onLine={guess || lineOn ? () => setLineOn((on) => !on) : undefined} bump={parBump}
        history={{ undo: () => (session.undo(), refresh()), redo: () => (session.redo(), refresh()), canUndo: session.canUndo(), canRedo: session.canRedo() }}
        onTitle={(t) => (session.edit((k) => frame(retitle(k, t))), refresh())} onWorld={world} onStep={(s) => (s === "play" ? play() : s === "publish" && proved && onPublish(kept))} onBack={onBack} onHelp={() => setAgain(true)}
        onRoll={() => (sound("blip"), session.edit((k) => frame(retitle(k, suggestName(k.world, seed, dice)))), setDice((n) => n + 1), refresh())} />
      {palette && quick && full ? (
        <>
          <Palette world={draft.world} palette={palette} armed={armed} off={off} bin={binShown} onArm={setArmed} chosen={looks} />
          <div className="centre">
            {toast && <p className="btoast" role="status">{toast}</p>}
            {opened && errors.length > 0 && <p className="bbroken" role="status">{opened}</p>}
            <Board draft={draft} quick={quick} full={full} selected={selected} armed={armed} step={fine ? 0.25 : 0.5} bad={bad} pan={pan} frameAsk={frameAsk}
              onSelect={setSelected} onPreview={preview} onCommit={commit} onCancel={cancel} onSet={set} onBin={(id) => tryEdit(removePiece(draft, id), "")} onCarry={setBinShown} onDisarm={() => setArmed(null)} said={said} show={show} look={look} scene={{ state: checked?.state ?? null, of: checked?.of ?? null, paused: !blinking, keep: blinking && piece?.clock.k === "substep", eye }}
              keys={keysLine} onLanded={() => void (landed.current = "next")} roll={roll}
              ball={{
                played: shotsShown, trail: trailed, last: shots.at(-1) ?? null, aimed: aim ? shotsPlayed.at(-1) ?? null : null,
                line: lineOn && guess && est?.of === shape && draft === kept ? { path: guess.path, heat: guess.heat } : null,
                onAim: setAim, onShot: (q) => (sound("putt"), setAim(null), setShots((s) => [...s, q].slice(-SHOTS_KEPT))),
              }} />
            <Checks broken={brokenLine({ errors: errors.length, proved, rounds: rounds && key?.of === shape && rounds.key === key.key ? rounds : null })} gauges={[...pieceGauges(draft), ...(v?.hole && v.cost && v.hex ? gauges(v.hole, v.cost, v.hex.length / 2) : [])]}
              issues={v?.issues ?? []} busy={!fresh} onShow={(id) => (setSelected(id), setShow((s) => ({ id, n: (s?.n ?? 0) + 1 })))} onFix={fix} />
          </div>
          <aside className="col" aria-label="The selected piece">
            <Inspector draft={draft} piece={piece} quick={quick} full={full} playing={blinking} onPlay={() => setBlinking((on) => !on)} onPreview={preview} onCommit={commit} onCancel={cancel} onSet={set} onSay={say} onTurn={turn} onCopy={copy} onDelete={remove}
              onChoose={(tile, id) => setChosen({ world: draft.world, looks: { ...looks, [tile]: id } })} />
            {gl && <PlayerView eye={eye} large={large} onLarge={setLarge} />}
          </aside>
        </>
      ) : (
        unloaded ? (
          <div className="bench__wait" role="alert">
            <p>The {draft.world}&apos;s pieces could not load: check the connection.</p>
            <Button type="button" onClick={() => setTries((n) => n + 1)}>Try again</Button>
          </div>
        ) : <p className="bench__wait" aria-busy="true">Loading the {draft.world}&apos;s pieces…</p>
      )}
      {playing && (
        <div className={`tbench tbench--play tint--${draft.world}`}>
          {/* (a new game once the address is given: its rounds the author's from then on) */}
          <TestMode key={playing.author ?? ""} host={host} draft={kept} hex={playing.hex} proofKey={playing.key} author={playing.author} guess={guess?.par ?? 0}
            onAuthor={(a) => (setPlaying((p) => p && { ...p, author: a }), onAuthor(a))}
            onProof={prove} onPar={setPar} tried={tried} onRound={(r) => (setTried(r), setTrail(roundOf(host, kept, r)))} onLeave={() => setPlaying(null)} onPublish={() => (setPlaying(null), onPublish(session.kept()))} />
        </div>
      )}
      {(hints || again) && <Hints glossary={again && palette ? { world: draft.world, palette } : null} onDone={() => (setAgain(false), onHinted())} />}
    </main>
  );
}
