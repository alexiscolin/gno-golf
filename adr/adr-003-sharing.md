# ADR-003: Sharing a hole and a round

## Status

Accepted. The link cards are built, and the shot clip behind a flag (see
"What is built"); the phone's image is still to come. Nothing in the realm
changes.

## Context

Sharing is how the game spreads, and today it undersells it:

- **Every link looks the same.** A shared link is `/?hole=garden/3`, and every
  such address serves the same `index.html`. X, WhatsApp, Discord and the rest
  don't run JavaScript: they read the page's `og:` tags, so every hole gets the
  same generic card.
- **Only text goes out.** The hole-finished banner shares a sentence and a
  link. What makes people stop scrolling is a picture of the hole, or the shot
  itself moving.
- **There is no server, and there should stay none.** The site is a static
  export on Netlify; the chain is the backend, and the player pays their own
  gas. Whatever we add must not need one.

## Decision

- **A page per hole, built statically.** `/h/<world>-<n>/` (74 pages, from the
  course's slots at build time, `generateStaticParams`), plus one per cup
  (`/h/garden/`) and the home page. Each has its own title, description
  ("Can you hole it in one? Every shot is computed by the chain.") and its own
  `og:image`, and opens the game straight on that hole. The share buttons and
  the copied link use these addresses; the old `?hole=` links keep working.
- **One OG image per hole, made once.** 1200×630: the hole's overview in 3D,
  its name, cup and par, and "played on gno.land". Rendered locally with the
  headless Chrome the repo already uses for its captures (`media/lib/cdp.mjs`),
  committed under `web/public/og/` (a few MB), and made again by one command
  when a hole changes. Netlify serves them as plain files.
- **On a phone, the round is shared as an image.** A capture of the hole with
  the player's score on it, handed to the system share sheet (the `snapshot`
  path `Share.tsx` already has), with the text and the hole's link.
- **The shot as a clip, on a phone or a computer.** Once the hole is won,
  the holing stroke is played again, out of sight, and recorded: the replay
  is deterministic (the chain's path, walked by the game's own replay), so
  it needs nothing from the live shot but its path. It is drawn at 720p into
  a canvas of its own and recorded there (`canvas.captureStream()` and
  `MediaRecorder`, native, no library), from just before the release to a
  second after the ball drops: a few seconds, 8 at most. The hole-finished
  banner shows a loader while it is made, then loops it above its buttons:
  on a phone the system share sheet takes the file (with the text and the
  hole's link) and "Download clip"; on a computer "Download clip" and "Post
  on X" (the text and the link filled in; the player adds the file). Only
  where the browser records MP4, the one format X takes (Safari, recent
  Chrome); elsewhere there is no clip, and the image and the link are shared
  as before. Behind `NEXT_PUBLIC_CLIPS=1`: unset, there is nothing of it.

## What is built

- **The pages.** `web/app/h/[slot]/page.tsx` builds 78 of them: the 74 holes
  (`/h/garden-3/`) and the four cups (`/h/garden/`), from `data/holes.txt`,
  with no chain at build time. `trailingSlash` in `next.config.mjs` makes each
  one a folder (`out/h/garden-3/index.html`), so any static host serves it.
  The game reads the hole or cup from the path (`useConfig` in `Golf.tsx`); a
  `?hole=` or `?cup=` in the query still wins, and old links keep working.
  Each page carries `<base href="/">` so the game's relative addresses
  (`title/…`, `flags.json`) are the site root's.
- **The links.** `holeLink` (`components/common.ts`) gives a cup's hole as
  `h/<world>-<n>/`; a community or archived hole keeps `?hole=<id>`. The share
  buttons build them from the site's public address (`siteURL` in
  `Share.tsx`), never a local one.
- **The images.** `media/og/og.mjs` (`npm run og`, or `npm run og -- garden/3`
  for some) opens each hole at `/?play&camlog&og&weather=clear&hole=<slot>`:
  `weather=clear` is the client's existing test forecast (no weather drawn),
  `og` makes `timeOf()` in `lib/scene/camera.ts` answer "day", so every hole is
  lit by day and the cards come out the same whenever they're made. The HUD is
  hidden by CSS the generator injects. The card itself (the name, the cup and
  hole number, the par, "mini-golf on-chain · played on gno.land", the badge)
  is HTML drawn in the same headless page and screenshotted: no image library.
  JPEG, 80 to 120 KB each, 7.6 MB in all under `web/public/og/`, with the
  names and pars written to `app/h/holes.json` for the pages.
- **The clip.** `lib/engine/clip.ts`, fetched the first time a clip is asked
  for. The engine keeps the round's holing stroke (its path, air and cause
  letters, its angle); the clip walks it with the game's own replay
  (`engine/replay.ts`, silent) on a gnome of its own, seen by the player's
  own camera controller (`engine/camera.ts`, framed for 16:9), and draws it
  with a second `WebGLRenderer` on a 1280×720 canvas nobody sees. For each of
  its draws the live gnome, aim and confetti are hidden and the clip's
  things put in the scene, then all put back in the same task, so the live
  canvas never shows them. Each frame is painted over the page's sky (CSS,
  read from `.sky`) with the score's card, on a 2D canvas that is recorded
  at 30 fps, about 6 Mbit/s: 3 MB for 5 seconds. The recording runs in real
  time, so a clip takes as long to make as it lasts. What it shows
  (`clipWindow` in `lib/clip.ts`): 0.7 s of the gnome still where the
  stroke is played from, the stroke, 1.5 s of confetti; a stroke too long for 8 s
  opens on its last steps instead. A computer makes it as the banner opens;
  a phone when the player taps "Make a clip of the shot" (a second renderer
  for a few seconds is a lot to spend unasked on a phone's GPU and battery).
  Closing the banner cancels it and frees everything: the renderer and its
  context, the stream's tracks, the video's object URL. Under reduced motion
  the clip waits on a play button instead of looping. In a dev build
  `?clips` turns it on without the flag.
- **The default card** (`og/default.jpg`, used by the home page) is a poster,
  not a view of the course: the title screen's gnome badge large in the middle,
  "Mini-golf on-chain", and "Every shot computed by the chain · play free on
  gno.land", over a soft, blurred island.

## Consequences

- **No server cost.** Everything is either built once or made in the player's
  browser.
- **Link cards sell each hole**, and the per-hole pages can be indexed by
  search engines.
- **A post with the clip or the image shows the media, not the link card**:
  that is how X and most apps treat a post with an attachment. The link stays
  in the text.
- **The images must be made again** when a hole's version changes, or they
  show the old layout: `npm run og -- <slot>` belongs in the publishing
  checklist, against a local chain holding the new version.
- **Two share paths to keep working**: the image and the clip. The clip is
  best-effort: a browser without MP4 recording simply doesn't offer it.
- **The clip is the holing stroke only**, even in a round of two or three:
  one stroke is the moment people share, and only its path is kept. On a timed hole the pulse's
  pieces drawn are the ones up after the hole, not the stroke's own.

## Alternatives considered

- **Dynamic images per score** ("I'm #3 on this hole", drawn on request).
  Needs a server function (Netlify Functions): rejected for now, it adds a
  moving part for a small gain over the hole's own card.
- **Video inside the link card** (`og:video`, X player cards). X needs a manual
  approval and an HTTPS player, and most apps ignore `og:video` anyway.
- **Recording the live shot** (the first plan): `captureStream()` on the
  game's own canvas while the stroke is played, on computers only. It
  records the player's screen, not a 16:9 picture (a phone held upright
  gives a tall, narrow clip), and the recording competes with the game for
  the frame just when the ball is moving, which can stutter on a modest
  phone. Played again after the hole, the shot costs the game nothing, is
  framed for the networks, and works on phones too.
- **The live renderer drawing the clip into a render target.** No second
  context, but three.js only converts colours for the screen: a render
  target would need shaders of its own (compiled anyway) and a pass to put
  the colours right. A second renderer shares the scene as it is.
