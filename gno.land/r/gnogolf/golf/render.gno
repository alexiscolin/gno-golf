package golf

import (
	"strings"
	"time"

	"gno.land/p/gnogolf/course"
	"gno.land/p/gnogolf/physics"
	"gno.land/p/nt/ufmt/v0"
)

// wearRunes escalate with traffic: pristine grass, then a groove.
const wearRunes = ".:;x%"

const (
	markWall = '#'
	markPost = '0'
	markCup  = 'U' // not O: in gnoweb's font O and the post's 0 look alike
	markTee  = '*'
)

// Render is the game as text: gnoweb draws the board and submits the shot. The
// 3D client reads the same State and plays the same physics.
func Render(path string) string {
	if path == "" {
		return renderHub()
	}
	// "<pkgpath>" or "<pkgpath>/<player>": the id has slashes of its own, so
	// the focus is whatever trails it, if that is an address.
	hole, focus := path, address("")
	if i := strings.LastIndex(path, "/"); i >= 0 && address(path[i+1:]).IsValid() {
		hole, focus = path[:i], address(path[i+1:])
	}
	v := holes.Get(hole)
	if v == nil {
		return "# No such hole\n\n> [!WARNING]\n> `" + cleanName(hole) + "` is not registered. " + md("See every hole", "/r/gnogolf/golf") + ".\n"
	}
	return renderHole(v.(*entry), focus)
}

// playLink is the 3D client on this very hole, as a short link a player can
// share: its cup and its place in it (the client maps them back to the realm).
func playLink(e *entry) string {
	return ufmt.Sprintf("%s?cup=%s&hole=%d", playURL, e.world, int(e.order))
}

// playURL is the 3D client; a hole's page links straight to it.
const playURL = "https://gnogolf.netlify.app/"

// cupName is how a world is called on the page.
func cupName(w string) string {
	switch w {
	case "garden":
		return "Garden Cup"
	case "island":
		return "Island Cup"
	case "town":
		return "Mushroom Town"
	case "mountain":
		return "Mountain Cup"
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
	sb.WriteString("# Gnogolf — mini-golf on-chain\n\nEvery hole is a realm someone deployed, and the chain computes every shot. " +
		"Play here one shot at a time, or " + md("in 3D", playURL) + ", and record a whole round in one transaction.\n\n" +
		"_To play here: pick a hole, send a Launch with an angle and a power, then add `/<your address>` to the hole's URL to see your ball._\n\n")
	if holes.Size() == 0 {
		sb.WriteString("_No hole registered yet._\n")
		return sb.String()
	}
	var course, community []*entry
	for _, e := range listed() {
		if e.official {
			course = append(course, e)
		} else {
			community = append(community, e)
		}
	}

	// one card per cup, above their tables: nothing here calls a hole. A cup
	// counts its current holes; an archived one is listed, not counted.
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
		if e.next != "" {
			continue
		}
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
			sb.WriteString(ufmt.Sprintf("**%s**\n\n%d holes · par %d\n", cupName(c.world), c.holes, c.par))
			if c.top != nil {
				sb.WriteString("\nmost played: " + c.top.name + "\n")
			}
		}
		sb.WriteString("</gno-columns>\n\n")
	}

	world, n := "", 0
	for _, e := range course {
		// a table per cup, numbered from 1 in each: its current holes only
		if e.world != world {
			if world != "" {
				sb.WriteString("\n") // a table ends before the next heading
			}
			world, n = e.world, 0
			sb.WriteString("## " + cupName(world) + "\n\n| # | hole | par | best | shots played | code |\n|---|---|---|---|---|---|\n")
		}
		no := "archived"
		if e.next == "" {
			n++
			no = ufmt.Sprintf("%d", n)
		}
		sb.WriteString(ufmt.Sprintf("| %s | [%s](/r/gnogolf/golf:%s) | %d | %s | %d | %s |\n",
			no, e.name, e.id, e.par, bestCell(e), e.plays, source(e.id)))
	}
	if len(community) > 0 {
		if len(course) > 0 {
			sb.WriteString("\n")
		}
		sb.WriteString("## Community holes\n\nAnyone can register a hole. These are not part of the course: they have no cup and do not count in its ranking.\n\n" +
			"| hole | par | best | shots played | code |\n|---|---|---|---|---|\n")
		for _, e := range community {
			sb.WriteString(ufmt.Sprintf("| [%s](/r/gnogolf/golf:%s) | %d | %s | %d | %s |\n",
				e.name, e.id, e.par, bestCell(e), e.plays, source(e.id)))
		}
	}
	sb.WriteString("\n## Leaderboard\n\nEach named player's best finish on each current hole of the course, added up: most holes first, then fewest strokes. " +
		"Assisted and pro rounds (the aim preview cut short, on the player's word) are ranked apart.\n\n")
	for m := 0; m < modes; m++ {
		sb.WriteString("### " + [modes]string{"Assisted", "Pro"}[m] + "\n\n")
		rows := ""
		i := 0
		ranks[m].Iterate("", "", func(_ string, v any) bool {
			p := v.(string)
			if !named(p) {
				return false
			}
			r := totals[m].Get(p).(*row)
			i++
			rows += ufmt.Sprintf("| %d | %s | %d | %d |\n", i, who(r.player), r.holes, r.strokes)
			return i >= topSize
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
func weatherNote(e *entry) string {
	f := weatherOf(e, Period())
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
	return "\n---\n\nThis realm has no administrator: no owner, no pause, no upgrade, and no way to delete a hole or a record. " +
		"Every write (Register, Launch, PlayRound, PlayRoundAt, PlayRoundPro, Reset) is open to anyone. " +
		"Check it yourself: " + md("the source", "/r/gnogolf/golf$source") + ".\n\n" +
		"One party does hold a real power: whoever may publish under `r/gnogolf/`, which the chain's namespace rule decides, not this realm. " +
		"A hole published there can take a course hole's place in its cup: the old one is archived, never erased, " +
		"and it stops counting in the course-wide ranking. So that party can reshape the course, and with it the ranking, " +
		"and can add course holes. It cannot touch a round, a record or a community hole.\n\n" +
		"The other half of having no administrator: a bad community hole cannot be taken down either.\n"
}

// source links a realm path to its code on gnoweb. A player can read the
// physics of a hole before trusting it with a round — which is the whole
// difference with a server, where you trust the operator's simulation.
func source(pkgPath string) string {
	return md(pkgPath, strings.TrimPrefix(pkgPath, "gno.land")+"$source")
}

func md(label, href string) string { return "[" + label + "](" + href + ")" }

func renderHole(e *entry, focus address) string {
	f := e.h.Field()
	var mine *round // the focused player's round, looked up once
	if v := e.rounds.Get(focus.String()); v != nil {
		mine = v.(*round)
	}
	stroke := 0
	if mine != nil {
		stroke = mine.strokes
	}
	// a timed hole is drawn as it stands for the focused player's next stroke
	if t, ok := e.h.(course.Timed); ok {
		ws, ps := t.Extras(stroke)
		f = course.WithZones(course.WithExtras(f, ws, ps), extraZones(e.h, stroke))
	}
	s := ufmt.Sprintf("# %s\n\n**Par %d** · %s · %s\n\n", e.name, e.par, cupName(e.world), md("Play in 3D", playLink(e)))
	if e.next != "" {
		next := e.next
		if v := holes.Get(e.next); v != nil {
			next = v.(*entry).name
		}
		s += "> [!NOTE]\n> Archived: " + md(next, "/r/gnogolf/golf:"+e.next) +
			" took this hole's place in its cup. It can still be played, and your best here still shows on this page, but it no longer counts in the course-wide ranking.\n\n"
	}
	s += weatherNote(e)
	if isTimed(e.h) {
		if focus == "" {
			s += "_This hole changes with every stroke. It is drawn for a first shot; add `/<your address>` to the URL to see it for your next one._\n\n"
		} else {
			s += ufmt.Sprintf("_This hole changes with every stroke. Drawn for %s's stroke %d._\n\n", short(focus.String()), stroke+1)
		}
	}
	b := board(e, f, focus)
	s += "```\n" + b + "```\n\n"
	s += key(b) + legend(f) + "\n\n"

	s += "## Play\n\n"
	// the one number a text player cannot read off the board: where the cup is
	from, who := e.h.Start(), "the tee"
	if mine != nil && !mine.done && mine.strokes > 0 {
		from, who = mine.ball(), "your ball"
	}
	a, d := aim(from, e.h.Cup())
	s += ufmt.Sprintf("From %s the cup is **%.0f°** away, **%.1f** units in a straight line (0° = right, 90° = down). On flat grass a power of 10 rolls about 40, a 5 about 15.\n\n", who, a, d)
	if focus == "" {
		s += "_After a shot, add `/<your address>` to this page's URL to see your ball and aim from it._\n\n"
	}
	s += "_Rounds played here have no aim preview, so they go on the **Pro** board._\n\n"
	s += "<gno-form exec=\"Launch\">\n"
	s += ufmt.Sprintf("<gno-input name=\"hole\" value=\"%s\" readonly=\"true\" description=\"this hole\" required=\"true\" />\n", e.id)
	s += "<gno-input name=\"angle\" placeholder=\"angle in degrees (0 = right, 90 = down), decimals allowed\" required=\"true\" />\n"
	s += "<gno-input name=\"power\" placeholder=\"power, above 0 and up to 10\" required=\"true\" />\n"
	s += "</gno-form>\n\n"
	s += ufmt.Sprintf("_After your shot, see your ball at `/r/gnogolf/golf:%s/<your address>`._\n\n", e.id)
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
		s += ufmt.Sprintf("| [%s](/r/gnogolf/golf:%s/%s) | %d | %s |\n",
			short(player), e.id, player, r.strokes, state)
	})
	if empty {
		s += "| _nobody yet_ | | |\n"
	}
	return s + ufmt.Sprintf("\n_This hole is %s — read its physics before you trust it with a round._\n",
		source(e.id))
}

// board rasterises the hole: wear, then zones, posts, walls, cup, balls.
func board(e *entry, f *physics.Field, focus address) string {
	bw, bh := course.BoardOf(e.h)
	g := make([][]rune, bh)
	wear := e.h.Wear()
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
		for _, p := range lastShot(e, v.(*round)).Path {
			put(g, p, '·')
		}
	}

	tunnel := 0
	for _, z := range f.Zones {
		m := mark(z.Mark, '?')
		if z.Kind == physics.Tunnel && tunnel < 9 {
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
		if z.Kind == physics.Tunnel && tunnel < 9 {
			tunnel++
			put(g, z.Vec, rune('0'+tunnel))
		}
	}
	put(g, e.h.Start(), markTee)
	put(g, e.h.Cup(), markCup)

	// ground no ball can reach is not green: blank it, as the 3D client does
	blankUnreachable(g, f, e.h.Start(), e.h.Cup())

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
	case v <= 2:
		return rune(wearRunes[1])
	case v <= 6:
		return rune(wearRunes[2])
	case v <= 14:
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

// worldRank is a world's place in the order a player goes through them; any
// other comes after.
func worldRank(w string) int {
	switch w {
	case "garden":
		return 0
	case "island":
		return 1
	case "town":
		return 2
	case "mountain":
		return 3
	}
	return 4
}

// before is the list order: the course's own holes first, then world by
// world, then by order within one.
func before(a, b *entry) bool {
	if a.official != b.official {
		return a.official
	}
	wa, wb := worldRank(a.world), worldRank(b.world)
	if wa != wb {
		return wa < wb
	}
	if a.world != b.world {
		return a.world < b.world
	}
	return a.order < b.order
}

// listed is the holes in course order, as many as a list shows. A list anyone
// can grow is shown in part, never unreadable.
func listed() []*entry {
	// the course's own holes first, then anyone's, up to the cap: holes
	// registered elsewhere can never push the official course off the list
	list := make([]*entry, 0, maxListed)
	add := func(_ string, v any) bool {
		list = append(list, v.(*entry))
		return len(list) >= maxListed
	}
	holes.Iterate(officialPrefix, officialEnd, add)
	if len(list) < maxListed {
		holes.Iterate("", officialPrefix, add)
	}
	if len(list) < maxListed {
		holes.Iterate(officialEnd, "", add)
	}
	// Insertion sort:, fine for maxListed (120) holes
	for i := 1; i < len(list); i++ {
		for j := i; j > 0 && before(list[j], list[j-1]); j-- {
			list[j], list[j-1] = list[j-1], list[j]
		}
	}
	return list
}

// holeNo is the number a hole's path ends with (hole7 → 7), or a large one
// for a path that has none, so numbered holes come first, in order.
func holeNo(id string) int {
	n, mul := 0, 1
	for i := len(id) - 1; i >= 0 && id[i] >= '0' && id[i] <= '9'; i-- {
		n += int(id[i]-'0') * mul
		mul *= 10
	}
	if mul == 1 {
		return 1 << 20
	}
	return n
}
