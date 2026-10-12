"use client";

import { useState } from "react";

// TMDB 공식 로고(themoviedb.org 브랜드 가이드의 blue_short). 이미지를 못 불러오면 글자로 대신한다.
const TMDB_LOGO_URL =
  "https://www.themoviedb.org/assets/2/v4/logos/v2/blue_short-8e7b30f73a4020692ccca9c88bafe5dcb6f8a62a4c6bc55cd9ba82bb2cd95f6c.svg";

export default function TmdbLogo() {
  const [failed, setFailed] = useState(false);
  if (failed) return <span className="font-bold tracking-wide text-[#01b4e4]">TMDB</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 외부 SVG 로고, 최적화 대상 아님
    <img src={TMDB_LOGO_URL} alt="TMDB" width={72} height={10} loading="lazy" onError={() => setFailed(true)} className="inline-block h-2.5 w-auto" />
  );
}
