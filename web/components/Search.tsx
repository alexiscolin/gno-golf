"use client";
// A toolbar's search (the shop's gnomes, the community's holes): an icon in the toolbar's right group, the field
// a row of its own under it while in use, a query kept shown; Escape or ✕ clears and closes it.
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from "react";
import { Button } from "@/components/ui";

/** The search's state, shared by its icon and its row (the screen holds it: the shop, the community's holes): open while in use; shown while open or a
 *  query is kept. Open, the field is focused; Escape (anywhere in the row or on the icon) or ✕ clears and closes it,
 *  and only it (the shop stays), the icon focused again; focus leaving both closes it (an empty search goes, a query
 *  kept stays shown); the icon opens it, or back to a query kept, and, open, clears and closes it. */
export function useSearch(value: string, onChange: (text: string) => void, says: { label: string; placeholder: string; id: string }) {
  const [open, setOpen] = useState(false);
  const field = useRef<HTMLInputElement>(null), icon = useRef<HTMLButtonElement>(null), row = useRef<HTMLDivElement>(null), back = useRef(false);
  const shown = open || value !== "";
  useEffect(() => {
    if (open) field.current?.focus();
    if (!shown && back.current) (back.current = false), icon.current?.focus();
  }, [shown, open]);
  const close = () => ((back.current = true), onChange(""), setOpen(false));
  return {
    value, onChange, open, shown, field, icon, row, close, ...says,
    press: () => (open ? close() : setOpen(true)),
    /** Escape closes the search and goes no further (the game's Escape leaves the screen) */
    key: (e: KeyboardEvent) => shown && e.key === "Escape" && (e.preventDefault(), e.stopPropagation(), close()),
    /** focus gone from the row and the icon: no longer in use */
    blur: (e: FocusEvent) => !row.current?.contains(e.relatedTarget) && e.relatedTarget !== icon.current && setOpen(false),
  };
}
type Search = ReturnType<typeof useSearch>;

/** The search's icon, in the toolbar's right group, pressed (gold) while the search shows. */
export function SearchButton({ search: s }: { search: Search }) {
  return (
    <Button ref={s.icon} variant="icon" size="s" type="button" className={`gbar__icon${s.shown ? " btn--on" : ""}`} aria-label={s.label}
      aria-expanded={s.shown} aria-controls={s.shown ? s.id : undefined} onClick={s.press} onKeyDown={s.key} onBlur={s.blur}
      onMouseDown={(e) => s.open && e.preventDefault()} /* (open, the field keeps the focus: a press closes it) */>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
    </Button>
  );
}

/** The search's row, under the toolbar, the list's width (it covers nothing), while it shows. */
export function SearchRow({ search: s }: { search: Search }) {
  if (!s.shown) return null;
  return (
    <div ref={s.row} className="gsearch" id={s.id} role="search" onKeyDown={s.key} onBlur={s.blur}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 21 21" /></svg>
      <input ref={s.field} type="search" placeholder={s.placeholder} aria-label={s.label} value={s.value} onChange={(e) => s.onChange(e.target.value)} />
      <Button variant="icon" size="s" type="button" className="gsearch__close" aria-label="Close the search" onClick={s.close}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </Button>
    </div>
  );
}
