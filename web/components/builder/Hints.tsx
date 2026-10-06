"use client";

// The first run's three hints (the GUI spec's B1): one by each place a first
// hole goes through (the palette, the big button, the steps), short, and gone
// at once with "Got it"; never a tutorial. Shown on the first visit only
// (templates.ts HINTS_KEY).
import { useEffect, useRef } from "react";

const HINTS = [
  ["palette", "Drag a piece onto the board"],
  ["test", "Press Test it to play your hole"],
  ["steps", "Then Publish, once holed in every weather"],
] as const;

export default function Hints({ onDone }: { onDone: () => void }) {
  const got = useRef<HTMLButtonElement>(null);
  useEffect(() => got.current?.focus(), []);
  return (
    <div className="bhints" role="note" aria-label="Three hints" onKeyDown={(e) => e.key === "Escape" && onDone()}>
      {HINTS.map(([at, text], k) => (
        <p key={at} className={`bhint bhint--${at}`}><b>{k + 1}</b>{text}</p>
      ))}
      <button ref={got} type="button" className="btn btn--gold bhint__ok" onClick={onDone}>Got it</button>
    </div>
  );
}
