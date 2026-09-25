# Leaderboards and the bot check

## Leaderboards (coming soon)

In the dapp, the leaderboard button and sheet carry a "Coming soon" badge until
launch. Turning the badge off is one constant, `SOON` in `web/components/Golf.tsx`.
Everything below already runs on-chain.

- **Two modes, ranked apart.**
  - **Assisted:** the full aim line (the chain's preview). It is recorded with
    `PlayRoundAt`.
  - **Pro:** no aim line. It is recorded with `PlayRoundPro`. Every `Launch`
    (one shot at a time from gnoweb) is pro.
  - A round keeps the mode of its first stroke.
  - The mode is the player's word: the chain cannot see a screen, and
    `Simulate` is open to all.
- **Only named players are ranked.** `Leaderboard(mode)` (the course-wide top ten)
  and `HoleLeaderboard(hole, mode, offset, limit)` (a hole's board, a page of
  up to 100 at a time) list only addresses with a gno.land name (`r/sys/users`). An address is
  free, a name is not, so a script cannot flood the boards. Unnamed finishes are
  still kept, and count as soon as the player takes a name.
- **Friends first.** `Bests(hole, mode, players)` and `Standings(mode, players)`
  read any list of up to 50 addresses, named or not. The dapp's Friends tab is the
  default view: you compare with people you chose, and no bot can push you off.
- **Suspected bots are hidden in the dapp only.** `scripts/botcheck.ts` (see [the bot check](#bot-check))
  writes `web/public/flags.json`. The general tabs hide players scoring at
  least 0.5 by default, with a "Show all" toggle. The Friends tab is never
  filtered. The chain and gnoweb show the raw boards, unfiltered, with no admin
  deciding who is suspect.
- **Archived holes keep their boards.** See [Updating after the deploy](golf.md#updating-after-the-deploy).

## Bot check

The physics is public and deterministic, so a bot can play perfectly, and the
chain cannot tell. `scripts/botcheck.ts` (Node, no dependencies, reads only)
flags rounds that look machine-made:

```
nice -n 20 node --experimental-strip-types scripts/botcheck.ts [--rpc http://127.0.0.1:26757] [--top 10] [--json]
nice -n 20 node --experimental-strip-types scripts/botcheck.ts --selftest
```

It takes the top rows of every official hole's boards and the course boards,
in both modes, reads each candidate's bests (`Bests`) and recorded rounds
(`Round`), and prints a markdown (or `--json`) report. It also writes
`web/public/flags.json`: `{ updated, flags: { <address>: { score, reasons } } }`.
The score, 0 to 1, is a weighted mean of four signals:

| signal | weight | what it measures |
|---|---|---|
| knife-edge | 0.35 | the holing shot is replayed (`SimulateRoundAt`, same period) with ±0.2°, ±0.05 power and, on a timed hole, ±1 tick. If 75% or more of the nudges stop holing in as few strokes, that hole counts as knife-edge. The signal is knife-edge holes / max(3, holes checked), so one lucky shot is not enough. |
| values | 0.30 | the dapp sends angle and power in 0.01 steps, so a human shot lands on the solver's grid (whole degrees, power in 0.25) about 1 time in 2,500. A grid shot counts 1. A shot finer than 0.01, which means another client, counts 0.5. The mean is damped below 5 shots. |
| optimality | 0.20 | the share of the player's holes finished at or below the solver's best (`scripts/hole-bests.json`, from the verification pass), damped below 3 holes. Beating the solver is listed as a reason. |
| volume | 0.15 | how many holes they finished at the optimum, capped at 20. |

The script rate-limits the RPC (`--delay`, 150 ms by default) and caps the
replays (`--max-sims 300`) and round reads (`--max-rounds 300`). The selftest
builds two synthetic players from real replays. The bot plays the solver's
plans unchanged. The human plays the same plans with 0.01-step noise and
keeps only the noisy rounds that still hole. The selftest checks that the bot
scores higher.

**Limits: this is an indicator, not proof.** A careful bot can add noise at
0.01, pick robust shots rather than knife-edge ones (our own solver prefers
those), and play a few strokes over the optimum. Such a bot scores like a
strong human. A strong human who plays a lot will score on optimality and
volume, up to 0.35 from those two alone. The recorded round is the latest one
on a hole, which may be a replay rather than the ranked best. Only the holing
shot is nudged, because setup shots are fragile for everyone. Flags feed a
"show all" toggle, not a ban.
