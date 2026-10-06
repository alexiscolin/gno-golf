# Try it all locally / Tout essayer en local

```sh
scripts/try-local.sh
```

**English.** One command starts a local chain with the game, the gnome shop
and the Builder deployed, throwaway wallets, and the site's dev server with
`NEXT_PUBLIC_GNOMES`, `NEXT_PUBLIC_BUILDER` and `NEXT_PUBLIC_COMMUNITY` on.
It takes a few minutes, then prints the URL, the wallets' seed phrases, the
network to add to Adena and what to try. Ctrl+C stops everything. Nothing
leaves this machine: the keys exist for that chain alone.

Everything listens on all interfaces and the site is given this machine's
Tailscale address (`tailscale ip -4`; `HOST=` to choose another), so it
opens from a phone or another computer on the tailnet:
`http://<host>:5174/` (or the next free port: it prints the URL). Such a
page is not a secure context for a browser elsewhere, which the Builder and
copying links need: on that device, enable
`chrome://flags/#unsafely-treat-insecure-origin-as-secure` for the three
origins it prints (site, RPC, gnoweb). Adena: *Settings → Change Network → Add Custom
Network*, chain id `gnogolf-local`, RPC `http://<host>:26667`, then import a
printed seed phrase (a separate Chrome profile keeps your own wallet apart).

- `p1` has a record (the player window lets it buy) and a few gnomes;
  `p0` has neither.
- Wave 1 (the Garden) is on sale, its players' window one hour. Wave 2:
  `scripts/try-local.sh wave2` in another terminal.
- The region gate, in a dev build only: `/g/?geo=blocked`.
- Needs the onyx toolchain (README, "Running it locally") and
  `cd web && npm ci`. Ports: `APP_PORT` 5174, `RPC_PORT` 26667,
  `GNOWEB_PORT` 8868. Logs and keys: the folder it prints.

**Français.** Une seule commande lance une chaîne locale avec le jeu, la
boutique de gnomes et le Builder déployés, des portefeuilles jetables, et le
serveur de dev du site avec `NEXT_PUBLIC_GNOMES`, `NEXT_PUBLIC_BUILDER` et
`NEXT_PUBLIC_COMMUNITY` activés. Quelques minutes, puis elle affiche l'URL,
les phrases de récupération des portefeuilles, le réseau à ajouter dans
Adena et quoi essayer. Ctrl+C arrête tout. Rien ne sort de cette machine :
les clés n'existent que pour cette chaîne.

Tout écoute sur toutes les interfaces et le site reçoit l'adresse Tailscale
de la machine (`tailscale ip -4` ; `HOST=` pour en choisir une autre) : il
s'ouvre depuis un téléphone ou un autre ordinateur du tailnet,
`http://<host>:5174/` (ou le port libre suivant : l'URL est affichée). Une
telle page n'est pas un contexte sécurisé pour un navigateur ailleurs, ce
dont le Builder et la copie de liens ont besoin : sur cet appareil, activer
`chrome://flags/#unsafely-treat-insecure-origin-as-secure` pour les trois
origines affichées (site, RPC, gnoweb). Adena : *Settings → Change Network → Add Custom
Network*, chain id `gnogolf-local`, RPC `http://<host>:26667`, puis importer
une phrase affichée (un profil Chrome à part garde votre vrai portefeuille
séparé).

- `p1` a un record (la fenêtre des joueurs le laisse acheter) et quelques
  gnomes ; `p0` n'a ni l'un ni l'autre.
- La vague 1 (le Jardin) est en vente, fenêtre des joueurs d'une heure.
  Vague 2 : `scripts/try-local.sh wave2` dans un autre terminal.
- Le blocage par région, en build de dev seulement : `/g/?geo=blocked`.
- Il faut la toolchain onyx (README, « Running it locally ») et
  `cd web && npm ci`. Ports : `APP_PORT` 5174, `RPC_PORT` 26667,
  `GNOWEB_PORT` 8868. Journaux et clés : le dossier affiché.
