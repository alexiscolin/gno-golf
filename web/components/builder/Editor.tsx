"use client";

// The editor (the GUI spec's B1 and B2): the header, the palette, the board
// with its checks docked under it, the 3D and the selected piece. The draft
// lives in a session (its history; a drag one step); every change is
// checked by the whole pipeline (pipeline.ts validate, the render census
// included) 150 ms after the last, and nothing that breaks the hole is ever
// made: the board, the inspector and the keys all ask first (edit.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { census } from "@/lib/builder/drawn";
import { canPlace, toWorld, copyPiece, dropEnd, errorsOf, fixOf, movePiece, newErrors, placeNear, placePiece, removePiece, roomFor, snap, whereOf, clampMove } from "@/lib/builder/edit";
import { gauges, offAtLimit, pieceGauges, testGate, verdict } from "@/lib/builder/editor";
import { retitle } from "@/lib/builder/templates";
import { frame } from "@/lib/builder/gg1";
import { notTurned, turnPiece } from "@/lib/builder/handles";
import { loadPalette, type PaletteEntry } from "@/lib/builder/palette";
import { validate, type ValidateOptions, type Validated } from "@/lib/builder/pipeline";
import { proofKey, provedAs } from "@/lib/builder/proof";
import { FIELD } from "@/lib/builder/rules";
import { makeSession } from "@/lib/builder/session";
import type { Issue } from "@/lib/builder/checks";
import type { Draft, V } from "@/lib/builder/draft";
import type { BuilderHost } from "@/lib/builder/wasm";
import type { Hole } from "@/lib/scene/data";
import Board from "./Board";
import Checks from "./Checks";
import Header, { type Step } from "./Header";
import Inspector from "./Inspector";
import Palette from "./Palette";
import Preview from "./Preview";
import { plainOf } from "@/lib/builder/explain";
import type { Shown } from "@/lib/builder/difficulty";
import { makeMeter, type Meter } from "@/lib/builder/meter";
import Hints from "./Hints";

/** How long after the last change the whole pipeline runs. */
const CHECK_MS = 150;
/** How long after a clean check the difficulty meter is asked (about 400 ms after the last change). */
const METER_MS = 250;
/** The id the 3D's hole is loaded under in the builder's wasm. */
const WORLDS = Object.keys(FIELD);

export default function Editor({ host, first, author, onSave, onBack, onTest, onPublish, onEstimate = () => {}, hints = false, onHinted = () => {} }: {
  host: BuilderHost;
  first: Draft;
  author: string | null;
  /** the draft as it stands, after each step: kept in the browser */
  onSave: (d: Draft) => void;
  onBack: () => void;
  /** Test it: the draft with no error */
  onTest: (d: Draft) => void;
  /** Publish: the draft proved in every weather as it is */
  onPublish: (d: Draft) => void;
  /** the meter's par for the draft as kept (0: none), shown in Test until its rounds set one */
  onEstimate?: (par: number) => void;
  /** the first run's three hints shown (Hints), and their Got it */
  hints?: boolean;
  onHinted?: () => void;
}) {
  // one session (its undo history) while the editor is open: a step saved and handed back is not a new draft (its key opens a new one)
  const [session] = useState(() => makeSession(first));
  const [, bump] = useState(0);
  const [again, setAgain] = useState(false); // the hints asked for again (the header's "?")
  const draft = session.now(), kept = session.kept();
  const [palette, setPalette] = useState<readonly PaletteEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [show, setShow] = useState<{ id: string; n: number } | null>(null); // Show me: the piece to frame
  const [armed, setArmed] = useState<PaletteEntry | null>(null);
  const [said, setSaid] = useState("");
  const [checked, setChecked] = useState<{ of: Draft; v: Validated; state: Hole | null } | null>(null);
  const [fine, setFine] = useState(false);
  const [key, setKey] = useState<{ of: Draft; key: string | null } | null>(null);
  const sayTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // the difficulty meter (its worker), and its last answer with the draft it is of
  const meter = useRef<Meter | null>(null);
  const [est, setEst] = useState<{ of: Draft; e: Shown | null } | null>(null);

  const refresh = () => bump((n) => n + 1);
  const say = useCallback((text: string) => {
    setSaid(text);
    clearTimeout(sayTimer.current);
    sayTimer.current = setTimeout(() => setSaid(""), 4000);
  }, []);
  useEffect(() => () => clearTimeout(sayTimer.current), []);

  // the world's palette, loaded with its module
  useEffect(() => {
    let stale = false;
    setPalette(null);
    void loadPalette(draft.world).then((p) => !stale && setPalette(p), () => say("This world's pieces could not load. Reload the page."));
    return () => void (stale = true);
  }, [draft.world, say]);

  const quick: ValidateOptions | null = useMemo(() => palette && { host, palette, slug: draft.slug || undefined }, [host, palette, draft.slug]);
  const full: ValidateOptions | null = useMemo(() => quick && { ...quick, census }, [quick]);

  // the whole pipeline on the draft as kept (a drag's own checks are the board's), 150 ms after the last change; the 3D from its canonical bytes
  useEffect(() => {
    if (!full) return;
    const t = setTimeout(() => {
      const v = validate(kept, full); // (its state, read for the census, is what the preview draws)
      setChecked({ of: kept, v, state: v.state ?? null });
      void proofKey(kept, host).then((k) => setKey({ of: kept, key: k }));
    }, CHECK_MS);
    return () => clearTimeout(t);
  }, [kept, full, host]);

  // each step kept in the browser
  useEffect(() => onSave(kept), [kept, onSave]);

  // the meter: its worker while the editor is open, asked METER_MS after a check of the draft as kept finds no error
  useEffect(() => {
    const m = (meter.current = makeMeter((of, e) => setEst({ of, e })));
    return () => m?.stop();
  }, []);
  const clean = !!checked && checked.of === kept && !checked.v.issues.some((i) => i.severity === "error");
  useEffect(() => {
    if (!clean) return;
    const t = setTimeout(() => meter.current?.ask(kept), METER_MS);
    return () => clearTimeout(t);
  }, [clean, kept]);
  const guess = clean && est?.e ? est.e : null, measuring = clean && est?.of !== kept;
  useEffect(() => void (est?.of === kept && onEstimate(est.e?.par ?? 0)), [est, kept, onEstimate]);

  const set = (d: Draft) => (session.set(frame(d)), refresh());
  const preview = (d: Draft) => (session.preview(d), refresh());
  const commit = () => (session.commit(), refresh());
  const cancel = () => (session.cancel(), refresh());

  /** A one-step edit, made only if the hole holds (census and all). */
  const tryEdit = (next: Draft | null, fail: string) => {
    if (!next || !full) return say(fail);
    const why = newErrors(errorsOf(draft, full), next, full);
    if (why.length) return say(plainOf(why[0]));
    set(next);
  };
  const piece = draft.pieces.find((p) => p.id === selected) ?? null;
  const turn = () => {
    if (!piece || !full) return;
    const same = notTurned(piece);
    if (same) return say(same);
    const t = turnPiece(piece), why = canPlace(draft, t, full);
    if (why.length) return say(plainOf(why[0]));
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
    const w = whereOf(piece.geometry), to = clampMove(draft, piece.id, snap([w[0] + d[0], w[1] + d[1]], 0.25), quick);
    tryEdit({ ...draft, pieces: draft.pieces.map((p) => (p.id === piece.id ? movePiece(piece, to) : p)) }, "");
  };
  const fix = (i: Issue) => quick && tryEdit(fixOf(i, draft, quick), "No free place near it: move it by hand.");
  // the keyboard: the tee or the cup moved as a drag lets it go; the armed piece dropped between them, then selected
  const moveEnd = (which: "tee" | "pin", d: V) => {
    if (!quick || !full) return;
    const r = dropEnd(draft, which, snap([draft[which][0] + d[0], draft[which][1] + d[1]], 0.25), quick, full);
    if ("why" in r) return r.why && say(r.why);
    set(r);
  };
  const dropArmed = () => {
    if (!armed || !full) return;
    const at: V = [(draft.tee[0] + draft.pin[0]) / 2, (draft.tee[1] + draft.pin[1]) / 2], r = placeNear(draft, armed, at, full);
    if (!r) return say(roomFor(draft, placePiece(armed, "", at)) || "No free place for it between the tee and the cup.");
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
      set(r);
    });
  };

  // the keys: always the editor's, never a field's
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, select, textarea, [contenteditable]")) return;
      const mod = e.metaKey || e.ctrlKey;
      if (e.key === "Alt") return setFine(true);
      if (mod && e.key.toLowerCase() === "z") return (e.preventDefault(), e.shiftKey ? session.redo() : session.undo(), refresh());
      if (e.key === "Escape") return (setArmed(null), setSelected(null));
      const arrows: Record<string, V> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      const step = (k: string) => arrows[k].map((x) => x * (e.shiftKey ? 2 : 0.5)) as V;
      if (e.key === "Enter" && armed && !t.closest("button, a")) return (e.preventDefault(), dropArmed());
      if ((selected === "tee" || selected === "pin") && arrows[e.key]) return (e.preventDefault(), moveEnd(selected, step(e.key)));
      if (!piece) return;
      if (mod && e.key.toLowerCase() === "d") return (e.preventDefault(), copy());
      if (e.key === "Delete" || e.key === "Backspace") return (e.preventDefault(), remove());
      if (e.key.toLowerCase() === "r" && !mod) return turn();
      if (arrows[e.key]) return (e.preventDefault(), nudge(step(e.key)));
    };
    const up = (e: KeyboardEvent) => e.key === "Alt" && setFine(false);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", up);
    return () => (window.removeEventListener("keydown", key), window.removeEventListener("keyup", up));
  });

  const v = checked?.v, fresh = checked?.of === kept;
  const errors = v ? v.issues.filter((i) => i.severity === "error") : [];
  const bad = new Set(errors.map((i) => i.piece).filter((x): x is string => !!x));
  const testOff = testGate(kept, checked);
  const step: Step = "edit";
  // proved as it is now: Test done, Publish the action (proofs keep while the hole is the same: an undo brings them back)
  const proved = !testOff && key?.of === kept && !!key.key && !!author && !!provedAs(kept.proofs, kept.world, key.key, author, kept.slug);
  return (
    <main className={`bench tint--${draft.world}`}>
      <Header title={draft.title} slug={draft.slug} author={author} world={draft.world} worlds={WORLDS} step={step}
        steps={{ edit: { locked: "", done: false }, test: { locked: testOff ? "Fix the errors first" : "", done: proved }, publish: { locked: proved ? "" : "Hole it in every weather first", done: false } }}
        action={proved ? { text: "Publish →", kind: "chain", onClick: () => onPublish(kept) } : { text: "Test it", kind: "gold", off: testOff, onClick: () => onTest(kept) }}
        meter={{ level: guess?.level ?? null, word: guess?.word ?? "–", title: guess ? guess.title : clean ? "Difficulty: measuring…" : "Difficulty: measured once the hole has no error", busy: measuring }}
        history={{ undo: () => (session.undo(), refresh()), redo: () => (session.redo(), refresh()), canUndo: session.canUndo(), canRedo: session.canRedo() }}
        onTitle={(t) => (session.edit((k) => frame(retitle(k, t))), refresh())} onSlug={(s) => (session.edit((k) => frame({ ...k, slug: s })), refresh())} onWorld={world} onStep={(s) => (s === "test" && !testOff ? onTest(kept) : s === "publish" && proved && onPublish(kept))} onBack={onBack} onHelp={() => setAgain(true)} />
      {palette && quick && full ? (
        <>
          <Palette world={draft.world} palette={palette} armed={armed} off={offAtLimit(draft, palette)} onArm={setArmed} />
          <div className="centre">
            <Board draft={draft} quick={quick} full={full} selected={selected} armed={armed} step={fine ? 0.25 : 0.5} bad={bad}
              onSelect={setSelected} onPreview={preview} onCommit={commit} onCancel={cancel} onSet={set} onBin={(id) => tryEdit(removePiece(draft, id), "")} onDisarm={() => setArmed(null)} onSay={say} said={said} show={show} />
            <Checks verdict={verdict({ pieces: draft.pieces.length, errors: errors.length, proved, off: testOff })} gauges={[...pieceGauges(draft), ...(v?.hole && v.cost && v.hex ? gauges(v.hole, v.cost, v.hex.length / 2) : [])]}
              issues={v?.issues ?? []} busy={!fresh} meter={guess && { ...guess.line, busy: measuring }} onShow={(id) => (setSelected(id), setShow((s) => ({ id, n: (s?.n ?? 0) + 1 })))} onFix={fix} />
          </div>
          <aside className="col" aria-label="The hole in 3D and the selected piece">
            <Preview state={checked?.state ?? null} fresh={fresh} />
            <hr />
            <Inspector draft={draft} piece={piece} quick={quick} full={full} onPreview={preview} onCommit={commit} onCancel={cancel} onSet={set} onSay={say} onTurn={turn} onCopy={copy} onDelete={remove} />
          </aside>
        </>
      ) : (
        <p className="bench__wait" aria-busy="true">Loading the {draft.world}&apos;s pieces…</p>
      )}
      {(hints || again) && <Hints onDone={() => (setAgain(false), onHinted())} />}
    </main>
  );
}
