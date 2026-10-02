# Leaderboards and the bot check

## Leaderboards

Everything below runs on-chain; the dapp reads it.

- **Two modes, ranked apart.**
  - **Assisted:** the full aim line (the chain's preview). It is recorded with
    `PlayRoundAt`.
  - **Pro:** no aim line. It is recorded with `PlayRoundPro`. Every `Launch`
    (one shot at a time from gnoweb) is pro.
  - A round keeps the mode of its first stroke.
  - The mode is the player's word: the chain cannot see a screen, and
    `SimulateFrom` is open to all.
- **Only named players are ranked.** `Leaderboard(mode)` (the course-wide top ten),
  `CourseLeaderboard(mode, offset, limit)` (the whole course ranking) and
  `HoleLeaderboard(hole, mode, offset, limit)` (a hole's board) list only
  addresses with a gno.land name (`r/sys/users`), a page of up to 100 at a
  time. `Rank(mode, player)` and `HoleRank(hole, mode, player)` give one
  player's place. An address is free, a name costs a transaction, so a script
  cannot flood the boards for nothing. Unnamed finishes are still kept, and
  rank from the player's next finish once named. The dapp lists them folded
  under each board ("Also finished, no name"), greyed and without a place,
  from `Records` and `Players`.
- **The course ranks by holes, then against par.** A player's standing adds
  up their best on each current course hole: most holes first, then the best
  score against par (each best's strokes less its hole's par, added up), then
  whoever got there first: the one whose standing last moved (a finish that
  added a hole or lowered the score) in an earlier block, then the lower
  address ([the exact rule](golf.md#records-and-rankings)). A hole at par counts the same whatever its par, so
  one board takes every hole's difficulty in, the Crystal Mines' included. The
  course boards show that score (`E`, `−3`, `+5`) and the holes; a hole's own
  board ranks by strokes, its par being the same for everyone on it.
- **Friends first.** `Bests(hole, mode, players)` and `Standings(mode, players)`
  read any list of up to 50 addresses, named or not. The dapp's Friends tab
  compares you with people you chose, and no bot can push you off. The sheet
  opens on it once you have a friend; until then on this hole's board during a
  round, on the course's elsewhere.
- **Records to beat, not a podium.** The site's boards ("Players", its sheet
  "Beat a record") put forward a few records worth beating today, each for a
  reason said on its card (`web/lib/featured.ts`). On a hole: the one a stroke
  under your best (within reach), a first target (the board's middle) while you
  have none, a hole in one, the best in a storm, the snow, the rain or the wind,
  the latest record, today's pick. On the course (and the cups screen): the place
  above yours (within reach on as many holes, else one place up), a fast start (a
  third of the course or less, at par or better), the best average against par (a
  third of the course played), today's pick (and, filling the rest, also today). One card a player, never you, never
  the board's first three (but the place above yours), flagged players left
  out, drawn again each day, from the board's first page, which it reads anyway;
  none on a board of five rows or fewer. Under them, the first five rows, your
  neighbours when your place is further down ("Near you"), and the whole board a
  tap away. The save button says what the save does there: the players it
  passes, the best in its weather, a new best of yours, or your first record
  there, then the place.
- **Suspected bots are hidden in the dapp only.** The bot check (see [below](#bot-check))
  writes the list the site serves at `/flags.json`. The hole and course tabs and
  the cups' records to beat hide the players on it by default, with a "Show all" toggle that
  writes out why under each of them ("Hidden here: …"). A hidden player sees a
  line on the board saying so, why, that their records stay on the chain, and
  where to say it is a mistake. The Friends tab is never filtered. The chain and gnoweb show the
  raw boards, unfiltered, with no admin deciding who is suspect.
- **Archived holes keep their boards.** See [Updating after the deploy](golf.md#updating-after-the-deploy).

## Bot check

The physics is public and deterministic, so a bot can play perfectly, and the
chain cannot tell. The bot check flags rounds that look machine-made, and never
hides a player for playing well. It runs every 12 hours (a scheduled job,
reads only) and publishes the list the site serves at `/flags.json`:
`{ updated, chain, records, pending, flags: { <address>: { score, said, proof } } }`,
the hidden players only, in the words the board shows (`said`). The dapp reads
it only if `chain` is the one it plays on, hides a player from 0.5, and calls a
list a day and a half old stale, or one it could not read (`flags_stale`); a
list missing hides nobody.

It reads every row of every official hole's boards, in both modes, with each
row's record (`boardRecords`: a best's strokes, block, period and shots, as the
realm keeps it), replays some of them (`SimulateRoundIn`, a free query), and
scores each player on signals that add up:

- **A proof:** another player's round sent again, the very same shots or
  nearly, one of them pulled at least (two people keying or typing send alike);
  the earliest keeps it. A proof hides on its own.
- **Signs, what no skill explains:** shots finer than the game sends (0.01),
  record after record; holing shots that go in only exactly as sent, in Pro;
  shots on a solver's grid; records saved faster than holes are played. A hide
  on signs needs a strong one on its own (weak ones never add up to it), points
  enough in all, and good play: a program playing badly takes no one's place.
- **Good play:** being at or beyond the solver's best, however measured. It is
  capped: a very good player is never hidden for it.

Nothing a shot holds is a proof: gnoweb's forms (Launch, and PlayRound, which
saves in Assisted) take any number typed. The weights and thresholds are kept
out of this repo, with the solver's bests and the decisions by hand (addresses
never hidden, or always hidden, each with its reason, which the board shows):
a rule a cheater reads is a rule a cheater plays under.

The check is incremental: a record is analysed once, until a better round
replaces it; replays go best-placed first, within a budget a run, and what is
left (`pending`) waits for the next. Players with no gno.land name are not read:
they rank on no board (a hole's "Also finished, no name" list is not screened).

**Limits: this is an indicator, not proof.** A careful bot can round its shots
to 0.01, pick robust shots, play a few strokes over the optimum and space its
saves. Such a bot scores like a strong human: it is caught by a copy, or by
knife edges in Pro, not by being good. Flags feed a "Show all" toggle, not a
ban; the chain and gnoweb keep every record.
