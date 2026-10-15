"use client";

import { useEffect, useMemo, useState } from "react";
import PosterImage from "./PosterImage";
import { addDiaryLogEntry, getDiaryLogSnapshot } from "../_lib/diary-log-store";
import { cdToMovieId } from "../_lib/rating-input";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";
const SEARCH_DEBOUNCE_MS = 300;

type MovieResult = {
  movieCd: string;
  title: string;
  genre: string | null;
  posterUrl: string | null;
};

function formatDateLabel(dateKey: string): string {
  const parts = dateKey.split("-").map(Number);
  return `${parts[1]}월 ${parts[2]}일`;
}

// "무비 다이어리" 달력에서 특정 날짜 칸의 "+" 버튼을 눌렀을 때 뜨는 모달.
// 제목으로 KOBIS 카탈로그를 검색해서, 평점 없이 "이 날 이 영화를 봤다"만
// 기록으로 남길 수 있게 한다(diary-log-store, 별점 리뷰와는 별개).
export default function DiaryAddMovieModal({ date, onClose }: { date: string; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieResult[]>([]);
  const [loading, setLoading] = useState(false);
  // 이미 이 날짜에 로그로 추가된 영화(alreadyAdded)와, 이번 모달을 여는 동안
  // 새로 추가한 영화(justAdded)를 합쳐서 "추가됨" 표시에 쓴다 — alreadyAdded는
  // date가 바뀔 때만 다시 계산하면 되는 값이라 이펙트 없이 useMemo로 구한다.
  const alreadyAdded = useMemo(() => {
    return new Set(
      getDiaryLogSnapshot()
        .filter((e) => e.watchedDate === date)
        .map((e) => e.movieCd)
        .filter((cd): cd is string => !!cd)
    );
  }, [date]);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const addedIds = useMemo(() => new Set([...alreadyAdded, ...justAdded]), [alreadyAdded, justAdded]);
  // query를 지우면 이전 검색 결과가 남아있어도 화면엔 안 보여준다 — results
  // 상태 자체를 이펙트에서 지울 필요가 없다.
  const visibleResults = query.trim() ? results : [];

  useEffect(() => {
    const trimmed = query.trim();
    // query가 비었을 때 결과를 지우는 것도 렌더링 쪽(아래 JSX)에서 처리한다 —
    // "결과 없음"으로 보여줄지 말지를 여기서 상태로 관리할 필요가 없다.
    if (!trimmed) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search-movies?q=${encodeURIComponent(trimmed)}`)
        .then((res) => res.json())
        .then((data: { movies?: MovieResult[] }) => {
          if (!cancelled) setResults(data.movies ?? []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const handleAdd = (movie: MovieResult) => {
    addDiaryLogEntry({
      movieId: cdToMovieId(movie.movieCd),
      movieTitle: movie.title,
      moviePosterUrl: movie.posterUrl,
      movieGradient: FALLBACK_GRADIENT,
      movieCd: movie.movieCd,
      watchedDate: date,
    });
    setJustAdded((prev) => new Set(prev).add(movie.movieCd));
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-surface p-4 shadow-2xl sm:inset-y-8 sm:right-8 sm:rounded-xl sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-text">영화 추가 · {formatDateLabel(date)}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="shrink-0 rounded p-1 text-muted transition-colors hover:bg-black/30 hover:text-text"
          >
            ✕
          </button>
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="영화 제목 검색"
          autoFocus
          className="mt-4 w-full rounded-lg border border-neutral-700 bg-black/30 px-3 py-2 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none"
        />

        <div className="mt-4 flex-1 space-y-2 overflow-y-auto">
          {loading && <p className="py-4 text-center text-xs text-muted">검색 중...</p>}
          {!loading && query.trim() && visibleResults.length === 0 && (
            <p className="py-4 text-center text-xs text-muted">검색 결과가 없어요.</p>
          )}
          {!loading &&
            visibleResults.map((movie) => {
              const isAdded = addedIds.has(movie.movieCd);
              return (
                <div key={movie.movieCd} className="flex items-center gap-3 rounded-lg bg-black/20 p-2">
                  <div
                    className={`relative h-14 w-10 shrink-0 overflow-hidden rounded ${
                      movie.posterUrl ? "bg-black" : `bg-gradient-to-br ${FALLBACK_GRADIENT}`
                    }`}
                  >
                    {movie.posterUrl && <PosterImage src={movie.posterUrl} alt="" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text">{movie.title}</p>
                    {movie.genre && (
                      <p className="truncate text-xs text-muted">{movie.genre.split(",").join(" · ")}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAdd(movie)}
                    disabled={isAdded}
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                      isAdded
                        ? "border-neutral-700 text-muted"
                        : "border-star text-star hover:bg-star hover:text-black"
                    }`}
                  >
                    {isAdded ? "추가됨" : "추가"}
                  </button>
                </div>
              );
            })}
        </div>
      </div>
    </>
  );
}
