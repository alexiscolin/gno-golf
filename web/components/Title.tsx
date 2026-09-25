"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import "@/app/title.css";
import { sound } from "@/lib/feel";
import { Button } from "@/components/ui";
import type { makeTitle, titleStill } from "@/lib/scene/title";

/** The live title scene, once its module has loaded and made it. */
type TitleScene = NonNullable<Awaited<ReturnType<typeof makeTitle>>>;
type Film = ReturnType<typeof makeFilm>;
declare global {
  interface Window {
    // the perf probe's and the stills baker's hooks (?camlog, ?titlebake)
    __title?: TitleScene;
    __titleFilm?: Film | null;
    __titleStill?: typeof titleStill;
  }
  interface Navigator {
    // the Network Information API (Chromium): not in the DOM types
    connection?: { saveData?: boolean; effectiveType?: string };
  }
}

// What the gnomes are up to while the game loads, cup by cup. Silly on
// purpose: a wait reads shorter when something is going on.
const CHORES: Record<string, readonly string[]> = {
  garden: ["Waking the gnomes…", "Mowing the greens…", "Planting mushrooms…", "Oiling the windmill…", "Asking the chain nicely…", "Filling the ponds…", "Hiding the moles…", "Straightening hats…"],
  island: ["Raking the sand…", "Chasing crabs…", "Waxing the palm trees…", "Counting the waves…", "Asking the chain nicely…", "Building sandcastles…", "Shooing the seagulls…"],
  mountain: ["Waxing the skis…", "Shovelling the snow…", "Knitting bobble hats…", "Asking the chain nicely…", "Warming the chalet…", "Counting the pines…"],
  town: ["Lighting the lamps…", "Baking bread…", "Sweeping the cobbles…", "Winding the clock tower…", "Asking the chain nicely…", "Painting the rooftops…", "Ringing the tram bell…"],
};
export const choresOf = (world: string) => CHORES[world] || CHORES.garden;

/** The loader ball's hat, the curtain's hat: each cup wears its own. */
export function Hat({ world, x = 0, y = 0, k = 1, className = "" }: { world: string; x?: number; y?: number; k?: number; className?: string }) {
  const t = `translate(${x} ${y}) scale(${k})`;
  if (world === "island")
    // a straw hat: a wide brim and a low crown, with a band
    return (
      <g transform={t} className={"hat hat--straw " + className}>
        <ellipse cx="0" cy="0" rx="9" ry="2.6" />
        <path d="M -4.5 0 Q -4.5 -6 0 -6.5 Q 4.5 -6 4.5 0 Z" />
        <path d="M -4.4 -1.6 H 4.4" className="hat__band" />
      </g>
    );
  if (world === "mountain")
    // a woolly bobble hat
    return (
      <g transform={t} className={"hat hat--wool " + className}>
        <path d="M -5.5 0 Q -5.5 -8 0 -8 Q 5.5 -8 5.5 0 Z" />
        <rect x="-6" y="-2" width="12" height="3" rx="1.5" className="hat__rib" />
        <circle cx="0" cy="-9" r="2.4" className="hat__bobble" />
      </g>
    );
  if (world === "town")
    // a baker's toque: a puffed top on a band
    return (
      <g transform={t} className={"hat hat--toque " + className}>
        <rect x="-4.5" y="-3" width="9" height="3.5" rx="1" />
        <path d="M -5 -3 Q -7.5 -7.5 -3.5 -8.5 Q -1.5 -11.5 1.5 -9.5 Q 5.5 -11 5.5 -7 Q 8 -5 5 -3 Z" />
      </g>
    );
  return (
    <g transform={t} className={"hat hat--point " + className}>
      <path d="M -5 0 L 0 -9 L 5 0 Z" />
    </g>
  );
}

// How far the ball has rolled, kept across mounts: the title is shown by the
// page while the bundle loads, then again by the game, and the ball must not
// jump back to the tee in between.
let rolled = 0;

/**
 * The putting green the loader and the cup cards share: a track, its mown part
 * up to p (0..1), the ball in its cup's hat at that point, the cup and its
 * flag (a palm on the island, a lamp in town) at the end.
 */
export function Green({ p, world = "garden", holed = false, thick = false }: { p: number; world?: string; holed?: boolean; thick?: boolean }) {
  // thick: the cup cards' own, twice the track for a narrow card, ball and flag to match
  const k = thick ? 1.8 : 1;
  const H = 26 * k, top = 64 * k - H - 8, mid = top + H / 2, cx = 300 - 32 * k, x = 16 * k + p * (cx - 32 * k);
  const pole = mid - 38 * k;
  return (
    <svg viewBox={`0 ${Math.min(0, pole - 6 * k)} 300 ${64 * k - Math.min(0, pole - 6 * k)}`} aria-hidden="true" className={`green green--${world}`}>
      <rect x="2" y={top} width="296" height={H} rx={H / 2} className="load__green" />
      <rect x="2" y={top} width={Math.max(H, x + 10 * k)} height={H} rx={H / 2} className="load__mown" />
      <ellipse cx={cx} cy={mid} rx={11 * k} ry={5 * k} className="load__cup" />
      <path d={`M ${cx} ${mid} V ${pole}`} className="load__pole" />
      <g transform={`translate(${cx} ${pole}) scale(${k})`}>
        {world === "island" ? (
          <path d="M 0 2 Q -10 -4 -16 3 M 0 2 Q 10 -5 17 2 M 0 2 Q -6 -8 -13 -7 M 0 2 Q 7 -8 14 -7" className="load__frond" />
        ) : world === "town" ? (
          <rect x="-6" y="-4" width="12" height="12" rx="3" className="load__lamp" />
        ) : world === "mountain" ? (
          <path d="M 0 -6 L -8 8 H 8 Z M 0 -12 L -6 0 H 6 Z" className="load__pine" />
        ) : (
          <path d="M 0 0 L 20 6 L 0 12 Z" className="load__flag" />
        )}
      </g>
      <g className={holed ? "load__ball load__ball--in" : "load__ball"} style={{ transform: `translateX(${holed ? cx - 16 * k : x}px)` }}>
        <g transform={`translate(0 ${mid - 7 * k}) scale(${k})`}>
          <circle cx="0" cy="0" r="7" className="load__white" />
          <Hat world={world} y={-6} />
        </g>
      </g>
    </svg>
  );
}

/**
 * The loading bar is a putting green: the ball rolls toward the cup as the
 * game loads, and drops in when it is ready — then the Play button pops up.
 */
function Loader({ loading, onDone, world = "garden" }: { loading: boolean; onDone: () => void; world?: string }) {
  const chores = choresOf(world);
  const [p, setP] = useState(rolled);
  // the first line is the prerendered one; a random one once on the client
  // (a random first render would not match the server's HTML)
  const [chore, setChore] = useState(0);
  useEffect(() => {
    if (loading) {
      setChore(Math.floor(Math.random() * chores.length));
      // eases toward the cup without reaching it: the last stretch is the
      // chain's to give
      const t = setInterval(() => setP((v) => (rolled = v + (0.9 - v) * 0.05)), 90);
      const c = setInterval(() => setChore((i) => (i + 1) % chores.length), 1500);
      return () => (clearInterval(t), clearInterval(c));
    }
    rolled = 1;
    setP(1);
    const d = setTimeout(onDone, 650); // the roll in and the drop
    return () => clearTimeout(d);
  }, [loading, onDone, chores.length]);
  return (
    <div className={`load load--${world}`} role="progressbar" aria-label="Loading" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(p * 100)}>
      <Green p={p} world={world} holed={p >= 1} />
      <p key={chore} className="load__chore">{p >= 1 ? "Ready!" : chores[chore % chores.length]}</p>
    </div>
  );
}

/** Points of a sunburst badge, as an SVG polygon. */
const burst = (n: number, r0: number, r1: number, cx = 100, cy = 100) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r0 : r1;
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");

// Before the chain has said which cup a hole is in, the link does: ?hole=…island3.
// Read through useSyncExternalStore: the prerendered page (and the render that
// hydrates it) is the garden's, the client's own render the link's.
const guessWorld = () => {
  const p = new URLSearchParams(window.location.search);
  const h = p.get("world") || p.get("hole") || "";
  return /island/.test(h) ? "island" : /town/.test(h) ? "town" : /mountain/.test(h) ? "mountain" : "garden";
};

// The title's backdrop, one per visit: the promo's textless cut
// (public/title/bg.*) plays first, then cross-fades into the live splash
// (lib/scene/title.ts), which waits, drawn, behind it. Both are kept across
// the two mounts at startup (the page's, while the bundle loads, then the
// game's) by parking them for a moment instead of dropping them. Each visit's
// splash is the next world. Reduced motion, the Low graphics tier and no WebGL
// get a still instead; a data saver, a slow link or no autoplay skip the video.
const SCENES = ["garden", "island", "town", "mountain"];
interface Visit {
  world: string;
  canvas: HTMLCanvasElement | null;
  video: Film | null;
  phase: "video" | "splash";
  p: Promise<TitleScene | null> | null; // its scene, or null
  ready: boolean;
  kill: ReturnType<typeof setTimeout> | undefined;
  notify: () => void;
}
let visit: Visit | null = null;
const nextWorld = () => {
  let i = 0;
  try {
    const was = localStorage.getItem("gnogolf.title");
    i = was == null ? 0 : (Number(was) + 1) % SCENES.length || 0;
    localStorage.setItem("gnogolf.title", String(i));
  } catch {}
  return SCENES[i];
};
const wantsStill = () => {
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return true;
  try {
    const gfx = localStorage.getItem("gnogolf.gfx");
    // Low, or Auto on a device whose frames were slow (the engine's own flag)
    return gfx === "low" || (gfx !== "high" && localStorage.getItem("gnogolf.gfx.auto") === "low");
  } catch {
    return false;
  }
};
const wantsVideo = () => {
  const c = navigator.connection;
  return !(c && (c.saveData || /2g/.test(c.effectiveType || "")));
};
// the best first: AV1, then VP9 (720p), then H.264 (540p): each under ~500 KB, 12 s, 24 fps
const FILM = [
  ["title/bg.av1.webm", 'video/webm; codecs="av01.0.05M.08"'],
  ["title/bg.vp9.webm", 'video/webm; codecs="vp9"'],
  ["title/bg.mp4", 'video/mp4; codecs="avc1.640028"'],
];

/** The film: muted, inline, and nothing fetched until the page is up and idle. */
function makeFilm(v: Visit) {
  const el = document.createElement("video");
  el.className = "title__video";
  el.muted = el.defaultMuted = el.playsInline = true;
  el.preload = "none";
  el.setAttribute("aria-hidden", "true");
  el.disablePictureInPicture = true;
  let waited: ReturnType<typeof setTimeout> | undefined;
  const end = () => {
    clearTimeout(waited);
    if (v.phase === "splash") return;
    v.phase = "splash";
    el.pause(); // it fades out; no decoding behind the splash
    if (v.p) void v.p.then((t) => t && t.go());
    v.notify();
  };
  el.addEventListener("ended", end);
  el.addEventListener("playing", () => clearTimeout(waited));
  // it stops for data half way: a few seconds' grace, then the splash
  el.addEventListener("waiting", () => (clearTimeout(waited), (waited = setTimeout(end, 4000))));
  const load = () => {
    if (visit !== v || v.phase !== "video") return;
    el.poster = "title/bg-poster.webp";
    for (const [src, type] of FILM) {
      const so = document.createElement("source");
      so.src = src;
      so.type = type;
      el.appendChild(so);
    }
    el.lastChild!.addEventListener("error", end); // every source failed
    el.load();
    el.play().catch(end); // no autoplay here
    waited = setTimeout(end, 6000); // a slow link: the splash, rather than a wait
  };
  const idle = () => void ("requestIdleCallback" in window ? requestIdleCallback(load, { timeout: 1500 }) : setTimeout(load, 200));
  if (document.readyState === "complete") idle();
  else addEventListener("load", idle, { once: true });
  return { el, end, stop: () => (clearTimeout(waited), el.pause(), el.replaceChildren(), el.removeAttribute("src"), el.load()) };
}

function useTitleScene(host: RefObject<HTMLDivElement | null>, film: RefObject<HTMLDivElement | null>) {
  const [scene, setScene] = useState<{ world: string; live: boolean; phase: Visit["phase"] } | null>(null);
  useEffect(() => {
    if (!visit) {
      const world = nextWorld(), live = !wantsStill(), canvas = live ? document.createElement("canvas") : null;
      if (canvas) canvas.className = "title__canvas";
      const v: Visit = (visit = { world, canvas, video: null, phase: "splash", p: null, ready: false, kill: undefined, notify() {} });
      if (live && wantsVideo()) (v.phase = "video"), (v.video = makeFilm(v));
      if (live)
        v.p = import("@/lib/scene/title")
          .then((m) => m.makeTitle(canvas!, { world, held: v.phase === "video" }))
          .catch((e: unknown) => (console.warn("gnogolf: no live title", e), null));
    }
    const v = visit;
    clearTimeout(v.kill);
    if (host.current && v.canvas) host.current.appendChild(v.canvas);
    if (film.current && v.video) {
      film.current.appendChild(v.video.el);
      // taken out of the page between the two mounts, it paused: on again
      if (v.phase === "video" && v.video.el.currentSrc && v.video.el.paused) v.video.el.play().catch(v.video.end);
    }
    let on = true;
    const show = () => on && setScene({ world: v.world, live: v.ready, phase: v.phase });
    v.notify = show;
    show();
    if (v.p) void v.p.then((t) => {
      if (!t || !on) return;
      v.ready = true;
      t.resize();
      if (v.phase === "splash") t.go();
      show();
      if (/[?&]camlog/.test(location.search)) (window.__title = t), (window.__titleFilm = v.video); // the perf probe's hook
    });
    return () => {
      on = false;
      v.kill = setTimeout(() => {
        if (visit !== v) return;
        visit = null;
        if (v.canvas) v.canvas.remove();
        if (v.video) v.video.stop(), v.video.el.remove();
        if (v.p) void v.p.then((t) => t && t.destroy());
      }, 400);
    };
  }, [host, film]);
  return scene;
}

const noSubscribe = () => () => {};
const onServer = () => "garden";

/** The title screen. Kept free of three.js so it can show while the game's
 *  bundle is still loading: the first thing on screen is the last thing to go.
 *  The line under the button is fixed text: it shows while the chain is still
 *  being reached, so it must not depend on anything the chain answers. */
export default function Title({ onStart, loading = false, world: given }: { onStart?: () => void; loading?: boolean; world?: string }) {
  const guessed = useSyncExternalStore(noSubscribe, guessWorld, onServer);
  const world = given || guessed;
  // the loader shows until the game is ready and the ball has dropped; coming
  // back to the title later skips it
  const [ready, setReady] = useState(!loading && rolled >= 1);
  useEffect(() => {
    if (loading) setReady(false);
  }, [loading]);
  const done = useCallback(() => setReady(true), []);
  const host = useRef<HTMLDivElement>(null), film = useRef<HTMLDivElement>(null);
  const scene = useTitleScene(host, film);
  // ?titlebake (dev): the stills' baker, for the title bake script
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" && /[?&]titlebake/.test(location.search)) void import("@/lib/scene/title").then((m) => (window.__titleStill = m.titleStill));
  }, []);
  const start = () => (sound("start"), onStart?.());
  // once ready, a click anywhere or Enter starts, like a console's title
  useEffect(() => {
    if (!ready) return;
    const key = (e: KeyboardEvent) => {
      if ((e.key === "Enter" || e.key === " ") && (document.activeElement === document.body || !document.activeElement)) (e.preventDefault(), sound("start"), onStart?.());
    };
    addEventListener("keydown", key);
    return () => removeEventListener("keydown", key);
  }, [ready, onStart]);
  const sw = scene ? scene.world : null, playing = scene && scene.phase === "video";
  return (
    <div className={"screen screen--title" + (sw ? ` tsky--${sw}` : "") + (ready ? " screen--ready" : "")} onClick={ready ? start : undefined}>
      <div className="title__sky" aria-hidden="true" />
      {sw && (
        <picture className={"title__still" + (scene?.live && !playing ? " title__still--off" : "")} aria-hidden="true">
          <source media="(orientation: portrait)" srcSet={`title/${sw}-p.webp`} />
          <img src={`title/${sw}.webp`} alt="" />
        </picture>
      )}
      <div ref={host} className={"title__stage" + (scene && scene.live && !playing ? " title__stage--on" : "")} aria-hidden="true" />
      <div ref={film} className={"title__film" + (playing ? "" : " title__film--off")} aria-hidden="true" />
      <div className={"title__scrim" + (playing ? " title__scrim--film" : "")} aria-hidden="true" />
      <div className="title">
        <div className="title__logo">
          <div className="title__sun" aria-hidden="true" />
        <svg className="title__art" viewBox="0 0 600 505" aria-label="Gnogolf">
          <defs>
            <path id="arc" d="M 70 330 A 230 230 0 0 1 530 330" />
            <linearGradient id="title-word" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#5fe0a8" />
              <stop offset=".55" stopColor="#2a9d74" />
              <stop offset="1" stopColor="#1c7a5a" />
            </linearGradient>
          </defs>
          <text className="title__word">
            <textPath href="#arc" startOffset="50%" textAnchor="middle">GNOGOLF</textPath>
          </text>
          {/* two clubs crossed behind the badge, heads down, and a ball on its tee */}
          <g className="title__clubs">
            <g transform="rotate(-44 300 330)">
              <rect x="293" y="118" width="14" height="360" rx="7" className="title__shaft" />
              <rect x="289" y="118" width="22" height="62" rx="9" className="title__grip" />
              <path d="M 283 470 L 343 470 Q 355 470 355 482 L 355 492 Q 355 500 345 500 L 283 500 Z" className="title__head" />
            </g>
            <g transform="rotate(44 300 330)">
              <rect x="293" y="118" width="14" height="360" rx="7" className="title__shaft" />
              <rect x="289" y="118" width="22" height="62" rx="9" className="title__grip" />
              <path d="M 317 470 L 257 470 Q 245 470 245 482 L 245 492 Q 245 500 255 500 L 317 500 Z" className="title__head" />
            </g>
          </g>
          <g transform="translate(300 298) scale(1.25) translate(-100 -110)">
            <polygon points={burst(18, 86, 104)} className="title__burst" />
            {/* the outline is the same shapes drawn first with a thick ink
                stroke: it hugs every edge, and no inner line shows */}
            <g className="title__outline">
              <rect x="40" y="100" width="120" height="44" rx="6" />
              <path d="M 40 116 Q 34 190 100 214 Q 166 190 160 116 Q 140 146 100 142 Q 60 146 40 116 Z" />
              <path d="M 32 100 L 100 2 L 168 100 Z" />
              <rect x="26" y="90" width="148" height="20" rx="10" />
            </g>
            <rect x="40" y="100" width="120" height="44" rx="6" className="title__face" />
            <path d="M 40 116 Q 34 190 100 214 Q 166 190 160 116 Q 140 146 100 142 Q 60 146 40 116 Z" className="title__beard" />
            <path d="M 32 100 L 100 2 L 168 100 Z" className="title__hat" />
            <rect x="26" y="90" width="148" height="20" rx="10" className="title__hat" />
            <circle cx="80" cy="120" r="7" className="title__ink" />
            <circle cx="120" cy="120" r="7" className="title__ink" />
            <circle cx="100" cy="134" r="9" className="title__nose" />
          </g>
        </svg>
        </div>
        <p className="title__tag">mini-golf on-chain</p>
        {ready ? (
          <Button variant="primary" className="btn--play btn--cta btn--pop btn--start" aria-label="Play" onClick={(e) => (e.stopPropagation(), start())}>
            <span className="hint--mouse">Click to start</span>
            <span className="hint--touch">Tap to start</span>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12 H18 M13 6 L19 12 L13 18" /></svg>
          </Button>
        ) : (
          <Loader loading={loading} onDone={done} world={world} />
        )}
        <ul className="title__facts">
          <li>
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M8 4 H21 L26 9 V28 H8 Z" className="fi fi--paper" />
              <path d="M21 4 V9 H26" className="fi" />
              <path d="M12 14 H22 M12 18 H22 M12 22 H17" className="fi" />
              <circle cx="22" cy="23" r="3.5" className="fi fi--red" />
            </svg>
            <span><b>Every hole</b> is a smart contract</span>
          </li>
          <li>
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M9 6 L16 16 L23 6" className="fi" />
              <path d="M16 16 V28" className="fi" />
              <path d="M9 6 Q16 24 23 6" className="fi fi--band" />
              <circle cx="16" cy="19" r="3.5" className="fi fi--paper" />
            </svg>
            <span><b>Pull back</b> and let go, like a slingshot</span>
          </li>
          <li>
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M10 5 H22 V12 Q22 19 16 19 Q10 19 10 12 Z" className="fi fi--gold" />
              <path d="M10 8 H6 Q6 14 10 14 M22 8 H26 Q26 14 22 14" className="fi" />
              <path d="M16 19 V24 M11 28 H21 V24 H11 Z" className="fi" />
            </svg>
            <span><b>Free to play</b> · save your score on-chain</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

