"use client";

// The Builder's one header (the GUI spec's B1): Back (the draft is kept),
// the hole's name in place with its address and world under it, the three
// steps, and on the right the history (in Edit) and the mode's one action.
// A step done or open is a link back to it; a locked one says why.
import { MOD } from "./Inspector";
import { shortAddr } from "@/components/common";
import { worldName } from "@/lib/builder/rules";
import { shortWhy } from "@/lib/builder/editor";
import type { Level } from "@/lib/builder/difficulty";

export type Step = "edit" | "test" | "publish";

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

/** The meter beside the big button: four pips and a word, its width kept (nothing moves as it changes); a guess, never a gate. */
function Meter({ m }: { m: MeterChip }) {
  return (
    <span className={`meter meter--${m.level ?? "none"}`} title={m.title} aria-label={m.title} aria-busy={m.busy} role="img">
      <i aria-hidden="true">{[0, 1, 2, 3].map((k) => <b key={k} className={m.level != null && k <= m.level ? "on" : undefined} />)}</i>
      <span aria-hidden="true">{m.word}</span>
    </span>
  );
}

export default function Header({ title, slug, author, world, worlds, step, steps, action, history, meter, onTitle, onSlug, onWorld, onStep, onBack, onHelp }: {
  title: string;
  slug: string;
  author: string | null;
  world: string;
  worlds: readonly string[];
  step: Step;
  steps: Record<Step, StepState>;
  /** the mode's one action: its words, its look, off with why */
  action: { text: string; kind: "gold" | "chain" | "ghost"; off?: string; onClick: () => void } | null;
  history: { undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean } | null;
  /** the difficulty meter, in Edit: none elsewhere */
  meter?: MeterChip;
  /** the three hints again (Hints), on the editor: none elsewhere */
  onHelp?: () => void;
  onTitle: (v: string) => void;
  onSlug: (v: string) => void;
  onWorld: (w: string) => void;
  onStep: (s: Step) => void;
  onBack: () => void;
}) {
  const names: Record<Step, string> = { edit: "Edit", test: "Test", publish: "Publish" };
  const waits = !!action?.off && action.off !== "Checking…";
  return (
    <header className="bhead">
      <div className="bhead__start">
      <button type="button" className="round round--icon" aria-label="Back to your holes (the draft is kept)" title="Back to your holes" onClick={onBack}>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="bhead__hole">
        <input value={title} maxLength={40} placeholder="Name your hole" aria-label="The hole's name" onChange={(e) => onTitle(e.target.value)} />
        <small>
          {author ? shortAddr(author) : "your address"}/
          <input className="bhead__slug" value={slug} maxLength={32} placeholder="short-name" aria-label="The hole's short name, in its address" disabled={step !== "edit"}
            onChange={(e) => onSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))} />
          /v1 ·{" "}
          <select value={world} aria-label="The hole's world" disabled={step !== "edit"} onChange={(e) => onWorld(e.target.value)}>
            {worlds.map((w) => <option key={w} value={w}>{worldName(w)}</option>)}
          </select>
        </small>
      </div>
      </div>
      <ol className="stepper" aria-label="Edit, test, publish">
        {(["edit", "test", "publish"] as const).map((s, i) => {
          const st = steps[s], now = s === step;
          return (
            <li key={s} className={`step${now ? " step--now" : st.done ? " step--done" : st.locked ? " step--locked" : ""}`}>
              <button type="button" disabled={!!st.locked && !now} title={st.locked || names[s]} aria-label={st.locked ? `${names[s]}: ${st.locked}` : names[s]} aria-current={now ? "step" : undefined} onClick={() => onStep(s)}>
                <i>{st.done && !now ? "✓" : st.locked ? "🔒" : i + 1}</i><span>{names[s]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="bhead__end">
        {/* one slot of its own width (nothing moves): why the big button waits, in a few words (in full under the board),
            else the difficulty meter; a check under way keeps what was there */}
        {(action || meter) && (
          <span className="bhead__slot">
            {meter && !waits ? <Meter m={meter} /> : action && <span className="bhead__why" aria-hidden="true">{shortWhy(action.off ?? "")}</span>}
          </span>
        )}
        {onHelp && <button type="button" className="round" aria-label="How it works: the three steps" title="How it works" onClick={onHelp}>?</button>}
        {history && (
          <>
            <button type="button" className="round" aria-label={`Undo (${MOD}Z)`} title={`Undo (${MOD}Z)`} disabled={!history.canUndo} onClick={history.undo}>↶</button>
            <button type="button" className="round" aria-label={`Redo (⇧${MOD}Z)`} title={`Redo (⇧${MOD}Z)`} disabled={!history.canRedo} onClick={history.redo}>↷</button>
          </>
        )}
        {action && (
          // its own words always (nothing moves as the reason changes), readable and reachable when off: the reason is
          // the dock's verdict (bench-verdict), and its title
          <button type="button" className={`btn ${action.off ? "btn--off" : action.kind === "chain" ? "btn--save" : action.kind === "ghost" ? "btn--ghost" : "btn--gold"}`}
            aria-disabled={action.off ? true : undefined} aria-describedby={action.off ? "bench-verdict" : undefined} title={action.off || undefined} onClick={() => !action.off && action.onClick()}>
            {action.text}
          </button>
        )}
      </div>
    </header>
  );
}
