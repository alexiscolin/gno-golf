# ADR-006: The hole builder's checks, in the browser

## Status

Accepted for the feasibility step, 2026-10-06. Implements part of the hole
builder's design (`docs/superpowers/specs/2026-10-06-hole-builder-design.md`):
the chain's checks in the browser, the palette and the editor's own checks.
Nothing on chain changes: `PublishMine`, `SetPublishing`, GG1 and golf/v2 stay
as they are.

## Context

A player who makes a hole without writing Go must be told, before signing
anything, exactly what `PublishMine` would say, and the builder must only let
them place what the client draws and what the physics can play. The chain
checks the format, its limits and the gas; it says nothing about how a hole
looks, and accepts a cup inside a wall.

The browser already runs the realm's own physics (`golf.wasm`, ADR-001's aim
preview, built from the deployed `.gno` files by `scripts/wasm.sh` and held to
the realm byte for byte by `scripts/wasmparity.ts`). Every player loads it.

## Decision

- **A second wasm, `builder.wasm`, from the same sources.** `scripts/wasm.sh`
  extracts the realm twice: `golf.go` with the aim preview's roots, and
  `golf_builder.go` with PublishMine's checks too (`newWork`, `worstGas`,
  `maxShotGas`, `maxData`, `validSlug`, `cleanName`, `cleanText`, `linkish`),
  built with `-tags builder`. `golf.wasm` is unchanged, byte for byte: no
  player downloads the builder (187,825 B, 83,973 B gzipped, as before;
  `builder.wasm` 235,743 B, 103,633 B gzipped). `wasm.sh` fails past 300 KB or
  130 KB gzipped.
- **The checks are the realm's code, driven by a hand-written `Check`**
  (`scripts/wasm/r/gnogolf/golf/local_builder.go`): `decodeData`'s steps in
  its order (`course.DecodeChecked`, `course.Encode`'s very bytes, the two
  work bounds), less its sha256, then `publishMineNow`'s slug, name and note
  checks. Extracting `decodeData` whole would link `crypto/sha256`, which in
  TinyGo brings its FIPS module (aes, sha3, gcm, hmac, drbg), and
  `encoding/hex`, which brings `fmt`: measured, 347 KB instead of 235. The
  driver is a mirror of ten lines, and the parity test holds it to
  `PublishMine` itself: every course hole, mutated byte by byte, cut, in
  capitals, with refused slugs and notes, and holes past each of GG1's bounds
  and at both work limits; the refusals compared word for word (20 distinct
  sentences, every branch of `decodeData`), the answers number for number.
- **`Fit` makes a draft publishable with the chain's own code**: the draft GG1
  (written by the page, its wall lengths not read) through `course.Decode`,
  `author.Fit` and `course.Encode`, so no float the chain stores is computed
  in JavaScript. `course/author` is not deployed: it is left out of
  `sources()`, which the page checks against the deployed files, and held to
  the repo's sources by `wasm.sh --check` like the rest.
- **One host for both builds.** `web/lib/sim/wasi.ts` is what golf.wasm's
  host and builder.wasm's share (the WASI imports, a call's strings, a
  refusal kept and a new instance started); `web/lib/builder/wasm.ts` types
  the builder's answers (`Checked`, `Fitted`, `Cost`), the API the editor
  calls.

## Consequences

- **The builder says what the chain says**, sentence for sentence, before
  anything is signed, and shows the hole's room in the realm's own units.
- **A change to `decodeData` or `publishMineNow`'s checks must be mirrored in
  `Check`.** The parity test fails until it is (`scripts/check.sh` runs it).
- **`Fit` is not exactly idempotent on every course hole**: mines/17's
  leftmost piece lies a hair inside the margin, so fitting it again moves one
  float by an ulp. A draft on the builder's grid (multiples of 1/4) is
  shifted exactly.
- **The parity test grows by about a tenth** (1,866 PublishMine calls and 180
  fits on top of the 25,200 simulations).

## Alternatives considered

- **Port the checks to TypeScript.** Rejected: only the chain's code refuses
  exactly what the chain refuses, without a second implementation to drift.
- **Extract `decodeData` whole.** Rejected on size, measured above.
- **Put the checks in `golf.wasm`.** Rejected: every player would download
  the builder's code and the `unicode` tables for nothing (+46 KB, +19 KB
  gzipped).
- **A separate Go package for the builder's exports.** Tried first: it
  needed its own copy of the argument and answer plumbing, and could not
  carry golf.wasm's exports, which the builder's test mode plays with. Build
  tags give one package, two builds.
