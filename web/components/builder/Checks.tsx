"use client";

// The checks, docked under the board (the GUI spec's B3): one line, the next
// step or the one thing to fix in the player's words (explain.ts plainOf;
// the rule's code a tooltip, for us), with Show me (it selects the piece
// and frames it) and Move it where the piece can simply move (edit.ts
// fixOf); the others behind "N more"; a limit said only when near it, the
// full gauges behind "Limits". The list scrolls in itself. Under the line,
// the difficulty meter's one line (difficulty.ts meterLine): a guess, calm,
// its piece a click away; its place kept when it has nothing to say.
import { useState } from "react";
import type { Issue } from "@/lib/builder/checks";
import { nearLimits, type Gauge } from "@/lib/builder/editor";
import { plainOf } from "@/lib/builder/explain";

function Fix({ i, onShow, onFix }: { i: Issue; onShow: (piece: string) => void; onFix: (issue: Issue) => void }) {
  if (!i.piece) return null;
  return (
    <span className="checks__acts">
      <button type="button" className="btn btn--ghost btn--s" onClick={() => onShow(i.piece!)}>Show me</button>
      {i.severity === "error" && <button type="button" className="btn btn--ghost btn--s" onClick={() => onFix(i)}>Move it</button>}
    </span>
  );
}

export default function Checks({ verdict, gauges, issues, busy, meter, onShow, onFix }: {
  verdict: { ok: boolean; text: string };
  gauges: readonly Gauge[];
  issues: readonly Issue[];
  /** the checks are running again */
  busy: boolean;
  /** the meter's line (null: nothing to say), and whether it is measuring again */
  meter: { text: string; piece?: string; busy: boolean } | null;
  /** select a piece and frame it on the board */
  onShow: (piece: string) => void;
  onFix: (issue: Issue) => void;
}) {
  const [all, setAll] = useState(false);
  const first = issues[0], near = nearLimits(gauges);
  const bad = first ? first.severity === "error" : !verdict.ok;
  return (
    <section className="checks" aria-label="Checks" aria-busy={busy}>
      {all && issues.length > 1 && (
        <ul className="issues" aria-label="Everything to fix, errors first">
          {issues.slice(1).map((i, k) => (
            <li key={k} className={`issue issue--${i.severity === "error" ? "error" : "warn"}`} title={i.rule}>
              <span>{plainOf(i)}</span>
              <Fix i={i} onShow={onShow} onFix={onFix} />
            </li>
          ))}
        </ul>
      )}
      <div className="checks__line">
        <span id="bench-verdict" className={`verdict verdict--${bad ? "bad" : "ok"}`} role="status" title={first?.rule}>{first ? plainOf(first) : verdict.text}</span>
        {first && <Fix i={first} onShow={onShow} onFix={onFix} />}
        {issues.length > 1 && <button type="button" className="linkish checks__more" aria-expanded={all} onClick={() => setAll((o) => !o)}>{all ? "Fewer" : `${issues.length - 1} more`}</button>}
      </div>
      <p className="checks__meter" aria-busy={meter?.busy}>
        {meter?.piece ? (
          <button type="button" className="linkish" title={`${meter.text} Show me.`} onClick={() => onShow(meter.piece!)}>{meter.text}</button>
        ) : meter && <span title={meter.text}>{meter.text}</span>}
      </p>
      {near.length > 0 && <p className="checks__near">{near.join(" · ")}</p>}
      <details className="checks__limits">
        <summary>Limits</summary>
        <div className="gauges" aria-label="The chain's limits">
          {gauges.map((g) => (
            <div key={g.name} className={`gauge gauge--${g.level}`} title={g.name === "Room" ? `Room left for a first shot in its dearest weather: ${g.shown}` : `${g.name}: ${g.shown}`}>
              <span>{g.name}<em>{g.shown}</em></span>
              <i><b style={{ width: `${Math.max(3, Math.round(Math.min(1, g.used / g.of) * 100))}%` }} /></i>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
