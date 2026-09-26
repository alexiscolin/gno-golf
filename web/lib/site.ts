// The site's public address, for link cards, the canonical links and the
// sitemap (all need absolute URLs). On Netlify it follows the site by itself:
// a preview or branch deploy is at DEPLOY_PRIME_URL, production at URL (the
// custom domain once there is one). NEXT_PUBLIC_SITE_URL, when set, wins in
// production; anywhere else (another host, IPFS) set it before building.
export const PREVIEW = !!process.env.CONTEXT && process.env.CONTEXT !== "production";
export const SITE = ((PREVIEW && process.env.DEPLOY_PRIME_URL) || process.env.NEXT_PUBLIC_SITE_URL || process.env.URL || "http://localhost:3300").replace(/\/$/, "");

// the home page's words, also its text for crawlers (app/intro.tsx): a title
// of 50-60 characters and a description under 160, as search results show them
export const TITLE = "Gnogolf — free 3D mini-golf in your browser, on-chain";
export const DESCRIPTION =
  "A free 3D mini-golf in your browser: every hole is a smart contract on gno.land, every shot is computed by the chain. Pick a gnome and play, no wallet needed.";

/** The course's cups, in order, and how one is called. */
export const CUPS = ["garden", "island", "town", "mountain"];
export const cupName = (w: string) => w[0].toUpperCase() + w.slice(1) + (CUPS.includes(w) ? " Cup" : "");
