// The editor's draft over time: its history (draft.ts) and, while a drag
// goes on, the draft as the drag has it so far, shown but not yet a step.
// Let go, the drag is one step of history; let go off the board, nothing.
import { history, type Draft } from "./draft";

export function makeSession(first: Draft) {
  const h = history(first);
  let live: Draft | null = null;
  return {
    /** The draft as history has it (never a drag under way): what is kept. */
    kept: () => h.now(),
    /** The draft shown: the drag's, while one goes on. */
    now: () => live ?? h.now(),
    /** The draft as a drag has it so far. */
    preview(d: Draft) {
      live = d;
    },
    /** The drag let go: what it made is one step (nothing if it changed nothing). */
    commit() {
      if (live && live !== h.now()) h.push(live);
      live = null;
    },
    /** The drag dropped: back to before it. */
    cancel() {
      live = null;
    },
    /** One edit at once (a click, a key, a slider let go): one step. */
    set(d: Draft) {
      live = null;
      if (d !== h.now()) h.push(d);
    },
    undo: () => ((live = null), h.undo()),
    redo: () => ((live = null), h.redo()),
    canUndo: () => h.canUndo(),
    canRedo: () => h.canRedo(),
  };
}
export type Session = ReturnType<typeof makeSession>;
