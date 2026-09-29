// Audience measurement, and what goes wrong in the field (PostHog Cloud EU):
// anonymous and first-party, so no banner (the CNIL's audience-measurement
// exemption). No key (NEXT_PUBLIC_POSTHOG_KEY), nothing loads and nothing is
// sent: local dev has none, nor a page opened with the test hooks (?camlog).
// posthog-js comes in a chunk of its own once the page is idle; what is said
// before waits for it. Never who: no identify(), no replay, no heatmaps, the
// clicks' text and attributes masked, and every event scrubbed of addresses
// and share texts before it goes (clean). A visitor who objects (optOut, the
// About sheet) is not measured again in this browser. docs/analytics.md lists
// the events.
import type { CaptureResult, PostHog } from "posthog-js";
import { camlog } from "./testhooks";
import { isTouch, reducedMotion } from "./device";
import type { Mode } from "./types";

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || "";
/** The commit this build is of (next.config.mjs, from Netlify's COMMIT_REF). */
const BUILD = process.env.NEXT_PUBLIC_BUILD || "dev";
/** 13 months, the CNIL's longest for an audience id: the cookie's life, and
 *  past it (every visit renews the cookie) a new id. */
const MAX_DAYS = 390;

type Value = string | number | boolean | null | undefined;
type Props = Record<string, Value>;
/** How a duel's rival was found: a pick of the rival screen's, a dare link, a board. */
export type RivalKind = "champ" | "level" | "self" | "friend" | "surprise" | "board" | "link";
/** A round: the hole, its cup, solo or a duel, the aim. */
export type Play = { hole: string; cup: string; mode: "solo" | "duel"; aim: Mode };

/** The game's own events: what autocapture and the pageviews can't see. */
export interface Events {
  screen: { name: string };
  boot: { title_ms: number; hole_ms: number };
  hole_loaded: { hole: string; world: string; state_ms: number; world_ms: number; build_ms: number; compile_ms: number };
  hole_started: Play & { weather: string; period: number | null };
  stroke: { hole: string; n: number; power: number; angle: number; result: "holed" | "hazard" | "rest"; cause: string; bounces: number; chain_ms: number; fly_ms: number };
  hole_finished: Play & { strokes: number; par: number };
  hole_abandoned: Play & { strokes: number };
  restart: { hole: string; strokes: number; holed: boolean };
  fps: { hole: string; tier: string; fps: number; fps_p10: number; long: number; frames: number; memory_mb: number | null };
  perf: { tier: string; slow: boolean };
  save: { stage: "sent" | "ok" | "cancelled" | "failed"; parts?: number; part?: number; gas?: number; ms?: number; reason?: string };
  name_registered: { ok: boolean; via: "save" | "form" | "gnokey"; reason?: string };
  badge_earned: { id: string };
  cup_complete: { cup: string; strokes: number; vs_par: number; best: boolean };
  duel_started: { rival: RivalKind; ghost: number; mixed: boolean };
  duel_result: { rival: RivalKind; result: "win" | "loss" | "tie"; strokes: number; ghost: number };
  share: { target: string; what: "hole" | "cup" | "board" | "clip" };
  wallet: { adena: boolean; connected: boolean };
}

let ph: PostHog | null = null, started = false;
const queue: ((p: PostHog) => void)[] = [];

// the visitor's objection, kept in this browser (and for this page, storage blocked)
const OFF = "gnogolf.noStats";
let off = false;
/** Whether the visitor objected to the measurement. */
export const optedOut = () => {
  try {
    return off || localStorage.getItem(OFF) === "1";
  } catch {
    return off;
  }
};
/** The visitor objects: nothing more goes, from this page or a later one, and nothing loads again;
 *  what PostHog kept in this browser goes (its id, and its cookies: an earlier page's too). */
export function optOut() {
  off = true;
  try { localStorage.setItem(OFF, "1"); } catch {}
  queue.length = 0;
  if (ph) (ph.opt_out_capturing(), ph.reset(true));
  // (this host's only, no domain: cross_subdomain_cookie is off; its opt-out one too, OFF says it)
  try {
    for (const c of document.cookie.split(";")) {
      const name = c.split("=")[0].trim();
      if (/^(ph_|__ph_opt_in_out_)/.test(name)) document.cookie = `${name}=; Max-Age=0; path=/; SameSite=Lax`;
    }
  } catch {}
}

// (a page where it never loads, blocked: the first 200 wait, the rest go)
function run(f: (p: PostHog) => void) {
  if (!KEY || optedOut()) return;
  if (ph) f(ph);
  else if (queue.length < 200) queue.push(f);
}

/** One of the game's events. */
export const track = <E extends keyof Events>(event: E, props: Events[E]) => run((p) => void p.capture(event, props));
/** Said with every event from now on (the gnome, the aim, the hole played…). */
export const register = (props: Props) => run((p) => p.register(props));
/** Once a session: true the first time key is asked. */
export function once(key: string) {
  try {
    if (sessionStorage.getItem(`gnogolf.said.${key}`)) return false;
    sessionStorage.setItem(`gnogolf.said.${key}`, "1");
  } catch {}
  return true;
}
const told = new Map<string, number>();
/** A failure the game handled (a node down, Adena refusing, a hole that would
 *  not draw), where it happened and around what; the same one 3 times at most a page. */
export function trackError(where: string, err: unknown, props: Props = {}) {
  if (!KEY) return;
  const e = err instanceof Error ? err : new Error(String(err)), k = `${where}:${e.message}`, n = told.get(k) || 0;
  if (n >= 3) return;
  told.set(k, n + 1);
  run((p) => void p.captureException(e, { where, ...props }));
}

/** A failure in a word, to group them: its kind (chain.ts: down, chain), or what its message names. */
export function failure(err: unknown) {
  const kind = err instanceof Error && (err as Error & { kind?: string }).kind, m = err instanceof Error ? err.message : String(err);
  return kind || (/out of gas/i.test(m) ? "gas" : /insufficient/i.test(m) ? "funds" : /locked/i.test(m) ? "locked" : /already open/i.test(m) ? "busy" : /network|chain id|RPC/i.test(m) ? "network" : "other");
}

// ----------------------------------------------------------------- scrubbing

const G1 = /g1[0-9a-z]{38}/g; // a gno.land address (chain.ts ADDR), anywhere in a string
// what a URL keeps of its query: where in the game, never who (by=, friend=:
// an address) nor a share's text (a network's intent link, the referrer's)
const KEEP = new Set(["cup", "hole", "gnome", "screen"]);
/** A string as it may leave: URLs keep only KEEP; addresses, gno.land names (nym-…) and what follows an "address(" go. */
export function scrub(v: string) {
  if (/^https?:\/\//.test(v))
    try {
      const u = new URL(v);
      for (const k of [...u.searchParams.keys()]) if (!KEEP.has(k)) u.searchParams.delete(k);
      v = u.href;
    } catch {}
  return v
    .replace(G1, "g1…")
    .replace(/nym-[a-z0-9._-]+/gi, "nym-…")
    .replace(/address\(.*/gs, "address(…)")
    // a net for what never should pass here (the page holds no key): a private key's hex, a recovery phrase
    .replace(/\b(?:0x)?[0-9a-f]{64,}\b/gi, "hex…")
    .replace(/\b(?:[a-z]{3,8}\s+){11,}[a-z]{3,8}\b/g, "words…");
}
const deep = (v: unknown): unknown =>
  typeof v === "string" ? scrub(v) : Array.isArray(v) ? v.map(deep) : v && typeof v === "object" && !(v instanceof Date) ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, deep(x)])) : v;
/** An event scrubbed, every string in it (before_send): its properties, the person's first ones. */
export const clean = (e: CaptureResult | null): CaptureResult | null => e && ({ ...e, properties: deep(e.properties), $set: deep(e.$set), $set_once: deep(e.$set_once) } as CaptureResult);

// ------------------------------------------------------------------- loading

/** The init options (tested: what is on, what is off). */
export const OPTIONS = {
  api_host: "https://eu.i.posthog.com",
  ui_host: "https://eu.posthog.com",
  defaults: "2026-08-30",
  person_profiles: "identified_only", // and nobody is identified: anonymous events only
  // first-party, this host only, 13 months at most
  persistence: "cookie",
  opt_out_persistence_by_default: true, // an objection takes the cookie away, and none is written again
  cross_subdomain_cookie: false,
  cookie_expiration: MAX_DAYS,
  capture_pageview: "history_change", // the address bar follows the screens
  capture_pageleave: true,
  autocapture: true,
  mask_all_text: true, // the boards show names and addresses
  mask_all_element_attributes: true,
  capture_dead_clicks: true,
  capture_exceptions: { capture_unhandled_errors: true, capture_unhandled_rejections: true, capture_console_errors: true },
  capture_performance: { web_vitals: true, network_timing: false },
  disable_session_recording: true,
  enable_heatmaps: false,
  disable_surveys: true,
  disable_product_tours: true,
  disable_conversations: true,
  disable_web_experiments: true,
  advanced_disable_flags: true,
  before_send: clean,
} as const;

// the page as a word: what a layout is laid out for
const sizeOf = (w: number) => (w < 600 ? "phone" : w < 1024 ? "tablet" : "desktop");

/** Loads PostHog once the page is idle, then sends what was said meanwhile.
 *  Nothing without a key, under the test hooks, or for a visitor who objected. load: the import (the tests give theirs). */
export function start(load: () => Promise<{ default: PostHog }> = () => import("posthog-js")) {
  if (!KEY || started || camlog() || optedOut()) return;
  started = true;
  const net = (navigator as Navigator & { connection?: { effectiveType?: string } }).connection;
  register({ build: BUILD, touch: isTouch(), reduced_motion: reducedMotion(), dpr: devicePixelRatio, viewport: sizeOf(innerWidth), locale: navigator.language, online: navigator.onLine, net: net && net.effectiveType });
  return new Promise<void>((done) => {
    const go = () =>
      void load()
        .then(({ default: p }) => {
          if (optedOut()) return; // (objected while it loaded)
          p.init(KEY, {
            ...OPTIONS,
            loaded: (p) => {
              // an id older than 13 months starts again, its device id too (the cookie is renewed at each visit)
              const day = Math.floor(Date.now() / 864e5), since = Number(p.get_property("since_day"));
              if (since && day - since > MAX_DAYS) p.reset(true);
              p.register_once({ since_day: day });
            },
          });
          ph = p;
          for (const f of queue.splice(0)) f(p);
        })
        .catch(() => {}) // blocked, or offline: the game goes on without
        .finally(done);
    if (typeof requestIdleCallback === "function") requestIdleCallback(go, { timeout: 4000 });
    else setTimeout(go, 1000);
  });
}
