"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OfficialTrailer, TrailerCandidate, TrailerCandidateStatus } from "../_lib/trailers";
import {
  addManualTrailerAction,
  blockTrailerAction,
  removeManualTrailerAction,
  setTrailerChannelRuleAction,
} from "../_lib/trailer-admin-actions";

// 극장 예매는 각 극장 공식 사이트로 새 탭에서 연결만 한다(상영시간표를 가져오지 않는다).
const THEATERS = [
  { name: "CGV", href: "https://www.cgv.co.kr/" },
  { name: "메가박스", href: "https://www.megabox.co.kr/" },
  { name: "롯데시네마", href: "https://www.lottecinema.co.kr/" },
] as const;

const STATUS_LABELS: Record<TrailerCandidateStatus, string> = {
  official: "공식 채널",
  unverified: "공식 채널 아님(숨김)",
  "channel-blocked": "차단한 채널",
  "video-blocked": "차단한 영상",
  unavailable: "삭제·비공개·퍼가기 금지",
};

// 관리자에게만 보이는 예고편 후보 목록 — 숨겨진 영상이 어느 채널 것이고 왜 숨겨졌는지 보여주고,
// 채널을 공식으로 허용하거나 차단할 수 있다(모든 영화에 바로 적용).
function AdminCandidates({ candidates, movieCd }: { candidates: TrailerCandidate[]; movieCd: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function run(id: string, action: () => Promise<void>) {
    if (busy) return;
    setBusy(id);
    try {
      await action();
      router.refresh();
    } catch {
      window.alert("처리하지 못했어요.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <details className="mt-3 rounded-lg border border-red-500/40 bg-black/30 p-2 text-[11px]">
      <summary className="cursor-pointer font-semibold text-red-400">🚨 관리자: 예고편 후보 {candidates.length}개 · 직접 추가</summary>
      <AddManualTrailerForm movieCd={movieCd} />
      {candidates.length === 0 && <p className="mt-2 text-muted">TMDB에 등록된 공식 예고편 후보가 없어요.</p>}
      <ul className="mt-2 space-y-2">
        {candidates.map((c) => (
          <li key={c.key} className="rounded bg-black/30 p-2">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="font-semibold text-text">{c.label}</span>
              {c.manual && <span className="rounded bg-star/20 px-1 text-star">직접 추가</span>}
              <a
                href={`https://www.youtube.com/watch?v=${c.key}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted underline-offset-2 hover:underline"
              >
                {c.key} ↗
              </a>
              <span className={c.status === "official" ? "text-star" : "text-muted"}>· {STATUS_LABELS[c.status]}</span>
            </div>
            <p className="mt-0.5 text-muted">
              채널: {c.channelName ?? "확인 못 함"}
              {c.channelKey && <span className="ml-1 text-neutral-500">({c.channelKey})</span>}
            </p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {c.channelKey && c.status === "unverified" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!confirm(`"${c.channelName}" 채널을 배급사·제작사 공식 채널로 허용할까요?\n모든 영화의 예고편에 적용돼요.`)) return;
                    void run(c.key, () => setTrailerChannelRuleAction({ channelKey: c.channelKey!, channelName: c.channelName, allowed: true }));
                  }}
                  className="rounded-full border border-star/60 px-2 py-0.5 text-star disabled:opacity-50"
                >
                  채널 공식 허용
                </button>
              )}
              {c.channelKey && c.status === "official" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!confirm(`"${c.channelName}" 채널을 차단할까요?\n모든 영화에서 이 채널 영상이 숨겨져요.`)) return;
                    void run(c.key, () => setTrailerChannelRuleAction({ channelKey: c.channelKey!, channelName: c.channelName, allowed: false }));
                  }}
                  className="rounded-full border border-red-500/60 px-2 py-0.5 text-red-400 disabled:opacity-50"
                >
                  채널 차단
                </button>
              )}
              {c.channelKey && c.status === "channel-blocked" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => void run(c.key, () => setTrailerChannelRuleAction({ channelKey: c.channelKey!, allowed: null }))}
                  className="rounded-full border border-neutral-600 px-2 py-0.5 text-muted disabled:opacity-50"
                >
                  채널 차단 해제
                </button>
              )}
              {c.manual && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!confirm(`직접 추가한 이 영상(${c.key})을 목록에서 뺄까요?`)) return;
                    void run(c.key, () => removeManualTrailerAction({ movieCd, videoKey: c.key }));
                  }}
                  className="rounded-full border border-neutral-600 px-2 py-0.5 text-muted disabled:opacity-50"
                >
                  직접 추가 취소
                </button>
              )}
              {c.status !== "video-blocked" && (
                <button
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!confirm(`이 영상(${c.key})만 차단할까요?`)) return;
                    void run(c.key, () => blockTrailerAction({ videoKey: c.key, movieCd }));
                  }}
                  className="rounded-full border border-neutral-600 px-2 py-0.5 text-muted disabled:opacity-50"
                >
                  영상 차단
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}

// TMDB에 아직 없는 공식 예고편(예: 국내 배급사 채널 영상)을 YouTube 주소로 추가한다. 서버가 업로드 채널을
// 확인해 공식 채널일 때만 저장한다 — 공식 목록에 없는 채널이면, 관리자가 직접 확인한 뒤 함께 허용할 수 있다.
function AddManualTrailerForm({ movieCd }: { movieCd: string }) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [type, setType] = useState("Trailer");
  const [allowChannel, setAllowChannel] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  async function submit() {
    if (pending || !url.trim()) return;
    setPending(true);
    setMessage(null);
    try {
      const result = await addManualTrailerAction({ movieCd, url, type, allowChannel });
      if ("error" in result) {
        setMessage({ text: result.error, error: true });
      } else {
        setMessage({ text: "추가했어요.", error: false });
        setUrl("");
        setAllowChannel(false);
        router.refresh();
      }
    } catch {
      setMessage({ text: "추가하지 못했어요.", error: true });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-2 rounded bg-black/30 p-2">
      <p className="font-semibold text-text">공식 예고편 직접 추가</p>
      <p className="mt-0.5 text-muted">TMDB에 없는 배급사·제작사 공식 채널 영상의 YouTube 주소를 넣어 주세요.</p>
      <div className="mt-1.5 flex gap-1.5">
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-label="YouTube 주소"
          className="min-w-0 flex-1 rounded border border-neutral-700 bg-bg px-2 py-1 text-text placeholder:text-muted focus:border-star focus:outline-none"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          aria-label="영상 종류"
          className="rounded border border-neutral-700 bg-bg px-1 py-1 text-text"
        >
          <option value="Trailer">메인 예고편</option>
          <option value="Teaser">티저</option>
        </select>
      </div>
      <label className="mt-1.5 flex items-center gap-1 text-muted">
        <input type="checkbox" checked={allowChannel} onChange={(e) => setAllowChannel(e.target.checked)} />
        목록에 없는 채널이면 이 채널도 공식으로 허용(공식 채널인지 직접 확인한 경우만)
      </label>
      <button
        type="button"
        onClick={() => void submit()}
        disabled={pending || !url.trim()}
        className="mt-1.5 rounded-full border border-star/60 px-3 py-0.5 text-star disabled:opacity-50"
      >
        {pending ? "확인 중…" : "추가"}
      </button>
      {message && <p className={`mt-1 ${message.error ? "text-red-400" : "text-star"}`}>{message.text}</p>}
    </div>
  );
}

// 상세 페이지 오른쪽 "공식 예고편 확인하기" 박스(위쪽 "예고편 · 예매" 버튼의 #watch 앵커 대상).
// 처음엔 썸네일과 재생 버튼만 보여주고, 재생 버튼을 눌렀을 때만 youtube-nocookie iframe을 만든다
// (자동재생 없음). 다른 영상을 고르면 재생 중이던 플레이어는 닫힌다. 재생 중인 iframe 위에는
// 아무것도 겹치지 않는다.
export default function TrailerBox({
  trailers,
  candidates = [],
  movieTitle,
  movieCd,
  isNowShowing,
  isAdmin = false,
  showTheaters = true,
}: {
  trailers: OfficialTrailer[];
  candidates?: TrailerCandidate[]; // 관리자에게만 넘긴다
  movieTitle: string;
  movieCd: string;
  isNowShowing: boolean;
  isAdmin?: boolean;
  showTheaters?: boolean; // 시리즈 페이지엔 극장 예매를 두지 않는다(공식 예고편만)
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

      {showTheaters && (
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
      )}

      {isAdmin && <AdminCandidates candidates={candidates} movieCd={movieCd} />}

      {selected && (
        <p className="mt-3 text-[10px] text-muted">
          예고편: YouTube 공식 영상{selected.channelName ? ` · ${selected.channelName}` : ""}
        </p>
      )}
    </section>
  );
}
