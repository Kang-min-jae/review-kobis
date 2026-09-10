"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import PosterImage from "./PosterImage";
import DiaryAddMovieModal from "./DiaryAddMovieModal";
import DiaryDayDetailModal from "./DiaryDayDetailModal";
import type { Review } from "../_lib/mock-reviews";
import type { MyRatedMovie } from "../_lib/my-rated-movies";
import {
  subscribe as subscribeDiaryLog,
  getDiaryLogSnapshot,
  getServerDiaryLogSnapshot,
} from "../_lib/diary-log-store";

const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];

type DayMovie = {
  movieId: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
  rating: number | null; // 0~10 정규화. "+ 영화 추가"로만 남긴 기록은 평점이 없다.
};

// 리뷰의 createdAt(ISO, UTC)을 "그 리뷰를 남긴 사람의 로컬 날짜" 기준으로 키를
// 만든다 — UTC 기준으로 자르면 자정 근처에 남긴 기록이 하루 어긋난 칸에 들어갈 수 있다.
function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 별점 리뷰(게스트 모드, localStorage) · 실제 계정 평점(로그인, DB) · "+ 영화 추가"
// 로그, 세 소스를 합쳐서 날짜별 영화 목록을 만든다. 같은 날 같은 영화가 여러
// 소스에 있으면 평점이 있는 쪽을 우선한다 — 로그는 평점 없이 "봤다"만 표시하는
// 용도라서다.
function groupByDay(
  reviews: Review[],
  logEntries: ReturnType<typeof getDiaryLogSnapshot>,
  serverRatedMovies: MyRatedMovie[]
): Map<string, DayMovie[]> {
  const map = new Map<string, DayMovie[]>();

  for (const review of reviews) {
    const key = toLocalDateKey(review.createdAt);
    const scale = review.type === "short" ? 10 : 100;
    const normalized = (review.rating / scale) * 10;
    const list = map.get(key) ?? [];
    const existing = list.find((m) => m.movieId === review.movieId);
    if (existing) {
      existing.rating = Math.max(existing.rating ?? 0, normalized);
    } else {
      list.push({
        movieId: review.movieId,
        title: review.movieTitle,
        posterUrl: review.moviePosterUrl,
        gradient: review.movieGradient,
        rating: normalized,
      });
    }
    map.set(key, list);
  }

  for (const movie of serverRatedMovies) {
    const key = toLocalDateKey(movie.ratedAt);
    const list = map.get(key) ?? [];
    const existing = list.find((m) => m.movieId === movie.id);
    if (existing) {
      existing.rating = Math.max(existing.rating ?? 0, movie.rating);
    } else {
      list.push({
        movieId: movie.id,
        title: movie.title,
        posterUrl: movie.posterUrl,
        gradient: movie.gradient,
        rating: movie.rating,
      });
    }
    map.set(key, list);
  }

  for (const entry of logEntries) {
    const key = entry.watchedDate;
    const list = map.get(key) ?? [];
    if (!list.some((m) => m.movieId === entry.movieId)) {
      list.push({
        movieId: entry.movieId,
        title: entry.movieTitle,
        posterUrl: entry.moviePosterUrl,
        gradient: entry.movieGradient,
        rating: null,
      });
    }
    map.set(key, list);
  }

  return map;
}

function starText(rating0to10: number): string {
  const filled = Math.round(rating0to10 / 2);
  return "★".repeat(filled) + "☆".repeat(5 - filled);
}

// 커서를 올렸을 때만 나타나는 "+" 버튼 — 클릭하면 그 날짜의 영화 추가 모달을 연다.
// 칸 전체가 링크(평점 페이지)로 감싸져 있을 수 있어서 클릭 전파를 막는다.
function AddButton({ onAdd, centered }: { onAdd: () => void; centered: boolean }) {
  return (
    <button
      type="button"
      aria-label="영화 추가"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onAdd();
      }}
      className={`absolute rounded-full bg-black/60 text-muted opacity-0 pointer-events-none transition-opacity hover:text-text group-hover:pointer-events-auto group-hover:opacity-100 ${
        centered ? "inset-0 flex items-center justify-center text-2xl" : "bottom-1 right-1 flex h-6 w-6 items-center justify-center text-sm"
      }`}
    >
      +
    </button>
  );
}

export default function MovieDiaryCalendar({
  reviews,
  serverRatedMovies = [],
}: {
  reviews: Review[];
  serverRatedMovies?: MyRatedMovie[];
}) {
  const today = useMemo(() => new Date(), []);
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed
  const [addModalDate, setAddModalDate] = useState<string | null>(null);
  const [detailDate, setDetailDate] = useState<string | null>(null);

  const logEntries = useSyncExternalStore(subscribeDiaryLog, getDiaryLogSnapshot, getServerDiaryLogSnapshot);
  const byDay = useMemo(
    () => groupByDay(reviews, logEntries, serverRatedMovies),
    [reviews, logEntries, serverRatedMovies]
  );

  const thisMonthCount = useMemo(() => {
    let count = 0;
    for (const [key, movies] of byDay) {
      const [y, m] = key.split("-").map(Number);
      if (y === year && m === month + 1) count += movies.length;
    }
    return count;
  }, [byDay, year, month]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = new Date(year, month, 1).getDay(); // 0=일요일

  const cells: (number | null)[] = [
    ...Array.from({ length: startWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isToday = (day: number) =>
    year === today.getFullYear() && month === today.getMonth() && day === today.getDate();

  const goMonth = (delta: number) => {
    const next = new Date(year, month + delta, 1);
    setYear(next.getFullYear());
    setMonth(next.getMonth());
  };

  return (
    <section className="mx-auto w-full max-w-xl rounded-xl border border-neutral-800 bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold text-text">무비 다이어리</h2>
          <p className="mt-1 text-xs text-muted">영화를 본 날, 평점을 남기면 그 날짜 칸에 포스터가 채워져요</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xl font-bold text-star">{thisMonthCount}</p>
          <p className="text-[10px] text-muted">이번 달 관람 기록</p>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button
          type="button"
          aria-label="이전 달"
          onClick={() => goMonth(-1)}
          className="rounded-full px-2 py-1 text-muted transition-colors hover:bg-black/30 hover:text-text"
        >
          ‹
        </button>
        <p className="text-sm font-semibold text-text">
          {year}년 {month + 1}월
        </p>
        <button
          type="button"
          aria-label="다음 달"
          onClick={() => goMonth(1)}
          className="rounded-full px-2 py-1 text-muted transition-colors hover:bg-black/30 hover:text-text"
        >
          ›
        </button>
      </div>

      <div className="mt-3 grid grid-cols-7 gap-1.5 text-center text-[11px]">
        {WEEKDAY_LABELS.map((label, i) => (
          <span key={label} className={i === 0 ? "text-brand" : i === 6 ? "text-sky-400" : "text-muted"}>
            {label}
          </span>
        ))}
      </div>

      <div className="mt-1.5 grid grid-cols-7 gap-1.5">
        {cells.map((day, i) => {
          if (day === null) return <div key={`empty-${i}`} className="aspect-2/3" />;

          const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
          const movies = byDay.get(key) ?? [];
          const primary = movies[0] as DayMovie | undefined;
          const isMulti = movies.length > 1;
          const hasMovies = movies.length > 0;

          const cell = (
            <div
              role={hasMovies ? "button" : undefined}
              tabIndex={hasMovies ? 0 : undefined}
              onClick={() => hasMovies && setDetailDate(key)}
              onKeyDown={(e) => {
                if (hasMovies && (e.key === "Enter" || e.key === " ")) {
                  e.preventDefault();
                  setDetailDate(key);
                }
              }}
              className={`group relative aspect-2/3 overflow-hidden rounded-md ${hasMovies ? "cursor-pointer" : ""} ${
                primary ? "bg-black" : "bg-black/30"
              } ${isToday(day) ? "ring-2 ring-star" : ""}`}
            >
              {isMulti ? (
                // 하루에 여러 편이면 포스터 영역을 편 수만큼 세로로 쪼개서 각자 보여준다.
                <div className="absolute inset-0 flex flex-col">
                  {movies.map((movie) => (
                    <div
                      key={movie.movieId}
                      className={`relative flex-1 ${
                        movie.posterUrl ? "bg-black" : `bg-gradient-to-br ${movie.gradient}`
                      }`}
                    >
                      {movie.posterUrl && (
                        <div className="absolute inset-0">
                          <PosterImage src={movie.posterUrl} alt="" />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                primary?.posterUrl && (
                  <div className="absolute inset-0 opacity-70">
                    <PosterImage src={primary.posterUrl} alt="" />
                  </div>
                )
              )}
              {!isMulti && primary && !primary.posterUrl && (
                <div className={`absolute inset-0 bg-gradient-to-br ${primary.gradient}`} />
              )}
              {primary && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              )}
              <span className="absolute left-1 top-1 text-[10px] font-semibold text-text/90">{day}</span>
              {isMulti && (
                <span className="absolute right-1 top-1 rounded-full bg-black/70 px-1 text-[9px] font-bold text-star">
                  {movies.length}편
                </span>
              )}
              {primary && (
                <div className="absolute inset-x-1 bottom-1">
                  <p className="truncate text-[10px] font-semibold text-text">
                    {isMulti ? movies.map((m) => m.title).join(" · ") : primary.title}
                  </p>
                  {!isMulti && primary.rating !== null && (
                    <p className="text-[9px] text-star">{starText(primary.rating)}</p>
                  )}
                </div>
              )}
              <AddButton centered={!primary} onAdd={() => setAddModalDate(key)} />
            </div>
          );

          return <div key={key}>{cell}</div>;
        })}
      </div>

      <p className="mt-3 flex items-center gap-1.5 text-[10px] text-muted">
        <span className="inline-block h-2.5 w-2.5 rounded-sm bg-gradient-to-br from-neutral-700 to-neutral-500" />
        포스터가 채워진 칸 = 평점을 남긴 날 · 칸을 클릭하면 그 날 본 영화를 확인·삭제할 수 있고, 커서를
        올리면 + 버튼으로 영화를 추가할 수 있어요
      </p>

      {addModalDate && <DiaryAddMovieModal date={addModalDate} onClose={() => setAddModalDate(null)} />}
      {detailDate && (
        <DiaryDayDetailModal
          date={detailDate}
          serverRatedMovies={serverRatedMovies}
          onClose={() => setDetailDate(null)}
          onAddMovie={() => {
            const date = detailDate;
            setDetailDate(null);
            setAddModalDate(date);
          }}
        />
      )}
    </section>
  );
}
