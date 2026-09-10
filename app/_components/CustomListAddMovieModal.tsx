"use client";

import { useEffect, useMemo, useState } from "react";
import PosterImage from "./PosterImage";
import { addMovieToList, type CustomList } from "../_lib/custom-lists-store";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";
const SEARCH_DEBOUNCE_MS = 300;

type MovieResult = {
  movieCd: string;
  title: string;
  genre: string | null;
  posterUrl: string | null;
};

// 커스텀 리스트(CustomListsSection)의 "+" 카드를 누르면 뜨는 검색 모달 — 제목으로
// KOBIS 카탈로그를 검색해서 그 리스트에 영화를 추가한다. DiaryAddMovieModal과
// 같은 검색 방식을 쓰되, 날짜가 아니라 리스트에 담는다는 점만 다르다.
export default function CustomListAddMovieModal({ list, onClose }: { list: CustomList; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<MovieResult[]>([]);
  const [loading, setLoading] = useState(false);
  const alreadyInList = useMemo(() => new Set(list.movies.map((m) => m.movieId.replace(/^kobis-/, ""))), [list]);
  const [justAdded, setJustAdded] = useState<Set<string>>(new Set());
  const addedIds = useMemo(() => new Set([...alreadyInList, ...justAdded]), [alreadyInList, justAdded]);
  const visibleResults = query.trim() ? results : [];

  useEffect(() => {
    const trimmed = query.trim();
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
    addMovieToList(list.id, {
      movieId: `kobis-${movie.movieCd}`,
      title: movie.title,
      posterUrl: movie.posterUrl,
      gradient: FALLBACK_GRADIENT,
    });
    setJustAdded((prev) => new Set(prev).add(movie.movieCd));
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-sm flex-col bg-surface p-4 shadow-2xl sm:inset-y-8 sm:right-8 sm:rounded-xl sm:p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-bold text-text">영화 추가 · {list.name}</h2>
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
