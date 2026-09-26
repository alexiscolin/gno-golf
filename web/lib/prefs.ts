// What this browser remembers of the player: the camera picked this session,
// the gnome, and the gnomes earned.
import { GNOMES } from "./scene/gnome";
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
    if (!gn || (gn.unlock && !earned().includes(id))) return GNOMES[0].id;
    return gn.id;
  } catch {
    return GNOMES[0].id;
  }
}

/** The gnomes earned in this browser. */
export function earned(): unknown[] {
  try {
    const e: unknown = JSON.parse(localStorage.getItem("gnogolf.earned") || "[]");
    return Array.isArray(e) ? e : []; // a hand edit or an older format must not blank the page
  } catch {
    return [];
  }
}
/** A gnome earned, kept for good. */
export function remember(id: string) {
  try {
    const e = earned();
    if (!e.includes(id)) localStorage.setItem("gnogolf.earned", JSON.stringify([...e, id]));
  } catch {}
}

/** Stills and no clips on the cup cards: reduced motion, a data saver or a
 *  slow link, the Low graphics tier (or Auto on a device found slow). */
export function stillsOnly() {
  try {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
    const c = navigator.connection;
    if (c && (c.saveData || /2g/.test(c.effectiveType || ""))) return true;
    const gfx = localStorage.getItem("gnogolf.gfx");
    return gfx === "low" || (gfx !== "high" && localStorage.getItem(SLOW_KEY) === "low");
  } catch {
    return true;
  }
}
