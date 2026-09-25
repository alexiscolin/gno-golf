# ADR-002: Holes as data

## Status

Accepted. Amends ADR-001 §3 ("a course is a realm implementing an interface")
for the course's own holes.

## Context

Under ADR-001 every hole was its own realm: 74 hole packages next to
`physics`, `course` and `golf`, each holding its geometry as a decoded Go
value. That has three costs on a live chain:

- **Deposit.** A hole held as a Go object is 37 to 48 times the bytes of the
  same hole in a compact encoding (about 100 KB against 2 KB for a 30-wall
  hole). Deploying 77 packages was estimated to lock several hundred GNOT.
- **Updates.** A published package is frozen at its path. Fixing a hole meant a
  new realm at a new path, a new id, and every client, link and scorecard
  following it by hand.
- **Authority.** Deciding which realms were "the course" needed a rule about
  who deployed or registered them, which was the weakest part of the old
  design.

## Decision

- **A course hole is a GG1 string**: the `course.Simple` it was written as,
  after `Fit`, in a little-endian binary format frozen with the `course`
  package (`course.Encode`, `course.Decode`). It is sent as hex, checked once at
  publish, stored as bytes, and decoded into a `*course.Simple` on every call.
  The decoded hole is never stored.
- **Slots and versions.** The golf realm's owner (its deployer) publishes each
  hole into a slot (`garden/7`). Each publish is a new version with its own id
  (`garden/7/v2`), rounds, records, board and wear. The slot is an alias for the
  current version; writes take exact version ids only.
- **A version is never edited or removed.** A new one archives the old one:
  still playable, its records kept, its bests out of the course-wide ranking.
- **The hole realms stay in the repo as the source.** Each one's test proves
  the hole survives encoding bit for bit (`fingerprint.Check`: the same shots,
  field by field, the same bytes back) and prints its data, which is what
  `data/holes.txt` and the publish scripts are made from. They don't call
  golf, and are never deployed.
- **The open side stays open, as data.** Anyone can publish data of their own
  (`PublishMine`): a community hole, playable and recorded, in no cup and out
  of the course ranking.
- **Every hole is data (final fixes, 2026-09-25).** The first version also let
  a realm register a hole written in code (`Register`, and `Expect` under
  golf's own namespace). The final audit found that golf then runs that code
  in the player's transaction, with the player's storage deposit (a hostile
  hole could pad its own realm on every play and collect the refund later).
  Both are gone: golf only plays data, with its own physics.
- **The owner role is explicit**: one address, checked on the immediate
  caller, that can be handed on in two steps or renounced for good.

## Consequences

- **Storage drops by more than an order of magnitude.** The 74 holes are about
  141 KB of data, 1 to 3 KB each, and three packages are deployed instead of 77.
- **Gas doesn't drop.** Decoding costs about what loading the stored object
  did: a data hole's call measured 95 to 99% of the same hole held as a stored
  object, once the decoder was tuned. The wall offsets are rebuilt from lengths
  stored in the data, without square roots (`physics.PrepareWith`), which is
  what keeps it level. The saving is the deposit, not the gas.
- **Publishing carries the checks**: decoding, the bit-exact length check
  (`course.Exact`), and the canonical-form check, once per version.
- **The format and its limits are frozen.** A hole that needs more walls, zones
  or points than GG1 allows, or a mechanic `course.Simple` can't express, waits
  for a `GG2` in a new `course` version (and a golf that plays it).
- **The owner holds a real power.** Publishing a new version resets that hole's
  ranking, and a stolen key could archive every slot. That is stated on the hub
  page and in the README; `Renounce` exists so the course can be frozen once
  it's settled.
- **Clients follow slots, not paths.** Old realm paths map to slots through
  `data/holes.txt`, and the web client rewrites saved scores and old links.
- **The weather follows the version id**, so a new version has weather of its
  own. That's intended: it's a new hole. It is also a trap for a successor
  realm: a golf/v2 that re-publishes a version gets a new id, so new weather,
  and a best carried over from v1 was played in other weather. A v2 that
  wants imported bests to count as the same hole must seed its weather from
  the v1 id.
- **No hole realm can follow a v2**: none registers anywhere. A successor
  re-publishes the data (`HoleData` gives it back, `Versions` its sha), and
  community authors re-publish theirs.

## Alternatives considered

- **Keep one realm per hole.** Rejected for the deposit and the update story.
- **Store the hole as Gno slices, or as decimal text.** Slices cost several
  times the bytes; decimal text is compact but parsing floats is interpreted
  and far slower on every call.
- **Cache the decoded hole per version in realm state.** Rejected: it stores
  37 to 48 times the bytes, undoing the point, and once the decoder was tuned
  it wasn't cheaper per call.
- **Store the full wall prep instead of three lengths per wall.** Rejected:
  reading the extra floats costs more than rebuilding the prep from the
  lengths.
