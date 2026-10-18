"use client";

// The Builder's one header (the GUI spec's B1): Back (the draft is kept),
// the hole's name in place (the one place it is edited: its address follows
// it, shown on Publish), the three steps (Build, Play, Publish), and on the
// right the difficulty chip (a click shows the meter's line on the board),
// the history and the mode's one action (Play, in Build). A step done or
// open is a link back to it; a locked one says why; Publish, once open, is
// lit: the way on. The world a hole is in changes from the "…" menu.
import { useRef } from "react";
import { MOD } from "./Inspector";
import { worldName } from "@/lib/builder/rules";
import { CHECKING, shortWhy } from "@/lib/builder/editor";
import type { Level } from "@/lib/builder/difficulty";
import { Button, Dice } from "@/components/ui";

export type Step = "edit" | "play" | "publish";

export interface StepState {
  /** why it is locked; "" open */
  locked: string;
  done: boolean;
}

/** The difficulty meter's chip: its level (null: none yet, or the hole has errors) and word, the meter's words in full, and whether it is measuring again. */
export interface MeterChip {
  level: Level | null;
  word: string;
  title: string;
  busy: boolean;
}

/**
 * The meter beside the big button: a chip of four pips and a word, its width kept (nothing moves as it changes); a guess,
 * never a gate. Pressed, the meter's best line on the board (off: none measured yet); bump: a change of par just said
 * ("par 3 → 4"), the pips springing once.
 */
function Meter({ m, on, onLine, bump }: { m: MeterChip; on: boolean; onLine?: () => void; bump?: string }) {
  return (
    <span className="bhead__meter">
      <button type="button" className={`chip chip--m meter meter--${m.level ?? "none"}${bump ? " meter--bump" : ""}`} title={`${m.title}${onLine ? (on ? " Click: hide its line." : " Click: show its line on the board.") : ""}`}
        aria-label={m.title} aria-busy={m.busy} aria-pressed={on} disabled={!onLine && !on} onClick={onLine}>
        <i aria-hidden="true">{[0, 1, 2, 3].map((k) => <b key={k} className={m.level != null && k <= m.level ? "on" : undefined} />)}</i>
        <span aria-hidden="true">{m.word}</span>
      </button>
      {bump && <em key={bump} className="meter__delta" role="status">{bump}</em>}
    </span>
  );
}

/** Undo's arrow, inked (the Back button's stroke): back along a curve to where it was; redo, the same turned the other way. */
const HistoryIcon = ({ redo = false }: { redo?: boolean }) => (
  <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" style={redo ? { transform: "scaleX(-1)" } : undefined}>
    <path d="M7.5 3.5 3.5 7.5l4 4" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M4 7.5h7.5a4.75 4.75 0 0 1 0 9.5H8" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
/** Undo's or redo's keys as aria-keyshortcuts names them (MOD: ⌘ on a Mac, Ctrl elsewhere). */
const keys = (redo: boolean) => `${MOD === "⌘" ? "Meta" : "Control"}+${redo ? "Shift+" : ""}Z`;

/** The "…" menu: the hole moved to another world (judged there first: Editor's world), the one it is in ticked. */
function More({ world, worlds, onWorld }: { world: string; worlds: readonly string[]; onWorld: (w: string) => void }) {
  const menu = useRef<HTMLDetailsElement>(null);
  return (
    <details ref={menu} className="bhead__more" onKeyDown={(e) => e.key === "Escape" && menu.current?.open && (e.stopPropagation(), (menu.current.open = false))}>
      <summary aria-label="More: the hole's world" title="The hole's world">…</summary>
      <div className="bhead__menu" role="group" aria-label="The hole's world">
        {worlds.map((w) => (
          <button key={w} type="button" data-world={w} aria-pressed={w === world} onClick={() => ((menu.current!.open = false), w !== world && onWorld(w))}>{worldName(w)}</button>
        ))}
      </div>
    </details>
  );
}

export default function Header({ title, world, worlds = [], step, steps, action, history, meter, lineOn = false, bump, onLine, onTitle, onWorld, onStep, onBack, onHelp, onRoll }: {
  title: string;
  world: string;
  /** the worlds the hole may move to (the "…" menu, in Build only) */
  worlds?: readonly string[];
  step: Step;
  steps: Record<Step, StepState>;
  /** the mode's one action: its words, its key (in a cap), off with why */
  action: { text: string; key?: string; off?: string; onClick: () => void } | null;
  history: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean } | null;
  /** the difficulty meter, in Build: none elsewhere; its line on the board (lineOn), shown and hidden by a click (onLine: none measured yet) */
  meter?: MeterChip;
  lineOn?: boolean;
  onLine?: () => void;
  /** a change of par the meter just found ("par 3 → 4"), said a moment under the chip */
  bump?: string;
  /** the hints again, and the world's pieces (Hints), on the editor: none elsewhere */
  onHelp?: () => void;
  /** a name suggested, another at each roll (the die by the name; in Build only) */
  onRoll?: () => void;
  onTitle: (v: string) => void;
  onWorld?: (w: string) => void;
  onStep: (s: Step) => void;
  onBack: () => void;
}) {
  const names: Record<Step, string> = { edit: "Build", play: "Play", publish: "Publish" };
  const waits = !!action?.off && action.off !== CHECKING;
  return (
    <header className="bhead">
      <div className="bhead__start">
        <Button variant="icon" size="m" type="button" aria-label="Back to your holes (the draft is kept)" title="Back to your holes" onClick={onBack}>
          <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </Button>
        <span className="bhead__name">
          <input value={title} maxLength={40} placeholder="Name your hole" aria-label="The hole's name" onChange={(e) => onTitle(e.target.value)} />
          {onRoll && <button type="button" className="bhead__roll" aria-label="Suggest a name" title="Suggest a name (again: another)" onClick={onRoll}><Dice /></button>}
        </span>
        {onWorld && worlds.length > 1 && <More world={world} worlds={worlds} onWorld={onWorld} />}
      </div>
      <ol className="stepper" aria-label="Build, play, publish">
        {(["edit", "play", "publish"] as const).map((s, i) => {
          const st = steps[s], now = s === step, go = s === "publish" && !now && !st.locked && !st.done;
          return (
            <li key={s} className={`step${now ? " step--now" : st.done ? " step--done" : st.locked ? " step--locked" : go ? " step--go" : ""}`}>
              <button type="button" disabled={!!st.locked && !now} title={st.locked || names[s]} aria-label={st.locked ? `${names[s]}: ${st.locked}` : names[s]} aria-current={now ? "step" : undefined} onClick={() => onStep(s)}>
                <i>{st.done && !now ? "✓" : st.locked ? "🔒" : i + 1}</i><span>{names[s]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="bhead__end">
        {/* one slot of its own width (nothing moves): why the big button waits, in a few words, else the difficulty chip;
            a check under way keeps what was there */}
        {(action || meter) && (
          <span className="bhead__slot">
            {meter && !waits ? <Meter m={meter} on={lineOn} onLine={onLine} bump={bump} /> : action && <span id="bench-why" className="bhead__why">{shortWhy(action.off ?? "")}</span>}
          </span>
        )}
        {onHelp && <Button variant="icon" size="m" type="button" aria-label="How it works: the steps, the pieces and the keys" title="How it works" onClick={onHelp}>?</Button>}
        {history && (
          <>
            <Button variant="icon" size="m" type="button" className="bhead__hist" aria-label="Undo" aria-keyshortcuts={keys(false)} title={`Undo (${MOD}Z)`} disabled={!history.canUndo} onClick={history.undo}><HistoryIcon /></Button>
            <Button variant="icon" size="m" type="button" className="bhead__hist" aria-label="Redo" aria-keyshortcuts={keys(true)} title={`Redo (⇧${MOD}Z)`} disabled={!history.canRedo} onClick={history.redo}><HistoryIcon redo /></Button>
          </>
        )}
        {action && (
          // its own words always (nothing moves as the reason changes), readable and reachable when off: its reason beside it, and its title
          <Button variant="gold" size="m" type="button" keycap={action.key} className="bhead__act"
            aria-disabled={action.off ? true : undefined} aria-describedby={waits ? "bench-why" : undefined} title={action.off || undefined} onClick={() => !action.off && action.onClick()}>
            {action.text}
          </Button>
        )}
      </div>
    </header>
  );
}
