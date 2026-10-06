package gnomes

import (
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

// What a wallet or a market reads of a token: the keys OpenSea and Adena
// read, computed from the row on every read.
func TestTokenMetadataIsTheRowsAsAWalletReadsIt(cur realm, t *testing.T) {
	fresh(t, cur)
	_, err := TokenMetadata("1")
	uassert.Error(t, err, "not minted")
	_, err = TokenMetadata("nope")
	uassert.Error(t, err)

	testing.SetRealm(asUser(alice, ugnot(priceOf(1))))
	Buy(cross(cur), "1")
	md, err := TokenMetadata("1")
	urequire.NoError(t, err)
	uri, _ := TokenURI("1")
	uassert.Equal(t,
		`{"name":"Gnome 1","description":"Gnome 1 of the Gnogolf Gnomes: a common of the genesis series. A ball to play with, cosmetic only.",`+
			`"image":"`+uri+`",`+
			`"attributes":[{"trait_type":"Tier","value":"common"},{"trait_type":"Series","value":"genesis"}]}`,
		md, "no site set: no external_url, and the image is on chain whatever the site")

	testing.SetRealm(asUser(deployer, nil))
	SetSiteURL(cross(cur), "https://golf.example.org/")
	md, _ = TokenMetadata("1")
	uassert.True(t, strings.Contains(md, `"image":"`+uri+`","external_url":"https://golf.example.org/g/1/","attributes"`), md)
}

// The site's address is the owner's to move, under golf's play link rule
// (p/gnogolf/weblink), and ends with "/": a gnome's page is <site>g/<id>/.
func TestTheOwnerMovesTheSite(cur realm, t *testing.T) {
	fresh(t, cur)
	uassert.Equal(t, "", SiteURL(), "none at deploy")
	testing.SetRealm(asUser(alice, nil))
	urequire.AbortsContains(t, cur, "only the owner", func() { SetSiteURL(cross(cur), "https://example.org/") })
	testing.SetRealm(asUser(deployer, nil))
	for _, bad := range []string{"http://example.org/", "https://", "https://x.org/?a=1", "https://x.org/)[x](y",
		"javascript:alert(1)", "https://example.org", "https://" + strings.Repeat("x", 100) + "/"} {
		urequire.AbortsContains(t, cur, "a site link is https://", func() { SetSiteURL(cross(cur), bad) }, bad)
	}
	SetSiteURL(cross(cur), "https://golf.example.org/")
	uassert.Equal(t, "https://golf.example.org/", SiteURL())
	uassert.True(t, strings.Contains(Collection(), `"site":"https://golf.example.org/"`))
	owner = ""
	urequire.AbortsContains(t, cur, "only the owner", func() { SetSiteURL(cross(cur), "https://example.org/") })
}

func TestAnEarnedTokensMetadataNamesItsKind(cur realm, t *testing.T) {
	f := withRows(t, cur)
	for _, id := range cupHoles(f, "garden", 18) {
		best(f, id, "assisted", alice.String(), 3)
	}
	testing.SetRealm(asUser(alice, nil))
	id := MintEarned(cross(cur), "viking")
	md, err := TokenMetadata(id)
	urequire.NoError(t, err)
	uassert.True(t, strings.Contains(md, `"name":"The Viking"`), md)
	uassert.True(t, strings.Contains(md, `{"trait_type":"Kind","value":"viking"}`), md)
	uassert.True(t, strings.Contains(md, `"description":"The Viking, earned in play: Garden Cup at par or under. Bound to its player, cosmetic only."`), md)
	uassert.False(t, strings.Contains(md, "external_url"), "no site set")

	// an earned gnome's page is its kind's (the site builds one per kind, not
	// per earned id, which has no bound)
	testing.SetRealm(asUser(deployer, nil))
	SetSiteURL(cross(cur), "https://golf.example.org/")
	md, _ = TokenMetadata(id)
	uassert.True(t, strings.Contains(md, `"external_url":"https://golf.example.org/g/viking/"`), md)
	uri, err := TokenURI(id)
	urequire.NoError(t, err)
	uassert.True(t, strings.HasPrefix(uri, svgDataPrefix))
}

// A name is escaped in the JSON as it is in the SVG.
func TestMetadataEscapesTheName(cur realm, t *testing.T) {
	fresh(t, cur)
	urequire.NoError(t, addSeries("odd", `721|common|Pip "the" \ Q|v0.a`))
	urequire.NoError(t, addWave(721, 721, now(), 0))
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	Buy(cross(cur), "721")
	md, _ := TokenMetadata("721")
	uassert.True(t, strings.HasPrefix(md, `{"name":"Pip \"the\" \\ Q",`), md)
}
