import type { MetadataRoute } from "next";
import { SITE_URL } from "./_lib/site";

// /sitemap.xml — 누구나 볼 수 있는 고정 페이지 목록. 영화별 페이지는 검색엔진이 링크를 따라 찾는다.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const pages: { path: string; changeFrequency: "daily" | "weekly" | "monthly"; priority: number }[] = [
    { path: "/", changeFrequency: "daily", priority: 1 },
    { path: "/?category=%ED%98%84%EC%9E%AC%20%EC%83%81%EC%98%81%EC%A4%91%EC%9D%B8%20%EC%98%81%ED%99%94", changeFrequency: "daily", priority: 0.8 },
    { path: "/awards", changeFrequency: "weekly", priority: 0.7 },
    { path: "/help", changeFrequency: "monthly", priority: 0.3 },
    { path: "/help/notices", changeFrequency: "weekly", priority: 0.3 },
    { path: "/legal", changeFrequency: "monthly", priority: 0.2 },
  ];
  return pages.map((p) => ({ url: `${SITE_URL}${p.path}`, lastModified: now, changeFrequency: p.changeFrequency, priority: p.priority }));
}
