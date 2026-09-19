"use client";

import { useEffect, useState, useRef, useTransition } from "react";
import { saveOfficialWinnerAction, deleteOfficialWinnerAction, listOfficialWinnersAction } from "../../_lib/admin-winner-actions";

type FestivalId = "academy" | "cannes" | "berlin" | "venice";

const FESTIVALS: { id: FestivalId; name: string }[] = [
  { id: "academy", name: "아카데미" },
  { id: "cannes",  name: "칸" },
  { id: "berlin",  name: "베를린" },
  { id: "venice",  name: "베니스" },
];

const FESTIVAL_AWARDS: Record<FestivalId, string[]> = {
  academy: ["작품상", "감독상", "남우주연상", "여우주연상", "남우조연상", "여우조연상", "각본상", "각색상", "국제영화상", "촬영상", "편집상", "음악상"],
  cannes:  ["황금종려상", "심사위원대상", "감독상", "남우주연상", "여우주연상", "각본상", "심사위원특별상"],
  berlin:  ["황금곰상", "심사위원대상", "감독상", "남우주연상", "여우주연상", "각본상", "특별심사위원상"],
  venice:  ["황금사자상", "심사위원대상", "감독상", "각본상", "볼피컵 남우주연상", "볼피컵 여우주연상", "특별심사위원상", "마르첼로 마스트로이안니상"],
};

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

  // reset category when festival changes
  useEffect(() => {
    setCategory(FESTIVAL_AWARDS[festival][0]);
    setSelected(null);
    setHits([]);
    setQuery("");
  }, [festival]);

  // debounced movie search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setHits([]); return; }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/search-movies?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setHits((data.movies ?? []).slice(0, 8));
        }
      } finally {
        setSearching(false);
      }
    }, 400);
  }, [query]);

  async function loadWinners() {
    try {
      const rows = await listOfficialWinnersAction();
      setWinners(rows as WinnerRow[]);
    } catch { /* ignore */ }
  }

  useEffect(() => { loadWinners(); }, []);

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
              onChange={(e) => setFestival(e.target.value as FestivalId)}
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
        {(searching || hits.length > 0) && !selected && (
          <div className="rounded-lg border border-border bg-bg divide-y divide-border max-h-64 overflow-y-auto">
            {searching && <p className="px-3 py-2 text-xs text-muted">검색 중...</p>}
            {hits.map((h) => (
              <button
                key={h.movieCd}
                type="button"
                onClick={() => { setSelected(h); setHits([]); }}
                className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-surface transition-colors"
              >
                {h.posterUrl ? (
                  <img src={h.posterUrl} alt="" className="w-8 h-12 object-cover rounded shrink-0" />
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
              <img src={selected.posterUrl} alt="" className="w-8 h-12 object-cover rounded shrink-0" />
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
                  <img src={w.posterUrl} alt="" className="w-8 h-12 object-cover rounded shrink-0" />
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
