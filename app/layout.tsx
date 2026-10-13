import type { Metadata } from "next";
import { Suspense } from "react";
import NavHistoryTracker from "./_components/NavHistoryTracker";
import TmdbLogo from "./_components/TmdbLogo";
import { SITE_URL, SITE_NAME, SITE_TITLE, SITE_DESCRIPTION, BASE_OPEN_GRAPH, BASE_TWITTER } from "./_lib/site";
import "./globals.css";
// 가변(Variable) 폰트의 글자 범위별 조각 버전. 굵기별 통파일은 첫 방문에 수 MB를 받고,
// 굵기별 조각(static dynamic-subset)은 @font-face가 828개(9굵기×92조각)라 렌더링을 막는
// CSS가 137KB(gzip)나 되고 글자마다 폰트 매칭이 느려 첫 레이아웃이 수백 ms 늘어났다.
// 가변 폰트는 조각 92개가 모든 굵기를 담아 CSS 13KB, 폰트 요청 수도 훨씬 적다.
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: SITE_TITLE,
    template: `%s · ${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  openGraph: {
    ...BASE_OPEN_GRAPH,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    ...BASE_TWITTER,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/favicon-96.png", sizes: "96x96", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
  // canonical과 og:url은 홈 페이지(app/(home)/page.tsx)에서만 지정한다 — 레이아웃에 두면 모든 하위
  // 페이지가 "정식 주소는 홈"이라고 선언하게 되어 영화 페이지들이 검색에서 빠질 수 있다.
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
          <p className="mt-2 flex items-center justify-center gap-1.5">
            <a href="https://www.themoviedb.org" target="_blank" rel="noopener noreferrer" aria-label="TMDB">
              <TmdbLogo />
            </a>
          </p>
          <p className="mt-1">
            이 서비스는 TMDB API를 사용하지만 TMDB의 보증이나 인증을 받지 않았습니다.
          </p>
          <p className="mt-0.5 opacity-60">
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
