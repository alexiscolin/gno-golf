// Registers the mountain holes with the golf hub, in one transaction. Run it
// once after a fresh chain (gnodev without its old state): a hole cannot
// register from init(), there is no `cur` there.
package main

import (
	"gno.land/r/gnogolf/mountain1"
	"gno.land/r/gnogolf/mountain2"
	"gno.land/r/gnogolf/mountain3"
	"gno.land/r/gnogolf/mountain4"
	"gno.land/r/gnogolf/mountain5"
	"gno.land/r/gnogolf/mountain6"
	"gno.land/r/gnogolf/mountain7"
	"gno.land/r/gnogolf/mountain8"
	"gno.land/r/gnogolf/mountain9"
	"gno.land/r/gnogolf/mountain10"
	"gno.land/r/gnogolf/mountain11"
	"gno.land/r/gnogolf/mountain12"
	"gno.land/r/gnogolf/mountain13"
	"gno.land/r/gnogolf/mountain14"
	"gno.land/r/gnogolf/mountain15"
	"gno.land/r/gnogolf/mountain16"
	"gno.land/r/gnogolf/mountain17"
	"gno.land/r/gnogolf/mountain18"
)

func main(cur realm) {
	mountain1.Register(cross(cur))
	mountain2.Register(cross(cur))
	mountain3.Register(cross(cur))
	mountain4.Register(cross(cur))
	mountain5.Register(cross(cur))
	mountain6.Register(cross(cur))
	mountain7.Register(cross(cur))
	mountain8.Register(cross(cur))
	mountain9.Register(cross(cur))
	mountain10.Register(cross(cur))
	mountain11.Register(cross(cur))
	mountain12.Register(cross(cur))
	mountain13.Register(cross(cur))
	mountain14.Register(cross(cur))
	mountain15.Register(cross(cur))
	mountain16.Register(cross(cur))
	mountain17.Register(cross(cur))
	mountain18.Register(cross(cur))
}
