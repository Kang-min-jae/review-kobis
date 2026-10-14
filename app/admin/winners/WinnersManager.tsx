"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import Image from "next/image";
import { saveOfficialWinnerAction, deleteOfficialWinnerAction, listOfficialWinnersAction } from "../../_lib/admin-winner-actions";

import { FESTIVAL_AWARDS, type FestivalId } from "../../_lib/festival-awards";

const FESTIVALS: { id: FestivalId; name: string }[] = [
  { id: "academy", name: "아카데미" },
  { id: "cannes",  name: "칸" },
  { id: "berlin",  name: "베를린" },
  { id: "venice",  name: "베니스" },
];

type MovieHit = { movieCd: string; title: string; posterUrl: string | null };
type WinnerRow = { id: string; year: number; festival: string; awardCategory: string; movieId: string; movieTitle: string; posterUrl: string | null };

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 10 }, (_, i) => currentYear - i);

function fmtFestival(id: string) {
  return FESTIVALS.find((f) => f.id === id)?.name ?? id;
}

export default function WinnersManager() {
  const [year, setYear] = useState(currentYear);
  const [festival, setFestival] = useState<FestivalId>("academy");
  const [category, setCategory] = useState(FESTIVAL_AWARDS["academy"][0]);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MovieHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MovieHit | null>(null);
  const [isPending, startTransition] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [winners, setWinners] = useState<WinnerRow[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 영화제를 바꾸면 부문·선택·검색을 처음으로 되돌린다.
  function handleFestivalChange(next: FestivalId) {
    setFestival(next);
    setCategory(FESTIVAL_AWARDS[next][0]);
    setSelected(null);
    setHits([]);
    setQuery("");
  }

  // debounced movie search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) return; // 검색어가 비면 결과는 화면에서 숨긴다(visibleHits)
    // 입력이 바뀐 뒤 도착한 이전 검색 결과는 버린다(늦은 응답이 새 결과를 덮어쓰지 않게).
    let cancelled = false;
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search-movies?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) setHits((data.movies ?? []).slice(0, 8));
        }
      } catch {
        // 네트워크 오류 — 이전 결과를 그대로 둔다
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // 검색어가 비면 이전 결과·진행 표시는 숨긴다.
  const hasQuery = query.trim() !== "";
  const visibleHits = hasQuery ? hits : [];
  const visibleSearching = searching && hasQuery;

  function loadWinners() {
    return listOfficialWinnersAction()
      .then((rows) => setWinners(rows as WinnerRow[]))
      .catch(() => { /* ignore */ });
  }

  useEffect(() => {
    listOfficialWinnersAction()
      .then((rows) => setWinners(rows as WinnerRow[]))
      .catch(() => { /* ignore */ });
  }, []);

  function handleSave() {
    if (!selected) return;
    setMsg(null);
    startTransition(async () => {
      try {
        await saveOfficialWinnerAction({
          year,
          festival,
          awardCategory: category,
          movieId: selected.movieCd,
          movieTitle: selected.title,
          posterUrl: selected.posterUrl,
        });
        setMsg("수상작이 등록됐습니다.");
        setSelected(null);
        setQuery("");
        setHits([]);
        await loadWinners();
      } catch {
        setMsg("오류가 발생했습니다.");
      }
    });
  }

  function handleDelete(id: string) {
    if (!confirm("수상작을 삭제하시겠습니까?")) return;
    startTransition(async () => {
      try {
        await deleteOfficialWinnerAction(id);
        setWinners((prev) => prev.filter((w) => w.id !== id));
      } catch {
        setMsg("삭제 오류가 발생했습니다.");
      }
    });
  }

  return (
    <div className="space-y-6">
      {/* 등록 폼 */}
      <div className="rounded-xl bg-surface p-5 space-y-4">
        <h2 className="text-base font-semibold text-text">공식 수상작 등록</h2>

        {/* 연도 · 영화제 · 부문 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">연도</label>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="rounded-lg bg-bg border border-border px-3 py-2 text-sm text-text"
            >
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">영화제</label>
            <select
              value={festival}
              onChange={(e) => handleFestivalChange(e.target.value as FestivalId)}
              className="rounded-lg bg-bg border border-border px-3 py-2 text-sm text-text"
            >
              {FESTIVALS.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-muted">부문</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="rounded-lg bg-bg border border-border px-3 py-2 text-sm text-text"
            >
              {FESTIVAL_AWARDS[festival].map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>

        {/* 영화 검색 */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted">영화 검색</label>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(null); }}
            placeholder="영화 제목 입력..."
            className="rounded-lg bg-bg border border-border px-3 py-2 text-sm text-text placeholder:text-muted"
          />
        </div>

        {/* 검색 결과 드롭다운 */}
        {(visibleSearching || visibleHits.length > 0) && !selected && (
          <div className="rounded-lg border border-border bg-bg divide-y divide-border max-h-64 overflow-y-auto">
            {visibleSearching && <p className="px-3 py-2 text-xs text-muted">검색 중...</p>}
            {visibleHits.map((h) => (
              <button
                key={h.movieCd}
                type="button"
                onClick={() => { setSelected(h); setHits([]); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface transition-colors"
              >
                {h.posterUrl ? (
                  <Image src={h.posterUrl} alt="" width={32} height={48} className="w-8 h-12 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-8 h-12 rounded bg-surface flex items-center justify-center shrink-0">
                    <span className="text-xs text-muted">?</span>
                  </div>
                )}
                <span className="text-sm text-text">{h.title}</span>
              </button>
            ))}
          </div>
        )}

        {/* 선택된 영화 */}
        {selected && (
          <div className="flex items-center gap-3 rounded-lg border border-brand/40 bg-brand/5 px-3 py-2">
            {selected.posterUrl ? (
              <Image src={selected.posterUrl} alt="" width={32} height={48} className="w-8 h-12 object-cover rounded shrink-0" />
            ) : (
              <div className="w-8 h-12 rounded bg-surface shrink-0" />
            )}
            <span className="flex-1 text-sm font-medium text-text">{selected.title}</span>
            <button
              type="button"
              onClick={() => { setSelected(null); setQuery(""); }}
              className="text-xs text-muted hover:text-text"
            >
              변경
            </button>
          </div>
        )}

        {msg && <p className="text-xs text-muted">{msg}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={!selected || isPending}
          className="w-full rounded-lg bg-brand py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          {isPending ? "저장 중..." : "수상작 등록"}
        </button>
      </div>

      {/* 등록된 수상작 목록 */}
      <div>
        <h2 className="text-base font-semibold text-text mb-3">등록된 수상작 ({winners.length})</h2>
        {winners.length === 0 ? (
          <p className="text-sm text-muted">등록된 수상작이 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {winners.map((w) => (
              <div key={w.id} className="flex items-center gap-3 rounded-xl bg-surface p-3">
                {w.posterUrl ? (
                  <Image src={w.posterUrl} alt="" width={32} height={48} className="w-8 h-12 object-cover rounded shrink-0" />
                ) : (
                  <div className="w-8 h-12 rounded bg-bg shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[11px] font-medium text-brand">{w.year}</span>
                    <span className="text-[11px] text-muted">{fmtFestival(w.festival)}</span>
                    <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] text-muted">{w.awardCategory}</span>
                  </div>
                  <p className="mt-0.5 text-sm font-medium text-text truncate">{w.movieTitle}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleDelete(w.id)}
                  disabled={isPending}
                  className="shrink-0 rounded-lg bg-red-500/10 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-500/20 disabled:opacity-40"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
