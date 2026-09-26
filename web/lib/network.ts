// Which deployment this build is, and where the other one is: one code, two
// sites (Netlify env). The testnet plays for free with faucet GNOT; mainnet's
// GNOT is real and it has no faucet.
export const NETWORK: "testnet" | "mainnet" = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
/** The other deployment's address ("" when there is none yet). */
export const OTHER_URL = process.env.NEXT_PUBLIC_OTHER_URL || "";
