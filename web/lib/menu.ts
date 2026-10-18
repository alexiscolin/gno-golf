// The game's menu by its address (?screen=modes): where the Builder's Back and
// the shop's go. Light (no chain, no scene): the page's loading screen reads it
// too, so a visit to the menu never shows the title first.

/** The menu's head, the one Modes.tsx shows and the page's loading screen draws before it (app/game.tsx). */
export const MENU_HEAD = { back: "Back to the title", eyebrow: "Choose your game", title: "How do we play?" } as const;

/** The game's menu (keep: the page's own node, "rpc=…&web=…", passed on). */
export const menuLink = (keep = "") => `/?screen=modes${keep && `&${keep}`}`;

// on the way to the menu by the app's own navigation: its page draws before its address is the menu's
let going = false;

/** To the menu by the app's own navigation (the router's: no reload), the page opening on it told first. */
export function goToMenu(router: { push: (href: string) => void }, keep = "") {
  going = true;
  router.push(menuLink(keep));
}

/** Whether the page opens on the menu: on the way there, or at its address; the game opens on it, not on the title. */
export const onMenuLink = () => going || (typeof window !== "undefined" && window.location.pathname === "/" && new URLSearchParams(window.location.search).get("screen") === "modes");

/** The game has opened on the menu: a later page reads its address again. */
export const menuReached = () => void (going = false);
