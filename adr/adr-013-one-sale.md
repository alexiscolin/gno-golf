# ADR-013: One sale a series, no waves

## Status

Accepted, 2026-10-18: the user's call. Supersedes ADR-007's waves (and
ADR-008's ids "run by wave"). Built in `gno.land/r/gnogolf/gnomes`
(`sale.gno`), the client (`web/lib/gnomes/shop.ts`), the catalogue's data
and the scripts. Nothing is deployed, so the realm's API changes in place.

## Context

ADR-007 sold the genesis in waves, `AddWave(first, last, start,
playerHours)`, a range of ids at a time, one world a wave, the research
brief's advice. The launch already opened every gnome at once in one wave
of all 720; the waves left were words on the screens ("Wave 1 · Garden",
"Coming · wave 3") and owner calls nobody would make.

## Decision

- **A series has one sale.** `OpenSale(series, start, playerHours)`, owner
  only, once a series: every id of it on sale from start (block time, unix
  seconds, from a day back to a year ahead), its first `playerHours` (0 to
  168) for wallets with a record in store, at today's `prices`, frozen into
  the sale. `CancelSale(series)` withdraws it before it starts only, no
  gnome of it sold; the series may then open again. Events `SaleOpened`,
  `SaleCancelled`.
- **Every guard stays.** The genesis's sale is refused before its closing
  date is set, from a start at or after it, and once it has closed;
  `SetCloseAt` never comes at or before a sale yet to start. Exact payment,
  direct user calls, five ids a Buy, the lifetime caps, one Legendary a
  wallet, the switch (`SetMintOpen`), as before. The player window's caps
  are counted per series and buyer (`inWindow` under "<series> <buyer>"), so
  a sale withdrawn and opened again never hands a fresh window.
- **Prices**: `SetPrice` moves the sales yet to open; one opened keeps its
  own. A gnome of a series on no sale shows the next sale's price.
- **Reads**: `Collection()`'s `waves` is gone; each series carries its
  `sale` (`{start, playersUntil, prices}`, null before one is opened).
  CanBuy's `wave-cap` is `window-cap`; `later` and `unlisted` stay. The page
  shows a Sale table, a row a series.
- **The catalogue** keeps its layout, a run of ids a world (`series.json`'s
  `worlds`); a gnome's `wave` field is gone, its `home` says the world. Ids,
  tiers, names, traits and art are unchanged.
- **The screens** say the sale: the series' name ("Genesis"), its count, its
  Legendaries at the flag; no next wave, no Legendaries "coming".

## Consequences

- A drop is `AddSeries` then `OpenSale`. A series is never sold in parts:
  a world at a time would be a series of its own.
- The sales are bounded by the series (64), not by a count of their own.
