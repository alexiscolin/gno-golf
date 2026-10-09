// A hole drawn from above in a round inked window, as a cup's diorama: a
// duel's rival's best hole with their ghost's path (Modes.tsx), a Builder's
// starter or draft (components/builder/Start.tsx), a community hole's card
// (Worlds.tsx). Flat SVG: no WebGL, as many on a screen as it needs.
import { useEffect, useId, useState } from "react";
import type { Chain } from "@/lib/chain";
import { Frame } from "@/components/Worlds";
import { mapFit, mapView, mapZone, pathD, railRuns, type MapHole, type MapKind } from "@/lib/duel";
import { BALL_R, cupRadius, inSea } from "@/lib/terrain";
import type { Vec2, Zone } from "@/lib/types";

/** A hole from above, in a round window as a cup's diorama, in
 *  its cup's colours (the ground round the rails, the lane's felt inside
 *  them): its rails (a moving one dashed red), posts, what the ball meets
 *  (water, a drop, sand, ice, a slope's fall, what passes over or under), the
 *  tee and the cup, framed on the hole's shape; a ghost's path on it in
 *  ink, drawn again, the ball rolling along it, under the pointer (CSS).
 *  No path: the hole alone. */
export function HoleMap({ hole, path = [], className = "rival__map" }: { hole: MapHole; path?: readonly Vec2[]; className?: string }) {
  const lane = useId(), { at, k } = mapView(mapFit(hole, path), hole), line = pathD(path, at);
  const [cx, cy] = at(hole.cup), [tx, ty] = at(hole.start);
  // (the mines' board frame, out in the void, is the chain's and not drawn: course.ts inSea)
  const rails = (moving: boolean) => railRuns(hole.walls.filter((w) => !!w.every === moving && !(hole.world === "mines" && inSea(w, hole.zones))));
  const [still, gates] = [rails(false), rails(true)].map((runs) => runs.map((run) => pathD(run, at)).join(""));
  // the lane: the rails' closed runs (one inside another, a hole in it) and a rail-less lane's outline
  const closed = (run: readonly Vec2[]) => run.length > 3 && at(run[0]).join() === at(run[run.length - 1]).join();
  const outside = hole.zones.filter((z) => z.outside && z.poly);
  const felt = [...rails(false).filter(closed), ...outside.map((z) => [...z.poly!, z.poly![0]])].map((run) => pathD(run, at)).join("");
  const zones = hole.zones.filter((z) => !z.outside).map((z) => ({ z, kind: mapZone(z) }));
  return (
    <Frame className={`${className} tint--${hole.world}`}>
      <defs><clipPath id={lane}><path d={felt} clipRule="evenodd" /></clipPath></defs>
      <rect width="120" height="120" className="map__turf" />
      {/* a lane with no rails: the sea or the drop round it, then the lane over it */}
      {outside.map((z, i) => <ZoneShape key={i} z={{ ...z, poly: undefined }} kind={mapZone(z) || "pond"} at={at} />)}
      <path d={felt} className="map__felt" />
      <g clipPath={felt ? `url(#${lane})` : undefined}>
        {zones.map(({ z, kind }, i) => kind && <ZoneShape key={i} z={z} kind={kind} at={at} />)}
      </g>
      {/* the rails: inked, paper on top (a moving one, red and dashed) */}
      <path d={still + gates} className="map__walls" />
      <path d={still} className="map__rails" />
      <path d={gates} className="map__rails map__rails--moving" />
      {hole.posts.map((p, i) => <circle key={i} cx={at(p.c)[0]} cy={at(p.c)[1]} r={Math.max(p.r * k, 1.5)} className="map__post" />)}
      <circle cx={tx} cy={ty} r="2.6" className="map__tee" />
      <circle cx={cx} cy={cy} r={Math.max(cupRadius(hole) * k, 2.5)} className="map__cup" />
      {path.length > 0 && (
        <>
          <path d={line} pathLength={100} className="map__line" />
          <circle r={Math.max(BALL_R * k, 2.4)} className="map__ball" style={{ offsetPath: `path("${line}")` }} />
        </>
      )}
      <path d={`M${cx} ${cy}V${cy - 16}`} className="w__pole" />
      <path d={`M${cx} ${cy - 16}l10 3.5l-10 3.5z`} className="w__flag" />
    </Frame>
  );
}

/** A zone on a map: its outline (a polygon's own, a round one's, its box's),
 *  filled as what it does; a slope's fall, a chevron along it. */
function ZoneShape({ z, kind, at }: { z: Zone; kind: MapKind; at: (p: Vec2) => Vec2 }) {
  const [x0, y0] = at(z.min), [x1, y1] = at(z.max), box = { x: Math.min(x0, x1), y: Math.min(y0, y1), width: Math.abs(x1 - x0), height: Math.abs(y1 - y0) };
  const cls = `map__${kind}`;
  const shape = z.poly ? <path d={pathD([...z.poly, z.poly[0]], at)} className={cls} />
    : <rect {...box} rx={z.round ? box.width / 2 : 2} ry={z.round ? box.height / 2 : 2} className={cls} />;
  if (kind !== "slope") return shape;
  // the fall's way on the map (its turn and flip): a chevron pointing it, at the zone's middle
  const c: Vec2 = [(z.min[0] + z.max[0]) / 2, (z.min[1] + z.max[1]) / 2], [mx, my] = at(c), [fx, fy] = at([c[0] + z.vec[0], c[1] + z.vec[1]]);
  const l = Math.hypot(fx - mx, fy - my) || 1, [ux, uy] = [(fx - mx) / l, (fy - my) / l], r = Math.min(4, box.width / 3, box.height / 3);
  return (<>{shape}{r >= 1.5 && <path d={`M${mx - r * (ux + uy)} ${my - r * (uy - ux)}L${mx + r * ux} ${my + r * uy}L${mx - r * (ux - uy)} ${my - r * (uy + ux)}`} className="map__fall" />}</>);
}

// a version's map, read once a session (its lanes are its id's: they never change); a read that failed is asked again next time
const read = new Map<string, Promise<MapHole>>();
/** The maps of holes on the chain (their HoleState, all a map draws), by id, as each read comes in: only those asked (a list's page). */
export function useHoleMaps(chain: Pick<Chain, "state"> | null, ids: readonly string[]): ReadonlyMap<string, MapHole> {
  const [maps, setMaps] = useState<ReadonlyMap<string, MapHole>>(new Map());
  const key = ids.join(" ");
  useEffect(() => {
    if (!chain) return;
    let live = true;
    for (const id of key.split(" ").filter(Boolean)) {
      let p = read.get(id);
      if (!p) read.set(id, (p = chain.state(id))), p.catch(() => read.delete(id));
      void p.then((m) => live && setMaps((was) => (was.has(id) ? was : new Map(was).set(id, m))), () => {});
    }
    return () => void (live = false);
  }, [chain, key]);
  return maps;
}

/** A map's window, empty: while it reads, or without one. */
export const NoMap = ({ className = "rival__map" }: { className?: string }) => <Frame className={className}><rect width="120" height="120" className="map__turf" /></Frame>;
