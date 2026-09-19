"use client";

import { useState, useTransition, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import { submitAwardVoteAction, deleteAwardVoteAction, getAwardVotes, getOfficialWinner, type AwardVoteResult, type OfficialWinner } from "../_lib/award-vote-actions";

// ── 영화제 / 시상 부문 정의 ────────────────────────────────────────────────────

export type FestivalId = "academy" | "cannes" | "berlin" | "venice";

const FESTIVALS: { id: FestivalId; name: string; emoji: string; color: string }[] = [
  { id: "academy", name: "아카데미", emoji: "🏆", color: "from-yellow-600 to-yellow-400" },
  { id: "cannes",  name: "칸",       emoji: "🌴", color: "from-rose-600 to-pink-400" },
  { id: "berlin",  name: "베를린",   emoji: "🐻", color: "from-red-700 to-red-400" },
  { id: "venice",  name: "베니스",   emoji: "🦁", color: "from-orange-600 to-amber-400" },
];

const FESTIVAL_AWARDS: Record<FestivalId, string[]> = {
  academy: ["작품상", "감독상", "남우주연상", "여우주연상", "남우조연상", "여우조연상", "각본상", "각색상", "국제영화상", "촬영상", "편집상", "음악상"],
  cannes:  ["황금종려상", "심사위원대상", "감독상", "남우주연상", "여우주연상", "각본상", "심사위원특별상"],
  berlin:  ["황금곰상", "심사위원대상", "감독상", "남우주연상", "여우주연상", "각본상", "특별심사위원상"],
  venice:  ["황금사자상", "심사위원대상", "감독상", "각본상", "볼피컵 남우주연상", "볼피컵 여우주연상", "특별심사위원상", "마르첼로 마스트로이안니상"],
};

// ── 타입 ──────────────────────────────────────────────────────────────────────

type SearchMovie = {
  movieCd: string;
  title: string;
  titleEn?: string;
  repRlsDate?: string;
  posterUrl?: string | null;
};

// ── 검색 훅 ───────────────────────────────────────────────────────────────────

function useMovieSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchMovie[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback((q: string) => {
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/search-movies?q=${encodeURIComponent(q)}`);
        const data = await res.json() as { movies?: SearchMovie[] };
        setResults(data.movies?.slice(0, 8) ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const clear = useCallback(() => {
    setQuery("");
    setResults([]);
  }, []);

  return { query, results, loading, search, clear };
}

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export default function AwardsVoting({ loggedIn }: { loggedIn: boolean }) {
  const [festival, setFestival] = useState<FestivalId | null>(null);
  const [award, setAward] = useState<string | null>(null);
  const [votes, setVotes] = useState<AwardVoteResult[]>([]);
  const [loadingVotes, setLoadingVotes] = useState(false);
  const [officialWinner, setOfficialWinner] = useState<OfficialWinner | null>(null);
  const [isPending, startTransition] = useTransition();
  const { query, results, loading: searching, search, clear } = useMovieSearch();
  const searchRef = useRef<HTMLInputElement>(null);

  // 부문 선택 시 투표 현황 + 공식 수상작 로드
  useEffect(() => {
    if (!festival || !award) { setVotes([]); setOfficialWinner(null); return; }
    setLoadingVotes(true);
    Promise.all([
      getAwardVotes(festival, award),
      getOfficialWinner(festival, award),
    ])
      .then(([v, w]) => { setVotes(v); setOfficialWinner(w); })
      .catch(() => { setVotes([]); setOfficialWinner(null); })
      .finally(() => setLoadingVotes(false));
  }, [festival, award]);

  const handleFestivalSelect = (id: FestivalId) => {
    setFestival(id);
    setAward(null);
    setVotes([]);
    clear();
  };

  const handleAwardSelect = (a: string) => {
    setAward(a);
    clear();
    setTimeout(() => searchRef.current?.focus(), 100);
  };

  const handleVote = (movie: SearchMovie) => {
    if (!festival || !award) return;
    startTransition(async () => {
      const posterUrl = movie.posterUrl ?? null;
      await submitAwardVoteAction({
        festival,
        awardCategory: award,
        movieId: `kobis-${movie.movieCd}`,
        movieTitle: movie.title,
        posterUrl,
      });
      const updated = await getAwardVotes(festival, award);
      setVotes(updated);
      clear();
    });
  };

  const handleCancelVote = () => {
    if (!festival || !award) return;
    startTransition(async () => {
      await deleteAwardVoteAction(festival, award);
      const updated = await getAwardVotes(festival, award);
      setVotes(updated);
    });
  };

  const myVote = votes.find((v) => v.myVote);
  const totalVotes = votes.reduce((s, v) => s + v.count, 0);

  return (
    <div className="mx-auto max-w-3xl">
      {/* 헤더 */}
      <div className="px-5 pt-6">
        <h1 className="text-xl font-bold text-text">수상작 투표</h1>
        <p className="mt-1 text-sm text-muted">영화제를 선택하고 당신의 한 표를 남겨보세요</p>
      </div>

      {/* 영화제 탭 */}
      <div className="mt-6 flex justify-center gap-6 px-5">
        {FESTIVALS.map((f) => {
          const isActive = festival === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => handleFestivalSelect(f.id)}
              className="flex flex-col items-center"
            >
              <span
                className={`flex h-14 w-14 items-center justify-center rounded-full text-xs font-bold shadow-lg transition-all ${
                  isActive
                    ? `bg-gradient-to-br ${f.color} text-white ring-2 ring-star ring-offset-2 ring-offset-black scale-110`
                    : "bg-neutral-800 text-muted opacity-60 hover:opacity-90"
                }`}
              >
                {f.name}
              </span>
            </button>
          );
        })}
      </div>

      {/* 시상 부문 칩 */}
      {festival && (
        <div className="mt-6 px-5">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted">시상 부문</p>
          <div className="flex flex-wrap gap-2">
            {FESTIVAL_AWARDS[festival].map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => handleAwardSelect(a)}
                className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${
                  award === a
                    ? "bg-star text-black"
                    : "bg-surface text-muted hover:text-text"
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 선택된 부문 — 검색 + 투표 현황 */}
      {festival && award && (
        <div className="mt-6 px-5 pb-10">
          {/* 내 투표 상태 */}
          {loggedIn && myVote && (
            <div className="mb-4 flex items-center gap-3 rounded-xl bg-star/10 px-4 py-3">
              {myVote.posterUrl && (
                <div className="relative h-10 w-7 shrink-0 overflow-hidden rounded">
                  <Image src={myVote.posterUrl} alt="" fill className="object-cover" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-xs text-star font-semibold">내 투표</p>
                <p className="truncate text-sm font-bold text-text">{myVote.movieTitle}</p>
              </div>
              <button
                type="button"
                onClick={handleCancelVote}
                disabled={isPending}
                className="shrink-0 rounded-full border border-neutral-700 px-3 py-1 text-xs text-muted hover:text-text transition-colors"
              >
                취소
              </button>
            </div>
          )}

          {/* 공식 수상작 황금 카드 — 검색창 위 */}
          {!loadingVotes && officialWinner && (() => {
            const winnerVote = votes.find((v) => {
              const t = v.movieTitle.trim().toLowerCase();
              const w = officialWinner.title.trim().toLowerCase();
              const e = (officialWinner.titleEn ?? "").trim().toLowerCase();
              return t === w || (e && t === e);
            });
            const winnerPct = winnerVote && totalVotes > 0
              ? Math.round((winnerVote.count / totalVotes) * 100)
              : null;
            return (
              <div className="mb-5 overflow-hidden rounded-xl border-2 border-yellow-400 bg-gradient-to-r from-yellow-950/60 via-neutral-900 to-yellow-950/40 shadow-[0_0_20px_rgba(250,204,21,0.2)]">
                <div className="flex items-center gap-2 border-b border-yellow-400/20 px-4 py-2">
                  <span className="rounded-full bg-yellow-400 px-2.5 py-0.5 text-[11px] font-bold text-black">
                    👑 {officialWinner.ceremonyYear} 공식 수상작
                  </span>
                  <span className="text-[11px] font-semibold text-yellow-300">{officialWinner.categoryLabel}</span>
                  {winnerPct !== null && (
                    <span className="ml-auto shrink-0 text-[11px] text-neutral-400">
                      유저 투표 {winnerPct}% ({winnerVote!.count}표)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 px-4 py-3">
                  {officialWinner.posterUrl ? (
                    <div className="relative h-16 w-11 shrink-0 overflow-hidden rounded border border-yellow-400/40">
                      <Image src={officialWinner.posterUrl} alt="" fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="h-16 w-11 shrink-0 rounded bg-neutral-700" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base font-extrabold text-white">{officialWinner.title}</p>
                    {officialWinner.titleEn && officialWinner.titleEn !== officialWinner.title && (
                      <p className="truncate text-[11px] text-neutral-400">{officialWinner.titleEn}</p>
                    )}
                    <p className="mt-1 text-[11px] text-yellow-400/90">✨ 해당 부문 최종 수상작으로 선정되었습니다</p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 검색 */}
          {loggedIn ? (
            <div className="relative">
              <div className="flex items-center gap-2 rounded-xl bg-surface px-4 py-3">
                <svg className="h-4 w-4 shrink-0 text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  ref={searchRef}
                  type="text"
                  value={query}
                  onChange={(e) => search(e.target.value)}
                  placeholder={`${award}에 투표할 영화 검색…`}
                  className="flex-1 bg-transparent text-sm text-text placeholder:text-muted outline-none"
                />
                {query && (
                  <button type="button" onClick={clear} className="text-muted hover:text-text">
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* 검색 결과 드롭다운 */}
              {(results.length > 0 || (searching && query)) && (
                <div className="absolute left-0 right-0 top-full z-20 mt-1 overflow-hidden rounded-xl bg-surface shadow-xl border border-neutral-800">
                  {searching && results.length === 0 && (
                    <p className="px-4 py-3 text-sm text-muted">검색 중…</p>
                  )}
                  {results.map((movie) => (
                    <button
                      key={movie.movieCd}
                      type="button"
                      onClick={() => handleVote(movie)}
                      disabled={isPending}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-neutral-800 transition-colors disabled:opacity-50"
                    >
                      {movie.posterUrl ? (
                        <div className="relative h-12 w-8 shrink-0 overflow-hidden rounded">
                          <Image src={movie.posterUrl} alt="" fill className="object-cover" />
                        </div>
                      ) : (
                        <div className="h-12 w-8 shrink-0 rounded bg-neutral-700" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text">{movie.title}</p>
                        <p className="text-xs text-muted">{movie.repRlsDate?.slice(0, 4) ?? ""}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-star/20 px-3 py-1 text-xs font-bold text-star">
                        투표
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl bg-surface px-4 py-4 text-center text-sm text-muted">
              투표하려면{" "}
              <Link href="/login" className="text-star hover:underline">
                로그인
              </Link>
              이 필요합니다
            </div>
          )}

          {/* 투표 현황 */}
          <div className="mt-6">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-text">
                {award} 투표 현황
              </p>
              {totalVotes > 0 && (
                <p className="text-xs text-muted">총 {totalVotes}표</p>
              )}
            </div>


            {loadingVotes && (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 animate-pulse rounded-xl bg-neutral-800" />
                ))}
              </div>
            )}

            {!loadingVotes && votes.length === 0 && (
              <p className="py-8 text-center text-sm text-muted">아직 투표가 없어요. 첫 번째로 투표해보세요!</p>
            )}

            {!loadingVotes && votes.length > 0 && (() => {
              const top10 = votes.slice(0, 10);
              const myVoteIdx = votes.findIndex((v) => v.myVote);
              const isMyVoteInTop10 = myVoteIdx >= 0 && myVoteIdx < 10;
              const outOfTop10Vote = !isMyVoteInTop10 && myVoteIdx >= 0 ? votes[myVoteIdx] : null;

              const renderVoteCard = (v: AwardVoteResult, rank: number, highlight: boolean) => {
                const pct = totalVotes > 0 ? Math.round((v.count / totalVotes) * 100) : 0;
                return (
                  <div
                    key={v.movieId}
                    className={`relative overflow-hidden rounded-xl px-4 py-3 bg-surface ${
                      highlight ? "ring-1 ring-yellow-400" : ""
                    }`}
                  >
                    <div
                      className={`absolute inset-y-0 left-0 transition-all duration-700 ${
                        highlight ? "bg-yellow-400/15" : "bg-neutral-800/60"
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                    <div className="relative flex items-center gap-3">
                      <span className={`shrink-0 text-sm font-bold ${rank === 1 ? "text-star" : highlight ? "text-yellow-400" : "text-muted"}`}>
                        {rank}위
                      </span>
                      {v.posterUrl && (
                        <div className="relative h-10 w-7 shrink-0 overflow-hidden rounded">
                          <Image src={v.posterUrl} alt="" fill className="object-cover" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-text">{v.movieTitle}</p>
                        {v.myVote && (
                          <p className={`text-[10px] ${highlight ? "text-yellow-400" : "text-star"}`}>내가 투표한 영화</p>
                        )}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-bold text-text">{v.count}표</p>
                        <p className="text-xs text-muted">{pct}%</p>
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <div className="space-y-2">
                  {top10.map((v, i) => renderVoteCard(v, i + 1, v.myVote))}
                  {outOfTop10Vote && (
                    <>
                      <p className="py-2 text-center text-[11px] text-muted">
                        ─── 상위 10개 영화만 표시 중입니다 ───
                      </p>
                      {renderVoteCard(outOfTop10Vote, myVoteIdx + 1, true)}
                    </>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 아무것도 선택 안 됐을 때 안내 */}
      {!festival && (
        <div className="mt-16 px-5 text-center text-sm text-muted">
          위에서 영화제를 선택해 시작하세요
        </div>
      )}
    </div>
  );
}
