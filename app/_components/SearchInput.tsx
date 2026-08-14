"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

type Hit = {
  movieCd: string;
  title: string;
  releaseDate: string | null;
};

export default function SearchInput() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
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
        if (!res.ok) throw new Error(`검색 요청 실패: HTTP ${res.status}`);
        const data: { results?: Hit[] } = await res.json();
        setResults(data.results ?? []);
        setError(false);
      } catch (err) {
        console.error("[search]", err);
        setResults([]);
        setError(true);
      } finally {
        setOpen(true);
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
            {!loading && error && (
              <p className="p-3 text-xs text-brand">검색 중 오류가 발생했어요. 다시 시도해 주세요.</p>
            )}
            {!loading && !error && results.length === 0 && (
              <p className="p-3 text-xs text-muted">검색 결과가 없어요.</p>
            )}
            {!loading &&
              !error &&
              results.map((hit) => (
                <Link
                  key={hit.movieCd}
                  href={`/movies/kobis-${hit.movieCd}/rate`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 p-2.5 hover:bg-black/30"
                >
                  <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded bg-gradient-to-br from-neutral-800 via-neutral-600 to-neutral-400" />
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
