"use client";

// The checks, docked under the board (the GUI spec's B2): one row with the
// verdict and the limits as small gauges (amber from 80%, red at the
// limit); above it, when anything is wrong, the list, errors first, each
// line a click that selects its piece, and a one-click fix where its piece
// can simply move (edit.ts fixOf). The list scrolls in itself.
import type { Issue } from "@/lib/builder/checks";
import type { Gauge } from "@/lib/builder/editor";

export default function Checks({ verdict, gauges, issues, busy, onSelect, onFix }: {
  verdict: { ok: boolean; text: string };
  gauges: readonly Gauge[];
  issues: readonly Issue[];
  /** the checks are running again */
  busy: boolean;
  onSelect: (piece: string) => void;
  onFix: (issue: Issue) => void;
}) {
  return (
    <section className="checks" aria-label="Checks" aria-busy={busy}>
      {issues.length > 0 && (
        <ul className="issues" aria-label="What to fix, errors first">
          {issues.map((i, k) => (
            <li key={k} className={`issue issue--${i.severity === "error" ? "error" : "warn"}`} onClick={() => i.piece && onSelect(i.piece)}>
              <span>{i.text}</span>
              {i.piece && i.severity === "error" ? <button type="button" className="btn btn--ghost btn--s" onClick={(e) => (e.stopPropagation(), onFix(i))}>Move it</button> : <span />}
            </li>
          ))}
        </ul>
      )}
      <div className="checks__row">
        <span className={`verdict verdict--${verdict.ok ? "ok" : "bad"}`} role="status">{verdict.text}</span>
        <div className="gauges" aria-label="The chain's limits">
          {gauges.map((g) => (
            <div key={g.name} className={`gauge gauge--${g.level}${g.name === "Points" || g.name === "Size" ? " gauge--opt" : ""}`} title={g.name === "Room" ? `Room left for a first shot in its dearest weather: ${g.shown}` : `${g.name}: ${g.shown}`}>
              <span>{g.name}<em>{g.shown}</em></span>
              <i><b style={{ width: `${Math.max(3, Math.round(Math.min(1, g.used / g.of) * 100))}%` }} /></i>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
