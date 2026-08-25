"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";

type MovieHit = {
  movieCd: string;
  title: string;
  releaseDate: string | null;
};

type PersonHit = {
  name: string;
  kmdbId: string;
  role: "감독" | "배우";
};

export default function SearchInput() {
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState<MovieHit[]>([]);
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 이 컴포넌트가 클라이언트에서 실제로 마운트(하이드레이션)되는지 확인용.
  useEffect(() => {
    console.log("[search] SearchInput 마운트됨 (app/_components/SearchInput.tsx)");
  }, []);

  async function runSearch(rawQuery: string) {
    const trimmed = rawQuery.trim();
    console.debug("[search] runSearch 호출:", trimmed);
    if (!trimmed) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/search-movies?q=${encodeURIComponent(trimmed)}`);
      console.debug("[search] 응답 status:", res.status);
      if (!res.ok) throw new Error(`검색 요청 실패: HTTP ${res.status}`);
      const data: { movies?: MovieHit[]; people?: PersonHit[]; correctedQuery?: string | null } =
        await res.json();
      console.debug("[search] 결과:", data);
      setMovies(data.movies ?? []);
      setPeople(data.people ?? []);
      setCorrectedQuery(data.correctedQuery ?? null);
      setError(false);
    } catch (err) {
      console.error("[search] 요청 실패:", err);
      setMovies([]);
      setPeople([]);
      setCorrectedQuery(null);
      setError(true);
    } finally {
      setOpen(true);
      setLoading(false);
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (!value.trim()) {
      setMovies([]);
      setPeople([]);
      setCorrectedQuery(null);
      setOpen(false);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  // 입력을 멈추면 350ms 후 자동으로 검색한다 (실시간 검색).
  useEffect(() => {
    console.log("[search] effect fired", query);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) return;

    debounceRef.current = setTimeout(() => {
      console.log("[search] fetching...");
      runSearch(query);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // 돋보기 버튼 또는 Enter 키: 기다리지 않고 즉시 검색한다.
  function handleSubmit() {
    console.debug("[search] handleSubmit 클릭/Enter, 현재 query:", query);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runSearch(query);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  const hasResults = movies.length > 0 || people.length > 0;

  return (
    <div className="relative w-full flex-1">
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim() && setOpen(true)}
          placeholder="영화 제목 또는 배우/감독 이름 "
          className="w-full rounded-lg border border-neutral-700 bg-surface py-3 pl-4 pr-11 text-text placeholder:text-muted focus:border-brand focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSubmit}
          aria-label="검색"
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-hover hover:text-text"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4.5 w-4.5"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 z-20 mt-2 max-h-96 overflow-y-auto rounded-lg border border-neutral-700 bg-surface shadow-lg">
            {loading && <p className="p-3 text-xs text-muted">검색 중...</p>}
            {!loading && error && (
              <p className="p-3 text-xs text-brand">검색 중 오류가 발생했어요. 다시 시도해 주세요.</p>
            )}
            {!loading && !error && !hasResults && (
              <p className="p-3 text-xs text-muted">검색 결과가 없어요.</p>
            )}

            {!loading && !error && hasResults && correctedQuery && (
              <p className="border-b border-neutral-700 px-3 py-2 text-xs text-muted">
                &quot;{correctedQuery}&quot;로 검색한 결과
              </p>
            )}

            {!loading && !error && people.length > 0 && (
              <div className="border-b border-neutral-700 py-1">
                <p className="px-3 py-1 text-[10px] font-semibold text-muted">배우 · 감독</p>
                {people.map((person) => (
                  <Link
                    key={person.kmdbId}
                    href={`/people/${encodeURIComponent(person.name)}?pid=${encodeURIComponent(person.kmdbId)}&role=${encodeURIComponent(person.role)}`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 p-2.5 hover:bg-black/30"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-xs text-muted">
                      {person.name.slice(0, 1)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-text">{person.name}</p>
                      <p className="text-[10px] text-muted">{person.role}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {!loading && !error && movies.length > 0 && (
              <div className="py-1">
                {people.length > 0 && <p className="px-3 py-1 text-[10px] font-semibold text-muted">영화</p>}
                {movies.map((hit) => (
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
            )}
          </div>
        </>
      )}
    </div>
  );
}
