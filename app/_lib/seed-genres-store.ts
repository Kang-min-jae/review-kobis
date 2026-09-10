// "추천 N%" 배지는 모든 영화 카드(MovieCard)에서 공통으로 계산한다 — 이 영화의 전체
// 장르(RowMovie.allGenres, 서버가 채워줌) 중 몇 %가 "내가 평가한 영화들의 장르"와
// 겹치는지 보여준다. 뒤쪽 절반(내 평점의 장르 집합)은 브라우저 localStorage에만
// 있어서 서버 컴포넌트가 미리 계산해줄 수 없다 — 그래서 클라이언트가 /api/seed-genres로
// 한 번 받아와 이 스토어에 캐시해두고, 페이지의 모든 카드가 같이 구독해서 쓴다.
// 다른 클라이언트 스토어(diary-log-store 등)와 같은 구독/알림 패턴을 따른다.

import { subscribe as subscribeReviews, getUserRatedMovieCdsSnapshot } from "./reviews-store";

const listeners = new Set<() => void>();
// useSyncExternalStore는 서버 스냅샷이 매번 같은 참조를 돌려주길 요구한다 — 호출마다
// 새 배열 리터럴을 돌려주면 "매번 바뀌었다"고 오해해서 무한 렌더 루프에 빠진다.
const EMPTY_GENRES: string[] = [];
let cachedGenres: string[] = EMPTY_GENRES;
// 마지막으로 성공/시도한 movieCds 조합(정렬해서 비교) — 평점이 안 바뀌었으면 이미
// 받아온 값을 그대로 쓰고 같은 요청을 반복하지 않는다.
let lastFetchedKey: string | null = null;
let inFlight: Promise<void> | null = null;

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  listeners.forEach((listener) => listener());
}

export function getSeedGenresSnapshot(): string[] {
  return cachedGenres;
}

export function getServerSeedGenresSnapshot(): string[] {
  return EMPTY_GENRES;
}

function keyOf(movieCds: string[]): string {
  return [...movieCds].sort().join(",");
}

async function fetchAndCache(movieCds: string[], key: string): Promise<void> {
  try {
    const query = movieCds.length > 0 ? `?movieCds=${movieCds.join(",")}` : "";
    const res = await fetch(`/api/seed-genres${query}`);
    const data: { genres?: string[] } = await res.json();
    cachedGenres = data.genres ?? [];
  } catch {
    cachedGenres = [];
  }
  lastFetchedKey = key;
  emitChange();
}

// 카드가 마운트될 때마다 불러도 안전하다 — 이미 같은 평점 조합으로 받아온 값이
// 있으면(lastFetchedKey 일치) 새로 요청하지 않고 조용히 반환한다.
export function ensureSeedGenresLoaded(): void {
  if (typeof window === "undefined") return;
  const key = keyOf(getUserRatedMovieCdsSnapshot());
  if (key === lastFetchedKey || inFlight) return;

  const run = fetchAndCache(getUserRatedMovieCdsSnapshot(), key).finally(() => {
    inFlight = null;
  });
  inFlight = run;
}

// 평점을 새로 남기거나 수정하면(리뷰 스토어 변경) 시드 장르 조합도 바뀔 수 있어
// 다시 불러온다 — 컴포넌트마다 따로 구독하지 않아도 되게 이 스토어가 알아서 듣는다.
subscribeReviews(() => {
  lastFetchedKey = null; // 다음 ensureSeedGenresLoaded 호출이 강제로 다시 받아오게 한다.
  ensureSeedGenresLoaded();
});
