# Analytics

Anonymous audience measurement and field debugging, on PostHog Cloud EU
(`web/lib/analytics.ts`). It runs only in a build with
`NEXT_PUBLIC_POSTHOG_KEY` set (the project's public write-only key, in
Netlify's environment); without it nothing is loaded and nothing is sent, as
in local dev. A page opened with the test hooks (`?camlog`) sends nothing
either.

## Privacy: the CNIL audience-measurement exemption, no banner

- One anonymous first-party id: a cookie on this host only
  (`persistence: "cookie"`, no cross-subdomain cookie), 390 days at most. The
  cookie is renewed at each visit, so the id itself is dropped for a new one
  once it is 13 months old (`since_day`, checked at load), its `$device_id`
  with it (`reset(true)`).
- Visitors are told (the About sheet's credit line) and can object there in
  one click, "Don't measure my visits": kept in this browser
  (`localStorage` `gnogolf.noStats`), it stops what is sent at once
  (`opt_out_capturing()`, the waiting events dropped), takes PostHog's id
  and cookies away (`reset(true)`; its `ph_…` and opt-out cookies deleted, an
  earlier page's too, and `opt_out_persistence_by_default` so none is written
  again), and posthog-js is not loaded again on a later page.
- Nobody is identified: no `identify()`, `person_profiles: "identified_only"`.
- No session replay, no heatmaps. Autocapture is on with every element's text
  and attributes masked (the boards show names and addresses).
- Every event is scrubbed before it leaves (`before_send: clean`): a URL keeps
  only `cup`, `hole`, `gnome`, `screen` and `src` (where a shared link was
  shared from: hole, cup, board, duel) of its query (never `by=` or
  `friend=`, which carry an address, nor a network's share text), and any
  `g1…` address, `nym-…` name, or text after `address(` is cut, in every
  string of the event (the URLs, `$referrer`, the first-touch `$initial_*`,
  exception messages and stacks).
- The IP is discarded by the project setting.
- No other third party sees a visit: the font (Fredoka) is served from the
  game's own host (`web/public/fonts`), never a font CDN.
- Never a wallet address, a player's name or a transaction hash in an event.

A public build reaches PostHog EU through the site's own `/e` path, a
Netlify proxy (`netlify.toml`): `/e/*` to `eu.i.posthog.com` (events,
remote config), `/e/static/*` to `eu-assets.i.posthog.com` (the extensions
posthog-js loads: web vitals, exception autocapture, dead clicks). A
blocker sees no third party, and the CSP needs none: `'self'` covers it.
`next dev` talks to `eu.i.posthog.com` directly.

posthog-js is imported once the page is idle, in a chunk of its own (about
98 kB gzipped); what the game says before waits in a queue.

## Said with every event (super properties)

| property | what | set in |
| --- | --- | --- |
| `build` | the commit (Netlify `COMMIT_REF`, 7 chars), `dev` otherwise | `start()` |
| `touch`, `reduced_motion`, `dpr`, `viewport` (phone/tablet/desktop), `locale`, `online`, `net` (effective type) | the device | `start()` |
| `since_day` | the day the id was made (days since 1970) | `start()` |
| `gfx` (auto/high/low), `tier` (high/low), `weak_gpu`, `slow` | graphics: the setting, the tier drawn, and why | engine `setTier()` |
| `aim` (pro/assisted), `cam`, `gnome` | the player's choices | `Golf.tsx` |
| `adena`, `connected`, `wallet_on_node` | Adena installed, an account connected, Adena on this page's node | `Golf.tsx` |
| `chain` (chain id), `network` (local/testnet/mainnet) | where the game plays | `Golf.tsx` |
| `hole`, `cup` | the hole and cup played (null off the course); a cup is its world: garden, island, town, mountain, mines (the Crystal Mines) | `Golf.tsx` |
| `screen` | the screen or sheet in view (as the `screen` event names it) | `Golf.tsx` |
| `card_holes` (0, 1-3, 4-9, 10+), `saved_any` | this browser's card: how many holes it holds, and whether a save of it is on the chain | `Golf.tsx` |
| `entry` | how the visit came: home, hole, cup, screen, friend, dare_hole, dare_course (a `by=` link; the address itself never leaves) | `Golf.tsx useConfig` |
| `src` | where the link was shared from (hole, cup, board, duel: a shared link's `src=`), read once as the page opens | `Golf.tsx useConfig` |

## The game's events

Pageviews (`$pageview`, on every address change: the screens that change the
URL), `$pageleave`, clicks (`$autocapture`, `$rageclick`, `$dead_click`) and
web vitals (`$web_vitals`) are PostHog's own.

| event | properties | fires | where |
| --- | --- | --- | --- |
| `screen` | `name`: title, modes, rival, ghosts, worlds, pick, play, finished, victory, about, boards, badges, card, wallet, rules, support, feedback | the screen or sheet in view changes | `Golf.tsx` |
| `ui` | `action`: `mode_picked` (`mode`), `rival_picked` (`kind`: champ, level, self, self_connect: the yourself pick asking to connect Adena), `rival_typed` (`found`: the name or address typed is someone on this chain; said once the chain answered, from `Modes.tsx`), `rival_surprise`, `ghost_raced`, `board_raced`, `cup_picked` (`cup`), `gnome_browsed`, `gnome_chosen` (`locked`: Play on a locked gnome on show, playing the one chosen before), `camera_changed`, `menu_opened`, `all_cups_clicked`, `wallet_clicked`, `mainnet_clicked`, `external_link_opened` (`host` only, never the path: it can hold an address; `kind`, from the link's class or its address's shape: share, github, adena, faucet, src (a hole's source or data), player, round, board, form (a realm's $help), other) | a named control clicked: one listener on the page and a table of selectors (`lib/uitrack.ts`), the control nearest the click winning, never its text; the sheets opened are `screen`, the title's start is `screen` title then the next | `lib/uitrack.ts` |
| `boot` | `title_ms` (the game made: the title's Start live), `hole_ms` (the first hole drawn), from navigation start | once a page | `Golf.tsx` |
| `hole_loaded` | `hole`, `world`, `state_ms` (the chain's HoleState), `world_ms` (the cup's look), `build_ms`, `compile_ms` | a hole built | `engine.ts load()` |
| `hole_started` | `hole`, `cup`, `mode` (solo/duel), `aim`, `weather` (kind), `period` | a round ready on screen, before its first stroke | `Golf.tsx` |
| `stroke` | `hole`, `n`, `power` (rounded), `angle` (45° bucket), `result` (holed/hazard/rest), `cause` (letters seen: b bounce, i ice/wet, s slope, w wind), `bounces`, `chain_ms` (the chain's answer, from the release), `sim_ms` (the page's own answer the stroke set off on, when it had one), `fly_ms`, `aim_ms` (from when it could be aimed, to the release: the hole ready or uncovered, a restart, or the last stroke over, a duel's ghost's turn too), `cancels` (aims dropped since: a pull with a power let go without a shot, slid back or lost, a keyboard aim's Escape) | a stroke's replay over | `engine.ts shoot()` |
| `hole_finished` | `hole`, `cup`, `mode`, `aim`, `strokes`, `par`, `place` (its number in its cup, 0 in none), `first` (its first finish in this browser's card) | a hole holed | `Golf.tsx holedRef` |
| `finished_shown` | `primary` (the card's solid action once the player's best there is read: save, next, rematch (a duel lost, or tied short of an ace), cup (Cup complete!)), `can_save` (the round can still be saved: not yet, not too late), `phone_only` (a phone with no wallet: the card sends the hole to a computer), `duel` | the hole-finished card shown, once a finish (not again back from the cups) | `Golf.tsx` |
| `hole_abandoned` | `hole`, `cup`, `mode`, `aim`, `strokes`, `why` (`left`: the tab closed mid-round, sent as a beacon) | a round with strokes left unholed (a new round, another hole) | `Golf.tsx` |
| `restart` | `hole`, `strokes`, `holed` | Play again, Rematch, a race from the tee | `engine.ts reset()` |
| `cup_complete` | `cup`, `strokes`, `vs_par`, `best` (it beat the cup's best) | a cup finished, or bettered | `Golf.tsx holedRef` |
| `badge_earned` | `id` | a new badge | `Golf.tsx award()` |
| `progress_restored` | `holes`, `asked` | the connected wallet's bests filled holes this browser had no score for: by itself once an address a browser (a new device, cleared data), or asked (the menu, the cups' reset menu) | `Golf.tsx` |
| `flags_stale` | `hours` | the bot check's list (flags.json) is over 36 hours old: its 12-hourly run stopped | `Leaderboard.tsx flagsOf` |
| `duel_started` | `hole`, `cup`, `rival`, `ghost` (their strokes), `mixed` (another aim mode) | a ghost armed | `Golf.tsx` |
| `duel_result` | `rival`, `result` (win/loss/tie), `strokes`, `ghost` | a duel's hole holed | `Golf.tsx holedRef` |
| `save` | `stage` (sent/ok/cancelled/failed), `via` (adena, gnokey: a gnokey save has no `sent`), `best` (on ok: the round beat the player's best there), `parts`, `part`, `gas` (the part's estimate), `ms`, `reason` (late, replay, unconfirmed, missing, down, chain, gas, funds, locked, busy, network, other) | Adena about to open (sent), then its end | `Golf.tsx saveRound()` |
| `save_clicked` | `from` (card: the hole-finished card's Save, pending: a round kept through a reload, sheet: the wallet sheet's Save on-chain), `blocked` (null: Adena opens; else the step that sent it to the wallet sheet: no_adena, no_account, no_funds, wrong_node (too few GNOT with Adena on another network, where they may be), no_name (a kept round on a ranked hole, from a player with no name)) | a Save pressed | `Golf.tsx`, `lib/analytics saveBlock()` |
| `name_refused` | `reason` (a registrar's rule broken: chars, reserved, length, digits; the chain's answer: taken, lookalike, invalid, no_registrar), `via` (save: typed for a save's signature, form: the name form's own); never the name | a name typed refused, once it has rested a second on it | `Leaderboard.tsx useNameCheck`, `common.ts nameRefusal()` |
| `wallet_step` | `step` (once the sheet's reads are in, the first step not done: adena, connect, funds, name, save; done), `from` (hud, card, pending, phone, rival, board, about, support) | the wallet sheet opened, and its step changing while open | `Golf.tsx RealPlay` |
| `name_registered` | `ok`, `via` (save/form/gnokey), `reason` | a name taken with a save, from the name form, or with the gnokey paste | `Golf.tsx`, `Leaderboard.tsx` |
| `share` | `target` (x, facebook, whatsapp, bluesky, copy, sheet, download), `what` (hole/cup/board/clip), `kind` (what its label offers: dare, dare_back, share_rank, share_ghost, share), `dare` (the link carries a `by=`), `saved` (the round shared is on the chain); a clip's download only `target` and `what`. The links shared say where from (`src=`: hole, cup, board, duel), kept on the arriving visit's URL | a share button | `Share.tsx`, `common.ts holeLink() dareLink()`, `Golf.tsx cupLink()` |
| `wallet` | `adena`, `connected` | once a session | `Golf.tsx` |
| `wallet_connect` | `stage` (asked, ok, refused), `reason` (refused: cancelled, locked, busy, no_adena, network, other…, as `failure()` words it) | Connect Adena, from any of its buttons (the wallet sheet's, a board's, the rival screen's Yourself) | `Golf.tsx connectWallet()` |
| `pending_restored` | `hole`, `strokes`, `left_s` (seconds left to save it, null with no window) | a won round not saved yet read back after a reload | `Golf.tsx` |
| `save_expired` | `where` (card: the hole-finished card's round; pending: one kept through a reload or another screen), `hole`, `strokes` | a round's save window run out while it was still unsaved | `Golf.tsx`, `PendingSave` |
| `duel_dropped` | `rival` | a dare dropped for solo (the picker's Play solo, Solo picked with a dare on) | `Golf.tsx` |
| `perf` | `tier` (the setting), `slow` | the first 2 s of busy frames timed | `engine.ts probeFrame()` |
| `fps` | `hole`, `tier`, `fps` (median), `fps_p10` (slowest tenth), `long` (frames over 50 ms), `frames`, `memory_mb` (Chrome) | a round's end (a new round or hole) | `engine.ts newRound()` |
| `sim_off` | `why`: `sources` (golf.wasm is not built from the realm's files), `load`, or `mismatch` (a chain answer the page's own differs from: `hole`, `period`, `shot`, `n`, the stroke's number) | the page's own aim previews turned off for the visit | `lib/sim` |
| `survey sent` (`feedback` without a survey id) | `$survey_id` (`NEXT_PUBLIC_POSTHOG_SURVEY`, an API survey whose questions are the sheet's, in its order), `$survey_completed`, `$survey_submission_id`, each answer by its question's id (`$survey_response_<id>`, the ids read once a visit from PostHog's public survey list, 3 s at most) and by index (`$survey_response` to `_3`), `$survey_questions`, the page's `$current_url` (scrubbed as every URL), `$host`, `$pathname`, `build`, `viewport`, `touch`, and `screen`, `aim`, `network`, `adena`, `connected`, `card_holes`, `saved_any`, with `hole`, `cup`, `cam` when sent from a hole | the testnet's feedback sheet sent (the network band's Feedback). Not through posthog-js: posted straight to PostHog's capture endpoint (8 s at most), so the sheet knows it went, on a one-off `distinct_id` with no person profile: tied to no visit, and without the super properties above. Anonymous: no contact is asked (a reply goes through a GitHub issue). The player's words keep their sentences (a recovery phrase is cut only when it is the whole answer, a key's hex always). Not sent when the visitor objected, nor with the test hooks; a dev build with no key logs it to the console | `Feedback.tsx`, `lib/analytics feedback()` |

`rival` is how the rival was found: `champ`, `level`, `self` (the rival
screen's picks), `friend` (a name typed), `surprise`, `board` (a board's
sticker or Race), `link` (a dare link).

## Errors (`$exception`, PostHog error tracking)

Uncaught errors, unhandled rejections and `console.error` are captured by
PostHog itself. The failures the game handles are sent too, with `where`
(each one 3 times at most a page):

| `where` | context | from |
| --- | --- | --- |
| `rpc` | `fn` (the realm function), `host`, `ms`, `kind` (down/chain) | `chain.ts vm()`, every realm read |
| `adena` | `code`, `type`, `what` (the call's fallback words) | `adena.ts why()`, every Adena refusal |
| `save` | `part`, `parts`, `gas`, `reason` | a save that failed (not cancelled) |
| `name` | | the name form's registration failing |
| `ghost` | `hole` | a duel's ghost that would not load |
| `sim` | | the page's own aim previews that would not start (`lib/sim`) |
| `load`, `draw`, `shot` | `hole` | the engine's banner errors (`fail()`) |
| `fatal` | `kind` (webgl, down…) | the game that could not start |
| `render` | `digest` | the error page (`app/error.tsx`, `app/global-error.tsx`) |

## Volume

Roughly 15 to 30 events a hole played (a stroke each, the screens, the clicks),
so the free tier's million events a month is some 40,000 holes. No per-frame
data: frame rates are sampled once a round.
