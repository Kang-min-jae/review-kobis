import type { MetadataRoute } from "next";
import { SITE_URL } from "./_lib/site";
import { ROBOTS_DISALLOWED_BOTS } from "./_lib/bots";

// /robots.txt — 공개 페이지는 모두 허용하고, 로그인·내 정보·API만 막는다.
// 아이콘(/favicon.ico, /icon-*.png, /apple-touch-icon.png)과 공유 이미지는 막지 않는다 — Googlebot·Googlebot-Image가
// 검색 결과의 사이트 아이콘으로 읽어 간다.
// 막을 봇(AI 수집봇·SEO 도구봇)은 app/_lib/bots.ts 한 곳에 모아 둔다 — 규칙을 무시하는 봇은 미들웨어(proxy.ts)가 403으로 돌려보낸다.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: ROBOTS_DISALLOWED_BOTS, disallow: "/" },
      {
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
          // 비로그인 요청에 내주는 공용 캐시 페이지의 내부 경로 — 같은 화면이 원래 주소로 수집된다.
          "/anon/",
          // 항목별(연출·연기 등) 평점 페이지는 영화마다 5개씩 있어 수집량을 6배로 늘린다 — 대표 주소
          // /movies/<id>/rate("전체")만 수집하게 한다(사이트맵·canonical도 그 주소다).
          "/movies/*/rate/category/",
          "/series/*/rate/category/",
          // 홈의 탭·장르 주소(/?category=…&genre=…)는 정식 주소(canonical)가 홈 하나다 — 조합마다 따로 만들어
          // 저장하는 페이지라, 검색봇이 훑으면 검색에는 도움이 안 되고 서버·DB·캐시 쓰기만 늘린다.
          "/*?*category=",
          "/*?*genre=",
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
