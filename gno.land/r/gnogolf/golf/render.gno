package golf

import (
	"encoding/hex"
	"math"
	"strconv"
	"strings"
	"time"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/nt/ufmt/v0"
)

// wearRunes escalate with traffic: pristine grass, then a groove, at up to
// wearLight, wearWorn and wearGroove balls come to rest in a cell, and past.
const (
	wearRunes  = ".:;x%"
	wearLight  = 2
	wearWorn   = 6
	wearGroove = 14
)

// maxTunnels is how many tunnels the board numbers, 1 to 9.
const maxTunnels = 9

const (
	markWall = '#'
	markPost = '0'
	markCup  = 'U' // not O: in gnoweb's font O and the post's 0 look alike
	markTee  = '*'
)

// Render is the game as text: gnoweb draws the board and submits the shot. The
// 3D client reads the same State and plays the same physics.
//
// Paths: "" the hub; "<world>" a cup's holes; "<address>" the holes an
// address published; "<hole>" a hole's page, "<hole>/<address>" the same
// with that player's ball, "<hole>/data" a version's provenance and data.
// <hole> is a version's id or an alias. A query string ("?…") is ignored.
func Render(path string) string {
	if i := strings.IndexByte(path, '?'); i >= 0 {
		path = path[:i]
	}
	if path == "" {
		return renderHub()
	}
	if e := lookup(path); e != nil {
		return renderHole(e, e.hole(), "")
	}
	// the segments of a hole's path, which gnoweb links one by one
	if isWorld(path) {
		return renderCup(path)
	}
	if address(path).IsValid() {
		return renderAuthor(address(path))
	}
	// the id has slashes of its own, so what trails it is looked at last
	if i := strings.LastIndex(path, "/"); i >= 0 {
		head, tail := path[:i], path[i+1:]
		if e := lookup(head); e != nil {
			if address(tail).IsValid() {
				return renderHole(e, e.hole(), address(tail))
			}
			if tail == "data" {
				return renderData(e)
			}
		}
	}
	what := "That page"
	if c := cleanText(path, maxName); c != "" {
		what = "`" + c + "`"
	}
	return "# No such hole\n\n> [!WARNING]\n> " + what + " is not a hole here. " + md("See every hole", hub) + ".\n"
}

// lookup is readHole that answers nil for no hole.
func lookup(id string) *entry {
	if e := find(id); e != nil {
		return e
	}
	return find(current(id))
}

// playLink is the 3D client on this very hole, as a short link a player can
// share: a current course hole by its cup and its place in it (the client
// maps them back), any other by its id, which no newer version can take.
func playLink(e *entry) string {
	if !e.official || e.next != "" {
		return playURL + "?hole=" + e.id
	}
	return playURL + "?cup=" + e.world + "&hole=" + strconv.Itoa(int(e.order))
}

// cupName is how a world is called on the page.
func cupName(w string) string {
	if r := worldRank(w); r < len(worlds) {
		return worlds[r].name
	}
	if w == "" {
		return "Holes"
	}
	return strings.ToUpper(w[:1]) + w[1:]
}

// who is a player as a link to their gno.land profile.
func who(addr string) string { return md(short(addr), "/u/"+addr) }

func renderHub() string {
	var sb strings.Builder
	sb.WriteString("# Gnogolf — mini-golf on-chain\n\n" + moved() +
		"The course is data its owner published, anyone can add holes of their own, and the chain computes every shot: nobody can fake a score.\n\n" +
		"> [!TIP] How to play\n" +
		"> **In 3D:** " + md("open the game", playURL) + ". Aim with a free preview, then record your round in one transaction.\n" +
		"> **Here, one shot at a time:** open a hole, fill its Launch form (an angle and a power) and sign it with your gno.land wallet (" + md("Adena", "https://adena.app") + "), then add `/<your address>` to the hole's URL to see your ball.\n" +
		"> Only players with a gno.land name are ranked.\n\n")
	var archived, others []*entry
	type cup struct {
		world      string
		holes, par int
		top        *entry
	}
	var cups []*cup
	for _, e := range listed() {
		switch {
		case e.official && e.next == "":
			// one card per cup: nothing here calls a hole
			if len(cups) == 0 || cups[len(cups)-1].world != e.world {
				cups = append(cups, &cup{world: e.world})
			}
			c := cups[len(cups)-1]
			c.holes++
			c.par += e.par
			if e.plays > 0 && (c.top == nil || e.plays > c.top.plays) {
				c.top = e
			}
		case e.official:
			archived = append(archived, e)
		default:
			others = append(others, e)
		}
	}
	if len(cups) == 0 {
		sb.WriteString("_No course hole yet._\n\n")
	} else {
		sb.WriteString("<gno-columns>\n")
		for i, c := range cups {
			if i > 0 {
				sb.WriteString("<gno-columns-sep />\n")
			}
			sb.WriteString("### " + md(cupName(c.world), hub+":"+c.world) + "\n\n" + strconv.Itoa(c.holes) + " holes · par " + strconv.Itoa(c.par) + "\n")
			if c.top != nil {
				sb.WriteString("\nmost played: " + c.top.name + "\n")
			}
		}
		sb.WriteString("</gno-columns>\n\n")
	}

	sb.WriteString("## Leaderboard\n\nEach named player's best finish on each current hole of the course, added up: most holes first, then fewest strokes. " +
		"Assisted and pro rounds (the aim preview cut short, on the player's word) are ranked apart.\n\n<gno-columns>\n")
	for m := 0; m < modes; m++ {
		if m > 0 {
			sb.WriteString("<gno-columns-sep />\n")
		}
		sb.WriteString("### " + [modes]string{"Assisted", "Pro"}[m] + "\n\n")
		rows, i := "", 0
		eachRanked(m, func(r *row, name string) {
			i++
			rows += "| " + strconv.Itoa(i) + " | " + md("@"+name, "/u/"+name) + " | " + strconv.Itoa(r.holes) + " | " + strconv.Itoa(r.strokes) + " |\n"
		})
		if rows == "" {
			sb.WriteString("_Nobody has finished a hole of the course yet._\n")
			continue
		}
		sb.WriteString("| rank | player | holes | strokes |\n|---|---|---|---|\n" + rows)
	}
	sb.WriteString("</gno-columns>\n\n")

	sb.WriteString("## Community holes\n\nAnyone can publish a hole of their own with PublishMine. These are not part of the course: they have no cup and do not count in its ranking.\n\n")
	if len(others) == 0 {
		sb.WriteString("_None yet. Publish yours with " + md("PublishMine", hub+"$help&func=PublishMine") + "._\n")
	} else {
		sb.WriteString("| hole | by | par | best | shots played |\n|---|---|---|---|---|\n")
		for _, e := range others {
			sb.WriteString("| " + md(e.name, hub+":"+e.slot) + " | " + md(short(e.by.String()), hub+":"+e.by.String()) + " | " + strconv.Itoa(e.par) + " | " + bestCell(e) + " | " +
				strconv.Itoa(e.plays) + " |\n")
		}
	}
	if len(archived) > 0 {
		sb.WriteString("\n## Archived course holes\n\nA newer version took each one's place in its cup. They can still be played, and keep their records, but no longer count in the course-wide ranking. Every version of a slot is on its data page.\n\n" +
			"| hole | version | par | best | shots played | now |\n|---|---|---|---|---|---|\n")
		for _, e := range archived {
			sb.WriteString("| " + md(e.name, hub+":"+e.id) + " | " + e.id + " | " + strconv.Itoa(e.par) + " | " + bestCell(e) + " | " +
				strconv.Itoa(e.plays) + " | " + md(e.next, hub+":"+e.next) + " |\n")
		}
	}
	sb.WriteString(noAdmin())
	return sb.String()
}

// moved is the banner a course taken over shows on every page.
func moved() string {
	if successor == "" {
		return ""
	}
	return "> [!NOTE] This course has moved\n> Its successor is " + md(successor, strings.TrimPrefix(successor, "gno.land")) +
		". Everything here still plays and keeps its records.\n\n"
}

// renderCup is a cup's page: its current holes, in order.
func renderCup(world string) string {
	var sb strings.Builder
	sb.WriteString("# " + cupName(world) + "\n\n" + moved())
	k := slotKey(world, 0)
	k = k[:len(k)-3] // the world's slots are the keys "<rank><world>/…"
	n := 0
	slots.Iterate(k, k[:len(k)-1]+"0", func(_ string, v any) bool {
		e := find(v.(string))
		if n == 0 {
			sb.WriteString("| # | hole | par | best | shots played | data |\n|---|---|---|---|---|---|\n")
		}
		n++
		sb.WriteString("| " + strconv.Itoa(int(e.order)) + " | " + md(e.name, hub+":"+e.slot) + " | " + strconv.Itoa(e.par) + " | " +
			bestCell(e) + " | " + strconv.Itoa(e.plays) + " | " + source(e) + " |\n")
		return n >= maxListed
	})
	if n == 0 {
		sb.WriteString("_No course hole in this cup._\n")
	}
	return sb.String() + "\n" + md("Every cup", hub) + "\n"
}

// renderAuthor is the holes an address published, as their current versions.
func renderAuthor(a address) string {
	var sb strings.Builder
	sb.WriteString("# Holes by " + who(a.String()) + "\n\n" + moved())
	n := 0
	aliases.Iterate(a.String()+"/", a.String()+"0", func(_ string, v any) bool {
		e := find(v.(string))
		if n == 0 {
			sb.WriteString("| hole | versions | par | best | shots played | data |\n|---|---|---|---|---|---|\n")
		}
		n++
		sb.WriteString("| " + md(e.name, hub+":"+e.slot) + " | " + strconv.Itoa(e.version) + " | " + strconv.Itoa(e.par) + " | " +
			bestCell(e) + " | " + strconv.Itoa(e.plays) + " | " + source(e) + " |\n")
		return n >= pageMax
	})
	if n == 0 {
		sb.WriteString("_This address has published no hole._\n")
	}
	return sb.String() + "\n" + md("Every hole", hub) + "\n"
}

// bestCell is a hole's records, assisted then pro, for a table cell.
func bestCell(e *entry) string {
	best := "—"
	if e.rec(assisted).best > 0 {
		best = ufmt.Sprintf("%d strokes, %s", e.rec(assisted).best, who(e.rec(assisted).by.String()))
	}
	if e.rec(pro).best > 0 {
		best += ufmt.Sprintf(" · pro %d, %s", e.rec(pro).best, who(e.rec(pro).by.String()))
	}
	return best
}

// weatherNote is the hole's weather now, and how long it lasts: one forecast
// per page, only on a hole's own page.
func weatherNote(e *entry, h course.Hole) string {
	f := weatherOf(e, h, Period())
	left := PeriodSeconds - time.Now().Unix()%PeriodSeconds
	what := "Clear"
	switch f.Kind {
	case course.Wind:
		what = ufmt.Sprintf("Wind, %.2f a substep", f.Wind.Len())
	case course.Rain:
		what = "Rain: the green runs fast, and puddles slow the ball"
	case course.Fog:
		what = "Fog"
	case course.Storm:
		what = "Storm: rain, puddles and wind"
	case course.Snow:
		what = "Snow: the green runs slow"
	}
	return ufmt.Sprintf("> [!NOTE] Weather now\n> %s — for %d min %02d s more. A round keeps the weather it started in, and can be played on until the next weather is over: after that it must be Reset.\n\n",
		what, left/60, left%60)
}

// noAdmin states what the reader can check in a minute: who can change what.
// It is deliberately also an admission.
func noAdmin() string {
	holder := who(owner.String())
	if owner == "" {
		holder = "nobody: the role was given up, and the course is frozen for good"
	}
	return "\n> [!INFO]- Who can change what\n" +
		"> Anyone can play (Launch, PlayRound, PlayRoundAt, PlayRoundPro), Reset their own round, " +
		"publish holes of their own (PublishMine) and settle the ranking sooner (Drain). Nobody can edit or delete a round, a record, a best, a standing or a published version, " +
		"and nobody can pause or upgrade this realm. Every hole is data, played by golf's own physics: no hole runs code of its own. Check it yourself: " + md("the source", hub+"$source") + ".\n>\n" +
		"> One party holds a real power: the course's owner, now " + holder + ". The owner publishes the course holes and their new versions (Publish). " +
		"A new version takes its slot: the old one is archived, still playable, its records kept, but its bests leave the course-wide ranking, which the new version starts afresh. " +
		"So the owner shapes the course, and through it the ranking, and a stolen owner key could archive every slot, for good. " +
		"A version identical to the current one is refused, but a replacement can still be unplayable: a hole can be replaced, never taken down. " +
		"When a version is published picks its id, and its id seeds its weather. " +
		"The owner also sets where the pages link the 3D game (SetPlayURL), and can name, once and for good, a successor this course has moved to (SetSuccessor): a banner, which blocks nothing. " +
		"Whoever holds `" + strings.TrimPrefix(officialPrefix, "gno.land/") + "` can deploy lookalike realms under it. " +
		"The owner cannot edit or remove a version, touch a community hole, the weather, the physics or this code, " +
		"and can only hand the role on (Transfer, then Accept) or give it up for good (Renounce).\n"
}

// source links a hole to what it is made of: its data page. A player can
// read a hole before trusting it with a round — which is the whole
// difference with a server, where you trust the operator's simulation.
func source(e *entry) string { return md("data", hub+":"+e.id+"/data") }

func md(label, href string) string { return "[" + label + "](" + href + ")" }

// flatRolls is what the page says a shot rolls on flat grass, from a tee
// shot's Kick and the usual friction.
const flatRolls = "On flat grass a power of 10 rolls about 40, a 5 about 15."

func renderHole(e *entry, h course.Hole, focus address) string {
	f := h.Field()
	var mine *round // the focused player's round, looked up once
	if v := e.roundTree().Get(focus.String()); v != nil {
		mine = v.(*round)
	}
	stroke := 0
	if mine != nil {
		stroke = mine.strokes
	}
	// a timed hole is drawn as it stands for the focused player's next stroke
	if t, ok := h.(course.Timed); ok {
		ws, ps := t.Extras(stroke)
		f = course.WithZones(course.WithExtras(f, ws, ps), extraZones(h, stroke))
	}
	// a community hole's world is its author's word: only the course has cups
	where := md(cupName(e.world), hub+":"+e.world)
	if !e.official {
		where = "Community hole by " + md(short(e.by.String()), hub+":"+e.by.String())
	}
	s := ufmt.Sprintf("# %s\n\n**Par %d** · %s · %s\n\n", e.name, e.par, where, md("Play in 3D", playLink(e))) + moved()
	if e.next != "" {
		next := e.next
		if n := find(e.next); n != nil {
			next = n.name
		}
		s += "> [!NOTE]\n> Archived: " + md(next, hub+":"+e.next) + " (" + e.next + ") took its place. It can still be played, and your best here still shows on this page"
		if e.official {
			s += ", but it no longer counts in the course-wide ranking"
		}
		s += ".\n\n"
	}
	s += weatherNote(e, h)
	if isTimed(h) {
		if focus == "" {
			s += "_This hole changes with every stroke. It is drawn for a first shot; add `/<your address>` to the URL to see it for your next one._\n\n"
		} else {
			s += ufmt.Sprintf("_This hole changes with every stroke. Drawn for %s's stroke %d._\n\n", short(focus.String()), stroke+1)
		}
	}
	if boardWork(f, h) > maxBoardWork {
		s += "_This hole is too detailed to draw here: " + md("play it in 3D", playLink(e)) + "._\n\n"
	} else {
		b := board(e, h, f, focus)
		leg, walls := legend(f)
		s += "```\n" + b + "```\n\n"
		s += key(b, walls) + leg + "\n\n"
	}

	s += "## Play\n\n"
	// the one number a text player cannot read off the board: where the cup is
	from, who := h.Start(), "the tee"
	if mine != nil && !mine.done && mine.strokes > 0 {
		from, who = mine.ball(), "your ball"
	}
	a, d := aim(from, h.Cup())
	s += ufmt.Sprintf("From %s the cup is **%.0f°** away, **%.1f** units in a straight line (0° = right, 90° = down). %s\n\n", who, a, d, flatRolls)
	s += "_Rounds played here have no aim preview, so they go on the **Pro** board. A shot needs a gno.land wallet (Adena); the 3D game previews shots for free._\n\n"
	s += "<gno-form exec=\"Launch\">\n"
	s += ufmt.Sprintf("<gno-input name=\"hole\" value=\"%s\" readonly=\"true\" description=\"this hole\" required=\"true\" />\n", e.id)
	s += "<gno-input name=\"angle\" placeholder=\"angle in degrees (0 = right, 90 = down), decimals allowed\" required=\"true\" />\n"
	s += "<gno-input name=\"power\" placeholder=\"power, above 0 and up to 10\" required=\"true\" />\n"
	s += "</gno-form>\n\n"
	s += ufmt.Sprintf("_After your shot, see your ball at `%s:%s/<your address>`._\n\n", hub, e.id)
	s += "Holed, or want a fresh start? Put your ball back on the tee:\n\n"
	s += "<gno-form exec=\"Reset\">\n"
	s += ufmt.Sprintf("<gno-input name=\"hole\" value=\"%s\" readonly=\"true\" description=\"this hole\" required=\"true\" />\n", e.id)
	s += "</gno-form>\n\n"

	if focus != "" {
		s += "## " + short(focus.String()) + "'s round\n\n"
		if mine == nil {
			s += "_No round on this hole yet._\n\n"
		} else {
			state := "playing"
			if mine.done {
				state = "**holed**"
			}
			// the shots are golf's own "%.4f,%.4f,%d": digits and punctuation only
			s += ufmt.Sprintf("%d strokes, %s. Shots: `%s`\n\n", mine.strokes, state, strings.ReplaceAll(mine.shots, ";", "; "))
		}
	}

	s += ufmt.Sprintf("## Best rounds\n\n%d players have a round here; %d finished it assisted, %d pro. The named players' bests:\n\n",
		e.roundTree().Size(), e.bests(assisted).Size(), e.bests(pro).Size())
	for m := 0; m < modes; m++ {
		rows := ""
		n := 0
		e.board(m).Iterate("", "", func(_ string, v any) bool {
			p := v.(string)
			if name := nameOf(p); name != "" { // a name deleted since is skipped
				n++
				rows += ufmt.Sprintf("| %d | [@%s](%s:%s/%s) | %d |\n", n, name, hub, e.id, p, e.bests(m).Get(p).(int))
			}
			return n >= topSize
		})
		if rows != "" {
			s += "### " + [modes]string{"Assisted", "Pro"}[m] + "\n\n| rank | player | strokes |\n|---|---|---|\n" + rows + "\n"
		}
	}
	return s + "\n_This hole is " + source(e) + " — read it before you trust it with a round._\n"
}

// renderData is a data version's page: where it came from, its versions,
// and its data, which is all the hole there is.
func renderData(e *entry) string {
	pkgs := strings.Replace(officialPrefix, "gno.land/r/", "/p/", 1) // the course's packages, as "/p/<ns>/"
	s := "# " + e.name + ": its data\n\n**" + e.id + "**, version " + strconv.Itoa(e.version) + " of " + md(e.slot, hub+":"+e.slot) +
		", published at height " + strconv.FormatInt(e.height, 10) + " by " + who(e.by.String()) + ". " + md("Play it", hub+":"+e.id) + ".\n\n"
	if e.note != "" {
		s += "> " + e.note + "\n\n"
	}
	if e.next != "" {
		s += "_Archived: " + md(e.next, hub+":"+e.next) + " took its place._\n\n"
	}
	s += "## Versions\n\n| version | height | by | sha256 | note |\n|---|---|---|---|---|\n"
	now := find(current(e.slot))
	from := 1
	if now.version > pageMax {
		from = now.version - pageMax + 1
	}
	for n := from; n <= now.version; n++ {
		v := find(e.slot + "/v" + strconv.Itoa(n))
		s += "| " + md(v.id, hub+":"+v.id+"/data") + " | " + strconv.FormatInt(v.height, 10) + " | " + who(v.by.String()) + " | `" + v.sha[:16] + "…` | " + v.note + " |\n"
	}
	data := holeData.Get(e.id).(string)
	s += "\n## The data\n\n" + strconv.Itoa(len(data)) + " bytes of GG1, sha256 `" + e.sha + "`. " +
		"Every call decodes it with " + md("course", pkgs+"course$source") + " and plays it with " + md("physics", pkgs+"physics$source") +
		"; " + md("golf", hub+"$source") + " checked it once, when it was published. HoleData gives it back as hex:\n\n"
	return s + "```\n" + hex.EncodeToString([]byte(data)) + "\n```\n"
}

// board rasterises the hole: wear, then zones, posts, walls, cup, balls.
func board(e *entry, h course.Hole, f *physics.Field, focus address) string {
	bw, bh := course.BoardOf(h)
	g := make([][]rune, bh)
	wear := h.Wear()
	for y := 0; y < bh; y++ {
		row := make([]rune, bw)
		for x := 0; x < bw; x++ {
			row[x] = wearRune(wear, x*course.WearW/bw, y*course.WearH/bh)
		}
		g[y] = row
	}
	// the walls, traced once: drawn on the board, and what the flood fill
	// below stops at
	wall := make([][]rune, bh)
	for y := range wall {
		wall[y] = make([]rune, bw)
	}
	for _, w := range f.Walls {
		trace(wall, w.Seg, mark(w.Mark, markWall))
	}

	// the focused player's last flight first, on the grass: pieces drawn after
	// it stay visible (a mole in a gap was hidden under the dots)
	if v := e.roundTree().Get(focus.String()); v != nil {
		for _, p := range lastShot(e, h, v.(*round)).Path {
			put(g, p, '·')
		}
	}

	tunnel := 0
	for i := range f.Zones {
		z := &f.Zones[i]
		m := mark(z.Mark, '?')
		if z.Kind == physics.Tunnel && tunnel < maxTunnels {
			// a tunnel's mouth and its exit share a digit: you can see where it leads
			tunnel++
			m = rune('0' + tunnel)
		}
		drawZone(g, z, m)
	}
	for y := range wall {
		for x, c := range wall[y] {
			if c != 0 {
				g[y][x] = c
			}
		}
	}
	for _, p := range f.Posts {
		fill(g, p.Circle, mark(p.Mark, markPost))
		put(g, p.C, mark(p.Mark, markPost)) // a small post still shows
	}
	tunnel = 0
	for _, z := range f.Zones {
		if z.Kind == physics.Tunnel && tunnel < maxTunnels {
			tunnel++
			put(g, z.Vec, rune('0'+tunnel))
		}
	}
	put(g, h.Start(), markTee)
	put(g, h.Cup(), markCup)

	// ground no ball can reach is not green: blank it, as the 3D client does
	blankUnreachable(g, wall, f, h.Start(), h.Cup())

	// only your own ball: everyone's at once would bury the board
	if v := e.roundTree().Get(focus.String()); v != nil && !v.(*round).done {
		put(g, v.(*round).ball(), '@')
	}

	var sb strings.Builder
	for _, row := range g {
		sb.WriteString(string(row) + "\n")
	}
	return sb.String()
}

// drawZone marks the cells a zone holds: a cell is the zone's if its centre
// is, so a round pond is drawn round, as the physics sees it
// (physics.Zone.Contains). A polygon's row is drawn from where the row's
// centre line crosses its edges; an ellipse's as the run of cells it holds,
// found with the physics' own test at its ends, from its middle out.
func drawZone(g [][]rune, z *physics.Zone, m rune) {
	bh := len(g)
	if bh == 0 {
		return
	}
	bw := len(g[0])
	x0, x1 := boxCells(z.Min.X, z.Max.X, bw)
	y0, y1 := boxCells(z.Min.Y, z.Max.Y, bh)
	if x0 >= x1 {
		return
	}
	poly := len(z.Poly) >= 3
	var flip []bool
	if poly {
		flip = make([]bool, x1+1)
	}
	for y := y0; y < y1; y++ {
		row, py := g[y], float64(y)+0.5
		switch {
		case poly:
			// inPoly counts the crossings right of the centre, even-odd: a
			// crossing is right of every cell before the first whose centre
			// is at or past it, so a sweep from the right turns in and out
			// at each one's cell. No sort: a row costs its edges and cells.
			for x := x0; x <= x1; x++ {
				flip[x] = false
			}
			a := z.Poly[len(z.Poly)-1]
			for _, b := range z.Poly { // the edge from a to b
				if (a.Y > py) != (b.Y > py) {
					c := cellAt(a.X+(py-a.Y)*(b.X-a.X)/(b.Y-a.Y), x0, x1)
					flip[c] = !flip[c]
				}
				a = b
			}
			in := false
			for x := x1 - 1; x >= x0; x-- {
				if flip[x+1] {
					in = !in
				}
				if in != z.Outside {
					row[x] = m
				}
			}
		case z.Round:
			hx, hy := (z.Max.X-z.Min.X)/2, (z.Max.Y-z.Min.Y)/2
			dy := (py - z.Min.Y - hy) / hy
			in := func(x int) bool {
				dx := (float64(x) + 0.5 - z.Min.X - hx) / hx
				return dx*dx+dy*dy < 1
			}
			// the cells nearest the middle: if neither is in, none is
			mid := int(math.Floor(z.Min.X + hx - 0.5))
			c := -1
			for _, x := range [2]int{mid, mid + 1} {
				if x < x0 {
					x = x0
				}
				if x >= x1 {
					x = x1 - 1
				}
				if c < 0 && in(x) {
					c = x
				}
			}
			if c >= 0 {
				from := firstCell(x0, c, in)
				to := firstCell(c, x1, func(x int) bool { return !in(x) })
				fillRow(row, from, to, m)
			}
		default:
			fillRow(row, x0, x1, m)
		}
	}
}

// boxCells is the cells from int(lo) to int(hi), within 0..n, whose centre
// lies in [lo, hi): the cells the physics' box test takes.
func boxCells(lo, hi float64, n int) (int, int) {
	a, b := span(lo, hi, n)
	if a >= b {
		return a, a
	}
	a = firstCell(a, b, func(x int) bool { return float64(x)+0.5 >= lo })
	return a, firstCell(a, b, func(x int) bool { return !(float64(x)+0.5 < hi) })
}

// cellAt is the first cell x in [lo, hi) whose centre is at or past c
// (!(x+0.5 < c), as the physics compares), hi if none: ceil(c-0.5), as
// arithmetic. lo is 0 or more.
func cellAt(c float64, lo, hi int) int {
	if !(float64(lo)+0.5 < c) { // NaN too, as a search would find
		return lo
	}
	if c >= float64(hi) {
		return hi
	}
	x := int(c) // c > 0.5: its floor
	if float64(x)+0.5 < c {
		x++
	}
	if x > hi {
		x = hi
	}
	return x
}

// firstCell is the first x in [lo, hi) where ok turns true, hi if it never
// does: ok is false up to some x, and true from there.
func firstCell(lo, hi int, ok func(x int) bool) int {
	for lo < hi {
		mid := (lo + hi) / 2
		if ok(mid) {
			hi = mid
		} else {
			lo = mid + 1
		}
	}
	return lo
}

func fillRow(row []rune, from, to int, m rune) {
	for x := from; x < to; x++ {
		row[x] = m
	}
}

// span is the cells from int(lo) to int(hi), within 0..n.
func span(lo, hi float64, n int) (int, int) {
	a, b := int(lo), int(hi)
	if a < 0 {
		a = 0
	}
	if b > n {
		b = n
	}
	return a, b
}

// maxBoardWork bounds what drawing one board may cost, in thousands of gas
// as boardWork estimates it: past it, the page says so instead of drawing,
// and stays far under the 3e9 a query may use. The course's boards cost at
// most a quarter of it; the worst the format allows, five times it.
const maxBoardWork = 600000

// boardWork estimates what board costs for this field, in thousands of gas,
// from what it does (measured on 96×96 boards, the largest GG1 allows): 32 a
// board cell (the wear, the flood fill, the blanking); for each row of a
// zone's box, 5 a cell and 16 an edge of its polygon, as if every edge
// crossed the row, as a zigzag's all do; 10 a step along a wall; 20 a cell of
// a post's box.
func boardWork(f *physics.Field, h course.Hole) int {
	bw, bh := course.BoardOf(h)
	n := 32 * bw * bh
	for i := range f.Zones {
		z := &f.Zones[i]
		x0, x1 := span(z.Min.X, z.Max.X, bw)
		y0, y1 := span(z.Min.Y, z.Max.Y, bh)
		if x1 > x0 && y1 > y0 {
			n += (y1 - y0) * (5*(x1-x0) + 16*len(z.Poly))
		}
	}
	for i := range f.Walls {
		n += 10 * (int(f.Walls[i].Seg.B.Sub(f.Walls[i].Seg.A).Len()*2) + 2)
	}
	for i := range f.Posts {
		d := int(2*f.Posts[i].R) + 2
		n += 20 * d * d
	}
	return n
}

// legend names whatever this hole brought along, from the skins it declared;
// walls is the skins of the walls drawn `#`, which the key names with the
// wall. key names the board's fixed marks, only those it shows: the tee and
// cup always, the rest when there is one to see.
func key(b, walls string) string {
	// what the board shows, read once: a big board is thousands of runes
	var on [128]bool
	shot := false // '·', the one mark past ASCII
	for _, c := range b {
		if c < 128 {
			on[c] = true
		} else if c == '·' {
			shot = true
		}
	}
	s := "`*` tee · `U` cup"
	for _, k := range []struct{ marks, what string }{
		{"@", "your ball"}, {"·", "your last shot"}, {"#", "wall"},
		{":;x%", "wear (worn by past shots)"},
	} {
		shown := k.marks == "·" && shot
		for i := 0; i < len(k.marks) && k.marks[i] < 128; i++ {
			shown = shown || on[k.marks[i]]
		}
		if shown {
			s += " · `" + k.marks + "` " + k.what
			if k.marks == "#" && walls != "" {
				s += " (" + walls + ")"
			}
		}
	}
	// tunnels are numbered from 1: name the digits the board has
	digits := ""
	for c := '1'; c <= '9'; c++ {
		if on[c] {
			digits += string(c)
		}
	}
	switch len(digits) {
	case 0:
	case 1:
		s += " · `" + digits + "` a tunnel and its exit"
	default:
		s += " · `" + digits + "` tunnels, each with its exit"
	}
	return s
}

func legend(f *physics.Field) (string, string) {
	seen, s, walls := string(markWall), "", ""
	add := func(m rune, def rune, skin string) {
		if skin == "" {
			return
		}
		r := mark(m, def)
		if r == markWall {
			// the key's own wall: name its skins there, once each
			if !strings.Contains(", "+walls+", ", ", "+skin+", ") {
				if walls != "" {
					walls += ", "
				}
				walls += skin
			}
			return
		}
		if strings.ContainsRune(seen, r) {
			return
		}
		seen += string(r)
		s += ufmt.Sprintf(" · `%s` %s", string(r), skin)
	}
	for _, z := range f.Zones {
		if z.Kind == physics.Tunnel {
			continue // numbered on the board
		}
		name := cleanSkin(z.Skin)
		if name == "" || name == z.Kind.String() {
			name = z.Kind.String()
		} else {
			name += " (" + z.Kind.String() + ")"
		}
		add(z.Mark, '?', name)
	}
	for _, p := range f.Posts {
		add(p.Mark, markPost, cleanSkin(p.Skin))
	}
	for _, w := range f.Walls {
		add(w.Mark, markWall, cleanSkin(w.Skin))
	}
	return s, walls
}

// mark is what a piece shows on the text board. Marks come from the hole's
// author, and the board sits in a code block: only a printable ASCII
// character that cannot close the block or start markdown is kept.
func mark(m, def rune) rune {
	if m <= ' ' || m > '~' || strings.ContainsRune("`[]()<>*_#|\\!@oU0123456789", m) {
		return def
	}
	return m
}

// wearRune takes wear-cell coordinates.
func wearRune(wear []int, x, y int) rune {
	i := y*course.WearW + x
	if i < 0 || i >= len(wear) {
		return rune(wearRunes[0])
	}
	switch v := wear[i]; {
	case v == 0:
		return rune(wearRunes[0])
	case v <= wearLight:
		return rune(wearRunes[1])
	case v <= wearWorn:
		return rune(wearRunes[2])
	case v <= wearGroove:
		return rune(wearRunes[3])
	default:
		return rune(wearRunes[4])
	}
}

// trace draws a wall as points every half unit: put(s.A + d*t), written
// out, since a board has thousands of them.
func trace(g [][]rune, s physics.Segment, c rune) {
	bh := len(g)
	if bh == 0 {
		return
	}
	bw := len(g[0])
	d := s.B.Sub(s.A)
	steps := int(d.Len()*2) + 1
	for i := 0; i <= steps; i++ {
		k := float64(i) / float64(steps)
		x, y := int(s.A.X+d.X*k), int(s.A.Y+d.Y*k)
		if x == bw {
			x = bw - 1
		}
		if y == bh {
			y = bh - 1
		}
		if x >= 0 && x < bw && y >= 0 && y < bh {
			g[y][x] = c
		}
	}
}

// fill draws a post: the cells whose centre is within its radius, put at
// (x, y). LenCmp is Len's comparison without its software square root.
func fill(g [][]rune, c physics.Circle, r rune) {
	bh := len(g)
	if bh == 0 {
		return
	}
	bw := len(g[0])
	for y := int(c.C.Y - c.R); y <= int(c.C.Y+c.R); y++ {
		gy := y
		if gy == bh {
			gy = bh - 1
		}
		if gy < 0 || gy >= bh {
			continue
		}
		for x := int(c.C.X - c.R); x <= int(c.C.X+c.R); x++ {
			gx := x
			if gx == bw {
				gx = bw - 1
			}
			if gx >= 0 && gx < bw && (physics.Vec2{X: float64(x) + 0.5, Y: float64(y) + 0.5}).Sub(c.C).LenCmp(c.R) <= 0 {
				g[gy][gx] = r
			}
		}
	}
}

func put(g [][]rune, p physics.Vec2, c rune) {
	x, y := int(p.X), int(p.Y)
	bh := len(g)
	if bh == 0 {
		return
	}
	bw := len(g[0])
	// the far edge belongs to the last cell: a wall at x=bw is the right side
	// of column bw-1, not off the board.
	if x == bw {
		x = bw - 1
	}
	if y == bh {
		y = bh - 1
	}
	if x < 0 || x >= bw || y < 0 || y >= bh {
		return
	}
	g[y][x] = c
}

// eachRound walks the rounds of one hole in address order.
// It stops after limit rounds: a hole's history grows with every address
// that ever played it, and nothing that prints it may grow with it.
func eachRound(e *entry, limit int, fn func(player string, r *round)) {
	n := 0
	e.roundTree().Iterate("", "", func(k string, v any) bool {
		fn(k, v.(*round))
		n++
		return n >= limit
	})
}

func short(addr string) string {
	if len(addr) <= 12 {
		return addr
	}
	return addr[:8] + "…" + addr[len(addr)-4:]
}

// blankUnreachable clears the cells no ball can get to: flood-filled from the
// tee, the cup and wherever a tunnel or a hazard puts the ball, stopped by
// the walls. What stays is the shape the author drew, not a rectangle.
func blankUnreachable(g, wall [][]rune, f *physics.Field, seeds ...physics.Vec2) {
	bh := len(g)
	if bh == 0 {
		return
	}
	bw := len(g[0])
	for _, z := range f.Zones {
		if z.Kind == physics.Tunnel || z.Kind == physics.Hazard {
			seeds = append(seeds, z.Vec)
		}
	}
	// a run of a row at a time, with no closure: a board has thousands of
	// cells
	seen := make([][]bool, bh)
	for y := range seen {
		seen[y] = make([]bool, bw)
	}
	var stack []int // y*bw + x: a cell whose run is yet to fill
	for _, p := range seeds {
		if x, y := int(p.X), int(p.Y); x >= 0 && y >= 0 && x < bw && y < bh {
			stack = append(stack, y*bw+x)
		}
	}
	for len(stack) > 0 {
		c := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		x, y := c%bw, c/bw
		s, w := seen[y], wall[y]
		if s[x] || w[x] != 0 {
			continue
		}
		l, r := x, x+1
		for l > 0 && !s[l-1] && w[l-1] == 0 {
			l--
		}
		for r < bw && !s[r] && w[r] == 0 {
			r++
		}
		for i := l; i < r; i++ {
			s[i] = true
		}
		// the rows above and below: a cell for each open run under this one
		for ny := y - 1; ny <= y+1; ny += 2 {
			if ny < 0 || ny >= bh {
				continue
			}
			ns, nw := seen[ny], wall[ny]
			open := false
			for i := l; i < r; i++ {
				o := !ns[i] && nw[i] == 0
				if o && !open {
					stack = append(stack, ny*bw+i)
				}
				open = o
			}
		}
	}
	for y := 0; y < bh; y++ {
		for x := 0; x < bw; x++ {
			if !seen[y][x] && wall[y][x] == 0 {
				g[y][x] = ' '
			}
		}
	}
}
