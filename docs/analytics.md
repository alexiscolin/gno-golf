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
  (`opt_out_capturing()`, the waiting events dropped), and posthog-js is not
  loaded again on a later page.
- Nobody is identified: no `identify()`, `person_profiles: "identified_only"`.
- No session replay, no heatmaps. Autocapture is on with every element's text
  and attributes masked (the boards show names and addresses).
- Every event is scrubbed before it leaves (`before_send: clean`): a URL keeps
  only `cup`, `hole`, `gnome` and `screen` of its query (never `by=` or
  `friend=`, which carry an address, nor a network's share text), and any
  `g1…` address, `nym-…` name, or text after `address(` is cut, in every
  string of the event (the URLs, `$referrer`, the first-touch `$initial_*`,
  exception messages and stacks).
- The IP is discarded by the project setting.
- No other third party sees a visit: the font (Fredoka) is served from the
  game's own host (`web/public/fonts`), never a font CDN.
- Never a wallet address, a player's name or a transaction hash in an event.

Content-Security-Policy (`netlify.toml`): `connect-src` has
`https://eu.i.posthog.com` (events) and `https://eu-assets.i.posthog.com`
(remote config), `script-src` has `https://eu-assets.i.posthog.com` (the
extensions posthog-js loads: web vitals, exception autocapture, dead clicks).

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
| `hole`, `cup` | the hole and cup played (null off the course) | `Golf.tsx` |

## The game's events

Pageviews (`$pageview`, on every address change: the screens that change the
URL), `$pageleave`, clicks (`$autocapture`, `$rageclick`, `$dead_click`) and
web vitals (`$web_vitals`) are PostHog's own.

| event | properties | fires | where |
| --- | --- | --- | --- |
| `screen` | `name`: title, modes, rival, ghosts, worlds, pick, play, finished, victory, about, boards, badges, card, wallet | the screen or sheet in view changes | `Golf.tsx` |
| `boot` | `title_ms` (the game made: the title's Start live), `hole_ms` (the first hole drawn), from navigation start | once a page | `Golf.tsx` |
| `hole_loaded` | `hole`, `world`, `state_ms` (the chain's HoleState), `world_ms` (the cup's look), `build_ms`, `compile_ms` | a hole built | `engine.ts load()` |
| `hole_started` | `hole`, `cup`, `mode` (solo/duel), `aim`, `weather` (kind), `period` | a round ready on screen, before its first stroke | `Golf.tsx` |
| `stroke` | `hole`, `n`, `power` (rounded), `angle` (45° bucket), `result` (holed/hazard/rest), `cause` (letters seen: b bounce, i ice/wet, s slope, w wind), `bounces`, `chain_ms`, `fly_ms` | a stroke's replay over | `engine.ts shoot()` |
| `hole_finished` | `hole`, `cup`, `mode`, `aim`, `strokes`, `par` | a hole holed | `Golf.tsx holedRef` |
| `hole_abandoned` | `hole`, `cup`, `mode`, `aim`, `strokes` | a round with strokes left unholed (a new round, another hole) | `Golf.tsx` |
| `restart` | `hole`, `strokes`, `holed` | Play again, Rematch, a race from the tee | `engine.ts reset()` |
| `cup_complete` | `cup`, `strokes`, `vs_par`, `best` (it beat the cup's best) | a cup finished, or bettered | `Golf.tsx holedRef` |
| `badge_earned` | `id` | a new badge | `Golf.tsx award()` |
| `duel_started` | `hole`, `cup`, `rival`, `ghost` (their strokes), `mixed` (another aim mode) | a ghost armed | `Golf.tsx` |
| `duel_result` | `rival`, `result` (win/loss/tie), `strokes`, `ghost` | a duel's hole holed | `Golf.tsx holedRef` |
| `save` | `stage` (sent/ok/cancelled/failed), `parts`, `part`, `gas` (the part's estimate), `ms`, `reason` (late, replay, unconfirmed, missing, down, chain, gas, funds, locked, busy, network, other) | Adena about to open (sent), then its end | `Golf.tsx saveRound()` |
| `name_registered` | `ok`, `via` (save/form), `reason` | a name taken with a save, or from the name form | `Golf.tsx`, `Leaderboard.tsx` |
| `share` | `target` (x, facebook, whatsapp, bluesky, copy, sheet, download), `what` (hole/cup/board/clip) | a share button | `Share.tsx` |
| `wallet` | `adena`, `connected` | once a session | `Golf.tsx` |
| `perf` | `tier` (the setting), `slow` | the first 2 s of busy frames timed | `engine.ts probeFrame()` |
| `fps` | `hole`, `tier`, `fps` (median), `fps_p10` (slowest tenth), `long` (frames over 50 ms), `frames`, `memory_mb` (Chrome) | a round's end (a new round or hole) | `engine.ts newRound()` |

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
| `load`, `draw`, `shot` | `hole` | the engine's banner errors (`fail()`) |
| `fatal` | `kind` (webgl, down…) | the game that could not start |
| `render` | `digest` | the error page (`app/error.tsx`, `app/global-error.tsx`) |

## Volume

Roughly 15 to 30 events a hole played (a stroke each, the screens, the clicks),
so the free tier's million events a month is some 40,000 holes. No per-frame
data: frame rates are sampled once a round.
