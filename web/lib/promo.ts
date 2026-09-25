// Promo mode (?promo): the trailer's capture rig, off unless the flag is in
// the URL. It hides the HUD, runs the page on a clock it steps one frame at a
// time (so a capture is smooth whatever the machine), lets a script move the
// camera and draw titles over the course, and records the game's own sounds
// into an offline buffer. Driven by the promo renderer via window.__promo.

import { behind, chaseState } from "./chase";
import * as THREE from "three";
import { shotOf } from "./chain";
import { worldOf } from "./scene/worlds";
import { cupOf } from "./card";
import { sound } from "./feel";
import type { Chain } from "./chain";
import type { HoleRow, SimulateRound } from "./types";
import type { Course, Gnome, Hole } from "./scene/data";

/** What the engine hands the rig (engine.ts: promo.attach). */
export interface PromoEngine {
  g: {
    id: string | null;
    s: Hole | null;
    course: Course | null;
    list: readonly HoleRow[] | null;
    started?: boolean;
    view: string;
    flying: boolean;
    done?: boolean;
    period?: number | null;
  };
  chain: Chain;
  fire: (deg: number, power: number) => Promise<void>;
  ball: () => Gnome;
  every?: () => number;
  setClock: (t: number) => void;
}
/** A board point for the camera: [u, y, v, dz]: fractions across and along the board, a height, an extra depth. */
type Key = readonly [number, number, number, number?];
/** A shot's camera (from the promo's shot list): one of four moves and its numbers. */
interface Cam {
  mode?: "follow" | "track" | "orbit" | "keys";
  dur?: number;
  // follow
  deg?: number; turn?: number; back?: number; up?: number; ahead?: number; lookUp?: number; lag?: number;
  // track
  hold?: boolean; off?: readonly number[];
  // orbit
  center?: "ball" | "cup" | Key; a0?: number; speed?: number; r0?: number; r?: number; h0?: number; h?: number;
  // keys
  from?: Key; to?: Key; look?: Key; lookFrom?: Key; lookTo?: Key;
  near?: number; fov0?: number; fov?: number; roll?: number;
}
interface Title {
  html: string;
  at: number;
  to?: number;
  kind?: string;
  y?: number;
  sparkle?: number;
  sfx?: string;
  bounce?: number;
  pulse?: readonly number[];
  tilt3d?: boolean;
  tilt?: number;
}
/** One shot of the trailer: its camera, what fires when, its titles and effects. */
interface Shot {
  cam?: Cam;
  fire?: { at: number; deg: number; power: number; tick?: number | null; done?: boolean }[];
  titles?: Title[];
  paths?: Record<string, SimulateRound>;
  build?: Record<"ground" | "walls" | "drop" | "flag", number>;
  t0?: number; pre?: number; drift?: number;
  ramp?: readonly [number, number, number];
  spin?: number; clockAt?: number | null;
  flash?: number; punch?: number; card?: number | null; blur?: number; dim?: number; whip?: number;
  burst?: number | null; burstOpacity?: number; hits?: readonly number[]; rays?: boolean;
}

// a capture tool: dev builds, or a page opened with ?camlog as well
const on = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("promo") && (process.env.NODE_ENV !== "production" || /[?&]camlog/.test(window.location.search));
const FPS = 30;

let E: PromoEngine | null = null; // the engine's insides, given by attach()
let cfg: Shot | null = null; // the shot being captured
let tt = 0; // the shot's own time, in seconds (negative during the pre-roll)

export const promo = {
  on,
  attach(e: PromoEngine) {
    if (!on) return;
    E = e;
    // ?promo&build: the hole is drawn in pieces (not merged), so they can pop in one by one
    if (new URLSearchParams(window.location.search).has("build")) {
      const state = e.chain.state;
      e.chain.state = async (hole) => ({ ...(await state(hole)), unbaked: true });
    }
  },
  /** Called by the engine's frame, after its own rig: the shot's camera wins. */
  camera(camera: THREE.PerspectiveCamera) { if (on && cfg && cfg.cam) aim(camera, cfg.cam); },
};

if (on) install();

// --------------------------------------------------------------- the clock

function install() {
  const P = performance, realNow = P.now.bind(P), nRaf = window.requestAnimationFrame.bind(window);
  const nSet = window.setTimeout.bind(window), nClear = window.clearTimeout.bind(window);
  let frozen = false, vt = 0, raf: FrameRequestCallback[] = [], ids = 1e9;
  const timers = new Map<number, { at: number; f: TimerHandler; a: unknown[] }>();
  const now = () => (frozen ? vt : realNow());
  P.now = now;
  window.requestAnimationFrame = (f: FrameRequestCallback) => {
    if (frozen) return raf.push(f), raf.length;
    return nRaf(() => (frozen ? raf.push(f) : f(now())));
  };
  window.setTimeout = ((f: TimerHandler, ms = 0, ...a: unknown[]) => {
    if (!frozen) return nSet(f, ms, ...a);
    const id = ++ids;
    timers.set(id, { at: vt + Math.max(0, +ms || 0), f, a });
    return id;
  }) as typeof window.setTimeout;
  window.clearTimeout = ((id?: number) => void (id && id > 1e9 ? timers.delete(id) : nClear(id))) as typeof window.clearTimeout;
  // the same weather particles and confetti every render
  let seed = 7;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  function tick(rate = 1) {
    vt += (1000 / FPS) * rate; // rate < 1: the game in slow motion, the titles and camera at speed
    for (;;) {
      let next: [number, { at: number; f: TimerHandler; a: unknown[] }] | null = null;
      for (const [id, t] of timers) if (t.at <= vt && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      timers.delete(next[0]);
      // (a timer's handler is any function, called with the arguments it was given)
      const f = next[1].f as ((...a: unknown[]) => void) | string;
      try { typeof f === "function" && f(...next[1].a); } catch (e) { console.warn(e); }
    }
    const q = raf;
    raf = [];
    for (const f of q) try { f(vt); } catch (e) { console.warn(e); }
  }

  // sounds go to an offline context on the promo clock, rendered at the end
  let actx: OfflineAudioContext | null = null, t0: number | null = null, tt0 = 0, gt = 0;
  // (constructed with new by feel.ts: a function returning an object gives that object)
  const Offline = function () {
    actx = new OfflineAudioContext(2, 44100 * 24, 44100);
    Object.defineProperty(actx, "currentTime", { get: () => (t0 == null ? 0 : Math.max(0, tt - tt0)) });
    return actx;
  } as unknown as typeof AudioContext;
  window.AudioContext = Offline;
  (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext = Offline;

  const css = document.createElement("style");
  css.textContent = `
    #stage ~ *:not(.wet):not(#promo), nextjs-portal { display: none !important; }
    #stage { transform-origin: 50% 50%; }
    #promo { position: fixed; inset: 0; z-index: 9999; pointer-events: none; overflow: hidden;
      font-family: Fredoka, ui-rounded, system-ui, sans-serif; }
    #promo .flash { position: absolute; inset: 0; background: #fffdf6; opacity: 0; }
    #promo .vig { position: absolute; inset: 0; background: radial-gradient(ellipse at 50% 55%, transparent 55%, rgba(20,65,52,.35) 100%); }
    #promo .t { position: absolute; left: 50%; top: 50%; display: grid; justify-items: center; gap: 6px;
      transform-origin: 50% 50%; white-space: nowrap; opacity: 0; }
    #promo .big { font-weight: 700; font-size: 190px; line-height: .9; letter-spacing: .02em; color: var(--paper, #fdf6e9);
      -webkit-text-stroke: 16px #144134; paint-order: stroke fill; text-shadow: 0 14px 0 #144134, 0 26px 40px rgba(20,65,52,.35); }
    #promo .big b { color: #f5b83d; font-weight: 700; }
    #promo .big i { color: #e0524b; font-style: normal; }
    #promo .sub { font-weight: 700; font-size: 46px; letter-spacing: .08em; text-transform: uppercase; color: #fdf6e9;
      background: #226c57; border: 6px solid #144134; border-radius: 999px; padding: 6px 34px 8px;
      box-shadow: 0 8px 0 #144134; margin-top: 18px; }
    #promo .logo { width: 900px; overflow: visible;
      filter: drop-shadow(7px 0 0 #fdf6e9) drop-shadow(-7px 0 0 #fdf6e9) drop-shadow(0 7px 0 #fdf6e9) drop-shadow(0 -7px 0 #fdf6e9)
        drop-shadow(0 4px 0 #144134) drop-shadow(0 4px 0 #144134) drop-shadow(0 4px 0 #0e3027) drop-shadow(0 22px 30px rgba(10,30,24,.5)); }
    #promo .burst { position: absolute; left: 50%; top: 46%; width: 2800px; height: 2800px; margin: -1400px 0 0 -1400px; opacity: 0;
      background: repeating-conic-gradient(#f5b83d 0deg 7.5deg, #f8c65c 7.5deg 15deg);
      -webkit-mask-image: radial-gradient(circle, #000 12%, rgba(0,0,0,.7) 26%, transparent 46%); }
    #promo .rays { position: absolute; left: 50%; top: 46%; width: 2400px; height: 2400px; margin: -1200px 0 0 -1200px; opacity: 0;
      background: repeating-conic-gradient(rgba(255,250,235,.55) 0deg 2.5deg, transparent 2.5deg 22deg); mix-blend-mode: screen;
      -webkit-mask-image: radial-gradient(circle, #000 6%, rgba(0,0,0,.5) 22%, transparent 44%); }
    #promo .drift { position: absolute; left: 0; top: 0; border-radius: 50% 8% 50% 8%; }
    #promo .spk { position: absolute; width: 110px; height: 110px; margin: -55px 0 0 -55px; transform: scale(0); }
    #promo .pcard { position: absolute; inset: 0; background: linear-gradient(178deg, #fdebcf 0%, #f3ddc2 38%, #bfd9cc 100%); opacity: 0; }
    #promo .pcard::after { content: ""; position: absolute; inset: 0;
      background-image: radial-gradient(circle, rgba(34,108,87,.45) 2px, transparent 2.6px); background-size: 18px 18px;
      -webkit-mask-image: linear-gradient(to top, #000 10%, transparent 55%); }
    #promo .cta { font-weight: 700; font-size: 64px; color: #fdf6e9; background: #226c57; border: 7px solid #144134;
      border-radius: 28px; padding: 14px 54px 20px; box-shadow: 0 12px 0 #144134; letter-spacing: .02em; }
    #promo .url { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-weight: 700; font-size: 38px;
      color: #144134; background: #fdf6e9; border: 5px solid #144134; border-radius: 999px; padding: 6px 28px; margin-top: 26px; }
  `;
  document.head.appendChild(css);

  const layer = document.createElement("div");
  layer.id = "promo";
  layer.innerHTML = `<div class="vig"></div><div class="pcard"></div><div class="burst"></div><div class="rays"></div><div class="flash"></div>`;
  const mount = () => document.body.appendChild(layer);
  document.body ? mount() : document.addEventListener("DOMContentLoaded", mount);

  let titles: (Title & { el: HTMLDivElement })[] = [], pieces: ReturnType<typeof piecesOf> | null = null, heard = new Set<unknown>();
  const drifts: { el: HTMLDivElement; i: number }[] = [];
  // the confetti and leaves drifting past in front of a logo: seeded, so the same every render
  const DRIFT_COLORS = ["#e0524b", "#f5b83d", "#60ab96", "#fdf6e9", "#e98fb0", "#226c57"];
  function drift() {
    for (const { el, i } of drifts) {
      const r = (k: number) => ((Math.sin(i * 91.7 + k * 13.1) * 43758.5453) % 1 + 1) % 1;
      const near = r(1) > 0.55, size = near ? 46 + r(2) * 40 : 14 + r(2) * 16;
      const x = ((r(3) * 2400 + tt * (near ? 420 : 160) * (r(4) > 0.5 ? 1 : -1)) % 2400 + 2400) % 2400 - 240;
      const y = r(5) * 1080 + Math.sin(tt * 2 + i) * 40 + tt * (near ? 120 : 50);
      Object.assign(el.style, { width: size + "px", height: size * 0.6 + "px", background: DRIFT_COLORS[i % 6],
        filter: `blur(${near ? 7 : 1.5}px)`, opacity: String(Math.min(1, Math.max(0, tt / 0.3)) * (near ? 0.85 : 0.9)),
        transform: `translate(${x}px, ${y % 1180 - 50}px) rotate(${tt * (90 + r(6) * 200) + i * 40}deg)` });
    }
  }
  // the hole's parts, in buildHole's order: the world and the ground (7), the
  // zones, the walls, the posts, then the cup (with its flag) and the tee
  function piecesOf() {
    const s = E!.g.s!, kids = E!.g.course!.children.slice(), sea = worldOf(s).SEA !== undefined;
    const Z = s.zones.filter((z) => !(sea && z.skin === "sea")).length, P = s.posts.length, n = kids.length;
    return kids.map((o, i): { o: THREE.Object3D; y: number; sy: number; i: number; kind: keyof NonNullable<Shot["build"]> } => ({
      o, y: o.position.y, sy: o.scale.y, i,
      kind: (i < 7 ? "ground" : i < 7 + Z ? "drop" : i < n - 2 - P ? "walls" : i < n - 2 ? "drop" : "flag"),
    }));
  }
  const bounce = (k: number) => {
    const n = 7.5625, d = 2.75;
    if (k < 1 / d) return n * k * k;
    if (k < 2 / d) return n * (k -= 1.5 / d) * k + 0.75;
    if (k < 2.5 / d) return n * (k -= 2.25 / d) * k + 0.9375;
    return n * (k -= 2.625 / d) * k + 0.984375;
  };
  function build() {
    if (!pieces) return;
    const at = cfg!.build!; // { ground, walls, drop, flag }: when each part arrives, in shot seconds
    for (const p of pieces) {
      const k = Math.min(Math.max((tt - at[p.kind] - (p.kind === "ground" ? 0 : (p.i % 5) * 0.03)) / 0.35, 0), 1);
      p.o.visible = k > 0;
      if (p.kind === "drop") p.o.position.y = p.y + 9 * (1 - bounce(k));
      else p.o.scale.y = p.sy * Math.max(0.001, back(k, 2.2));
      if (p.kind === "flag") p.o.scale.x = p.o.scale.z = Math.max(0.001, back(k, 2.2));
    }
    E!.ball().visible = tt >= at.flag;
  }
  const api = {
    /** The hole is built and drawn. */
    ready: () => !!(E && E.g.id && E.g.s && E.g.course && E.g.started),
    info: () => {
      const e = E!, s = e.g.s!;
      return {
        id: e.g.id, name: s.name, world: cupOf(s), board: s.board, cup: s.cup, start: s.start,
        timed: !!s.timed, time: e.g.course!.userData.time, posts: s.posts.length, walls: s.walls.length, zones: s.zones.length,
        zoneList: s.zones, postList: s.posts, every: e.every ? e.every() : 0,
        holes: (e.g.list || []).map((h) => ({ id: h.id, world: cupOf(h), order: h.order, name: h.name })),
      };
    },
    /** The chain's answer for a round of shots on this hole, straight from the RPC. */
    simulate: (shots: [number, number, number?][]) => E!.chain.simulateRound(E!.g.id!, shots.map(([d, p, tick]) => shotOf(d, p, tick ?? null)), E!.g.period),
    /**
     * Sets a shot up and stops the clock. cfg: { cam, fire: [{ at, deg, power }],
     * titles: [{ html, at, to, kind }], flash, punch, card, blur, pre, paths: { "deg,power": result } }
     */
    setup(c: Shot) {
      cfg = c;
      const e = E!;
      tt = (c.t0 || 0) - (c.pre || 0); // t0: a later slice of a shot cut into several page loads
      // the chain's answers were fetched ahead: a replay never waits on the network
      const paths = c.paths || {};
      e.chain.simulateRound = (_id, shots) => {
        const k = shots.map((s) => String(s).split(",").slice(0, 2).join(",")).join(";");
        const r = paths[k] || Object.values(paths)[0];
        if (!r) return Promise.reject(new Error("promo: no cached path for " + k));
        return Promise.resolve(r);
      };
      e.g.view = "ball";
      pieces = c.build ? piecesOf() : null;
      titles = (c.titles || []).map((t) => {
        const el = document.createElement("div");
        el.className = "t";
        el.innerHTML = t.html;
        // a few sparkles pop round a title once it has landed
        for (const [x, y] of SPARKS.slice(0, t.sparkle || 0)) {
          const sp = document.createElement("div");
          sp.className = "spk";
          sp.style.left = x + "%";
          sp.style.top = y + "%";
          sp.innerHTML = STAR;
          el.appendChild(sp);
        }
        layer.insertBefore(el, layer.querySelector(".flash"));
        return { ...t, el };
      });
      frozen = true;
      vt = realNow();
      t0 = vt;
      tt0 = gt = tt;
      heard = new Set();
      for (let i = 0; i < (c.drift || 0); i++) {
        const d = document.createElement("div");
        d.className = "drift";
        layer.insertBefore(d, layer.querySelector(".flash"));
        drifts.push({ el: d, i });
      }
      draw();
      // a frame the browser still owes (asked for before the freeze) joins the queue first
      return new Promise((r) => nRaf(() => nSet(r, 0)));
    },
    /** One frame on: the clock, the game, the camera and the titles. */
    async step(n = 1) {
      const cfg_ = cfg!, e = E!;
      for (let i = 0; i < n; i++) {
        // ramp: [from, to, rate] in shot seconds, the game slowed in between
        const r = cfg_.ramp && tt >= cfg_.ramp[0] && tt < cfg_.ramp[1] ? cfg_.ramp[2] : 1;
        tt += 1 / FPS;
        gt += r / FPS; // the game's own time: fire times are in it
        for (const f of cfg_.fire || []) if (!f.done && gt >= f.at) {
          f.done = true;
          // a timed hole: the pieces stand where the cached path had them when it was let go
          if (f.tick != null) e.setClock(f.tick);
          void e.fire(f.deg, f.power);
        }
        // spin: the timed pieces (a mill's sails) run faster than the idle clock, for a still shot
        if (cfg_.spin && !e.g.flying) e.setClock(tt * cfg_.spin);
        // clockAt: the timed pieces held at one tick (a tram that would sink out of a still shot)
        if (cfg_.clockAt != null && !e.g.flying) e.setClock(cfg_.clockAt);
        tick(r);
        draw();
        // the game's promise chains (a replay's next step) run before the next frame
        await new Promise((r) => nSet(r, 0));
      }
      return { t: tt, flying: e.g.flying, holed: e.g.done, scale: e.ball().scale.x, visible: e.ball().visible, y: e.ball().position.y };
    },
    /** The sounds of the shot, from its time 0, as a 16-bit WAV in base64. */
    async audio(from = 0, dur = 3) {
      if (!actx) return null;
      const buf = await actx.startRendering();
      const sr = buf.sampleRate, s0 = Math.round(from * sr), n = Math.round(dur * sr);
      const out = new DataView(new ArrayBuffer(44 + n * 4));
      const w = (o: number, s: string) => [...s].forEach((c, i) => out.setUint8(o + i, c.charCodeAt(0)));
      w(0, "RIFF"); out.setUint32(4, 36 + n * 4, true); w(8, "WAVEfmt "); out.setUint32(16, 16, true);
      out.setUint16(20, 1, true); out.setUint16(22, 2, true); out.setUint32(24, sr, true); out.setUint32(28, sr * 4, true);
      out.setUint16(32, 4, true); out.setUint16(34, 16, true); w(36, "data"); out.setUint32(40, n * 4, true);
      const L = buf.getChannelData(0), R = buf.getChannelData(1);
      for (let i = 0; i < n; i++) for (const [c, ch] of [[0, L], [1, R]] as const) {
        const v = Math.max(-1, Math.min(1, ch[s0 + i] || 0));
        out.setInt16(44 + i * 4 + c * 2, v * 32767, true);
      }
      let bin = "";
      const u8 = new Uint8Array(out.buffer);
      for (let i = 0; i < u8.length; i += 0x8000) bin += String.fromCharCode(...u8.subarray(i, i + 0x8000));
      return btoa(bin);
    },
  };
  (window as Window & { __promo?: typeof api }).__promo = api;

  const ease = (k: number) => 1 - Math.pow(1 - k, 3);
  const back = (k: number, c = 1.7) => 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2);
  function draw() {
    if (!cfg) return;
    const cfg_ = cfg;
    build();
    const st = document.getElementById("stage")!;
    // a zoom punch on the cut, a white flash, a blur behind a card
    const pk = cfg.punch ? Math.min(Math.max(tt / 0.3, 0), 1) : 1;
    // a whip-pan in: the picture slides in fast from the side, smeared, and settles
    const wk = cfg.whip ? 1 - ease(Math.min(Math.max(tt / 0.2, 0), 1)) : 0;
    st.style.transform = (cfg.punch ? `scale(${1 + cfg.punch * (1 - ease(pk))})` : "") + (wk ? ` translateX(${cfg.whip! * 520 * wk}px) scale(${1 + 0.08 * wk})` : "");
    st.style.filter = (cfg.blur ? `blur(${cfg.blur}px) saturate(1.1)` : "") + (cfg.dim ? ` brightness(${1 - cfg.dim})` : "") + (wk > 0.02 ? ` blur(${(18 * wk).toFixed(1)}px)` : "");
    // the title screen's sunburst behind a logo: it swells in and turns slowly
    const bu = layer.querySelector<HTMLElement>(".burst")!;
    if (cfg.burst != null) {
      const k = Math.min(Math.max((tt - cfg.burst) / 0.35, 0), 1);
      bu.style.opacity = String((cfg.burstOpacity ?? 1) * k);
      bu.style.transform = `scale(${0.6 + 0.4 * back(k)}) rotate(${tt * 8}deg)`;
    } else bu.style.opacity = "0";
    // hits: a 3-frame white flash, a short screen shake and a thud on an accent
    let hit = 0, shk = 0;
    for (const h of cfg.hits || []) {
      const d = tt - h;
      if (d >= 0 && d < 0.1) hit = Math.max(hit, 0.85 - d * 7);
      if (d >= 0 && d < 0.3) shk = Math.max(shk, 1 - d / 0.3);
      if (d >= 0 && !heard.has("h" + h)) heard.add("h" + h), sound("thud");
    }
    const sx = shk ? Math.sin(tt * 97) * 16 * shk : 0, sy = shk ? Math.cos(tt * 83) * 11 * shk : 0;
    layer.style.transform = shk ? `translate(${sx}px, ${sy}px)` : "";
    if (shk) st.style.transform += ` translate(${sx * 0.6}px, ${sy * 0.6}px)`;
    layer.querySelector<HTMLElement>(".flash")!.style.opacity = String(Math.max(hit, cfg.flash ? Math.max(0, 1 - Math.max(tt, 0) / 0.22) * cfg.flash : 0));
    const ry = layer.querySelector<HTMLElement>(".rays")!;
    ry.style.opacity = String(cfg.rays ? Math.min(1, Math.max(0, (tt - 0.1) / 0.4)) * 0.8 : 0);
    ry.style.transform = `rotate(${-tt * 5}deg) translate(${Math.sin(tt) * 20}px, 0)`;
    // parallax: the plate drifts less than the course behind, the logo not at all
    if (cfg.burst != null) bu.style.transform += ` translate(${Math.sin(tt * 0.9) * 30}px, ${Math.cos(tt * 0.7) * 16}px)`;
    drift();
    layer.querySelector<HTMLElement>(".pcard")!.style.opacity = String(cfg_.card != null ? Math.min(1, Math.max(0, (tt - cfg_.card) / 0.25)) : 0);
    for (const t of titles) {
      const k = (tt - t.at) / 0.28, out = t.to != null ? (tt - t.to) / 0.18 : 0;
      if (k < 0 || out >= 1) { t.el.style.opacity = "0"; continue; }
      if (!heard.has(t)) heard.add(t), sound(t.sfx || "whoosh");
      const kk = Math.min(k, 1);
      let s = t.kind === "slam" ? 2.6 - 1.6 * ease(kk) : 0.2 + 0.8 * back(kk, t.bounce || 1.7);
      // a slam shakes as it lands; a title then creeps toward the camera
      const shake = t.kind === "slam" && k > 1 && k < 1.8 ? Math.sin(tt * 90) * 10 * (1.8 - k) : 0;
      s *= 1 + Math.max(0, tt - t.at - 0.28) * 0.025;
      const o = out > 0 ? 1 - out : 1;
      if (out > 0) s *= 1 + out * 0.4;
      // squash and stretch as it lands, and a bump on each accent (pulse)
      const sq = k > 0.7 && k < 1.6 ? Math.sin((k - 0.7) * 7) * 0.07 * (1.6 - k) : 0;
      for (const p of t.pulse || []) if (tt >= p && tt < p + 0.25) s *= 1 + 0.09 * (1 - (tt - p) / 0.25);
      const tilt3d = t.tilt3d ? ` perspective(1400px) rotateY(${Math.sin(tt * 1.3) * 9}deg) rotateX(${Math.cos(tt * 1.1) * 5}deg)` : "";
      t.el.style.opacity = String(Math.min(1, kk * 3) * o);
      t.el.style.transform = `translate(calc(-50% + ${shake}px), calc(-50% + ${(t.y || 0)}px))${tilt3d} rotate(${t.tilt ?? -4}deg) scale(${s * (1 + sq)}, ${s * (1 - sq)})`;
      t.el.querySelectorAll<HTMLElement>(".spk").forEach((sp, i) => {
        const u = (tt - t.at - 0.3 - i * 0.13) / 0.5;
        const on = u > 0 && u < 1;
        sp.style.transform = on ? `scale(${Math.sin(Math.PI * u) * (i % 2 ? 0.8 : 1.2)}) rotate(${u * 120}deg)` : "scale(0)";
      });
    }
  }
}

// where a title's sparkles sit (percent of the title box), and what they look like
const SPARKS = [[8, 30], [90, 20], [18, 82], [84, 74], [50, 2], [64, 92]];
const STAR = `<svg viewBox="-11 -11 22 22" width="110" height="110"><path d="M0-10Q1.8-1.8 10 0Q1.8 1.8 0 10Q-1.8 1.8-10 0Q-1.8-1.8 0-10Z" fill="#fffaf0" stroke="#144134" stroke-width="1.8" stroke-linejoin="round"/></svg>`;

// -------------------------------------------------------------- the camera

const V = () => new THREE.Vector3();
const pos = V(), look = V(), dir = new THREE.Vector3(1, 0, 0), prevBall = V(), tmp = V();
let camInit = false;
const shot = chaseState(); // the follow framing, shared with the game's third-person view

function aim(camera: THREE.PerspectiveCamera, c: Cam) {
  const { g, ball } = E!, s = g.s!, b = s.board, h = (x: number, z: number) => (g.course ? g.course.userData.height(x, z) : 0);
  const B = ball().position, t = Math.max(tt, 0), T = c.dur || 2;
  // [u, y, v, dz]: board fractions across and along, height and an extra depth in units
  const u = (p: Key) => tmp.set(p[0] * b.w, p[1], p[2] * b.h + (p[3] || 0));
  const k = Math.min(Math.max(tt / T, 0), 1), sk = k * k * (3 - 2 * k);
  if (c.mode === "follow") {
    // low behind the ball, looking where it goes: the direction follows its motion
    const d = tmp.subVectors(B, prevBall).setY(0);
    if (!camInit) {
      const a = ((c.deg ?? 0) * Math.PI) / 180;
      dir.set(Math.cos(a), 0, Math.sin(a));
    } else if (d.length() > 0.01) dir.lerp(d.normalize(), 1 - Math.exp(-(c.turn || 2.5) / FPS)).normalize();
    prevBall.copy(B);
    const want = behind(shot, B, dir, { back: c.back || 6, up: c.up || 1.8, ahead: c.ahead || 3, lookUp: c.lookUp ?? 0.2 });
    if (!camInit) pos.copy(want.pos);
    else pos.lerp(want.pos, 1 - Math.exp(-(c.lag || 5) / FPS));
    look.copy(want.look);
  } else if (c.mode === "track" && c.hold && camInit && (ball().scale.x < 0.97 || !ball().visible || B.y < -0.3)) {
    // hold: the ball goes into water or a crevasse, the camera stays where it was and watches it go
  } else if (c.mode === "track") {
    // alongside the ball at a fixed offset, lagging a little
    const want = V().copy(B).add(V().fromArray(c.off || [0, 3, 9]));
    if (!camInit) pos.copy(want);
    else pos.lerp(want, 1 - Math.exp(-(c.lag || 6) / FPS));
    look.copy(B).y += c.lookUp || 0.3;
  } else if (c.mode === "orbit") {
    const ctr = c.center === "ball" ? V().copy(B) : c.center === "cup" ? V().set(s.cup[0], h(s.cup[0], s.cup[1]), s.cup[1]) : u(c.center!).clone();
    const cr = c.r!, ch = c.h!;
    const a = (((c.a0 || 0) + (c.speed || 30) * t) * Math.PI) / 180, r = c.r0 != null ? c.r0 + (cr - c.r0) * sk : cr;
    pos.set(ctr.x + Math.cos(a) * r, ctr.y + (c.h0 != null ? c.h0 + (ch - c.h0) * sk : ch), ctr.z + Math.sin(a) * r);
    look.copy(ctr).y += c.lookUp || 0.4;
  } else {
    // keys: from one [u, y, v] to another (board fractions, height in units)
    pos.lerpVectors(u(c.from!).clone(), u(c.to!).clone(), sk);
    look.lerpVectors(u((c.lookFrom || c.look)!).clone(), u((c.lookTo || c.look)!).clone(), sk);
  }
  camInit = true;
  pos.y = Math.max(pos.y, h(pos.x, pos.z) + 0.7);
  camera.clearViewOffset();
  camera.near = c.near || 0.4;
  camera.far = 420;
  camera.fov = c.fov0 != null ? c.fov0 + ((c.fov || 40) - c.fov0) * sk : c.fov || 40;
  camera.position.copy(pos);
  camera.lookAt(look);
  if (c.roll) camera.rotateZ(((c.roll * (1 - sk)) * Math.PI) / 180);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
}
