// A static export: the game is a client that talks to a gno node over HTTP, so
// there is no server side to host. `next build` writes out/ — drop it on any
// static host, or on IPFS.
export default {
  output: "export",
  images: { unoptimized: true },
  devIndicators: false, // the dev badge sits on the HUD's bottom-left button
};
