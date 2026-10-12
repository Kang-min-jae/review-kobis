import Link from "next/link";
import type { ReactNode } from "react";
import PosterWithFallback from "./PosterWithFallback";
import ScrollToButton from "./ScrollToButton";
import { personHref, type PersonRef } from "./MovieInfoHeader";
import { splitGenres } from "../_lib/movie-rows";
import type { KoficBoxOffice } from "../_lib/kobis";

const DISPLAY_CAST_LIMIT = 6;

// 영화 상세(평점) 페이지 맨 위 카드 — 포스터(박스오피스 순위 배지), 제목, 연도·장르·러닝타임,
// 줄거리, 회원 평균, 누적 관객(박스오피스 상영작만), 감독·출연 칩, 버튼(예고편·예매 / 리스트에 추가).
// children엔 항목별 평점 패널(CategoryRatings)을 끼운다. 시리즈 페이지는 기존 MovieInfoHeader를 그대로 쓴다.
export default function MovieHero({
  movieTitle,
  description,
  posterUrl,
  gradient,
  releaseDate,
  rereleaseDate,
  runtimeMinutes,
  genreAlt,
  director,
  cast,
  boxOffice,
  memberAverage,
  memberCount,
  actions,
  children,
}: {
  movieTitle: string;
  description: string;
  posterUrl: string | null;
  gradient: string;
  releaseDate: string | null;
  rereleaseDate: string | null;
  runtimeMinutes: number | null;
  genreAlt: string | null;
  director: PersonRef | null;
  cast: PersonRef[];
  boxOffice: KoficBoxOffice | null;
  memberAverage: number | null; // "전체" 한줄평 평균(0~10)
  memberCount: number;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const year = releaseDate?.slice(0, 4) ?? null;
  const genres = splitGenres(genreAlt).slice(0, 3);
  const metaParts = [
    year && `${year}`,
    genres.length > 0 && genres.join(", "),
    runtimeMinutes != null && runtimeMinutes > 0 && `${runtimeMinutes}분`,
    rereleaseDate && `재개봉 ${rereleaseDate}`,
  ].filter(Boolean) as string[];
  const shownCast = cast.slice(0, DISPLAY_CAST_LIMIT);

  return (
    <section className="mt-3 rounded-2xl border border-neutral-800 bg-surface p-4 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="relative shrink-0 self-start">
          <PosterWithFallback posterUrl={posterUrl} gradient={gradient} movieTitle={movieTitle} sizeClassName="w-32 sm:w-40" />
          {boxOffice?.rank != null && (
            <span className="absolute left-1.5 top-1.5 rounded-full bg-star px-2 py-0.5 text-[10px] font-bold text-black shadow">
              박스오피스 {boxOffice.rank}위
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold text-text sm:text-2xl">{movieTitle}</h1>
          {metaParts.length > 0 && <p className="mt-1 text-xs text-muted">{metaParts.join(" · ")}</p>}
          <p className="mt-3 text-sm leading-relaxed text-muted">{description}</p>

          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
            <span className="text-muted">
              회원 평균{" "}
              <span className="font-bold text-star">★ {memberAverage !== null ? memberAverage.toFixed(1) : "-"}</span>
              {memberCount > 0 && <span className="ml-1 text-xs">({memberCount.toLocaleString("ko-KR")}명)</span>}
            </span>
            {boxOffice && (
              <span className="text-muted">
                누적 관객 <span className="font-bold text-text">{boxOffice.audiAcc.toLocaleString("ko-KR")}명</span>
              </span>
            )}
          </div>

          {(director || shownCast.length > 0) && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              {director && (
                <Link
                  href={personHref(director, "감독")}
                  className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-text transition-colors hover:border-star hover:text-star"
                >
                  <span className="text-muted">감독</span> {director.name}
                </Link>
              )}
              {shownCast.map((member) => (
                <Link
                  key={member.name}
                  href={personHref(member, "배우")}
                  className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-text transition-colors hover:border-star hover:text-star"
                >
                  {member.name}
                </Link>
              ))}
              {cast.length > DISPLAY_CAST_LIMIT && (
                <span className="text-xs text-muted">외 {cast.length - DISPLAY_CAST_LIMIT}명</span>
              )}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <ScrollToButton
              targetId="rate"
              className="rounded-full bg-star px-4 py-2 text-sm font-bold text-black transition-opacity hover:opacity-90"
            >
              평점
            </ScrollToButton>
            {actions}
            {/* 모바일(1열 화면)에서만 — 예고편·예매 박스로 이동 */}
            <ScrollToButton
              targetId="watch"
              className="rounded-full border border-neutral-700 px-4 py-2 text-sm font-semibold text-text transition-colors hover:border-neutral-500 lg:hidden"
            >
              예고편 · 예매
            </ScrollToButton>
          </div>
        </div>

        {/* 항목별 평점은 넓은 화면에서만 여기 두고, 모바일에선 아래 평점 영역(#rate)으로 옮겨 보여준다 */}
        {children && <div className="hidden shrink-0 lg:block">{children}</div>}
      </div>
    </section>
  );
}
