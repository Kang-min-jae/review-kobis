"use client";

import Image from "next/image";

// 우클릭 저장 / 드래그 저장을 막는 기본적인 저지선. 브라우저 이미지 특성상
// 스크린샷이나 개발자 도구를 통한 다운로드까지 완전히 막을 수는 없다.
export default function PosterImage({
  src,
  alt,
  sizes = "200px",
}: {
  src: string;
  alt: string;
  sizes?: string;
}) {
  return (
    <div
      className="absolute inset-0"
      onContextMenu={(e) => e.preventDefault()}
      onDragStart={(e) => e.preventDefault()}
    >
      <Image
        src={src}
        alt={alt}
        fill
        draggable={false}
        sizes={sizes}
        className="select-none object-cover"
      />
      <div className="absolute inset-0" />
    </div>
  );
}
