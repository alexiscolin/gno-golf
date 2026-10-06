# ADR-008: A gnome's traits, encoded

## Status

Accepted, 2026-10-06. Built: `web/lib/gnomes/codec.ts`, `vocab.ts`,
`props.ts`, `skin.ts`. The byte table: `docs/gnomes/design.md`, section 6.

## Context

The realm stores each token's look and draws its portrait from it; the
client draws the ball from it, on a ghost and on the boards; a later client,
or a later series, will know traits an older one does not. Storage is paid
per byte. The spec's draft proposed 18 bytes in hex; the collection as
designed needs a few more fields (series, home, archetype, an accent colour,
an Epic's prop) and more than 16 small things worn.

## Decision

- **One byte a field, as lowercase hex, the format first** (format 1: 29
  bytes, 58 characters). A field is a code into an append-only table
  (`vocab.ts`, `props.ts`, mirrored in `data/gnomes.json`'s `vocab`), a
  colour an index into an 84-colour palette (255: none), the things worn a
  32-bit mask. Tiers and earned kinds keep the spec's codes; the first 27
  colours are those `GNOMES` uses, so an earned gnome writes as drawn.
- **Unknown is plain, never an error.** A code past its table, a colour past
  the palette or a mask bit past the table draws the plain form of that
  field; a shorter string leaves the rest plain; **extra bytes are
  ignored**. New fields are only ever appended, so an older reader reads
  what it knows and a newer one draws more of an old token, never less.
- **The format changes only when a field's meaning does.** A reader that
  meets a format it does not know draws the Classic under the token's name
  (`skinOfTraits`).
- **Tables are append only.** A new hat, piece, material, effect, prop or
  colour is a mesh in `scene/` and a last entry in its table; a test pins
  the codes the Genesis series carries.
- **Earned gnomes are their kind alone**: the game draws them from `GNOMES`,
  so their look stays the game's.

## Consequences

- 58 bytes a token: about 42 KB of table for 720, against the spec's 18 ×
  777. Still a table string, still paid once at deploy.
- The realm's portrait code must read the same tables and the same
  fallbacks; `data/gnomes.json` carries them for it.
- An Epic's prop is a code, its shape data in `props.ts`: the realm's
  portrait can draw a generic mark for it, the game the real thing.
