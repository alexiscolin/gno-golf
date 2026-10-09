// A piece drawn from above in the board's units (an SVG fragment): a rail
// as a line, a bar as its four corners, a post as its circle, a zone as its
// box, ellipse or polygon; a tunnel's way out dashed to a ring, a hill's
// push as an arrow, as the board draws it.
import { barCorners } from "@/lib/builder/gg1";
import { middleOf } from "@/lib/builder/edit";
import type { Piece, V } from "@/lib/builder/draft";
import { fillOf } from "./look";

const pts = (vs: readonly V[]) => vs.map((v) => `${v[0]},${v[1]}`).join(" ");

/** state: "bad" outlined red (an issue, a ghost that cannot go), "ghost" see-through; hit: only its outline, to pick it by (the 3D board shows the piece itself; outlined red if bad). */
export function PieceShape({ p, state, hit = false }: { p: Piece; state?: "bad" | "ghost"; hit?: boolean }) {
  const g = p.geometry, fill = hit ? "transparent" : fillOf(p.entry), line = state === "bad" ? "#c8322b" : hit ? "transparent" : "#1f2a26", w = state === "bad" ? 2.5 : 1; // (px: non-scaling)
  // a hill on the 3D board: the scene shades it faintly, so its extent dashed and its push's arrow drawn over it (else unseen once placed)
  const hill = hit && !state && !!p.params.dir;
  const common = { fill, stroke: hill ? "rgba(255, 255, 255, .75)" : line, strokeWidth: hill ? 1.5 : w, strokeDasharray: hill ? "6 4" : undefined, opacity: state === "ghost" ? 0.7 : 1, vectorEffect: "non-scaling-stroke" as const };
  let body;
  switch (g.t) {
    case "rail":
      // picked by a band in the board's units (hit: 0.6, to grab it at any zoom), outlined by a line in css px (its first
      // child: what the selection and a hover restyle, never board units: a 3 px stroke would read 3 units, a fat capsule)
      body = hit ? (
        <>
          <line x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} stroke={state === "bad" ? line : "transparent"} strokeWidth={state === "bad" ? 2.5 : 1} strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <line className="board__hit" x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} stroke="transparent" strokeWidth={0.6} strokeLinecap="round" />
        </>
      ) : <line x1={g.a[0]} y1={g.a[1]} x2={g.b[0]} y2={g.b[1]} stroke={state === "bad" ? line : fill} strokeWidth={0.3} strokeLinecap="round" opacity={common.opacity} />;
      break;
    case "bar": body = <polygon points={pts(barCorners(g.a, g.b, g.thick))} {...common} />; break;
    case "post": body = <circle cx={g.c[0]} cy={g.c[1]} r={g.r} {...common} />; break;
    case "poly": body = <polygon points={pts(g.pts)} {...common} fillOpacity={0.85} />; break;
    case "round": body = <ellipse cx={(g.min[0] + g.max[0]) / 2} cy={(g.min[1] + g.max[1]) / 2} rx={(g.max[0] - g.min[0]) / 2} ry={(g.max[1] - g.min[1]) / 2} {...common} fillOpacity={0.85} />; break;
    default: body = <rect x={g.min[0]} y={g.min[1]} width={g.max[0] - g.min[0]} height={g.max[1] - g.min[1]} {...common} fillOpacity={0.85} />;
  }
  const m = middleOf(p), to = p.params.to, dir = p.params.dir;
  return (
    <>
      {body}
      {to && !hit && <><line x1={m[0]} y1={m[1]} x2={to[0]} y2={to[1]} stroke="#1f2a26" strokeWidth={0.12} strokeDasharray="0.4 0.3" /><circle cx={to[0]} cy={to[1]} r={0.6} fill="none" stroke="#1f2a26" strokeWidth={0.15} /></>}
      {dir && <line x1={m[0] - dir[0]} y1={m[1] - dir[1]} x2={m[0] + dir[0]} y2={m[1] + dir[1]} stroke="#fff" strokeWidth={hit ? 2.5 : 0.2} vectorEffect={hit ? "non-scaling-stroke" : undefined} markerEnd="url(#arrow)" pointerEvents="none" />}
    </>
  );
}
