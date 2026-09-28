"use client";

// A ghost duel on screen (ADR-004): the dare on the picker and the fine print
// on the win card (the HUD's score card counts both rounds). The race itself is the engine's
// (engine/rival.ts); the words are lib/duel.ts's.
import type { Duel } from "@/lib/duel";
import type { Mode } from "@/lib/types";

const MODES: Record<Mode, string> = { assisted: "Assisted", pro: "Pro" };

/** The picker's dare, armed: who is raced and the strokes to beat (the link's
 *  sticker), then one line (an ace, a mixed race, or why it can't be faked) and
 *  the way to play solo. */
export function DuelNote({ duel, mode, onDrop }: { duel: Duel; mode: Mode; onDrop: () => void }) {
  const { ghost, name, self } = duel;
  return (
    <>
      <p className="dare">{self ? "Racing your best" : `Racing ${name}`} · {ghost.strokes} to beat</p>
      <p className="aimset__help">
        {ghost.strokes === 1 ? `${self ? "You" : name} aced it. Match it to tie.`
          : ghost.mode !== mode ? `You: ${MODES[mode]}. Them: ${MODES[ghost.mode]}. Still a race, not a record.`
          : "Their round is on the chain, replayed, not typed in."}{" "}
        <button className="linkish" onClick={onDrop}>Play solo</button>
      </p>
    </>
  );
}

/** The win card's duel fine print: a mixed race said, and what V1 does not record. */
export function DuelFine({ duel, mode }: { duel: Duel; mode: Mode }) {
  return (
    <p className="real__fine">
      {duel.ghost.mode !== mode && <>Your {MODES[mode]} vs their {MODES[duel.ghost.mode]}. </>}
      Duel records on-chain · soon
    </p>
  );
}
