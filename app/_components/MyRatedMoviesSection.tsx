"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import StarRating from "./StarRating";
import type { MyRatedMovie } from "../_lib/my-rated-movies";
import type { FestivalAward } from "../_lib/movie-rows";
import ScrollRow from "./ScrollRow";
import { rateHrefFor } from "../_lib/rating-input";

// 포스터 로드 실패 상태를 카드별로 관리하기 위한 분리 컴포넌트
function RatedMoviePoster({ posterUrl, gradient, title }: { posterUrl: string | null; gradient: string; title: string }) {
  const [failed, setFailed] = useState(false);
  const hasPoster = posterUrl && !failed;
  return (
    <div className={`absolute inset-0 ${hasPoster ? "" : `bg-gradient-to-br ${gradient}`}`}>
      {hasPoster && <PosterImage src={posterUrl} alt={`${title} 포스터`} onError={() => setFailed(true)} />}
    </div>
  );
}

const FESTIVAL_KO: Record<string, string> = {
  academy: "아카데미상",
  cannes: "칸 영화제",
  berlin: "베를린 영화제",
  venice: "베니스 영화제",
};

function groupAwards(awards: FestivalAward[]): { festival: string; year: number; categories: string[] }[] {
  const map = new Map<string, { festival: string; year: number; categories: string[] }>();
  for (const a of awards) {
    const key = `${a.festival}|${a.year}`;
    const entry = map.get(key) ?? { festival: a.festival, year: a.year, categories: [] };
    if (a.categoryLabel && !entry.categories.includes(a.categoryLabel)) entry.categories.push(a.categoryLabel);
    map.set(key, entry);
  }
  return Array.from(map.values());
}

type SortKey = "latest" | "high" | "low";
type AwardHoverState = number | null; // index of hovered movie

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: "latest", label: "최신순" },
  { key: "high", label: "평점 높은순" },
  { key: "low", label: "낮은순" },
];

// 실제 계정으로 "전체 평점"을 남기면 자동으로 채워지는 칸 — 게스트 모드 리뷰(위쪽
// "내가 높게 평가한 영화"/"최근에 평가한 영화")와는 별개로, 로그인 계정의 평점만 모은다.
export default function MyRatedMoviesSection({ movies, userName }: { movies: MyRatedMovie[]; userName?: string }) {
  const [sortKey, setSortKey] = useState<SortKey>("latest");
  const [awardHovered, setAwardHovered] = useState<AwardHoverState>(null);

  const sorted = useMemo(() => {
    const copy = [...movies];
    if (sortKey === "latest") copy.sort((a, b) => (a.ratedAt < b.ratedAt ? 1 : -1));
    else if (sortKey === "high") copy.sort((a, b) => b.rating - a.rating);
    else copy.sort((a, b) => a.rating - b.rating);
    return copy;
  }, [movies, sortKey]);

  if (movies.length === 0) return null;

  return (
    <div className="mt-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-text">{userName ? `${userName}님이 평점 남긴 작품` : "내가 평점 남긴 작품"}</h2>
        <div className="flex shrink-0 gap-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => setSortKey(opt.key)}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                sortKey === opt.key ? "bg-star text-black" : "bg-surface text-muted hover:text-text"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <ScrollRow className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-3">
        {sorted.map((movie, idx) => {
          const rateHref = rateHrefFor(movie.id);
          return (
          <div key={movie.id} className="relative w-32 shrink-0">
            <Link prefetch={false} href={rateHref} draggable={false} onDragStart={(e) => e.preventDefault()}>
              <div className="relative aspect-2/3 overflow-hidden rounded-lg bg-surface">
                <RatedMoviePoster posterUrl={movie.posterUrl} gradient={movie.gradient} title={movie.title} />
                {movie.awardBadge && movie.festivalAwards && movie.festivalAwards.length > 0 && (() => {
                  const grouped = groupAwards(movie.festivalAwards);
                  return grouped.length > 0 ? (
                    <button
                      type="button"
                      aria-label={movie.festivalAwards.map((a) => `${FESTIVAL_KO[a.festival] ?? a.festival} ${a.categoryLabel} (${a.year})`).join(", ")}
                      className="absolute right-1.5 top-1.5 flex cursor-pointer flex-col items-end gap-0.5"
                      onMouseEnter={() => setAwardHovered(idx)}
                      onMouseLeave={() => setAwardHovered(null)}
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAwardHovered((v) => v === idx ? null : idx); }}
                    >
                      {grouped.map((_, i) => (
                        <span key={i} className="rounded-full bg-yellow-500/30 px-1.5 py-0.5 text-[11px] leading-none ring-1 ring-inset ring-yellow-400/50">
                          🏆
                        </span>
                      ))}
                    </button>
                  ) : null;
                })()}
              </div>
            </Link>
            {awardHovered === idx && movie.festivalAwards && movie.festivalAwards.length > 0 && (() => {
              const grouped = groupAwards(movie.festivalAwards);
              return (
                <div
                  className="absolute right-0 top-1 z-50 max-w-[200px] rounded-lg bg-black/90 p-2 text-[11px] text-white ring-1 ring-white/10"
                  onMouseEnter={() => setAwardHovered(idx)}
                  onMouseLeave={() => setAwardHovered(null)}
                >
                  {grouped.map((g, i) => (
                    <div key={i} className="py-0.5 leading-snug">
                      <span className="font-semibold">{FESTIVAL_KO[g.festival] ?? g.festival}</span>{" "}
                      <span className="text-white/60">{g.year}</span>
                      {g.categories.length > 0 && (
                        <> · <span className="text-yellow-300">{g.categories.join(", ")}</span></>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
            <Link prefetch={false} href={rateHref} draggable={false} onDragStart={(e) => e.preventDefault()}>
              <p className="mt-2 line-clamp-2 text-xs font-medium text-text">{movie.title}</p>
              <div className="mt-1">
                <StarRating rating={movie.rating} scale={10} size="h-3 w-3" />
              </div>
            </Link>
          </div>
          );
        })}
      </ScrollRow>
    </div>
  );
}
