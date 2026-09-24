"use client";

// The game's own controls, one of each: every button, switch and sheet in the
// game is one of these, so they all hover, press, focus and disable alike.
// Their look is in globals.css under "shared controls".

import { useId } from "react";

/**
 * A button. variant: "primary" (green), "secondary" (paper), "chain" (the
 * blue on-chain one), "chip" (a HUD card that is a button), "icon" (round).
 * badge: a small label pinned to its top-right corner ("Coming soon", PRO).
 */
export function Button({ variant = "secondary", badge = null, className = "", children, ...props }) {
  const v = { primary: "btn--main", secondary: "btn--ghost", chain: "btn--chain", chip: "btn--chip", icon: "btn--icon" }[variant] || "btn--ghost";
  return (
    <button className={`btn ${v} ${className}`.trim()} {...props}>
      {children}
      {badge && <em className="badge">{badge}</em>}
    </button>
  );
}

/** Two or more choices side by side, one on: the aim mode, the board's tabs. full: the width of its container, halves equal. */
export function Segmented({ options, value, onChange, label, full = false, role = "radiogroup", className = "" }) {
  return (
    <div className={`seg${full ? " seg--full" : ""} ${className}`.trim()} role={role} aria-label={label}>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role={role === "tablist" ? "tab" : "radio"}
          aria-checked={role === "tablist" ? undefined : value === v}
          aria-selected={role === "tablist" ? value === v : undefined}
          className={value === v ? "on" : ""}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

/** An on/off switch with its label (sound, vibration). */
export function Toggle({ label, checked, onChange }) {
  return (
    <label className="switch">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} />
      <i aria-hidden="true" />
    </label>
  );
}

/** The X in a sheet's corner, the same everywhere. */
export const CloseX = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 4 16 16M16 4 4 16" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /></svg>
);
export function SheetClose({ onClose, inline = false }) {
  return (
    <button className={"round round--small round--x" + (inline ? "" : " sheet__close")} aria-label="Close" onClick={onClose}>
      <CloseX />
    </button>
  );
}

/** A sheet over the game: its dim backdrop closes it, its X in the corner. */
export function Sheet({ label, onClose, className = "", role = "dialog", children }) {
  const id = useId();
  return (
    <div className="sheet" onClick={onClose}>
      <div className={`sheet__in ${className}`.trim()} role={role} aria-modal="true" aria-label={label} id={id} onClick={(e) => e.stopPropagation()}>
        <SheetClose onClose={onClose} />
        {children}
      </div>
    </div>
  );
}
