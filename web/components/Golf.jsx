"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { createGame } from "@/lib/engine";
import { GNOMES, makePreview } from "@/lib/scene";
import { DEFAULT_RPC, DEFAULT_WEB, safeEndpoint } from "@/lib/chain";
import { hasAdena, connect, current, onOurNode, recordRound, splitRound, gasOf, costOf, shortOf, depositBytes, ADENA_URL, onWalletChange } from "@/lib/adena";
import Title, { Hat, choresOf } from "@/components/Title";
import Worlds, { WORLDS, Emblem } from "@/components/Worlds";
import Weather from "@/components/Weather";
import Share from "@/components/Share";
import Gnokey from "@/components/Gnokey";
import { Button, Segmented, Toggle, Sheet, SheetClose, Dialog } from "@/components/ui";
import { loadCard, recordScore, clearCard, clearCup, totals, cupTotals, medalOf, parOf, UNLOCKS, cupHasGnome, cupOf } from "@/lib/card";
import { feel, setFeel, sound, hush } from "@/lib/feel";

// The test hooks (?play, ?shot, ?demo, ?weather, ?world, ?promo) answer in a
// dev build, or on a page opened with ?camlog (the camera and capture rigs);
// ?won, a win card for a round nobody played, in a dev build only.
const DEV = process.env.NODE_ENV !== "production";

/** Config travels in the query string, so one build serves any chain. */
function useConfig() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    const p0 = new URLSearchParams(window.location.search);
    const hooks = DEV || p0.has("camlog");
    const TEST = ["shot", "play", "demo", "weather", "world", "won"];
    const p = new URLSearchParams([...p0].filter(([k]) => (hooks || !TEST.includes(k)) && (DEV || k !== "won")));
    setCfg({
      rpc: safeEndpoint(p.get("rpc"), process.env.NEXT_PUBLIC_RPC || DEFAULT_RPC),
      web: safeEndpoint(p.get("web"), process.env.NEXT_PUBLIC_WEB || DEFAULT_WEB),
      // a link to a hole: ?cup=island&hole=3 (its place in the cup), or the
      // old ?hole=gno.land/r/… realm id; &gnome= the sharer's gnome
      hole: /^gno\.land\//.test(p.get("hole") || "") ? p.get("hole") : "",
      cup: /^[a-z]{2,16}$/.test(p.get("cup") || "") ? p.get("cup") : "",
      place: /^\d{1,3}$/.test(p.get("hole") || "") ? Number(p.get("hole")) : 0,
      gnome: /^[a-z]{2,16}$/.test(p.get("gnome") || "") ? p.get("gnome") : "",
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
const HOT = ["power", "cause", "flash"];
function makeHot() {
  let v = {};
  const subs = new Set();
  return {
    get: () => v,
    set(n) {
      if (HOT.every((k) => n[k] === v[k])) return;
      v = { power: n.power, cause: n.cause, flash: n.flash };
      subs.forEach((f) => f());
    },
    sub: (f) => (subs.add(f), () => subs.delete(f)),
  };
}
const useHot = (hot, k) => useSyncExternalStore(hot.sub, () => hot.get()[k], () => hot.get()[k]);
/** Whether two game snapshots differ only in their fast-moving fields. */
const sameCold = (a, b) => {
  for (const k in b) if (!HOT.includes(k) && a[k] !== b[k]) return false;
  return true;
};
function AimBar({ hot }) {
  const power = useHot(hot, "power") || 0;
  return <span style={{ width: `${Math.round(power * 100)}%` }} />;
}
function CauseNote({ hot }) {
  const cause = useHot(hot, "cause");
  return cause ? <div key={cause.at} className="cause" aria-live="polite">{cause.label}</div> : null;
}
function LiveWeather({ hot, ...props }) {
  return <Weather {...props} flash={useHot(hot, "flash") || 0} />;
}

/** p, or a rejection once ms have gone by (its timer cleared either way). */
function within(p, ms = 4000) {
  let t;
  return Promise.race([p, new Promise((_, no) => (t = setTimeout(() => no(new Error("The chain did not answer in time.")), ms)))]).finally(() => clearTimeout(t));
}
const NONE = []; // an empty list that stays the same one: memos keep

/** The locked gnome a shared link asked for, said once: null when there is none. */
function lockedNote() {
  if (typeof window === "undefined") return null;
  const want = new URLSearchParams(window.location.search).get("gnome");
  const gn = want && GNOMES.find((x) => x.id === want);
  if (!gn || !gn.unlock || earned().includes(gn.id)) return null;
  const own = savedGnome(), mine = GNOMES.find((x) => x.id === own) || GNOMES[0];
  return `${gn.name.replace(/^The /, "")} is locked — playing as ${mine.name.replace(/^The /, "")}`;
}

/** What kind of failure stopped the start: the chain not answering, a chain with no hole, or ours. */
function fatalKind(err) {
  const m = String((err && err.message) || err);
  if (/no hole is registered/.test(m)) return "empty";
  if ((err && err.kind === "down") || /fetch|network|timed? ?out|timeout|abort|rpc|abci|http|connect|load failed|did not answer|unexpected token/i.test(m)) return "down";
  return "bug";
}

// A round is saved in the weather it was played in: the chain takes it while
// that period is the current one or the one just gone, so until the start of
// period + 2 (weather.gno, five-minute periods), by the time of the block that
// takes the transaction. On the chain's clock (chain.now: the last block time
// read), and SAVE_MARGIN early: the signing and the block's inclusion.
const PERIOD_MS = 300 * 1000;
const SAVE_MARGIN = 15 * 1000;
const saveBy = (period) => (period + 2) * PERIOD_MS - SAVE_MARGIN;
// how far this device's clock is behind the chain's (ms): a deadline on the
// chain's clock, less this, is one on the device's
const skewOf = (chain) => (chain && chain.now ? chain.now() - Date.now() : 0);
const mmss = (ms) => {
  const t = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
};

/** "Save within 4:12", then, once the weather is over, a replay in the current one. */
// by and clock (now, ms) on the chain's clock
function SaveClock({ by, clock = Date.now, stale, onReplay }) {
  const [now, setNow] = useState(clock);
  useEffect(() => {
    const t = setInterval(() => setNow(clock()), 1000);
    return () => clearInterval(t);
  }, [clock]);
  const left = by - now;
  if (left > 0 && !stale)
    return (
      <p className={"saveclock" + (left < 60000 ? " saveclock--soon" : "")}>
        Save within <b>{mmss(left)}</b> or replay in the new weather.
      </p>
    );
  return (
    <p className="note note--warn">
      This round's weather is over: it can no longer be saved on-chain.{" "}
      <button className="linkish" onClick={onReplay}>Replay in the current weather</button>
    </p>
  );
}

/** "Trying again in 8 s…": the start is retried on its own every 10 s. */
function Retry({ onRetry }) {
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
function Toast({ text, onDone }) {
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
const depositOf = (saved, bytePrice) => depositBytes(saved !== true) * bytePrice;
const depositText = (saved, bytePrice) =>
  saved === true ? "almost no storage deposit (this hole is saved already)" : `a storage deposit of about ${(depositOf(saved, bytePrice) / 1e6).toFixed(2)} GNOT (a first save on this hole)`;


const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-3)}` : "");
// a player on a board: longer, a row has room
const shortAddr = (a) => `${String(a).slice(0, 8)}…${String(a).slice(-4)}`;

export default function Golf() {
  const canvas = useRef(null);
  const game = useRef(null);
  const cfg = useConfig();

  const [s, setS] = useState(null);
  const hot = useRef(null);
  if (!hot.current) hot.current = makeHot();
  const cold = useRef(null); // the snapshot last given to setS
  const [fatal, setFatal] = useState(null); // { msg, kind }: the game could not start
  const [boot, setBoot] = useState(0); // a retry of the start: a new game
  const [gl, setGl] = useState(null); // null | "lost" | "gone": the WebGL context was taken away
  // title -> pick a gnome -> play; the title shows at once, the hole loads behind it
  const [screen, setScreen] = useState("title");
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
  // the aim mode, kept in this browser: assisted (the whole path) or pro
  const [aim, setAimState] = useState(() => {
    try {
      return localStorage.getItem("gnogolf.aim") === "pro" ? "pro" : "assisted";
    } catch {
      return "assisted";
    }
  });
  // graphics, kept in this browser: auto (by the device), high or low
  const [gfx, setGfxState] = useState(() => {
    try {
      const v = localStorage.getItem("gnogolf.gfx");
      return v === "high" || v === "low" ? v : "auto";
    } catch {
      return "auto";
    }
  });
  const setGfx = (m) => {
    try { localStorage.setItem("gnogolf.gfx", m); } catch {}
    setGfxState(m);
    game.current && game.current.setGfx(m);
  };
  const [askAim, setAskAim] = useState(null); // a mode waiting for the player's yes (a round under way)
  const setAim = (m, sure = false) => {
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
  const [curtain, setCurtain] = useState(null);
  // the page's own timers (the curtain's wait, the demo's, the ?won and ?shot
  // ones): cleared when it goes
  const timers = useRef(new Set());
  const later = (f, ms) => {
    const t = setTimeout(() => (timers.current.delete(t), f()), ms);
    timers.current.add(t);
  };
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const goTo = (id) => {
    const i = s.holes.findIndex((h) => h.id === id);
    setCurtain({ n: holeNumber(s.holes, id), name: s.holes[i] ? s.holes[i].name : "", id });
    later(() => game.current && game.current.load(id), 380);
  };
  const goToRef = useRef(goTo);
  useEffect(() => { goToRef.current = goTo; });
  const [card, setCard] = useState(() => loadCard());
  const [cardOpen, setCardOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => feel());
  const toggle = (k) => { setFeel(k, !prefs[k]); setPrefs(feel()); };
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
    let roll = null;
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
  const holedRef = useRef(() => {});
  const [fresh, setFresh] = useState([]); // gnomes just unlocked, for the banner
  const holesList = (s && s.holes) || NONE;
  const tot = useMemo(() => totals(card, holesList), [card, holesList]);
  const allList = (s && s.allHoles) || NONE;
  const cups = useMemo(() => cupTotals(card, allList), [card, allList]);
  // once earned, a gnome stays earned: a hole registered later must not take
  // it back, and the hole list not being loaded yet must not either
  const had = earned(); // read once a render, not once a gnome
  const unlocked = (id) => {
    const gn = GNOMES.find((x) => x.id === id);
    if (!gn || !gn.unlock) return true;
    if (had.includes(id)) return true;
    return !!(allList.length && UNLOCKS[gn.unlock] && UNLOCKS[gn.unlock].ok(cups));
  };
  // once earned, remembered — outside render, so a render never writes storage
  useEffect(() => {
    if (!allList.length) return;
    for (const gn of GNOMES) if (gn.unlock && UNLOCKS[gn.unlock] && UNLOCKS[gn.unlock].ok(cups)) remember(gn.id);
  }, [allList, cups]);

  // playing for real: who is connected, and where the current round's record is
  const [real, setReal] = useState(false); // the explainer is open
  const [account, setAccount] = useState(null);
  const [wallet, setWallet] = useState({ busy: false, error: null });
  const [record, setRecord] = useState(null); // null | "signing" | { hash, height } | { error }
  const onChain = !!(record && record.hash !== undefined && !record.error); // this round is on the chain

  const play = () => {
    setScreen("play");
    if (!game.current) return;
    game.current.play();
    // after the overview has had its moment and the camera is on the gnome
    if (cfg && cfg.demo) later(() => game.current && game.current.demo(cfg.demo.split(";")), 2600);
  };
  const choose = (id) => {
    setGnome(id);
    // a locked one is only being looked at: it is not saved and not played
    if (!unlockedRef.current(id)) return;
    try { localStorage.setItem("gnogolf.gnome", id); } catch {}
    game.current && game.current.setGnome(id);
  };
  const unlockedRef = useRef(() => true);

  useEffect(() => {
    if (!cfg || !canvas.current) return;

    let g;
    try {
      g = createGame(canvas.current, {
      rpc: cfg.rpc, web: cfg.web, gnome, world: cfg.world, weather: cfg.weather, aimMode: aim, camMode: savedCam(), gfx, hooks: cfg.won > 0,
      // the hot fields to their store; the rest re-renders only when it changed
      // (compared here, not in a setS updater: an updater that returns the
      // same state still re-renders the whole page, 60 times a second in a pull)
      onChange: (snap) => {
        hot.current.set(snap);
        if (!cold.current || !sameCold(cold.current, snap)) setS((cold.current = snap));
      },
      onHoled: ({ id, strokes }) => holedRef.current(id, strokes),
      });
    } catch (err) {
      // no WebGL here (hardware acceleration off, a blocklisted GPU, Lockdown Mode)
      console.error(err);
      setFatal({ msg: String(err.message || err), kind: "webgl" });
      return;
    }
    game.current = g;
    // ?camlog: the game within reach of the camera probe (a test hook)
    if (/[?&]camlog/.test(window.location.search)) window.__g = g;

    // a dev remount destroys this game while it is still starting: it must
    // not then drive the live one
    let cancelled = false;
    g.start(cfg.hole || (cfg.cup ? { cup: cfg.cup, n: cfg.place } : null))
      .then(() => {
        if (cancelled) return;
        if (cfg.play) play();
        else if (cfg.hole || cfg.cup) {
          // a shared link: straight to that hole (a first-time player picks a
          // gnome first); a link to nothing lands on the cups, quietly
          if (!g.linked()) setScreen("worlds");
          else if (cfg.gnome || hadGnome()) play();
          else setScreen("pick");
        }
        // ?won=N shows the win card for N strokes — dev screenshots only
        if (DEV && cfg.won) later(() => g.fakeWin(cfg.won), 400);
        // ?shot=angle,power fires one on load — for screenshots and smoke tests
        if (cfg.shot) {
          const [a, p] = cfg.shot.split(",").map(Number);
          later(() => g.shoot(a, p), 300);
        }
      })
      .catch((err) => !cancelled && setFatal({ msg: String(err.message || err), kind: fatalKind(err) }));

    return () => {
      cancelled = true;
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
    let t = 0;
    const lost = (e) => {
      e.preventDefault(); // tells the browser a restore is wanted
      setGl("lost");
      t = setTimeout(() => setGl((v) => (v === "lost" ? "gone" : v)), 3000);
    };
    const back = () => {
      clearTimeout(t);
      setGl(null);
      const g = game.current;
      if (g && g.current()) g.load(g.current());
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
    if (holeId && game.current && !chainName) within(game.current.chain.chainId()).then((n) => live && setChainName(n)).catch(() => {});
    return () => void (live = false);
  }, [holeId, chainName]);

  // a different account or network in Adena: forget the connection
  // an "add me as a friend" link: the address joins this browser's friends
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("friend");
    if (f && /^g1[0-9a-z]{38}$/.test(f)) {
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
    if (!off()) current().then((a) => a && setAccount(a));
    return onWalletChange(() => !off() && current().then(setAccount));
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
      const chain = game.current.chain;
      setAccount(await connect({ chainId: await within(chain.chainId()), rpc: chain.rpc }));
      setWallet({ busy: false, error: null });
    } catch (err) {
      setWallet({ busy: false, error: String(err.message || err) });
    }
  }

  // the chain's gas price, read once an account is here: the label and the
  // transaction price the round the same way
  // read before the click, so the click opens Adena at once (a browser may
  // block a wallet window opened after long waits); each read gives up at 4 s
  const [gasPrice, setGasPrice] = useState(0.001);
  const [funds, setFunds] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [ourNode, setOurNode] = useState(null); // is Adena's active network this node?
  const [slowSign, setSlowSign] = useState(false); // Adena open for more than 10 s
  const [bytePrice, setBytePrice] = useState(100); // ugnot per stored byte (vm params)
  const [saved, setSaved] = useState(null); // whether this player already has a best on this hole, in this round's mode (null: unknown)
  const saveMode = (s && (s.roundMode || s.mode)) === "pro" ? "pro" : "assisted";
  useEffect(() => {
    setSaved(null);
    if (!account || !holeId || !game.current) return;
    let live = true;
    within(game.current.chain.bests(holeId, saveMode, [account.address]))
      .then((b) => live && setSaved(!!(b && b.rows && b.rows.length)))
      .catch(() => {});
    return () => void (live = false);
  }, [account, holeId, saveMode, holedNow]);
  useEffect(() => {
    if (record !== "signing") return setSlowSign(false);
    const t = setTimeout(() => setSlowSign(true), 10000);
    return () => clearTimeout(t);
  }, [record]);
  useEffect(() => {
    if (!account || !game.current) return;
    // what lands after the account changed (or the page went) is dropped
    let live = true;
    const land = (f) => (v) => live && f(v);
    const c = game.current.chain;
    within(c.gasPrice()).then(land(setGasPrice)).catch(() => {});
    within(c.chainId()).then(land(setChainId)).catch(() => {});
    within(c.balance(account.address)).then(land(setFunds)).catch(() => live && setFunds(null));
    onOurNode(c.rpc).then(land(setOurNode));
    within(c.storagePrice()).then(land(setBytePrice)).catch(() => {});
    // re-read when a hole is won: the card is about to offer the record
    return () => void (live = false);
  }, [account, holedNow]);
  // a hole won: the chain's clock read again (at most once a minute), for the
  // save's countdown, and the gas price for the gnokey fallback (no Adena)
  useEffect(() => {
    if (!holedNow || !game.current) return;
    const c = game.current.chain;
    c.sync().catch(() => {});
    within(c.gasPrice()).then(setGasPrice).catch(() => {});
  }, [holedNow]);

  async function recordIt() {
    if (!account) return setReal(true);
    const round = `${s.id}#${s.shots.join(";")}`;
    const land = (r) => roundKey.current === round && setRecord(r);
    // a round whose weather is over can no longer be saved: the chain would refuse it
    if (s.period != null && game.current.chain.now() >= saveBy(s.period)) return land({ error: "This round's weather is over, so the chain can no longer save it. Play the hole again in the current weather.", stale: true });
    setRecord("signing");
    try {
      const chain = game.current.chain;
      const id = chainId || (await within(chain.chainId()));
      // asked before Adena opens: how many transactions the round needs, or
      // why the chain would refuse it
      const parts = await splitRound(s.shots, (list) => within(chain.simulateRound(s.id, list, s.period), 8000), s);
      let tx = null;
      for (let k = 0; k < parts.length; k++) {
        const [from, to] = parts[k];
        if (parts.length > 1) land({ signing: true, part: k + 1, of: parts.length });
        tx = await recordRound({
          address: account.address, realm: chain.realm, hole: s.id, shots: s.shots.slice(from, to), reset: k === 0,
          gas: gasOf(s, from, to), period: s.period, mode: s.roundMode || "assisted", price: gasPrice, chainId: id, rpc: chain.rpc,
        }).catch((err) => {
          if (k > 0) err.message = `Part ${k} of ${parts.length} is on-chain, part ${k + 1} was not sent (${err.message}). Save again to send the whole round.`, (err.cancelled = false);
          throw err;
        });
        // the next part continues the round: it waits until the chain has this one
        if (k + 1 < parts.length) {
          for (let w = 0; w < 10; w++) {
            const r = await chain.round(s.id, account.address).catch(() => null);
            if (r && r.strokes >= to) break;
            await new Promise((ok) => setTimeout(ok, 1000));
          }
        }
      }
      within(chain.balance(account.address)).then(setFunds).catch(() => {});
      // signed is not recorded: read the round back and say what the chain has
      // the block may land a moment after Adena answers: read back for up to 8 s
      let mine = null;
      for (let k = 0; k < 8; k++) {
        mine = await chain.round(s.id, account.address).catch(() => null);
        if (mine && mine.done && mine.strokes === s.strokes) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (mine && mine.done && mine.strokes === s.strokes) land({ ...(tx || {}), hash: (tx && tx.hash) || "", parts: parts.length }), setSaved(true);
      else
        land({
          error: mine
            ? `The chain replayed your shots and got a different round: ${mine.strokes} strokes, ${mine.done ? "holed" : "not holed"}. This hole changes between shots, so a replay can differ from what you saw.`
            : "The transaction went through, but the chain has no round for you on this hole.",
        });
    } catch (err) {
      land(err.cancelled ? null : { error: String(err.message || err), stale: /weather .* is over|is not the current weather/.test(String(err.message)) });
    }
  }

  useEffect(() => {
    const onKey = (e) => {
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
  const lastScreen = useRef(null);
  useEffect(() => {
    if (!cfg) return;
    const keep = new URLSearchParams(window.location.search);
    const q = new URLSearchParams();
    for (const k of ["rpc", "web"]) if (keep.get(k)) q.set(k, keep.get(k));
    if (screen === "play" && idHere) {
      // a cup's hole by its place; one in no cup (community, archived) by its id
      if (place) (q.set("cup", world || "garden"), q.set("hole", String(place)));
      else q.set("hole", idHere);
      q.set("gnome", gnome);
    } else if (screen === "worlds" && world) q.set("cup", world);
    else if (screen === "pick" && world) (q.set("cup", world), q.set("gnome", gnome));
    else if (screen === "play") return; // the hole is not known yet: wait for it
    const url = window.location.pathname + (String(q) ? `?${q}` : "");
    const here = window.location.pathname + window.location.search;
    const moved = lastScreen.current !== null && lastScreen.current !== screen;
    lastScreen.current = screen;
    if (url === here) return;
    if (moved) window.history.pushState({ screen }, "", url);
    else window.history.replaceState({ screen }, "", url);
  }, [cfg, screen, place, world, gnome, idHere]);
  // Back and Forward: back to that screen, and that hole, without reloading the scene
  // (subscribed once: the latest goTo is read through its ref)
  useEffect(() => {
    const onPop = (e) => {
      const p = new URLSearchParams(window.location.search);
      const sc = (e.state && e.state.screen) || (p.get("hole") ? "play" : p.get("cup") ? "worlds" : "title");
      lastScreen.current = sc; // arriving here is not a new step
      setMenu(false);
      setScreen(sc);
      if (sc === "play" && game.current) {
        const cup = p.get("cup"), hv = p.get("hole") || "";
        const h = game.current.find && game.current.find(/^gno\.land\//.test(hv) ? { id: hv } : { cup, n: Number(hv) });
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
  holedRef.current = (id, strokes) => {
    const list = (s && s.allHoles) || [];
    const before = cupTotals(loadCard(), list);
    const next = recordScore(id, strokes);
    const after = cupTotals(next, list);
    setCard(next);
    setFresh(GNOMES.filter((gn) => gn.unlock && UNLOCKS[gn.unlock] && !UNLOCKS[gn.unlock].ok(before) && UNLOCKS[gn.unlock].ok(after)));
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

      {screen === "title" && <Title loading={!s} world={s && s.world} onStart={() => setScreen("worlds")} />}
      {screen === "worlds" && s && (
        <Worlds
          counts={s.worlds}
          stats={cups}
          onResetAll={() => setCard(clearCard())}
          onReset={(w) => setCard(clearCup(allList.filter((h) => cupOf(h) === w).map((h) => h.id)))}
          current={s.world}
          onBack={() => setScreen("title")}
          community={s.community}
          onCommunity={(id) => {
            game.current && game.current.load(id);
            setScreen("pick");
          }}
          onPick={(w) => {
            game.current && game.current.setWorld(w);
            setScreen("pick"); // then the gnome, the last one played already picked
          }}
        />
      )}
      {screen === "pick" && <Picker aim={aim} onAim={setAim} gnome={gnome} onChange={choose} onPick={play} unlocked={unlocked} onBack={() => {
        sound("blip");
        // leaving on a locked gnome: back to the one really chosen
        if (!unlocked(gnome)) { let saved = null; try { saved = localStorage.getItem("gnogolf.gnome"); } catch {} setGnome(saved && unlocked(saved) ? saved : "classic"); }
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
              {(s.roundMode || s.mode) === "pro" && <span className="pro-chip" title="Pro: no aim line">PRO</span>}
            </div>
            <LiveWeather hot={hot.current} w={wx} until={s.period != null ? (s.period + 1) * PERIOD_MS - skewOf(game.current && game.current.chain) : null} />
            <div className="hud__right">
              <span className="adena__wrap">
              <button
                className={"adena" + (account ? " adena--on" : "")}
                onClick={() => setReal(true)}
                aria-label={account ? `Saving on-chain as ${account.address}` : "Save on-chain with Adena"}
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
                  <SheetClose onClose={() => setMenu(false)} inline />
                </div>
                <section className="drawer__me">
                  <div className="me__stats">
                    <div><strong>{tot.done}/{s.holes.length}</strong><span>holes</span></div>
                    <div><strong>{tot.strokes || "–"}</strong><span>strokes</span></div>
                    <div>
                      <strong>{tot.done ? (tot.strokes - tot.par > 0 ? "+" : "") + (tot.strokes - tot.par) : "–"}</strong>
                      <span>vs par</span>
                    </div>
                  </div>
                  <div className="me__row">
                    <Button variant="primary" onClick={() => { setMenu(false); setCardOpen(true); }}>The cup</Button>
                    <Button variant="secondary" onClick={() => { setMenu(false); setScreen("pick"); }}>Change gnome</Button>
                    <Button variant="secondary" onClick={() => { setMenu(false); setScreen("title"); }}>Main menu</Button>
                    {account && <Button variant="secondary" className="drawer__off" onClick={() => { setMenu(false); disconnectWallet(); }}>Disconnect Adena</Button>}
                  </div>
                </section>
                <section className="drawer__settings" aria-label="Settings">
                  <span className="eyebrow">Settings</span>
                  <AimSetting aim={aim} onChange={setAim} />
                  <div className="aimset">
                    <span className="aimset__label">Graphics</span>
                    <Segmented label="Graphics" value={gfx} full options={[["auto", "Auto"], ["high", "High"], ["low", "Low"]]} onChange={(m) => (sound("blip"), setGfx(m))} />
                    <small className="aimset__help">{gfx === "auto" ? `Set by this device · ${s.tier === "low" ? "low" : "high"} now` : gfx === "low" ? "Lighter: fewer pixels and effects" : "The full look"}</small>
                  </div>
                  {[["sound", "Sound"], ["vibe", "Vibration"]].map(([k, label]) => (
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
                        {card[h.id] ? <b>{card[h.id]}</b> : "–"} / par {parOf(h)}
                      </span>
                    </button>
                  ))}
                </nav>
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

          <Button variant="chip" className="lbchip" badge={SOON ? "Coming soon" : null} onClick={() => (sound("blip"), setBoard(true))} aria-label="Leaderboard">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 4h10v4a5 5 0 0 1-10 0zM7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 13v4M8 20h8M9 17h6" /></svg>
            <span>Leaderboard</span>
          </Button>
          <footer className="hud hud--bottom">
            <Button onClick={() => game.current.reset()}>Restart</Button>
            <Button
              className="cam-btn"
              aria-label={`Camera: ${CAMS[s.cam] || "Classic"} — click to change`}
              title={`Camera: ${CAMS[s.cam] || "Classic"} — click to change`}
              onClick={() => {
                const next = CAM_ORDER[(CAM_ORDER.indexOf(s.cam || "classic") + 1) % CAM_ORDER.length];
                try { sessionStorage.setItem(CAM_KEY, next); } catch {}
                sound("blip");
                game.current.setCam(next);
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
            <span className="eyebrow">{s.name}</span>
            <h2>{s.strokes === 1 ? "Hole in one!" : "In the hole!"}</h2>
            {/* the score, and beside it the ways to tell people about it */}
            <div className="win__head">
              <div className="win__score">
                <strong>{s.strokes}</strong>
                <span>stroke{s.strokes > 1 ? "s" : ""}</span>
              </div>
            <Share
              link={s ? holeLink(s, gnome) : ""}
                snapshot={() => game.current && game.current.snapshot(`${s.name} · ${s.strokes} stroke${s.strokes > 1 ? "s" : ""}`)}
                text={shareText({ s, card, cups, fresh })}
              />
            </div>


            <p>
              {onChain
                ? "Saved on-chain: public, on your address, on any device."
                : s.official
                  ? "Saved in this browser only. Save it on-chain to make it public and ranked."
                  : "Saved in this browser only. A community hole is not ranked, but its rounds can be saved on-chain."}
            </p>
            <Standings s={s} card={card} chain={game.current && game.current.chain} me={account && account.address} mode={s.roundMode || aim} />
            {fresh.length > 0 && (
              <p className="note note--good">
                New gnome unlocked: <b>{fresh.map((gn) => gn.name).join(", ")}</b> — pick it from the menu.
              </p>
            )}
            <RecordState record={record} account={account} s={s} chain={game.current && game.current.chain} />
            {account && (ourNode === false || slowSign) && (() => {
              const rpc = (game.current && game.current.chain.rpc) || "";
              const host = rpc.replace(/^https?:\/\//, "");
              return (
                <p className="note note--warn">
                  {ourNode === false
                    ? `Adena is on another node than this game (${host}), so it cannot work out the fee.`
                    : "Adena is still working out the fee."}{" "}
                  In Adena, open the network list and pick the one whose RPC is <b>{host}</b>
{chainId ? <> (chain id <b>{chainId}</b>)</> : null}.
                </p>
              );
            })()}
            {!onChain && s.period != null && (
              <SaveClock by={saveBy(s.period)} clock={game.current ? game.current.chain.now : undefined} stale={record && record.stale} onReplay={() => game.current.reset()} />
            )}
            {account && !onChain && (() => {
              // said before signing, not by refusing to: Adena still opens
              const short = shortOf(gasOf(s), gasPrice, depositOf(saved, bytePrice), funds);
              if (!short) return null;
              return (
                <p className="note note--warn">
                  {funds === 0 ? "Your Adena account has no GNOT on this chain yet" : `Your account holds ${(funds / 1e6).toFixed(3)} GNOT, about ${short.toFixed(3)} short`} — it needs some to pay the gas and the storage deposit.
                  {/localhost|127\.0\.0\.1/.test((game.current && game.current.chain.rpc) || "") ? " On this local chain, fund it from the node's test account (gnokey send, or the dev faucet)." : " On a testnet, the faucet gives some for free."}
                </p>
              );
            })()}
            <div className="banner__row">
              <Button variant="secondary" onClick={() => game.current.reset()}>
                Play again
              </Button>
              {!onChain && (
                <Button variant="chain" disabled={record === "signing" || !!(record && record.signing) || !!(record && record.stale)} onClick={recordIt}>
                  <svg className="btn__mark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="2.5" y="8" width="11" height="8" rx="4" transform="rotate(-35 8 12)" /><rect x="10.5" y="8" width="11" height="8" rx="4" transform="rotate(-35 16 12)" /></g></svg>
                  {record === "signing" ? "Waiting for Adena…" : record && record.signing ? `Adena: part ${record.part} of ${record.of}…` : "Save on-chain"}
                </Button>
              )}
              <button
                className="btn btn--main"
                onClick={() => {
                  const i = s.holes.findIndex((h) => h.id === s.id);
                  goTo(s.holes[(i + 1) % s.holes.length].id);
                }}
              >
                Next hole →
              </button>
            </div>
            {account && !onChain && (
              <p className="real__fine">
                About {costOf(gasOf(s), gasPrice)} GNOT of gas + {depositText(saved, bytePrice)}, shown again in Adena before you sign.
              </p>
            )}
            {!onChain && !(record && record.stale) && <Gnokey s={s} chain={game.current && game.current.chain} price={gasPrice} chainId={chainId || chainName} />}
          </Dialog>
        </div>
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
        <Boards web={(game.current && game.current.chain.web) || ""} mode={aim} s={s} chain={game.current && game.current.chain} me={account && account.address} onClose={() => setBoard(false)} goTo={(id) => (setBoard(false), goTo(id))} />
      )}

      {cardOpen && s && (
        <Sheet className="cardsheet" label="Scorecard" onClose={() => setCardOpen(false)}>
            <span className="eyebrow">Gnogolf · the cup and its card</span>
            <h2>The cup</h2>
            <Standings s={s} card={card} chain={game.current && game.current.chain} me={account && account.address} mode={aim} />
            <Scorecard holes={s.holes} card={card} current={s.id} world={s.world} />
            <Leaderboard chain={game.current && game.current.chain} me={account && account.address} mode={aim} />
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
            <p className="curtain__chore">{((c) => c[curtain.n % c.length])(choresOf((s && s.world) || "garden"))}</p>
          </div>
        </div>
      )}

      {real && (
        <RealPlay
          account={account}
          wallet={wallet}
          onConnect={connectWallet}
          onClose={() => setReal(false)}
          rpc={cfg && cfg.rpc}
          chainName={chainName}
          cost={s && s.holed ? `about ${costOf(gasOf(s), gasPrice)} GNOT of gas + ${depositText(saved, bytePrice)} for this round` : null}
        />
      )}

      {playing && s && s.note && !s.flying && <div className="toast" role="status">{s.note}</div>}
      {playing && linkNote && <Toast text={linkNote} onDone={() => setLinkNote(null)} />}
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
        const kind = fatal ? fatal.kind : s.errorKind || "shot";
        const holeNow = s && s.id;
        const TEXT = {
          down: ["The course is not reachable right now", "The chain the game plays on did not answer. It may be restarting."],
          webgl: ["Your browser can't draw 3D here", "Turn on hardware acceleration in the browser's settings, then reload. The course is also playable as text on gno.land."],
          empty: ["No hole on this chain yet", "The chain answered, but no hole is registered on it. Try again once the course is deployed."],
          bug: ["Something went wrong", "The game hit an error in this browser. Reloading the page usually fixes it."],
          load: ["That hole did not load", "The chain did not send this hole. Try again, or pick another one from the menu."],
          draw: ["That hole could not be drawn", "Something broke on our side while building it. Pick another hole from the menu — your scores are safe."],
          limit: ["That is the most strokes a round holds", "Restart the hole to play it again."],
          shot: ["That shot did not go through", "The chain could not play that shot. Nothing was lost; you can shoot again."],
        }[kind];
        const g = game.current;
        return (
          <div className="banner" role="alertdialog" aria-labelledby="banner-title">
            <Dialog className="banner__in">
              <h2 id="banner-title">{TEXT[0]}</h2>
              <p>{TEXT[1]}</p>
              {fatal && (kind === "down" || kind === "empty") && <Retry onRetry={() => (setFatal(null), setBoot((b) => b + 1))} />}
              {kind === "webgl" && cfg && (
                <p><a href={`${cfg.web}/r/gnogolf/golf`} target="_blank" rel="noopener noreferrer">Play it as text on gno.land ↗</a></p>
              )}
              {kind !== "limit" && (
                <details className="details">
                  <summary>Technical details</summary>
                  <div className="details__box">
                    <p className="mono">{fatal ? fatal.msg : s.error}</p>
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
                  <Button variant="primary" onClick={() => { g.clearError(); g.load(holeNow); }}>Try again</Button>
                ) : kind === "draw" ? (
                  <Button variant="primary" onClick={() => { g.clearError(); setMenu(true); }}>Pick a hole</Button>
                ) : kind === "limit" ? (
                  <Button variant="primary" onClick={() => { g.clearError(); g.reset(); }}>Restart the hole</Button>
                ) : (
                  <Button variant="primary" onClick={() => g.clearError()}>Keep playing</Button>
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

function RecordState({ record, account, s, chain }) {
  if (!record || record === "signing" || record.signing) {
    return record && record.signing ? <p className="note">This round is saved in {record.of} transactions: one shot list is more than one transaction can replay here. Adena asks {record.of} times.</p> : null;
  }
  if (record.error) return record.stale ? null : <p className="note note--bad">{record.error}</p>;
  return (
    <p className="note note--good">
      Recorded{record.height ? ` in block ${record.height}` : ""}.{" "}
      {chain && account && (
        <a href={chain.roundURL(s.id, account.address)} target="_blank" rel="noopener noreferrer">
          See your round on gno.land ↗
        </a>
      )}
    </p>
  );
}

/**
 * The one screen that explains the difference between playing and recording.
 * It says what you get, what it costs, and does the connecting — nothing else
 * asks for a wallet, and nothing here is needed to keep playing free.
 */
function RealPlay({ account, wallet, onConnect, onClose, rpc, chainName, cost }) {
  const installed = hasAdena();
  return (
    <Sheet className="real" label="Save your rounds on-chain" onClose={onClose}>
        <span className="eyebrow">Adena wallet</span>
        <h2>Save your rounds on-chain</h2>
        <p className="real__lead">
          Free play and saved rounds are the same game on the same chain. The
          only difference is where your round is kept.
        </p>

        <div className="real__cols">
          <div className="real__col">
            <h3>Free play</h3>
            <ul>
              <li>Every shot computed by the contract</li>
              <li>No account, no wallet, no cost</li>
              <li>Your card is kept in this browser only</li>
            </ul>
          </div>
          <div className="real__col real__col--on">
            <h3>Your records on-chain</h3>
            <ul>
              <li>Public, on your address, on any device</li>
              <li>Your marks stay on the course for the players after you</li>
              <li>Best rounds go on the hole's board</li>
            </ul>
          </div>
        </div>

        <ol className="real__steps">
          <li className={installed ? "done" : ""}>
            <b>Get Adena</b>
            <span>The gno.land wallet, a browser extension.</span>
          </li>
          <li className={account ? "done" : ""}>
            <b>Connect it</b>
            <span>Gnogolf sees your address. It cannot move funds without your signature in Adena.</span>
          </li>
          <li>
            <b>Hole out, then sign</b>
            <span>
              One transaction replays your shots on the chain (a long round on a busy
              hole takes two). You pay its gas, roughly 0.1 to 0.7 GNOT depending on
              the hole, and a storage deposit, about 0.9 GNOT the first time you save a
              hole and almost nothing after. Both are shown before you sign. The chain
              re-runs every shot itself, so the score is the chain's own, not one you
              type in.
            </span>
            {cost && <span className="real__cost">This round: {cost}.</span>}
          </li>
        </ol>

        {wallet.error && <p className="note note--bad">{wallet.error}</p>}
        {wallet.note && !account && <p className="note">{wallet.note}</p>}

        {!installed ? (
          <>
            <a className="btn btn--main btn--wide" href={ADENA_URL} target="_blank" rel="noopener noreferrer">
              Install Adena ↗
            </a>
            <p className="real__fine">
              Installed it? <button className="linkish" onClick={() => window.location.reload()}>Reload this page</button> so the game can see it.
            </p>
          </>
        ) : account ? (
          <Button variant="primary" className="btn--wide" onClick={onClose}>
            Connected as {short(account.address)} — keep playing
          </Button>
        ) : (
          <Button variant="primary" className="btn--wide" disabled={wallet.busy} onClick={onConnect}>
            {wallet.busy ? "Check Adena…" : "Connect Adena"}
          </Button>
        )}
        <p className="real__fine">
          Network: <span className="mono">{chainName}</span>
          {/* the public faucet only feeds public testnets: a node on this machine has none */}
          {chainName && !/localhost|127\.0\.0\.1|\[::1\]/.test(rpc || "") && (
            <> · Needs a little GNOT: <a href="https://faucet.gno.land" target="_blank" rel="noopener noreferrer">Get test GNOT ↗</a></>
          )}
        </p>
    </Sheet>
  );
}

// the camera modes, in the order the button goes through them. A page always
// opens in Classic; a mode picked since is kept for this tab's session only.
const CAM_ORDER = ["classic", "third", "far"];
const CAMS = { classic: "Classic", far: "Far", third: "Third person" };
const CAM_KEY = "gnogolf.cam.session";
function savedCam() {
  try {
    localStorage.removeItem("gnogolf.cam"); // the old, lasting choice: forgotten
    const c = sessionStorage.getItem(CAM_KEY);
    return CAM_ORDER.includes(c) ? c : "classic";
  } catch {
    return "classic";
  }
}

/** Whether this player ever picked a gnome (a first visit has not). */
function hadGnome() {
  try {
    return !!localStorage.getItem("gnogolf.gnome");
  } catch {
    return false;
  }
}

/** The address of this hole, to put in the bar and in shared links. */
function holeLink(s, gnome) {
  const q = new URLSearchParams();
  const keep = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  // a page pointed at another chain keeps pointing there
  for (const k of ["rpc", "web"]) if (keep.get(k)) q.set(k, keep.get(k));
  // a hole in no cup (community, archived) is linked by its id, never as place 1
  if (s.place) (q.set("cup", s.world || "garden"), q.set("hole", String(s.place)));
  else q.set("hole", s.id);
  if (gnome) q.set("gnome", gnome);
  return `?${q}`;
}

function savedGnome() {
  try {
    const id = localStorage.getItem("gnogolf.gnome");
    const gn = GNOMES.find((x) => x.id === id);
    if (!gn || (gn.unlock && !earned().includes(id))) return GNOMES[0].id;
    return id;
  } catch {
    return GNOMES[0].id;
  }
}

function Picker({ gnome, onChange, onPick, unlocked, onBack, aim, onAim }) {
  const canvas = useRef(null);
  const preview = useRef(null);
  const i = Math.max(0, GNOMES.findIndex((g) => g.id === gnome));
  const skin = GNOMES[i];

  useEffect(() => {
    // a canvas of its own each time: a WebGL context that was released cannot
    // be taken again from the same element (React mounts twice in dev)
    const el = document.createElement("canvas");
    // its size only: the locked look is the wrapper's filter, and a copied
    // "--locked" class stayed on this canvas for good (every gnome went dark)
    el.className = "pick__canvas";
    canvas.current.appendChild(el);
    preview.current = makePreview(el);
    const onResize = () => preview.current.resize();
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      preview.current.destroy();
      el.remove();
    };
  }, []);
  useEffect(() => {
    preview.current && preview.current.show(skin);
  }, [skin]);

  const step = (d) => (sound("blip"), onChange(GNOMES[(i + d + GNOMES.length) % GNOMES.length].id));

  return (
    <div className="screen">
      <button className="round round--small round--back screen__back" aria-label="Back to the cups" onClick={onBack}>
        <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M12.5 4 6.5 10l6 6" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </button>
      <div className="screen__frame" />
      <div className="pick">
        <span className="eyebrow">Pick your gnome</span>
        <h2 className="pick__name">{skin.name}</h2>
        <div className="pick__stage">
          <button className="round" aria-label="Previous gnome" onClick={() => step(-1)}>‹</button>
          <div ref={canvas} className={"pick__canvas" + (unlocked(skin.id) ? "" : " pick__canvas--locked")} />
          <button className="round" aria-label="Next gnome" onClick={() => step(1)}>›</button>
        </div>
        <p className="pick__line">
          {unlocked(skin.id) ? skin.line : <>🔒 {(UNLOCKS[skin.unlock] || { need: "Keep playing" }).need}</>}
        </p>
        <div className="pick__dots">
          {GNOMES.map((g) => (
            <span key={g.id} aria-current={g.id === skin.id} />
          ))}
        </div>
        <AimSetting aim={aim} onChange={onAim} compact />
        <Button variant="primary" className="btn--play" onClick={() => (sound("start"), onPick())} disabled={!unlocked(skin.id)}>
          {unlocked(skin.id) ? "Choose this gnome" : "Locked"}
        </Button>
      </div>
    </div>
  );
}

/** Assisted or Pro aim, with what it means — and what the chain can't check. */
function AimSetting({ aim, onChange, compact = false }) {
  return (
    <div className={"aimset" + (compact ? " aimset--compact" : "")}>
      <span className="aimset__label">Aim</span>
      <Segmented label="Aim" value={aim} full={!compact} options={[["assisted", "Assisted"], ["pro", "Pro"]]} onChange={(m) => (sound("blip"), onChange(m))} />
      <small className="aimset__help">
        {aim === "pro" ? "No aim line · ranked apart" : "Full aim line"}
        {aim === "pro" && (
          <span className="aimset__info" tabIndex={0} title="The mode is on your word — the chain can't see your screen." aria-label="The mode is on your word — the chain can't see your screen.">
            ⓘ
          </span>
        )}
      </small>
    </div>
  );
}

/** The number a hole shows: the digits of its path when it has some (hole7),
 *  its place in the menu otherwise — a user's hole has no number of its own. */
// A hole's number is its place in its world's course, as the chain orders it
// — not the number in its realm's name (hole19 is the 17th of the garden).
function holeNumber(holes, id) {
  const i = holes.findIndex((h) => h.id === id);
  // a hole in no cup (community, archived) has no number: never "1"
  return i >= 0 ? String(i + 1) : "–";
}

/**
 * An ink stamp on the card, slightly askew like one pressed by hand: a gnome
 * with a crown for a hole-in-one, a winking gnome under par, a thumbs-up
 * mushroom at par.
 */
function Stamp({ kind, seed = 0, world = "garden" }) {
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

/**
 * What a player says when they share: short, a little cheeky, gnome and
 * gno.land flavoured (the realm replays every shot; the score is on the
 * chain). One line is picked per moment, from the hole so it varies.
 */
function shareText({ s, card, cups, fresh }) {
  const t = totals(card, s.holes), cup = (WORLDS.find((w) => w.id === s.world) || WORLDS[0]).name;
  const d = t.strokes - t.par, vs = d === 0 ? "level par" : `${d > 0 ? "+" : ""}${d}`;
  const pick = (list) => list[[...String(s.id || "")].reduce((a, c) => a + c.charCodeAt(0), s.strokes) % list.length];
  const tag = " #gnoland @_gnoland";
  if (cups.slam) return "👑 Grand slam on Gnogolf: every cup at par or under. The Gnome King bows." + tag;
  if (t.all) return pick([
    `🏆 ${cup} done on Gnogolf, ${vs}. Every putt computed on gno.land.`,
    `⛳ ${t.strokes} strokes round the whole ${cup} (${vs}). My gnome is tired, the chain is not.`,
  ]) + tag;
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

/** The par of the hole being played. */
const parHere = (s) => parOf(s.holes.find((h) => h.id === s.id) || (s.allHoles || []).find((h) => h.id === s.id));

/** The card: hole, par and your score, ten holes to a row, with the totals. */
function Scorecard({ holes, card, current, compact = false, world = "garden" }) {
  // two halves of the same width (front nine, back nine), so every column of
  // the second row sits under one of the first; a short last row is padded
  const per = Math.ceil(holes.length / 2) || 1, rows = [];
  for (let i = 0; i < holes.length; i += per) rows.push(holes.slice(i, i + per));
  const pad = (row) => Array.from({ length: per - row.length }, (_, k) => <td key={"pad" + k} className="pad" />);
  const t = totals(card, holes);
  return (
    <div className={"card" + (compact ? " card--compact" : "") + " scorecard"}>
      {rows.map((row, r) => (
        <table key={r}>
          <tbody>
            <tr><th>Hole</th>{row.map((h, i) => <td key={h.id} className={h.id === current ? "cur" : ""}><span>{r * per + i + 1}</span></td>)}{pad(row)}</tr>
            <tr><th>Par</th>{row.map((h) => <td key={h.id}>{parOf(h)}</td>)}{pad(row)}</tr>
            <tr>
              <th>Score</th>
              {row.map((h) => {
                const sc = card[h.id];
                const par = parOf(h);
                const kind = !sc ? "" : sc === 1 ? "ace" : sc < par ? "under" : sc === par ? "par" : "over";
                return (
                  <td key={h.id} className={kind}>
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
      </div>
    </div>
  );
}

/**
 * The cup as a grand prix: its emblem, the 18 holes as a track — medals on
 * the ones played, the hole being played marked, the rest to come — the
 * running total against par, where you stand on the chain's board if you
 * recorded, and what comes next.
 */
// The chain's leaderboard, read once for the sheets that show it at the same
// time (Standings and Leaderboard): the same answer for 5 s.
let board = {};
const leaderboardOf = (chain, mode = "assisted") => {
  const b = board[mode];
  if (!b || Date.now() - b.at > 5000) board[mode] = { at: Date.now(), p: chain.leaderboard(mode) };
  return board[mode].p;
};

// Beyond the top ten, the rank is counted from the paged Players read: every
// standing that beats this player's (more holes, then fewer strokes, then the
// address, as the chain's rank key orders them). Players lists everyone, named
// or not, so it is the rank among all who saved. RANK_PAGES pages at most.
// Note: O(players) reads, a Rank(mode, addr) read on the chain when the course is crowded
const RANK_PAGES = 5;
async function rankBeyond(chain, mode, me) {
  let after = "", mine = null, ahead = 0;
  const rows = [];
  for (let k = 0; k < RANK_PAGES; k++) {
    const pg = await chain.players(mode, after, 100);
    for (const r of pg.rows || []) {
      rows.push(r);
      if (r.player === me) mine = r;
    }
    after = pg.next || "";
    if (!after) break;
  }
  if (after && !mine) return { past: 10 }; // too many to count here
  if (!mine || !(mine.holes > 0)) return null; // nothing saved on the course
  for (const r of rows) if (r.holes > mine.holes || (r.holes === mine.holes && (r.strokes < mine.strokes || (r.strokes === mine.strokes && r.player < me)))) ahead++;
  // a page cap reached: the rest may hold players ahead too
  return after ? { past: 10 } : { at: ahead + 1 };
}

function Standings({ s, card, chain, me, mode = "assisted" }) {
  const [rank, setRank] = useState(null);
  useEffect(() => {
    if (!chain || !me) return;
    let live = true; // no state set once the card is gone
    leaderboardOf(chain, mode).then(async (lb) => {
      const i = lb.rows.findIndex((r) => r.player === me);
      if (i >= 0) return live && setRank({ at: i + 1, top: true });
      live && setRank(await rankBeyond(chain, mode, me));
    }).catch(() => {});
    return () => (live = false);
  }, [chain, me, mode]);
  const cup = WORLDS.find((w) => w.id === s.world) || WORLDS[0];
  const t = totals(card, s.holes);
  const vs = t.strokes - t.par;
  const at = s.holes.findIndex((h) => h.id === s.id);
  const next = s.holes.find((h, i) => i > at && !card[h.id]) || s.holes.find((h) => !card[h.id]);
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
          <div><dt>Vs par</dt><dd className={vs < 0 ? "good" : vs > 0 ? "bad" : ""}>{t.done ? (vs > 0 ? "+" : "") + vs : "–"}</dd></div>
          <div><dt>On-chain</dt><dd title={rank && !rank.top && rank.at ? "Among every player who saved on the course, named or not" : undefined}>{!rank ? "–" : rank.at ? `#${rank.at}` : `not in the top ${rank.past}`}</dd></div>
        </dl>
      </header>
      <ol className="cup__track">
        {s.holes.map((h, i) => {
          const sc = card[h.id], medal = medalOf(sc, parOf(h));
          return (
            <li
              key={h.id}
              className={"cup__hole" + (h.id === s.id ? " cup__hole--now" : "") + (sc ? " cup__hole--done" : "") + (medal ? ` cup__hole--${medal}` : "")}
              title={`${i + 1}. ${h.name}${sc ? ` — ${sc} (par ${parOf(h)})` : ""}`}
            >
              {sc ? (
                <>
                  <b aria-label={`hole ${i + 1}: ${sc} stroke${sc > 1 ? "s" : ""}`}>{sc}</b>
                  {medal && <Stamp kind={medal === "gold" ? "ace" : medal === "silver" ? "under" : "par"} seed={i} world={s.world} />}
                </>
              ) : (
                <span>{i + 1}</span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="cup__next">
        {t.all
          ? t.strokes <= t.par ? (cupHasGnome(s.world) ? "Cup finished at par or under — a gnome is waiting in the picker." : "Cup finished at par or under!") : "Cup finished. Now beat par."
          : next && <>Next up: <b>{next.name}</b></>}
      </p>
    </section>
  );
}

// Leaderboards are shown as "coming soon" until launch: false here, and the
// badge and ribbon are gone
const SOON = true;

/** Until launch, an empty leaderboard says when it opens. */
const ComingSoon = () => (
  <div className="soon">
    <span className="soon__badge">Coming soon</span>
    <p>Leaderboards open at launch: record your rounds with Adena to take your place.</p>
  </div>
);

// Players another script flags as likely bots (public/flags.json: { flags:
// { addr: { score, reasons } } }), read once a session when a board opens.
// Missing or broken: nobody is hidden.
let flagsOnce = null;
const flagsOf = () =>
  (flagsOnce ||= fetch("flags.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : {}))
    .then((j) => (j && typeof j.flags === "object" && j.flags) || {})
    .catch(() => ({})));
const HIDE_AT = 0.5; // the checker's own self-test bot scores 0.61, a strong human up to 0.35
function useFlags() {
  const [f, setF] = useState({});
  useEffect(() => {
    let live = true;
    flagsOf().then((x) => live && setF(x));
    return () => (live = false);
  }, []);
  return f;
}
/** Rows with the flagged ones taken out unless shown; the count taken out. */
const screen_ = (rows, flags, all) => {
  const out = all ? rows : rows.filter((r) => !(flags[r.player] && flags[r.player].score >= HIDE_AT));
  return { rows: out, hidden: rows.length - out.length };
};
const FlagMark = ({ f }) =>
  f && f.score >= HIDE_AT ? (
    <em className="flag-mark" tabIndex={0} title={`Possibly automated: ${(f.reasons || []).join(", ") || "flagged"}`} aria-label={`Possibly automated: ${(f.reasons || []).join(", ")}`}>?</em>
  ) : null;

// Friends: addresses (or gno.land names, resolved once) kept in this browser.
const FRIENDS = "gnogolf.friends";
export const loadFriends = () => {
  try {
    const f = JSON.parse(localStorage.getItem(FRIENDS) || "[]");
    return Array.isArray(f) ? f.filter((x) => x && /^g1[0-9a-z]{38}$/.test(x.addr)) : [];
  } catch {
    return [];
  }
};
export const saveFriends = (f) => {
  try {
    localStorage.setItem(FRIENDS, JSON.stringify(f.slice(0, 49)));
  } catch {}
  return f;
};
export function addFriend(addr, name = "") {
  const f = loadFriends();
  if (!/^g1[0-9a-z]{38}$/.test(addr) || f.some((x) => x.addr === addr)) return f;
  return saveFriends([...f, { addr, name }]);
}

/**
 * You and your friends, on this hole and across the course, in the mode shown.
 * Read with Bests / Standings, which rank anyone, named or not.
 */
function Friends({ s, chain, me, mode }) {
  const [friends, setFriends] = useState(loadFriends);
  const [hole, setHole] = useState(null);
  const [course, setCourse] = useState(null);
  const [adding, setAdding] = useState("");
  const [note, setNote] = useState(null);
  const [copied, setCopied] = useState(false);
  const copiedT = useRef(0); // the "copied" note's timer, cleared if the sheet goes first
  useEffect(() => () => clearTimeout(copiedT.current), []);
  const who = [me, ...friends.map((f) => f.addr)].filter(Boolean);
  const key = who.join(",");
  useEffect(() => {
    if (!chain || !who.length) return;
    let live = true;
    chain.bests(s.id, mode, who).then((b) => live && setHole(b)).catch(() => live && setHole({ rows: [] }));
    chain.standings(mode, who).then((b) => live && setCourse(b)).catch(() => live && setCourse({ rows: [] }));
    return () => (live = false);
    // who is keyed by its join
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, s.id, mode, key]);
  const label = (a) => (a === me ? "You" : (friends.find((f) => f.addr === a) || {}).name || shortAddr(a));
  const add = async (e) => {
    e.preventDefault();
    const v = adding.trim().replace(/^@/, "");
    if (!v) return;
    setNote(null);
    let addr = v, name = "";
    if (!/^g1[0-9a-z]{38}$/.test(v)) {
      addr = await chain.resolveName(v).catch(() => "");
      name = v;
      if (!addr) return setNote(`No gno.land name “${v}” on this chain.`);
    }
    if (addr === me) return setNote("That's you — you're always here.");
    setFriends(addFriend(addr, name));
    setAdding("");
  };
  const drop = (addr) => setFriends(saveFriends(loadFriends().filter((f) => f.addr !== addr)));
  const invite = me && `${window.location.origin}${window.location.pathname}?friend=${me}`;
  const rows = (b, pick) => (b && b.rows ? [...b.rows].sort(pick) : null);
  const h = rows(hole, (a, b) => a.strokes - b.strokes), c = rows(course, (a, b) => b.holes - a.holes || a.strokes - b.strokes);
  return (
    <div className="lb friends">
      {!me && <p className="lb__empty">Connect Adena to see where you stand with your friends.</p>}
      <h3>{s.name} <small>par {(hole && hole.par) || parHere(s)}</small></h3>
      {h && h.length === 0 && <p className="lb__empty">None of you has a recorded round here yet.</p>}
      {h && h.length > 0 && (
        <ol>
          {h.map((r, i) => (
            <li key={r.player} className={r.player === me ? "me" : ""}>
              <span className="lb__rank">{i + 1}</span>
              <span className="lb__who">{label(r.player)}{mode === "pro" && <em className="pro-chip pro-chip--row">PRO</em>}</span>
              <span className="lb__holes">{r.strokes} stroke{r.strokes === 1 ? "" : "s"}</span>
              <strong>{vsPar(r.strokes - ((hole && hole.par) || parHere(s)))}</strong>
            </li>
          ))}
        </ol>
      )}
      <h3>The course <small>{course ? `${course.holes} holes` : ""}</small></h3>
      {c && c.length === 0 && <p className="lb__empty">No recorded rounds yet.</p>}
      {c && c.length > 0 && (
        <ol>
          {c.map((r, i) => (
            <li key={r.player} className={r.player === me ? "me" : ""}>
              <span className="lb__rank">{i + 1}</span>
              <span className="lb__who">{label(r.player)}</span>
              <span className="lb__holes">{r.holes} holes</span>
              <strong>{r.strokes}</strong>
            </li>
          ))}
        </ol>
      )}
      <form className="friends__add" onSubmit={add}>
        <input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add a friend: address or gno.land name" aria-label="Add a friend by address or gno.land name" />
        <Button variant="secondary" type="submit">Add</Button>
      </form>
      {note && <p className="note note--warn">{note}</p>}
      {friends.length > 0 && (
        <ul className="friends__list">
          {friends.map((f) => (
            <li key={f.addr}>
              <span>{f.name || `${f.addr.slice(0, 10)}…${f.addr.slice(-4)}`}</span>
              <button className="linkish" onClick={() => drop(f.addr)} aria-label={`Remove ${f.name || f.addr}`}>remove</button>
            </li>
          ))}
        </ul>
      )}
      {invite && (
        <button
          className="linkish friends__invite"
          onClick={() => navigator.clipboard.writeText(invite).then(() => (setCopied(true), clearTimeout(copiedT.current), (copiedT.current = setTimeout(() => setCopied(false), 1600))), () => {})}
        >
          {copied ? "Link copied — send it to a friend" : "Copy an “add me as a friend” link"}
        </button>
      )}
    </div>
  );
}

/** Strokes against par, the golf way: −1, E, +2. */
const vsPar = (n) => (n === 0 ? "E" : n > 0 ? `+${n}` : `−${-n}`);

/**
 * The leaderboards, in a sheet: this hole's best rounds, and the whole
 * course's. Read from the chain when the sheet opens, not before.
 */
function Boards({ s, chain, me, onClose, goTo, mode: mine = "assisted", web = "" }) {
  const [tab, setTab] = useState("friends");
  const [mode, setMode] = useState(mine);
  const [hb, setHb] = useState(null); // { par, players, rows } as loaded so far
  const [err, setErr] = useState(null);
  const [more, setMore] = useState(false); // a page is on its way
  const PAGE = 10;
  // a page is O(page) on the chain now, however deep: paged up to "players",
  // the named players on the board. Offsets are the chain's, not the rows
  // shown: a name deleted since is skipped in its page, which then holds fewer
  // rows while more still follow.
  const page = (offset) =>
    chain.holeLeaderboard(s.id, offset, PAGE, mode).then((b) => ({ ...b, rows: b.rows || [], next: offset + PAGE, done: offset + PAGE >= (b.players || 0) }));
  // what the rows on screen are for: a page asked for another hole or mode is dropped
  const view = useRef("");
  view.current = `${s.id}|${mode}|${tab}`;
  useEffect(() => {
    if (!chain || tab !== "hole") return;
    let live = true;
    setHb(null);
    setErr(null);
    page(0).then((b) => live && setHb(b)).catch((e) => live && setErr(String(e.message || e)));
    return () => (live = false);
    // page() reads chain and s.id, both listed
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chain, s.id, tab, mode]);
  const loadMore = () => {
    if (!hb || hb.done || more) return;
    const asked = view.current;
    setMore(true);
    page(hb.next)
      .then((b) => view.current === asked && setHb((h) => (h ? { ...h, rows: [...h.rows, ...b.rows], next: b.next, done: b.done } : h)))
      .catch((e) => view.current === asked && setErr(String(e.message || e)))
      .finally(() => setMore(false));
  };
  const me_ = (p) => (p === me ? "You" : shortAddr(p));
  const flags = useFlags();
  const [showAll, setShowAll] = useState(false);
  const shownHole = hb ? screen_(hb.rows, flags, showAll) : null;
  // the connected player's gno.land name: the general boards list only named players
  const [myName, setMyName] = useState(null);
  useEffect(() => {
    if (!chain || !me) return;
    let live = true;
    chain.nameOf(me).then((n) => live && setMyName(n)).catch(() => {});
    return () => (live = false);
  }, [chain, me]);
  const self = (s.allHoles || []).find((h) => h.id === s.id);
  const newer = self && self.next;
  return (
    <Sheet className="boards" label="Leaderboard" onClose={onClose}>
        <span className="eyebrow">Recorded on-chain</span>
        <h2>Leaderboard</h2>
        <Segmented className="boards__modes" full role="tablist" label="Aim mode" value={mode} onChange={setMode} options={[["assisted", "Assisted"], ["pro", "Pro"]]} />
        {mode === "pro" && <p className="boards__word">Pro rounds are ranked apart. The mode is on your word — the chain can't see your screen.</p>}
        <Segmented className="boards__tabs" full role="tablist" label="Board" value={tab} onChange={setTab} options={[["friends", "Friends"], ["hole", "This hole"], ["course", "The course"]]} />
        {tab !== "friends" && (
          <p className="boards__ranked">
            Ranked: players with a gno.land name ·{" "}
            <a href={`${web}/r/gnoland/users`} target="_blank" rel="noopener noreferrer">get a name ↗</a>
            {me && myName === "" && <> — get one to appear here</>}
          </p>
        )}
        {tab === "friends" ? (
          <Friends s={s} chain={chain} me={me} mode={mode} />
        ) : tab === "hole" ? (
          <div className="lb">
            <h3>{s.name} <small>par {parHere(s)}{hb ? ` · ${hb.finished ?? hb.players} finished${hb.finished != null && hb.finished !== hb.players ? `, ${hb.players} ranked` : ""}` : ""}</small></h3>
            {newer && (
              <p className="note note--warn">
                Archived version — <button className="linkish" onClick={() => goTo(newer)}>play the current one</button>
              </p>
            )}
            {err && <p className="note note--bad">{err}</p>}
            {!hb && !err && <p className="lb__empty">Reading the chain…</p>}
            {hb && hb.rows.length === 0 && (SOON ? <ComingSoon /> : <p className="lb__empty">No recorded round yet — connect Adena and be the first.</p>)}
            {shownHole && shownHole.rows.length > 0 && (
              <ol>
                {shownHole.rows.map((r, i) => (
                  <li key={r.player} className={r.player === me ? "me" : ""}>
                    <span className="lb__rank">{i + 1}</span>
                    <span className="lb__who">{me_(r.player)}{mode === "pro" && <em className="pro-chip pro-chip--row">PRO</em>}<FlagMark f={showAll && flags[r.player]} /></span>
                    <span className="lb__holes">{r.strokes} stroke{r.strokes === 1 ? "" : "s"}</span>
                    <strong>{vsPar(r.strokes - (hb.par || parHere(s)))}</strong>
                  </li>
                ))}
              </ol>
            )}
            {shownHole && (shownHole.hidden > 0 || showAll) && (
              <button className="linkish" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Hide flagged players" : `Show all (${shownHole.hidden} hidden)`}
              </button>
            )}
            {hb && !hb.done && (
              <Button className="boards__more" disabled={more} onClick={loadMore}>
                {more ? "Reading…" : "Show more"}
              </Button>
            )}
          </div>
        ) : (
          <Leaderboard chain={chain} me={me} mode={mode} filter />
        )}
        {!SOON && <p className="real__fine">Only rounds recorded with Adena appear here: free play is computed by the chain but not kept.</p>}
    </Sheet>
  );
}

/** The chain's course ranking: rounds the chain replayed itself, named players only. */
function Leaderboard({ chain, me, mode = "assisted", filter = false }) {
  const [lb, setLb] = useState(null);
  const flags = useFlags();
  const [showAll, setShowAll] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!chain) return;
    let live = true;
    setLb(null);
    setErr(null);
    leaderboardOf(chain, mode).then((b) => live && setLb(b)).catch((e) => live && setErr(String(e.message || e)));
    return () => (live = false);
  }, [chain, mode]);
  return (
    <div className="lb">
      <h3>The course <small>top ten</small></h3>
      {err && <p className="note note--bad">{err}</p>}
      {!lb && !err && <p className="lb__empty">Reading the chain…</p>}
      {lb && lb.rows.length === 0 && (SOON ? <ComingSoon /> : <p className="lb__empty">Nobody has recorded a round yet. Connect Adena and be the first.</p>)}
      {lb && lb.rows.length > 0 && (() => {
        const v = filter ? screen_(lb.rows, flags, showAll) : { rows: lb.rows, hidden: 0 };
        return (
          <>
        <ol>
          {v.rows.map((r, i) => (
            <li key={r.player} className={r.player === me ? "me" : ""}>
              <span className="lb__rank">{i + 1}</span>
              <span className="lb__who">{r.player === me ? "You" : shortAddr(r.player)}<FlagMark f={showAll && flags[r.player]} /></span>
              <span className="lb__holes">{r.holes}/{lb.holes}</span>
              <strong>{r.strokes}</strong>
            </li>
          ))}
        </ol>
            {(v.hidden > 0 || (filter && showAll)) && (
              <button className="linkish" onClick={() => setShowAll((x) => !x)}>
                {showAll ? "Hide flagged players" : `Show all (${v.hidden} hidden)`}
              </button>
            )}
          </>
        );
      })()}
    </div>
  );
}

function earned() {
  try {
    const e = JSON.parse(localStorage.getItem("gnogolf.earned") || "[]");
    return Array.isArray(e) ? e : []; // a hand edit or an older format must not blank the page
  } catch {
    return [];
  }
}
function remember(id) {
  try {
    const e = earned();
    if (!e.includes(id)) localStorage.setItem("gnogolf.earned", JSON.stringify([...e, id]));
  } catch {}
}
