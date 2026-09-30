"use client";


// The forecast for the stroke, bottom left: a gnome's weathervane — his hat is
// the arrow and points where the wind blows (the board as seen: right is +x,
// down the screen is +y) — a windsock for how hard, and what falls from the sky.
// A storm's flashes are the scene's (flash counts them): the screen lights
// up with the 3D lightning, not on a clock of its own. A clear night's sky is
// the moon (night: the hole's time of day). Underground (the Crystal Mines)
// the same four kinds go by a mine's names, a lantern for a sky: still air,
// a draught, dripping, lights out; a dark gallery says its lamp's reach.
import { useEffect, useState } from "react";
import { InfoTip } from "@/components/ui";
import type { WeatherNow } from "@/lib/scene/weather";
import { sight } from "@/lib/scene/data";

export default function Weather({ w: given, flash = 0, until = null, night = false, world = "", dark = false }: { w: WeatherNow | null; flash?: number; until?: number | null; night?: boolean; world?: string; dark?: boolean }) {
  // how long this weather lasts: the chain's period ends at until (epoch ms);
  // said in minutes, which a drifting clock spoils less than a time of day
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);
  // a clear sky still says so, when the chain gives the round a forecast
  if (!given && !until) return null;
  const w: Partial<WeatherNow> = given || {};
  const s = w.wind ? Math.hypot(w.wind[0], w.wind[1]) : 0;
  const deg = w.wind ? (Math.atan2(w.wind[1], w.wind[0]) * 180) / Math.PI : 0;
  // the chain's push per substep, on four steps: breeze, wind, strong, gale
  const force = !s ? 0 : s < 0.05 ? 1 : s < 0.09 ? 2 : s < 0.13 ? 3 : 4;
  const mine = world === "mines"; // (the chain's kinds as the mines name them: About's rules say the same)
  const NAMES = mine ? ["Still air", "Draught", "Draught", "Strong draught", "Strong draught"] : ["Calm", "Breeze", "Wind", "Strong wind", "Gale"];
  const [RAIN, FOG] = mine ? ["Dripping", "Lights out"] : ["Rain", "Fog"];
  const sky = w.storm ? "storm" : w.rain ? "rain" : w.snow ? "snow" : w.fog ? "fog" : "sun";
  const said = [w.wind && `${NAMES[force].toLowerCase()}, force ${force} of 4`, w.rain && `${RAIN.toLowerCase()}, the green runs fast`, w.snow && "snow, the green runs slow", w.fog && FOG.toLowerCase(), w.storm && "storm", dark && "a dark gallery"]
    .filter(Boolean)
    .join(" · ");
  // what it does to the ball, said on a tap
  const note = [w.wind && `${NAMES[force]}, force ${force}/4: it pushes the ball on the chain; the aim dots include it.`,
    w.rain && (mine ? "Dripping: the green and the crystal ice run faster, and puddles slow the ball." : "Rain: the green runs fast, and puddles slow the ball."),
    w.fog && (mine ? `Lights out: the aim dots stop ${sight(true, dark)} units ahead.` : "Fog: the far end is hard to see."), w.storm && "Storm: gusts come and go.", w.snow && "Snow: the green runs slow.",
    dark && !w.fog && `A dark gallery: your lamp lights the aim dots ${sight(false, true)} units ahead.`]
    .filter(Boolean)
    .join(" ") || (mine ? "Still air: nothing pushes the ball." : "A clear sky: nothing pushes the ball.");
  return (
    <>
      {/* the card is the button: what it does to the ball, a tap away */}
      <InfoTip className="card card--weather" label={`Weather: ${said || (mine ? "still air" : "clear")}. What it does`} note={note}>
        <svg viewBox="0 0 64 64" className="weather__vane" aria-hidden="true">
          <circle cx="32" cy="32" r="29" className="wv__dial" />
          {["N", "E", "S", "W"].map((l, i) => (
            <circle key={l} cx={32 + Math.sin((i * Math.PI) / 2) * 24} cy={32 - Math.cos((i * Math.PI) / 2) * 24} r="2" className="wv__tick" />
          ))}
          {w.wind ? (
            <g transform={`rotate(${deg} 32 32) translate(32 32) scale(${0.7 + force * 0.1}) translate(-32 -32)`}>
              <path d="M 12 32 H 40" className="wv__rod" />
              <path d="M 12 26 L 18 32 L 12 38" className="wv__tail" />
              {/* the hat is the arrowhead */}
              <path d="M 38 22 L 54 32 L 38 42 Z" className="wv__hat" />
              <rect x="35" y="20" width="5" height="24" rx="2.5" className="wv__brim" />
            </g>
          ) : (
            <circle cx="32" cy="32" r="6" className="wv__calm" />
          )}
        </svg>
        <div className="weather__side">
          <svg viewBox="0 0 40 28" className="weather__sky" aria-hidden="true">
            {mine ? (
              // a lantern for the sky: lit, dripping, or out
              <>
                <path d="M 16 7 Q 20 1 24 7" className="wv__rod" />
                <rect x="14" y="7" width="12" height="14" rx="3.5" className={sky === "fog" ? "ws__cloud ws__cloud--dark" : "ws__sun"} />
                {sky === "rain" && <path d="M 8 18 v 5 M 32 14 v 5 M 30 24 v 3" className="ws__rain" />}
                {sky === "fog" && <path d="M 6 25 H 34" className="ws__fog" />}
              </>
            ) : sky === "sun" && (night ? <path d="M 24 7.07 A 8 8 0 1 0 24 20.93 A 7 7 0 0 1 24 7.07 Z" className="ws__moon" /> : <circle cx="20" cy="14" r="8" className="ws__sun" />)}
            {!mine && sky !== "sun" && <path d="M 8 20 Q 4 20 4 16 Q 4 11 10 11 Q 12 5 19 6 Q 25 5 27 11 Q 35 10 35 16 Q 35 20 30 20 Z" className={"ws__cloud" + (sky === "storm" ? " ws__cloud--dark" : "")} />}
            {!mine && sky === "rain" && <path d="M 12 23 l -2 4 M 20 23 l -2 4 M 28 23 l -2 4" className="ws__rain" />}
            {sky === "storm" && <path d="M 21 19 L 16 25 H 21 L 18 28" className="ws__bolt" />}
            {!mine && sky === "fog" && <path d="M 6 24 H 34 M 10 27 H 30" className="ws__fog" />}
            {sky === "snow" && <path d="M 12 24 v 4 M 10 26 h 4 M 20 23 v 4 M 18 25 h 4 M 28 24 v 4 M 26 26 h 4" className="ws__fog" />}
          </svg>
          <span className="weather__say">{w.storm ? "Storm" : w.rain ? RAIN : w.snow ? "Snow" : w.fog ? FOG : w.wind ? NAMES[force] : mine ? NAMES[0] : "Clear"}</span>
          {force > 0 && (
            <span className="weather__force" aria-hidden="true">
              {[1, 2, 3, 4].map((k) => <i key={k} className={k <= force ? "on" : ""} style={{ height: 4 + k * 2 }} />)}
              <b>{force}/4</b>
            </span>
          )}
          {until && <span className="weather__until">{until - now > 60000 ? `for ${Math.ceil((until - now) / 60000)} min` : "changing soon"}</span>}
        </div>
      </InfoTip>
      {flash > 0 && <div key={flash} className="lightning" aria-hidden="true" />}
    </>
  );
}
