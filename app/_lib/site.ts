// 사이트 기본 주소 — 메타데이터(metadataBase·og 이미지 절대 주소), robots.txt, sitemap.xml이 같이 쓴다.
// Vercel 환경변수 NEXT_PUBLIC_SITE_URL이 있으면 그 값을, 없으면 정식 도메인을 쓴다(끝의 / 는 뗀다).
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://stilltheater.com").replace(/\/+$/, "");
