package gnomes

import (
	"encoding/base64"
	"strings"
	"testing"

	"gno.land/p/nt/uassert/v0"
	"gno.land/p/nt/urequire/v0"
)

func TestTokenURIIsAnOnChainSVG(cur realm, t *testing.T) {
	fresh(t, cur)
	id := common()
	_, err := TokenURI(itoa(id))
	uassert.Error(t, err, "not sold")

	testing.SetRealm(asUser(alice, ugnot(priceOf(id))))
	tid := Buy(cross(cur), itoa(id))
	uri, err := TokenURI(tid)
	urequire.NoError(t, err)
	urequire.True(t, strings.HasPrefix(uri, svgDataPrefix), uri)
	svg := decodeDataURI(t, uri)
	uassert.True(t, strings.HasPrefix(svg, "<svg"), svg)
	uassert.True(t, strings.Contains(svg, tierColours[mustGnome(id).tier]), "the tier's colour is drawn")
	uassert.True(t, strings.Contains(svg, "<title>"+xmlEscape(mustGnome(id).name)+"</title>"), svg)
	uassert.True(t, strings.HasSuffix(svg, "</svg>"), svg)
}

// A name is the catalogue's, which only the owner writes; it is escaped all
// the same, so no row can inject markup into a wallet.
func TestANameCannotInjectMarkup(cur realm, t *testing.T) {
	fresh(t, cur)
	urequire.NoError(t, addSeries("evil", `721|common|<script>"x"</script>|v0.a`))
	urequire.NoError(t, addWave(721, 721, now(), 0))
	testing.SetRealm(asUser(alice, ugnot(tiers[0].price)))
	Buy(cross(cur), "721")
	uri, _ := TokenURI("721")
	svg := decodeDataURI(t, uri)
	uassert.False(t, strings.Contains(svg, "<script>"), svg)
	uassert.True(t, strings.Contains(svg, "&lt;script&gt;&quot;x&quot;"), svg)
}

func TestEveryTierHasAColour(t *testing.T) {
	uassert.Equal(t, len(tiers), len(tierColours))
}

func TestXMLEscape(t *testing.T) {
	uassert.Equal(t, "a &amp; &lt;b&gt; &quot;c&quot; &#39;d&#39;", xmlEscape(`a & <b> "c" 'd'`))
}

func decodeDataURI(t *testing.T, uri string) string {
	b, err := base64.StdEncoding.DecodeString(strings.TrimPrefix(uri, svgDataPrefix))
	urequire.NoError(t, err)
	return string(b)
}
