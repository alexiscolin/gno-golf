import type { MetadataRoute } from "next";
import { DESCRIPTION } from "@/lib/site";

export const dynamic = "force-static";

// the game added to a phone's home screen: its name, badge and paper colour
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gnogolf",
    short_name: "Gnogolf",
    description: DESCRIPTION,
    start_url: "/",
    display: "standalone",
    background_color: "#fdf6e9",
    theme_color: "#fdf6e9",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
