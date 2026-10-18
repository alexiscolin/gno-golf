"use client";

// The selected piece (the GUI spec's B2, the right column over the player's
// view): its name, Turn · Copy · Delete with their keys, its looks (a piece
// of several: chosen here, and the next one placed takes the look last
// chosen), its sizes and numbers as label · slider · value rows, its timing
// (a cycle strip for a timed piece). How to move it is said once in this
// browser (keys.ts seen). A setting that would break the hole does not
// take: the slider stays at the last value that holds, and the reason is
// said once (settings.ts; edit.ts canPlace).
import { entryName } from "@/lib/builder/names";
import { useEffect, useRef, useState } from "react";
import { Button, Segmented } from "@/components/ui";
import { settle } from "@/lib/builder/session";
import { canPlace, newErrors, errorsOf } from "@/lib/builder/edit";
import { entry as entryIn, type Clock, type PaletteEntry, type Range } from "@/lib/builder/palette";
import { blinkOf, DIRS, sizesOf, TIMING, withBlink, withClock, withDir, withLook, withNumber, withSize, withTiming, type Open, type Speed } from "@/lib/builder/settings";
import { MS_PER_STEP } from "@/lib/engine/replay";
import type { ValidateOptions } from "@/lib/builder/pipeline";
import type { Draft, Piece, Pulse } from "@/lib/builder/draft";
import { refusalOf } from "@/lib/builder/explain";
import { detailsOpen, saveDetailsOpen } from "@/lib/prefs";
import { notTurned } from "@/lib/builder/handles";
import { looksShown, pictureOf, tileOf } from "@/lib/builder/tiles";
import { showOnce, shownOnce, type Once } from "@/lib/builder/keys";

const CLOCKS: Record<Clock, string> = { fixed: "Always", substep: "In a stroke", stroke: "Strokes" };
const SIZE_NAMES = { r: "Size", length: "Length", width: "Width", depth: "Depth" } as const;
const ARROWS = ["→", "↘", "↓", "↙", "←", "↖", "↑", "↗"];

function Row({ label, value, range, shown, note, onChange, onDone }: { label: string; value: number; range: Range; shown?: string; note?: string; onChange: (v: number) => void; onDone: () => void }) {
  // let go (its pointer up, a key up, its blur): checked once a change, not three times, nor for a tab onto it
  const latest = useRef(onDone);
  latest.current = onDone;
  const [release] = useState(() => settle(() => latest.current()));
  return (
    <label className="range">
      <span>{label}</span>
      <input type="range" min={range.min} max={range.max} step={range.step} value={value} onChange={(e) => (release.changed(), onChange(Number(e.target.value)))} onPointerUp={release.done} onKeyUp={release.done} onBlur={release.done} />
      <output>{shown ?? +value.toFixed(2)}</output>
      {note && <small>{note}</small>}
    </label>
  );
}

/** The cycle of a timed piece as a strip of its steps (there: filled), a playhead running on the game's clock (72 ms a substep) while it plays. */
function Cycle({ t, unit, playing, onPlay }: { t: Pulse; unit: string; playing: boolean; onPlay: () => void }) {
  const cells = Math.min(t.every, 40), [step, setStep] = useState(0);
  useEffect(() => {
    if (!playing || unit !== "substeps") return;
    const at = () => setStep(Math.floor(performance.now() / MS_PER_STEP) % t.every);
    const i = setInterval(at, MS_PER_STEP);
    return () => clearInterval(i);
  }, [playing, unit, t.every]);
  const now = (step + t.phase) % t.every < t.on;
  return (
    <div className="cycle__row">
      {unit === "substeps" && <Button variant="icon" size="s" type="button" aria-pressed={playing} aria-label={playing ? "Pause its blinking" : "Play its blinking"} title={playing ? "Pause (on the board too)" : "Play (on the board too)"} onClick={onPlay}>{playing ? "❚❚" : "▶"}</Button>}
      <div className="cycle" aria-label={`There on ${t.on} of every ${t.every} ${unit}${unit === "substeps" ? `: ${now ? "there" : "open"} now` : ""}`}>
        {Array.from({ length: cells }, (_, i) => <i key={i} className={`${(Math.floor((i * t.every) / cells) + t.phase) % t.every < t.on ? "on" : ""}${unit === "substeps" && Math.floor((step * cells) / t.every) === i ? " now" : ""}`} />)}
      </div>
    </div>
  );
}

const SPEEDS: readonly (readonly [Speed, string])[] = [["slow", "Slow"], ["medium", "Medium"], ["fast", "Fast"]];
const OPENS: readonly (readonly [Open, string])[] = [["most", "Most"], ["half", "Half"], ["little", "Little"]];

/**
 * A one-time help (keys.ts): shown on a browser's first visit to it, marked
 * seen once it is actually shown (when: its place has it on screen), and
 * kept for the rest of the visit, an editor opened again or not.
 */
export function useOnce(what: Once, when = true): boolean {
  const [on] = useState(() => showOnce(what));
  useEffect(() => void (on && when && shownOnce(what)), [on, when, what]);
  return on;
}

export default function Inspector({ draft, piece, quick, full, playing, onPlay, onPreview, onCommit, onCancel, onSet, onSay, onTurn, onCopy, onDelete, onChoose }: {
  draft: Draft;
  piece: Piece | null;
  quick: ValidateOptions;
  full: ValidateOptions;
  /** a timed piece's blinking played (here and on the board), and its play/pause */
  playing: boolean;
  onPlay: () => void;
  onPreview: (d: Draft) => void;
  onCommit: () => void;
  onCancel: () => void;
  /** a one-click change: made at once */
  onSet: (d: Draft) => void;
  onSay: (text: string) => void;
  onTurn: () => void;
  onCopy: () => void;
  onDelete: () => void;
  /** a look chosen for the piece: the one the next of its tile takes (the editor's) */
  onChoose: (tile: string, entry: string) => void;
}) {
  // Details open unless the player folded them this visit (prefs.ts); how to move a piece said on a browser's first visit (seen once a piece is selected: it shows then)
  const [open] = useState(detailsOpen), drag = useOnce("drag", !!piece);
  if (!piece) return <p className="nothing"><b>No piece selected.</b> Click a piece on the board to set it here: its size, its turn, how it moves, its look. To add one, pick it on the left.</p>;
  const e = entryIn(piece.entry, quick.palette);
  if (!e) return <p className="nothing">This piece is no piece of this world&apos;s.</p>;
  const p = piece, ent: PaletteEntry = e;
  // a setting tried: shown if the hole still holds (fast checks), else refused with why
  const tryPiece = (next: Piece) => {
    const why = canPlace(draft, next, quick);
    if (why.length) return onSay(refusalOf(why[0]));
    onPreview({ ...draft, pieces: draft.pieces.map((q) => (q.id === p.id ? next : q)) });
  };
  const tryDraft = (next: Draft) => {
    const why = newErrors(errorsOf(draft, quick), next, quick);
    if (why.length) return onSay(refusalOf(why[0]));
    onPreview(next);
  };
  // a one-click change (a way, a clock, a look): made if the hole holds, census and all (whether it was)
  const setDraft = (next: Draft): boolean => {
    const why = newErrors(errorsOf(draft, full), next, full);
    if (why.length) return (onSay(refusalOf(why[0])), false);
    onSet(next);
    return true;
  };
  // let go: kept if it holds with the census too
  const done = () => {
    const why = canPlace(draft, p, full);
    if (why.length) return (onCancel(), onSay(refusalOf(why[0])));
    onCommit();
  };
  // its looks (a piece of several), the one it has pressed: the piece takes it where it stands if the hole holds, and
  // only then is it the look chosen (the next of its tile takes it); refused, the palette keeps the one before
  const tile = tileOf(quick.palette, p.entry), looks = tile ? looksShown(tile) : [];
  const look = (to: PaletteEntry) => {
    const next = withLook(p, to, ent);
    if (!next) return onSay(`${entryName(to)} cannot take this piece's shape.`);
    if (to.id === ent.id || setDraft({ ...draft, pieces: draft.pieces.map((q) => (q.id === p.id ? next : q)) })) onChoose(tile!.key, to.id);
  };
  const c = p.clock;
  const t: Pulse | null = c.k === "substep" ? c : c.k === "stroke" ? draft.pulses[c.pulse] ?? null : null;
  const unit = c.k === "substep" ? "substeps" : "strokes";
  return (
    <div className="insp">
      <h3 className="h-sub">{entryName(ent)}</h3>
      <div className="insp__acts">
        {/* (a round piece: off, the reason its title, as R says it) */}
        <Button size="s" type="button" keycap="R" aria-disabled={notTurned(p, draft.tee) ? true : undefined} title={notTurned(p, draft.tee) || "Turn it a quarter (R)"} onClick={onTurn}>Turn</Button>
        <Button size="s" type="button" keycap={`${MOD}D`} onClick={onCopy}>Copy</Button>
        <Button size="s" type="button" keycap="⌫" onClick={onDelete}>Delete</Button>
      </div>
      {drag && <p className="insp__hint">Drag it to move it, its handles to size and turn it.</p>}
      {looks.length > 0 && (
        <div className="insp__looks" role="group" aria-label={`Its look: ${looks.length} to choose from`}>
          {looks.map((l) => (
            <button key={l.id} type="button" className="look" data-look={l.id} aria-pressed={l.id === ent.id} aria-label={entryName(l)} title={entryName(l)} onClick={() => look(l)}>
              <img src={pictureOf(draft.world, l)} width={40} height={40} alt="" draggable={false} decoding="async" />
            </button>
          ))}
        </div>
      )}
      {/* the numbers, open (else the column stands empty), folded away for the visit by whoever would rather not see them */}
      <details className="insp__details" open={open} onToggle={(e) => saveDetailsOpen(e.currentTarget.open)}>
      <summary>Details</summary>
      {sizesOf(p, ent).map((s) => <Row key={s.key} label={SIZE_NAMES[s.key]} value={s.value} range={s.range} onChange={(v) => tryPiece(withSize(p, ent, s.key, v, draft.tee))} onDone={done} />)}
      {p.geometry.t === "bar" && ent.thick && <Row label="Thick" value={p.geometry.thick} range={ent.thick} onChange={(v) => tryPiece({ ...p, geometry: { ...(p.geometry as Extract<Piece["geometry"], { t: "bar" }>), thick: v } })} onDone={done} />}
      {ent.bounce && <Row label="Bounce" value={p.params.bounce ?? 0} range={ent.bounce} note={ent.bounce.max > 1 ? "Above 1 it kicks" : undefined} onChange={(v) => tryPiece(withNumber(p, ent, "bounce", v))} onDone={done} />}
      {ent.scale && <Row label={ent.kind === "loop" ? "Speed" : "Grip"} value={p.params.scale ?? ent.scale.def} range={ent.scale} onChange={(v) => tryPiece(withNumber(p, ent, "scale", v))} onDone={done} />}
      {ent.grade && <Row label="Grade" value={p.params.grade ?? ent.grade.def} range={ent.grade} onChange={(v) => tryPiece(withNumber(p, ent, "grade", v))} onDone={done} />}
      {p.params.dir && (
        <div className="range"><span>Way</span>
          <Segmented className="seg--s insp__dirs" label="The way it pushes" value={String(DIRS.findIndex((d) => d[0] === Math.sign(p.params.dir![0]) && d[1] === Math.sign(p.params.dir![1])))}
            options={ARROWS.map((a, i) => [String(i), a] as const)} onChange={(i) => setDraft({ ...draft, pieces: draft.pieces.map((q) => (q.id === p.id ? withDir(p, Number(i)) : q)) })} />
        </div>
      )}
      </details>
      {/* its timing, in words (the review's "timed pieces readable"): when it is there, how fast it blinks and how open it
          leaves the way, its cycle playing as it plays on the board; the numbers under Fine */}
      {ent.clocks.length > 1 && (
        <div className="range"><span>Timing</span>
          <Segmented className="seg--s" label="When it is there" value={c.k} options={ent.clocks.map((k) => [k, CLOCKS[k]] as const)} onChange={(k) => setDraft(withClock(draft, p.id, k, ent))} />
        </div>
      )}
      {c.k === "substep" && (
        <>
          <div className="range"><span>Blinks</span>
            <Segmented<Speed | ""> className="seg--s" label="How fast it blinks" value={blinkOf(c).speed ?? ""} options={SPEEDS} onChange={(v) => v && setDraft(withBlink(draft, p.id, { speed: v }))} />
          </div>
          <div className="range"><span>Open</span>
            <Segmented<Open | ""> className="seg--s" label="How much of the time the way is open" value={blinkOf(c).open ?? ""} options={OPENS} onChange={(v) => v && setDraft(withBlink(draft, p.id, { open: v }))} />
            <small>{blinkOf(c).open ? `the way open ${blinkOf(c).open} of the time` : `the way open ${Math.round((1 - c.on / c.every) * 100)}% of the time`}</small>
          </div>
        </>
      )}
      {t && (
        <>
          <Cycle t={t} unit={unit} playing={playing} onPlay={onPlay} />
          <details className="insp__details insp__fine">
            <summary>Fine</summary>
            <Row label="Every" value={t.every} range={{ min: TIMING.every.min, max: TIMING.every.max, step: 1, def: 40 }} shown={`${t.every}`} note={`a cycle of ${t.every} ${unit}`} onChange={(v) => tryDraft(withTiming(draft, p.id, { ...t, every: v }))} onDone={done} />
            <Row label="On" value={t.on} range={{ min: 1, max: t.every - 1, step: 1, def: 1 }} shown={`${t.on} / ${t.every}`} note="there for this many of them" onChange={(v) => tryDraft(withTiming(draft, p.id, { ...t, on: v }))} onDone={done} />
            <Row label="From" value={t.phase} range={{ min: 0, max: t.every - 1, step: 1, def: 0 }} shown={`step ${t.phase}`} note="where its cycle starts" onChange={(v) => tryDraft(withTiming(draft, p.id, { ...t, phase: v }))} onDone={done} />
          </details>
        </>
      )}
    </div>
  );
}

/** The modifier key as this computer names it. */
export const MOD = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
