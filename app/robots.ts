import type { MetadataRoute } from "next";
import { SITE_URL } from "./_lib/site";

// /robots.txt — 검색엔진에 공개 페이지만 수집하게 하고 사이트맵 위치를 알려준다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/login", "/signup", "/consent", "/forgot-password", "/mypage", "/my-list", "/diary", "/collection"],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
