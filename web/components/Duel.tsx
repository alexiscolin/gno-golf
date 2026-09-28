"use client";

// A ghost duel's own pieces of the page (ADR-004): the dare on the picker and
// the fine print on the win card. The race is the engine's (engine/rival.ts),
// the words lib/duel.ts's; the score card and the win card are Golf.tsx's.
import { skyWord, type Duel } from "@/lib/duel";
import type { Mode } from "@/lib/types";

const MODES: Record<Mode, string> = { assisted: "Assisted", pro: "Pro" };

// sky: the weather the ghost was played in and today's, when both are known ("" is clear)
export type Sky = { theirs: string; mine: string } | null;
// (fog plays as clear skies: only a weather that pushes or slows the ball is a difference)
const plays = (kind: string) => (kind === "fog" ? "" : kind);
const differs = (sky: Sky): sky is { theirs: string; mine: string } => !!sky && plays(sky.theirs) !== plays(sky.mine);

/** The picker's dare, armed: who is raced and the strokes to beat (the link's
 *  sticker) and the way to play solo on one line; under it, only what changes
 *  the race: an ace, a mixed aim, a weather that was not today's. */
export function DuelNote({ duel, mode, sky, onDrop }: { duel: Duel; mode: Mode; sky: Sky; onDrop: () => void }) {
  const { ghost, name, self } = duel;
  const notes = [
    ghost.strokes === 1 && `${self ? "You" : name} aced it. Match it to tie.`,
    ghost.mode !== mode && `You: ${MODES[mode]}. ${self ? "Your best" : "Them"}: ${MODES[ghost.mode]}. Still a race, not a record.`,
    differs(sky) && `${self ? "You" : "They"} played in ${skyWord(plays(sky.theirs))}.`,
  ].filter(Boolean);
  return (
    <>
      <p>
        <span className="dare">{self ? "Racing your best" : `Racing ${name}`} · {ghost.strokes} to beat</span>{" "}
        <button className="linkish" onClick={onDrop}>Play solo</button>
      </p>
      {notes.length > 0 && <p className="aimset__help">{notes.join(" ")}</p>}
    </>
  );
}

/** The win card's duel fine print: a different weather and a mixed race said, and what V1 does not record. */
export function DuelFine({ duel, mode, sky }: { duel: Duel; mode: Mode; sky: Sky }) {
  return (
    <p className="real__fine">
      {differs(sky) && <>{duel.self ? "Your best had" : "They had"} {skyWord(plays(sky.theirs))}. You had {skyWord(plays(sky.mine))}. </>}
      {duel.ghost.mode !== mode && <>Your {MODES[mode]} vs {duel.self ? "your best's" : "their"} {MODES[duel.ghost.mode]}. </>}
      Duel records on-chain · soon
    </p>
  );
}
