"use client";

import { useEffect, useRef, useState } from "react";
import { createGame } from "@/lib/engine";
import { GNOMES, makePreview } from "@/lib/scene";
import { DEFAULT_RPC, DEFAULT_WEB, safeEndpoint } from "@/lib/chain";
import { hasAdena, connect, current, onOurNode, recordRound, costOf, shortOf, ADENA_URL, onWalletChange } from "@/lib/adena";
import Title, { Hat, choresOf } from "@/components/Title";
import Worlds, { WORLDS, Emblem } from "@/components/Worlds";
import Weather from "@/components/Weather";
import Share from "@/components/Share";
import { Button, Segmented, Toggle, Sheet, SheetClose } from "@/components/ui";
import { loadCard, recordScore, clearCard, clearCup, totals, cupTotals, medalOf, parOf, setPars, UNLOCKS } from "@/lib/card";
import { feel, setFeel, sound, hush } from "@/lib/feel";

/** Config travels in the query string, so one build serves any chain. */
function useConfig() {
  const [cfg, setCfg] = useState(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
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

/** The close button's X, the same in every sheet. */

const short = (a) => (a ? `${a.slice(0, 4)}…${a.slice(-3)}` : "");

export default function Golf() {
  const canvas = useRef(null);
  const game = useRef(null);
  const cfg = useConfig();

  const [s, setS] = useState(null);
  const [fatal, setFatal] = useState(null);
  // title -> pick a gnome -> play; the title shows at once, the hole loads behind it
  const [screen, setScreen] = useState("title");
  const playing = screen === "play";
  // what the effects below follow of the game's state, as plain values
  const holeId = s && s.id;
  const fresh0 = !!(s && s.shots.length === 0);
  const holedNow = !!(s && s.holed);
  // the rain and the wind stay on the course: silent on every other screen
  useEffect(() => hush(!playing), [playing]);
  // the title, the cups and the picker hide the course entirely: nothing to draw
  useEffect(() => {
    game.current && game.current.cover && game.current.cover(!playing);
  }, [playing, holeId]);
  // the gnome: a shared link's if this player has it, else their own; a link
  // never unlocks one, and is never saved as the player's choice
  const [linkNote, setLinkNote] = useState(null);
  const [gnome, setGnome] = useState(() => {
    const own = savedGnome();
    if (typeof window === "undefined") return own;
    const want = new URLSearchParams(window.location.search).get("gnome");
    const gn = want && GNOMES.find((x) => x.id === want);
    if (!gn) return own;
    if (!gn.unlock || earned().includes(gn.id)) return gn.id;
    const mine = GNOMES.find((x) => x.id === own) || GNOMES[0];
    setTimeout(() => setLinkNote(`${gn.name.replace(/^The /, "")} is locked — playing as ${mine.name.replace(/^The /, "")}`), 0);
    return own;
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
  const goTo = (id) => {
    const i = s.holes.findIndex((h) => h.id === id);
    setCurtain({ n: holeNumber(s.holes, id), name: s.holes[i] ? s.holes[i].name : "", id });
    setTimeout(() => game.current && game.current.load(id), 380);
  };
  const [card, setCard] = useState(() => loadCard());
  const [cardOpen, setCardOpen] = useState(false);
  const [prefs, setPrefs] = useState(() => feel());
  const toggle = (k) => { setFeel(k, !prefs[k]); setPrefs(feel()); };
  const [wipe, setWipe] = useState(false); // "clear my scores" asks twice

  // The tab says what the gnome is up to: a glance at it tells how the shot
  // went, and a tab left behind calls you back.
  useEffect(() => {
    const name = "Gnogolf";
    const set = () => {
      if (document.hidden && s && playing) return (document.title = `The gnome is waiting… · ${name}`);
      if (!s || !playing) return (document.title = `${name} · mini-golf on-chain`);
      const n = holeNumber(s.holes, s.id);
      if (s.holed) return (document.title = s.strokes === 1 ? `Hole in one! · ${name}` : `In the cup in ${s.strokes} · ${name}`);
      if (s.flying) return (document.title = `Rolling… · Hole ${n} · ${name}`);
      if (s.aiming) return (document.title = `Lining it up… · Hole ${n} · ${name}`);
      document.title = `Hole ${n} · ${s.name} · ${name}`;
    };
    set();
    document.addEventListener("visibilitychange", set);
    // while the shot rolls, a ball rolls along the tab title, round and
    // round, until it stops
    let roll = null;
    if (s && playing && s.flying && !s.holed) {
      const n = holeNumber(s.holes, s.id), W = 12;
      roll = setInterval(() => {
        const at = rolling.k++ % W;
        document.title = `${"·".repeat(at)}●${"·".repeat(W - 1 - at)} Hole ${n} · ${name}`;
      }, 140);
    }
    return () => {
      clearInterval(roll);
      document.removeEventListener("visibilitychange", set);
    };
  }, [s, playing]);
  const holedRef = useRef(() => {});
  const [fresh, setFresh] = useState([]); // gnomes just unlocked, for the banner
  const holesList = (s && s.holes) || [];
  setPars(holesList);
  const tot = totals(card, holesList);
  const allList = (s && s.allHoles) || [];
  const cups = cupTotals(card, allList);
  // once earned, a gnome stays earned: a hole registered later must not take
  // it back, and the hole list not being loaded yet must not either
  const unlocked = (id) => {
    const gn = GNOMES.find((x) => x.id === id);
    if (!gn || !gn.unlock) return true;
    if (earned().includes(id)) return true;
    return !!(allList.length && UNLOCKS[gn.unlock] && UNLOCKS[gn.unlock].ok(cups));
  };
  // once earned, remembered — outside render, so a render never writes storage
  useEffect(() => {
    if (!allList.length) return;
    for (const gn of GNOMES) if (gn.unlock && UNLOCKS[gn.unlock] && UNLOCKS[gn.unlock].ok(cups)) remember(gn.id);
  });

  // playing for real: who is connected, and where the current round's record is
  const [real, setReal] = useState(false); // the explainer is open
  const [account, setAccount] = useState(null);
  const [wallet, setWallet] = useState({ busy: false, error: null });
  const [record, setRecord] = useState(null); // null | "signing" | { hash, height } | { error }

  const play = () => {
    setScreen("play");
    if (!game.current) return;
    game.current.play();
    // after the overview has had its moment and the camera is on the gnome
    if (cfg && cfg.demo) setTimeout(() => game.current.demo(cfg.demo.split(";")), 2600);
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

    const g = createGame(canvas.current, {
      rpc: cfg.rpc, web: cfg.web, gnome, world: cfg.world, weather: cfg.weather, aimMode: aim, camMode: savedCam(), onChange: setS,
      onHoled: ({ id, strokes }) => holedRef.current(id, strokes),
    });
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
        // ?won=N shows the win card for N strokes — screenshots only
        if (cfg.won) setTimeout(() => g.fakeWin(cfg.won), 400);
        // ?shot=angle,power fires one on load — for screenshots and smoke tests
        if (cfg.shot) {
          const [a, p] = cfg.shot.split(",").map(Number);
          setTimeout(() => g.shoot(a, p), 300);
        }
      })
      .catch((err) => !cancelled && setFatal(String(err.message || err)));

    return () => {
      cancelled = true;
      g.destroy();
    };
    // the game is made once per config; gnome and play are read at that moment
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cfg]);

  // a new hole, or a restart, is a new round: nothing of it is recorded yet,
  // and an answer for the previous round must not land on it
  const roundKey = useRef("");
  useEffect(() => {
    roundKey.current = s ? `${s.id}#${s.shots.join(";")}` : "";
  });
  useEffect(() => setRecord(null), [holeId, fresh0]);

  useEffect(() => {
    if (holeId && game.current && !chainName) game.current.chain.chainId().then(setChainName).catch(() => {});
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
      setAccount(await connect({ chainId: await chain.chainId(), rpc: chain.rpc }));
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
  useEffect(() => {
    if (record !== "signing") return setSlowSign(false);
    const t = setTimeout(() => setSlowSign(true), 10000);
    return () => clearTimeout(t);
  }, [record]);
  const within = (p, ms = 4000) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("The chain did not answer in time.")), ms))]);
  useEffect(() => {
    if (!account || !game.current) return;
    const c = game.current.chain;
    within(c.gasPrice()).then(setGasPrice).catch(() => {});
    within(c.chainId()).then(setChainId).catch(() => {});
    within(c.balance(account.address)).then(setFunds).catch(() => setFunds(null));
    onOurNode(c.rpc).then(setOurNode);
    // re-read when a hole is won: the card is about to offer the record
  }, [account, holedNow]);

  async function recordIt() {
    if (!account) return setReal(true);
    const round = `${s.id}#${s.shots.join(";")}`;
    const land = (r) => roundKey.current === round && setRecord(r);
    setRecord("signing");
    try {
      const chain = game.current.chain;
      const tx = await recordRound({
        address: account.address, realm: chain.realm, hole: s.id, shots: s.shots, pieces: s.pieces, period: s.period, mode: s.roundMode || "assisted", price: gasPrice,
        chainId: chainId || (await within(chain.chainId())), rpc: chain.rpc,
      });
      within(chain.balance(account.address)).then(setFunds).catch(() => {});
      // signed is not recorded: read the round back and say what the chain has
      // the block may land a moment after Adena answers: read back for up to 8 s
      let mine = null;
      for (let k = 0; k < 8; k++) {
        mine = await chain.round(s.id, account.address).catch(() => null);
        if (mine && mine.done && mine.strokes === s.strokes) break;
        await new Promise((r) => setTimeout(r, 1000));
      }
      if (mine && mine.done && mine.strokes === s.strokes) land({ ...(tx || {}), hash: (tx && tx.hash) || "" });
      else
        land({
          error: mine
            ? `The chain replayed your shots and got a different round: ${mine.strokes} strokes, ${mine.done ? "holed" : "not holed"}. This hole changes between shots, so a replay can differ from what you saw.`
            : "The transaction went through, but the chain has no round for you on this hole.",
        });
    } catch (err) {
      land(err.cancelled ? null : { error: String(err.message || err) });
    }
  }

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      setMenu(false);
      setReal(false);
      setCardOpen(false);
      // and a screen goes back to the one before it
      setScreen((sc) => (sc === "pick" ? "worlds" : sc === "worlds" ? "title" : sc));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  unlockedRef.current = unlocked;
  // the new hole is on screen: open the curtain
  useEffect(() => {
    if (curtain && holeId === curtain.id && !curtain.open) {
      const t = setTimeout(() => setCurtain((c) => c && { ...c, open: true }), 250);
      const t2 = setTimeout(() => setCurtain(null), 1000);
      return () => (clearTimeout(t), clearTimeout(t2));
    }
  }, [holeId, curtain]);

  const holed = s && s.holed;
  // The address bar follows the screen: the title is the bare page, the cups
  // ?cup=<world>, the picker adds &gnome=, a hole ?cup=&hole=&gnome=. A new
  // screen is a new history entry (Back returns to the one before); moving
  // within a hole — next hole, another gnome — only rewrites the current one.
  const place = s && s.place, world = s && s.world;
  const lastScreen = useRef(null);
  useEffect(() => {
    if (!cfg) return;
    const keep = new URLSearchParams(window.location.search);
    const q = new URLSearchParams();
    for (const k of ["rpc", "web"]) if (keep.get(k)) q.set(k, keep.get(k));
    if (screen === "play" && place) {
      q.set("cup", world || "garden");
      q.set("hole", String(place));
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
  }, [cfg, screen, place, world, gnome]);
  // Back and Forward: back to that screen, and that hole, without reloading the scene
  useEffect(() => {
    const onPop = (e) => {
      const p = new URLSearchParams(window.location.search);
      const sc = (e.state && e.state.screen) || (p.get("hole") ? "play" : p.get("cup") ? "worlds" : "title");
      lastScreen.current = sc; // arriving here is not a new step
      setMenu(false);
      setScreen(sc);
      if (sc === "play" && game.current) {
        const cup = p.get("cup"), n = Number(p.get("hole"));
        const h = game.current.find && game.current.find({ cup, n });
        if (h && h !== (game.current.current && game.current.current())) goTo(h);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  });
  // the stroke's weather (?weather= fakes it, for screenshots)
  const wx = cfg && cfg.weather
    ? { wind: cfg.weather.includes("wind") ? [0.05, -0.03] : null, rain: cfg.weather.includes("rain"), fog: cfg.weather.includes("fog"), storm: cfg.weather.includes("storm") }
    : s && s.weather;

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

      {screen === "title" && <Title loading={!s && !fatal} world={s && s.world} onStart={() => setScreen("worlds")} />}
      {screen === "worlds" && s && (
        <Worlds
          counts={s.worlds}
          stats={cups}
          onResetAll={() => setCard(clearCard())}
          onReset={(w) => setCard(clearCup(allList.filter((h) => (h.world || "garden") === w).map((h) => h.id)))}
          current={s.world}
          onBack={() => setScreen("title")}
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
                  Hole {Math.max(1, s.holes.findIndex((h) => h.id === s.id) + 1)} of {s.holes.length}
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
              <span className="card__par">par {parOf(s.id)}</span>
              {(s.roundMode || s.mode) === "pro" && <span className="pro-chip" title="Pro: no aim line">PRO</span>}
            </div>
            <Weather w={wx} flash={s.flash || 0} until={s.period != null ? (s.period + 1) * 300 * 1000 : null} />
            <div className="hud__right">
              <span className="adena__wrap">
              <button
                className={"adena" + (account ? " adena--on" : "")}
                onClick={() => setReal(true)}
                aria-label={account ? `Playing for real as ${account.address}` : "Play for real with Adena"}
              >
                <img className="adena__logo" src="adena.svg" alt="" width="34" height="34" />
                <span className="adena__text">
                  <small>{account ? "Connected · playing for real" : "Play for real"}</small>
                  <b>{account ? short(account.address) : "Connect Adena"}</b>
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
              <aside className="drawer__panel" role="dialog" aria-modal="true" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
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
                        {card[h.id] ? <b>{card[h.id]}</b> : "–"} / par {parOf(h.id)}
                      </span>
                    </button>
                  ))}
                </nav>
              </aside>
            </div>
          )}

          {!s.aiming && !s.flying && !holed && s.strokes === 0 && (
            <div className="hint">
              <span className="hint--mouse">Click anywhere and pull back, like a slingshot</span>
              <span className="hint--touch">Touch anywhere and pull back, like a slingshot</span>
            </div>
          )}
          {s.aiming && (
            <div className="aimbar" aria-live="polite">
              <div className="power">
                <span style={{ width: `${Math.round(s.power * 100)}%` }} />
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
          <div className="banner__in" role="dialog" aria-modal="true" aria-label="Hole finished">
            <span className="eyebrow">{s.name}</span>
            <h2>{s.strokes === 1 ? "Hole in one!" : "In the hole!"}</h2>
            {/* the score, and beside it the ways to tell people about it */}
            <div className="win__head">
              <div className="win__score">
                <strong>{s.strokes}</strong>
                <span>stroke{s.strokes > 1 ? "s" : ""}</span>
              </div>
            <Share
              link={s ? holeLink(s, gnome, "") : ""}
                snapshot={() => game.current && game.current.snapshot(`${s.name} · ${s.strokes} stroke${s.strokes > 1 ? "s" : ""}`)}
                text={shareText({ s, card, cups, fresh })}
              />
            </div>


            <p>
              {" "}
              {record && record.hash !== undefined && !record.error
                ? "It is on the chain now — for good."
                : "Free play: the chain computed every shot, but nothing is kept."}
            </p>
            <Standings s={s} card={card} chain={game.current && game.current.chain} me={account && account.address} />
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
            {account && !(record && record.hash !== undefined && !record.error) && (() => {
              // said before signing, not by refusing to: Adena still opens
              const short = shortOf(s.shots.length, s.pieces, gasPrice, funds);
              if (!short) return null;
              return (
                <p className="note note--warn">
                  {funds === 0 ? "Your Adena account has no GNOT on this chain yet" : `Your account holds ${(funds / 1e6).toFixed(3)} GNOT, about ${short.toFixed(3)} short`} — it needs some to pay the gas.
                  {/localhost|127\.0\.0\.1/.test((game.current && game.current.chain.rpc) || "") ? " On this local chain, fund it from the node's test account (gnokey send, or the dev faucet)." : " On a testnet, the faucet gives some for free."}
                </p>
              );
            })()}
            <div className="banner__row">
              <Button variant="secondary" onClick={() => game.current.reset()}>
                Play again
              </Button>
              {!(record && record.hash !== undefined && !record.error) && (
                <Button variant="chain" disabled={record === "signing"} onClick={recordIt}>
                  <svg className="btn__mark" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><g fill="none" stroke="currentColor" strokeWidth="2.4"><rect x="2.5" y="8" width="11" height="8" rx="4" transform="rotate(-35 8 12)" /><rect x="10.5" y="8" width="11" height="8" rx="4" transform="rotate(-35 16 12)" /></g></svg>
                  {record === "signing" ? "Waiting for Adena…" : account ? `Save on-chain · ~${costOf(s.shots.length, s.pieces, gasPrice)} GNOT` : "Save my score on-chain"}
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
          </div>
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
            <Standings s={s} card={card} chain={game.current && game.current.chain} me={account && account.address} />
            <Scorecard holes={s.holes} card={card} current={s.id} world={s.world} />
            <Leaderboard chain={game.current && game.current.chain} me={account && account.address} />
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
            <p className="curtain__chore">{choresOf((s && s.world) || "garden")[curtain.n % choresOf((s && s.world) || "garden").length]}</p>
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
        />
      )}

      {playing && s && s.note && !s.flying && <div className="note" role="status">{s.note}</div>}
      {playing && linkNote && <div className="note" role="status" onAnimationEnd={() => setLinkNote(null)}>{linkNote}</div>}
      {playing && s && s.cause && s.flying && <div key={s.cause.at} className="cause" aria-live="polite">{s.cause.label}</div>}

      {(fatal || (s && s.error)) && (() => {
        // say what actually went wrong: the chain not answering, a shot it
        // refused, or a bug of ours while drawing — and offer the fix that fits
        const kind = fatal ? (/fetch|network|timeout|abort|rpc|abci|http|connect|load failed/i.test(fatal) ? "down" : "bug") : s.errorKind || "shot";
        const holeNow = s && s.id;
        const TEXT = {
          down: ["The course is not reachable right now", "The chain the game plays on did not answer. It may be restarting — try again in a moment."],
          bug: ["Something went wrong", "The game hit an error in this browser. Reloading the page usually fixes it."],
          load: ["That hole did not load", "The chain did not send this hole. Try again, or pick another one from the menu."],
          draw: ["That hole could not be drawn", "Something broke on our side while building it. Pick another hole from the menu — your scores are safe."],
          limit: ["That is the most strokes a round holds", "Restart the hole to play it again."],
          shot: ["That shot did not go through", "The chain could not play that shot. Nothing was lost; you can shoot again."],
        }[kind];
        const g = game.current;
        return (
          <div className="banner" role="alertdialog" aria-labelledby="banner-title">
            <div className="banner__in">
              <h2 id="banner-title">{TEXT[0]}</h2>
              <p>{TEXT[1]}</p>
              {kind !== "limit" && (
                <details className="details">
                  <summary>Technical details</summary>
                  <div className="details__box">
                    <p className="mono">{fatal || s.error}</p>
                    {(kind === "down" || kind === "load" || kind === "shot") && cfg && <p className="mono">{cfg.rpc}</p>}
                  </div>
                </details>
              )}
              <div className="banner__row">
                {fatal ? (
                  <Button variant="primary" onClick={() => window.location.reload()}>{kind === "bug" ? "Reload" : "Try again"}</Button>
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
            </div>
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
  if (!record || record === "signing") return null;
  if (record.error) return <p className="note note--bad">{record.error}</p>;
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
function RealPlay({ account, wallet, onConnect, onClose, rpc, chainName }) {
  const installed = hasAdena();
  return (
    <Sheet className="real" label="Play for real" onClose={onClose}>
        <span className="eyebrow">Adena wallet</span>
        <h2>Play for real</h2>
        <p className="real__lead">
          Free play and real play are the same game on the same chain. The only
          difference is whether your round is kept.
        </p>

        <div className="real__cols">
          <div className="real__col">
            <h3>Free play</h3>
            <ul>
              <li>Every shot computed by the contract</li>
              <li>No account, no wallet, no cost</li>
              <li>Nothing is kept when you leave</li>
            </ul>
          </div>
          <div className="real__col real__col--on">
            <h3>Saved on-chain</h3>
            <ul>
              <li>Your score is written on-chain, for good</li>
              <li>Your marks stay on the course for the players after you</li>
              <li>Best rounds go on the hole's record</li>
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
            <span>Gnogolf sees your address; it can never move your funds.</span>
          </li>
          <li>
            <b>Hole out, then sign once</b>
            <span>
              One transaction replays your shots on the chain — roughly 0.1 to 0.7
              GNOT of gas depending on the hole, shown before you sign, plus a small
              storage deposit. The chain re-runs every shot itself, so a score can
              never be typed in.
            </span>
          </li>
        </ol>

        {wallet.error && <p className="note note--bad">{wallet.error}</p>}
        {wallet.note && !account && <p className="note">{wallet.note}</p>}

        {!installed ? (
          <a className="btn btn--main btn--wide" href={ADENA_URL} target="_blank" rel="noopener noreferrer">
            Install Adena ↗
          </a>
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
            <> · <a href="https://faucet.gno.land" target="_blank" rel="noopener noreferrer">Get test GNOT ↗</a></>
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
export function holeLink(s, gnome, base) {
  const q = new URLSearchParams();
  const keep = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  // a page pointed at another chain keeps pointing there
  for (const k of ["rpc", "web"]) if (keep.get(k)) q.set(k, keep.get(k));
  q.set("cup", s.world || "garden");
  q.set("hole", String(s.place || 1));
  if (gnome) q.set("gnome", gnome);
  return `${base}?${q}`;
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
  if (i >= 0) return String(i + 1);
  const m = String(id).match(/(\d+)$/);
  return m ? m[1] : "1";
}

/** The card: hole, par and your score, ten holes to a row, with the totals. */
const i0 = (h, row) => row.indexOf(h);

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
  if (cups.slam) return "👑 Grand slam on Gnogolf: every cup at par or under. The Gnome King bows, and gno.land has it in writing." + tag;
  if (t.all) return pick([
    `🏆 ${cup} done on Gnogolf, ${vs}. Every putt replayed by a realm on gno.land, so no, I didn't make it up.`,
    `⛳ ${t.strokes} strokes round the whole ${cup} (${vs}). My gnome is tired, the chain is not.`,
  ]) + tag;
  if (fresh.length) return `🍄 New gnome unlocked on Gnogolf: ${fresh.map((g) => g.name).join(" and ")}. Earned the hard way, one on-chain putt at a time.` + tag;
  if (s.strokes === 1) return pick([
    `🕳️ Hole in one on ${s.name}! The gno.land VM replayed it and couldn't find a trick.`,
    `⛳ Ace on ${s.name}. Somewhere on gno.land a realm just nodded.`,
  ]) + tag;
  return pick([
    `⛳ ${s.name} in ${s.strokes}. Mini-golf where the ball is rolled by a smart contract. Your turn?`,
    `🧙 My gnome sank ${s.name} in ${s.strokes}. Physics by a realm on gno.land, excuses by me.`,
    `⛳ ${s.strokes} strokes on ${s.name}. Every bounce computed on-chain. Beat that, gnome.`,
  ]) + tag;
}

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
            <tr><th>Par</th>{row.map((h) => <td key={h.id}>{parOf(h.id)}</td>)}{pad(row)}</tr>
            <tr>
              <th>Score</th>
              {row.map((h) => {
                const sc = card[h.id];
                const par = parOf(h.id);
                const kind = !sc ? "" : sc === 1 ? "ace" : sc < par ? "under" : sc === par ? "par" : "over";
                return (
                  <td key={h.id} className={kind}>
                    {sc || ""}
                    {kind && kind !== "over" && <Stamp kind={kind} seed={r * per + i0(h, row)} world={world} />}
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

function Standings({ s, card, chain, me }) {
  const [rank, setRank] = useState(null);
  useEffect(() => {
    if (!chain || !me) return;
    let live = true; // no state set once the card is gone
    leaderboardOf(chain).then((lb) => {
      const i = lb.rows.findIndex((r) => r.player === me);
      if (live) setRank(i >= 0 ? { at: i + 1, of: lb.rows.length } : null);
    }).catch(() => {});
    return () => (live = false);
  }, [chain, me]);
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
          <div><dt>On-chain</dt><dd>{rank ? `#${rank.at}` : "–"}</dd></div>
        </dl>
      </header>
      <ol className="cup__track">
        {s.holes.map((h, i) => {
          const sc = card[h.id], medal = medalOf(sc, parOf(h.id));
          return (
            <li
              key={h.id}
              className={"cup__hole" + (h.id === s.id ? " cup__hole--now" : "") + (sc ? " cup__hole--done" : "") + (medal ? ` cup__hole--${medal}` : "")}
              title={`${i + 1}. ${h.name}${sc ? ` — ${sc} (par ${parOf(h.id)})` : ""}`}
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
          ? t.strokes <= t.par ? "Cup finished at par or under — a gnome is waiting in the picker." : "Cup finished. Now beat par."
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
  const label = (a) => (a === me ? "You" : (friends.find((f) => f.addr === a) || {}).name || `${a.slice(0, 8)}…${a.slice(-4)}`);
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
      <h3>{s.name} <small>par {(hole && hole.par) || parOf(s.id)}</small></h3>
      {h && h.length === 0 && <p className="lb__empty">None of you has a recorded round here yet.</p>}
      {h && h.length > 0 && (
        <ol>
          {h.map((r, i) => (
            <li key={r.player} className={r.player === me ? "me" : ""}>
              <span className="lb__rank">{i + 1}</span>
              <span className="lb__who">{label(r.player)}{mode === "pro" && <em className="pro-chip pro-chip--row">PRO</em>}</span>
              <span className="lb__holes">{r.strokes} stroke{r.strokes === 1 ? "" : "s"}</span>
              <strong>{vsPar(r.strokes - ((hole && hole.par) || parOf(s.id)))}</strong>
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
          onClick={() => navigator.clipboard.writeText(invite).then(() => (setCopied(true), setTimeout(() => setCopied(false), 1600)), () => {})}
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
  const PAGE = 10, TOP = 100;
  const page = (offset) =>
    chain.holeLeaderboard(s.id, offset, PAGE, mode).then((b) => ({ ...b, rows: b.rows || [], done: (b.rows || []).length < PAGE || offset + PAGE >= Math.min(TOP, b.players || 0) }));
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
    setMore(true);
    page(hb.rows.length)
      .then((b) => setHb((h) => ({ ...h, rows: [...h.rows, ...b.rows], done: b.done })))
      .catch((e) => setErr(String(e.message || e)))
      .finally(() => setMore(false));
  };
  const me_ = (p) => (p === me ? "You" : `${String(p).slice(0, 8)}…${String(p).slice(-4)}`);
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
            <h3>{s.name} <small>par {parOf(s.id)}{hb ? ` · ${hb.players} player${hb.players === 1 ? "" : "s"} finished` : ""}</small></h3>
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
                    <strong>{vsPar(r.strokes - (hb.par || parOf(s.id)))}</strong>
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

/** The chain's ranking: the only board a score cannot be typed into. */
function Leaderboard({ chain, me, mode = "assisted", filter = false }) {
  const [lb, setLb] = useState(null);
  const flags = useFlags();
  const [showAll, setShowAll] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => {
    if (!chain) return;
    let live = true;
    setLb(null);
    leaderboardOf(chain, mode).then((b) => live && setLb(b)).catch((e) => live && setErr(String(e.message || e)));
    return () => (live = false);
  }, [chain, mode]);
  return (
    <div className="lb">
      <h3>Leaderboard <small>recorded on-chain</small></h3>
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
              <span className="lb__who">{r.player === me ? "You" : `${String(r.player).slice(0, 8)}…${String(r.player).slice(-4)}`}<FlagMark f={showAll && flags[r.player]} /></span>
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
    return JSON.parse(localStorage.getItem("gnogolf.earned") || "[]");
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
