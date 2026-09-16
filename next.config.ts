import type { NextConfig } from "next";

// 포스터/스틸컷 이미지는 KMDb(한국영상자료원)에서 가져온다 — KOBIS 자체는 이미지를 제공하지 않는다.
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "file.koreafilm.or.kr",
        pathname: "/**",
      },
      {
        protocol: "http",
        hostname: "file.koreafilm.or.kr",
        pathname: "/**",
      },
      {
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
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
