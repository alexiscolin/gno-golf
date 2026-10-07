# Try it all locally / Tout essayer en local

```sh
scripts/try-local.sh          # start (Ctrl+C stops it all)
scripts/try-local.sh wave2    # open the gnomes' wave 2 now
scripts/try-local.sh down     # clean up after a crash
```

**English.** One command starts a local chain with the game, the gnome shop
and the Builder deployed, two throwaway wallets, and the site's dev server
with `NEXT_PUBLIC_GNOMES`, `NEXT_PUBLIC_BUILDER` and `NEXT_PUBLIC_COMMUNITY`
on. In a minute or two it prints the links, the wallets' seed phrases (made
for this run, printed here and written nowhere), the network to add to
Adena and what to try.

Every server listens on 127.0.0.1 alone. With Tailscale, the
tailnet-preview skill (`~/.claude/skills/tailnet-preview`) opens Serve
entries on the tailnet only (never Funnel), removed on Ctrl+C:

- `https://<machine>.<tailnet>.ts.net:<port>/`: the link to use, a secure
  page (the Builder, the community holes and copying links need one). If
  it does not open on a device, turn on *Use Tailscale DNS* in that
  device's Tailscale app.
- `http://<tailscale-ip>:<port>/`: the fallback, plain http: the game and
  the shop work; the Builder's test and publish, the community holes and
  copying links do not.
- The page reads the chain on its own origin (`/rpc`, proxied by the dev
  server), so both links behave alike. Adena signs straight to the node: add
  a custom network with the printed RPC (`http://<tailscale-ip>:<port>`)
  and chain id `gnogolf-local`, then import a printed seed phrase (a Chrome
  profile of its own keeps your real wallet apart).

`p1` has a record (the players' window lets it buy) and a few gnomes; `p0`
has neither. Wave 1 (the Garden) is on sale, its players' window one hour.
The region gate, in a dev build only: `/g/?geo=blocked`. Needs the onyx
toolchain (README, "Running it locally") and `cd web && npm ci`.
`TAILNET=0` keeps it on this machine.

**Français.** Une seule commande lance une chaîne locale avec le jeu, la
boutique de gnomes et le Builder déployés, deux portefeuilles jetables, et
le serveur de dev du site avec `NEXT_PUBLIC_GNOMES`, `NEXT_PUBLIC_BUILDER`
et `NEXT_PUBLIC_COMMUNITY` activés. En une ou deux minutes elle affiche les
liens, les phrases de récupération (faites pour cette session, affichées
ici et écrites nulle part), le réseau à ajouter dans Adena et quoi essayer.

Chaque serveur n'écoute que sur 127.0.0.1. Avec Tailscale, le skill
tailnet-preview ouvre des entrées Serve sur le tailnet seulement (jamais
Funnel), retirées au Ctrl+C :

- `https://<machine>.<tailnet>.ts.net:<port>/` : le lien à utiliser, une
  page sécurisée (le Builder, les trous de la communauté et la copie de
  liens en ont besoin). S'il ne s'ouvre pas sur un appareil, activer *Use
  Tailscale DNS* dans l'app Tailscale de cet appareil.
- `http://<ip-tailscale>:<port>/` : le secours, en http simple : le jeu et
  la boutique marchent ; le test et la publication du Builder, les trous de
  la communauté et la copie de liens non.
- La page lit la chaîne sur sa propre origine (`/rpc`, relayé par le serveur
  de dev) : les deux liens se comportent pareil. Adena signe directement
  vers le nœud : ajouter un réseau personnalisé avec le RPC affiché
  (`http://<ip-tailscale>:<port>`) et le chain id `gnogolf-local`, puis
  importer une phrase affichée (un profil Chrome à part garde votre vrai
  portefeuille séparé).

`p1` a un record (la fenêtre des joueurs le laisse acheter) et quelques
gnomes ; `p0` n'a ni l'un ni l'autre. La vague 1 (le Jardin) est en vente,
fenêtre des joueurs d'une heure. Le blocage par région, en build de dev
seulement : `/g/?geo=blocked`. Il faut la toolchain onyx (README, « Running
it locally ») et `cd web && npm ci`. `TAILNET=0` le garde sur cette machine.
