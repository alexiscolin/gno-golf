"use client";

import { useCallback, useEffect, useState } from "react";
import { sound } from "@/lib/feel";
import { Button } from "@/components/ui";

// What the gnomes are up to while the game loads. Silly on purpose: a wait
// reads shorter when something is going on.
// What the gnomes are up to, cup by cup. Silly on purpose.
const CHORES = {
  garden: ["Waking the gnomes…", "Mowing the greens…", "Planting mushrooms…", "Oiling the windmill…", "Asking the chain nicely…", "Filling the ponds…", "Hiding the moles…", "Straightening hats…"],
  island: ["Raking the sand…", "Chasing crabs…", "Waxing the palm trees…", "Counting the waves…", "Asking the chain nicely…", "Building sandcastles…", "Shooing the seagulls…"],
  mountain: ["Waxing the skis…", "Shovelling the snow…", "Knitting bobble hats…", "Asking the chain nicely…", "Warming the chalet…", "Counting the pines…"],
  town: ["Lighting the lamps…", "Baking bread…", "Sweeping the cobbles…", "Winding the clock tower…", "Asking the chain nicely…", "Painting the rooftops…", "Ringing the tram bell…"],
};
export const choresOf = (world) => CHORES[world] || CHORES.garden;

/** The loader ball's hat, the curtain's hat: each cup wears its own. */
export function Hat({ world, x = 0, y = 0, k = 1, className = "" }) {
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
 * The loading bar is a putting green: the ball rolls toward the cup as the
 * game loads, and drops in when it is ready — then the Play button pops up.
 */
/**
 * The putting green the loader and the cup cards share: a track, its mown part
 * up to p (0..1), the ball in its cup's hat at that point, the cup and its
 * flag (a palm on the island, a lamp in town) at the end.
 */
export function Green({ p, world = "garden", holed = false, thick = false }) {
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

function Loader({ loading, onDone, world = "garden" }) {
  const chores = choresOf(world);
  const [p, setP] = useState(rolled);
  const [chore, setChore] = useState(() => Math.floor(Math.random() * chores.length));
  useEffect(() => {
    if (loading) {
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
const burst = (n, r0, r1, cx = 100, cy = 100) =>
  Array.from({ length: n * 2 }, (_, i) => {
    const a = (i / (n * 2)) * Math.PI * 2 - Math.PI / 2, r = i % 2 ? r0 : r1;
    return `${(cx + Math.cos(a) * r).toFixed(1)},${(cy + Math.sin(a) * r).toFixed(1)}`;
  }).join(" ");

/** The title screen. Kept free of three.js so it can show while the game's
 *  bundle is still loading: the first thing on screen is the last thing to go. */
// The line under the button is fixed text: it shows while the chain is still
// being reached, so it must not depend on anything the chain answers.
// Before the chain has said which cup a hole is in, the link does: ?hole=…island3
const guessWorld = () => {
  if (typeof window === "undefined") return "garden";
  const p = new URLSearchParams(window.location.search);
  const h = p.get("world") || p.get("hole") || "";
  return /island/.test(h) ? "island" : /town/.test(h) ? "town" : /mountain/.test(h) ? "mountain" : "garden";
};

export default function Title({ onStart, loading = false, world }) {
  world = world || guessWorld();
  // the loader shows until the game is ready and the ball has dropped; coming
  // back to the title later skips it
  const [ready, setReady] = useState(!loading && rolled >= 1);
  useEffect(() => {
    if (loading) setReady(false);
  }, [loading]);
  const done = useCallback(() => setReady(true), []);
  return (
    <div className="screen">
      <div className="screen__frame" />
      <div className="screen__dots" />
      <div className="title">
        <svg className="title__art" viewBox="0 0 600 505" aria-label="Gnogolf">
          <defs>
            <path id="arc" d="M 70 330 A 230 230 0 0 1 530 330" />
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
        <p className="title__tag">“mini-golf on-chain”</p>
        {ready ? (
          <Button variant="primary" className="btn--play btn--cta btn--pop" onClick={() => (sound("start"), onStart())}>
            Play
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

