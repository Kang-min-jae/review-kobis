import type { NextConfig } from "next";

// 포스터/스틸컷 이미지는 KMDb(한국영상자료원)에서 가져온다 — KOBIS 자체는 이미지를 제공하지 않는다.
const nextConfig: NextConfig = {
  // /movies/:id/rate, /series/:id/rate는 "전체" 항목 페이지로 보내기만 하는 페이지라,
  // 리다이렉트로 두면 클릭할 때마다 서버를 한 번 더 왕복한다. 서버 안에서 바로 연결한다.
  async rewrites() {
    // 로그인 쿠키가 없는 요청(비로그인 방문자·검색봇)은 같은 화면의 공용 캐시 페이지(app/anon/…)로 보낸다.
    // 로그인 정보를 읽지 않는 페이지라 한 번 만들어 둔 것을 CDN이 바로 내준다 — 예전엔 모든 요청이 서버
    // 함수를 새로 돌렸다. 주소창에는 원래 주소가 그대로 보인다. 로그인 쿠키가 있으면 아래 규칙은 건너뛰고
    // 지금까지처럼 사람마다 다른 페이지를 만든다. (쿠키가 길면 ".0"으로 나뉘어 저장돼 그 이름도 본다.)
    const loggedOut = [
      { type: "cookie" as const, key: "authjs.session-token" },
      { type: "cookie" as const, key: "authjs.session-token.0" },
      { type: "cookie" as const, key: "__Secure-authjs.session-token" },
      { type: "cookie" as const, key: "__Secure-authjs.session-token.0" },
    ];
    const ALL = "%EC%A0%84%EC%B2%B4"; // "전체"
    const MOVIE = "%EC%98%81%ED%99%94"; // "영화"
    // 인물 페이지(/people/<이름>?role=…&pid=…&tmdbId=…)는 쿼리 값을 경로 조각으로 옮긴다(없는 값은 "-") —
    // 쿼리를 읽는 페이지는 캐시할 수 없어서다. 있는 값이 많은 규칙부터 둬서, 주소에 실린 값 조합과 정확히
    // 같은 규칙이 먼저 걸린다(작은 조합의 규칙은 큰 조합보다 뒤에 온다).
    const PERSON_QUERY = ["role", "pid", "tmdbId"] as const;
    const personRules = [7, 6, 5, 4, 3, 2, 1, 0].map((mask) => {
      const present = PERSON_QUERY.filter((_, i) => mask & (4 >> i));
      return {
        source: "/people/:id",
        has: present.map((key) => ({ type: "query" as const, key, value: `(?<${key}>[^/]+)` })),
        missing: loggedOut,
        destination: `/anon/people/:id/${PERSON_QUERY.map((key) => (present.includes(key) ? `:${key}` : "-")).join("/")}`,
      };
    });
    return {
      beforeFiles: [
        {
          source: "/",
          has: [
            { type: "query", key: "category", value: "(?<category>.+)" },
            { type: "query", key: "genre", value: "(?<genre>.+)" },
          ],
          missing: loggedOut,
          destination: "/anon/home/:category/:genre",
        },
        { source: "/", has: [{ type: "query", key: "category", value: "(?<category>.+)" }], missing: loggedOut, destination: `/anon/home/:category/${ALL}` },
        { source: "/", has: [{ type: "query", key: "genre", value: "(?<genre>.+)" }], missing: loggedOut, destination: `/anon/home/${MOVIE}/:genre` },
        { source: "/", missing: loggedOut, destination: `/anon/home/${MOVIE}/${ALL}` },
        { source: "/movies/:id/rate", missing: loggedOut, destination: `/anon/movies/:id/rate/category/${ALL}` },
        { source: "/movies/:id/rate/category/:category", missing: loggedOut, destination: "/anon/movies/:id/rate/category/:category" },
        { source: "/series/:id/rate", missing: loggedOut, destination: `/anon/series/:id/rate/category/${ALL}` },
        { source: "/series/:id/rate/category/:category", missing: loggedOut, destination: "/anon/series/:id/rate/category/:category" },
        ...personRules,
        { source: "/movies/:id/rate", destination: "/movies/:id/rate/category/%EC%A0%84%EC%B2%B4" },
        { source: "/series/:id/rate", destination: "/series/:id/rate/category/%EC%A0%84%EC%B2%B4" },
      ],
      afterFiles: [],
      fallback: [],
    };
  },
  // 이미지 최적화(/_next/image)는 무료 플랜 한도(월 5천 건 변환)를 넘겨 사이트가 멈춘 원인이었다.
  // 모든 next/image가 poster-loader.ts로 주소를 만든다 — TMDB는 크기별 원본 주소, 그 밖은 원본 그대로라
  // Vercel 이미지 변환·캐시 쓰기가 한 건도 생기지 않는다.
  images: {
    loader: "custom",
    loaderFile: "./app/_lib/poster-loader.ts",
    // 우리 페이지는 /_next/image를 쓰지 않는데도, 예전에 수집된 /_next/image?url=… 주소(검색엔진 이미지 봇,
    // 오래 열어 둔 탭)가 들어오면 Vercel이 그대로 변환해 사용량이 계속 쌓였다. 허용 목록을 아무것도 맞지
    // 않게 비워 두면 그런 요청은 변환 없이 400으로 끝난다(직접 로더를 쓰는 화면 이미지에는 영향 없음).
    remotePatterns: [],
    localPatterns: [{ pathname: "/__image-optimization-disabled__", search: "" }],
  },
  // localhost가 아닌 다른 주소(예: 같은 네트워크의 IP, 192.168.x.x)로 개발 서버에
  // 접속하면, Next.js가 보안상 /_next/static, HMR 요청을 403으로 막는다 — 그러면
  // 페이지의 실제 자바스크립트(React)가 브라우저에 전달되지 않아 타이핑 외의 모든
  // 동작(검색 결과 표시, 뒤로가기 등)이 멈춘 것처럼 보인다. 여기 등록된 주소에서의
  // 접속은 허용한다. 와일드카드(192.168.75.*)로 이 네트워크 대역 전체를 허용해뒀으니,
  // 같은 대역 안에서 IP가 또 바뀌어도(예: DHCP 재할당) 이 파일을 다시 안 고쳐도 된다.
  allowedDevOrigins: ["192.168.75.*", "192.168.75.92", "192.168.75.216", "localhost", "127.0.0.1"],
};

export default nextConfig;
