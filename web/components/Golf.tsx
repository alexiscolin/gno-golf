"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createGame, type Game, type GameOptions, type Snapshot } from "@/lib/engine";
import { GNOMES, makePreview, cheer, motion } from "@/lib/scene";
import { DEFAULT_RPC, DEFAULT_WEB, safeEndpoint, isHoleId, isAddress, errorKind, REALM_PATH, RULES, type Chain } from "@/lib/chain";
import { HOT, type CamMode, type ErrorKind } from "@/lib/engine/types";
import type { Skin } from "@/lib/scene/gnome";
import type { HoleRow, Mode } from "@/lib/types";
import type { Card, Cup } from "@/lib/card";
import type { Feel } from "@/lib/feel";
import { hasAdena, connect, current, onOurNode, recordRound, chainSplit, gasOf, costOf, shortOf, depositBytes, ADENA_URL, onWalletChange, type SendError } from "@/lib/adena";
import Title, { Hat, choresOf } from "@/components/Title";
import Worlds, { WORLDS, Emblem } from "@/components/Worlds";
import Weather from "@/components/Weather";
import Share, { ShareClip, type Clip } from "@/components/Share";
import Gnokey from "@/components/Gnokey";
import About, { AboutButton, BackButton } from "@/components/About";
import { Button, Segmented, Toggle, Sheet, SheetClose, Dialog } from "@/components/ui";
import { loadCard, recordScore, clearCard, clearCup, totals, cupTotals, parOf, UNLOCKS, cupHasGnome, cupOf, cardKey, scoreOf, vsPar } from "@/lib/card";
import { feel, setFeel, sound, hush } from "@/lib/feel";
import { addFriend } from "@/lib/friends";
import { messageOf, holeLink, parHere, HONEST, suggestName } from "@/components/common";
import { clipName } from "@/lib/clip";
import { Boards, FullBoard, Podium, NameForm, useRankNudge, useSavedPlace, type BoardProps } from "@/components/Leaderboard";
import { FAUCET, GNOT_URL, networkOf, OTHER_URL } from "@/lib/network";
import { CAM_ORDER, savedCam, saveCam, hadGnome, savedGnome, earned, remember } from "@/lib/prefs";

// The test hooks (?play, ?shot, ?demo, ?weather, ?world, ?promo) answer in a
// dev build, or on a page opened with ?camlog (the camera and capture rigs);
// ?won, a win card for a round nobody played, in a dev build only.
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

const SCREENS = ["title", "worlds", "pick", "play"] as const;
type Screen = (typeof SCREENS)[number];
const isScreen = (v: unknown): v is Screen => SCREENS.some((x) => x === v);
type Gfx = "auto" | "high" | "low";
/** The connected Adena account. */
type Account = NonNullable<Awaited<ReturnType<typeof current>>>;
/** Where the current round's save stands: being signed (a part of it, when it
 *  goes in several), refused (stale: its weather is over), or on the chain. */
/** A finished round, as far as saving it goes: what the save and its gas read. */
type SaveOf = { id: string; name?: string; shots: readonly string[]; strokes: number; period?: number | null; roundMode?: Mode | null; official?: boolean; walls?: number; pieces?: number; kind?: string; pts?: readonly number[] };
const saveOf = (s: SaveOf): SaveOf => ({ id: s.id, name: s.name, shots: s.shots, strokes: s.strokes, period: s.period, roundMode: s.roundMode, official: s.official, walls: s.walls, pieces: s.pieces, kind: s.kind, pts: s.pts });
// the last finished round not yet on the chain, kept for this tab: installing
// Adena means reloading the page, and the round it was installed for must not go
const PENDING = "gnogolf.pending";

type Rec = null
  | { at: "signing"; part?: number; of?: number }
  | { at: "refused"; error: string; stale: boolean }
  | { at: "saved"; hash: string; height?: number; parts: number };

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
    const hooks = DEV || p0.has("camlog");
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

// A round is saved in the weather it was played in: the chain takes it while
// that period is the current one or the one just gone, so until the start of
// period + 2 (weather.gno, five-minute periods), by the time of the block that
// takes the transaction. On the chain's clock (chain.now: the last block time
// read), and SAVE_MARGIN early: the signing and the block's inclusion.
const SAVE_MARGIN = 15 * 1000;
const saveBy = (period: number) => (period + 2) * RULES.periodMs - SAVE_MARGIN;
// how far this device's clock is behind the chain's (ms): a deadline on the
// chain's clock, less this, is one on the device's
const skewOf = (chain: Chain | null | undefined) => (chain && chain.now ? chain.now() - Date.now() : 0);
const mmss = (ms: number) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** Where the round is and how long it can still go on-chain ("within 4:12"),
 *  then, once the weather is over, a replay in the current one. */
// by and clock (now, ms) on the chain's clock; ranked: a course hole (a community one ranks nobody)
function SaveClock({ by, clock = Date.now, stale, ranked }: { by: number; clock?: () => number; stale?: boolean; ranked: boolean }) {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const t = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(t);
  }, [clock]);
  const left = by - now;
  if (left > 0 && !stale)
    return (
      <p className={"saveclock" + (left < 60000 ? " saveclock--soon" : "")}>
        Only in this browser. Save within <b>{mmss(left)}</b> {ranked ? "to be ranked" : "to keep it on your address"}, while its weather lasts.
      </p>
    );
  return (
    <p className="note note--warn">
      This round's weather is over: it can no longer be saved on-chain. Play again in the new one.
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

// The storage deposit of a save, in ugnot: a first save on a hole writes the
// round, the best and the board entry; a hole saved before is replaced.
// saved: null when not known yet (counted as a first save: the larger).
// gno.land's mainnet: no faucet there, and its GNOT is the real one
const MAINNET = "gnoland-1";
const depositOf = (saved: boolean | null, bytePrice: number, firstOnCourse = false) => depositBytes(saved !== true, firstOnCourse) * bytePrice;


/** A round's cost in one short line: the total, then what it is made of. */
// test: a testnet's GNOT, free from its faucet
const costLine = (gas: number, gasPrice: number, saved: boolean | null, bytePrice: number, firstOnCourse = false, test = false) => {
  const g = Number(costOf(gas, gasPrice)), d = depositOf(saved, bytePrice, firstOnCourse) / 1e6, unit = test ? "test GNOT" : "GNOT";
  return saved === true ? `About ${g.toFixed(2)} ${unit}` : `About ${(g + d).toFixed(2)} ${unit} (first save on this hole)`;
};
const short = (a: string | null | undefined) => (a ? `${a.slice(0, 4)}…${a.slice(-3)}` : "");

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
  const [cardOpen, setCardOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => feel());
  const toggle = (k: keyof Feel) => { setFeel(k, !prefs[k]); setPrefs(feel()); };
  const [wipe, setWipe] = useState(false); // "clear my scores" asks twice

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
  // the hole that finished its cup (or beat the cup's best): the win card
  // leads on to the cup's victory screen (open)
  const [cupWon, setCupWon] = useState<{ cup: Cup; id: string; best: boolean; open?: boolean } | null>(null);
  const holesList = (s && s.holes) || NONE;
  const tot = useMemo(() => totals(card, holesList), [card, holesList]);
  const allList = (s && s.allHoles) || NONE;
  const cups = useMemo(() => cupTotals(card, allList), [card, allList]);
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
  // the name typed on the win card, taken with the save (null: none, or not one the chain would take)
  const [saveName, setSaveName] = useState<string | null>(null);
  const saving = useRef(false); // a save under way: a second click starts no second one
  // the round kept through a reload (PENDING), and how its save goes
  const [pending, setPending] = useState<SaveOf | null>(null);
  const [pendingRec, setPendingRec] = useState<Rec>(null);
  const keepPending = (r: SaveOf | null) => {
    setPending(r);
    try { if (r) sessionStorage.setItem(PENDING, JSON.stringify(r)); else sessionStorage.removeItem(PENDING); } catch {}
  };
  const chainUp = !!(s || game.current);
  useEffect(() => {
    // read once the chain is here: a round whose weather is over is dropped
    const c = game.current && game.current.chain;
    if (!c) return;
    let r: SaveOf | null = null;
    try { r = JSON.parse(sessionStorage.getItem(PENDING) || "null") as SaveOf | null; } catch {}
    if (!r || !r.id || !Array.isArray(r.shots)) return;
    const kept = r;
    void c.sync().catch(() => {}).then(() => (kept.period == null || c.now() < saveBy(kept.period) ? setPending(kept) : keepPending(null)));
  }, [chainUp]);
  // a round won and not on the chain yet is the one kept; saved or too late, it goes
  useEffect(() => {
    if (!s || !s.holed || !s.id) return;
    if (onChain || closed) return void (pending && pending.id === s.id && keepPending(null));
    keepPending(saveOf({ ...s, id: s.id }));
    // (on these moments only: the round is s as the hole is won, not each of its frames)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [holedNow, onChain, closed]);
  // and the place it took, once saved
  // the shot's clip once made (ShareClip), for the share buttons to send
  const [clip, setClip] = useState<Clip | null>(null);
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
        rpc: cfg.rpc, web: cfg.web, gnome, world: cfg.world, weather: cfg.weather, aimMode: aim, camMode: savedCam(), gfx, promo, probes, log: camlog,
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
      if (camlog) window.__g = game_;

      game_.start(cfg.hole || (cfg.cup ? { cup: cfg.cup, n: cfg.place } : null))
        .then(() => {
          if (cancelled) return;
          if (cfg.play) play();
          else if (cfg.hole || cfg.cup) {
            // a shared link: straight to that hole (a first-time player picks a
            // gnome first); a link to nothing lands on the cups, quietly
            if (!game_.linked()) setScreen("worlds");
            else if (cfg.gnome || hadGnome()) play(true); // straight onto the ball: the link said where
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
    const q = window.location.search, camlog = /[?&]camlog/.test(q);
    const wantPromo = /[?&]promo/.test(q) && (DEV || camlog), wantProbes = camlog || cfg.won > 0;
    if (!wantPromo && !wantProbes) make();
    else
      void Promise.all([wantPromo ? import("@/lib/promo").then((m) => m.promo) : undefined, wantProbes ? import("@/lib/engine/probes").then((m) => m.probes) : undefined])
        .then(([promo, probes]) => !cancelled && make(promo, probes))
        .catch((err: unknown) => !cancelled && setFatal({ msg: messageOf(err), kind: fatalKind(err) }));

    return () => {
      cancelled = true;
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
    roundKey.current = s ? `${s.id}#${s.shots.join(";")}` : "";
  });
  useEffect(() => setRecord(null), [holeId, fresh0]);

  useEffect(() => {
    let live = true;
    if (holeId && game.current && !chainName) void within(game.current.chain.chainId()).then((n) => live && setChainName(n)).catch(() => {});
    return () => void (live = false);
  }, [holeId, chainName]);

  // a different account or network in Adena: forget the connection
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
  const [firstOnCourse, setFirstOnCourse] = useState(false); // no finish yet anywhere on the course in this mode: a dearer first save
  const saveMode = (s && (s.roundMode || s.mode)) === "pro" ? "pro" : "assisted";
  useEffect(() => {
    setSaved(null);
    setFirstOnCourse(false);
    if (!account || !holeId || !game.current) return;
    let live = true;
    const c = game.current.chain;
    void within(c.bests(holeId, saveMode, [account.address]))
      .then((b) => live && setSaved(b.rows.length > 0))
      .catch(() => {});
    void within(c.rank(saveMode, account.address))
      .then((r) => live && setFirstOnCourse(r.holes === 0))
      .catch(() => {});
    return () => void (live = false);
  }, [account, holeId, saveMode, holedNow]);
  const waiting = record?.at === "signing" && record.of === undefined; // Adena open, the round in one transaction
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

  // the round kept through a reload: saved from its own card, connecting first if need be
  const savePending = () => {
    if (!pending) return;
    if (!account) return setReal(true);
    void saveRound(pending, setPendingRec, () => true);
  };

  // the round the win card offers to save, or the one kept through a reload (pending)
  async function recordIt() {
    if (!account) return setReal(true);
    if (!s || !game.current || !s.id) return;
    const round = `${s.id}#${s.shots.join(";")}`;
    await saveRound({ ...s, id: s.id }, (r) => roundKey.current === round && setRecord(r), () => roundKey.current === round);
  }

  /**
   * Puts a finished round on the chain: in as many commits as the chain cuts
   * it into, each signed in Adena, then read back. land says how it goes;
   * alive: the player is still on it (a later commit is not sent otherwise).
   * A name typed on the card (saveName) is taken in the first signature.
   */
  async function saveRound(r: SaveOf, land: (rec: Rec) => void, alive: () => boolean) {
    if (!account || !game.current) return;
    // busy before anything is awaited: a second click must not start a second save
    if (saving.current) return;
    saving.current = true;
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
      const named = nudge.noName && saveName ? { registrar: await chain.nameReg(), name: saveName } : null;
      let tx: Awaited<ReturnType<typeof recordRound>> | null = null;
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
        tx = await Promise.race([sent, landed.then((ok) => (ok ? null : sent))]).finally(() => (open = false));
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
      if (named) setNamedAs(named.name), nudge.named();
      // signed is not recorded: read the round back and say what the chain has
      // the block may land a moment after Adena answers: read back for up to 8 s
      let mine: Awaited<ReturnType<Chain["round"]>> = null;
      for (let k = 0; k < 8; k++) {
        mine = await chain.round(hole, account.address).catch(() => null);
        if (mine && mine.done && mine.strokes === r.strokes) break;
        await new Promise((ok) => setTimeout(ok, 1000));
      }
      if (mine && mine.done && mine.strokes === r.strokes) {
        land({ at: "saved", hash: tx?.hash ?? "", height: tx?.height, parts: parts.length });
        if (hole === holeId) setSaved(true); // (a round kept through a reload may be another hole's)
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
      saving.current = false;
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // an open dialog hears Escape first and keeps it (useDialog); with none
      // open, a screen goes back to the one before it
      if (e.key !== "Escape") return;
      setScreen((sc) => (sc === "pick" ? "worlds" : sc === "worlds" ? "title" : sc));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  unlockedRef.current = unlocked;
  // the new hole is on screen, built and its shaders ready: open the curtain
  const holeReady = !!(s && s.ready);
  // a hole that would not load or draw: the curtain goes, so its banner (Try again, Pick a hole) is seen
  const errorNow = !!(s && s.error);
  useEffect(() => {
    if (errorNow) setCurtain(null);
  }, [errorNow]);
  useEffect(() => {
    if (curtain && holeId === curtain.id && holeReady && !curtain.open) {
      const t = setTimeout(() => setCurtain((c) => c && { ...c, open: true }), 250);
      const t2 = setTimeout(() => setCurtain(null), 1000);
      return () => (clearTimeout(t), clearTimeout(t2));
    }
  }, [holeId, holeReady, curtain]);

  const holed = s && s.holed;
  // The address bar follows the screen: the title is the bare page, the cups
  // ?cup=<world>, the picker adds &gnome=, a hole ?cup=&hole=&gnome=. A new
  // screen is a new history entry (Back returns to the one before); moving
  // within a hole — next hole, another gnome — only rewrites the current one.
  const place = s && s.place, world = s && s.world, idHere = s && s.id;
  const lastScreen = useRef<Screen | null>(null);
  useEffect(() => {
    if (!cfg) return;
    const keep = new URLSearchParams(window.location.search);
    const q = new URLSearchParams();
    for (const k of ["rpc", "web"]) { const v = keep.get(k); if (v) q.set(k, v); }
    if (screen === "play" && idHere) {
      // a cup's hole by its place; one in no cup (community, archived) by its id
      if (place) (q.set("cup", world || "garden"), q.set("hole", String(place)));
      else q.set("hole", idHere);
      q.set("gnome", gnome);
    } else if (screen === "worlds" && world) q.set("cup", world);
    else if (screen === "pick" && world) (q.set("cup", world), q.set("gnome", gnome));
    else if (screen === "play") return; // the hole is not known yet: wait for it
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
  }, [cfg, screen, place, world, gnome, idHere]);
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
    // the cup complete now and not before, or complete again in fewer strokes
    const h = list.find((x) => x.id === id), cup = h && WORLDS.find((w) => w.id === cupOf(h))?.id;
    const b = cup && before[cup], a = cup && after[cup];
    if (cup && b && a && a.all && (!b.all || a.strokes < b.strokes)) setCupWon({ cup, id, best: b.all });
  };

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

      {screen === "title" && <Title loading={!s} world={s ? s.world : undefined} onStart={() => setScreen("worlds")} onAbout={() => setAbout(true)} />}
      {screen === "worlds" && s && (
        <Worlds
          counts={s.worlds}
          stats={cups}
          onResetAll={() => setCard(clearCard())}
          onReset={(w) => setCard(clearCup(allList.filter((h) => cupOf(h) === w).map(cardKey)))}
          current={s.world}
          onBack={() => setScreen("title")}
          community={s.community}
          podium={<Podium chain={game.current && game.current.chain} me={account && account.address} mode={aim} onOpen={() => setBoard(true)} />}
          onCommunity={(id) => {
            if (game.current) void game.current.load(id);
            setScreen("pick");
          }}
          onPick={(w) => {
            game.current && game.current.setWorld(w);
            setScreen("pick"); // then the gnome, the last one played already picked
          }}
        />
      )}
      {screen === "pick" && <Picker world={(s && s.world) || "garden"} aim={aim} onAim={setAim} gnome={gnome} onChange={choose} onPick={play} unlocked={unlocked} chosen={chosenGnome()}
        onPlayAs={(id) => (setGnome(id), play())}
        onBack={() => {
          sound("blip");
          // leaving on a locked gnome: back to the one really chosen
          if (!unlocked(gnome)) setGnome(chosenGnome());
          setScreen("worlds");
        }} />}

      {s && playing && (
        <>
          <header className="hud hud--top">
            <div className="card card--hole">
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
            <div className="card card--score">
              <span className="eyebrow">Strokes</span>
              <strong>{s.strokes}</strong>
              <span className="card__par">par {parHere(s)}</span>
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
                  <b>{account ? short(account.address) : "Save on-chain"}</b>
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
                    const cup = WORLDS.find((w) => w.id === s.world) || WORLDS[0];
                    const [first, ...rest] = cup.name.split(" ");
                    return (
                      <button className="drawer__cup" aria-label={`${cup.name} — change cup`} onClick={() => { sound("blip"); setMenu(false); setScreen("worlds"); }}>
                        <Emblem id={cup.id} />
                        <h2>{first}<br />{rest.join(" ")}</h2>
                      </button>
                    );
                  })()}
                  <div className="drawer__tools">
                    <button className="round round--small round--x" aria-label="About Gnogolf" title="About" onClick={() => { setMenu(false); setAbout(true); }}>
                      <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" fill="none" stroke="currentColor" strokeWidth="2.4" /><path d="M10 9 V14 M10 6 V6.2" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
                    </button>
                    <SheetClose onClose={() => setMenu(false)} inline first />
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
                  <div className="me__row">
                    <Button variant="primary" onClick={() => { setMenu(false); setCardOpen(true); }}>Cup overview</Button>
                    <Button variant="secondary" onClick={() => { setMenu(false); setScreen("pick"); }}>Change gnome</Button>
                    <Button variant="secondary" onClick={() => { setMenu(false); setScreen("title"); }}>Main menu</Button>
                    {account && <Button variant="secondary" className="drawer__off" onClick={() => { setMenu(false); disconnectWallet(); }}>Disconnect Adena</Button>}
                  </div>
                </section>
                <nav className="drawer__list">
                  {s.holes.map((h) => (
                    <button
                      key={h.id}
                      className="tile"
                      aria-current={h.id === s.id}
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
                  <button
                    className={"btn btn--ghost btn--wipe" + (wipe ? " btn--danger" : "")}
                    onClick={() => {
                      if (!wipe) return setWipe(true);
                      setCard(clearCard());
                      setWipe(false);
                    }}
                    onBlur={() => setWipe(false)}
                  >
                    {wipe ? "Sure? Tap again to clear" : "New game · clear my scores"}
                  </button>
                  <small className="drawer__note">Clears this browser's scorecard. Gnomes you earned stay yours, and rounds saved on-chain stay on the leaderboard.</small>
                </section>
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
            <Button onClick={() => game.current?.reset()}>Restart</Button>
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
            <h2>{golfTerm(s.strokes, parHere(s))}</h2>
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
              link={s ? holeLink(s, gnome) : ""}
                snapshot={() => (game.current ? game.current.snapshot(caption(s)) : Promise.resolve(null))}
                text={shareText({ s, card, cups, fresh, place: savedPlace })}
                clip={clip}
              />
            </div>
            {cfg && cfg.clips && <ShareClip make={(run) => (game.current ? game.current.clip(run, caption(s)) : Promise.resolve(null))} name={clipName(s.id || "")} onClip={setClip} />}


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
            <Standings s={s} card={card} chain={game.current && game.current.chain} me={account && account.address} mode={s.roundMode || aim} compact />
            {fresh.length > 0 && (
              <p className="note note--good">
                New gnome unlocked: <b>{fresh.map((gn) => gn.name).join(", ")}</b> — pick it from the menu.
              </p>
            )}
            <RecordState record={record} account={account} s={s} chain={game.current && game.current.chain} named={namedAs} />
            {(() => {
              // one note at a time, the one in the way first: the node, the funds, then the name
              const chain = game.current && game.current.chain;
              const host = ((chain && chain.rpc) || "").replace(/^https?:\/\//, "");
              const short = account && !onChain && funds != null ? shortOf(gasOf(s), gasPrice, depositOf(saved, bytePrice, firstOnCourse), funds) : 0;
              const warn =
                account && (ourNode === false || slowSign) ? (
                  <>
                    {ourNode === false ? "Adena is on another network." : "Adena is still working out the fee."} In Adena, pick the one whose RPC is <b>{host}</b>
                    {chainId ? <> (chain id <b>{chainId}</b>)</> : null}.
                  </>
                ) : short && funds != null ? (
                  <>
                    {funds === 0 ? "Your Adena account has no GNOT here yet." : `You need about ${short.toFixed(2)} more GNOT.`}{" "}
                    {/localhost|127\.0\.0\.1/.test(host) ? "Fund it from the node's test account." : chainId === MAINNET ? account && <GetGnot address={account.address} href={GNOT_URL} label="How to get GNOT ↗" /> : account && <GetGnot address={account.address} />}
                  </>
                ) : null;
              // (once saved, the saved line says the name too)
              if (!warn && namedAs) return onChain ? null : <p className="note note--good">You are <b>{namedAs}</b> now: save your round to take your place.</p>;
              if (!warn && nudge.noName && account && chain)
                return canSave ? (
                  // while it can be saved, the name goes in the save's own signature
                  <NameForm chain={chain} account={account.address} chainId={chainId} price={gasPrice} onNamed={(n) => (setNamedAs(n), nudge.named())}
                    onPick={setSaveName} suggest={suggestName(gnome)} lead={nudge.at ? `Your name at #${nudge.at} on the board` : "Your name on the board"} />
                ) : (
                  <NameForm chain={chain} account={account.address} chainId={chainId} price={gasPrice} onNamed={(n) => (setNamedAs(n), nudge.named())}
                    lead={onChain ? "Saved! Now put it on the board" : "Get on the board"} />
                );
              return warn && <p className="note note--warn">{warn}</p>;
            })()}
            {!onChain && s.period != null && (
              <SaveClock by={saveBy(s.period)} clock={game.current ? game.current.chain.now : undefined} stale={closed} ranked={!!s.official} />
            )}
            {/* one solid action at a time: saving while it can, else going on */}
            <div className="banner__row">
              {canSave ? (
                <button className="linkish" onClick={() => game.current?.reset()}>Play again</button>
              ) : (
                <Button variant="secondary" onClick={() => game.current?.reset()}>
                  Play again
                </Button>
              )}
              {canSave && (
                <Button variant="secondary" className={"btn--save" + (nudge.at ? " btn--save-rank" : "")} disabled={record?.at === "signing"} data-autofocus onClick={() => void recordIt()}>
                  <svg className="btn__mark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="2.5" y="8" width="11" height="8" rx="4" transform="rotate(-35 8 12)" /><rect x="10.5" y="8" width="11" height="8" rx="4" transform="rotate(-35 16 12)" /></g></svg>
                  {record?.at === "signing" ? (
                    record.of === undefined ? "Waiting for Adena…" : `Adena: part ${record.part} of ${record.of}…`
                  ) : (
                    "Save on-chain"
                  )}
                  {nudge.at > 0 && record?.at !== "signing" && (
                    <span className="btn__rank">{!account ? `Could be #${nudge.at}` : nudge.noName && !saveName ? `#${nudge.at} with a name` : `Take #${nudge.at} on this hole!`}</span>
                  )}
                </Button>
              )}
              {cupWon && cupWon.id === s.id ? (
                <button className={"btn " + (canSave ? "btn--ghost" : "btn--main")} data-autofocus={!canSave || undefined} onClick={() => (sound("select"), setCupWon({ ...cupWon, open: true }))}>
                  Cup complete! →
                </button>
              ) : (
                <button className={"btn " + (canSave ? "btn--ghost" : "btn--main")} data-autofocus={!canSave || undefined} onClick={() => goTo((nextHole(s, card) || s.holes[0]).id)}>
                  Next hole →
                </button>
              )}
            </div>
            {account && !onChain && (
              <p className="real__fine">
                {costLine(gasOf(s), gasPrice, saved, bytePrice, firstOnCourse, chainName !== MAINNET)}. You confirm in Adena.
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
          fresh={fresh}
          snapshot={() => (game.current ? game.current.snapshot({ eyebrow: "Grand prix", title: (WORLDS.find((w) => w.id === cupWon.cup) || WORLDS[0]).name, score: "complete" }) : Promise.resolve(null))}
          onBack={() => (setCupWon(null), setScreen("worlds"))}
          onReplay={() => {
            setCupWon(null);
            const first = s.holes[0];
            if (first) goTo(first.id);
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
        <Boards mode={aim} s={s} inHole={screen === "play"} chain={game.current && game.current.chain} me={account && account.address} onClose={() => setBoard(false)} goTo={(id) => (setBoard(false), goTo(id))} />
      )}

      {cardOpen && s && (
        <Sheet className="cardsheet" label="Scorecard" onClose={() => setCardOpen(false)}>
            <span className="eyebrow">Gnogolf · the cup and its card</span>
            <h2>The cup</h2>
            <Standings s={s} card={card} chain={game.current && game.current.chain} me={account && account.address} mode={aim} />
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

      {(screen === "worlds" || screen === "pick") && <AboutButton onClick={() => setAbout(true)} />}
      {about && <About web={cfg ? cfg.web : ""} onClose={() => setAbout(false)} />}
      {cfg && <NetBanner rpc={cfg.rpc} />}

      {pending && !(holed && s && s.id === pending.id) && (
        <PendingSave r={pending} rec={pendingRec} by={pending.period != null ? saveBy(pending.period) : null} clock={game.current ? game.current.chain.now : undefined}
          onSave={savePending} onForget={() => (keepPending(null), setPendingRec(null))} />
      )}
      {real && (
        <RealPlay
          account={account}
          wallet={wallet}
          onConnect={() => void connectWallet()}
          onClose={() => setReal(false)}
          // from a won hole (or one kept through a reload), connecting leads straight to its save
          onSave={s && s.holed && canSave ? () => (setReal(false), void recordIt()) : pending ? () => (setReal(false), savePending()) : null}
          rpc={cfg && cfg.rpc}
          chainName={chainName}
          cost={s && s.holed ? costLine(gasOf(s), gasPrice, saved, bytePrice, firstOnCourse, chainName !== MAINNET) : null}
          funds={funds}
          lack={s && s.holed && account && funds != null ? shortOf(gasOf(s), gasPrice, depositOf(saved, bytePrice, firstOnCourse), funds) : null}
          named={account ? nudge.isNamed : null}
          chain={game.current && game.current.chain}
          price={gasPrice}
          onNamed={(n) => (setNamedAs(n), nudge.named())}
          waiting={pending ? `your ${pending.strokes} stroke${pending.strokes > 1 ? "s" : ""} on ${pending.name || "this hole"}` : s && s.holed && canSave ? "this round" : null}
        />
      )}

      {playing && s && s.note && !s.flying && <div className="toast" role="status">{s.note}</div>}
      {playing && linkNote && <Toast text={linkNote} onDone={() => setLinkNote(null)} />}
      {playing && !linkNote && farHint && s && s.ready && !s.flying && s.cam !== "far" && <Toast text="Tip: the camera button's Far view shows the whole hole." onDone={() => { try { localStorage.setItem("gnogolf.hint.far", "1"); } catch {} setFarHint(false); }} />}
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
      Saved on-chain{named ? <> as <b>{named}</b>: you&apos;re on the boards</> : ""}.{" "}
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
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const t = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(t);
  }, [clock]);
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
  if (!done && left != null && left <= 0) return null;
  return (
    <div className="pending" role="status">
      {done ? (
        <span className="pending__say">Saved on-chain ✓ Your round on <b>{r.name}</b> is public.</span>
      ) : (
        <>
          <span className="pending__say">
            <span>Your <b>{r.strokes} stroke{r.strokes > 1 ? "s" : ""}</b> on <b>{r.name}</b> {r.strokes > 1 ? "are" : "is"} waiting{left != null && <> · <b>{mmss(left)}</b> left</>}</span>
            {rec?.at === "refused" && <small className="pending__err">{rec.error}</small>}
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
function GetGnot({ address, href = FAUCET, label = "Get free test GNOT ↗", paste = address, what = "my address" }: { address: string; href?: string; label?: string; paste?: string; what?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="getgnot">
      {href && <><a href={href} target="_blank" rel="noopener noreferrer">{label}</a>{" · "}</>}
      <button className="linkish" onClick={() => void navigator.clipboard.writeText(paste).then(() => setCopied(true), () => {})}>
        {copied ? "Copied ✓" : `Copy ${what}`}
      </button>
    </span>
  );
}
/** A node on this machine sends this address some GNOT from its test1 account: gnokey's command. */
const fundCmd = (address: string, chainId: string, rpc: string) =>
  `gnokey maketx send -send 50000000ugnot -to ${address} -gas-fee 1000000ugnot -gas-wanted 2000000 -chainid ${chainId} -remote ${rpc.replace(/^https?:\/\//, "")} -broadcast test1`;

/**
 * Getting on the boards, once: what saving gives, and each step ticked as it
 * is done (Adena, connected, test GNOT, a name, a round saved). It connects,
 * and from a won hole it saves at once. Nothing here is needed to keep
 * playing free. lack: the GNOT the account lacks for the round on offer
 * (null: unknown); waiting: that round, said while Adena is installed.
 */
function RealPlay({ account, wallet, onConnect, onClose, onSave, rpc, chainName, cost, funds, lack, named, waiting, chain, price, onNamed }: {
  account: Account | null; wallet: { busy: boolean; error: string | null; note?: string }; onConnect: () => void; onClose: () => void; onSave: (() => void) | null;
  rpc: string | null; chainName: string; cost: string | null; funds: number | null; lack: number | null; named: boolean | null; waiting: string | null;
  chain: Chain | null; price: number; onNamed: (name: string) => void;
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
  const phone = !installed && typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches;
  const local = /localhost|127\.0\.0\.1|\[::1\]/.test(rpc || ""), main = chainName === MAINNET;
  const funded = funds != null && (lack != null ? lack === 0 : funds > 0);
  // one step at a time: each ticked on its own (a name and no GNOT left is
  // step 3 to do again), and only the first not done shows what to do
  const done = [installed, !!account, funded, !!named, savedAny];
  const now = done.indexOf(false);
  const step = (i: number) => (done[i] ? "done" : i === now ? "now" : "later");
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

        <div className="real__cols">
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
        </div>

        <ol className="real__steps">
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
              {local ? "They pay each save's small fee: from the node's test1, with gnokey." : main ? "They pay each save's small fee: buy or receive some." : "They pay each save's small fee: free from the faucet."}
              {account && now === 2 && (
                <>
                  {" "}
                  {local ? null : main ? <GetGnot address={account.address} href={GNOT_URL} label="How to get GNOT ↗" /> : <GetGnot address={account.address} href="" />}
                </>
              )}
              {account && funds != null && <> · You have {(funds / 1e6).toFixed(2)} GNOT.</>}
            </span>
          </li>
          <li className={step(3)}>
            <b>Pick your gno.land name</b>
            <span>{named ? "Your saved rounds are ranked." : "Only named players are ranked."}</span>
            {account && now === 3 && chain && <NameForm chain={chain} account={account.address} chainId={chainName || null} price={price} lead="Your name" onNamed={onNamed} />}
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
            <Button variant="primary" className="btn--wide" onClick={() => void sendOn()}>{sent ? "Link copied: open it on your computer" : "Send this hole to my computer"}</Button>
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
            <Button variant="primary" className="btn--wide" onClick={() => void navigator.clipboard.writeText(fundCmd(account.address, chainName, rpc || "")).then(() => setSent(true), () => {})}>
              {sent ? "Copied: run it in a terminal ✓" : "Copy the gnokey command"}
            </Button>
          ) : now === 2 && (!main || GNOT_URL) ? (
            <a className="btn btn--main btn--wide" href={main ? GNOT_URL : FAUCET} target="_blank" rel="noopener noreferrer">{main ? "How to get GNOT ↗" : "Get free test GNOT ↗"}</a>
          ) : onSave && funded ? (
            <Button variant="primary" className="btn--wide" onClick={onSave}>Save this round</Button>
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
          {account && <>Connected as <span className="mono">{short(account.address)}</span> · </>}Network: <span className="mono">{chainName}</span>
        </p>
    </Sheet>
  );
}

/** The camera modes' names, on the camera button. */
const CAMS: Record<CamMode, string> = { classic: "Classic", far: "Far", third: "Third person" };


interface PickerProps {
  /** the cup picked: the screen takes its colours */
  world: string;
  gnome: string;
  onChange: (id: string) => void;
  onPick: () => void;
  unlocked: (id: string) => boolean;
  /** the gnome really chosen: a locked one on show plays as it */
  chosen: string;
  onPlayAs: (id: string) => void;
  onBack: () => void;
  aim: Mode;
  onAim: (m: Mode) => void;
}
function Picker({ world, gnome, onChange, onPick, unlocked, chosen, onPlayAs, onBack, aim, onAim }: PickerProps) {
  const canvas = useRef<HTMLDivElement>(null);
  const preview = useRef<ReturnType<typeof makePreview> | null>(null);
  const i = Math.max(0, GNOMES.findIndex((g) => g.id === gnome));
  const skin = GNOMES[i];

  useEffect(() => {
    // a canvas of its own each time: a WebGL context that was released cannot
    // be taken again from the same element (React mounts twice in dev)
    const el = document.createElement("canvas");
    // its size only: the locked look is the wrapper's filter, and a copied
    // "--locked" class stayed on this canvas for good (every gnome went dark)
    el.className = "pick__canvas";
    canvas.current!.appendChild(el);
    const p = (preview.current = makePreview(el));
    const onResize = () => p.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      p.destroy();
      el.remove();
    };
  }, []);
  useEffect(() => {
    preview.current && preview.current.show(skin);
  }, [skin]);

  const step = (d: number) => (sound("blip"), onChange(GNOMES[(i + d + GNOMES.length) % GNOMES.length].id));

  return (
    <div className={`screen screen--pick front tint--${world}`}>
      <BackButton label="Back to the cups" onClick={onBack} />
      <div className="pick">
        <span className="eyebrow">Pick your gnome</span>
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
function NetBanner({ rpc }: { rpc: string }) {
  const net = networkOf(rpc);
  if (net === "mainnet") return null;
  return (
    <p className={`netbanner netbanner--${net}`}>
      <b data-short={net === "local" ? "Local" : "Test"}>{net === "local" ? "Local chain" : "Testnet"}</b>
      <span>{net === "local" ? "a node on this machine" : "practice scores, free test GNOT"}</span>
      {net === "testnet" && OTHER_URL && <a className="netbanner__go" href={OTHER_URL}>Play on mainnet →</a>}
    </p>
  );
}

/** Assisted or Pro aim, with what it means — and what the chain can't check. */
function AimSetting({ aim, onChange, compact = false }: { aim: Mode; onChange: (m: Mode) => void; compact?: boolean }) {
  const [why, setWhy] = useState(false); // the (i)'s note, a tap away (a tooltip never shows on touch)
  return (
    <div className={"aimset" + (compact ? " aimset--compact" : "")}>
      <span className="aimset__label">Aim</span>
      <Segmented label="Aim" value={aim} full={!compact} options={[["pro", "Pro"], ["assisted", "Assisted"]]} onChange={(m) => (sound("blip"), onChange(m))} />
      {/* both lines in one cell, the other one hidden: the box keeps the longer one's size, nothing moves on a switch */}
      <small className="aimset__help">
        <span className={aim === "pro" ? "" : "off"} aria-hidden={aim !== "pro"}>
          {compact ? "No aim line: you read the course yourself. Ranked on its own board." : "No aim line · ranked apart"}
          <button type="button" className="aimset__info" tabIndex={aim === "pro" ? 0 : -1} aria-expanded={why} aria-label="Why ranked apart?" onClick={() => setWhy((v) => !v)} onBlur={() => setWhy(false)}>
            ⓘ
          </button>
          {why && <span className="aimset__pop" role="note">{HONEST}</span>}
        </span>
        <span className={aim === "pro" ? "off" : ""} aria-hidden={aim === "pro"}>{compact ? "The chain previews your shot: see the whole aim line before you swing." : "Full aim line"}</span>
      </small>
    </div>
  );
}

/** The number a hole shows: the digits of its path when it has some (hole7),
 *  its place in the menu otherwise — a user's hole has no number of its own. */
// A hole's number is its place in its world's course, as the chain orders it
// — not the number in its realm's name (hole19 is the 17th of the garden).
function holeNumber(holes: readonly Pick<HoleRow, "id">[], id: string | null) {
  const i = holes.findIndex((h) => h.id === id);
  // a hole in no cup (community, archived) has no number: never "1"
  return i >= 0 ? String(i + 1) : "–";
}

/**
 * An ink stamp on the card, slightly askew like one pressed by hand: a gnome
 * with a crown for a hole-in-one, a winking gnome under par, a thumbs-up
 * mushroom at par.
 */
function Stamp({ kind, seed = 0, world = "garden" }: { kind: "ace" | "under" | "par"; seed?: number; world?: string }) {
  const tilt = ((seed * 37) % 30) - 15;
  const label = kind === "ace" ? "ACE" : kind === "under" ? "WOW" : "PAR";
  // each cup inks its own: a shell and a palm on the island, a lantern and a
  // mushroom house in town, the gnome and his mushroom in the garden
  const art =
    world === "island" ? (
      kind === "par" ? (
        <g>
          <path d="M16 38 Q30 8 44 38 Z" className="stamp__line" />
          <path d="M30 38 V16 M23 37 L27 18 M37 37 L33 18" className="stamp__line" />
          <rect x="26" y="38" width="8" height="4" rx="1.5" className="stamp__fill" />
        </g>
      ) : (
        <g>
          <path d="M30 42 Q27 30 31 20" className="stamp__line" />
          <path d="M31 20 Q22 14 16 20 M31 20 Q40 12 46 19 M31 20 Q26 10 20 11 M31 20 Q37 10 43 11" className="stamp__line" />
          {kind === "ace" && <path d="M22 11 L25 5 L28 9 L31 3 L34 9 L37 5 L40 11 Z" className="stamp__fill" />}
          <path d="M18 43 Q30 38 42 43" className="stamp__line" />
        </g>
      )
    ) : world === "town" ? (
      kind === "par" ? (
        <g>
          <path d="M30 10 V16" className="stamp__line" />
          <rect x="23" y="16" width="14" height="18" rx="3" className="stamp__line" />
          <circle cx="30" cy="25" r="3.5" className="stamp__fill" />
          <path d="M26 34 H34 L32 40 H28 Z" className="stamp__fill" />
        </g>
      ) : (
        <g>
          {kind === "ace" && <path d="M19 15 L23 7 L27 13 L30 5 L33 13 L37 7 L41 15 Z" className="stamp__fill" />}
          <path d="M16 30 Q30 10 44 30 Z" className="stamp__fill" />
          <rect x="22" y="30" width="16" height="12" rx="2" className="stamp__line" />
          <rect x="27" y="34" width="6" height="8" rx="3" className="stamp__fill" />
        </g>
      )
    ) : world === "mountain" ? (
      // a snowflake, crowned for an ace
      <g>
        {kind === "ace" && <path d="M19 13 L23 5 L27 11 L30 3 L33 11 L37 5 L41 13 Z" className="stamp__fill" />}
        <path d="M30 16 V44 M18 23 L42 37 M42 23 L18 37 M30 16 l-3 3 M30 16 l3 3 M30 44 l-3 -3 M30 44 l3 -3" className="stamp__line" />
        {kind !== "par" && <circle cx="30" cy="30" r="3.5" className="stamp__fill" />}
      </g>
    ) : null;
  return (
    <svg className={`stamp stamp--${kind}`} viewBox="0 0 60 60" style={{ transform: `rotate(${tilt}deg)` }} aria-hidden="true">
      <circle cx="30" cy="30" r="27" className="stamp__ring" />
      <circle cx="30" cy="30" r="22" className="stamp__ring stamp__ring--in" />
      {art || (kind === "par" ? (
        <g>
          <path d="M17 30 Q30 10 43 30 Z" className="stamp__fill" />
          <rect x="25" y="30" width="10" height="12" rx="3" className="stamp__line" />
        </g>
      ) : (
        <g>
          {kind === "ace" && <path d="M19 17 L23 9 L27 15 L30 7 L33 15 L37 9 L41 17 Z" className="stamp__fill" />}
          <path d="M20 29 L30 13 L40 29 Z" className="stamp__fill" />
          <circle cx="30" cy="34" r="9" className="stamp__line" />
          {kind === "under" ? <path d="M24 33 h4 M32 33 q2 -2 4 0" className="stamp__line" /> : (<><circle cx="27" cy="33" r="1.4" className="stamp__fill" /><circle cx="33" cy="33" r="1.4" className="stamp__fill" /></>)}
          <path d="M22 37 Q30 50 38 37" className="stamp__line" />
        </g>
      ))}
      <text x="30" y="55" textAnchor="middle" className="stamp__text">{label}</text>
    </svg>
  );
}

/** The line on a shared picture's card, and on the clip's: the hole and the score. */
/** The hole on the shared picture and clip, as its link card has it (media/og). */
const caption = (s: Snapshot) => {
  const cup = s.place ? (WORLDS.find((w) => w.id === s.world) || WORLDS[0]).name : "Community hole", par = parHere(s);
  return { eyebrow: [cup, s.place && `hole ${s.place}`, par && `par ${par}`].filter(Boolean).join(" · "), title: s.name, score: `${s.strokes} stroke${s.strokes > 1 ? "s" : ""}`, term: golfTerm(s.strokes, par).replace(/!?$/, "!") }; // the clip shouts it
};

/**
 * What a player says when they share: short, a little cheeky, gnome and
 * gno.land flavoured (the realm replays every shot; the score is on the
 * chain). One line is picked per moment, from the hole so it varies.
 */
function shareText({ s, card, cups, fresh, place }: { s: Snapshot; card: Card; cups: ReturnType<typeof cupTotals>; fresh: readonly Skin[]; place?: { rank: number; of: number } | null }) {
  const t = totals(card, s.holes), cup = (WORLDS.find((w) => w.id === s.world) || WORLDS[0]).name;
  const d = t.strokes - t.par, vs = d === 0 ? "level par" : vsPar(d);
  const pick = (list: readonly string[]) => list[[...String(s.id || "")].reduce((a, c) => a + c.charCodeAt(0), s.strokes) % list.length];
  const tag = " #gnoland @_gnoland";
  if (cups.slam) return "👑 Grand slam on Gnogolf: every cup at par or under. The Gnome King bows." + tag;
  if (t.all) return pick([
    `🏆 ${cup} done on Gnogolf, ${vs}. Every putt computed on gno.land.`,
    `⛳ ${t.strokes} strokes round the whole ${cup} (${vs}). My gnome is tired, the chain is not.`,
  ]) + tag;
  if (place) return `🏆 #${place.rank} of ${place.of} on ${s.name} in Gnogolf: ${s.strokes} stroke${s.strokes > 1 ? "s" : ""}, saved on-chain. Come and take my place.` + tag;
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

/** The address of a cup, as the cup screen puts it in the bar: ?cup=<world>. */
function cupLink(cup: string) {
  const q = new URLSearchParams();
  const keep = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  for (const k of ["rpc", "web"]) { const v = keep.get(k); if (v) q.set(k, v); }
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
  fresh: readonly Skin[];
  snapshot: () => Promise<Blob | null>;
  onBack: () => void;
  onReplay: () => void;
}
function Victory({ cup, best, holes, card, fresh, snapshot, onBack, onReplay }: VictoryProps) {
  const w = WORLDS.find((x) => x.id === cup) || WORLDS[0];
  const t = totals(card, holes), vs = t.strokes - t.par;
  const vsText = vs === 0 ? "level par" : vsPar(vs);
  const main = useRef<HTMLButtonElement>(null);
  // the dialog focuses its first control (a share icon): the main action instead
  useEffect(() => main.current?.focus({ preventScroll: true }), []);
  const text = `🏆 ${best ? `New best on the ${w.name}` : `${w.name} complete`} on Gnogolf: ${t.strokes} strokes over ${holes.length} holes, ${vsText}. Every putt computed on gno.land. #gnoland @_gnoland`;
  return (
    <div className={`victory victory--${cup}`}>
      <Cheer />
      <Dialog className="victory__in" role="dialog" aria-modal="true" aria-labelledby="victory-title" aria-describedby="victory-sum" onClose={onBack}>
        <div className="victory__badge"><Emblem id={cup} /></div>
        <span className="victory__ribbon">{w.name}</span>
        <h2 id="victory-title">{best ? "New best!" : "Cup complete!"}</h2>
        <p id="victory-sum" className="victory__sum">
          <strong>{t.strokes}</strong> strokes · par {t.par} · <b className={vs < 0 ? "good" : vs > 0 ? "bad" : ""}>{vsText}</b>
          {t.all && vs <= 0 && <span className="victory__stamp" title="At par or under">★ At par or under</span>}
          {t.aces > 0 && <span className="victory__stamp">{t.aces} hole{t.aces > 1 ? "s" : ""}-in-one</span>}
        </p>
        <Scorecard holes={holes} card={card} current={null} world={cup} compact />
        {fresh.length > 0 && (
          <p className="note note--good">
            New gnome unlocked: <b>{fresh.map((gn) => gn.name).join(", ")}</b> — pick it from the menu.
          </p>
        )}
        <Share text={text} link={cupLink(cup)} snapshot={snapshot} />
        <div className="banner__row">
          <Button variant="secondary" onClick={() => (sound("blip"), onReplay())}>Replay the cup</Button>
          <button ref={main} className="btn btn--main" onClick={() => (sound("select"), onBack())}>Back to cups</button>
        </div>
      </Dialog>
    </div>
  );
}

/** A score in golf's own words, from the strokes against par. */
function golfTerm(strokes: number, par: number) {
  if (strokes === 1) return "Hole in one!";
  const d = strokes - par;
  return d <= -3 ? "Albatross!" : d === -2 ? "Eagle!" : d === -1 ? "Birdie!" : d === 0 ? "Par" : d === 1 ? "Bogey" : d === 2 ? "Double bogey" : d === 3 ? "Triple bogey" : `${d} over par`;
}


/** The hole to play next: the first after this one not yet played, else the first not played at all. */
const nextHole = (s: Snapshot, card: Card) => {
  const at = s.holes.findIndex((h) => h.id === s.id);
  return s.holes.find((h, i) => i > at && !scoreOf(card, h)) || s.holes.find((h) => !scoreOf(card, h));
};

/** The card: hole, par and your score, ten holes to a row, with the totals. */
function Scorecard({ holes, card, current, compact = false, world = "garden" }: { holes: readonly HoleRow[]; card: Card; current: string | null; compact?: boolean; world?: string }) {
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
                const kind = !sc ? "" : sc === 1 ? "ace" : sc < par ? "under" : sc === par ? "par" : "over";
                return (
                  <td key={h.id} className={kind + (h.id === current ? " now" : "")}>
                    {sc || ""}
                    {kind && kind !== "over" && <Stamp kind={kind} seed={r * per + row.indexOf(h)} world={world} />}
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
        {windowed && <button className="linkish scorecard__all" onClick={() => setAll((v) => !v)} aria-expanded={all}>{all ? "Fewer holes" : "The whole card"}</button>}
      </div>
    </div>
  );
}

function Standings({ s, card, chain, me, mode = "pro", compact = false }: BoardProps & { card: Card; compact?: boolean }) {
  const [rank, setRank] = useState<{ at?: number; unnamed?: boolean } | null>(null);
  useEffect(() => {
    if (!chain || !me) return;
    let live = true; // no state set once the card is gone
    // the chain's own rank, among the named players it ranks
    chain.rank(mode, me).then((r) => live && setRank(r.rank > 0 ? { at: r.rank } : r.holes > 0 ? { unnamed: true } : null)).catch(() => {});
    return () => void (live = false);
  }, [chain, me, mode]);
  const cup = WORLDS.find((w) => w.id === s.world) || WORLDS[0];
  const t = totals(card, s.holes);
  const vs = t.strokes - t.par;
  const next = nextHole(s, card);
  return (
    <section className="cup" aria-label={`${cup.name} standings`}>
      <header className="cup__head">
        <Emblem id={cup.id} />
        <div>
          <span className="eyebrow">Grand prix</span>
          <h3>{cup.name}</h3>
        </div>
        <dl className="cup__sum">
          <div><dt>Holes</dt><dd>{t.done}/{s.holes.length}</dd></div>
          <div><dt>Vs par</dt><dd className={vs < 0 ? "good" : vs > 0 ? "bad" : ""}>{t.done ? vsPar(vs) : "–"}</dd></div>
          <div><dt>On-chain</dt><dd title={rank && rank.unnamed ? "Only players with a gno.land name are ranked" : undefined}>{!rank ? "–" : rank.at ? `#${rank.at}` : "unranked"}</dd></div>
        </dl>
      </header>
      <Scorecard holes={s.holes} card={card} current={s.id} world={s.world} compact={compact} />
      {(!compact || t.all) && <p className="cup__next">
        {t.all
          ? t.strokes <= t.par ? (cupHasGnome(s.world || "") ? "Cup finished at par or under — a gnome is waiting in the picker." : "Cup finished at par or under!") : "Cup finished. Now beat par."
          : next && <>Next up: <b>{next.name}</b></>}
      </p>}
    </section>
  );
}
