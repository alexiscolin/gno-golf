"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createGame, type Game, type GameOptions, type Snapshot } from "@/lib/engine";
import { isTouch } from "@/lib/device";
import { camlog } from "@/lib/testhooks";
import { GNOMES, cheer, motion } from "@/lib/scene";
import { DEFAULT_RPC, DEFAULT_WEB, safeEndpoint, isHoleId, isAddress, errorKind, REALM_PATH, RULES, type Chain } from "@/lib/chain";
import { HOT, type CamMode, type ErrorKind } from "@/lib/engine/types";
import type { Skin } from "@/lib/scene/gnome";
import type { Ghost, HoleRow, Mode } from "@/lib/types";
import { duelResult, duelShare, pickGhost, toBeat, type Duel } from "@/lib/duel";
import { SHARE_TAGS } from "@/lib/site";
import { DuelFine, DuelNote, type Sky } from "@/components/Duel";
import type { Card, Cup } from "@/lib/card";
import type { Feel } from "@/lib/feel";
import { hasAdena, connect, current, onOurNode, recordRound, chainSplit, gasOf, shortOf, depositBytes, ADENA_URL, nameBytes, NAME_GAS, onWalletChange, type SendError } from "@/lib/adena";
import Title, { Hat, choresOf } from "@/components/Title";
import Worlds, { WORLDS, Emblem, worldOf } from "@/components/Worlds";
import Weather from "@/components/Weather";
import Share, { ShareClip, type Clip } from "@/components/Share";
import Gnokey from "@/components/Gnokey";
import About, { AboutButton, BackButton, Rules } from "@/components/About";
import { Badges, CardStamps, ChainSeal, EarnedBadges, NewBadges } from "@/components/Badges";
import Tip from "@/components/Tip";
import Modes, { Ghosts, ModeTag, Rival } from "@/components/Modes";
import { useGnomeStage } from "@/components/Stage";
import { Button, Segmented, Toggle, Sheet, SheetClose, Dialog } from "@/components/ui";
import { loadCard, recordScore, clearCard, clearCup, totals, cupTotals, parOf, UNLOCKS, cupHasGnome, cupOf, cardKey, scoreOf, vsPar, badgesFor, byRarity, BADGES, loadOnChain, markOnChain } from "@/lib/card";
import { feel, setFeel, sound, hush } from "@/lib/feel";
import { addFriend } from "@/lib/friends";
import { messageOf, holeLink, parHere, HONEST, suggestName, saveOf, pendingOf, strokesWord, shortAddr, useCopied, saveBy, mmss, costLine, fundCmd, holeNumber, nextCup, golfTerm, nextHole, chainQuery, type SaveOf } from "@/components/common";
import { clipName } from "@/lib/clip";
import { Boards, FullBoard, Podium, NameForm, nameOnce, useNameCheck, useRankNudge, useSavedPlace, type BoardProps, type NameCheck } from "@/components/Leaderboard";
import { FAUCET, GNOT_URL, networkOf, OTHER_URL } from "@/lib/network";
import { CAM_ORDER, savedCam, saveCam, hadGnome, savedGnome, earned, remember, badgesAt, badgesEarned, forgetBadges, rememberBadges, seeWeather, weathersSeen } from "@/lib/prefs";

// The test hooks (?play, ?shot, ?demo, ?weather, ?world, ?promo) answer in a
// dev build, or on a page opened with ?camlog where the hooks answer
// (lib/testhooks.ts); ?won, a win card for a round nobody played, in a dev
// build only.
const DEV = process.env.NODE_ENV !== "production";
// the shot clip in the hole-finished card (ADR-003): NEXT_PUBLIC_CLIPS=1, or
// ?clips in a dev build (the flag is read when the dev server starts)
const CLIPS = process.env.NEXT_PUBLIC_CLIPS === "1";

declare global {
  interface Window {
    // ?camlog: the game within reach of the camera probe (a test hook)
    __g?: Game;
  }
}

const SCREENS = ["title", "modes", "rival", "ghosts", "worlds", "pick", "play"] as const;
type Screen = (typeof SCREENS)[number];
const isScreen = (v: unknown): v is Screen => SCREENS.some((x) => x === v);
type Gfx = "auto" | "high" | "low";
/** The connected Adena account. */
type Account = NonNullable<Awaited<ReturnType<typeof current>>>;
// the last finished round not yet on the chain, kept for this tab: installing
// Adena means reloading the page, and the round it was installed for must not go
const PENDING = "gnogolf.pending";
const roundOf = (r: SaveOf) => `${r.id}#${r.shots.join(";")}`; // a round's key: its hole and shots

/** How a save goes: signing (part of of), refused (why; stale: its weather is over), or saved. */
type Rec = null
  | { at: "signing"; part?: number; of?: number }
  | { at: "refused"; error: string; stale: boolean }
  | { at: "saved" };

/** Config travels in the query string, so one build serves any chain. */
interface Config {
  rpc: string;
  web: string;
  hole: string;
  cup: string;
  place: number;
  gnome: string;
  shot: string;
  play: boolean;
  demo: string;
  weather: string;
  world: string;
  won: number;
  clips: boolean;
}
function useConfig() {
  const [cfg, setCfg] = useState<Config | null>(null);
  useEffect(() => {
    const p0 = new URLSearchParams(window.location.search);
    const hooks = DEV || camlog();
    const TEST = ["shot", "play", "demo", "weather", "world", "won"];
    const p = new URLSearchParams([...p0].filter(([k]) => (hooks || !TEST.includes(k)) && (DEV || k !== "won")));
    // a hole's own page (app/h): /h/garden-3/ its slot, /h/garden/ its cup; a ?hole= or ?cup= wins
    const [, pw, pn] = /^\/h\/([a-z]{2,16})(?:-(\d{1,3}))?\/?$/.exec(window.location.pathname) || [];
    if (pw && !p.has("hole") && !p.has("cup")) p.set(pn ? "hole" : "cup", pn ? `${pw}/${pn}` : pw);
    setCfg({
      rpc: safeEndpoint(p.get("rpc"), process.env.NEXT_PUBLIC_RPC || DEFAULT_RPC),
      web: safeEndpoint(p.get("web"), process.env.NEXT_PUBLIC_WEB || DEFAULT_WEB),
      // a link to a hole: ?cup=island&hole=3 (its place in the cup), or its
      // id (?hole=garden/7/v2, a slot's current version ?hole=garden/7, a
      // community or realm hole's id); &gnome= the sharer's gnome
      hole: isHoleId(p.get("hole") || "") ? p.get("hole") || "" : "",
      cup: /^[a-z]{2,16}$/.test(p.get("cup") || "") ? p.get("cup") || "" : "",
      place: /^\d{1,3}$/.test(p.get("hole") || "") ? Number(p.get("hole")) : 0,
      gnome: /^[a-z]{2,16}$/.test(p.get("gnome") || "") ? p.get("gnome") || "" : "",
      shot: p.get("shot") || "",
      // ?play skips the title screen — for screenshots and smoke tests
      play: p.has("play") || p.has("shot"),
      // ?demo=angle,power;angle,power… plays those shots once the game starts
      demo: p.get("demo") || "",
      // ?weather=wind,rain,fog,storm shows the forecast HUD without the chain — for screenshots
      weather: p.get("weather") || "",
      // ?world=island|town dresses the hole in that world's look — for building one
      world: p.get("world") || "",
      won: Number(p.get("won")) || 0,
      clips: CLIPS || (DEV && p0.has("clips")),
    });
  }, []);
  return cfg;
}

// where the ball is on the tab title: kept outside React, so an update in
// mid-roll does not send it back to the start
const rolling = { k: 0 };

// The game's fast-moving fields — the power bar, the cause of a push, the
// storm's flashes — are read from a store of their own by the few parts that
// show them; everything else re-renders only when a slower field changes.
const HOT_KEYS = new Set<string>(HOT);
type HotFields = Pick<Snapshot, (typeof HOT)[number]>;
function makeHot() {
  let v: Partial<HotFields> = {};
  const subs = new Set<() => void>();
  return {
    get: () => v,
    set(n: Snapshot) {
      if (HOT.every((k) => n[k] === v[k])) return;
      v = { power: n.power, cause: n.cause, flash: n.flash };
      subs.forEach((f) => f());
    },
    sub: (f: () => void) => (subs.add(f), () => void subs.delete(f)),
  };
}
type Hot = ReturnType<typeof makeHot>;
const useHot = <K extends keyof HotFields>(hot: Hot, k: K) => useSyncExternalStore(hot.sub, () => hot.get()[k], () => hot.get()[k]);
/** Whether two game snapshots differ only in their fast-moving fields. */
const sameCold = <T extends object>(a: T, b: T) => {
  for (const k in b) if (!HOT_KEYS.has(k) && a[k] !== b[k]) return false;
  return true;
};
function AimBar({ hot }: { hot: Hot }) {
  const power = useHot(hot, "power") || 0;
  return <span style={{ width: `${Math.round(power * 100)}%` }} />;
}
function CauseNote({ hot }: { hot: Hot }) {
  const cause = useHot(hot, "cause");
  return cause ? <div key={cause.at} className="cause" aria-live="polite">{cause.label}</div> : null;
}
function LiveWeather({ hot, ...props }: { hot: Hot; w: Snapshot["weather"]; until: number | null }) {
  return <Weather {...props} flash={useHot(hot, "flash") || 0} />;
}

/** p, or a rejection once ms have gone by (its timer cleared either way). */
function within<T>(p: Promise<T>, ms = 4000): Promise<T> {
  let t: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([p, new Promise<never>((_, no) => (t = setTimeout(() => no(new Error("The chain did not answer in time.")), ms)))]).finally(() => clearTimeout(t));
}
const NONE: readonly never[] = []; // an empty list that stays the same one: memos keep

/** The locked gnome a shared link asked for, said once: null when there is none. */
function lockedNote() {
  if (typeof window === "undefined") return null;
  const want = new URLSearchParams(window.location.search).get("gnome");
  const gn = want && GNOMES.find((x) => x.id === want);
  if (!gn || !gn.unlock || earned().includes(gn.id)) return null;
  const own = savedGnome(), mine = GNOMES.find((x) => x.id === own) || GNOMES[0];
  return `${gn.name.replace(/^The /, "")} is locked — playing as ${mine.name.replace(/^The /, "")}`;
}

/** What stopped the start: the chain not answering, a chain with no hole, ours, or no WebGL here. */
type FatalKind = "down" | "empty" | "bug" | "webgl";
function fatalKind(err: unknown): FatalKind {
  const m = messageOf(err);
  if (/no hole is registered/.test(m)) return "empty";
  if (errorKind(err) === "down" || /fetch|network|timed? ?out|timeout|abort|rpc|abci|http|connect|load failed|did not answer/i.test(m)) return "down";
  return "bug";
}
// what the error banner says, per kind: its title and its sentence
const BANNER = {
  down: ["The course is not reachable right now", "The chain the game plays on did not answer. It may be restarting."],
  webgl: ["Your browser can't draw 3D here", "Turn on hardware acceleration in the browser's settings, then reload. The course is also playable as text on gno.land."],
  empty: ["No hole on this chain yet", "The chain answered, but no hole is registered on it. Try again once the course is deployed."],
  bug: ["Something went wrong", "The game hit an error in this browser. Reloading the page usually fixes it."],
  load: ["That hole did not load", "The chain did not send this hole. Try again, or pick another one from the menu."],
  draw: ["That hole could not be drawn", "Something broke on our side while building it. Pick another hole from the menu — your scores are safe."],
  limit: ["That is the most strokes a round holds", "Restart the hole to play it again."],
  shot: ["That shot did not go through", "The chain could not play that shot. Nothing was lost; you can shoot again."],
} as const satisfies Record<FatalKind | ErrorKind, readonly [string, string]>;

// how far this device's clock is behind the chain's (ms): a deadline on the
// chain's clock, less this, is one on the device's
const skewOf = (chain: Chain | null | undefined) => (chain && chain.now ? chain.now() - Date.now() : 0);

/** The time now on a clock (the chain's), read again every second. */
function useNow(clock: () => number) {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const t = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(t);
  }, [clock]);
  return now;
}

/** How long the round can still go on-chain ("within 4:12"), then, once its
 *  time is over, that it can't. */
// by and clock (now, ms) on the chain's clock; ranked: a course hole (a community one ranks nobody)
// again: what the button to play again says (Rematch in a duel)
function SaveClock({ by, clock = Date.now, stale, ranked, again = "Play again" }: { by: number; clock?: () => number; stale?: boolean; ranked: boolean; again?: string }) {
  const now = useNow(clock);
  const left = by - now;
  if (left > 0 && !stale)
    return (
      <p className={"saveclock" + (left < 60000 ? " saveclock--soon" : "")}>
        Only in this browser. Save within <b>{mmss(left)}</b> {ranked ? "to be ranked" : "to keep it on your address"}.
      </p>
    );
  return (
    <p className="note note--warn">
      This round's weather is over: it can no longer be saved on-chain. {again} in the new one.
    </p>
  );
}

/** "Trying again in 8 s…": the start is retried on its own every 10 s. */
function Retry({ onRetry }: { onRetry: () => void }) {
  const [left, setLeft] = useState(10);
  const again = useRef(onRetry);
  again.current = onRetry;
  useEffect(() => {
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) again.current();
  }, [left]);
  return <p className="banner__retry" aria-live="polite">Trying again in {Math.max(0, left)} s…</p>;
}

/** A word over the course for a moment. Taken away by a timer, not by its animation: with reduced motion there is none. */
function Toast({ text, onDone }: { text: string; onDone: () => void }) {
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const t = setTimeout(() => done.current(), 3200);
    return () => clearTimeout(t);
  }, []);
  return <div className="toast" role="status">{text}</div>;
}

// gno.land's mainnet: its GNOT is the real one
const MAINNET = "gnoland-1";
// The storage deposit of a save, in ugnot: a first save on a hole writes the
// round, the best (with its strokes' shots) and the board entry; a hole saved
// before is replaced.
// saved: null when not known yet (counted as a first save: the larger).
const depositOf = (saved: boolean | null, bytePrice: number, firstOnCourse: boolean, strokes: number) => depositBytes(saved !== true, firstOnCourse, strokes) * bytePrice;



export default function Golf() {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<Game | null>(null);
  const cfg = useConfig();

  const [s, setS] = useState<Snapshot | null>(null);
  const hot = useRef<Hot | null>(null);
  if (!hot.current) hot.current = makeHot();
  const cold = useRef<Snapshot | null>(null); // the snapshot last given to setS
  const [fatal, setFatal] = useState<{ msg: string; kind: FatalKind } | null>(null); // the game could not start
  const [boot, setBoot] = useState(0); // a retry of the start: a new game
  const [gl, setGl] = useState<null | "lost" | "gone">(null); // the WebGL context was taken away
  // title -> pick a gnome -> play; the title shows at once, the hole loads behind it
  const [screen, setScreen] = useState<Screen>("title");
  const playing = screen === "play";
  // what the effects below follow of the game's state, as plain values
  const holeId = s && s.id;
  const fresh0 = !!(s && s.shots.length === 0);
  const holedNow = !!(s && s.holed);
  const holeReady = !!(s && s.ready); // the hole on screen, built and its shaders ready
  // the rain and the wind stay on the course: silent on every other screen,
  // and while the window is behind another one (the course is not drawn then)
  const [away, setAway] = useState(false);
  useEffect(() => {
    const off = () => setAway(true), on = () => setAway(false);
    window.addEventListener("blur", off);
    window.addEventListener("focus", on);
    return () => (window.removeEventListener("blur", off), window.removeEventListener("focus", on));
  }, []);
  useEffect(() => hush(!playing || away), [playing, away]);
  // the title, the cups and the picker hide the course entirely: nothing to draw
  useEffect(() => {
    game.current && game.current.cover && game.current.cover(!playing);
  }, [playing, holeId]);
  // the gnome: a shared link's if this player has it, else their own; a link
  // never unlocks one, and is never saved as the player's choice
  const [linkNote, setLinkNote] = useState(lockedNote);
  // a player's first hole: once, where to see all of it
  const [farHint, setFarHint] = useState(() => {
    try {
      return !localStorage.getItem("gnogolf.hint.far");
    } catch {
      return false;
    }
  });
  const [gnome, setGnome] = useState(() => {
    const own = savedGnome();
    if (typeof window === "undefined") return own;
    const want = new URLSearchParams(window.location.search).get("gnome");
    const gn = want && GNOMES.find((x) => x.id === want);
    if (!gn) return own;
    if (!gn.unlock || earned().includes(gn.id)) return gn.id;
    return own; // a locked one: lockedNote says so
  });
  const [menu, setMenu] = useState(false);
  const [board, setBoard] = useState(false); // the leaderboard sheet
  const [about, setAbout] = useState(false); // the about sheet
  const [support, setSupport] = useState(false); // the tip's sheet (a heart beside About, and in the menu)
  const [rules, setRules] = useState(false); // the rules' sheet
  // the aim mode, kept in this browser: assisted (the whole path) or pro
  const [aim, setAimState] = useState<Mode>(() => {
    try {
      return localStorage.getItem("gnogolf.aim") === "assisted" ? "assisted" : "pro"; // Pro unless the player chose Assisted
    } catch {
      return "pro";
    }
  });
  // graphics, kept in this browser: auto (by the device), high or low
  const [gfx, setGfxState] = useState<Gfx>(() => {
    try {
      const v = localStorage.getItem("gnogolf.gfx");
      return v === "high" || v === "low" ? v : "auto";
    } catch {
      return "auto";
    }
  });
  const setGfx = (m: Gfx) => {
    try { localStorage.setItem("gnogolf.gfx", m); } catch {}
    setGfxState(m);
    game.current && game.current.setGfx(m);
  };
  const [askAim, setAskAim] = useState<Mode | null>(null); // a mode waiting for the player's yes (a round under way)
  const setAim = (m: Mode, sure = false) => {
    if (m === aim) return;
    // a round under way restarts in the new mode: asked once, in the game's own dialog
    if (!sure && s && s.shots && s.shots.length && !s.holed) return setMenu(false), setAskAim(m);
    setAskAim(null);
    try { localStorage.setItem("gnogolf.aim", m); } catch {}
    setAimState(m);
    game.current && game.current.setMode && game.current.setMode(m);
  };
  const [chainName, setChainName] = useState("");
  // the curtain between holes: shut on the way out, open once the next is built
  const [curtain, setCurtain] = useState<{ n: string; name: string; id: string; open?: boolean } | null>(null);
  // the page's own timers (the curtain's wait, the demo's, the ?won and ?shot
  // ones): cleared when it goes
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = (f: () => void, ms: number) => {
    const t = setTimeout(() => (timers.current.delete(t), f()), ms);
    timers.current.add(t);
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const goTo = (id: string) => {
    if (!s) return;
    const i = s.holes.findIndex((h) => h.id === id);
    setCurtain({ n: holeNumber(s.holes, id), name: s.holes[i] ? s.holes[i].name : "", id });
    later(() => void (game.current && game.current.load(id)), 380);
  };
  const goToRef = useRef(goTo);
  useEffect(() => { goToRef.current = goTo; });
  const [card, setCard] = useState(() => loadCard());
  const [onChainCard, setOnChainCard] = useState(() => loadOnChain()); // the card's scores that a save put on the chain
  const [cardOpen, setCardOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => feel());
  const toggle = (k: keyof Feel) => { setFeel(k, !prefs[k]); setPrefs(feel()); };
  const [wipe, setWipe] = useState(false); // "clear my scores" asks twice
  // a new game: the card and its badges gone (the gnomes earned stay)
  const newGame = () => (setCard(clearCard()), forgetBadges(), setFreshBadges([]));

  // The tab says what the gnome is up to: a glance at it tells how the shot
  // went, and a tab left behind calls you back.
  // (it follows only what it shows: a power-bar step does not restart it)
  const tHas = !!s, tN = s ? holeNumber(s.holes, s.id) : "", tName = s ? s.name : "";
  const tHoled = !!(s && s.holed), tFlying = !!(s && s.flying), tAiming = !!(s && s.aiming), tStrokes = s ? s.strokes : 0;
  useEffect(() => {
    const name = "Gnogolf";
    const set = () => {
      if (document.hidden && tHas && playing) return (document.title = `The gnome is waiting… · ${name}`);
      if (!tHas || !playing) return (document.title = `${name} · mini-golf on-chain`);
      const n = tN;
      if (tHoled) return (document.title = tStrokes === 1 ? `Hole in one! · ${name}` : `In the cup in ${tStrokes} · ${name}`);
      if (tFlying) return (document.title = `Rolling… · Hole ${n} · ${name}`);
      if (tAiming) return (document.title = `Lining it up… · Hole ${n} · ${name}`);
      document.title = `Hole ${n} · ${tName} · ${name}`;
    };
    set();
    document.addEventListener("visibilitychange", set);
    // while the shot rolls, a ball rolls along the tab title, round and
    // round, until it stops
    let roll: ReturnType<typeof setInterval> | undefined;
    if (tHas && playing && tFlying && !tHoled) {
      const n = tN, W = 12;
      roll = setInterval(() => {
        const at = rolling.k++ % W;
        document.title = `${"·".repeat(at)}●${"·".repeat(W - 1 - at)} Hole ${n} · ${name}`;
      }, 140);
    }
    return () => {
      clearInterval(roll);
      document.removeEventListener("visibilitychange", set);
    };
  }, [tHas, tN, tName, tHoled, tFlying, tAiming, tStrokes, playing]);
  const holedRef = useRef<(id: string, strokes: number) => void>(() => {});
  const [fresh, setFresh] = useState<Skin[]>([]); // gnomes just unlocked, for the banner
  // badges just earned by this round (its finish, then its save), rarest first, and the badges' sheet
  const [freshBadges, setFreshBadges] = useState<string[]>([]);
  const [badgesOpen, setBadgesOpen] = useState(false);
  // (hole: where they were earned, stamped there on the cup card)
  const award = (ids: readonly string[], hole: string | null | undefined) => {
    const got = ids.filter((id) => !badgesEarned().includes(id));
    if (!got.length) return;
    rememberBadges(got, hole || "");
    setFreshBadges((b) => byRarity([...b, ...got]));
  };
  // the hole that finished its cup (or beat the cup's best): the win card
  // leads on to the cup's victory screen (open)
  const [cupWon, setCupWon] = useState<{ cup: Cup; id: string; best: boolean; open?: boolean } | null>(null);
  const holesList = (s && s.holes) || NONE;
  const tot = useMemo(() => totals(card, holesList), [card, holesList]);
  const allList = (s && s.allHoles) || NONE;
  const cups = useMemo(() => cupTotals(card, allList), [card, allList]);
  // this hole's score on the card (the round before), said by the strokes while playing it
  const hereRow = s && allList.find((h) => h.id === s.id);
  const last = s && !s.holed && hereRow ? scoreOf(card, hereRow) : undefined;
  // once earned, a gnome stays earned: a hole registered later must not take
  // it back, and the hole list not being loaded yet must not either
  const had = earned(); // read once a render, not once a gnome
  const unlocked = (id: string) => {
    const gn = GNOMES.find((x) => x.id === id);
    if (!gn || !gn.unlock) return true;
    if (had.includes(id)) return true;
    return !!(allList.length && UNLOCKS[gn.unlock].ok(cups));
  };
  // once earned, remembered — outside render, so a render never writes storage
  useEffect(() => {
    if (!allList.length) return;
    for (const gn of GNOMES) if (gn.unlock && UNLOCKS[gn.unlock].ok(cups)) remember(gn.id);
  }, [allList, cups]);

  // playing for real: who is connected, and where the current round's record is
  const [real, setReal] = useState(false); // the explainer is open
  const [account, setAccount] = useState<Account | null>(null);
  const [wallet, setWallet] = useState<{ busy: boolean; error: string | null; note?: string }>({ busy: false, error: null });
  const [record, setRecord] = useState<Rec>(null);
  const onChain = record?.at === "saved"; // this round is on the chain
  const stale = record?.at === "refused" && record.stale; // its weather is over: no save any more
  // the save window runs out on the clock, not at the next click: the button goes with it
  const [over, setOver] = useState(false);
  const period = s ? s.period : null;
  useEffect(() => {
    setOver(false);
    const g = game.current;
    if (period == null || !g) return;
    let live = true, t: ReturnType<typeof setTimeout> | undefined;
    // the chain's clock decides, not this browser's: when the time looks up, the
    // last block's time is read again first. A chain running late (or a clock
    // set wrong here) keeps the save open for as long as the chain would take it.
    // a chain that cannot be read is asked again every 10 s, not every second
    const arm = (floor = 1000) =>
      (t = setTimeout(
        () =>
          void g.chain.sync().then(
            () => live && (g.chain.now() >= saveBy(period) ? setOver(true) : arm()),
            () => live && arm(10000),
          ),
        Math.max(floor, saveBy(period) - g.chain.now()),
      ));
    arm();
    return () => ((live = false), clearTimeout(t));
  }, [period]);
  const closed = stale || over; // no save possible any more
  const canSave = !onChain && !closed; // the card's one action while it lasts
  // the place a finished hole would take on its board, shown on the save button
  const nudge = useRankNudge(s, game.current && game.current.chain, account && account.address, (s && s.roundMode) || aim, onChain, closed);
  // a name just taken in the game, said until the next hole
  const [namedAs, setNamedAs] = useState("");
  const holeNow = s && s.id;
  useEffect(() => setNamedAs(""), [holeNow]);
  // the name typed for the save (the win card's or the sheet's: the same one),
  // started from the gnome's, for its own hole's round
  const [nameStem, setNameStem] = useState(() => suggestName(gnome));
  useEffect(() => setNameStem(suggestName(gnome)), [holeNow, gnome]);
  // a save under way, one per card (the win card's, the waiting round's): a second click starts no second one
  const savingWin = useRef(false), savingKept = useRef(false);
  // the last won round not on the chain yet (PENDING): offered again on a card of its own once the
  // win card is gone, on any screen and after a reload, until saved, forgotten or too late;
  // pendingRec: how its save goes, for that round only (round: its key)
  const [pending, setPending] = useState<SaveOf | null>(null);
  const [pendingRec, setPendingRec] = useState<{ round: string; rec: Rec } | null>(null);
  const pendingNow = useRef<SaveOf | null>(null);
  pendingNow.current = pending;
  const keepPending = (r: SaveOf | null) => {
    setPending(r);
    try { if (r) sessionStorage.setItem(PENDING, JSON.stringify(r)); else sessionStorage.removeItem(PENDING); } catch {}
  };
  const chainUp = !!(s || game.current);
  useEffect(() => {
    // read once the chain is here: only a round in the shape a save sends, and not over
    const c = game.current && game.current.chain;
    if (!c) return;
    let raw: unknown = null;
    try { raw = JSON.parse(sessionStorage.getItem(PENDING) || "null"); } catch {}
    const kept = pendingOf(raw);
    if (!kept) return void (raw && keepPending(null));
    void c.sync().catch(() => {}).then(() => (kept.period == null || c.now() < saveBy(kept.period) ? setPending(kept) : keepPending(null)));
  }, [chainUp]);
  // a round won and not on the chain yet is the one kept; saved or too late, it goes
  useEffect(() => {
    if (!s || !s.holed || !s.id) return;
    const r = saveOf({ ...s, id: s.id });
    if (onChain || closed) return void (pendingNow.current && roundOf(pendingNow.current) === roundOf(r) && keepPending(null));
    keepPending(r);
    // (on these moments only: the round is s as the hole is won, not each of its frames)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holedNow, onChain, closed]);
  // the shot's clip once made (ShareClip), for the share buttons to send
  const [clip, setClip] = useState<Clip | null>(null);
  // and the place the round took, once saved
  const savedPlace = useSavedPlace(s, game.current && game.current.chain, account && account.address, (s && s.roundMode) || aim, onChain);

  const play = (direct = false) => {
    setScreen("play");
    if (!game.current) return;
    game.current.play(direct);
    // after the overview has had its moment and the camera is on the gnome
    if (cfg && cfg.demo) later(() => void (game.current && game.current.demo(cfg.demo.split(";"))), 2600);
  };
  const choose = (id: string) => {
    setGnome(id);
    // a locked one is only being looked at: it is not saved and not played
    if (!unlockedRef.current(id)) return;
    try { localStorage.setItem("gnogolf.gnome", id); } catch {}
    game.current && game.current.setGnome(id);
  };
  const unlockedRef = useRef<(id: string) => boolean>(() => true);
  /** The gnome really chosen (the one the game plays), whatever the picker shows. */
  const chosenGnome = () => {
    let id: string | null = null;
    try { id = localStorage.getItem("gnogolf.gnome"); } catch {}
    return id && unlocked(id) ? id : "classic";
  };

  useEffect(() => {
    if (!cfg || !canvas.current) return;
    const el = canvas.current;
    // a dev remount destroys this game while it is still starting: it must
    // not then drive the live one
    let cancelled = false, g: Game | null = null;
    const make = (promo?: GameOptions["promo"], probes?: GameOptions["probes"]) => {
      try {
        g = createGame(el, {
        rpc: cfg.rpc, web: cfg.web, gnome, world: cfg.world, weather: cfg.weather, aimMode: aim, camMode: savedCam(), gfx, promo, probes, log: logs,
        // the hot fields to their store; the rest re-renders only when it changed
        // (compared here, not in a setS updater: an updater that returns the
        // same state still re-renders the whole page, 60 times a second in a pull)
        onChange: (snap: Snapshot) => {
          hot.current!.set(snap);
          if (!cold.current || !sameCold(cold.current, snap)) setS((cold.current = snap));
        },
        onHoled: ({ id, strokes }: { id: string; strokes: number }) => holedRef.current(id, strokes),
        });
      } catch (err) {
        // no WebGL here (hardware acceleration off, a blocklisted GPU, Lockdown Mode)
        console.error(err);
        setFatal({ msg: messageOf(err), kind: "webgl" });
        return;
      }
      const game_ = (game.current = g);
      // ?camlog: the game within reach of the camera probe (a test hook)
      if (logs) window.__g = game_;

      game_.start(cfg.hole || (cfg.cup ? { cup: cfg.cup, n: cfg.place } : null))
        .then(() => {
          if (cancelled) return;
          if (cfg.play) play();
          else if (cfg.hole || cfg.cup) {
            // a shared link: straight to that hole (a first-time player picks a
            // gnome first); a link to nothing lands on the cups, quietly
            if (!game_.linked()) setScreen("worlds");
            // straight onto the ball: the link said where (a dare stops at the picker: who, what to beat, Play solo)
            else if ((cfg.gnome || hadGnome()) && !dare) play(true);
            else setScreen("pick");
          }
          // ?won=N shows the win card for N strokes — dev screenshots only
          if (DEV && cfg.won) later(() => game_.fakeWin?.(cfg.won), 400);
          // ?shot=angle,power fires one on load — for screenshots and smoke tests
          if (cfg.shot) {
            const [a, p] = cfg.shot.split(",").map(Number);
            later(() => void game_.shoot(a, p), 300);
          }
        })
        .catch((err: unknown) => !cancelled && setFatal({ msg: messageOf(err), kind: fatalKind(err) }));
    };
    // The trailer's rig (?promo, which patches the page's clock: loaded before
    // the game's first frame) and the test hooks (?camlog, a dev ?won) are
    // modules of their own, fetched only for a page that asks for them.
    const logs = camlog();
    const wantPromo = /[?&]promo/.test(window.location.search) && (DEV || logs), wantProbes = logs || cfg.won > 0;
    // on the title, the hole behind it is built in the first idle moment (1.2 s
    // at most): built at once with the title's own scene, a phone's first
    // frames stall on both
    let unidle = () => {};
    if (!wantPromo && !wantProbes) {
      if (screen !== "title" || typeof requestIdleCallback === "undefined") make();
      else {
        const id = requestIdleCallback(() => !cancelled && make(), { timeout: 1200 });
        unidle = () => cancelIdleCallback(id);
      }
    } else
      void Promise.all([wantPromo ? import("@/lib/promo").then((m) => m.promo) : undefined, wantProbes ? import("@/lib/engine/probes").then((m) => m.probes) : undefined])
        .then(([promo, probes]) => !cancelled && make(promo, probes))
        .catch((err: unknown) => !cancelled && setFatal({ msg: messageOf(err), kind: fatalKind(err) }));

    return () => {
      cancelled = true;
      unidle();
      if (!g) return;
      g.destroy();
      if (window.__g === g) delete window.__g;
    };
    // the game is made once per config (and per retry); gnome and play are read at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg, boot]);

  // The WebGL context can be taken away (a phone backgrounding the tab, the
  // GPU reset): say so, rebuild the hole when it comes back, and offer a
  // reload if it does not within 3 s.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const lost = (e: Event) => {
      e.preventDefault(); // tells the browser a restore is wanted
      setGl("lost");
      t = setTimeout(() => setGl((v) => (v === "lost" ? "gone" : v)), 3000);
    };
    const back = () => {
      clearTimeout(t);
      setGl(null);
      const g = game.current;
      const id = g && g.current();
      if (g && id) void g.load(id);
    };
    el.addEventListener("webglcontextlost", lost);
    el.addEventListener("webglcontextrestored", back);
    return () => (clearTimeout(t), el.removeEventListener("webglcontextlost", lost), el.removeEventListener("webglcontextrestored", back));
  }, [cfg]);

  // a new hole, or a restart, is a new round: nothing of it is recorded yet,
  // and an answer for the previous round must not land on it
  const roundKey = useRef("");
  useEffect(() => {
    roundKey.current = s && s.id ? roundOf({ ...s, id: s.id }) : "";
  });
  useEffect(() => setRecord(null), [holeId, fresh0]);
  // a round begun (a new hole, Play again): what the round before earned goes,
  // its cup complete and its badges (not on its first stroke: the hole may be
  // won, and earn them, before that stroke's snapshot lands)
  useEffect(() => {
    if (fresh0) (setCupWon(null), setFreshBadges([]));
  }, [holeId, fresh0]);

  useEffect(() => {
    let live = true;
    if (holeId && game.current && !chainName) void within(game.current.chain.chainId()).then((n) => live && setChainName(n)).catch(() => {});
    return () => void (live = false);
  }, [holeId, chainName]);

  // a dare in the link (by: the sharer), or a player picked on a board: their
  // best on each hole played, read on the chain with its round, raced as a
  // ghost (ADR-004), said as the hole opens; they join the friends. Play solo
  // drops it for the page.
  const [dare, setDare] = useState(() => {
    const by = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("by") : null;
    return by && isAddress(by) ? by : "";
  });
  const [solo, setSolo] = useState(false);
  const [dareNote, setDareNote] = useState(dare ? "Reading the dare…" : "");
  const [dareHole, setDareHole] = useState(""); // the link's own hole, where the dare is said
  // the rival: their name, and their bests in both modes on each hole read so far
  const [rival, setRival] = useState<{ name: string; holes: Readonly<Record<string, Record<Mode, Ghost | null>>> } | null>(null);
  const readFor = useRef(new Set<string>()); // the holes asked (once each)
  const me = account && account.address;
  useEffect(() => {
    const c = game.current && game.current.chain;
    if (!dare || solo || !c || !holeId || !holeReady || readFor.current.has(holeId)) return;
    const first = !readFor.current.size;
    readFor.current.add(holeId);
    if (first) (setDareHole(holeId), dare !== me && addFriend(dare)); // (a player opening their own link is not their own friend)
    // (a ghost unread is no duel: the dare is still said)
    void Promise.all([c.ghost(holeId, "assisted", dare).catch(() => null), c.ghost(holeId, "pro", dare).catch(() => null), nameOnce(c, dare)])
      .then(([a, p, n]) => {
        const name = n || shortAddr(dare), has = !!(a || p), whose = dare === me ? "your own" : `${name}'s`;
        setRival((r) => ({ name, holes: { ...(r ? r.holes : {}), [holeId]: { assisted: a, pro: p } } }));
        // the link's hole: said on the picker (a link opens there) and as the hole opens; a later hole: only when there is a ghost
        if (first) setDareNote(has ? "" : `${name} dares you, with no ghost here yet: set the score to beat.`);
        if (has) setLinkNote(first ? `Race ${whose} ghost: your turn first.` : `${name} has a ghost here too: race it.`);
        else if (first) setLinkNote(`${name} dares you on this hole.`);
      })
      .catch(() => {});
  }, [dare, solo, holeId, holeReady, me]);
  // the rival's bests on the course's holes, read once a rival is picked: their ghosts' screen lists them
  // (null: the read failed, and no earlier one of theirs is kept)
  const [rivalOn, setRivalOn] = useState<{ by: string; bests: ReadonlyMap<string, Readonly<Record<Mode, number>>> | null } | null>(null);
  useEffect(() => {
    const c = game.current && game.current.chain, ids = allList.filter((h) => h.official).map((h) => h.id);
    if (!dare || solo || !c || !ids.length) return;
    let live = true;
    void c.bestsOf(ids, dare).then(
      (bests) => live && setRivalOn({ by: dare, bests }),
      () => live && setRivalOn((r) => (r && r.by === dare ? r : { by: dare, bests: null })),
    );
    return () => void (live = false);
  }, [dare, solo, allList, holeReady]);
  const rivalBests = dare && !solo && rivalOn && rivalOn.by === dare ? rivalOn.bests : undefined;
  // a duel is played only where their ghost is: the holes without one are not offered
  const duelOn = rivalBests || null;
  const duelHole = duelOn ? (h: { id: string }) => duelOn.has(h.id) : undefined;
  // the cups' place in a duel: their ghosts' holes
  const cupsScreen: Screen = dare && !solo ? "ghosts" : "worlds";
  const rivalName = (rival && rival.name) || shortAddr(dare);
  // the duel on this hole: the rival's best in the round's aim mode, else their other one
  const duelMode = (s && s.roundMode) || aim;
  const duel: Duel | null = useMemo(() => {
    const ghosts = rival && holeId ? rival.holes[holeId] : null, g = ghosts ? pickGhost(duelMode, ghosts) : null;
    return g && rival ? { ghost: g, name: rival.name, self: dare === me } : null;
  }, [rival, holeId, duelMode, dare, me]);
  // (keyed on the ghost, not the duel: an account connecting mid-round must not start it again)
  const raced = duel ? duel.ghost : null;
  useEffect(() => game.current?.race(raced), [raced]);
  // the duel this round races (one armed mid-round starts with the next: the engine says when)
  const racing = duel && s && s.rival != null ? duel : null;
  // the weather the ghost was played in (read once a duel is armed), said when it was not today's
  const [ghostSky, setGhostSky] = useState<{ ghost: Ghost; kind: string } | null>(null);
  useEffect(() => {
    const c = game.current && game.current.chain;
    let live = true;
    if (raced && c) void c.weather(raced.hole, raced.period).then((w) => live && setGhostSky({ ghost: raced, kind: w.kind || "" }), () => {});
    return () => void (live = false);
  }, [raced]);
  const sky: Sky = duel && s && ghostSky && ghostSky.ghost === duel.ghost ? { theirs: ghostSky.kind, mine: s.kind } : null;
  // out of reach: the rival's holing stroke shown, and the player past it (or at it, the ball at rest out of the cup),
  // then for the rest of the round; said, and the rematch pushed, while the round goes on
  const lostNow = !!(racing && s && s.rivalIn && (s.strokes > racing.ghost.strokes || (s.strokes === racing.ghost.strokes && !s.flying && !s.done)));
  const [lostKept, setLostKept] = useState(false);
  const roundStrokes = s ? s.strokes : 0;
  useEffect(() => {
    if (lostNow) setLostKept(true);
    else if (!roundStrokes) setLostKept(false); // a new round
  }, [lostNow, roundStrokes]);
  const theyWon = !!racing && (lostNow || lostKept);
  const duelLost = theyWon && !!s && !s.done;
  const lostNote = duel ? (duel.ghost.strokes === 1 ? "Missed the ace. Rematch?" : `${duel.self ? "Your best" : duel.name} holed it in ${duel.ghost.strokes}. Finish for your score, or rematch.`) : "";
  useEffect(() => {
    setLinkNote((n) => (duelLost ? lostNote : n === lostNote ? null : n)); // (gone with the rematch)
  }, [duelLost]); // eslint-disable-line react-hooks/exhaustive-deps -- as it turns
  // a rival picked (a board's Race, the game's choice): their ghost read afresh on each hole
  const pickRival = (player: string) => {
    if (player === dare && !solo) return; // (already the rival)
    readFor.current.clear();
    setRival(null);
    setSolo(false);
    setDareHole("");
    setDare(player);
  };
  // a Race (a board's, the rival screen's): from the tee, a round under way starts again
  const raceWith = (player: string) => (setBoard(false), game.current?.reset(), pickRival(player));
  const dropDuel = () => {
    setSolo(true);
    setRival(null);
    setDareNote("");
    setLinkNote("Solo now. Your strokes still count.");
    // (its link goes with it: the keyboard's focus to the picker's button)
    requestAnimationFrame(() => document.querySelector<HTMLElement>(".screen--pick .btn--play")?.focus());
  };

  // an "add me as a friend" link: the address joins this browser's friends
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("friend");
    if (f && isAddress(f)) {
      addFriend(f);
      const p = new URLSearchParams(window.location.search);
      p.delete("friend");
      window.history.replaceState(window.history.state, "", window.location.pathname + (String(p) ? `?${p}` : ""));
    }
  }, []);

  // a player Adena already knows is shown as such from the start, and follows
  // the account picked in Adena
  useEffect(() => {
    // unless the player disconnected this page: that holds until they connect again
    const off = () => { try { return localStorage.getItem("gnogolf.adenaOff") === "1"; } catch { return false; } };
    if (!off()) void current().then((a) => a && setAccount(a));
    return onWalletChange(() => void (!off() && current().then(setAccount)));
  }, []);

  // Adena has no revoke from a page: disconnecting forgets the account here,
  // and the page stops picking it up again on its own
  function disconnectWallet() {
    try { localStorage.setItem("gnogolf.adenaOff", "1"); } catch {}
    setAccount(null);
    setRecord(null);
    setFunds(null);
    setWallet({ busy: false, error: null, note: "Disconnected from this page." });
  }

  async function connectWallet() {
    try { localStorage.removeItem("gnogolf.adenaOff"); } catch {}
    setWallet({ busy: true, error: null });
    try {
      const chain = game.current!.chain;
      setAccount(await connect({ chainId: await within(chain.chainId()), rpc: chain.rpc }));
      setWallet({ busy: false, error: null });
    } catch (err) {
      setWallet({ busy: false, error: messageOf(err) });
    }
  }

  // the chain's gas price, read once an account is here: the label and the
  // transaction price the round the same way
  // read before the click, so the click opens Adena at once (a browser may
  // block a wallet window opened after long waits); each read gives up at 4 s
  const [gasPrice, setGasPrice] = useState(0.001);
  const [funds, setFunds] = useState<number | null>(null);
  const [chainId, setChainId] = useState<string | null>(null);
  const [ourNode, setOurNode] = useState<boolean | null>(null); // is Adena's active network this node?
  const [slowSign, setSlowSign] = useState(false); // Adena open for more than 10 s
  const [bytePrice, setBytePrice] = useState(100); // ugnot per stored byte (vm params)
  const [saved, setSaved] = useState<boolean | null>(null); // whether this player already has a best on this hole, in this round's mode (null: unknown)
  const [ghostHere, setGhostHere] = useState(false); // a best of theirs here in either mode: their link dares (a friend races either)
  // the player's saved holes on the course, per mode (Rank() "holes"; null: not read)
  const [onCourse, setOnCourse] = useState<{ assisted: number; pro: number } | null>(null);
  // the round on offer: the won one while it can be saved, else the one kept through a reload
  const winning = !!(s && s.holed && s.id && canSave);
  const toSave: SaveOf | null = winning && s && s.id ? { ...s, id: s.id } : pending;
  const saveId = toSave ? toSave.id : "";
  const saveMode = toSave && toSave.roundMode === "pro" ? "pro" : "assisted";
  useEffect(() => {
    setSaved(null);
    setGhostHere(false);
    setOnCourse(null);
    if (!account || !saveId || !game.current) return;
    let live = true;
    const c = game.current.chain;
    void Promise.all([within(c.bests(saveId, "assisted", [account.address])), within(c.bests(saveId, "pro", [account.address]))])
      .then(([a, p]) => live && (setSaved((saveMode === "pro" ? p : a).rows.length > 0), setGhostHere(a.rows.length + p.rows.length > 0)))
      .catch(() => {});
    void Promise.all([within(c.rank("assisted", account.address)), within(c.rank("pro", account.address))])
      .then(([a, p]) => live && setOnCourse({ assisted: a.holes, pro: p.holes }))
      .catch(() => {});
    return () => void (live = false);
  }, [account, saveId, saveMode, holedNow]);
  const waiting = record?.at === "signing" && record.of === undefined; // Adena open, the round in one transaction
  // a name goes with the save of a player without one (on a hole that ranks):
  // typed, then asked of the chain; the save waits for a name it would take
  const askName = !!(account && toSave && (winning ? nudge.noName : nudge.isNamed === false));
  const nameCheck = useNameCheck(askName && game.current ? game.current.chain : null, nameStem);
  const typed = { check: nameCheck, set: setNameStem };
  const saveName = askName && nameStem && nameCheck.ready ? nameCheck.name : null;
  const nameReady = !askName || nameCheck.ready;
  // what saving it costs, the name included, and what the account lacks for it
  const saveGas = toSave ? gasOf(toSave) + (saveName ? NAME_GAS : 0) : 0;
  // no finish yet anywhere on the course in this mode: a dearer first save;
  // a name's Claim seats every best of the player's, this one's included
  const firstOnCourse = !!onCourse && onCourse[saveMode] === 0;
  const bests = onCourse ? { ...onCourse, [saveMode]: onCourse[saveMode] + (saved === true ? 0 : 1) } : { assisted: 0, pro: 0, [saveMode]: 1 };
  const saveDeposit = depositOf(saved, bytePrice, firstOnCourse, toSave ? toSave.strokes : 0) + (saveName ? nameBytes([bests.assisted, bests.pro]) * bytePrice : 0);
  const costNow = toSave ? costLine(saveGas, gasPrice, saved, saveDeposit, chainName !== MAINNET) : null;
  const lackNow = toSave && account && funds != null ? shortOf(saveGas, gasPrice, saveDeposit, funds) : null;
  useEffect(() => {
    if (!waiting) return setSlowSign(false);
    const t = setTimeout(() => setSlowSign(true), 10000);
    return () => clearTimeout(t);
  }, [waiting]);
  useEffect(() => {
    if (!account || !game.current) return;
    // what lands after the account changed (or the page went) is dropped
    let live = true;
    const land = <T,>(f: (v: T) => void) => (v: T) => live && f(v);
    const c = game.current.chain;
    void within(c.gasPrice()).then(land(setGasPrice)).catch(() => {});
    void within(c.chainId()).then(land(setChainId)).catch(() => {});
    void within(c.balance(account.address)).then(land(setFunds)).catch(() => live && setFunds(null));
    void onOurNode(c.rpc).then(land(setOurNode));
    void within(c.storagePrice()).then(land(setBytePrice)).catch(() => {});
    // re-read when a hole is won: the card is about to offer the record
    // and on coming back to the tab (from the faucet, most likely)
    const back = () => document.visibilityState === "visible" && void within(c.balance(account.address)).then(land(setFunds)).catch(() => {});
    document.addEventListener("visibilitychange", back);
    return () => ((live = false), document.removeEventListener("visibilitychange", back));
  }, [account, holedNow]);
  // a hole won: the chain's clock read again (at most once a minute), for the
  // save's countdown, and the gas price for the gnokey fallback (no Adena)
  useEffect(() => {
    if (!holedNow || !game.current) return;
    const c = game.current.chain;
    c.sync().catch(() => {});
    void within(c.gasPrice()).then(setGasPrice).catch(() => {});
  }, [holedNow]);

  // a gnome just unlocked, met on the picker's stage (the cup's card, if open, goes)
  const meet = (id: string) => (setCupWon(null), choose(id), setScreen("pick"));
  // a hole picked (a community one, a ghost's): on to the gnome
  const openHole = (id: string) => {
    if (game.current) void game.current.load(id);
    setScreen("pick");
  };
  // into a cup: from its first hole (engine setWorld), then the gnome, the last one played already picked
  const enterCup = (w: string) => {
    // a duel: the cup's first hole with their ghost (the one on screen when it has one)
    const first = duelHole && !(holeId && duelHole({ id: holeId }) && s && s.world === w) && allList.find((h) => cupOf(h) === w && duelHole(h));
    if (game.current) void (first ? game.current.load(first.id) : game.current.setWorld(w));
    setScreen("pick");
  };

  // the checklist first while a step is missing (no wallet, too few GNOT), which
  // saves from there: a name is only ever sent from a form in view
  const stepMissing = !account || (lackNow != null && lackNow > 0);
  // the waiting round's card has no name field: the checklist has it
  const savePending = () => {
    if (!pending) return;
    if (stepMissing || nudge.isNamed === false) return setReal(true);
    keptSave();
  };
  const keptSave = () => {
    const r = pending;
    if (!r) return;
    const round = roundOf(r);
    // (its state is its own round's; forgotten or replaced, no later part goes)
    void saveRound(r, (rec) => setPendingRec({ round, rec }), () => !!pendingNow.current && roundOf(pendingNow.current) === round, savingKept, saveName);
  };

  // the round the win card offers to save
  async function recordIt() {
    if (stepMissing) return setReal(true);
    if (!s || !game.current || !s.id) return;
    const r = { ...s, id: s.id }, round = roundOf(r);
    await saveRound(r, (rec) => roundKey.current === round && setRecord(rec), () => roundKey.current === round, savingWin, saveName);
  }

  /**
   * Puts a finished round on the chain: in as many commits as the chain cuts
   * it into, each signed in Adena, then read back. land says how it goes;
   * alive: the player is still on it (a later commit is not sent otherwise);
   * lock: that card's save under way; name: taken in the first signature.
   */
  async function saveRound(r: SaveOf, land: (rec: Rec) => void, alive: () => boolean, lock: { current: boolean }, name: string | null) {
    if (!account || !game.current) return;
    // busy before anything is awaited: a second click must not start a second save
    if (lock.current) return;
    lock.current = true;
    land({ at: "signing" });
    try {
      // a round whose weather is over can no longer be saved: the chain would refuse it
      // (its clock read again first: the chain's time decides, not this browser's)
      await game.current.chain.sync().catch(() => {});
      if (r.period != null && game.current.chain.now() >= saveBy(r.period)) return land({ at: "refused", error: "Too late to save: the weather changed. Play the hole again to save it.", stale: true });
      const chain = game.current.chain, hole = r.id;
      const id = chainId || (await within(chain.chainId()));
      // asked before Adena opens: how many transactions the round needs, or
      // why the chain would refuse it
      // every commit asked of the chain: the first from the tee, the next
      // from where the one before leaves the ball
      const period = r.period != null ? r.period : await within(chain.period());
      const parts = await chainSplit(chain, r, period);
      // the name typed on the card goes in the first signature, before the round
      const named = name ? { registrar: await within(chain.nameReg()), name } : null;
      for (let k = 0; k < parts.length; k++) {
        const [from, to] = parts[k];
        // the player has left this round (Play again, another hole): no more of it goes to Adena
        if (!alive()) return;
        if (parts.length > 1) land({ at: "signing", part: k + 1, of: parts.length });
        // the chain's round before this commit: a new one there is this commit landing
        const before = JSON.stringify(await chain.round(hole, account.address).catch(() => null));
        const sent = recordRound({
          address: account.address, realm: chain.realm, hole, shots: r.shots.slice(from, to), reset: k === 0,
          gas: gasOf(r, from, to), period: r.period, mode: r.roundMode || "assisted", price: gasPrice, chainId: id, rpc: chain.rpc, named: k === 0 ? named : null,
        }).catch((err: SendError) => {
          if (k > 0) err.message = `Part ${k} of ${parts.length} is on-chain, part ${k + 1} was not sent (${err.message}). Save again to send the whole round.`, (err.cancelled = false);
          throw err;
        });
        // Adena answers only once its window is closed: the chain is watched
        // meanwhile, and a commit it holds counts as sent (Adena's answer, if
        // it comes later, changes nothing)
        let open = true;
        const landed = (async () => {
          for (let w = 0; w < 120 && open; w++) {
            await new Promise((ok) => setTimeout(ok, 1500));
            const got = await chain.round(hole, account.address).catch(() => null);
            if (got && got.strokes >= to && JSON.stringify(got) !== before) return true;
          }
          return false;
        })();
        void sent.catch(() => {}); // raced below; a late refusal after the chain has it is moot
        await Promise.race([sent, landed.then((ok) => (ok ? null : sent))]).finally(() => (open = false));
        // the name is the player's once the first part is in: a retry of the rest must not take it again
        if (k === 0 && named) setNamedAs(named.name), nudge.named();
        // the next part continues the round: it waits until the chain has this one
        if (k + 1 < parts.length) {
          for (let w = 0; w < 10; w++) {
            const got = await chain.round(hole, account.address).catch(() => null);
            if (got && got.strokes >= to) break;
            await new Promise((ok) => setTimeout(ok, 1000));
          }
        }
      }
      void within(chain.balance(account.address)).then(setFunds).catch(() => {});
      // signed is not recorded: read the round back and say what the chain has
      // the block may land a moment after Adena answers: read back for up to 8 s
      let mine: Awaited<ReturnType<Chain["round"]>> = null;
      for (let k = 0; k < 8; k++) {
        mine = await chain.round(hole, account.address).catch(() => null);
        if (mine && mine.done && mine.strokes === r.strokes) break;
        await new Promise((ok) => setTimeout(ok, 1000));
      }
      if (mine && mine.done && mine.strokes === r.strokes) {
        land({ at: "saved" });
        award(["chain"], hole);
        const row = ((s && s.allHoles) || []).find((h) => h.id === hole);
        setOnChainCard(markOnChain(cardKey(row || { id: hole }), r.strokes));
        if (roundKey.current.startsWith(hole + "#")) (setSaved(true), setGhostHere(true)); // (still on that hole: a kept round may be another's)
      } else
        land({
          at: "refused",
          stale: false,
          error: mine
            ? `The chain's replay ended differently (${mine.strokes} strokes, ${mine.done ? "holed" : "not holed"}): this hole moves between shots. Play it again to save.`
            : "The transaction went through, but the chain has no round for you on this hole.",
        });
    } catch (err) {
      land((err as SendError).cancelled ? null : { at: "refused", error: messageOf(err), stale: /weather .* is over|is not the current weather/.test(String((err as SendError).message)) });
    } finally {
      lock.current = false;
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // an open dialog hears Escape first and keeps it (useDialog); with none
      // open, a screen goes back to the one before it
      if (e.key !== "Escape") return;
      setScreen((sc) => (sc === "pick" ? cupsScreen : sc === "ghosts" ? "rival" : sc === "worlds" ? "title" : sc));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cupsScreen]);

  unlockedRef.current = unlocked;
  // the new hole is on screen, built and its shaders ready: open the curtain
  // a hole that would not load or draw: the curtain goes, so its banner (Try again, Pick a hole) is seen
  const errorNow = !!(s && s.error);
  useEffect(() => {
    if (errorNow) setCurtain(null);
  }, [errorNow]);
  useEffect(() => {
    if (!curtain || curtain.open || holeId !== curtain.id || !holeReady) return;
    const t = setTimeout(() => setCurtain((c) => c && { ...c, open: true }), 250);
    return () => clearTimeout(t);
  }, [holeId, holeReady, curtain]);
  // open, it goes once its opening has played (a new one shut meanwhile stays)
  const curtainOpen = !!(curtain && curtain.open);
  useEffect(() => {
    if (!curtainOpen) return;
    const t = setTimeout(() => setCurtain((c) => (c && c.open ? null : c)), 750);
    return () => clearTimeout(t);
  }, [curtainOpen]);

  const holed = s && s.holed;
  // a duel's result, once the hole is won
  const won = racing && s && s.holed ? { ...duelResult(s.strokes, racing, golfTerm(s.strokes, parHere(s))), duel: racing } : null;
  // a duel lost, or tied where it could have been won (not an ace), pushes to the rematch
  const rematch = !!won && (won.result === "loss" || (won.result === "tie" && won.duel.ghost.strokes > 1));
  // a best of the player's on the chain here: their share is a dare (a friend races their ghost)
  const daring = !!account && (onChain || ghostHere);
  const nextAfter = cupWon && s ? nextCup(cupWon.cup, s.worlds) : ""; // the cup after the one just complete
  // the hole the gnome picker leads to (a shared link's, or the cup's first), named over the gnomes
  // the hole a link opened, named over the gnomes (from the cups, the player knows where they go)
  const linked = s && s.linked && s.id && s.name ? `${s.place ? `Hole ${holeNumber(s.holes, s.id)} · ` : ""}${s.name}` : "";
  // The address bar follows the screen: the title is the bare page, the cups
  // ?cup=<world>, the picker adds &gnome=, a hole ?cup=&hole=&gnome=. A new
  // screen is a new history entry (Back returns to the one before); moving
  // within a hole — next hole, another gnome — only rewrites the current one.
  const place = s && s.place, world = s && s.world, idHere = s && s.id;
  const lastScreen = useRef<Screen | null>(null);
  useEffect(() => {
    if (!cfg) return;
    const q = chainQuery();
    if (screen === "play" && idHere) {
      // a cup's hole by its place; one in no cup (community, archived) by its id
      if (place) (q.set("cup", world || "garden"), q.set("hole", String(place)));
      else q.set("hole", idHere);
      q.set("gnome", gnome);
    } else if (screen === "worlds" && world) q.set("cup", world);
    else if (screen === "ghosts") q.set("by", dare); // (an address of its own: a step Back returns from)
    else if (screen === "pick" && world) (q.set("cup", world), q.set("gnome", gnome));
    else if (screen === "play") return; // the hole is not known yet: wait for it
    // a dare stays in the address, with the hole, while it is raced: a reload, a copied link keep it
    if (dare && !solo && idHere && (screen === "play" || screen === "pick")) {
      if (screen === "pick") place ? q.set("hole", String(place)) : (q.delete("cup"), q.set("hole", idHere));
      q.set("by", dare);
    }
    // a hole's own page (/h/…) is left for the game's address once it moves on
    const base = window.location.pathname.startsWith("/h/") ? "/" : window.location.pathname;
    const url = base + (String(q) ? `?${q}` : "");
    const here = window.location.pathname + window.location.search;
    // a link to a hole keeps its address while the title shows (the game on its way to it)
    if (screen === "title" && lastScreen.current === null && (cfg.hole || cfg.cup)) return;
    const moved = lastScreen.current !== null && lastScreen.current !== screen;
    lastScreen.current = screen;
    if (url === here) return;
    if (moved) window.history.pushState({ screen }, "", url);
    else window.history.replaceState({ screen }, "", url);
  }, [cfg, screen, place, world, gnome, idHere, dare, solo]);
  // Back and Forward: back to that screen, and that hole, without reloading the scene
  // (subscribed once: the latest goTo is read through its ref)
  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      const p = new URLSearchParams(window.location.search);
      const st: unknown = e.state; // a history entry's state: this page's own, or anyone's
      const was = st && typeof st === "object" && "screen" in st && isScreen(st.screen) ? st.screen : null;
      const sc: Screen = was || (p.get("hole") ? "play" : p.get("cup") ? "worlds" : "title");
      lastScreen.current = sc; // arriving here is not a new step
      setMenu(false);
      setScreen(sc);
      if (sc === "play" && game.current) {
        const cup = p.get("cup") || "", hv = p.get("hole") || "";
        const h = game.current.find && game.current.find(isHoleId(hv) ? { id: hv } : { cup, n: Number(hv) });
        if (h && h !== (game.current.current && game.current.current())) goToRef.current(h);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // the stroke's weather (the engine's: ?weather= fakes it there, for screenshots)
  const wx = s && s.weather;

  // a finished hole goes on the card the moment the chain holes it — even if
  // the player restarts before the banner — and a gnome may unlock with it
  holedRef.current = (id: string, strokes: number) => {
    const list = (s && s.allHoles) || [];
    const before = cupTotals(loadCard(), list);
    const next = recordScore(cardKey(list.find((h) => h.id === id) || { id }), strokes);
    const after = cupTotals(next, list);
    setCard(next);
    setFresh(GNOMES.filter((gn) => gn.unlock && !UNLOCKS[gn.unlock].ok(before) && UNLOCKS[gn.unlock].ok(after)));
    // the cup complete now and not before, or again in fewer strokes than the card had
    const h = list.find((x) => x.id === id), cup = h && WORLDS.find((w) => w.id === cupOf(h))?.id;
    const b = cup && before[cup], a = cup && after[cup];
    if (cup && b && a && a.all && (!b.all || a.strokes < b.strokes)) setCupWon({ cup, id, best: b.all });
    // a course hole's badges (a community hole's would be too easy to farm)
    setFreshBadges([]);
    if (s && s.official && h) {
      seeWeather(s.kind);
      const duel = racing && { result: duelResult(strokes, racing, "").result, theirs: racing.ghost.strokes, self: racing.self, mixed: racing.ghost.mode !== (s.roundMode || aim) };
      award(badgesFor({ strokes, par: parOf(h), pro: s.roundMode === "pro", kind: s.kind, timed: s.timed, cups: after, weathers: weathersSeen(), duel }, badgesEarned()), id);
    }
  };
  // the chain's own badges: a round on it, and first place on a hole's board
  useEffect(() => {
    if (savedPlace && savedPlace.rank === 1) award(["first"], savedPlace.id);
  }, [savedPlace]);

  return (
    <>
      <div className={`sky sky--${(playing && s && s.time) || "day"} sky--w-${(playing && s && s.look) || "garden"}`} aria-hidden="true">
        <div className="stars" />
        <div className="sun" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className={`cloud cloud--${i}`} />
        ))}
      </div>

      <canvas ref={canvas} id="stage" />
      {/* rain and storm darken and wet the whole scene a little */}
      {playing && wx && (wx.rain || wx.storm) && <div className={"wet" + (wx.storm ? " wet--storm" : "")} aria-hidden="true" />}

      {screen === "title" && <Title loading={!s} world={s ? s.world : undefined} onStart={() => setScreen("modes")} onAbout={() => setAbout(true)} />}
      {screen === "modes" && (
        <Modes gnome={gnome} onBack={() => setScreen("title")} onAbout={() => setAbout(true)}
          onSolo={() => (setSolo(true), setRival(null), setScreen("worlds"))} onDuel={() => setScreen("rival")} />
      )}
      {screen === "rival" && s && (
        <Rival s={s} chain={game.current && game.current.chain} me={account && account.address} mode={aim} onBack={() => setScreen("modes")} onAbout={() => setAbout(true)}
          onPick={(addr) => (sound("select"), raceWith(addr), setScreen("ghosts"))} />
      )}
      {screen === "ghosts" && (
        <Ghosts holes={allList} name={rivalName} bests={rivalBests} card={card} mode={aim} onRace={openHole}
          onCups={() => setScreen("worlds")} onBack={() => setScreen("rival")} onAbout={() => setAbout(true)} />
      )}

      {screen === "worlds" && s && (
        <Worlds
          counts={s.worlds}
          stats={cups}
          onResetAll={newGame}
          onReset={(w) => setCard(clearCup(allList.filter((h) => cupOf(h) === w).map(cardKey)))}
          current={s.world}
          onBack={() => setScreen("modes")}
          onAbout={() => setAbout(true)}
         
          community={s.community}
          racing={dare && !solo && <p className="dare">Racing {rivalName}&apos;s ghost</p>}
          podium={<Podium chain={game.current && game.current.chain} me={account && account.address} mode={aim} onOpen={() => setBoard(true)}
            extra={<button className="linkish" onClick={() => (sound("blip"), setBadgesOpen(true))}>Badges {badgesEarned().length}/{BADGES.length} →</button>} />}
          onCommunity={openHole}
          onPick={enterCup}
        />
      )}
      {screen === "pick" && <Picker world={(s && s.world) || "garden"} hole={linked} dare={duel ? <DuelNote duel={duel} mode={aim} sky={sky} onDrop={dropDuel} /> : !dareHole || dareHole === holeId ? dareNote : ""} aim={aim} onAim={setAim} gnome={gnome} onChange={choose} onPick={play} unlocked={unlocked} chosen={chosenGnome()}
        onPlayAs={(id) => (setGnome(id), play())}
        onAbout={() => setAbout(true)}
       
        onBack={() => {
          sound("blip");
          // leaving on a locked gnome: back to the one really chosen
          if (!unlocked(gnome)) setGnome(chosenGnome());
          setScreen(cupsScreen);
        }} />}

      {s && playing && (
        <>
          <header className="hud hud--top">
            <div className="card card--hole">
              <ModeTag kind={dare && !solo ? "duel" : "solo"} />
              <span className="card__num">
                {holeNumber(s.holes, s.id)}
              </span>
              <div className="card__text">
                <span className="eyebrow">
                  {!s.official ? "Community hole · not ranked" : s.archived || !s.place ? "Archived hole · not in the cup" : <>Hole {s.place} of {s.holes.length}</>}
                </span>
                <h1>{s.name}</h1>
                <a className="src" href={s.source} target="_blank" rel="noopener noreferrer">
                  read its code ↗
                </a>
              </div>
            </div>
            {/* in a duel: both counts, the player's first, and the strokes to beat */}
            <div className="card card--score" aria-live={racing ? "polite" : undefined} aria-atomic={racing ? true : undefined}>
              <span className="eyebrow">{racing ? (racing.self ? "You – best" : "You – them") : "Strokes"}</span>
              <strong>{s.strokes}{racing && <> – {s.rival ?? 0}{s.rivalIn && "✓"}</>}</strong>
              <span className="card__par">{racing ? (theyWon ? (racing.self ? "your best won" : "they won") : toBeat(s.strokes + 1, racing.ghost.strokes)) : <>par {parHere(s)}{last ? ` · last ${last}` : ""}</>}</span>
              {(s.roundMode || s.mode) === "assisted" && <span className="pro-chip" title="Assisted: the full aim line, ranked apart">ASSISTED</span>}
            </div>
            <LiveWeather hot={hot.current} w={wx ?? null} until={s.period != null ? (s.period + 1) * RULES.periodMs - skewOf(game.current && game.current.chain) : null} />
            <div className="hud__right">
              <span className="adena__wrap">
              <button
                className={"adena" + (account ? " adena--on" : "")}
                onClick={() => setReal(true)}
                aria-label={account ? `Saving on-chain as ${account.address}` : "Save on-chain with Adena"}
                // why a wallet, for the one who never opens the sheet: playing is free, keeping is on-chain
                title={account ? undefined : "Playing is free. Adena keeps your score on gno.land: public, replayed by the chain, on the boards."}
              >
                <img className="adena__logo" src="adena.svg" alt="" width="34" height="34" />
                <span className="adena__text">
                  <small>{account ? "Adena · connected" : "Adena"}</small>
                  <b>{account ? shortAddr(account.address, 4, 3) : "Save on-chain"}</b>
                </span>
              </button>
              {account && (
                <button className="adena__off" aria-label="Disconnect Adena" title="Disconnect" onClick={disconnectWallet}>
                  <svg viewBox="0 0 20 20" width="12" height="12" aria-hidden="true"><path d="M5 5 15 15M15 5 5 15" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg>
                </button>
              )}
              </span>
              <button className="burger" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(true)}>
                <span /><span /><span />
              </button>
            </div>
          </header>

          {s.timed && (
            <div className="timed" role="note">
              ↻ This hole changes with every stroke — watch it before you shoot
            </div>
          )}

          {menu && (
            <div className="drawer" onClick={() => setMenu(false)}>
              <Dialog as="aside" onClose={() => setMenu(false)} className="drawer__panel" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
                <div className="drawer__head">
                  {/* the cup being played, and the way to another */}
                  {(() => {
                    // the cup being played; tapping it goes to the cups
                    const cup = worldOf(s.world);
                    const [first, ...rest] = cup.name.split(" ");
                    return (
                      <button className="drawer__cup" aria-label={`${cup.name} — change cup`} onClick={() => { sound("blip"); setMenu(false); setScreen(cupsScreen); }}>
                        <Emblem id={cup.id} />
                        <h2>{first}<br />{rest.join(" ")}</h2>
                      </button>
                    );
                  })()}
                  <div className="drawer__tools">
                    <button className="round round--small round--x" aria-label="About Gnogolf" title="About" onClick={() => { setMenu(false); setAbout(true); }}>
                      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M10 9 V14 M10 6 V6.2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
                    </button>
                    <SheetClose onClose={() => setMenu(false)} inline />
                  </div>
                </div>
                <section className="drawer__me">
                  <div className="me__stats">
                    <div><strong>{tot.done}/{s.holes.length}</strong><span>holes</span></div>
                    <div><strong>{tot.strokes || "–"}</strong><span>strokes</span></div>
                    <div>
                      <strong>{tot.done ? vsPar(tot.strokes - tot.par) : "–"}</strong>
                      <span>vs par</span>
                    </div>
                  </div>
                  {/* the cup's card wide on top, the rest under it */}
                  <div className="me__row">
                    <Button variant="primary" onClick={() => { setMenu(false); setCardOpen(true); }}><svg viewBox="0 0 24 24" aria-hidden="true">{MENU_ICON.card}</svg>Cup overview</Button>
                    <Button variant="secondary" aria-label="Change mode: solo or duel" onClick={() => { setMenu(false); setScreen("modes"); }}><svg viewBox="0 0 24 24" aria-hidden="true">{MENU_ICON.mode}</svg>Mode</Button>
                    <Button variant="secondary" onClick={() => { setMenu(false); setScreen(cupsScreen); }}><svg viewBox="0 0 24 24" aria-hidden="true">{MENU_ICON.cups}</svg>All cups</Button>
                    <Button variant="secondary" aria-label="Change gnome" onClick={() => { setMenu(false); setScreen("pick"); }}><svg viewBox="0 0 24 24" aria-hidden="true">{MENU_ICON.gnome}</svg>Gnome</Button>
                  </div>
                </section>
                <section className="drawer__settings" aria-label="Settings">
                  <span className="eyebrow">Settings</span>
                  <AimSetting aim={aim} onChange={setAim} />
                  <div className="aimset">
                    <span className="aimset__label">Graphics</span>
                    <Segmented label="Graphics" value={gfx} full options={[["auto", "Auto"], ["high", "High"], ["low", "Low"]]} onChange={(m) => (sound("blip"), setGfx(m))} />
                  </div>
                  {([["sound", "Sound"], ["vibe", "Vibration"]] as const).map(([k, label]) => (
                    <Toggle key={k} label={label} checked={prefs[k]} onChange={() => toggle(k)} />
                  ))}
                </section>
                <nav className="drawer__list">
                  {s.holes.map((h) => (
                    <button
                      key={h.id}
                      className="tile"
                      aria-current={h.id === s.id}
                      disabled={!!duelHole && !duelHole(h)} // (a duel: no ghost there)
                      onClick={() => {
                        setMenu(false);
                        goTo(h.id);
                      }}
                    >
                      <span className="tile__num">{holeNumber(s.holes, h.id)}</span>
                      <span className="tile__name">{h.name}</span>
                      <span className="tile__best">
                        {scoreOf(card, h) ? <b>{scoreOf(card, h)}</b> : "–"} / par {parOf(h)}
                      </span>
                    </button>
                  ))}
                </nav>
                {/* last, out of the way: clearing the card */}
                <div className="drawer__settings">
                  <button
                    className={"btn btn--ghost btn--wipe" + (wipe ? " btn--danger" : "")}
                    onClick={() => {
                      if (!wipe) return setWipe(true);
                      newGame();
                      setWipe(false);
                    }}
                    onBlur={() => setWipe(false)}
                  >
                    {wipe ? "Sure? Scores and badges go" : "New game · clear my scores"}
                  </button>
                  <small className="drawer__note">Clears this browser&apos;s scorecard and its badges. Gnomes you earned stay yours, and rounds saved on-chain stay on the leaderboard.</small>
                </div>
              </Dialog>
            </div>
          )}

          {!s.aiming && !s.flying && !holed && s.strokes === 0 && (
            <div className="hint">
              <span className="hint--mouse">Click anywhere and pull back, like a slingshot, or use the arrow keys and Space</span>
              <span className="hint--touch">Touch anywhere and pull back, like a slingshot</span>
            </div>
          )}
          {s.aiming && (
            <div className="aimbar" aria-live="polite">
              <div className="power">
                <AimBar hot={hot.current} />
              </div>
              <small>Let go to shoot · slide back to cancel</small>
            </div>
          )}

          <Button variant="chip" className="lbchip" onClick={() => (sound("blip"), setBoard(true))} aria-label="Leaderboard">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9 17h6" /></svg>
            <span>Leaderboard</span>
          </Button>
          <footer className="hud hud--bottom">
            <Button variant={theyWon ? "primary" : "secondary"} disabled={!s.strokes} onClick={() => game.current?.reset()}>{theyWon ? "Rematch" : "Restart"}</Button>
            <Button
              className="cam-btn"
              aria-label={`Camera: ${CAMS[s.cam] || "Classic"} — click to change`}
              title={`Camera: ${CAMS[s.cam] || "Classic"} — click to change`}
              onClick={() => {
                const next = CAM_ORDER[(CAM_ORDER.indexOf(s.cam || "classic") + 1) % CAM_ORDER.length];
                saveCam(next);
                sound("blip");
                game.current?.setCam(next);
              }}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h3l2-2h6l2 2h3v11H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" /></svg>
              {CAMS[s.cam] || "Classic"} <span aria-hidden="true">▾</span>
            </Button>
          </footer>
        </>
      )}

      {holed && playing && (
        <div className="banner banner--win">
          <Dialog className="banner__in" role="dialog" aria-modal="true" aria-label="Hole finished">
            <span className="eyebrow">In the hole! · {s.name}</span>
            <h2 data-long={won && won.title.length > 16 ? "" : undefined}>{won ? won.title.replaceAll("-", "\u2011") /* a name's hyphens never break a line */ : golfTerm(s.strokes, parHere(s))}</h2>
            {won && <p>{won.line}</p>}
            {/* the score, and beside it the ways to tell people about it */}
            <div className="win__head">
              <div className="win__score">
                <strong>{s.strokes}</strong>
                <span>stroke{s.strokes > 1 ? "s" : ""}</span>
                {savedPlace && (
                  <b className="win__place" title="Your place on this hole's board, on-chain">
                    #{savedPlace.rank}
                    <small>of {savedPlace.of}</small>
                  </b>
                )}
              </div>
            <Share
              // with a round of the sharer's on the chain here, the link dares the friend to beat it;
              // a duel dares them back once saved, and before, passes the rival's own dare on
              link={s ? holeLink(s, gnome, won && !onChain ? won.duel.ghost.player : daring ? account.address : "") : ""}
              label={won ? (!onChain ? "Dare a friend" : won.duel.self ? "Share your ghost" : "Dare them back") : daring ? "Dare a friend" : savedPlace ? `Share your #${savedPlace.rank}` : "Share"}
                snapshot={() => (game.current ? game.current.snapshot(caption(s, won)) : Promise.resolve(null))}
                text={won ? duelShare(won.result, won.duel, s.name, s.strokes, onChain, won.duel.ghost.mode !== (s.roundMode || aim)) : shareText({ s, card, cups, fresh, place: savedPlace, ghost: daring })}
                clip={clip}
              />
            </div>
            {cfg && cfg.clips && <ShareClip make={(run) => (game.current ? game.current.clip(run, caption(s, won)) : Promise.resolve(null))} name={clipName(s.id || "")} onClip={setClip} />}


            {/* where the round is: said by the save clock below while it can still go on-chain */}
            {(onChain || s.period == null) && (
              <p>
                {onChain
                  ? "Saved on-chain: public, on your address, on any device."
                  : s.official
                    ? "Saved in this browser only. Save it on-chain to make it public and ranked."
                    : "Saved in this browser only. A community hole is not ranked, but its rounds can be saved on-chain."}
              </p>
            )}
            {won && <DuelFine duel={won.duel} mode={s.roundMode || aim} sky={sky} />}
            <Standings s={s} card={card} saved={onChainCard} chain={game.current && game.current.chain} me={account && account.address} mode={s.roundMode || aim} compact fresh={freshBadges} onRules={() => setRules(true)} />
            <Unlocked fresh={fresh} onMeet={meet} />
            <NewBadges ids={freshBadges} onOpen={() => setBadgesOpen(true)} />
            <RecordState record={record} account={account} s={s} chain={game.current && game.current.chain} named={namedAs} />
            {(() => {
              // one note at a time, the one in the way first: the node, the funds, then the name
              const chain = game.current && game.current.chain;
              const host = ((chain && chain.rpc) || "").replace(/^https?:\/\//, "");
              const need = (canSave && lackNow) || 0;
              const warn =
                account && (ourNode === false || slowSign) ? (
                  <>
                    {ourNode === false ? "Adena is on another network." : "Adena is still working out the fee."} In Adena, pick the one whose RPC is <b>{host}</b>
                    {chainId ? <> (chain id <b>{chainId}</b>)</> : null}.
                  </>
                ) : need && funds != null ? (
                  <>
                    {funds === 0 ? "Your Adena account has no GNOT here yet." : `You need about ${need.toFixed(2)} more GNOT.`}{" "}
                    {chain && networkOf(chain.rpc) === "local" ? "Fund it from the node's test account." : account && <GetGnot address={account.address} href={chainId === MAINNET ? GNOT_URL : FAUCET} label={`Get ${chainId === MAINNET ? "" : "free test "}GNOT (${chainId}) ↗`} />}
                  </>
                ) : null;
              // (once saved, the saved line says the name too)
              if (!warn && namedAs) return onChain ? null : <p className="note note--good">You are <b>{namedAs}</b> now: save your round to take your place.</p>;
              if (!warn && nudge.noName && account && chain)
                return canSave ? (
                  // while it can be saved, the name goes in the save's own signature
                  <NameForm chain={chain} account={account.address} chainId={chainId} price={gasPrice} onNamed={(n) => (setNamedAs(n), nudge.named())}
                    typed={typed} lead={nudge.at ? `Your name at #${nudge.at} on the board` : "Your name on the board"} />
                ) : (
                  <NameForm chain={chain} account={account.address} chainId={chainId} price={gasPrice} onNamed={(n) => (setNamedAs(n), nudge.named())}
                    lead={onChain ? "Saved! Now put it on the board" : "Get on the board"} />
                );
              return warn && <p className="note note--warn">{warn}</p>;
            })()}
            {!onChain && s.period != null && (
              <SaveClock by={saveBy(s.period)} clock={game.current ? game.current.chain.now : undefined} stale={closed} ranked={!!s.official} again={won ? "Rematch" : undefined} />
            )}
            {/* one solid action at a time: saving while it can, else going on (a duel lost or tied: the rematch) */}
            <div className="banner__row">
              {canSave && !rematch ? (
                <button className="linkish" onClick={() => game.current?.reset()}>{won ? "Rematch" : "Play again"}</button>
              ) : (
                <Button variant={rematch && !canSave ? "primary" : "secondary"} onClick={() => game.current?.reset()}>
                  {won ? "Rematch" : "Play again"}
                </Button>
              )}
              {canSave && (
                <Button variant="secondary" className={"btn--save" + (nudge.at ? " btn--save-rank" : "")} disabled={record?.at === "signing" || !nameReady} onClick={() => void recordIt()}>
                  <svg className="btn__mark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="2.5" y="8" width="11" height="8" rx="4" transform="rotate(-35 8 12)" /><rect x="10.5" y="8" width="11" height="8" rx="4" transform="rotate(-35 16 12)" /></g></svg>
                  {record?.at === "signing" ? (
                    record.of === undefined ? "Waiting for Adena…" : `Adena: part ${record.part} of ${record.of}…`
                  ) : (
                    "Save on-chain"
                  )}
                  {nudge.at > 0 && record?.at !== "signing" && !(!account && isTouch() && !hasAdena()) && (
                    // (a phone with no wallet can't take it: no promise there)
                    <span className="btn__rank">{!account ? `Could be #${nudge.at}` : askName && !saveName ? `#${nudge.at} with a name` : `Take #${nudge.at} on this hole!`}</span>
                  )}
                </Button>
              )}
              {cupWon && cupWon.id === s.id ? (
                <button className={"btn " + (canSave || rematch ? "btn--ghost" : "btn--main")} onClick={() => (sound("select"), setCupWon({ ...cupWon, open: true }))}>
                  Cup complete! →
                </button>
              ) : (
                <button className={"btn " + (canSave || rematch ? "btn--ghost" : "btn--main")} onClick={() => goTo((nextHole(s, card, duelHole) || s.holes[0]).id)}>
                  Next hole →
                </button>
              )}
            </div>
            {canSave && (account || !(isTouch() && !hasAdena())) && (
              <p className="real__fine">
                {/* why save: a link that dares (a phone with no wallet can't: no promise there) */}
                {won ? won.result !== "loss" && !won.duel.self && `Save it to dare ${won.duel.name} back with your own ghost. `
                  : !daring && "Save it and your link becomes a dare: friends race your ghost, free, no wallet. "}
                {account && costNow && `${costNow}. You confirm in Adena.`}
              </p>
            )}
            {!onChain && !closed && <Gnokey s={s} chain={game.current && game.current.chain} price={gasPrice} chainId={chainId || chainName} />}
          </Dialog>
        </div>
      )}

      {cupWon && cupWon.open && s && (
        <Victory
          cup={cupWon.cup}
          best={cupWon.best}
          holes={(s.allHoles || NONE).filter((h) => cupOf(h) === cupWon.cup)}
          card={card}
          saved={onChainCard}
          fresh={fresh}
          snapshot={() => (game.current ? game.current.snapshot({ eyebrow: "Cup", title: worldOf(cupWon.cup).name, score: "complete" }) : Promise.resolve(null))}
          onBack={() => (setCupWon(null), setScreen(cupsScreen))}
          onReplay={() => {
            setCupWon(null);
            const first = s.holes[0];
            if (first) goTo(first.id);
          }}
          next={nextAfter}
          onRules={() => setRules(true)}
          // on to the next cup (after the last, its first hole again), the new gnome picked when there is one
          onNext={(id) => {
            setCupWon(null);
            if (id) choose(id);
            if (nextAfter) return enterCup(nextAfter);
            if (s.holes[0]) goTo(s.holes[0].id);
            setScreen("pick");
          }}
        />
      )}

      {askAim && (
        <Sheet className="confirm" role="alertdialog" label="Switch aim mode" onClose={() => setAskAim(null)}>
          <h2>Switch to {askAim === "pro" ? "Pro" : "Assisted"}?</h2>
          <p>This restarts the hole.</p>
          <div className="banner__row">
            <Button onClick={() => setAskAim(null)}>Cancel</Button>
            <Button variant="primary" onClick={() => setAim(askAim, true)}>Restart in {askAim === "pro" ? "Pro" : "Assisted"}</Button>
          </div>
        </Sheet>
      )}

      {board && s && (
        <Boards mode={aim} s={s} inHole={screen === "play"} onRace={screen === "play" ? raceWith : undefined} chain={game.current && game.current.chain} me={account && account.address} onClose={() => setBoard(false)} goTo={(id) => (setBoard(false), goTo(id))} onConnect={account ? undefined : () => (setBoard(false), setReal(true))} />
      )}

      {cardOpen && s && (
        <Sheet className="cardsheet" label="Scorecard" onClose={() => setCardOpen(false)}>
            <span className="eyebrow">Gnogolf · the cup and its card</span>
            <h2>The cup</h2>
            <Standings s={s} card={card} saved={onChainCard} chain={game.current && game.current.chain} me={account && account.address} mode={aim} onRules={() => setRules(true)}
              fresh={freshBadges} badges={{ onOpen: () => (setCardOpen(false), setBadgesOpen(true)) }} />
            <FullBoard key={aim} kind="course" s={s} chain={game.current && game.current.chain} me={account && account.address} mode={aim} />
        </Sheet>
      )}

      {curtain && (
        <div className={`curtain curtain--${(s && s.world) || "garden"}` + (curtain.open ? " curtain--open" : "")} aria-live="polite">
          <div className="curtain__in">
            <svg viewBox="-12 -14 24 18" className="curtain__hat" aria-hidden="true">
              <Hat world={(s && s.world) || "garden"} />
            </svg>
            <span className="eyebrow">Hole {curtain.n}</span>
            <h2>{curtain.name}</h2>
            <p className="curtain__chore">{((c) => c[Number(curtain.n) % c.length])(choresOf((s && s.world) || "garden"))}</p>
          </div>
        </div>
      )}

      {about && (
        <About web={cfg ? cfg.web : ""} onClose={() => setAbout(false)} onRules={() => (setAbout(false), setRules(true))}
          support={game.current && <Tip chain={game.current.chain} me={account && account.address} chainId={chainId} price={gasPrice} onConnect={() => (setAbout(false), setReal(true))} />} />
      )}
      {support && game.current && (
        <Sheet className="about" label="Support the game" onClose={() => setSupport(false)}>
          <span className="eyebrow">Support</span>
          <h2>Keep the gnomes rolling</h2>
          <Tip chain={game.current.chain} me={account && account.address} chainId={chainId} price={gasPrice} onConnect={() => (setSupport(false), setReal(true))} bare />
        </Sheet>
      )}
      {rules && <Rules onClose={() => setRules(false)} onBadges={() => (setRules(false), setBadgesOpen(true))} />}
      {badgesOpen && <Badges fresh={freshBadges} onClose={() => setBadgesOpen(false)} />}
      {(screen === "rival" || screen === "ghosts" || screen === "worlds" || screen === "pick") && <ModeTag kind={screen === "rival" || (dare && !solo) ? "duel" : "solo"} />}
      {/* every screen but the title's (its film is the page) */}
      {cfg && screen !== "title" && <NetBanner rpc={cfg.rpc} onSupport={() => setSupport(true)} />}

      {pending && !(holed && s && s.id === pending.id) && (
        <PendingSave r={pending} rec={pendingRec && pendingRec.round === roundOf(pending) ? pendingRec.rec : null} by={pending.period != null ? saveBy(pending.period) : null} clock={game.current ? game.current.chain.now : undefined}
          onSave={savePending} onForget={() => (keepPending(null), setPendingRec(null))} />
      )}
      {real && (
        <RealPlay
          elsewhere={ourNode === false}
          account={account}
          wallet={wallet}
          onConnect={() => void connectWallet()}
          onDisconnect={() => (setReal(false), disconnectWallet())}
          onClose={() => setReal(false)}
          // from a won hole (or one kept through a reload), connecting leads straight to its save
          onSave={s && s.holed && canSave ? () => (setReal(false), void recordIt()) : pending ? () => (setReal(false), keptSave()) : null}
          rpc={cfg && cfg.rpc}
          chainName={chainName}
          cost={costNow}
          funds={funds}
          lack={lackNow}
          // with a round to save, the name goes in its signature: typed there as on the win card
          typed={askName ? typed : null}
          nameOk={nameReady}
          named={account ? nudge.isNamed : null}
          chain={game.current && game.current.chain}
          price={gasPrice}
          onNamed={(n) => (setNamedAs(n), nudge.named())}
          waiting={pending ? `your ${strokesWord(pending.strokes)} on ${pending.name || "this hole"}` : s && s.holed && canSave ? "this round" : null}
        />
      )}

      {playing && s && s.note && !s.flying && <div className="toast" role="status">{s.note}</div>}
      {playing && linkNote && <Toast text={linkNote} onDone={() => setLinkNote(null)} />}
      {/* a duel's turns, called out big: yours, then theirs (the score card says them to a screen reader) */}
      {playing && racing && s && !s.done && !theyWon && (s.rivalTurn || (s.strokes === s.rival && !s.flying)) && (
        <p key={(s.rivalTurn ? "them" : "you") + s.strokes} className={"turncall" + (s.rivalTurn ? " turncall--them" : "")} aria-hidden="true">
          {s.rivalTurn ? `${racing.self ? "Your best" : racing.name}'s turn` : "Your turn!"}
        </p>
      )}
      {playing && !linkNote && !duel && farHint && s && s.ready && !s.flying && s.strokes > 0 && s.cam !== "far" && <Toast text="Tip: the camera button's Far view shows the whole hole." onDone={() => { try { localStorage.setItem("gnogolf.hint.far", "1"); } catch {} setFarHint(false); }} />}
      {playing && s && s.flying && <CauseNote hot={hot.current} />}

      {gl && !fatal && (
        <div className="banner" role="alertdialog" aria-labelledby="gl-title">
          <Dialog className="banner__in">
            <h2 id="gl-title">Graphics were reset</h2>
            <p>{gl === "lost" ? "The browser took the 3D view away for a moment. Bringing it back…" : "The 3D view did not come back. Reloading brings it back; your scores are safe."}</p>
            {gl === "gone" && (
              <div className="banner__row">
                <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
              </div>
            )}
          </Dialog>
        </div>
      )}

      {(fatal || (s && s.error)) && (() => {
        // say what actually went wrong: the chain not answering, a shot it
        // refused, or a bug of ours while drawing — and offer the fix that fits
        const kind: FatalKind | ErrorKind = fatal ? fatal.kind : (s && s.errorKind) || "shot";
        // (Try again: the hole the load failed on, not the one still on screen)
        const holeNow = (s && (s.failed || s.id)) || null;
        const TEXT = BANNER[kind];
        const g = game.current;
        return (
          <div className="banner" role="alertdialog" aria-labelledby="banner-title">
            <Dialog className="banner__in">
              <h2 id="banner-title">{TEXT[0]}</h2>
              <p>{TEXT[1]}</p>
              {fatal && (kind === "down" || kind === "empty") && <Retry onRetry={() => (setFatal(null), setBoot((b) => b + 1))} />}
              {kind === "webgl" && cfg && (
                <p><a href={`${cfg.web}${REALM_PATH}`} target="_blank" rel="noopener noreferrer">Play it as text on gno.land ↗</a></p>
              )}
              {kind !== "limit" && (
                <details className="details">
                  <summary>Technical details</summary>
                  <div className="details__box">
                    <p className="mono">{fatal ? fatal.msg : s && s.error}</p>
                    {(kind === "down" || kind === "load" || kind === "shot") && cfg && <p className="mono">{cfg.rpc}</p>}
                  </div>
                </details>
              )}
              <div className="banner__row">
                {fatal ? (
                  kind === "down" || kind === "empty"
                    ? <Button variant="primary" onClick={() => (setFatal(null), setBoot((b) => b + 1))}>Try again now</Button>
                    : <Button variant="primary" onClick={() => window.location.reload()}>Reload</Button>
                ) : kind === "load" ? (
                  <Button variant="primary" onClick={() => { g!.clearError(); if (holeNow) void g!.load(holeNow); }}>Try again</Button>
                ) : kind === "draw" ? (
                  <Button variant="primary" onClick={() => { g!.clearError(); setMenu(true); }}>Pick a hole</Button>
                ) : kind === "limit" ? (
                  <Button variant="primary" onClick={() => { g!.clearError(); g!.reset(); }}>Restart the hole</Button>
                ) : (
                  <Button variant="primary" onClick={() => g!.clearError()}>Keep playing</Button>
                )}
              </div>
            </Dialog>
          </div>
        );
      })()}

      {playing && !s && !fatal && (
        <div className="boot">
          {/* the world is not known yet: guess it from the hole asked for */}
          <svg viewBox="-12 -16 24 26" className="boot__gnome" aria-hidden="true">
            <circle cx="0" cy="2" r="7" className="load__white" />
            <Hat world={(cfg && (cfg.world || (/island/.test(cfg.hole) ? "island" : /town/.test(cfg.hole) ? "town" : /mountain/.test(cfg.hole) ? "mountain" : ""))) || "garden"} y={-3} />
          </svg>
          <p>Reaching the chain…</p>
        </div>
      )}
    </>
  );
}

// named: a name just taken with it, said in the same line
function RecordState({ record, account, s, chain, named = "" }: { record: Rec; account: Account | null; s: Snapshot; chain: Chain | null; named?: string }) {
  if (!record) return null;
  switch (record.at) {
    case "signing":
      return record.of === undefined ? null : <p className="note">This round is saved in {record.of} transactions: one shot list is more than one transaction can replay here. Adena asks {record.of} times.</p>;
    case "refused":
      return record.stale ? null : <p className="note note--bad">{record.error}</p>;
  }
  return (
    <p className="note note--good">
      Saved on-chain{named ? <> as <b>{named}</b>: you&apos;re on the boards</> : ""}. Your link now dares friends to race it.{" "}
      {chain && account && (
        <a href={chain.roundURL(s.id || "", account.address)} target="_blank" rel="noopener noreferrer">
          See your round on gno.land ↗
        </a>
      )}
    </p>
  );
}

/**
 * A won round kept through a reload (Adena installed meanwhile), waiting for
 * its save: its own small card, on any screen, until saved, forgotten or too
 * late. by and clock on the chain's clock.
 */
function PendingSave({ r, rec, by, clock = Date.now, onSave, onForget }: { r: SaveOf; rec: Rec; by: number | null; clock?: () => number; onSave: () => void; onForget: () => void }) {
  const now = useNow(clock);
  const done = rec?.at === "saved";
  // said for a moment once saved, then gone
  const forget = useRef(onForget);
  forget.current = onForget;
  useEffect(() => {
    if (!done) return;
    const t = setTimeout(() => forget.current(), 4000);
    return () => clearTimeout(t);
  }, [done]);
  const left = by == null ? null : by - now;
  // too late to save: the round goes (and the sheet stops offering it)
  const over = !done && left != null && left <= 0;
  useEffect(() => void (over && forget.current()), [over]);
  if (over) return null;
  return (
    <div className="pending">
      {done ? (
        <span className="pending__say" role="status">Saved on-chain ✓ Your round on <b>{r.name}</b> is public.</span>
      ) : (
        <>
          <span className="pending__say">
            <span>Your <b>{strokesWord(r.strokes)}</b> on <b>{r.name}</b> {r.strokes > 1 ? "are" : "is"} waiting{left != null && <> · <b>{mmss(left)}</b> left</>}</span>
            {rec?.at === "refused" && <small className="pending__err" role="alert">{rec.error}</small>}
          </span>
          <Button variant="secondary" className="btn--save" disabled={rec?.at === "signing"} onClick={onSave}>
            {rec?.at === "signing" ? "Waiting for Adena…" : "Save on-chain"}
          </Button>
        </>
      )}
      <SheetClose inline onClose={onForget} />
    </div>
  );
}

/** GNOT for this account: where to get some (the faucet by default), and
 *  what to paste there (the address; on this machine, gnokey's command). */
/** Where to get GNOT (href: its page, "" for none), and the address to paste there. */
function GetGnot({ address, href, label = "" }: { address: string; href: string; label?: string }) {
  const [copied, copy] = useCopied();
  return (
    <span className="getgnot">
      {href && <><a href={href} target="_blank" rel="noopener noreferrer">{label}</a>{" · "}</>}
      <button className="linkish" onClick={() => void copy(address)}>
        {copied ? "Copied ✓" : "Copy my address"}
      </button>
    </span>
  );
}

/**
 * Getting on the boards, once: what saving gives, and each step ticked as it
 * is done (Adena, connected, test GNOT, a name, a round saved). It connects,
 * and from a won hole it saves at once. Nothing here is needed to keep
 * playing free. lack: the GNOT the account lacks for the round on offer
 * (null: unknown); waiting: that round, said while Adena is installed.
 */
// elsewhere: Adena's network is another node (its balance there is not this one's)
// onDisconnect: this page forgets the account (Adena keeps it), any screen
function RealPlay({ account, wallet, onConnect, onClose, onSave, rpc, chainName, cost, funds, lack, named, waiting, chain, price, onNamed, typed, nameOk, elsewhere = false, onDisconnect }: {
  elsewhere?: boolean;
  onDisconnect?: () => void;
  account: Account | null; wallet: { busy: boolean; error: string | null; note?: string }; onConnect: () => void; onClose: () => void; onSave: (() => void) | null;
  rpc: string | null; chainName: string; cost: string | null; funds: number | null; lack: number | null; named: boolean | null; waiting: string | null;
  chain: Chain | null; price: number; onNamed: (name: string) => void;
  /** with a round to save by a player without a name: the name typed goes in its signature; nameOk: the save may go */
  typed: { check: NameCheck; set: (stem: string) => void } | null; nameOk: boolean;
}) {
  // a round of this account's on the chain already, in either mode: the last step done
  const [savedAny, setSavedAny] = useState(false);
  const me = account && account.address;
  useEffect(() => {
    if (!chain || !me) return setSavedAny(false);
    let live = true;
    for (const m of ["assisted", "pro"] as const) void within(chain.rank(m, me)).then((r) => live && r.holes > 0 && setSavedAny(true)).catch(() => {});
    return () => void (live = false);
  }, [chain, me]);
  const installed = hasAdena();
  const phone = !installed && isTouch();
  const local = networkOf(rpc || "") === "local", main = chainName === MAINNET;
  const funded = funds != null && (lack != null ? lack === 0 : funds > 0);
  // one step at a time: each ticked on its own (a name and no GNOT left is
  // step 3 to do again), and only the first not done shows what to do
  const done = [installed, !!account, funded, !!named, savedAny && !onSave]; // (a round waiting: its save is the step at hand)
  const now = done.indexOf(false);
  const step = (i: number) => (done[i] ? "done" : i === now ? "now" : "later");
  // the step to do, in view (a phone's sheet is taller than the screen)
  const steps = useRef<HTMLOListElement>(null);
  useEffect(() => void steps.current?.querySelector(".now")?.scrollIntoView({ block: "nearest" }), [now]); // (void: it may return a promise, not a clean-up)
  const [sent, setSent] = useState(false);
  // a phone has no Adena: the hole goes to the player's computer
  const sendOn = async () => {
    try {
      if (navigator.share) await navigator.share({ title: "Gnogolf", url: location.href });
      else await navigator.clipboard.writeText(location.href), setSent(true);
    } catch {}
  };
  return (
    <Sheet className="real" label="Get on the boards" onClose={onClose}>
        <span className="eyebrow">Adena wallet · a few minutes, once</span>
        <h2>Get on the boards</h2>
        <p className="real__lead">Same game, still free to play. Saving puts your round on gno.land: public, ranked, yours on any device.</p>

        {!account && <div className="real__cols">
          <div className="real__col">
            <h3>Free play</h3>
            <ul>
              <li>Every shot played by the smart contract</li>
              <li>No wallet, no cost</li>
              <li>Your card stays in this browser</li>
            </ul>
          </div>
          <div className="real__col real__col--on">
            <h3>Saved on-chain</h3>
            <ul>
              <li>Public, on your address, on any device</li>
              <li>Your ball marks stay for the players after you</li>
              <li>With a gno.land name, your best rounds are ranked</li>
            </ul>
          </div>
        </div>}

        <ol className="real__steps" ref={steps}>
          <li className={step(0)}>
            <b>Get Adena</b>
            <span>{phone ? "A computer's browser extension: save from there." : "The gno.land wallet, a browser extension."}</span>
          </li>
          <li className={step(1)}>
            <b>Connect it</b>
            <span>Nothing moves without your signature.</span>
          </li>
          <li className={step(2)}>
            <b>{main ? "Have some GNOT" : "Get test GNOT"}</b>
            <span>
              {local ? "They pay each save's small fee: from the node's test1, with gnokey." : <>They pay each save&apos;s small fee: {main ? "a little from the faucet hub, or bought" : "free from the faucet hub"}{chainName && <>, choose <b>{chainName}</b> in its list</>}.</>}
              {account && now === 2 && (
                <>
                  {" "}
                  {local ? null : <GetGnot address={account.address} href="" />}
                </>
              )}
              {account && (elsewhere
                ? <> · Adena is on another network: in Adena, pick the one whose RPC is <b>{(rpc || "").replace(/^https?:\/\//, "")}</b>.</>
                : funds != null && <> · You have {(funds / 1e6).toFixed(2)} GNOT here.</>)}
            </span>
          </li>
          <li className={step(3)}>
            <b>Pick your gno.land name</b>
            {account && now === 3 && chain ? <NameForm chain={chain} account={account.address} chainId={chainName || null} price={price} lead="Your name" onNamed={onNamed} typed={(onSave && typed) || undefined} /> : <span>{named ? "Your saved rounds are ranked." : "Only named players are ranked."}</span>}
          </li>
          <li className={step(4)}>
            <b>Hole out, then save</b>
            <span>The chain replays your shots: no faked scores.</span>
            {cost && <span className="real__cost">This round: {cost}</span>}
          </li>
        </ol>

        {wallet.error && <p className="note note--bad">{wallet.error}</p>}
        {wallet.note && !account && <p className="note">{wallet.note}</p>}

        {!installed ? (
          phone ? (
            <>
              <Button variant="primary" className="btn--wide" onClick={() => void sendOn()}>{sent ? "Link copied: open it on your computer" : "Play it on my computer"}</Button>
              <p className="real__fine">This round stays on this phone: play the hole there to save it.</p>
            </>
          ) : (
            <>
              <a className="btn btn--main btn--wide" href={ADENA_URL} target="_blank" rel="noopener noreferrer">
                Install Adena ↗
              </a>
              <p className="real__fine">
                Installed it? <button className="linkish" onClick={() => window.location.reload()}>Reload this page</button>
                {waiting ? <>: {waiting} waits for you in this tab.</> : " so the game can see it."}
              </p>
            </>
          )
        ) : account ? (
          // the button does the step at hand: GNOT first, then the round waiting, else back to the game
          now === 2 && local ? (
            <Button variant="primary" className="btn--wide" disabled={!fundCmd(account.address, chainName, rpc || "")} onClick={() => void navigator.clipboard.writeText(fundCmd(account.address, chainName, rpc || "")).then(() => setSent(true), () => {})}>
              {sent ? "Copied: run it in a terminal ✓" : "Copy the gnokey command"}
            </Button>
          ) : now === 2 ? (
            <a className="btn btn--main btn--wide" href={main ? GNOT_URL : FAUCET} target="_blank" rel="noopener noreferrer">{main ? "Get GNOT ↗" : "Get free test GNOT ↗"}</a>
          ) : onSave && funded ? (
            <Button variant="secondary" className="btn--wide btn--save" disabled={!nameOk} onClick={onSave}>Save on-chain</Button>
          ) : (
            <Button variant={now === -1 || now === 4 ? "primary" : "secondary"} className="btn--wide" onClick={onClose}>
              {now === -1 ? "All set: play" : now === 4 ? "Play a hole, then save it" : "Later: keep playing"}
            </Button>
          )
        ) : (
          <Button variant="primary" className="btn--wide" disabled={wallet.busy} onClick={onConnect}>
            {wallet.busy ? "Waiting for Adena…" : "Connect Adena"}
          </Button>
        )}
        <p className="real__fine">
          {account && <>Connected as <span className="mono">{shortAddr(account.address, 4, 3)}</span> · </>}Network: <span className="mono">{chainName}</span>
          {account && onDisconnect && <> · <button className="linkish" onClick={onDisconnect}>Disconnect</button></>}
        </p>
    </Sheet>
  );
}

/** The camera modes' names, on the camera button. */
const CAMS: Record<CamMode, string> = { classic: "Classic", far: "Far", third: "Third person" };


interface PickerProps {
  /** the cup picked: the screen takes its colours */
  world: string;
  /** the hole a shared link opened, named over the gnomes ("Hole 3 · Down the Tunnel") */
  hole?: string;
  /** that link's dare, said under it: the duel it arms, or who dares with no round here */
  dare?: ReactNode;
  gnome: string;
  onChange: (id: string) => void;
  onPick: () => void;
  unlocked: (id: string) => boolean;
  /** the gnome really chosen: a locked one on show plays as it */
  chosen: string;
  onPlayAs: (id: string) => void;
  onBack: () => void;
  onAbout: () => void;
  aim: Mode;
  onAim: (m: Mode) => void;
}

function Picker({ world, gnome, onChange, onPick, unlocked, chosen, onPlayAs, onBack, onAbout, aim, onAim, hole = "", dare = "" }: PickerProps) {
  const i = Math.max(0, GNOMES.findIndex((g) => g.id === gnome));
  const skin = GNOMES[i];
  const canvas = useGnomeStage(skin);

  const step = (d: number) => (sound("blip"), onChange(GNOMES[(i + d + GNOMES.length) % GNOMES.length].id));

  return (
    <div className={`screen screen--pick front tint--${world}`}>
      <BackButton label="Back to the cups" onClick={onBack} />
      <AboutButton onClick={onAbout} />
      <div className="pick">
        <span className="eyebrow">{hole ? <>{hole}<span className="pick__ask"> · pick your gnome</span></> : "Pick your gnome"}</span>
        {dare && (typeof dare === "string" ? <p className="dare">{dare}</p> : dare)}
        <h2 className="pick__name">{skin.name}</h2>
        <div className="pick__stage">
          <button className="round" aria-label="Previous gnome" onClick={() => step(-1)}>‹</button>
          {/* the tile: the gnome's own renderer (its canvas mount) and his dots along its foot */}
          <div className="pick__tile">
            <div ref={canvas} className={"pick__canvas" + (unlocked(skin.id) ? "" : " pick__canvas--locked")} />
            {/* a locked gnome: what earns him, on a band across him */}
            {!unlocked(skin.id) && <p className="pick__lock">🔒 {skin.unlock ? UNLOCKS[skin.unlock].need : "Keep playing"}</p>}
            <div className="pick__dots">
              {GNOMES.map((g) => (
                <span key={g.id} aria-current={g.id === skin.id} />
              ))}
            </div>
          </div>
          <button className="round" aria-label="Next gnome" onClick={() => step(1)}>›</button>
        </div>
        <AimSetting aim={aim} onChange={onAim} compact />
        {/* a locked gnome on show: the button still plays, as the gnome really chosen */}
        <Button variant="primary" className="btn--play" onClick={() => (sound("start"), unlocked(skin.id) ? onPick() : onPlayAs(chosen))}>
          {unlocked(skin.id) ? "Choose this gnome" : `Play as ${(GNOMES.find((x) => x.id === chosen) || GNOMES[0]).name}`}
        </Button>
      </div>
    </div>
  );
}

/**
 * Which chain the page plays on, on every screen but mainnet's: a local node
 * or the testnet, where scores are practice. The other deployment one click
 * away when there is one.
 */
// onSupport: the tip, on every screen: a button of its own beside the banner
// (inside it, it read as supporting the chain), alone on mainnet (no banner)
function NetBanner({ rpc, onSupport }: { rpc: string; onSupport: () => void }) {
  const net = networkOf(rpc);
  return (
    <div className="netbanner">
      {net !== "mainnet" && (
        <p className={`netbanner__band netbanner--${net}`}>
          <b data-short={net === "local" ? "Local" : "Test"}>{net === "local" ? "Local chain" : "Testnet"}</b>
          <span>{net === "local" ? "a node on this machine" : "practice scores, free test GNOT"}</span>
          {net === "testnet" && OTHER_URL && <a className="netbanner__go" href={OTHER_URL}>Play on mainnet →</a>}
        </p>
      )}
      {/* the Leaderboard chip's twin, on the left (a phone keeps the heart) */}
      <Button variant="chip" className="netbanner__support" aria-label="Support the game" onClick={onSupport}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z" /></svg>
        <span>Support</span>
      </Button>
    </div>
  );
}

/** Assisted or Pro aim, with what it means — and what the chain can't check. */
function AimSetting({ aim, onChange, compact = false }: { aim: Mode; onChange: (m: Mode) => void; compact?: boolean }) {
  const [why, setWhy] = useState(false); // the (i)'s note, a tap away (a tooltip never shows on touch)
  const popId = useId(); // (the note is what the (i) says, to a screen reader too)
  return (
    <div className={"aimset" + (compact ? " aimset--compact" : "")}>
      <span className="aimset__label">Aim</span>
      <Segmented label="Aim" value={aim} full={!compact} options={[["pro", "Pro"], ["assisted", "Assisted"]]} onChange={(m) => (sound("blip"), onChange(m))} />
      {/* both lines in one cell, the other one hidden: the box keeps the longer one's size, nothing moves on a switch */}
      <small className="aimset__help">
        <span className={aim === "pro" ? "" : "off"} aria-hidden={aim !== "pro"}>
          {compact ? "No aim line: you read the course yourself. Ranked on its own board." : "No aim line · ranked apart"}
          <button type="button" className="aimset__info" tabIndex={aim === "pro" ? 0 : -1} aria-expanded={why} aria-describedby={why ? popId : undefined} aria-label="Why ranked apart?" onClick={() => setWhy((v) => !v)} onBlur={() => setWhy(false)}>
            ⓘ
          </button>
          {why && <span id={popId} className="aimset__pop" role="note">{HONEST}</span>}
        </span>
        <span className={aim === "pro" ? "off" : ""} aria-hidden={aim === "pro"}>{compact ? "The chain previews your shot: see the whole aim line before you swing." : "Full aim line"}</span>
      </small>
    </div>
  );
}


/** The hole on the shared picture's card and the clip's, as its link card has it (media/og): the hole and the score;
 *  a duel's, who was raced, both counts, and its result shouted. */
const caption = (s: Snapshot, won: { title: string; duel: Duel } | null) => {
  const cup = s.place ? worldOf(s.world).name : "Community hole", par = parHere(s);
  if (won) return { eyebrow: `vs ${won.duel.name}${par ? ` · par ${par}` : ""}`, title: s.name, score: `${s.strokes} – ${won.duel.ghost.strokes}`, term: won.title, challenge: `Race the ghost · ${s.name}` };
  return { eyebrow: [cup, s.place && `hole ${s.place}`, par && `par ${par}`].filter(Boolean).join(" · "), title: s.name, score: strokesWord(s.strokes), term: golfTerm(s.strokes, par).replace(/!?$/, "!") }; // the clip shouts it
};

/**
 * What a player says when they share: short, a little cheeky, gnome and
 * gno.land flavoured (the realm replays every shot; the score is on the
 * chain). One line is picked per moment, from the hole so it varies.
 */
// ghost: the link dares (a round of the sharer's on the chain): the text says so
function shareText({ s, card, cups, fresh, place, ghost = false }: { s: Snapshot; card: Card; cups: ReturnType<typeof cupTotals>; fresh: readonly Skin[]; place?: { rank: number; of: number } | null; ghost?: boolean }) {
  const t = totals(card, s.holes), cup = worldOf(s.world).name;
  const d = t.strokes - t.par, vs = d === 0 ? "level par" : vsPar(d);
  const pick = (list: readonly string[]) => list[[...String(s.id || "")].reduce((a, c) => a + c.charCodeAt(0), s.strokes) % list.length];
  const tag = SHARE_TAGS;
  if (cups.slam) return "👑 Grand slam on Gnogolf: every cup at par or under. The Gnome King bows." + tag;
  if (t.all) return pick([
    `🏆 ${cup} done on Gnogolf, ${vs}. Every putt computed on gno.land.`,
    `⛳ ${t.strokes} strokes round the whole ${cup} (${vs}). My gnome is tired, the chain is not.`,
  ]) + tag;
  // the link dares: one ask, and no score (the friend races the best, maybe not this round)
  if (ghost) return `⚔ Race my ghost on ${s.name}${place ? ` (#${place.rank} of ${place.of})` : ""}. Free to play, no wallet needed.` + tag;
  if (place) return `🏆 #${place.rank} of ${place.of} on ${s.name} in Gnogolf: ${strokesWord(s.strokes)}, saved on-chain. Come and take my place.` + tag;
  if (fresh.length) return `🍄 New gnome unlocked on Gnogolf: ${fresh.map((g) => g.name).join(" and ")}. Earned the hard way, one putt at a time.` + tag;
  if (s.strokes === 1) return pick([
    `🕳️ Hole in one on ${s.name}! Every bounce computed by a realm on gno.land.`,
    `⛳ Ace on ${s.name}. Somewhere on gno.land a realm just nodded.`,
  ]) + tag;
  return pick([
    `⛳ ${s.name} in ${s.strokes}. Mini-golf where the ball is rolled by a smart contract. Your turn?`,
    `🧙 My gnome sank ${s.name} in ${s.strokes}. Physics by a realm on gno.land, excuses by me.`,
    `⛳ ${s.strokes} strokes on ${s.name}. Every bounce computed on-chain. Beat that, gnome.`,
  ]) + tag;
}

/** The menu's buttons' marks, drawn in the camera button's strokes. */
const MENU_ICON = {
  card: <path d="M4 5h16v14H4zM4 10h16M10 10v9" />,
  gnome: <path d="M12 3 5.5 16h13ZM4 16h16M9 20h6" />,
  mode: <path d="M5 8h14l-3.5-3.5M19 16H5l3.5 3.5" />, // (one game to the other)
  cups: <path d="M8 21V4l10 4-10 4M5 21h8" />,
};

/** The address of a cup, as the cup screen puts it in the bar: ?cup=<world>. */
function cupLink(cup: string) {
  const q = chainQuery();
  q.set("cup", cup);
  return `?${q}`;
}

/** The confetti over the victory screen: none with reduced motion. */
function Cheer() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const box = ref.current;
    if (!motion || !box) return;
    // a canvas of its own each time: a context once lost is not given back
    const el = box.appendChild(document.createElement("canvas"));
    let stop = () => {};
    try { stop = cheer(el); } catch {} // no WebGL to spare: no confetti, the screen stands
    return () => (stop(), el.remove());
  }, []);
  return motion ? <div ref={ref} className="victory__cheer" aria-hidden="true" /> : null;
}

/**
 * A cup won: its emblem and colours, the total against par, its card, the
 * gnomes it earned and the ways to tell people, then back to the cups.
 */
interface VictoryProps {
  cup: Cup;
  best: boolean;
  holes: readonly HoleRow[];
  card: Card;
  /** the card's scores that are on the chain too */
  saved: Card;
  fresh: readonly Skin[];
  snapshot: () => Promise<Blob | null>;
  onBack: () => void;
  onReplay: () => void;
  /** the cup after this one ("" after the last) */
  next: string;
  /** on to it, as this gnome when one is given (just unlocked) */
  onNext: (gnome?: string) => void;
  onRules: () => void;
}
function Victory({ cup, best, holes, card, saved, fresh, snapshot, onBack, onReplay, next, onNext, onRules }: VictoryProps) {
  const w = worldOf(cup);
  const t = totals(card, holes), vs = t.strokes - t.par;
  const vsText = vs === 0 ? "level par" : vsPar(vs);
  const to = WORLDS.find((x) => x.id === next);
  const text = `🏆 ${best ? `Beat my last ${w.name}` : `${w.name} complete`} on Gnogolf: ${t.strokes} strokes over ${holes.length} holes, ${vsText}. Every putt computed on gno.land.${SHARE_TAGS}`;
  return (
    <div className={`victory victory--${cup}`}>
      <Cheer />
      <Dialog className="victory__in" role="dialog" aria-modal="true" aria-labelledby="victory-title" aria-describedby="victory-sum" onClose={onBack}>
        <div className="victory__badge"><Emblem id={cup} /></div>
        <span className="victory__ribbon">{w.name}</span>
        <h2 id="victory-title">{best ? "Better than last time!" : "Cup complete!"}</h2>
        <p id="victory-sum" className="victory__sum">
          <strong>{t.strokes}</strong> strokes · par {t.par} · <b className={vs < 0 ? "good" : vs > 0 ? "bad" : ""}>{vsText}</b>
          {t.all && vs <= 0 && <span className="victory__stamp" title="At par or under">★ At par or under</span>}
          {t.aces > 0 && <span className="victory__stamp">{t.aces} hole{t.aces > 1 ? "s" : ""}-in-one</span>}
        </p>
        <Scorecard holes={holes} card={card} saved={saved} current={null} compact onRules={onRules} />
        {fresh.length > 0 && <NewGnome skin={fresh[0]} also={fresh.slice(1)} where={to ? to.name : ""} onPlay={() => (sound("select"), onNext(fresh[0].id))} />}
        <Share text={text} link={cupLink(cup)} snapshot={snapshot} />
        {/* one solid action: the new gnome's (in its card), else the next cup, else back to the cups */}
        <div className="banner__row">
          <button className="linkish" onClick={() => (sound("blip"), onReplay())}>Replay the cup</button>
          {fresh.length > 0 || !to ? (
            <Button variant={fresh.length ? "secondary" : "primary"} onClick={() => (sound("select"), onBack())}>Back to cups</Button>
          ) : (
            <>
              <Button variant="secondary" onClick={() => (sound("select"), onBack())}>Back to cups</Button>
              <Button variant="primary" onClick={() => (sound("select"), onNext())}>Next: {to.name} →</Button>
            </>
          )}
        </div>
      </Dialog>
    </div>
  );
}


/**
 * A gnome just unlocked, on the cup's card: turning on its stage as in the
 * picker, what earned it, and the one action: play as it (in the next cup,
 * where: its name). also: the others unlocked with it.
 */
function NewGnome({ skin, also, where, onPlay }: { skin: Skin; also: readonly Skin[]; where: string; onPlay: () => void }) {
  const stage = useGnomeStage(skin);
  const earned = skin.unlock ? UNLOCKS[skin.unlock].need : "";
  return (
    <div className="newgnome">
      <div ref={stage} className="pick__canvas newgnome__stage" />
      <div className="newgnome__say">
        <span className="eyebrow">New gnome!</span>
        <b className="newgnome__name">{skin.name}</b>
        {earned && <small>{earned}{also.length > 0 && ` · ${also.map((g) => g.name).join(", ")} too`}</small>}
        <Button variant="primary" onClick={onPlay}>Play as {skin.name} →</Button>
        {where && <small>Next up: {where}</small>}
      </div>
    </div>
  );
}

/** Gnomes just unlocked: said, and each one a tap from the picker, shown there on its stage. */
function Unlocked({ fresh, onMeet }: { fresh: readonly Skin[]; onMeet: (id: string) => void }) {
  if (!fresh.length) return null;
  return (
    <p className="note note--good">
      New gnome unlocked: <b>{fresh.map((gn) => gn.name).join(", ")}</b>
      {fresh.map((gn) => (
        <span key={gn.id}>
          {" · "}
          <button className="linkish" onClick={() => (sound("select"), onMeet(gn.id))}>Meet {gn.name} →</button>
        </span>
      ))}
    </p>
  );
}




/** The card: hole, par and your score, ten holes to a row, with the totals. */
// fresh: the badges the current hole just earned, stamped on its score
function Scorecard({ holes, card, saved, current, compact = false, fresh = [], onRules }: { holes: readonly HoleRow[]; card: Card; saved: Card; current: string | null; compact?: boolean; fresh?: readonly string[]; onRules: () => void }) {
  // compact, with a hole being played (the win card): that hole and four either
  // side, one row, the whole card a tap away
  const at = holes.findIndex((h) => h.id === current), windowed = compact && at >= 0 && holes.length > 9;
  const [all, setAll] = useState(false);
  const from = windowed && !all ? Math.max(0, Math.min(at - 4, holes.length - 9)) : 0;
  const shown = windowed && !all ? holes.slice(from, from + 9) : holes;
  // two halves of the same width (front nine, back nine), so every column of
  // the second row sits under one of the first; a short last row is padded
  const per = (windowed && !all ? shown.length : Math.ceil(shown.length / 2)) || 1, rows: (readonly HoleRow[])[] = [];
  for (let i = 0; i < shown.length; i += per) rows.push(shown.slice(i, i + per));
  const pad = (row: readonly HoleRow[]) => Array.from({ length: per - row.length }, (_, k) => <td key={"pad" + k} className="pad" />);
  const t = totals(card, holes);
  const earnedAt = badgesAt();
  return (
    <div className={"card" + (compact ? " card--compact" : "") + " scorecard"}>
      {rows.map((row, r) => (
        <table key={r}>
          <tbody>
            <tr><th>Hole</th>{row.map((h, i) => <td key={h.id} className={h.id === current ? "cur" : ""}><span>{from + r * per + i + 1}</span></td>)}{pad(row)}</tr>
            <tr><th>Par</th>{row.map((h) => <td key={h.id} className={h.id === current ? "now" : ""}>{parOf(h)}</td>)}{pad(row)}</tr>
            <tr>
              <th>Score</th>
              {row.map((h) => {
                const sc = scoreOf(card, h);
                const par = parOf(h);
                const kind = !sc ? "" : sc === 1 ? "ace" : sc < par ? "under" : sc === par ? "par" : sc >= par + 3 ? "oops" : "over";
                return (
                  <td key={h.id} className={kind + (h.id === current ? " now" : "")}>
                    {sc || ""}
                    {sc && <CardStamps at={Object.keys(earnedAt).filter((b) => earnedAt[b] === h.id)} strokes={sc} par={par} seed={r * per + row.indexOf(h)} fresh={h.id === current ? fresh : []} />}
                    {sc && saved[cardKey(h)] === sc && <ChainSeal />}
                  </td>
                );
              })}
              {pad(row)}
            </tr>
          </tbody>
        </table>
      ))}
      <div className="scorecard__total">
        <span>Total</span>
        <strong>{t.strokes || "–"}</strong>
        <span>par {t.par || "–"}</span>
        <span>{t.done}/{holes.length} holes</span>
        <span className="scorecard__links">
          <button className="linkish" onClick={onRules}>Rules</button>
          {windowed && <button className="linkish" onClick={() => setAll((v) => !v)} aria-expanded={all}>{all ? "Fewer holes" : "The whole card"}</button>}
        </span>
      </div>
    </div>
  );
}

// badges: the cup's card (not compact) shows the badges earned, those fresh pressed on
function Standings({ s, card, saved, chain, me, mode = "pro", compact = false, onRules, fresh = [], badges }: BoardProps & { card: Card; saved: Card; compact?: boolean; onRules: () => void; fresh?: readonly string[]; badges?: { onOpen: () => void } }) {
  const [rank, setRank] = useState<{ at?: number; unnamed?: boolean } | null>(null);
  useEffect(() => {
    if (!chain || !me) return;
    let live = true; // no state set once the card is gone
    // the chain's own rank, among the named players it ranks
    chain.rank(mode, me).then((r) => live && setRank(r.rank > 0 ? { at: r.rank } : r.holes > 0 ? { unnamed: true } : null)).catch(() => {});
    return () => void (live = false);
  }, [chain, me, mode]);
  const cup = worldOf(s.world);
  const t = totals(card, s.holes);
  const vs = t.strokes - t.par;
  const next = nextHole(s, card);
  return (
    <section className="cup" aria-label={`${cup.name} standings`}>
      <header className="cup__head">
        <Emblem id={cup.id} />
        <div>
          <span className="eyebrow">Your cup</span>
          <h3>{cup.name}</h3>
        </div>
        <dl className="cup__sum">
          <div><dt>Holes</dt><dd>{t.done}/{s.holes.length}</dd></div>
          <div><dt>Vs par</dt><dd className={vs < 0 ? "good" : vs > 0 ? "bad" : ""}>{t.done ? vsPar(vs) : "–"}</dd></div>
          <div><dt>On-chain</dt><dd title={rank && rank.unnamed ? "Only players with a gno.land name are ranked" : undefined}>{!rank || !rank.at ? "–" : `#${rank.at}`}</dd></div>
        </dl>
      </header>
      <Scorecard holes={s.holes} card={card} saved={saved} current={s.id} compact={compact} fresh={fresh} onRules={onRules} />
      {badges && <EarnedBadges fresh={fresh} onOpen={badges.onOpen} />}
      {(!compact || t.all) && <p className="cup__next">
        {t.all
          ? t.strokes <= t.par ? (cupHasGnome(s.world || "") ? "Cup finished at par or under — a gnome is waiting in the picker." : "Cup finished at par or under!") : "Cup finished. Now beat par."
          : next && <>Next up: <b>{next.name}</b></>}
      </p>}
    </section>
  );
}
