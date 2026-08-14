"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";

type Hit = {
  id: number;
  title: string;
  posterUrl: string | null;
  releaseDate: string | null;
};

export default function SearchInput() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleQueryChange(value: string) {
    setQuery(value);
    if (!value.trim()) {
      setResults([]);
      setOpen(false);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) return;

    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search-movies?q=${encodeURIComponent(trimmed)}`);
        const data: { results?: Hit[] } = await res.json();
        setResults(data.results ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  return (
    <div className="relative w-full flex-1">
      <input
        type="text"
        value={query}
        onChange={(e) => handleQueryChange(e.target.value)}
        onFocus={() => query.trim() && setOpen(true)}
        placeholder="영화 제목 또는 배우/감독 이름 "
        className="w-full rounded-lg border border-neutral-700 bg-surface px-4 py-3 text-text placeholder:text-muted focus:border-brand focus:outline-none"
      />

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-20 mt-2 max-h-96 overflow-y-auto rounded-lg border border-neutral-700 bg-surface shadow-lg">
            {loading && <p className="p-3 text-xs text-muted">검색 중...</p>}
            {!loading && results.length === 0 && (
              <p className="p-3 text-xs text-muted">검색 결과가 없어요.</p>
            )}
            {!loading &&
              results.map((hit) => (
                <Link
                  key={hit.id}
                  href={`/movies/tmdb-${hit.id}/rate`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 p-2.5 hover:bg-black/30"
                >
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-black/40">
                    {hit.posterUrl && (
                      <PosterImage src={hit.posterUrl} alt={`${hit.title} 포스터`} sizes="40px" />
                    )}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm text-text">{hit.title}</p>
                    <p className="text-[10px] text-muted">{hit.releaseDate?.slice(0, 4)}</p>
                  </div>
                </Link>
              ))}
          </div>
        </>
      )}
    </div>
  );
}
