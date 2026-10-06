# ADR-010: How a collectible gnome looks, and what he costs

## Status

Accepted, 2026-10-06. Built: `web/lib/scene/gnome-kit.ts`,
`gnome-props.ts`, `gnome-matter.ts`, `gnome-legend.ts`, `gnome-fx.ts`,
`gnome-showcase.ts`, `makeBall`'s hooks in `gnome.ts`; the thumbnails by
`media/gnomes/render.mjs`. Not yet: the engine calling trails and holings in
play. The style guide: `docs/gnomes/design.md`, sections 1 to 4.

## Context

A collectible must read as a Gnogolf gnome at 64 pixels, as the ball in
play, and as a duel's see-through ghost; it must never hide the ball's path
or the cup; it must draw on a phone. Rarity should read before colour does
(for colour-blind players too). The fourteen gnomes of `GNOMES` must not
change by a vertex.

## Decision

- **The game's own drawing**: flat toon bands under a thin ink line, the
  game's light. A tier adds something to the silhouette or the surface:
  a Rare a pattern or a piece and a ribbon trail; an Epic a material (its
  bands and marks: metal, wood, neon, porcelain, stone, glaze, wool,
  gingerbread) and a prop; a Legendary a piece that moves and a material or
  hat of his own. Tier colours (grey, blue, purple, gold) confirm it.
- **`makeBall` takes the collection's traits as optional `Skin` fields**,
  each only acting when set: GNOMES' fourteen take exactly the old path, and
  a test holds a fingerprint of every vertex and material they are drawn
  with.
- **An Epic's prop is data**: a few simple shapes in body, hat or hat-tip
  space (`props.ts`), built and inked by `gnome-props.ts`. The Legendaries'
  pieces are code, each merged in its own frame and kept out of the bake so
  it can move, its particles instanced.
- **Readable and out of the way, by rule**: eyes always read (a white round
  or lit eyes on a dark body), the hat on the body, the gnome on every lane
  and as a ghost; no higher than the tall hat, no wider than 110% of the
  widest of `GNOMES`; a trail behind and under the aim, faint and short; a
  holing after the drop, short, never a flash; none under reduced motion.
- **A budget per tier**, held by a test that builds all 720: 6,000
  triangles for a Common or Rare (the game's heaviest gnome today, the
  Pirate, is 5,772), 6,500 for an Epic, 8,000 for a Legendary; 7 to 12 draws.
  The spec's 5,000 for a Common would have been under what the game already
  ships; instead a Common wears at most two small things.
- **The generator keeps every gnome within budget**: it is given the real
  triangle count of each candidate (`scene/gnome-cost.ts`) and skips one
  over its tier's, as it skips one that breaks any other rule.
- **A released look is final, by test** (added 2026-10-06): a golden record
  of what `makeBall` builds from each token's traits (720 and the nine
  earned kinds, `data/gnomes/looks.golden.json`) fails the tests if any
  gnome draws differently. The writer refuses to change a released series'
  record; a new look for a released gnome is a new trait format, format 1
  keeping its drawing.
- **The wardrobe loads with the first collection gnome** (added 2026-10-06,
  after the review measured 37 KB more on every page's first load): the
  kit, props, materials and Legendary pieces are their own chunk
  (`scene/gnome-dress.ts`, `loadWardrobe()`), put on by the code that
  shows a collection gnome; `makeBall` draws a collection gnome plain
  without it, GNOMES' fourteen never need it.
- **Thumbnails are the game's own render**: the real `makeBall` in headless
  Chrome, one camera, one light, the tier's ground and plinth, 256 px WebP
  under 10 KB; the Legendaries also as turntables (an animated WebP muxed
  from Chrome's own frames, no encoder needed). The esbuild that bundles the
  page is run pinned through npx: no dependency added.

## Consequences

- New traits cost a mesh and a table entry, and must pass the same rules
  and budget; the tests say which gnome broke which.
- Neon and lava glow without a bloom pass: their light is their colour, so
  they read the same on every GPU tier.
- The engine still draws the game's confetti and no trail for every gnome
  until it calls `makeTrail` and `makeHoling`; the picker's `makePreview`,
  the showcase and the turntables already show a Legendary's piece moving.
