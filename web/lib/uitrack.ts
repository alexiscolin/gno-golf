// The interface's clicks, by name: one listener on the page and a table of the
// controls worth naming, matched by the selectors they already have. Never
// their text (it can hold a player's name): the action, and where it was.
import { track } from "./analytics";

export type UiAction = "mode_picked" | "rival_picked" | "rival_typed" | "rival_surprise" | "ghost_raced" | "board_raced" | "cup_picked" | "gnome_browsed" | "gnome_chosen" | "camera_changed" | "menu_opened" | "all_cups_clicked" | "wallet_clicked" | "mainnet_clicked" | "external_link_opened";
type Detail = { mode?: string; kind?: string; cup?: string; host?: string; locked?: boolean };

const suffix = (el: Element, block: string) => [...el.classList].find((c) => c.startsWith(`${block}--`))?.slice(block.length + 2);
const hostOf = (href: string) => {
  try {
    return new URL(href).host;
  } catch {
    return undefined;
  }
};
// what a link opens, by its class or its address's shape (chain.ts's gnoweb URLs), never the address itself
const linkKind = (el: Element) => {
  const href = (el as HTMLAnchorElement).href || "", host = hostOf(href) || "", has = (c: string) => [...el.classList].includes(c);
  return has("share__icon") ? "share"
    : /(^|\.)github\.com$/.test(host) ? "github"
    : /(^|\.)adena\.app$/.test(host) ? "adena"
    : /faucet/.test(host) ? "faucet"
    : has("src") || /\$source$|:[^#]*\/data$/.test(href) ? "src"
    : /\/u\/g1/.test(href) ? "player"
    : /:[^#]*\/g1[0-9a-z]{38}$/.test(href) ? "round"
    : /#(pro|assisted)$/.test(href) ? "board"
    : /\$help/.test(href) ? "form"
    : "other";
};

export const UI: readonly (readonly [string, UiAction, ((el: Element) => Detail)?])[] = [
  [".modes__list .mode:not([disabled])", "mode_picked", (el) => ({ mode: suffix(el, "mode") })],
  [".rival__pick:not([disabled])", "rival_picked", (el) => ({ kind: (el as HTMLElement).dataset.kind })],
  [".rival__surprise:not([disabled])", "rival_surprise"],
  ["button.ghost", "ghost_raced"],
  [".lb__race", "board_raced"],
  [".world:not([disabled])", "cup_picked", (el) => ({ cup: suffix(el, "world") })],
  ['[aria-label="Previous gnome"], [aria-label="Next gnome"]', "gnome_browsed"],
  // (a locked gnome on show: Play plays the one chosen before)
  [".screen--pick .btn--play", "gnome_chosen", (el) => ({ locked: !!el.closest(".screen--pick")?.querySelector(".pick__lock") })],
  [".cam-btn", "camera_changed"],
  [".burger", "menu_opened"],
  [".banner__out", "all_cups_clicked"],
  [".adena", "wallet_clicked"],
  [".netbanner__go", "mainnet_clicked"],
  ['a[target="_blank"]', "external_link_opened", (el) => ({ host: hostOf((el as HTMLAnchorElement).href), kind: linkKind(el) })],
];
const ANY = UI.map(([sel]) => sel).join(", ");

/** The named action a click is, if it is one: the control nearest the click that a row names. */
export function actionOf(target: EventTarget | null): ({ action: UiAction } & Detail) | null {
  if (!target || typeof (target as Element).closest !== "function") return null;
  const el = (target as Element).closest(ANY), row = el && UI.find(([sel]) => el.matches(sel));
  return row ? { action: row[1], ...row[2]?.(el) } : null;
}

/** Listens for the named clicks on the page; returns the way to stop. */
export function watchClicks(doc: Document = document) {
  const on = (e: MouseEvent) => {
    const a = actionOf(e.target);
    if (a) track("ui", a);
  };
  doc.addEventListener("click", on, { capture: true, passive: true });
  return () => doc.removeEventListener("click", on, { capture: true });
}
