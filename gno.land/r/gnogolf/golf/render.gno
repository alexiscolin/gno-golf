package golf

import (
	"encoding/hex"
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
// Paths: "" the hub; "<hole>" a hole's page, "<hole>/<address>" the same
// with that player's ball, "<hole>/data" a data version's provenance and
// data. <hole> is a version's id or an alias.
func Render(path string) string {
	if path == "" {
		return renderHub()
	}
	if e := lookup(path); e != nil {
		return renderHole(e, e.hole(), "")
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
	return "# No such hole\n\n> [!WARNING]\n> `" + cleanName(path) + "` is not a hole here. " + md("See every hole", hub) + ".\n"
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

// playURL is the 3D client; a hole's page links straight to it.
const playURL = "https://gnogolf.netlify.app/"

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
	sb.WriteString("# Gnogolf — mini-golf on-chain\n\nThe course is data its owner published, anyone can add holes of their own, and the chain computes every shot. " +
		"Play here one shot at a time, or " + md("in 3D", playURL) + ", and record a whole round in one transaction.\n\n" +
		"_To play here: pick a hole, send a Launch with an angle and a power, then add `/<your address>` to the hole's URL to see your ball._\n\n")
	var course, archived, others []*entry
	for _, e := range listed() {
		switch {
		case e.official && e.next == "":
			course = append(course, e)
		case e.official:
			archived = append(archived, e)
		default:
			others = append(others, e)
		}
	}
	if len(course)+len(archived)+len(others) == 0 {
		sb.WriteString("_No hole yet._\n")
		sb.WriteString(noAdmin())
		return sb.String()
	}

	// one card per cup, above their tables: nothing here calls a hole
	type cup struct {
		world      string
		holes, par int
		top        *entry
	}
	var cups []*cup
	for _, e := range course {
		if len(cups) == 0 || cups[len(cups)-1].world != e.world {
			cups = append(cups, &cup{world: e.world})
		}
		c := cups[len(cups)-1]
		c.holes++
		c.par += e.par
		if e.plays > 0 && (c.top == nil || e.plays > c.top.plays) {
			c.top = e
		}
	}
	if len(cups) > 0 {
		sb.WriteString("<gno-columns>\n")
		for i, c := range cups {
			if i > 0 {
				sb.WriteString("<gno-columns-sep />\n")
			}
			sb.WriteString("**" + cupName(c.world) + "**\n\n" + strconv.Itoa(c.holes) + " holes · par " + strconv.Itoa(c.par) + "\n")
			if c.top != nil {
				sb.WriteString("\nmost played: " + c.top.name + "\n")
			}
		}
		sb.WriteString("</gno-columns>\n\n")
	}

	world, n := "", 0
	for _, e := range course {
		// a table per cup, numbered from 1 in each
		if e.world != world {
			if world != "" {
				sb.WriteString("\n") // a table ends before the next heading
			}
			world, n = e.world, 0
			sb.WriteString("## " + cupName(world) + "\n\n| # | hole | par | best | shots played | data |\n|---|---|---|---|---|---|\n")
		}
		n++
		sb.WriteString("| " + strconv.Itoa(n) + " | " + md(e.name, hub+":"+e.id) + " | " + strconv.Itoa(e.par) + " | " +
			bestCell(e) + " | " + strconv.Itoa(e.plays) + " | " + source(e) + " |\n")
	}
	if len(archived) > 0 {
		sb.WriteString("\n## Archived course holes\n\nA newer version took each one's place in its cup. They can still be played, and keep their records, but no longer count in the course-wide ranking.\n\n" +
			"| hole | version | par | best | shots played | now |\n|---|---|---|---|---|---|\n")
		for _, e := range archived {
			sb.WriteString("| " + md(e.name, hub+":"+e.id) + " | " + e.id + " | " + strconv.Itoa(e.par) + " | " + bestCell(e) + " | " +
				strconv.Itoa(e.plays) + " | " + md(e.next, hub+":"+e.next) + " |\n")
		}
	}
	if len(others) > 0 {
		sb.WriteString("\n## Community holes\n\nAnyone can publish a hole. These are not part of the course: they have no cup and do not count in its ranking.\n\n" +
			"| hole | par | best | shots played | code |\n|---|---|---|---|---|\n")
		for _, e := range others {
			sb.WriteString("| " + md(e.name, hub+":"+e.id) + " | " + strconv.Itoa(e.par) + " | " + bestCell(e) + " | " +
				strconv.Itoa(e.plays) + " | " + source(e) + " |\n")
		}
	}
	sb.WriteString("\n## Leaderboard\n\nEach named player's best finish on each current hole of the course, added up: most holes first, then fewest strokes. " +
		"Assisted and pro rounds (the aim preview cut short, on the player's word) are ranked apart.\n\n")
	for m := 0; m < modes; m++ {
		sb.WriteString("### " + [modes]string{"Assisted", "Pro"}[m] + "\n\n")
		rows, i := "", 0
		eachRanked(m, func(r *row) {
			i++
			rows += "| " + strconv.Itoa(i) + " | " + who(r.player) + " | " + strconv.Itoa(r.holes) + " | " + strconv.Itoa(r.strokes) + " |\n"
		})
		if rows == "" {
			sb.WriteString("_Nobody has finished a hole of the course yet._\n\n")
			continue
		}
		sb.WriteString("| rank | player | holes | strokes |\n|---|---|---|---|\n" + rows + "\n")
	}
	sb.WriteString(noAdmin())
	return sb.String()
}

// bestCell is a hole's records, assisted then pro, for a table cell.
func bestCell(e *entry) string {
	best := "—"
	if e.best[assisted] > 0 {
		best = ufmt.Sprintf("%d strokes, %s", e.best[assisted], who(e.bestBy[assisted].String()))
	}
	if e.best[pro] > 0 {
		best += ufmt.Sprintf(" · pro %d, %s", e.best[pro], who(e.bestBy[pro].String()))
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
	return "\n---\n\n**Who can change what.** Anyone can play (Launch, PlayRound, PlayRoundAt, PlayRoundPro), Reset their own round, " +
		"publish holes of their own (PublishMine) and settle the ranking sooner (Drain). Nobody can edit or delete a round, a record, a best, a standing or a published version, " +
		"and nobody can pause or upgrade this realm. Check it yourself: " + md("the source", hub+"$source") + ".\n\n" +
		"One party holds a real power: the course's owner, now " + holder + ". The owner publishes the course holes and their new versions (Publish). " +
		"A new version takes its slot: the old one is archived, still playable, its records kept, but its bests leave the course-wide ranking, which the new version starts afresh. " +
		"So the owner shapes the course, and through it the ranking, and a stolen owner key could archive every slot, for good. " +
		"A version identical to the current one is refused, but a replacement can still be unplayable: a hole can be replaced, never taken down. " +
		"When a version is published picks its id, and its id seeds its weather. " +
		"The owner can also let one realm under `" + strings.TrimPrefix(officialPrefix, "gno.land/") + "` register a hole (Expect), which is never a course hole; " +
		"and whoever holds that namespace can deploy lookalike realms under it. " +
		"The owner cannot edit or remove a version, touch a community hole, the weather, the physics or this code, " +
		"and can only hand the role on (Transfer, then Accept) or give it up for good (Renounce).\n"
}

// source links a hole to what it is made of: a realm hole to its code on
// gnoweb, a data version to its data page. A player can read the physics of
// a hole before trusting it with a round — which is the whole difference
// with a server, where you trust the operator's simulation.
func source(e *entry) string {
	if e.h == nil {
		return md("data", hub+":"+e.id+"/data")
	}
	return md(e.id, strings.TrimPrefix(e.id, "gno.land")+"$source")
}

func md(label, href string) string { return "[" + label + "](" + href + ")" }

// flatRolls is what the page says a shot rolls on flat grass, from a tee
// shot's Kick and the usual friction.
const flatRolls = "On flat grass a power of 10 rolls about 40, a 5 about 15."

func renderHole(e *entry, h course.Hole, focus address) string {
	f := h.Field()
	var mine *round // the focused player's round, looked up once
	if v := e.rounds.Get(focus.String()); v != nil {
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
	s := ufmt.Sprintf("# %s\n\n**Par %d** · %s · %s\n\n", e.name, e.par, cupName(e.world), md("Play in 3D", playLink(e)))
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
	b := board(e, h, f, focus)
	s += "```\n" + b + "```\n\n"
	s += key(b) + legend(f) + "\n\n"

	s += "## Play\n\n"
	// the one number a text player cannot read off the board: where the cup is
	from, who := h.Start(), "the tee"
	if mine != nil && !mine.done && mine.strokes > 0 {
		from, who = mine.ball(), "your ball"
	}
	a, d := aim(from, h.Cup())
	s += ufmt.Sprintf("From %s the cup is **%.0f°** away, **%.1f** units in a straight line (0° = right, 90° = down). %s\n\n", who, a, d, flatRolls)
	if focus == "" {
		s += "_After a shot, add `/<your address>` to this page's URL to see your ball and aim from it._\n\n"
	}
	s += "_Rounds played here have no aim preview, so they go on the **Pro** board._\n\n"
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

	s += "## Rounds\n\n| player | strokes | |\n|---|---|---|\n"
	empty := true
	eachRound(e, roundsShown, func(player string, r *round) {
		empty = false
		state := "playing"
		if r.done {
			state = "**holed**"
		}
		s += ufmt.Sprintf("| [%s](%s:%s/%s) | %d | %s |\n",
			short(player), hub, e.id, player, r.strokes, state)
	})
	if empty {
		s += "| _nobody yet_ | | |\n"
	}
	return s + "\n_This hole is " + source(e) + " — read it before you trust it with a round._\n"
}

// renderData is a data version's page: where it came from, its versions,
// and its data, which is all the hole there is.
func renderData(e *entry) string {
	if e.h != nil {
		return "# " + e.name + "\n\nThis hole is a realm's code, not data: " + source(e) + ".\n"
	}
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

	// the focused player's last flight first, on the grass: pieces drawn after
	// it stay visible (a mole in a gap was hidden under the dots)
	if v := e.rounds.Get(focus.String()); v != nil {
		for _, p := range lastShot(e, h, v.(*round)).Path {
			put(g, p, '·')
		}
	}

	tunnel := 0
	for _, z := range f.Zones {
		m := mark(z.Mark, '?')
		if z.Kind == physics.Tunnel && tunnel < maxTunnels {
			// a tunnel's mouth and its exit share a digit: you can see where it leads
			tunnel++
			m = rune('0' + tunnel)
		}
		for y := int(z.Min.Y); y < int(z.Max.Y) && y < bh; y++ {
			for x := int(z.Min.X); x < int(z.Max.X) && x < bw; x++ {
				// the cell is the zone's if its centre is: a round pond is
				// drawn round, as the physics sees it
				if x >= 0 && y >= 0 && z.Contains(physics.Vec2{X: float64(x) + 0.5, Y: float64(y) + 0.5}) {
					g[y][x] = m
				}
			}
		}
	}
	for _, w := range f.Walls {
		trace(g, w.Seg, mark(w.Mark, markWall))
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
	blankUnreachable(g, f, h.Start(), h.Cup())

	// only your own ball: everyone's at once would bury the board
	if v := e.rounds.Get(focus.String()); v != nil && !v.(*round).done {
		put(g, v.(*round).ball(), '@')
	}

	s := ""
	for _, row := range g {
		s += string(row) + "\n"
	}
	return s
}

// legend names whatever this hole brought along, from the skins it declared.
// key names the board's fixed marks, only those it shows: the tee and cup
// always, the rest when there is one to see.
func key(b string) string {
	s := "`*` tee · `U` cup"
	for _, k := range []struct{ marks, what string }{
		{"@", "your ball"}, {"·", "your last shot"}, {"#", "wall"},
		{":;x%", "wear (worn by past shots)"},
	} {
		if strings.ContainsAny(b, k.marks) {
			s += " · `" + k.marks + "` " + k.what
		}
	}
	// tunnels are numbered from 1: name the digits the board has
	digits := ""
	for c := '1'; c <= '9'; c++ {
		if strings.ContainsRune(b, c) {
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

func legend(f *physics.Field) string {
	seen, s := "", ""
	add := func(m rune, def rune, skin string) {
		if skin == "" {
			return
		}
		r := mark(m, def)
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
	return s
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

func trace(g [][]rune, s physics.Segment, c rune) {
	d := s.B.Sub(s.A)
	steps := int(d.Len()*2) + 1
	for i := 0; i <= steps; i++ {
		put(g, s.A.Add(d.Scale(float64(i)/float64(steps))), c)
	}
}

func fill(g [][]rune, c physics.Circle, r rune) {
	for y := int(c.C.Y - c.R); y <= int(c.C.Y+c.R); y++ {
		for x := int(c.C.X - c.R); x <= int(c.C.X+c.R); x++ {
			p := physics.Vec2{X: float64(x) + 0.5, Y: float64(y) + 0.5}
			if p.Sub(c.C).Len() <= c.R {
				put(g, physics.Vec2{X: float64(x), Y: float64(y)}, r)
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
	e.rounds.Iterate("", "", func(k string, v any) bool {
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
func blankUnreachable(g [][]rune, f *physics.Field, seeds ...physics.Vec2) {
	bh := len(g)
	if bh == 0 {
		return
	}
	bw := len(g[0])
	wall := make([][]rune, bh)
	for y := range wall {
		wall[y] = make([]rune, bw)
	}
	for _, w := range f.Walls {
		trace(wall, w.Seg, '#')
	}
	for _, z := range f.Zones {
		if z.Kind == physics.Tunnel || z.Kind == physics.Hazard {
			seeds = append(seeds, z.Vec)
		}
	}
	seen := make([][]bool, bh)
	for y := range seen {
		seen[y] = make([]bool, bw)
	}
	stack := [][2]int{}
	for _, p := range seeds {
		x, y := int(p.X), int(p.Y)
		if x >= 0 && y >= 0 && x < bw && y < bh && wall[y][x] == 0 && !seen[y][x] {
			seen[y][x] = true
			stack = append(stack, [2]int{x, y})
		}
	}
	for len(stack) > 0 {
		c := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		for _, d := range [4][2]int{{1, 0}, {-1, 0}, {0, 1}, {0, -1}} {
			x, y := c[0]+d[0], c[1]+d[1]
			if x < 0 || y < 0 || x >= bw || y >= bh || seen[y][x] || wall[y][x] != 0 {
				continue
			}
			seen[y][x] = true
			stack = append(stack, [2]int{x, y})
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
