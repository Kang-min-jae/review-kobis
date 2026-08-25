import type { NextConfig } from "next";

// 포스터/스틸컷 이미지는 KMDb(한국영상자료원)에서 가져온다 — KOBIS 자체는 이미지를 제공하지 않는다.
const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
<<<<<<< HEAD
        protocol: "http",
        hostname: "file.koreafilm.or.kr",
        pathname: "/**",
      },
    ],
  },
  // localhost가 아닌 다른 주소(예: 같은 네트워크의 IP, 192.168.x.x)로 개발 서버에
  // 접속하면, Next.js가 보안상 /_next/static, HMR 요청을 403으로 막는다 — 그러면
  // 페이지의 실제 자바스크립트(React)가 브라우저에 전달되지 않아 타이핑 외의 모든
  // 동작(검색 결과 표시, 뒤로가기 등)이 멈춘 것처럼 보인다. 여기 등록된 주소에서의
  // 접속은 허용한다. 다른 IP로 접속할 일이 생기면 이 목록에 추가하면 된다.
  allowedDevOrigins: ["192.168.75.92", "localhost", "127.0.0.1"],
=======
        protocol: "https",
        hostname: "image.tmdb.org",
        pathname: "/t/p/**",
      },
    ],
  },
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914
};

export default nextConfig;
