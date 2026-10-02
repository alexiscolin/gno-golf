import { isLoopback } from "./network";
import { CUPS as COURSE, CUP_NAMES, type Cup } from "./card";

// The site's public address, for link cards, the canonical links and the
// sitemap (all need absolute URLs). On Netlify it follows the site by itself:
// a preview or branch deploy is at DEPLOY_PRIME_URL, production at URL (the
// custom domain once there is one). NEXT_PUBLIC_SITE_URL, when set, wins in
// production; anywhere else (another host, IPFS) set it before building.
export const PREVIEW = !!process.env.CONTEXT && process.env.CONTEXT !== "production";
export const SITE = ((PREVIEW && process.env.DEPLOY_PRIME_URL) || process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || "http://localhost:3300").replace(/\/$/, "");

/** The public address of a page of the game (link: its "?cup=…&hole=…"): the
 *  page's own site, or on this machine the public one (SITE), never a
 *  local dev address. */
export function siteURL(link = "") {
  const here = typeof window !== "undefined" ? window.location.origin + window.location.pathname.replace(/\/h\/.*$/, "/") : ""; // a hole's page (app/h) links from the site's root
  const origin = typeof window !== "undefined" && isLoopback(window.location.hostname) ? SITE : here.replace(/\/$/, "");
  return origin + (link ? "/" + link.replace(/^\/?/, "") : "");
}
/** The site's name as a player types it: gnogolf.xyz. */
export const siteHost = () => new URL(siteURL()).host;

/** A new issue on the game's repository: feedback, a record hidden by mistake. */
export const ISSUES = "https://github.com/alexiscolin/gno-golf/issues/new";

// the home page's words, also its text for crawlers (app/intro.tsx): a title
// of 50-60 characters and a description under 160, as search results show them
export const TITLE = "Gnogolf: free 3D mini-golf in your browser, on-chain";
export const DESCRIPTION =
  "A free 3D mini-golf in your browser: every hole lives on gno.land and every shot is computed by the chain. Pick a gnome and play, no wallet needed.";

/** What every shared text ends with. */
export const SHARE_TAGS = " #gnoland @_gnoland";

/** The course's cups, in order, and how one is called. */
export const CUPS: readonly string[] = COURSE;
export const cupName = (w: string) => CUP_NAMES[w as Cup] || w[0].toUpperCase() + w.slice(1);
