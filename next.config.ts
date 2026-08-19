import type { NextConfig } from "next";

// 포스터/스틸컷 이미지는 KMDb(한국영상자료원)에서 가져온다 — KOBIS 자체는 이미지를 제공하지 않는다.
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "http",
        hostname: "file.koreafilm.or.kr",
        pathname: "/**",
      },
    ],
  },
};

export default nextConfig;
