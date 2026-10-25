import type { Metadata } from "next";
import { isSeriesCd } from "./rating-input";

// 사이트 기본 주소(www 없는 정식 주소) — metadataBase, canonical, robots.txt, sitemap.xml, JSON-LD가 같이 쓴다.
export const SITE_URL = "https://stilltheater.com";
export const SITE_NAME = "STILL THEATER";
export const SITE_TITLE = "STILL THEATER - 영화 평점·한줄평";
export const SITE_DESCRIPTION = "불이 켜져도 아직 일어나지 못한 마음을 남겨주세요. 영화 평점과 한줄평을 남기는 곳.";

export const OG_IMAGE = { url: "/og-image.jpg", width: 1200, height: 630, alt: SITE_NAME };

// 페이지가 openGraph/twitter를 따로 지정하면 레이아웃 값이 통째로 대체된다(Next.js 메타데이터는 얕게 합쳐짐).
// 그래서 페이지에서도 이 기본값을 펼쳐 쓰면 사이트 이름·언어·공유 이미지가 빠지지 않는다.
export const BASE_OPEN_GRAPH = {
  siteName: SITE_NAME,
  type: "website",
  locale: "ko_KR",
  images: [OG_IMAGE],
} satisfies Metadata["openGraph"];

export const BASE_TWITTER = {
  card: "summary_large_image",
  images: [OG_IMAGE.url],
} satisfies Metadata["twitter"];

// 사이트 문의 메일 — 메뉴·고객센터·푸터가 모두 이 값을 쓴다. 주소를 바꿀 땐 여기만 고치면 된다.
export const CONTACT_EMAIL = "contact@stilltheater.com";

// 영화 상세(평점) 페이지의 정식 주소. "전체" 항목은 짧은 /movies/<id>/rate 를 쓴다 — next.config.ts의
// rewrite가 리다이렉트 없이 /rate/category/전체 페이지를 그대로 보여준다. 사이트맵과 상세 페이지의
// canonical이 같은 주소를 쓰도록 여기 한곳에서 만든다.
// 시리즈(tmdb-tv-*)는 /series/<id>/rate.
export function movieDetailPath(movieId: string, category = "전체"): string {
  const section = isSeriesCd(movieId) ? "series" : "movies";
  const base = `/${section}/${encodeURIComponent(movieId)}/rate`;
  return category === "전체" ? base : `${base}/category/${encodeURIComponent(category)}`;
}
