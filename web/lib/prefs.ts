// What this browser remembers of the player: the camera picked this session,
// the gnome, and the gnomes earned.
import { GNOMES } from "./scene/gnome";
import { reducedMotion } from "./device";
import { SLOW_KEY } from "./engine/pace";
import type { CamMode } from "./engine/types";

// the camera modes, in the order the button goes through them. A page always
// opens in Classic; a mode picked since is kept for this tab's session only.
export const CAM_ORDER: readonly CamMode[] = ["classic", "third", "far"];
const CAM_KEY = "gnogolf.cam.session";
export function savedCam(): CamMode {
  try {
    localStorage.removeItem("gnogolf.cam"); // the old, lasting choice: forgotten
    const c = sessionStorage.getItem(CAM_KEY);
    return CAM_ORDER.find((m) => m === c) ?? "classic";
  } catch {
    return "classic";
  }
}
export function saveCam(m: CamMode) {
  try { sessionStorage.setItem(CAM_KEY, m); } catch {}
}

/** Whether this player ever picked a gnome (a first visit has not). */
export function hadGnome() {
  try {
    return !!localStorage.getItem("gnogolf.gnome");
  } catch {
    return false;
  }
}

/** The gnome this player picked, if it is still theirs to play; the first one otherwise. */
export function savedGnome() {
  try {
    const id = localStorage.getItem("gnogolf.gnome");
    const gn = GNOMES.find((x) => x.id === id);
    if (!gn || (gn.unlock && !earned().includes(gn.id))) return GNOMES[0].id;
    return gn.id;
  } catch {
    return GNOMES[0].id;
  }
}

// A list of ids this browser keeps for good (the gnomes earned, the badges,
// the weathers holed out in): read back as strings only, a hand edit or an
// older format must not blank the page.
function kept(key: string): string[] {
  try {
    const e: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    return Array.isArray(e) ? e.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function keep(key: string, ids: readonly string[]) {
  try {
    const e = kept(key), add = ids.filter((id) => !e.includes(id));
    if (add.length) localStorage.setItem(key, JSON.stringify([...e, ...add]));
  } catch {}
}

/** The gnomes earned in this browser. */
export const earned = () => kept("gnogolf.earned");
/** A gnome earned, kept for good. */
export const remember = (id: string) => keep("gnogolf.earned", [id]);
/** The badges earned in this browser (lib/card.ts BADGES), and new ones kept for good. */
export const badgesEarned = () => kept("gnogolf.badges");
// (at: the hole they were earned on, kept for the new ones only)
export const rememberBadges = (ids: readonly string[], at: string) => {
  const add = ids.filter((id) => !badgesEarned().includes(id));
  keep("gnogolf.badges", add);
  if (!at || !add.length) return;
  try {
    localStorage.setItem(AT_KEY, JSON.stringify({ ...badgesAt(), ...Object.fromEntries(add.map((id) => [id, at])) }));
  } catch {}
};
const AT_KEY = "gnogolf.badges.at";
/** Where each badge was earned: its hole's id (the cup card stamps it there); strings only, as kept() reads. */
export function badgesAt(): Record<string, string> {
  try {
    const e: unknown = JSON.parse(localStorage.getItem(AT_KEY) || "{}");
    return e && typeof e === "object" && !Array.isArray(e) ? Object.fromEntries(Object.entries(e).filter((x): x is [string, string] => typeof x[1] === "string")) : {};
  } catch {
    return {};
  }
}
/** The weathers a hole was finished in ("" the calm one), for All weathers. */
export const weathersSeen = () => kept("gnogolf.weathers");
export const seeWeather = (kind: string) => keep("gnogolf.weathers", [kind]);

/** Stills and no clips on the cup cards: reduced motion, a data saver or a
 *  slow link, the Low graphics tier (or Auto on a device found slow). */
export function stillsOnly() {
  try {
    if (reducedMotion()) return true;
    const c = navigator.connection;
    if (c && (c.saveData || /2g/.test(c.effectiveType || ""))) return true;
    const gfx = localStorage.getItem("gnogolf.gfx");
    return gfx === "low" || (gfx !== "high" && localStorage.getItem(SLOW_KEY) === "low");
  } catch {
    return true;
  }
}
