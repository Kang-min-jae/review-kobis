import type { MetadataRoute } from "next";
import { SITE_URL } from "./_lib/site";

// /robots.txt — 공개 페이지는 모두 허용하고, 로그인·내 정보·API만 막는다.
// 아이콘(/favicon.ico, /icon-*.png, /apple-touch-icon.png)과 공유 이미지는 막지 않는다 — Googlebot·Googlebot-Image가
// 검색 결과의 사이트 아이콘으로 읽어 간다.
// 학습용 데이터를 대량으로 긁어 가는 AI 수집봇 — 검색 노출과 무관하고 서버 함수 사용량만 크게 늘린다.
// 규칙을 무시하는 경우를 위해 proxy.ts가 같은 봇의 페이지 요청을 403으로 돌려보낸다.
const AI_TRAINING_BOTS = ["GPTBot", "CCBot", "Bytespider", "ClaudeBot", "meta-externalagent", "Amazonbot"];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: AI_TRAINING_BOTS, disallow: "/" },
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
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
