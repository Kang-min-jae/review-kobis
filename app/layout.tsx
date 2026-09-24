import type { Metadata } from "next";
import { Suspense } from "react";
import NavHistoryTracker from "./_components/NavHistoryTracker";
import "./globals.css";
// 한글 폰트는 굵기 하나가 ~780KB라, 굵기별 통파일(static/pretendard.css)을 쓰면 첫 방문에
// 5개 굵기 ≈ 3.9MB를 받는다. dynamic-subset은 글자 범위(unicode-range)별로 쪼개져 있어
// 화면에 실제로 나온 글자가 든 조각만 받는다. font-family 이름('Pretendard')은 동일하다.
import "pretendard/dist/web/static/pretendard-dynamic-subset.css";

const SITE_NAME = "무비리뷰";
const SITE_DESCRIPTION = "한국 영화 평점과 리뷰를 남기고, 영화제 수상작을 한눈에 — 나만의 영화 리스트를 만들어 보세요.";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "https://review-kobis.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_NAME,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    locale: "ko_KR",
  },
  twitter: {
    card: "summary",
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: "/favicon.ico",
    apple: "/favicon.ico",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ko"
      className="h-full antialiased"
    >
      <body className="min-h-full flex flex-col">
        <Suspense fallback={null}>
          <NavHistoryTracker />
        </Suspense>
        <div className="flex-1">{children}</div>
        <footer className="px-5 py-6 text-center text-[10px] leading-relaxed text-muted">
          <p>
            이 서비스는{" "}
            <a href="https://www.kobis.or.kr" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">
              영화진흥위원회(KOBIS)
            </a>{" "}
            오픈API 및{" "}
            <a href="https://www.kmdb.or.kr" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">
              한국영상자료원(KMDb)
            </a>{" "}
            API를 활용합니다.
          </p>
          <p className="mt-1">
            영화 포스터 및 메타데이터 일부 제공:{" "}
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">
              TMDB
            </a>
            {" "}·{" "}
            <a href="https://www.kmdb.or.kr" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">
              한국영상자료원(KMDb)
            </a>
          </p>
          <p className="mt-1 opacity-60">
            This product uses the TMDB API but is not endorsed or certified by TMDB.
          </p>
          <p className="mt-1">
            수상 정보 제공:{" "}
            <a href="https://www.wikidata.org" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-text">
              Wikidata
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
