// A static export: the game is a client that talks to a gno node over HTTP, so
// there is no server side to host. `next build` writes out/ — drop it on any
// static host, or on IPFS.
export default {
  output: "export",
  trailingSlash: true, // a hole's page is out/h/garden-3/index.html: /h/garden-3/ on any static host
  images: { unoptimized: true },
  devIndicators: false, // the dev badge sits on the HUD's bottom-left button
  // the commit a build is of (Netlify's COMMIT_REF), said with every analytics event
  env: { NEXT_PUBLIC_BUILD: (process.env.COMMIT_REF || "").slice(0, 7) },
};
