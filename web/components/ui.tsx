"use client";

// The game's own controls, one of each: every button, switch and sheet in the
// game is one of these, so they all hover, press, focus and disable alike.
// Their look is in globals.css under "shared controls".

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ChangeEventHandler, type HTMLAttributes, type ReactNode } from "react";

/**
 * A button. variant: "primary" (green), "secondary" (paper), "chain" (the
 * blue on-chain one), "chip" (a HUD card that is a button), "icon" (round).
 * badge: a small label pinned to its top-right corner ("Coming soon", PRO).
 */
const VARIANTS = { primary: "btn--main", secondary: "btn--ghost", chain: "btn--chain", chip: "btn--chip", icon: "btn--icon" };
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof VARIANTS;
  badge?: ReactNode;
}
export function Button({ variant = "secondary", badge = null, className = "", children, ...props }: ButtonProps) {
  const v = VARIANTS[variant] || "btn--ghost";
  return (
    <button className={`btn ${v} ${className}`.trim()} {...props}>
      {children}
      {badge && <em className="badge">{badge}</em>}
    </button>
  );
}

/** Two or more choices side by side, one on: the aim mode, the board's tabs. full: the width of its container, halves equal. */
interface SegmentedProps<T extends string> {
  options: readonly (readonly [T, ReactNode])[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  full?: boolean;
  role?: "radiogroup" | "tablist";
  className?: string;
}
export function Segmented<T extends string>({ options, value, onChange, label, full = false, role = "radiogroup", className = "" }: SegmentedProps<T>) {
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
export function Toggle({ label, checked, onChange }: { label: ReactNode; checked: boolean; onChange: ChangeEventHandler<HTMLInputElement> }) {
  return (
    <label className="switch">
      <span>{label}</span>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} />
      <i aria-hidden="true" />
    </label>
  );
}

/** The X in a sheet's corner, the same everywhere. */
const CloseX = () => (
  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true"><path d="M4 4 16 16M16 4 4 16" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" /></svg>
);
export function SheetClose({ onClose, inline = false, first = false }: { onClose: () => void; inline?: boolean; first?: boolean }) {
  return (
    <button className={"round round--small round--x" + (inline ? "" : " sheet__close")} aria-label="Close" onClick={onClose} data-autofocus={first || undefined}>
      <CloseX />
    </button>
  );
}

// Dialogs open over one another (a confirm over the menu): only the top one
// hears Escape and keeps Tab inside it.
const open: object[] = [];
// the control last pressed: a click does not focus a button everywhere
// (Safari, a scripted click), so a dialog knows what opened it all the same
let pressed: HTMLElement | null = null;
if (typeof document !== "undefined")
  document.addEventListener("pointerdown", (e) => { pressed = e.target instanceof Element ? e.target.closest<HTMLElement>("button, a, summary, [tabindex]") : null; }, true);
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * What every dialog does: focus moves into it when it opens (its first
 * control, the close button in a sheet), Tab and Shift-Tab stay inside it,
 * Escape closes it (when it can be closed), and focus goes back to what
 * opened it once it is gone. Returns the ref for the dialog's element.
 */
export function useDialog<T extends HTMLElement = HTMLElement>(onClose: (() => void) | null | undefined) {
  const ref = useRef<T>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const me = {};
    open.push(me);
    const active = document.activeElement, el = ref.current;
    // what opened it: the focused control, else the one last pressed (never one
    // of its own: a dev remount finds its own control focused already)
    const back = [active instanceof HTMLElement && active !== document.body ? active : null, pressed].find((x) => x && !(el && el.contains(x))) || null;
    // its main action when it names one (data-autofocus), else its first control
    const first = el && (el.querySelector<HTMLElement>("[data-autofocus]") || el.querySelector<HTMLElement>(FOCUSABLE));
    (first || el)?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (open[open.length - 1] !== me || !ref.current) return;
      if (e.key === "Escape" && close.current) return e.stopPropagation(), close.current();
      if (e.key !== "Tab") return;
      const all = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
      if (!all.length) return e.preventDefault();
      const a = all[0], z = all[all.length - 1];
      if (!ref.current.contains(document.activeElement)) return e.preventDefault(), a.focus();
      if (e.shiftKey && document.activeElement === a) e.preventDefault(), z.focus();
      else if (!e.shiftKey && document.activeElement === z) e.preventDefault(), a.focus();
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      open.splice(open.indexOf(me), 1);
      // on the next task: the page's styles have caught up by then (a trigger
      // hidden while the dialog was open can take focus again), and a dialog
      // opened meanwhile (the menu's About) keeps its own focus
      if (back instanceof HTMLElement)
        setTimeout(() => {
          const now = document.activeElement;
          if (back.isConnected && (!now || now === document.body)) back.focus({ preventScroll: true });
        }, 0);
    };
  }, []);
  return ref;
}

/** A sheet over the game: its dim backdrop closes it, its X in the corner. */
interface SheetProps {
  label: string;
  onClose: () => void;
  className?: string;
  role?: "dialog" | "alertdialog";
  children?: ReactNode;
}
export function Sheet({ label, onClose, className = "", role = "dialog", children }: SheetProps) {
  const id = useId();
  const ref = useDialog<HTMLDivElement>(onClose);
  return (
    <div className="sheet" onClick={onClose}>
      <div ref={ref} tabIndex={-1} className={`sheet__in ${className}`.trim()} role={role} aria-modal="true" aria-label={label} id={id} onClick={(e) => e.stopPropagation()}>
        <SheetClose onClose={onClose} />
        {children}
      </div>
    </div>
  );
}

/** Any other dialog (the menu drawer, the win card, an error): useDialog on an element of its own. onClose: what Escape does, or nothing. */
interface DialogProps extends HTMLAttributes<HTMLElement> {
  onClose?: (() => void) | null;
  as?: "div" | "aside";
}
export function Dialog({ onClose = null, as: Tag = "div", children, ...props }: DialogProps) {
  const ref = useDialog<HTMLDivElement>(onClose);
  return (
    <Tag ref={ref} tabIndex={-1} {...props}>
      {children}
    </Tag>
  );
}
