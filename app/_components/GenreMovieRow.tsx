"use client";

import { useState, useRef } from "react";
import MovieCard from "./MovieCard";
import type { RowMovie } from "../_lib/movie-rows";

const PAGE_SIZE = 20;

export default function GenreMovieRow({
  genre,
  initialMovies,
}: {
  genre: string;
  initialMovies: RowMovie[];
}) {
  const [movies, setMovies] = useState<RowMovie[]>(initialMovies);
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(initialMovies.length >= PAGE_SIZE);
  const scrollRef = useRef<HTMLDivElement>(null);

  async function loadMore() {
    if (loading || !hasMore) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/genre-movies?genre=${encodeURIComponent(genre)}&offset=${movies.length}&pageSize=${PAGE_SIZE}`
      );
      if (!res.ok) throw new Error("fetch failed");
      const next: RowMovie[] = await res.json();
      setMovies((prev) => [...prev, ...next]);
      if (next.length < PAGE_SIZE) setHasMore(false);
      // 스크롤을 끝까지 밀어서 새로 추가된 카드가 보이게 한다
      setTimeout(() => {
        scrollRef.current?.scrollBy({ left: 9999, behavior: "smooth" });
      }, 50);
    } catch {
      // 에러 시 버튼만 다시 활성화
    } finally {
      setLoading(false);
    }
  }

  if (movies.length === 0) return null;

  return (
    <section className="px-5 py-6">
      <h2 className="text-lg font-bold text-text">{genre} 영화</h2>

      <div ref={scrollRef} className="row-scrollbar mt-4 flex gap-4 overflow-x-auto pb-3">
        {movies.map((movie) => (
          <MovieCard key={movie.id} movie={movie} />
        ))}

        {hasMore && (
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="flex h-full shrink-0 items-center justify-center rounded-xl border border-neutral-700 bg-neutral-900 px-6 text-sm font-semibold text-muted transition-colors hover:border-brand hover:text-brand disabled:opacity-50"
            style={{ minWidth: "6rem", minHeight: "10rem" }}
          >
            {loading ? "…" : "더 보기"}
          </button>
        )}
      </div>
    </section>
  );
}
