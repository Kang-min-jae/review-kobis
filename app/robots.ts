import type { MetadataRoute } from "next";
import { SITE_URL } from "./_lib/site";

// /robots.txt — 공개 페이지는 모두 허용하고, 로그인·내 정보·API만 막는다.
// 아이콘(/favicon.ico, /icon-*.png, /apple-touch-icon.png)과 공유 이미지는 막지 않는다 — Googlebot·Googlebot-Image가
// 검색 결과의 사이트 아이콘으로 읽어 간다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/", // 관리자 API(/api/admin/*, 예: /api/admin/cf-status)도 여기에 포함된다
        "/admin",
        "/login",
        "/signup",
        "/consent",
        "/forgot-password",
        "/mypage",
        "/my-list",
        "/diary",
        "/collection",
        "/following",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
