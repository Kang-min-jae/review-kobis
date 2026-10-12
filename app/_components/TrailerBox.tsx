"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OfficialTrailer } from "../_lib/trailers";
import { blockTrailerAction } from "../_lib/trailer-admin-actions";

// 극장 예매는 각 극장 공식 사이트로 새 탭에서 연결만 한다(상영시간표를 가져오지 않는다).
const THEATERS = [
  { name: "CGV", href: "https://www.cgv.co.kr/" },
  { name: "메가박스", href: "https://www.megabox.co.kr/" },
  { name: "롯데시네마", href: "https://www.lottecinema.co.kr/" },
] as const;

// 상세 페이지 오른쪽 "공식 예고편 확인하기" 박스(위쪽 "예고편 · 예매" 버튼의 #watch 앵커 대상).
// 처음엔 썸네일과 재생 버튼만 보여주고, 재생 버튼을 눌렀을 때만 youtube-nocookie iframe을 만든다
// (자동재생 없음). 다른 영상을 고르면 재생 중이던 플레이어는 닫힌다. 재생 중인 iframe 위에는
// 아무것도 겹치지 않는다.
export default function TrailerBox({
  trailers,
  movieTitle,
  movieCd,
  isNowShowing,
  isAdmin = false,
}: {
  trailers: OfficialTrailer[];
  movieTitle: string;
  movieCd: string;
  isNowShowing: boolean;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState<string | null>(trailers[0]?.key ?? null);
  const [playing, setPlaying] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [thumbFailed, setThumbFailed] = useState<string | null>(null); // 썸네일을 못 불러온 영상 key

  const selected = trailers.find((t) => t.key === selectedKey) ?? trailers[0] ?? null;

  function select(key: string) {
    setSelectedKey(key);
    setPlaying(false);
  }

  async function handleBlock() {
    if (!selected || blocking) return;
    if (!confirm(`관리자 권한으로 이 영상을 차단할까요?\n\n${selected.label} (${selected.key})`)) return;
    setBlocking(true);
    try {
      await blockTrailerAction({ videoKey: selected.key, movieCd });
      setPlaying(false);
      router.refresh();
    } catch {
      window.alert("영상을 차단하지 못했어요.");
    } finally {
      setBlocking(false);
    }
  }

  return (
    <section id="watch" className="scroll-mt-20 rounded-2xl border border-neutral-800 bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-text">공식 예고편 확인하기</h2>
        {isNowShowing && (
          <span className="shrink-0 rounded-full border border-star/60 px-2.5 py-0.5 text-[11px] font-semibold text-star">
            ● 극장 상영 중
          </span>
        )}
      </div>

      {selected ? (
        <>
          <div className="relative mt-3 aspect-video min-h-[200px] w-full min-w-[200px] overflow-hidden rounded-xl bg-black">
            {playing ? (
              <iframe
                key={selected.key}
                src={`https://www.youtube-nocookie.com/embed/${selected.key}`}
                title={`${movieTitle} ${selected.label}`}
                allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
                className="absolute inset-0 h-full w-full border-0"
              />
            ) : (
              <>
                {thumbFailed !== selected.key && (
                  // eslint-disable-next-line @next/next/no-img-element -- YouTube 썸네일은 이미지 최적화 대상 도메인이 아니다
                  <img
                    key={selected.key}
                    src={`https://i.ytimg.com/vi/${selected.key}/hqdefault.jpg`}
                    alt=""
                    loading="lazy"
                    onError={() => setThumbFailed(selected.key)}
                    className="absolute inset-0 h-full w-full object-cover opacity-80"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setPlaying(true)}
                  aria-label={`${selected.label} 재생`}
                  className="absolute inset-0 flex items-center justify-center bg-black/20 transition-colors hover:bg-black/40"
                >
                  <span className="flex h-14 w-14 items-center justify-center rounded-full bg-star text-black shadow-lg">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="ml-1 h-7 w-7" aria-hidden="true">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </span>
                </button>
              </>
            )}
          </div>

          {trailers.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="예고편 선택">
              {trailers.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => select(t.key)}
                  aria-pressed={t.key === selected.key}
                  className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors ${
                    t.key === selected.key ? "bg-star text-black" : "bg-black/40 text-muted hover:text-text"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}

          {isAdmin && (
            <button
              type="button"
              onClick={handleBlock}
              disabled={blocking}
              className="mt-2 text-[11px] font-medium text-red-500 hover:text-red-400 disabled:opacity-50"
            >
              {blocking ? "차단 중…" : "🚨 이 영상 차단(관리자)"}
            </button>
          )}
        </>
      ) : (
        <p className="mt-3 rounded-xl bg-black/30 px-3 py-6 text-center text-sm text-muted">공식 예고편이 아직 없어요</p>
      )}

      <div className="mt-4">
        <p className="text-xs font-semibold text-text">극장 예매</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {THEATERS.map((t) => (
            <a
              key={t.name}
              href={t.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-full border border-neutral-700 px-2 py-1.5 text-center text-xs text-text transition-colors hover:border-star hover:text-star"
            >
              {t.name} ↗
            </a>
          ))}
        </div>
      </div>

      {selected && <p className="mt-3 text-[10px] text-muted">예고편: YouTube 공식 영상</p>}
    </section>
  );
}
