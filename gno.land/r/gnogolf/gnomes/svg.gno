package gnomes

import (
	"encoding/base64"
	"errors"
	"strings"

	"gno.land/p/nt/grc721/v0"
)

// TokenURI returns the image of a minted gnome as an on-chain SVG, a data
// URI a wallet puts in an <img>. It is drawn on every read, nothing is
// stored per token. The traits are opaque here until their encoding is
// settled (docs/gnomes/design.md): the hat takes the tier's colour, the
// title the gnome's name; the game draws the real gnome from its traits.
func TokenURI(tid string) (string, error) {
	if _, err := Token.OwnerOf(grc721.TokenID(tid)); err != nil {
		return "", errors.New(errNoGnome)
	}
	g, ok := tokenAt(parseID(tid))
	if !ok {
		return "", errors.New(errNoGnome)
	}
	return portrait(g), nil
}

// portrait is gnome g drawn, as a data URI: TokenURI's for a minted gnome,
// and its page's for any.
func portrait(g gnome) string {
	return svgDataPrefix + base64.StdEncoding.EncodeToString([]byte(drawGnome(g)))
}

const svgDataPrefix = "data:image/svg+xml;base64,"

// tierColours is the hat of each tier, in the order of tiers; earnedColour
// an earned gnome's.
var tierColours = []string{"#e0524b", "#5b6fb5", "#4b3a9a", "#f2c14e"}

const earnedColour = "#2f8f6f"

func hatColour(t int) string {
	if t == earnedTier {
		return earnedColour
	}
	return tierColours[t]
}

// drawGnome draws a gnome: the body, the face, the beard, the cone of the hat.
func drawGnome(g gnome) string {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">` +
		`<title>` + xmlEscape(g.name) + `</title>` +
		`<rect width="100" height="100" fill="#cfe8c4"/>` +
		`<ellipse cx="50" cy="84" rx="24" ry="14" fill="#3f6fb0"/>` +
		`<circle cx="50" cy="56" r="14" fill="#f4c9a8"/>` +
		`<path d="M35 58 Q50 94 65 58 Z" fill="#ffffff"/>` +
		`<path d="M32 50 L50 8 L68 50 Z" fill="` + hatColour(g.tier) + `"/>` +
		`<circle cx="50" cy="58" r="3" fill="#e8a08a"/>` +
		`</svg>`
}

var xmlEscaper = strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", `"`, "&quot;", "'", "&#39;")

func xmlEscape(s string) string { return xmlEscaper.Replace(s) }
