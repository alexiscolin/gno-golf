// A static export: the game is a client that talks to a gno node over HTTP, so
// there is no server side to host. `next build` writes out/ — drop it on any
// static host, or on IPFS.

// Netlify's production deploy plays the public chain its environment names:
// one missing or malformed fails the build, rather than a site that plays a
// local chain nobody has (lib/chain.ts, lib/network.ts; netlify.toml lists them)
if (process.env.CONTEXT === "production") {
  const e = process.env, https = (v) => /^https:\/\/[^/\s]+/.test(v || "");
  const bad = [
    !/^gno\.land\/r\/[a-z0-9_-]+(\/[a-z0-9_]+){1,2}$/.test(e.NEXT_PUBLIC_REALM || "") && "NEXT_PUBLIC_REALM (gno.land/r/<namespace>/[<game>/]<realm>)",
    !https(e.NEXT_PUBLIC_RPC) && "NEXT_PUBLIC_RPC (https://…)",
    !https(e.NEXT_PUBLIC_WEB) && "NEXT_PUBLIC_WEB (https://…)",
    !["testnet", "mainnet"].includes(e.NEXT_PUBLIC_NETWORK || "") && "NEXT_PUBLIC_NETWORK (testnet or mainnet)",
  ].filter(Boolean);
  if (bad.length) throw new Error(`a production build needs ${bad.join(", ")}: see netlify.toml`);
}

export default {
  output: "export",
  trailingSlash: true, // a hole's page is out/h/garden-3/index.html: /h/garden-3/ on any static host
  images: { unoptimized: true },
  devIndicators: false, // the dev badge sits on the HUD's bottom-left button
  // the commit a build is of (Netlify's COMMIT_REF), said with every analytics event
  env: { NEXT_PUBLIC_BUILD: (process.env.COMMIT_REF || "").slice(0, 7) },
};
