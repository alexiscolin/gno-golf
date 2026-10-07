import { PHASE_DEVELOPMENT_SERVER } from "next/constants.js";

// A static export: the game is a client that talks to a gno node over HTTP, so
// there is no server side to host. `next build` writes out/ — drop it on any
// static host, or on IPFS.

// Netlify's production deploy plays the public chain its environment names:
// one missing or malformed fails the build, rather than a site that plays a
// local chain nobody has (lib/chain.ts, lib/network.ts; netlify.toml lists them)
if (process.env.CONTEXT === "production") {
  const e = process.env, https = (v) => /^https:\/\/[^/\s]+/.test(v || "");
  const bad = [
    !/^gno\.land\/r\/[a-z0-9_-]+(\/[a-z0-9_]+){1,2}(\/v[0-9]+)?$/.test(e.NEXT_PUBLIC_REALM || "") && "NEXT_PUBLIC_REALM (gno.land/r/<namespace>/[<game>/]<realm>[/v<n>])",
    !https(e.NEXT_PUBLIC_RPC) && "NEXT_PUBLIC_RPC (https://…)",
    !https(e.NEXT_PUBLIC_WEB) && "NEXT_PUBLIC_WEB (https://…)",
    !["testnet", "mainnet"].includes(e.NEXT_PUBLIC_NETWORK || "") && "NEXT_PUBLIC_NETWORK (testnet or mainnet)",
    // the gnome shop sells: who sells, and the pages the order links, before any sale (lib/gnomes/legal.ts)
    ...(e.NEXT_PUBLIC_GNOMES === "1"
      ? ["NEXT_PUBLIC_SELLER_NAME", "NEXT_PUBLIC_SELLER_ADDRESS", "NEXT_PUBLIC_SELLER_EMAIL", "NEXT_PUBLIC_TERMS_VERSION"].filter((k) => !(e[k] || "").trim())
          .concat(["NEXT_PUBLIC_TERMS_URL", "NEXT_PUBLIC_TOKUSHOHO_URL", "NEXT_PUBLIC_PRIVACY_URL"].filter((k) => !https(e[k])).map((k) => `${k} (https://…)`))
      : []),
  ].filter(Boolean);
  if (bad.length) throw new Error(`a production build needs ${bad.join(", ")}: see netlify.toml`);
}

const base = {
  output: "export",
  trailingSlash: true, // a hole's page is out/h/garden-3/index.html: /h/garden-3/ on any static host
  images: { unoptimized: true },
  devIndicators: false, // the dev badge sits on the HUD's bottom-left button
  // the commit a build is of (Netlify's COMMIT_REF), said with every analytics event
  env: { NEXT_PUBLIC_BUILD: (process.env.COMMIT_REF || "").slice(0, 7) },
};

/**
 * scripts/try-local.sh's playground, on `next dev` alone (GNOGOLF_PLAYGROUND=1,
 * never a build: phase): the page's own /rpc proxied to the node on this
 * machine (PLAYGROUND_RPC, http://127.0.0.1:<port> and nothing else), so a
 * device on the tailnet reads the chain on the page's origin; and the dev
 * server's scripts served to the hosts PLAYGROUND_ORIGINS names exactly (the
 * machine's ts.net name and Tailscale IP, comma-separated: no wildcard).
 */
export function playground(phase, env = process.env) {
  if (phase !== PHASE_DEVELOPMENT_SERVER || env.GNOGOLF_PLAYGROUND !== "1") return {};
  const rpc = env.PLAYGROUND_RPC || "";
  if (!/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(rpc)) throw new Error(`PLAYGROUND_RPC is the node on this machine, http://127.0.0.1:<port>, not "${rpc}"`);
  const origins = (env.PLAYGROUND_ORIGINS || "").split(",").map((h) => h.trim()).filter(Boolean);
  for (const h of origins) if (!/^[a-z0-9.-]+$/i.test(h)) throw new Error(`PLAYGROUND_ORIGINS names hosts exactly, not "${h}"`);
  return {
    allowedDevOrigins: origins,
    skipTrailingSlashRedirect: true, // (/rpc/status reaches the node as /status, not /status/)
    rewrites: async () => [{ source: "/rpc/:path*", destination: `${rpc}/:path*` }],
  };
}

export default (phase) => ({ ...base, ...playground(phase) });
