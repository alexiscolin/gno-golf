// PKGPATH: gno.land/r/test/builderpublishwarm
package builderpublishwarm

import (
	"gno.land/r/gnogolf/golf"
)

// The Builder's publish numbers (web/lib/builder/publish.ts: the storage
// deposit and the gas a PublishMine asks for). Each z_builder_publish_*
// filetest publishes the same warm-up hole first, paying there for the
// indexes golf opens at a first publish; its Storage and Gas less
// z_builder_publish_warm_filetest's are its own publish's:
// none (the warm-up alone: the data, its entry, the first leaf of each index,
// its author's row in the community's).
// The data are course.Encode's own, written out: a transaction is handed
// the hex, so the Gas is PublishMine's work alone. The warm-up is
// a plain 32×16 lane, z_storage_publish_filetest's at par 3, titled "Warm".

const (
	warm = "47473120001000030e000667617264656e0000000000000000045761726d000000000000004000000000000020400000000000003c400000000000002040333333333333f33f00000000000000009a9999999999e93fcdccccccccccec3f000000000000e03f01000004000400000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000404000000000000000000000000000004040000000000080404000000000008040400000000000004040000000000000000000000000000040400000000000003040000000000000304000000000000031400000000000003140000000000000404000000000000030400000000000000000000000000000304000000000000040400000000000804040000000000080404000000000000000000000000000003040000000000000000000000000000000000000000000003040000000000000314000000000000031400000000000"
)

func main(cur realm) {
	println(golf.PublishMine(cross(cur), "warm", warm, ""))
}

// Output:
// g1wkxql05r6z4c0da7swcynzfpga907nl4r7k7k7/warm/v1

// Storage:
// gno.land/r/gnogolf/golf: 22680
// gno.land/r/test/builderpublishwarm: 0

// Gas:
// 17160838
