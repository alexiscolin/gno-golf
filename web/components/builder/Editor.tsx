"use client";

// The editor (the GUI spec's B1 and B2): the header, the palette, the board
// with its checks docked under it, the 3D and the selected piece. The draft
// lives in a session (its history; a drag one step); every change is
// checked by the whole pipeline (pipeline.ts validate, the render census
// included) 150 ms after the last, and nothing that breaks the hole is ever
// made: the board, the inspector and the keys all ask first (edit.ts).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { census } from "@/lib/builder/drawn";
import { canPlace, changeWorld, copyPiece, errorsOf, fixOf, movePiece, newErrors, removePiece, snap, whereOf, clampMove } from "@/lib/builder/edit";
import { gauges, offAtLimit, verdict } from "@/lib/builder/editor";
import { frame } from "@/lib/builder/gg1";
import { turnPiece } from "@/lib/builder/handles";
import { loadPalette, type PaletteEntry } from "@/lib/builder/palette";
import { validate, type ValidateOptions, type Validated } from "@/lib/builder/pipeline";
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

/** How long after the last change the whole pipeline runs. */
const CHECK_MS = 150;
/** The id the 3D's hole is loaded under in the builder's wasm. */
const PREVIEW_ID = "preview/v1";
const WORLDS = Object.keys(FIELD);

export default function Editor({ host, first, author, onSave, onBack, onTest }: {
  host: BuilderHost;
  first: Draft;
  author: string | null;
  /** the draft as it stands, after each step: kept in the browser */
  onSave: (d: Draft) => void;
  onBack: () => void;
  /** Test it: the draft with no error */
  onTest: (d: Draft) => void;
}) {
  const session = useMemo(() => makeSession(first), [first]);
  const [, bump] = useState(0);
  const draft = session.now(), kept = session.kept();
  const [palette, setPalette] = useState<readonly PaletteEntry[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [armed, setArmed] = useState<PaletteEntry | null>(null);
  const [said, setSaid] = useState("");
  const [checked, setChecked] = useState<{ of: Draft; v: Validated; state: Hole | null } | null>(null);
  const [fine, setFine] = useState(false);
  const sayTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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
      const v = validate(kept, full);
      let state: Hole | null = null;
      if (v.hex) {
        host.load(PREVIEW_ID, v.hex);
        host.setperiod(1);
        try { state = JSON.parse(host.state(PREVIEW_ID)) as Hole; } catch { state = null; }
      }
      setChecked({ of: kept, v, state });
    }, CHECK_MS);
    return () => clearTimeout(t);
  }, [kept, full, host]);

  // each step kept in the browser
  useEffect(() => onSave(kept), [kept, onSave]);

  const set = (d: Draft) => (session.set(frame(d)), refresh());
  const preview = (d: Draft) => (session.preview(d), refresh());
  const commit = () => (session.commit(), refresh());
  const cancel = () => (session.cancel(), refresh());

  /** A one-step edit, made only if the hole holds (census and all). */
  const tryEdit = (next: Draft | null, fail: string) => {
    if (!next || !full) return say(fail);
    const why = newErrors(errorsOf(draft, full), next, full);
    if (why.length) return say(why[0].text);
    set(next);
  };
  const piece = draft.pieces.find((p) => p.id === selected) ?? null;
  const turn = () => {
    if (!piece || !full) return;
    const t = turnPiece(piece), why = canPlace(draft, t, full);
    if (why.length) return say(why[0].text);
    set({ ...draft, pieces: draft.pieces.map((p) => (p.id === piece.id ? t : p)) });
  };
  const copy = () => piece && quick && tryEdit(copyPiece(draft, piece.id, quick), "No room near it for a copy.");
  const remove = () => piece && (tryEdit(removePiece(draft, piece.id), ""), setSelected(null));
  const nudge = (d: V) => {
    if (!piece || !quick || !full) return;
    const w = whereOf(piece.geometry), to = clampMove(draft, piece.id, snap([w[0] + d[0], w[1] + d[1]], 0.25), quick);
    tryEdit({ ...draft, pieces: draft.pieces.map((p) => (p.id === piece.id ? movePiece(piece, to) : p)) }, "");
  };
  const fix = (i: Issue) => quick && tryEdit(fixOf(i, draft, quick), "No free place near it: move it by hand.");
  const world = (w: string) => {
    void loadPalette(w).then((p) => {
      const r = changeWorld(draft, w, p);
      if ("refused" in r) return say(`The ${w} has no ${r.refused.join(", ")}.`);
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
      if (!piece) return;
      if (mod && e.key.toLowerCase() === "d") return (e.preventDefault(), copy());
      if (e.key === "Delete" || e.key === "Backspace") return (e.preventDefault(), remove());
      if (e.key.toLowerCase() === "r" && !mod) return turn();
      const arrows: Record<string, V> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
      if (arrows[e.key]) return (e.preventDefault(), nudge(arrows[e.key].map((x) => x * (e.shiftKey ? 2 : 0.5)) as V));
    };
    const up = (e: KeyboardEvent) => e.key === "Alt" && setFine(false);
    window.addEventListener("keydown", key);
    window.addEventListener("keyup", up);
    return () => (window.removeEventListener("keydown", key), window.removeEventListener("keyup", up));
  });

  const v = checked?.v, fresh = checked?.of === kept;
  const errors = v ? v.issues.filter((i) => i.severity === "error") : [];
  const bad = new Set(errors.map((i) => i.piece).filter((x): x is string => !!x));
  const testOff = !v ? "Checking…" : errors.length ? `Fix ${errors.length} first` : !draft.pieces.length ? "Place a piece first" : "";
  const step: Step = "edit";
  return (
    <main className={`bench tint--${draft.world}`}>
      <Header title={draft.title} slug={draft.slug} author={author} world={draft.world} worlds={WORLDS} step={step}
        steps={{ edit: { locked: "", done: false }, test: { locked: testOff ? "Fix the errors first" : "", done: false }, publish: { locked: "Hole it in every weather first", done: false } }}
        action={{ text: "Test it", kind: "gold", off: testOff, onClick: () => onTest(session.now()) }}
        history={{ undo: () => (session.undo(), refresh()), redo: () => (session.redo(), refresh()), canUndo: session.canUndo(), canRedo: session.canRedo() }}
        onTitle={(t) => set({ ...draft, title: t })} onSlug={(s) => set({ ...draft, slug: s })} onWorld={world} onStep={(s) => s === "test" && !testOff && onTest(session.now())} onBack={onBack} />
      {palette && quick && full ? (
        <>
          <Palette world={draft.world} palette={palette} armed={armed} off={offAtLimit(draft, palette)} onArm={setArmed} />
          <div className="centre">
            <Board draft={draft} quick={quick} full={full} selected={selected} armed={armed} step={fine ? 0.25 : 0.5} bad={bad}
              onSelect={setSelected} onPreview={preview} onCommit={commit} onCancel={cancel} onSet={set} onDisarm={() => setArmed(null)} onSay={say} said={said} />
            <Checks verdict={verdict({ pieces: draft.pieces.length, errors: errors.length, proved: false })} gauges={v?.hole && v.cost && v.hex ? gauges(v.hole, v.cost, v.hex.length / 2) : []}
              issues={v?.issues ?? []} busy={!fresh} onSelect={setSelected} onFix={fix} />
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
    </main>
  );
}
