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
			`"image":"`+uri+`","external_url":"https://gnogolf.xyz/g/1/",`+
			`"attributes":[{"trait_type":"Tier","value":"common"},{"trait_type":"Series","value":"genesis"}]}`,
		md)
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
