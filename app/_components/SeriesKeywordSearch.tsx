"use client";

import { useState, useTransition, useRef } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";

type SeriesRowMovie = {
  id: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
  firstAirDate?: string | null;
};

const GENRE_PRESETS = ["드라마", "액션", "SF", "코미디", "범죄", "미스터리", "판타지", "다큐멘터리"];
const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

export default function SeriesKeywordSearch() {
  const [results, setResults] = useState<SeriesRowMovie[]>([]);
  const [foundPerson, setFoundPerson] = useState<string | null>(null);
  const [activeGenre, setActiveGenre] = useState<string | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [searched, setSearched] = useState(false);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  // 레이스 컨디션 방지: 마지막으로 보낸 요청 ID만 상태에 반영
  const reqIdRef = useRef(0);

  async function fetchResults(params: Record<string, string>) {
    const reqId = ++reqIdRef.current;
    const qs = new URLSearchParams(params).toString();
    const res = await fetch(`/api/search-series?${qs}`);
    const json = await res.json();
    if (reqId !== reqIdRef.current) return; // stale 응답 — 폐기
    setResults(json.results ?? []);
    setFoundPerson(json.foundPerson ?? null);
    setSearched(true);
  }

  function handleGenreClick(genre: string) {
    setActiveGenre(genre);
    setInputValue("");
    startTransition(() => {
      fetchResults({ genre });
    });
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    const q = inputValue.trim();
    if (!q) return;
    setActiveGenre(null);
    startTransition(() => {
      fetchResults({ q });
    });
  }

  return (
    <div>
      {/* 장르 프리셋 칩 */}
      <div className="mt-4 flex flex-wrap gap-2">
        {GENRE_PRESETS.map((genre) => (
          <button
            key={genre}
            type="button"
            onClick={() => handleGenreClick(genre)}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
              activeGenre === genre
                ? "bg-star text-black"
                : "bg-surface text-muted hover:text-text"
            }`}
          >
            {genre}
          </button>
        ))}
      </div>

      {/* 텍스트 검색 (배우 이름 / 키워드) */}
      <form onSubmit={handleSearch} className="mt-3 flex gap-2">
        <input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="배우 이름, 시리즈 제목으로 검색…"
          className="flex-1 rounded-full bg-surface px-4 py-2 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-star"
        />
        <button
          type="submit"
          className="rounded-full bg-star px-5 py-2 text-xs font-bold text-black transition-opacity hover:opacity-80"
        >
          검색
        </button>
      </form>

      {/* 결과 */}
      {isPending && (
        <div className="mt-6 flex gap-4 overflow-x-auto pb-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="aspect-2/3 w-28 shrink-0 animate-pulse rounded-lg bg-neutral-800" />
          ))}
        </div>
      )}

      {!isPending && searched && results.length === 0 && (
        <p className="mt-6 text-center text-sm text-muted">검색 결과가 없어요.</p>
      )}

      {!isPending && results.length > 0 && (
        <>
          {foundPerson && (
            <p className="mt-4 text-sm text-muted">
              <span className="text-star font-semibold">{foundPerson}</span> 출연작을 보여드려요
            </p>
          )}
          <div className="mt-4 flex gap-4 overflow-x-auto pb-3 [scrollbar-width:thin]">
            {results.map((movie) => (
              <Link
                key={movie.id}
                href={`/series/${movie.id}/rate`}
                className="group shrink-0"
              >
                <div
                  className={`relative aspect-2/3 w-28 overflow-hidden rounded-lg shadow-md ${
                    movie.posterUrl ? "bg-surface" : `bg-gradient-to-br ${movie.gradient ?? FALLBACK_GRADIENT}`
                  }`}
                >
                  {movie.posterUrl && (
                    <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />
                  )}
                </div>
                <p className="mt-1.5 w-28 truncate text-xs text-text group-hover:text-star">
                  {movie.title}
                </p>
                {movie.firstAirDate && (
                  <p className="text-xs text-muted">{movie.firstAirDate.slice(0, 4)}</p>
                )}
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
