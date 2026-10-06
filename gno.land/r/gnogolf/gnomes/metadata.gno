package gnomes

import (
	"errors"

	"gno.land/p/nt/grc721/v0"
)

// TokenMetadata is a minted gnome as a wallet or a market reads it: the
// keys OpenSea and Adena read, computed from its row on every read (nothing
// is stored per token; grc721's metadata extension would keep a copy). The
// image is the on-chain SVG; external_url, the gnome's page on the site, is
// there once the owner has set the site (SetSiteURL).
//
//	{"name":"…","description":"…","image":"data:image/svg+xml;base64,…",
//	 "external_url":"<site>g/1/",
//	 "attributes":[{"trait_type":"Tier","value":"common"},{"trait_type":"Series","value":"genesis"}]}
func TokenMetadata(tid string) (string, error) {
	if _, err := Token.OwnerOf(grc721.TokenID(tid)); err != nil {
		return "", errors.New(errNoGnome)
	}
	g, ok := tokenAt(parseID(tid))
	if !ok {
		return "", errors.New(errNoGnome)
	}
	image, _ := TokenURI(tid)
	attrs := `{"trait_type":"Tier","value":"` + tierName(g.tier) + `"},{"trait_type":"Series","value":"` + g.series + `"}`
	if g.tier == earnedTier {
		attrs += `,{"trait_type":"Kind","value":"` + earnedKinds[g.kind-1] + `"}`
	}
	link := ""
	if siteURL != "" {
		page := tid // a catalogue gnome's page is its id's; an earned one's, its kind's (the site's /g/<kind>/)
		if g.tier == earnedTier {
			page = earnedKinds[g.kind-1]
		}
		link = `,"external_url":"` + siteURL + "g/" + page + `/"`
	}
	return `{"name":` + jsonString(g.name) + `,"description":` + jsonString(describe(g)) + `,"image":"` + image + `"` +
		link + `,"attributes":[` + attrs + `]}`, nil
}

// describe is a gnome's line: what it is, never what it is worth.
func describe(g gnome) string {
	if g.tier == earnedTier {
		return g.name + ", earned in play: " + earnedNeeds[g.kind-1] + ". Bound to its player, cosmetic only."
	}
	return g.name + " of the Gnogolf Gnomes: a " + tierName(g.tier) + " of the " + g.series +
		" series. A ball to play with, cosmetic only."
}
