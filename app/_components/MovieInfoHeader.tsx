import Link from "next/link";
import PosterWithFallback from "./PosterWithFallback";
import type { KoficBoxOffice } from "../_lib/kobis";
import type { ReactNode } from "react";

export type PersonRef = { name: string; kmdbId?: string | null };

const DISPLAY_CAST_LIMIT = 6;

// KMDb 인물 코드(kmdbId)가 있으면 쿼리로 같이 넘겨서 동명이인 필모그래피가 안 섞이게 하고,
// 역할(감독/배우)도 같이 넘겨서 이름은 같지만 역할이 다른 별개 인물("배우 톰 홀랜드" vs
// "감독 톰 홀랜드")의 작품이 섞이지 않게 한다.
export function personHref(person: PersonRef, role: "감독" | "배우"): string {
  const params = new URLSearchParams({ role });
  if (person.kmdbId) params.set("pid", person.kmdbId);
  return `/people/${encodeURIComponent(person.name)}?${params.toString()}`;
}

function formatCount(n: number): string {
  return `${n.toLocaleString("ko-KR")}명`;
}

function formatWon(n: number): string {
  return `${n.toLocaleString("ko-KR")}원`;
}

// 포스터 + 제목/개봉정보/줄거리/감독·출연 블록. 평점 페이지와 항목별 평점 페이지에서
// 똑같이 재사용한다. children으로 우측에 항목별 평점 패널 등을 끼워 넣을 수 있다.
export default function MovieInfoHeader({
  movieTitle,
  description,
  posterUrl,
  gradient,
  releaseDate,
  rereleaseDate,
  runtimeMinutes,
  director,
  cast,
  boxOffice,
  children,
}: {
  movieTitle: string;
  description: string;
  posterUrl: string | null;
  gradient: string;
  releaseDate: string | null;
  rereleaseDate: string | null;
  runtimeMinutes: number | null;
  director: PersonRef | null;
  cast: PersonRef[];
  boxOffice: KoficBoxOffice | null;
  children?: ReactNode;
}) {
  return (
    <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
      <PosterWithFallback posterUrl={posterUrl} gradient={gradient} movieTitle={movieTitle} />
      <div className="min-w-0 flex-1">
        <h1 className="text-lg font-bold text-text">
          {movieTitle}
          {(releaseDate || rereleaseDate || runtimeMinutes) && (
            <span className="ml-2 text-sm font-normal text-muted">
              {releaseDate && `| 개봉연도 ${releaseDate}`}
              {rereleaseDate && ` (재개봉 ${rereleaseDate})`}
              {runtimeMinutes != null && runtimeMinutes > 0 && ` · 러닝타임 ${runtimeMinutes}분`}
              {boxOffice && ` · 누적 관객수 ${formatCount(boxOffice.audiAcc)}`}
              {boxOffice && ` · 누적 흥행 수익 ${formatWon(boxOffice.salesAcc)}`}
            </span>
          )}
        </h1>
        <p className="mt-2 text-xs leading-relaxed text-muted">{description}</p>

        {(director || cast.length > 0) && (
          <p className="mt-3 text-xs text-muted">
            {director && (
              <>
                감독{" "}
                <Link href={personHref(director, "감독")} className="text-text hover:underline">
                  {director.name}
                </Link>
              </>
            )}
            {director && cast.length > 0 && " | "}
            {cast.length > 0 && (
              <>
                출연{" "}
                {cast.slice(0, DISPLAY_CAST_LIMIT).map((member, i, shown) => (
                  <span key={member.name}>
                    <Link href={personHref(member, "배우")} className="text-text hover:underline">
                      {member.name}
                    </Link>
                    {i < shown.length - 1 ? ", " : ""}
                  </span>
                ))}
                {cast.length > DISPLAY_CAST_LIMIT && ` 외 ${cast.length - DISPLAY_CAST_LIMIT}명`}
              </>
            )}
          </p>
        )}
      </div>

      {children}
    </div>
  );
}
