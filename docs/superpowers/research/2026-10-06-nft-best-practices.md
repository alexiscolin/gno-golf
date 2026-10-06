# Collectible gnomes: NFT best practices (research)

Date: 2026-10-06. Scope: how character and game-cosmetic collections sell in
2024-2026, and what that means for Gnogolf's 720 gnomes (504 Common, 144 Rare,
65 Epic, 7 Legendary) on gno.land. Not legal advice.

**Note on the spec.** `docs/superpowers/specs/2026-10-06-nft-gnomes-design.md`
now uses the same 720 split (its first draft had 777 tokens at 5 / 20 / 75
GNOT and a 250 GNOT reserve). The user's final decisions, which this brief
now follows where they differ from its first recommendations:
- prices Common 36, Rare 72, Epic 336, Legendary 1,296 GNOT (golf's numbers,
  section 2), the owner's to change between waves, never lower on what is
  on sale;
- **no auction**: the 7 Legendaries are sold at that fixed price by the same
  buy flow, one per wallet. The auction this brief recommended (sections 1
  and 2 keep the research) was dropped for simplicity and legal clarity;
- a hard closing date for the genesis, set at launch, which can only come
  earlier; what is unsold then is never minted;
- wearing is free: everyone shows their best owned gnome, read from chain,
  any owned gnome plays free in the browser, and equipping on chain is
  optional;
- no free "Founding Gnome" for buyers (a premium under Japan's 景品表示法);
- the seller is an individual in Japan; the shop (not the game) is closed
  to China and the comprehensively sanctioned countries (CU, IR, KP, SY,
  RU, BY); the EU and the UK are not blocked for now.

**Context checked today.** gno.land mainnet (`gnoland-1`) has been live since
2026-09-12, and GNOT has traded on KuCoin since 2026-09-16
([BTCC](https://www.btcc.com/en-US/academy/crypto-wiki/blockchain/what-is-gno-land-gnot),
[CoinGabbar](https://www.coingabbar.com/en/gnot-listing-news-gnoland-kucoin-kraken)).
GNOT traded at about $0.06 to $0.09 in mid/late September 2026, and KuCoin
ran a buyback when it fell below its sale price
([KuCoin news](https://www.kucoin.com/news/flash/kucoin-triggers-gnot-buyback-mechanism-amid-price-drop)).
*Unverified:* those price figures come from KuCoin's news flash and its
user-written "Square" posts, not from a price index. Re-check before setting
prices. At those rates, gnofly's 77 GNOT plane costs about $5 to $7. Its 162
sales at the last check (`Minted()`, the spec's on-chain read) come to about
12,500 GNOT, or roughly $1k in total. That is the size of the market we are pricing for.

---

## Key takeaways

1. **People buy brands, not JPEGs.** The collections that survived 2022-2025
   (Pudgy Penguins, Nouns, Reddit avatars) won on distribution and on being
   seen, not on scarcity talk. Pudgy's GIFs passed 10B GIPHY views in 2023
   ([Pudgy on X](https://x.com/pudgypenguins/status/1729275495273938959)),
   and its toys sold over 1M units
   ([CoinDesk research](https://www.coindesk.com/research/pudgy-penguins-a-new-blueprint-for-tokenized-culture)).
2. **Supply has to fit demand.** Too much supply and too little demand is
   the most common way collections die. The 2025 market shrank: NFT sales
   fell 63% year on year in Q1 2025 and 28% quarter on quarter in Q4 2025
   ([Altcoin Buzz](https://www.altcoinbuzz.io/bitcoin-and-crypto-guide/nft-sales-drop-63-in-q1-but-some-collections-thrive/),
   [InsideBitcoins](https://insidebitcoins.com/news/nft-market-falls-in-q4-2025-down-30-from-q3-2025)).
   For us, 720 is large compared with gnofly's 162 sales.
3. **Release in phases rather than all at once.** You can always open more
   later. Cutting supply after launch, or discounting it, reads as failure
   ([nft-inator](https://nft-inator.com/blog/optimizing-your-nft-collection-supply/)).
4. **Fixed price, pick what you see, no wallet jargon.** This is what sold
   40,000 Reddit avatars to an audience that disliked NFTs: fixed prices from
   $9.99 to $99.99, no crypto vocabulary, artists paid on every sale
   ([nft now](https://nftnow.com/culture/how-reddits-collectible-avatars-blew-up-the-nft-space/),
   [Fast Company](https://www.fastcompany.com/90876355/reddit-nft-collectible-avatars)).
   Gnogolf's no-random-draw choice fits this model.
5. **Reward existing players first, with per-wallet caps and wide windows.**
   Azuki Elementals had no per-wallet cap and a short presale. All 20,000
   tokens went in 15 minutes, before the public sale opened, and the floor
   fell below the mint price within a day
   ([Blockworks](https://blockworks.co/news/azuki-missed-the-mark-on-elementals),
   [CoinDesk](https://www.coindesk.com/web3/2023/06/28/azuki-elementals-mint-mishap-highlights-the-fragile-state-of-the-nft-market)).
6. **One auction at a time works for 1/1s.** Nouns' "one a day, forever"
   spreads ownership and gives a daily ritual
   ([Decrypt](https://decrypt.co/78892/nouns-nft-exclusive-dao-club-ethereum-whales)).
   Use a public reserve, a soft close (extend on late bids) and a minimum
   increment. Foundation's version: 24 hours from the first bid at reserve,
   reset to 15 minutes by any late bid
   ([Foundation help](https://help.foundation.app/en/articles/4742997-a-complete-guide-to-collecting-nfts-and-how-auctions-work)).
   *Not applied:* Gnogolf sells its 7 Legendaries at a fixed price instead
   (simpler, and legally clearer: no bids, no escrow).
7. **Royalties are a tip, not income.** OpenSea made creator fees optional in
   2023 and the big markets followed
   ([Decrypt](https://decrypt.co/152878/opensea-make-creator-royalties-optional-nft-trades)).
   Budget on primary sales only.
8. **Sell it as a game cosmetic, never as an asset.** UK ASA rulings punish
   ads that imply value or omit risk and fees
   ([ASA](https://www.asa.org.uk/news/cryptoassets-non-fungible-tokens.html)).
   The SEC's Stoner Cats case rested on marketing that pointed buyers to
   resale profit
   ([Akin](https://www.akingump.com/en/insights/alerts/the-secs-second-nft-enforcement-action-sec-v-stoner-cats-2-llc)).
   SEC enforcement has eased since then: the OpenSea probe closed in
   February 2025
   ([CoinDesk](https://www.coindesk.com/markets/2025/02/22/sec-drops-opensea-investigation-easing-pressure-on-nft-market)).
   The words we use still matter.
9. **Game-cosmetic NFTs sell when they show up in play.** Off the Grid's
   skins trade because people see them in matches
   ([Decrypt](https://decrypt.co/331777/off-the-grid-skin-sale-volume-hits-30k-as-the-avalanche-shooter-hits-opensea)).
   Parallel's avatars sold out partly because they were usable in-game
   ([OpenSea blog](https://opensea.io/blog/articles/parallel-trading-card-game)).
   For us, ghosts and board pills are the shop window.
10. **Shareable pieces are the cheapest marketing.** Pudgy (GIFs) and Nouns
    (CC0 derivatives) grew by letting their art travel
    ([a16z crypto](https://a16zcrypto.com/posts/article/cc0-nft-creative-commons-zero-license-rights/)).
    Prebuilt OG cards, clips and stickers cost no server.

---

## 1. What sells today, and what failed

**Worked**
- **Pudgy Penguins.** Launched July 2021 at 0.03 ETH (8,888 tokens). The
  founders were accused of neglect and the floor fell about 84%. Luca Netz
  bought the project in 2022 and rebuilt it around toys, licensing and
  GIFs: first mass-market users, then on-chain
  ([Blockonomi](https://blockonomi.com/from-turmoil-to-walmart-the-remarkable-turnaround-of-pudgy-penguins-by-luca-netz/),
  [CoinDesk](https://www.coindesk.com/research/pudgy-penguins-a-new-blueprint-for-tokenized-culture)).
  In Q1 2025 it was still among the few PFPs with real volume (about $72M,
  [Altcoin Buzz](https://www.altcoinbuzz.io/bitcoin-and-crypto-guide/nft-sales-drop-63-in-q1-but-some-collections-thrive/)).
  Lesson: a lovable character plus distribution beats roadmap promises.
- **Reddit Collectible Avatars.** Fixed fiat price, avatars made by community
  artists, no crypto words. Over 2.5M wallets were created to buy them
  ([TechCrunch](https://techcrunch.com/2022/10/18/redditors-have-created-millions-of-crypto-wallets-to-buy-nft-avatars)).
  The closest model to a cosmetic you choose and pay a fixed price for.
- **Nouns.** One auction a day, CC0 art, a simple and recognisable style.
  Scarcity comes from time, not hype
  ([creatoreconomy.so](https://creatoreconomy.so/p/nouns-how-one-nft-everyday-built-a-brand)).
- **Parallel Avatars.** 0.11 ETH, sold out in hours, usable in the game.
  Note that they also boosted token rewards: utility tied to earnings, which
  we avoid
  ([OpenSea blog](https://opensea.io/blog/articles/parallel-trading-card-game)).
- **Off the Grid.** Cosmetics mostly earned or dropped in play, then traded.
  Single items went for $500 to $2,390, and its market did about $666k in
  30 days (July 2025)
  ([FinanceFeeds](https://financefeeds.com/off-the-grid-crypto-explained-guide-for-beginners/)).
  *Unverified:* these are third-party figures.
- **Zora / Base open editions.** Very cheap mints with a fixed protocol fee
  (0.000777 ETH, part of it paid to the creator) and time-boxed open supply
  ([Zerion](https://zerion.io/blog/guide-to-the-zora-ecosystem/)). These
  suit commemorative items (an "I was there" collectible), not a capped
  collection.
- **Art Blocks.** A curated reputation and Dutch auctions that find the
  price ([Art Blocks blog](https://medium.com/the-link-art-blocks/a-few-approaches-to-project-drops-4b8da0d13512)).

**Failed or stumbled**
- **Azuki Elementals.** Supply dilution, art too close to the original, no
  wallet cap, a short presale ([nft now](https://nftnow.com/news/azuki-addresses-elementals-mint-controversy-teases-green-bean-nft/)).
- **Doodles / DOOD.** Utility always "a few months away", then a token
  launch. The token lost about 50% within days and the NFT floor fell from
  3.5 to under 1.5 ETH ([Cointribune](https://www.cointribune.com/en/the-dood-token-is-plummeting-despite-intense-hype-before-its-launch/),
  [Token Dispatch](https://www.thetokendispatch.com/p/doodles-dood-dive)).
- **Moonbirds.** A high-profile 2022 mint, then a decline, and the IP sold
  on in 2025 ([Cryptopolitan](https://www.cryptopolitan.com/yuga-labs-sells-moonbirds-to-orange-cap-games/)).
  Lesson: hype at mint without a product to use.
- **Axie Infinity.** The 2021 play-to-earn economy collapsed. The 2025 MMO
  (Atia's Legacy) is being pitched as player-driven and skill-first
  ([Lunacian](https://blog.axieinfinity.com/p/atias-legacy-founders-note)),
  but it still has gacha-style drops, which we avoid.
- **The general pattern:** too much supply, prices set for a bull market,
  utility promised but not shipped, unclear treasury use (the "rug feel").

**Apply to Gnogolf:**
- Sell the gnome as *the ball you play with and what others see*. No token,
  no yield, no "utility roadmap". Ship everything the gnome does before the
  sale opens.
- Keep the visual identity strict (one style, one silhouette) so that any
  gnome reads as "a Gnogolf gnome" at 64 px, as Nouns and Pudgy do.
- Do not launch a fungible token around the collection.

---

## 2. Launch strategy for a small ecosystem

**Supply vs demand.** Write-ups for small projects recommend launching
smaller than your community and expanding, never the reverse
([nft-inator](https://nft-inator.com/blog/optimizing-your-nft-collection-supply/)).
*Unverified, from a blog:* collections with 500 to 1,000 holders get better
engagement than large ones
([Medium/Predict](https://medium.com/predict/nft-market-breakdown-top-sales-hottest-collections-and-insider-strategies-in-2025-b73c9b8644fe)).
The gno.land audience is a few hundred active wallets at best, and gnofly
had sold 162 of its 777 planes at the last check, in its first weeks of
mainnet.

**Allowlist and early access.** The key practices: per-wallet limits,
published timelines, a clear official contract, and wide enough windows
([OpenSea allowlists](https://support.opensea.io/en/articles/8867054-define-your-allowlists),
[Crypto Adventure](https://cryptoadventure.com/nft-whitelisting-explained/)).

**Phased vs all at once.** Phases keep a story going (one news beat a week)
and let you pace supply to demand. All at once concentrates attention but
risks a visible "612 left" counter that never moves.

**Sell-out psychology.** "Sold out" is social proof. A counter that stalls
is anti-proof. Sell in small waves that do sell out, rather than one big
pool that does not.

**Auctions for 1/1s** (researched, not applied: see below). Use a public reserve, 24 to 48 hours, a soft close
of 10 to 15 minutes, a minimum increment, and one auction at a time.
Foundation's model is a 24-hour clock from the first bid at reserve, reset
to 15 minutes by any late bid
([Foundation](https://help.foundation.app/en/articles/4742997-a-complete-guide-to-collecting-nfts-and-how-auctions-work)).
*Unverified:* Foundation's marketplace reportedly went offline in April 2026.
Dutch auctions find price well for editions, not 1/1s
([Mechanism Institute](https://mechanism.institute/library/dutch-auction/)).

**Royalties.** Optional on major markets since 2023
([Unchained](https://unchainedcrypto.com/opensea-makes-creator-fees-optional-disables-royalty-enforcement-tool/)).
On gno.land, whether a market such as [Bazaar](https://bazaar.gnomi.fun/)
honours `grc721/royalty` is *unverified*.

**Apply to Gnogolf.** Everything below is a recommendation, not a fact,
except where it says *decided*.

- **Do not open all 720 at once.** Open in **world waves**. 504 Commons is
  exactly 72 for each of the 7 worlds. Each wave opens one world's
  Commons, about 20 Rares and about 9 Epics, plus that world's Legendary at
  its fixed price. Ids stay fixed in the table; the realm only opens id
  ranges, not whole tiers (now in the spec). Wave 1 is the Garden, ids
  1 to 104 (Commons 1–72, Rares 73–93, Epics 94–103, Legendary 104); wave 2
  the Island Cup, ids 105 to 208.
- **Player window first.** In each wave, the first 48 hours are open only to
  wallets with a record on chain (a v1 or v2 score, read from `store`).
  This rewards the people already playing and needs no list kept by hand.
  Spec impact: the realm reads `store` already; it would add a check.
- **Caps:** Common 3, Rare 2, Epic 1, Legendary 1 per wallet in a wave's
  player window. Lifetime caps after that: Common 10, Rare 5, Epic 2,
  Legendary 1.
- **Never discount unsold ids,** because it punishes early buyers. Ids left
  from a wave stay on sale at the same price, and the next wave opens only
  when the previous one passes about 70% sold. If demand stalls, pause the
  waves: unopened gnomes are not a "dead collection", they simply have not
  been released.
- **Legendaries** (*decided*): one per wave, sold at a fixed 1,296 GNOT by
  the same buy flow, one per wallet. This brief first recommended an
  auction (48 hours, a soft close, a minimum increment, a reserve); it was
  dropped for simplicity (no escrowed bids, refunds or settlement) and
  legal clarity (no bid as an order, no auction rules).
- **A hard closing date** (*decided*): the genesis sale ends at a date set
  at launch, which can be brought forward, never pushed back; what is
  unsold then is never minted. That makes "limited" true without a fake
  timer.
- **Royalties:** keep 5%, describe it plainly, and count it as zero in the
  budget.

**Pricing ladder (GNOT; *decided*).** Anchored on gnofly's 77 GNOT (about
$5 to $7 at September prices) and on GNOT's current volatility, each price
a number from golf.

| tier | count | price (GNOT) | about $ at $0.07 | why this number |
|---|---|---|---|---|
| Common | 504 | 36 | ~$2.50 | the par of nine holes; an impulse buy, below a gnofly plane; most players' first gnome |
| Rare | 144 | 72 | ~$5 | the par of a course; about a gnofly plane, plus a coloured trail |
| Epic | 65 | 336 | ~$24 | the dimples on a golf ball; its own material and holing effect: a real flex |
| Legendary | 7 | 1,296, fixed | ~$91 | 18 holes × par 72; a 1/1 with a name on the boards, one per wallet |

If every token sells: 18,144 + 10,368 + 21,840 + 9,072 = 59,424 GNOT. That
is a ceiling, not a forecast. The first draft's 5 / 20 / 75 GNOT ladder came
out at about $0.35 / $1.40 / $5, which signalled "throwaway", and the
brief's first proposal (30 / 99 / 333, a 777 reserve) gave way to the
numbers above. The owner may re-price in GNOT between waves if GNOT moves by
more than about 2x (the realm's `SetPrice` allows it), never during a wave,
and never lower on what is already on sale.

**Recommended launch plan (a recommendation).**

| phase | when | what |
|---|---|---|
| 0. Onyx dress rehearsal | 2 weeks before | the full flow with faucet GNOT; invite players to "buy" and file bugs; publish the realm and its table |
| 1. Teasers | T-14 to T-1 | one Legendary revealed a day (7 days), a lore card for each world, the gallery live with every gnome browsable and *not yet for sale* |
| 2. Launch and wave 1 (the Garden, ids 1–104) | T | the closing date set and shown; 48h player window, then public; its Legendary (The Miller, id 104) on sale with the rest at its fixed price |
| 3. Wave 2 (the Island Cup, ids 105–208), then waves 3 to 7 | weekly | one world a week; open only if the previous wave is over about 70% sold, otherwise slow down |
| 4. Close | the closing date | the sale ends; unsold gnomes, Legendaries included, are never minted. No free "Founding Gnome" for buyers: this brief first proposed one, but a gift tied to a purchase is a premium (景品類) under Japan's 景品表示法, so it is not done |
| Always on | from day 0 | earned gnomes free, proven by play, so nobody has to pay to look good |

---

## 3. Art direction and presentation

- **Cohesion.** A strict style guide keeps a collection reading as a brand
  (Nouns' 32x32 pixels, Pudgy's round silhouette). Azuki Elementals
  failed partly because its art was "virtually indiscernible" from the
  original, which blurred value
  ([CoinDesk](https://www.coindesk.com/web3/2023/06/28/azuki-elementals-mint-mishap-highlights-the-fragile-state-of-the-nft-market)).
- **Rarity at a glance.** The game convention since Diablo and WoW: grey,
  green, blue, purple, then gold or orange
  ([TV Tropes](https://tvtropes.org/pmwiki/pmwiki.php/Main/ColorCodedItemTiers),
  [Medium, colour theory](https://medium.com/@ClaireFish/how-color-theory-codifies-item-quality-in-video-games-104d8118044)).
  Players read it with no explanation.
- **Trait naming and lore.** Named traits and lore give people something to
  talk about. Nouns' CC0 approach shows how lore and derivatives drive
  attention back to the originals
  ([The Block](https://www.theblock.co/post/168917/how-cc0-can-help-or-hurt-nft-projects)).
- **Reveal moments.** With no random draw there is no "reveal" at mint, and
  that is a feature. The dramatic moment moves to the *pre-launch* (one
  Legendary a day) and to the *holing effect* the first time you sink a
  putt with your new gnome.

**Apply to Gnogolf:**
- Each tier has its own frame colour and material, consistent everywhere:
  Common = cream/stone, Rare = blue, Epic = purple, Legendary = gold with a
  slow shimmer. Tiers show through a different *silhouette change* as well
  as colour (Rare: pattern; Epic: material; Legendary: unique mesh), so they
  read in grayscale too, for colour-blind players.
- Give every gnome a proper name ("Fennel of the Garden #214") and a
  one-line epithet generated from its traits. Group trait names by world.
- Thumbnails: one camera angle, one light, one background per tier, framed
  as a three-quarter bust. Prebuild every 256 px thumbnail and every
  1200x630 OG card at build time.
- Turntable on the token page: render live with the game's own three.js
  scene (no video for 720 tokens). Prebuild short clips only for the 7
  Legendaries and a few hero Epics.
- Legendary reveal day: a 10-second clip of the entrance and the holing
  effect, plus a lore paragraph tying it to its world.

---

## 4. Marketing

- **Free share loops beat ads.** Pudgy says its GIPHY GIFs passed 10B views
  ([Pudgy on X](https://x.com/pudgypenguins/status/1729275495273938959)).
  *Unverified:* X's trending card claims 300B. Nouns grew through
  derivatives ([Decrypt](https://decrypt.co/86795/how-ethereum-nft-project-nouns-is-building-open-source-ip)).
- **Visible in-game use is the strongest ad** for a cosmetic. Players see
  Off the Grid's skins in matches, which feeds its market
  ([Decrypt](https://decrypt.co/331777/off-the-grid-skin-sale-volume-hits-30k-as-the-avalanche-shooter-hits-opensea)).
- **Community.** Small ecosystems run on a handful of channels: gno.land's
  Discord and X accounts, its ecosystem page
  ([gno.land/ecosystem](https://gno.land/ecosystem)), and other gno.land
  games (gnofly) for cross-promotion.
- **Measure** what you can do without a server: on-chain sales per wave,
  unique buyers, the share of buyers who already had a record, equips per
  day (on chain), and the Netlify analytics already available (page views of
  `/gnomes`, OG image hits).

**Apply to Gnogolf:**
- **T-14 to T-1:** one Legendary a day on X and Discord (clip, name, world,
  lore). Gallery live with "Coming <date>" so people can favourite gnomes
  ahead of time (`localStorage`).
- **Ghost duels as a flex:** a rival's ghost wears its owner's gnome, and
  the duel-finish card shows both gnomes. This is the main loop:
  seeing a ghost → "which gnome is that?" → token page.
- **Share cards** after a good round show the player's gnome; a Legendary
  owner's name pill on the boards; a "Wave N is open" card.
- **Creators:** give the 2 or 3 gno.land streamers and builders an *earned*
  gnome or early access to the onyx rehearsal, not free paid gnomes (the
  spec forbids team mints anyway). Ask for clips, not shilling.
- **Cross-promotion with gnofly:** "holders of a gnofly plane get the player
  window" is a cheap, friendly gesture if their realm exposes `BalanceOf`.
  *To verify.*
- **Copy tone:** playful and about the game ("Pick your gnome. Putt in
  style."), never about value.

---

## 5. Site and UI best practices

Sources for allowlist and mint flow:
[OpenSea learn](https://opensea.io/learn/nft/what-is-an-allowlist),
[Crypto Adventure](https://cryptoadventure.com/nft-whitelisting-explained/).
These answer the questions a buyer has: which contract is official, when it
opens, the price, what the wallet will sign. EU guidance on in-game
purchases asks for clear prices in real money, no hidden costs and no dark
patterns exploiting biases
([CPC key principles](https://esportslegal.news/2025/03/25/eu-virtual-currencies-guidelines/),
[Reed Smith Q&A](https://www.reedsmith.com/articles/qas-on-the-eu-consumer-protection-authorities-joint-guidance-paper/)).
Those principles target in-game currencies; applying them to a sale in GNOT
is our own conservative reading.

**Apply to Gnogolf:**
- **Gallery grid**
  - Filter by tier, world, hat, trail and status (available / owned by you /
    sold / coming soon). Sort by id, tier or name.
  - Tier frame colours, a sold badge, and "yours" highlighted.
  - Virtualised grid; thumbnails prebuilt at 256 px with lazy loading. On a
    phone: two columns and a bottom-sheet filter.
- **Token page**
  - Live turntable and trait list.
  - The gnome on the ball at swing size, so you see what you will play with.
  - Trail and holing effect preview (a looping micro-scene).
  - Owner (shortened address or a gno.land username), price or status, and
    a "View on gnoweb" link to `TokenURI`.
  - Share button using the prebuilt OG card.
- **Mint flow (Adena)**
  - Steps: connect → network check (offer the switch) → summary → sign →
    "Play it now" (free, in the browser; others already see your best
    gnome), with an optional "Show this one to everyone" (an on-chain
    equip).
  - The summary states the exact price in GNOT, the one-off storage deposit
    (about 0.35 GNOT, measured in the spec) and the total. Give an approximate USD
    figure, labelled approximate.
  - Explain that the deposit is returned if the gnome is ever burned.
  - Also offer a copy-paste `gnokey` command, as gnofly does.
- **Counters**
  - Show "Wave 2 (Mushroom Town): 61 / 101 found a player". Count up, never
    down for the whole collection.
  - Show a "sold out" stamp per wave.
  - Do not show a fake countdown or a "3 people are looking at this" line.
- **Social proof:** a recent-buys ticker (read from on-chain events when the
  page loads), Legendary owners shown on the gallery header, and the number
  of different players who own a gnome.
- **Trust strip** (one line under the buy button):
  - "Contract on gnoweb" (link to the realm source).
  - "You choose the exact gnome. No random draw."
  - "Payment goes straight to the treasury in the same transaction. The
    contract holds nothing."
  - "Sale closes on <date>. Unsold gnomes are never made."

  - "Cosmetic only. No gameplay advantage."
- **In-game locker / picker**
  - Owned gnomes first, then earned ones, then *available* ones greyed with
    a small price tag.
  - Never interrupt play. No pop-ups after a bad shot, no "your rival has a
    gnome you don't".
  - One gentle entry point: after a personal best, the share card lets you
    "try it on" any gnome as a preview of how the card would look, with a
    link to the gallery.
- **Not pay-to-win:** identical physics and hitbox for every gnome, written
  in the FAQ and tested. Earned gnomes sit next to paid ones in the picker,
  with equal visual weight. Wearing is free: every owned gnome plays in your
  browser at no cost, and others see your best one without a transaction.
- **Mobile:** test Adena mobile's in-app browser. If it is unavailable,
  show the "copy gnokey command" fallback, and allow browsing and choosing
  on mobile with a "finish on desktop" link.

---

## 6. Legal and trust do's and don'ts

- **Loot boxes.** Belgium treats paid random items as illegal gambling
  (heavy fines, criminal exposure). The Netherlands is more nuanced after a
  court overturned a fine on EA
  ([Promise Legal](https://blog.promise.legal/loot-box-laws-game-developers/),
  [Programming Insider](https://programminginsider.com/loot-boxes-regulation-and-where-the-line-sits-in-2026/)).
  In late 2025, EU Parliament committee members called for a ban; no EU law
  yet. Choosing the exact token by id, with traits public, is the right
  answer. *Note:* gnofly draws planes at random
  ([gnofly /nft](https://gnofly.xyz/nft)), so we should not copy it there.
- **Securities-like marketing.**
  - The SEC said in Stoner Cats that "the economic reality of the offering"
    decides, and pointed to marketing about resales and royalties
    ([National Law Review](https://natlawreview.com/article/sec-enforcement-stoner-cats-settlement-signals-intensifying-sec-interest-nft),
    [SEC dissent](https://www.sec.gov/newsroom/speeches-statements/peirce-uyeda-statement-stonercats-091323)).
  - The SEC dropped the OpenSea probe in February 2025
    ([CoinDesk](https://www.coindesk.com/markets/2025/02/22/sec-drops-opensea-investigation-easing-pressure-on-nft-market)),
    but the Howey test stands.
  - In the EU, MiCA excludes unique NFTs, but "large series" are an
    indicator of fungibility. The deciding factor is value from each token's
    own traits and use, not from comparison within the series
    ([FMA Austria](https://www.fma.gv.at/en/cross-sectoral-topics/markets-in-crypto-assets-regulation-micar/non-fungible-tokens-nfts/),
    [CMS](https://cms.law/en/int/publication/legal-experts-on-markets-in-crypto-assets-mica-regulation/nfts-under-micar-are-they-regulated-or-not)).
- **Advertising.** UK ASA rulings (Turtle United, FanCraze, Crypto.com):
  never imply value, show the price and the fees, and say NFTs are
  unregulated in ads aimed at the UK
  ([Turtle United ruling](https://www.asa.org.uk/rulings/turtle-united-nft-a22-1162126-turtle-united-nft.html),
  [Osborne Clarke](https://marketinglaw.osborneclarke.com/advertising-regulation/the-asa-clamps-down-on-nft-investment-ads/)).
- **Platforms.**
  - Steam bans games that issue NFTs
    ([PC Gamer](https://www.pcgamer.com/steam-bans-nfts-cryptocurrencies-blockchain/)).
  - Apple forbids NFTs that unlock features in iOS apps and takes 30% of
    NFT sales made in an app
    ([Game Developer](https://www.gamedeveloper.com/game-platforms/new-apple-guidelines-permit-nfts-to-be-sold-on-app-store)).
  - Keep Gnogolf a web game. If it is ever wrapped as a native app, the
    gnome cosmetics must be reconsidered.

**Apply to Gnogolf.**

Do:
- Let buyers choose the exact token, with traits public before paying.
- Show the price, the deposit and the total before signing.
- Say "cosmetic only" and "for adults" (as the spec says).
- Link the realm source on gnoweb.
- Explain the treasury, and what the money funds (development, hosting
  nothing because static, art).
- Use a simple FAQ: "What do I get? What can't the gnome do? Can I lose
  money? Yes, nothing guarantees resale."

Don't:
- Use the words "invest", "floor", "returns", "appreciate", "early =
  cheaper later", "limited, will go up", or "royalties make your gnome more
  valuable".
- Promise future utility, airdrops or a token to holders.
- Run any paid random mechanic: no mystery box, no "random Rare" bundle, no
  paid re-roll.
- Give gameplay advantages.
- Run giveaways that require paying to enter (raffle law), or give buyers a
  free item for buying (a premium under Japan's 景品表示法).
- Use fake scarcity timers.

Get a short legal review before mainnet: Japanese law first (the seller is
an individual in Japan), then EU and UK consumer law and VAT (the EU and
the UK are not blocked for now), plus the US if marketed there. The
questions are in `docs/superpowers/legal/2026-10-06-lawyer-pack.md`. The
shop (not the game) is closed to China and to Cuba, Iran, North Korea,
Syria, Russia and Belarus by Netlify's country rules. *I could not verify gno.land-specific or Swiss/NewTendermint
guidance.*

---

## What I could not verify

- gnofly's exact sales and price come from the spec's on-chain read and from
  the brief. Its live page does not show a price or a sold count.
- GNOT/USD prices come from KuCoin's news flash and user-written posts.
- "500 to 1,000 holder collections outperform" is a blog claim with no data.
- Pudgy's 300B GIPHY views come from an X trending card. The 10B figure is
  from Pudgy's own post.
- Off the Grid's volumes are third-party figures. Foundation going offline
  in April 2026 comes from a search summary only.
- Whether gno.land markets (Bazaar) honour `grc721/royalty`.
- Whether Adena mobile supports this mint flow end to end.
