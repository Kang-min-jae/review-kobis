import type { MetadataRoute } from "next";

// /manifest.webmanifest — 홈 화면에 추가했을 때의 이름·아이콘·색.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "STILL THEATER",
    short_name: "STILL THEATER",
    start_url: "/",
    display: "standalone",
    background_color: "#0D0B12",
    theme_color: "#0D0B12",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
