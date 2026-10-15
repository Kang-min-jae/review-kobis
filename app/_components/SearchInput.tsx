"use client";

import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import { cdToMovieId } from "../_lib/rating-input";

type MovieHit = {
  movieCd: string;
  title: string;
  releaseDate: string | null;
  posterUrl: string | null;
};

type SeriesHit = {
  tmdbId: string;
  name: string;
  firstAirDate: string | null;
  posterUrl: string | null;
};

type PersonHit = {
  name: string;
  kmdbId: string;
  role: "감독" | "배우";
  creditCount: number;
  latestYear: string | null;
  representativeWorks: string[];
  tmdbId?: string;
};

type CachedResult = {
  movies: MovieHit[];
  series: SeriesHit[];
  people: PersonHit[];
  correctedQuery: string | null;
};

export default function SearchInput() {
  const [query, setQuery] = useState("");
  const [movies, setMovies] = useState<MovieHit[]>([]);
  const [series, setSeries] = useState<SeriesHit[]>([]);
  const [people, setPeople] = useState<PersonHit[]>([]);
  const [correctedQuery, setCorrectedQuery] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 브라우저 인메모리 캐시 — 백스페이스·재검색 시 네트워크 요청 없이 0ms로 즉시 렌더링.
  // 최대 50개 항목 유지 (FIFO 방식으로 오래된 항목 제거).
  const clientCacheRef = useRef<Map<string, CachedResult>>(new Map());

  function applyResult(result: CachedResult) {
    setMovies(result.movies);
    setSeries(result.series);
    setPeople(result.people);
    setCorrectedQuery(result.correctedQuery);
    setError(false);
    setLoading(false);
    setOpen(true);
  }

  async function runSearch(rawQuery: string) {
    const trimmed = rawQuery.trim();
    if (!trimmed) return;

    const cacheKey = trimmed.toLowerCase();

    // 클라이언트 캐시 히트 → 네트워크 없이 즉시 렌더링
    const clientHit = clientCacheRef.current.get(cacheKey);
    if (clientHit) {
      applyResult(clientHit);
      return;
    }

    // 이전 요청이 아직 진행 중이면 취소한다.
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    try {
      const res = await fetch(`/api/search-movies?q=${encodeURIComponent(trimmed)}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: { movies?: MovieHit[]; series?: SeriesHit[]; people?: PersonHit[]; correctedQuery?: string | null } =
        await res.json();

      const result: CachedResult = {
        movies: data.movies ?? [],
        series: data.series ?? [],
        people: data.people ?? [],
        correctedQuery: data.correctedQuery ?? null,
      };

      // 클라이언트 캐시에 저장 (최대 50개, FIFO 방식)
      if (clientCacheRef.current.size >= 50) {
        const oldest = clientCacheRef.current.keys().next().value;
        if (oldest !== undefined) clientCacheRef.current.delete(oldest);
      }
      clientCacheRef.current.set(cacheKey, result);

      applyResult(result);
    } catch (err) {
      if ((err as { name?: string }).name === "AbortError") return; // stale 요청 — 무시
      setMovies([]);
      setSeries([]);
      setPeople([]);
      setCorrectedQuery(null);
      setError(true);
      setLoading(false);
      setOpen(true);
    }
  }

  function handleQueryChange(value: string) {
    setQuery(value);
    if (!value.trim()) {
      setMovies([]);
      setSeries([]);
      setPeople([]);
      setCorrectedQuery(null);
      setOpen(false);
      setLoading(false);
    } else {
      setLoading(true);
    }
  }

  // 타이머가 끝났을 때 항상 최신 runSearch를 부른다(effect는 query가 바뀔 때만 다시 건다).
  const searchAfterPause = useEffectEvent((q: string) => runSearch(q));

  // 입력을 멈추면 300ms 후 자동으로 검색한다 (실시간 검색).
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = query.trim();
    if (!trimmed) return;

    debounceRef.current = setTimeout(() => {
      searchAfterPause(query);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // 돋보기 버튼 또는 Enter 키: 기다리지 않고 즉시 검색한다.
  function handleSubmit() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    runSearch(query);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSubmit();
    }
  }

  const hasResults = movies.length > 0 || series.length > 0 || people.length > 0;

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
                혹시{" "}
                <button
                  type="button"
                  onClick={() => { setQuery(correctedQuery); setCorrectedQuery(null); }}
                  className="font-semibold text-brand underline underline-offset-2 hover:opacity-80"
                >
                  &apos;{correctedQuery}&apos;
                </button>
                {correctedQuery.match(/[가-힣]/) ? "(을)를" : ""}
                {" "}찾으시나요?
              </p>
            )}

            {!loading && !error && people.length > 0 && (
              <div className="border-b border-neutral-700 py-1">
                <p className="px-3 py-1 text-[10px] font-semibold text-muted">배우 · 감독</p>
                {people.map((person, idx) => {
                  const isAmbiguous =
                    people.filter((p) => p.name === person.name && p.role === person.role).length > 1;
                  return (
                    <Link prefetch={false}
                      key={`${person.tmdbId ?? person.kmdbId}-${idx}`}
                      href={(() => {
                        const params = new URLSearchParams({ role: person.role });
                        if (person.kmdbId) params.set("pid", person.kmdbId);
                        if (person.tmdbId) params.set("tmdbId", person.tmdbId);
                        return `/people/${encodeURIComponent(person.name)}?${params.toString()}`;
                      })()}
                      onClick={() => setOpen(false)}
                      className="flex items-center gap-3 p-2.5 hover:bg-black/30"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-700 text-xs text-muted">
                        {person.name.slice(0, 1)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm text-text">{person.name}</p>
                        <p className="truncate text-[10px] text-muted">
                          {person.role}
                          {person.representativeWorks.length > 0 ? (
                            <> · {person.representativeWorks.join(", ")} 외</>
                          ) : (
                            isAmbiguous &&
                            ` · 참여작 ${person.creditCount}편${person.latestYear ? ` · ${person.latestYear}년 최근작` : ""}`
                          )}
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {!loading && !error && series.length > 0 && (
              <div className="border-b border-neutral-700 py-1">
                <p className="px-3 py-1 text-[10px] font-semibold text-muted">시리즈</p>
                {series.map((hit) => (
                  <Link prefetch={false}
                    key={hit.tmdbId}
                    href={`/series/tmdb-tv-${hit.tmdbId}/rate`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 p-2.5 hover:bg-black/30"
                  >
                    <div className="relative flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-gradient-to-br from-neutral-800 via-neutral-600 to-neutral-400">
                      {hit.posterUrl ? (
                        <PosterImage src={hit.posterUrl} alt={`${hit.name} 포스터`} sizes="40px" />
                      ) : (
                        <span className="text-xs font-bold text-white/70">{hit.name.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text">{hit.name}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-neutral-700 px-1 py-0.5 text-[9px] font-semibold text-muted">시리즈</span>
                        {hit.firstAirDate && <span className="text-[10px] text-muted">{hit.firstAirDate.slice(0, 4)}</span>}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {!loading && !error && movies.length > 0 && (
              <div className="py-1">
                {(people.length > 0 || series.length > 0) && <p className="px-3 py-1 text-[10px] font-semibold text-muted">영화</p>}
                {movies.map((hit) => (
                  <Link prefetch={false}
                    key={hit.movieCd}
                    href={`/movies/${cdToMovieId(hit.movieCd)}/rate`}
                    onClick={() => setOpen(false)}
                    className="flex items-center gap-3 p-2.5 hover:bg-black/30"
                  >
                    <div className="relative flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-gradient-to-br from-neutral-800 via-neutral-600 to-neutral-400">
                      {hit.posterUrl ? (
                        <PosterImage src={hit.posterUrl} alt={`${hit.title} 포스터`} sizes="40px" />
                      ) : (
                        <span className="text-xs font-bold text-white/70">{hit.title.slice(0, 1)}</span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-text">{hit.title}</p>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-neutral-700 px-1 py-0.5 text-[9px] font-semibold text-muted">영화</span>
                        {hit.releaseDate && <span className="text-[10px] text-muted">{hit.releaseDate.slice(0, 4)}</span>}
                      </div>
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
