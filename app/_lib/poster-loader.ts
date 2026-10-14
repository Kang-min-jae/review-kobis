"use client";

import type { ImageLoaderProps } from "next/image";

// 사이트의 모든 next/image가 쓰는 이미지 주소 생성기(next.config.ts의 images.loaderFile).
// 이미지는 Vercel 이미지 최적화(/_next/image)를 거치지 않고 원본 서버에서 바로 받는다.
// 포스터 수가 많아 최적화를 쓰면 무료 플랜의 이미지 변환 한도를 금방 넘겨 사이트가 멈췄다.
//  · TMDB: 주소의 크기 부분(w500 등)을 화면 폭에 맞는 TMDB 제공 크기(w185/w342/w500)로 바꿔 쓴다 —
//    TMDB가 이미 크기별 이미지를 주므로 따로 변환할 필요가 없다.
//  · 그 밖(KMDb, 사이트 자체 이미지 등): 원본 주소 그대로.
const TMDB_IMAGE = /^(https:\/\/image\.tmdb\.org\/t\/p\/)(?:w\d+|original)(\/.+)$/;

export function posterLoader({ src, width }: ImageLoaderProps): string {
  const match = TMDB_IMAGE.exec(src);
  if (!match) return src;
  const size = width <= 185 ? "w185" : width <= 342 ? "w342" : "w500";
  return `${match[1]}${size}${match[2]}`;
}

export default posterLoader;
