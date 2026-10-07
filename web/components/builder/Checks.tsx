"use client";

// The checks, docked under the board (the GUI spec's B3), as small as it can
// be: a line for the next step and the difficulty meter's guess (difficulty.ts
// meterLine: calm, its piece a click away), a line of gauges a player reads
// (editor.ts dials: the pieces, the moving ones, the room for shots, the
// size; a chain count only when near its limit, the rest a tap away, under
// Chain limits (ui.tsx InfoTip); amber from 80%, red at the limit, said in a
// sentence then). Under a problem it opens: each thing to fix in the player's words (explain.ts
// plainOf; the rule's code a tooltip, for us), a click on it selecting its
// piece and framing it, Move it where the piece can simply move (edit.ts
// fixOf); fixed, it folds back. Its live parts are said by a screen reader.
import { Button, InfoTip } from "@/components/ui";
import type { Issue } from "@/lib/builder/checks";
import { dials, problems, type Gauge } from "@/lib/builder/editor";

export default function Checks({ verdict, gauges, issues, busy, meter, onShow, onFix }: {
  /** warn: a round an edit broke, said calm (amber) */
  verdict: { ok: boolean; warn?: boolean; text: string };
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
  const d = dials(gauges), rows = problems(issues);
  const bad = rows.some((r) => r.bad) || !verdict.ok;
  return (
    <section className="checks" aria-label="Checks" aria-busy={busy}>
      <div className="checks__line">
        <span id="bench-verdict" className={`verdict verdict--${bad ? "bad" : verdict.warn ? "warn" : "ok"}`} role="status">{verdict.text}</span>
        <span className="checks__meter" aria-busy={meter?.busy}>
          {meter?.piece ? (
            <button type="button" className="linkish" title={`${meter.text} Show me.`} onClick={() => onShow(meter.piece!)}>{meter.text}</button>
          ) : meter && <span title={meter.text}>{meter.text}</span>}
        </span>
      </div>
      {/* (kept in the page when empty: a live region only speaks of what changes in it) */}
      <ul className="issues" aria-live="polite" aria-label="What to fix, errors first">
        {rows.map((r, k) => (
          <li key={k} className={`issue issue--${r.bad ? "error" : "warn"}`} title={r.rule}>
            {r.piece ? <button type="button" className="issue__why" title="Show me" onClick={() => onShow(r.piece!)}>{r.text}</button> : <span className="issue__why">{r.text}</span>}
            {r.fix && <Button size="s" type="button" onClick={() => onFix(issues[k])}>Move it</Button>}
          </li>
        ))}
      </ul>
      <div className="checks__limits">
        <div className="gauges" aria-label="Limits">
          {d.dials.map((g) => (
            <div key={g.name} className={`gauge gauge--${g.level}`} title={g.title}>
              <span>{g.label}</span><em>{g.shown}</em>
              <i><b style={{ width: `${g.fill}%` }} /></i>
            </div>
          ))}
        </div>
        {d.chain && <InfoTip className="linkish checks__chain" label="Chain limits" note={<>The chain&apos;s own limits, far off: {d.chain}</>}>Chain limits</InfoTip>}
      </div>
      <p className="checks__near" aria-live="polite">{d.reached.join(" · ")}</p>
    </section>
  );
}
