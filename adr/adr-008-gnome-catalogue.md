# ADR-008: The gnome catalogue as data, in series and waves

## Status

Accepted, 2026-10-06. Built: `data/gnomes/`, `data/gnomes.json`,
`web/lib/gnomes/`, `scripts/gnomes.ts`. The realm that sells them
(`r/gnogolf/gnomes`, ADR-007) reads the catalogue and is not part
of this. The rules themselves: `docs/gnomes/design.md`.

## Context

The collection is 720 gnomes now (504 Common, 144 Rare, 65 Epic, 7
Legendary, the user's supply), and more later: seasonal drops. Each token's
look, name and line must be known before anything is sold, written down
once, and read by three readers that must agree: the realm (its table and
portraits), the client (the ball, the ghost, the boards) and the screens
(gallery, token page, mint, locker). The research brief recommends selling
in waves, one home of the course at a time, each opened as a range of ids,
with prices and windows the owner sets between waves.

Writing 720 gnomes by hand would make them inconsistent; generating them at
random would make them noise and could not be reviewed. The Epics and
Legendaries are worth designing one by one; the Commons and Rares are worth
designing as a system.

## Decision

- **A series is data.** `data/gnomes/series.json` holds every series: its
  code, first id, supply per tier, waves (one home each), generator seed and
  the realm's starting sale settings. It is the one place a count is
  written; ids, waves and per-wave counts are derived (`planSeries`).
  `data/gnomes/<series>/` holds its recipe: archetypes with curated
  palettes, names and lines (`archetypes.json`), and the hand designs
  (`epics.json`, `legendaries.json`). A new drop is a new entry and folder:
  no code.
- **Ids run by wave.** Each wave is one run of ids, its Commons, Rares,
  Epics and Legendary in turn, the tiers shared evenly over the waves, so
  the realm opens a wave as one range. (The spec's draft ran ids by tier:
  1–500 Common; a wave would then be four ranges.)
- **The catalogue is made, never edited.** `scripts/gnomes.ts` (`npm run
  gnomes`) writes `data/gnomes.json`: every series with its plan, every
  token's id, series, wave, tier, home, archetype, name, line, traits
  (ADR-009) and skin, the code tables, and the nine earned gnomes' traits.
  The generator is deterministic from the seed; `--check` (in
  `scripts/check.sh`) fails if the file is not what the data makes.
- **The Commons and Rares are a system**: each an archetype (a look that
  belongs together) in one of its palettes, with a beard and at most two of
  its things; a Rare one fewer plus a pattern or piece, and a ribbon trail.
  Candidates are taken palette by palette, each kept only if it passes every
  rule and stands far enough from every gnome already made and from the
  fourteen of `GNOMES`.
- **The rules are code, run on the data** (`validate.ts`): the plan, names
  and lines, each tier's traits, readability on every lane and as a ghost,
  no earned gnome's signature, no two alike. The tests hold the catalogue
  to none failing.
- **No twins at ball size** (added 2026-10-06, after the user's review
  found 61 pairs differing only by a beard and a small thing): any two
  gnomes differ in at least three visual fields, one of them a main one
  (the hat's shape or colour, the body's colour or pattern, a material, a
  prop). To give each Common its own hat-and-coat, a palette is known by its
  key colour and worn with any colour of its archetype's wardrobe.
- **The realm's rows are made and checked here** (`scripts/gnomerows.ts`):
  `id|tier|name|traits`, ids following on, fields the realm accepts, and
  each row's tier equal to its traits' tier byte, which the realm stores
  apart and does not compare.
- **The screens read pure functions** of `web/lib/gnomes/` (`entryOf`,
  `filterGnomes`, `traitRows`, `TIER_LOOK`, `skinOfTraits`) over the
  catalogue: no 3D needed to list, sort, filter or describe a gnome.

## Consequences

- Changing a palette, a line or a design and running `npm run gnomes`
  reshapes the catalogue; once a series is on chain its catalogue is frozen
  in the realm, and only a new series may change. The seed and the data are
  committed, so the catalogue can always be made again, byte for byte.
- The sale settings live beside the supply but are only starting values:
  the realm's own `Collection()` is the truth once deployed.
- Generated looks are only as varied as the recipe: an archetype short of
  looks fails the build ("has only n looks apart") rather than repeating one.
