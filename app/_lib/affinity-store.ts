// 각 MovieCard가 마운트될 때 자신의 ID를 등록 → 200ms 디바운스 후 /api/affinity 한 번에 조회.
// useSyncExternalStore 패턴으로 React와 통합한다.

import { getMyMovieRatingsSnapshot } from "./reviews-store";

let scores: Record<string, number> = {}; // movieId → 0~100
let coldStart = false;
let pendingIds = new Set<string>();
let fetchedIds = new Set<string>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let loading = false;

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

export function getServerAffinitySnapshot(): Record<string, number> {
  return {};
}

export function isColdStart(): boolean {
  return coldStart;
}

export function getAffinityScore(movieId: string): number | null {
  const s = scores[movieId];
  return s != null ? s : null;
}

async function flushPending() {
  if (pendingIds.size === 0 || loading) return;

  const ids = Array.from(pendingIds);
  pendingIds = new Set();
  loading = true;

  try {
    const myRatings = getMyMovieRatingsSnapshot().map((r) => ({ movieId: r.id, rating: r.rating }));

    // 평점이 하나도 없으면 API 호출 생략 (cold start — 모든 영화 점수 0)
    if (myRatings.length === 0) {
      for (const id of ids) fetchedIds.add(id);
      loading = false;
      return;
    }

    const res = await fetch("/api/affinity", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ movieIds: ids, myRatings, myCategoryRatings: [] }),
    });

    if (res.ok) {
      const data = (await res.json()) as { scores: Record<string, number>; coldStart: boolean };
      scores = { ...scores, ...data.scores };
      coldStart = data.coldStart;
      for (const id of ids) fetchedIds.add(id);
      emit();
    }
  } catch {
    // 네트워크 오류는 무시 — 다음 mount 시 재시도
  } finally {
    loading = false;
    // flushPending 중에 새로 추가된 ID가 있으면 다시 스케줄
    if (pendingIds.size > 0) {
      debounceTimer = setTimeout(flushPending, 200);
    }
  }
}

export function registerMovieIds(ids: string[]) {
  if (typeof window === "undefined") return;

  let added = false;
  for (const id of ids) {
    if (!fetchedIds.has(id) && !pendingIds.has(id)) {
      pendingIds.add(id);
      added = true;
    }
  }
  if (!added) return;

  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(flushPending, 200);
}
