"use client";

import { useState, type PointerEvent, type ReactNode } from "react";
import type { HoleRow } from "@/lib/types";
import type { CupTotal, cupTotals } from "@/lib/card";
import { sound } from "@/lib/feel";
import { Green } from "@/components/Title";
import "@/app/title.css";

// The world screen, between the title and the course: one emblem per world,
// drawn like a cup to win, and the builder to come. A world with no holes on
// this chain yet is shown, but cannot be picked.

export const WORLDS = [
  { id: "garden", name: "Garden Cup", tag: "Mushrooms, ponds and mountains" },
  { id: "island", name: "Island Cup", tag: "Sand spits, palms and the sea" },
  { id: "town", name: "Mushroom Town", tag: "Streets, lanterns and rooftops" },
  { id: "mountain", name: "Mountain Cup", tag: "Snowy peaks, pines and a chalet" },
];

// the scene is clipped to the round badge, and the ink ring drawn over it
function Frame({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <svg viewBox="0 0 120 120" aria-hidden="true">
      <defs>
        <clipPath id={`w-${id}`}>
          <circle cx="60" cy="60" r="56" />
        </clipPath>
      </defs>
      <g clipPath={`url(#w-${id})`}>{children}</g>
      <circle cx="60" cy="60" r="56" className="w__ring" />
    </svg>
  );
}

export function Emblem({ id }: { id: string }) {
  // each a little scene in the game's own inked, flat style
  if (id === "garden")
    return (
      <Frame id={id}>
        <circle cx="60" cy="60" r="56" className="w__sky w__sky--garden" />
        <path d="M 4 78 Q 30 58 56 72 Q 84 54 116 72 L 116 116 L 4 116 Z" className="w__hill" />
        <path d="M 70 40 L 84 18 L 98 40 Z" className="w__peak" />
        <path d="M 80 25 L 84 18 L 88 25 Z" className="w__snow" />
        <path d="M 26 84 L 34 56 L 42 84 Z" className="w__pine" />
        <path d="M 10 96 Q 60 84 110 96 L 110 116 L 10 116 Z" className="w__green" />
        <rect x="70" y="72" width="7" height="12" rx="2" className="w__stem" />
        <path d="M 62 74 Q 73 58 85 74 Z" className="w__cap" />
        <circle cx="70" cy="68" r="2" className="w__dot" />
        <circle cx="78" cy="70" r="1.6" className="w__dot" />
        <path d="M 46 98 V 70" className="w__pole" />
        <path d="M 46 70 L 58 74 L 46 78 Z" className="w__flag" />
      </Frame>
    );
  if (id === "island")
    return (
      <Frame id={id}>
        <circle cx="60" cy="60" r="56" className="w__sky w__sky--island" />
        <circle cx="88" cy="34" r="10" className="w__sun" />
        <path d="M 4 74 Q 20 70 36 74 T 68 74 T 100 74 T 116 74 L 116 116 L 4 116 Z" className="w__sea" />
        <path d="M 14 88 Q 22 84 30 88 M 76 94 Q 84 90 92 94" className="w__wave" />
        <path d="M 24 84 Q 60 64 100 84 Q 60 94 24 84 Z" className="w__sand" />
        <path d="M 56 80 Q 52 60 60 42" className="w__trunk" />
        <path d="M 60 42 Q 44 36 36 46 M 60 42 Q 76 34 86 44 M 60 42 Q 50 28 40 30 M 60 42 Q 72 28 80 28" className="w__frond" />
        <path d="M 80 82 V 62" className="w__pole" />
        <path d="M 80 62 L 92 66 L 80 70 Z" className="w__flag" />
      </Frame>
    );
  if (id === "mountain")
    return (
      <Frame id={id}>
        <circle cx="60" cy="60" r="56" className="w__sky w__sky--mountain" />
        <path d="M 4 88 L 34 40 L 52 64 L 72 28 L 116 88 Z" className="w__peak" />
        <path d="M 27 51 L 34 40 L 41 51 L 37 49 L 34 53 Z M 64 41 L 72 28 L 80 41 L 76 38 L 72 44 L 68 38 Z" className="w__snow" />
        <path d="M 4 86 Q 60 76 116 86 L 116 116 L 4 116 Z" className="w__snowfield" />
        <path d="M 18 94 L 26 70 L 34 94 Z" className="w__pine" />
        <rect x="64" y="78" width="26" height="18" rx="2" className="w__chalet" />
        <path d="M 60 80 L 77 66 L 94 80 Z" className="w__roof" />
        <rect x="74" y="85" width="7" height="11" rx="2" className="w__door" />
        <path d="M 46 98 V 72" className="w__pole" />
        <path d="M 46 72 L 58 76 L 46 80 Z" className="w__flag" />
      </Frame>
    );
  if (id === "town")
    return (
      <Frame id={id}>
        <circle cx="60" cy="60" r="56" className="w__sky w__sky--town" />
        <path d="M 4 92 L 116 92 L 116 116 L 4 116 Z" className="w__street" />
        <path d="M 30 100 H 42 M 54 100 H 66 M 78 100 H 90" className="w__lane" />
        <rect x="18" y="62" width="22" height="30" rx="4" className="w__wall" />
        <path d="M 10 66 Q 29 34 48 66 Z" className="w__cap" />
        <rect x="25" y="76" width="8" height="16" rx="4" className="w__door" />
        <rect x="70" y="54" width="28" height="38" rx="5" className="w__wall" />
        <path d="M 60 58 Q 84 18 108 58 Z" className="w__cap w__cap--gold" />
        <circle cx="84" cy="70" r="5" className="w__window" />
        <rect x="80" y="78" width="8" height="14" rx="4" className="w__door" />
        <path d="M 54 92 V 64" className="w__pole" />
        <rect x="50" y="58" width="8" height="9" rx="2" className="w__lamp" />
      </Frame>
    );
  return (
    <Frame id="build">
      <circle cx="60" cy="60" r="56" className="w__sky w__sky--build" />
      <path d="M 20 40 H 100 M 20 60 H 100 M 20 80 H 100 M 40 20 V 100 M 60 20 V 100 M 80 20 V 100" className="w__grid" />
      <path d="M 30 88 Q 50 50 90 70" className="w__plan" />
      <circle cx="30" cy="88" r="5" className="w__white" />
      <path d="M 90 70 V 44" className="w__pole" />
      <path d="M 90 44 L 102 48 L 90 52 Z" className="w__flag" />
      <path d="M 44 34 L 70 60" className="w__handle" />
      <rect x="34" y="24" width="22" height="12" rx="3" transform="rotate(45 45 30)" className="w__head" />
    </Frame>
  );
}

// the hover tilt: the card leans toward the pointer, its diorama shifts the
// other way and the gloss follows (a mouse only; nothing under reduced motion: see title.css)
const tilt = (e: PointerEvent<HTMLElement>) => {
  if (e.pointerType !== "mouse") return;
  const el = e.currentTarget, r = el.getBoundingClientRect();
  const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
  for (const [k, v] of [["--rx", `${(x * 14).toFixed(1)}deg`], ["--ry", `${(-y * 10).toFixed(1)}deg`], ["--px", x.toFixed(2)], ["--py", y.toFixed(2)], ["--mx", `${Math.round((x + 0.5) * 100)}%`]])
    el.style.setProperty(k, v);
};
const untilt = (e: PointerEvent<HTMLElement>) => ["--rx", "--ry", "--px", "--py", "--mx"].forEach((k) => e.currentTarget.style.removeProperty(k));

interface WorldsProps {
  counts?: Record<string, number>;
  /** where the player stands in each cup (cupTotals) */
  stats: ReturnType<typeof cupTotals>;
  current?: string | null;
  onPick: (world: string) => void;
  onBack: () => void;
  onReset: (world: string) => void;
  onResetAll: () => void;
  community?: readonly HoleRow[];
  onCommunity?: (id: string) => void;
}
const NOT_PLAYED: Pick<CupTotal, "done" | "strokes" | "par" | "clean"> = { done: 0, strokes: 0, par: 0, clean: false };
export default function Worlds({ counts = {}, stats, current, onPick, onBack, onReset, onResetAll, community = [], onCommunity = () => {} }: WorldsProps) {
  const [wipe, setWipe] = useState<string | null>(null); // what was asked to be cleared, before the second tap
  const [resets, setResets] = useState(false); // the little reset menu at the top
  const [hot, setHot] = useState<string | null>(null); // the cup under the pointer or the focus: the backdrop takes its colours
  const PAGE = 24;
  const [shown, setShown] = useState(PAGE); // community holes listed, a page more on each "Show more"
  const played = WORLDS.filter((w) => stats[w.id] && stats[w.id].done);
  const clear = (what: string, run: () => void) => {
    if (wipe !== what) return (sound("blip"), setWipe(what));
    run();
    setWipe(null);
    setResets(false);
  };
  return (
    <div className={`screen worlds worlds--v2 worlds--${hot || current || "garden"}`}>
      <button className="round round--small round--back screen__back" aria-label="Back to the title" onClick={() => (sound("blip"), onBack())}>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="worlds__in">
        <span className="eyebrow">Choose your cup</span>
        <h2 className="worlds__title">Where do we play?</h2>
        {played.length > 0 && (
          <div className="resets">
            <button className="world__reset" aria-expanded={resets} onClick={() => (sound("blip"), setResets((o) => !o), setWipe(null))}>
              Reset scores ▾
            </button>
            {resets && (
              <div className="resets__menu" role="menu">
                {played.map((w) => (
                  <button key={w.id} role="menuitem" className={"world__reset" + (wipe === w.id ? " world__reset--sure" : "")} onClick={() => clear(w.id, () => onReset(w.id))}>
                    {wipe === w.id ? "Sure? Tap again" : w.name}
                  </button>
                ))}
                <button role="menuitem" className={"world__reset" + (wipe === "all" ? " world__reset--sure" : "")} onClick={() => clear("all", onResetAll)}>
                  {wipe === "all" ? "Sure? Tap again" : "Every cup"}
                </button>
              </div>
            )}
          </div>
        )}
        <ul className="worlds__list">
          {WORLDS.map((w) => {
            const n = counts[w.id] || 0;
            // where the player stands in it: holes done, and strokes against par
            const t = stats[w.id] || NOT_PLAYED;
            const vs = t.strokes - t.par;
            return (
              <li key={w.id}>
                <button
                  className={`world world--${w.id}` + (w.id === current ? " world--on" : "")}
                  disabled={!n}
                  onClick={() => (sound("select"), onPick(w.id))}
                  onPointerEnter={() => n && setHot(w.id)}
                  onPointerMove={tilt}
                  onPointerLeave={(e) => (untilt(e), setHot(null))}
                  onFocus={() => setHot(w.id)}
                  onBlur={() => setHot(null)}
                  aria-label={`${w.name}: ${n ? `${n} holes` + (t.done ? `, ${t.done} played, ${vs > 0 ? "+" : ""}${vs} against par` : "") : "coming soon"}`}
                >
                  {/* its world in 3D, baked by the title's own scene */}
                  <span className="world__art"><img src={`title/cup-${w.id}.webp`} alt="" width="480" height="360" loading="eager" /></span>
                  <span className="world__ribbon">{w.name}</span>
                  <span className="world__info">
                  <span className="world__tag">{w.tag}</span>
                  <span className="world__count">{n ? `${n} holes` : "Coming soon"}</span>
                  {n > 0 && (
                    <span className="world__me">
                      <span className={`world__track load--${w.id}`}><Green p={t.done / n} world={w.id} holed={t.done === n} thick /></span>
                      <span className="world__score">
                        {t.done ? (
                          <>
                            <b>{t.done}/{n}</b> · {t.strokes} stroke{t.strokes === 1 ? "" : "s"} · <b className={vs < 0 ? "good" : vs > 0 ? "bad" : ""}>{vs > 0 ? "+" : ""}{vs}</b>
                            {t.clean && <span className="world__stamp" title="At par or under">★</span>}
                          </>
                        ) : "Not played yet"}
                      </span>
                    </span>
                  )}
                  </span>
                </button>
              </li>
            );
          })}
          <li>
            <button className="world world--build" disabled aria-label="Builder: coming soon">
              <Emblem id="build" />
              <span className="world__ribbon">Builder</span>
              <span className="world__info">
                <span className="world__tag">Draw your own hole, dare the others</span>
                <span className="world__count">Coming soon</span>
              </span>
            </button>
          </li>
        </ul>
        {/* anyone can register a hole: those outside the course are playable here, in no cup and on no ranking */}
        {community.length > 0 && (
          <section className="community" aria-label="Community holes">
            <h3>Community holes <small>not ranked</small></h3>
            <ul>
              {community.slice(0, shown).map((h) => (
                <li key={h.id}>
                  <button className="linkish" onClick={() => (sound("select"), onCommunity(h.id))}>{h.name}</button>
                </li>
              ))}
            </ul>
            {community.length > shown && (
              <button className="linkish" onClick={() => setShown((n) => n + PAGE)}>
                Show more ({community.length - shown} left)
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
