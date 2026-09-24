// Registers the island holes with the golf hub, in one transaction. Run it
// once after a fresh chain (gnodev without its old state): a hole cannot
// register from init(), there is no `cur` there.
package main

import (
	"gno.land/r/gnogolf/island1"
	"gno.land/r/gnogolf/island2"
	"gno.land/r/gnogolf/island3"
	"gno.land/r/gnogolf/island4"
	"gno.land/r/gnogolf/island5"
	"gno.land/r/gnogolf/island6"
	"gno.land/r/gnogolf/island7"
	"gno.land/r/gnogolf/island8"
	"gno.land/r/gnogolf/island9"
	"gno.land/r/gnogolf/island10"
	"gno.land/r/gnogolf/island11"
	"gno.land/r/gnogolf/island12"
	"gno.land/r/gnogolf/island13"
	"gno.land/r/gnogolf/island14"
	"gno.land/r/gnogolf/island15"
	"gno.land/r/gnogolf/island16"
	"gno.land/r/gnogolf/island17"
	"gno.land/r/gnogolf/island18"
)

func main(cur realm) {
	island1.Register(cross(cur))
	island2.Register(cross(cur))
	island3.Register(cross(cur))
	island4.Register(cross(cur))
	island5.Register(cross(cur))
	island6.Register(cross(cur))
	island7.Register(cross(cur))
	island8.Register(cross(cur))
	island9.Register(cross(cur))
	island10.Register(cross(cur))
	island11.Register(cross(cur))
	island12.Register(cross(cur))
	island13.Register(cross(cur))
	island14.Register(cross(cur))
	island15.Register(cross(cur))
	island16.Register(cross(cur))
	island17.Register(cross(cur))
	island18.Register(cross(cur))
}
