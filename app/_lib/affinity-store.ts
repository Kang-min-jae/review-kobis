// 모든 영화 카드의 "추천 N%" 배지 점수 저장소.
// 행(MovieRow·GenreMovieRow)이 마운트될 때 카드 ID를 등록하면, 디바운스 후 /api/affinity로
// 한꺼번에 조회한다.
//  · 첫 조회 전: 1000ms 창(초기 Suspense 행들을 하나로 묶음)
//  · 첫 조회 후: 2000ms 창(늦게 스트리밍되는 행들을 하나로 묶음)
// 내 평점이 바뀌면(새 평점·수정·삭제·다른 기기 동기화) 이미 받아둔 카드까지 새 취향으로
// 다시 계산한다 — 예전엔 한 번 받은 ID는 다시 조회하지 않아서, 평점을 남겨도 새로고침
// 전까지 배지가 그대로였고, 평점이 없을 때 본 카드는 평점을 남긴 뒤에도 끝내 배지가 안 떴다.
// useSyncExternalStore 패턴으로 React와 통합한다.

import { subscribe as subscribeReviews } from "./reviews-store";
import { buildRatingsPayload, ratingsPayloadKey } from "./rating-payload";

const INITIAL_DEBOUNCE_MS = 1000;
const LATE_DEBOUNCE_MS = 2000;
// 한 요청에 담는 카드 수 — 서버 상한(300)보다 작게 나눠 보낸다.
const MAX_IDS_PER_REQUEST = 200;

let scores: Record<string, number> = {}; // movieId → 1~99
const knownIds = new Set<string>(); // 지금까지 화면에 등록된 모든 카드
let pendingIds = new Set<string>();
let fetchedIds = new Set<string>();
let fetchedKey: string | null = null; // fetchedIds가 어떤 평점 조합으로 계산된 것인지
let recheckRequested = false; // 평점이 바뀌었을 수 있음 — 다음 조회 때 확인
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let loading = false;
let firstFlushStarted = false;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getAffinitySnapshot(): Record<string, number> {
  return scores;
}

const EMPTY_SCORES: Record<string, number> = {};

export function getServerAffinitySnapshot(): Record<string, number> {
  return EMPTY_SCORES;
}

function schedule(delay: number) {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void flushPending();
  }, delay);
}

// 조회한 카드들의 점수를 반영한다. 점수가 없어진 카드(예: 방금 평가해서 추천 대상에서
// 빠진 영화)는 옛 점수가 남지 않도록 지운다.
function applyScores(ids: string[], incoming: Record<string, number>) {
  const next = { ...scores };
  let changed = false;
  for (const id of ids) {
    fetchedIds.add(id);
    const value = incoming[id];
    const score = typeof value === "number" && Number.isFinite(value) && value > 0 ? value : undefined;
    if (next[id] === score) continue;
    changed = true;
    if (score === undefined) delete next[id];
    else next[id] = score;
  }
  if (changed) {
    scores = next;
    emit();
  }
}

async function flushPending() {
  // 조회 중이면 끝난 뒤 finally에서 다시 스케줄된다.
  if (loading) return;

  recheckRequested = false;
  const payload = buildRatingsPayload();
  const key = ratingsPayloadKey(payload);
  if (key !== fetchedKey) {
    // 평점 조합이 바뀌었으면 지금까지 받은 점수는 옛 취향 기준 — 등록된 카드 전부 다시 계산
    fetchedKey = key;
    fetchedIds = new Set();
    pendingIds = new Set(knownIds);
  }
  if (pendingIds.size === 0) return;

  const ids = [...pendingIds].slice(0, MAX_IDS_PER_REQUEST);
  for (const id of ids) pendingIds.delete(id);
  loading = true;
  firstFlushStarted = true;

  try {
    // 평점이 하나도 없으면(cold start) 근거 있는 추천도가 없다 — API 호출 없이 배지를 비운다.
    if (payload.myRatings.length === 0) {
      applyScores(ids, {});
      return;
    }

    const res = await fetch("/api/affinity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieIds: ids, ...payload }),
    });
    if (!res.ok) return;
    const data = (await res.json()) as { scores?: Record<string, number> };
    // 응답을 기다리는 사이 평점이 또 바뀌었으면 이 결과는 버린다(다음 조회가 새 취향으로 채운다).
    if (fetchedKey !== key) return;
    applyScores(ids, data.scores ?? {});
  } catch {
    // 네트워크 오류는 무시 — 이 카드들은 다음 등록이나 평점 변경 때 다시 조회된다.
  } finally {
    loading = false;
    if (pendingIds.size > 0 || recheckRequested) schedule(LATE_DEBOUNCE_MS);
  }
}

export function registerMovieIds(ids: string[]) {
  if (typeof window === "undefined") return;

  let added = false;
  for (const id of ids) {
    knownIds.add(id);
    if (fetchedIds.has(id) || pendingIds.has(id)) continue;
    pendingIds.add(id);
    added = true;
  }
  if (!added) return;

  schedule(firstFlushStarted ? LATE_DEBOUNCE_MS : INITIAL_DEBOUNCE_MS);
}

// 평점이 바뀌면 등록된 카드 전체를 새 취향으로 다시 계산하도록 예약한다. 평점과 무관한
// 변경(리뷰 내용만 수정 등)이면 flushPending이 평점 키를 비교해 아무것도 요청하지 않는다.
// 첫 조회 전이면 예약된 첫 조회가 어차피 최신 평점을 읽으므로 따로 할 일이 없다.
subscribeReviews(() => {
  if (typeof window === "undefined" || !firstFlushStarted) return;
  recheckRequested = true;
  schedule(LATE_DEBOUNCE_MS);
});
