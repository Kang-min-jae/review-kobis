// 무비 다이어리에서 "+ 영화 추가"로 남기는 기록 — 평점을 남기지 않고 그냥
// "이 날 이 영화를 봤다"만 표시하고 싶을 때 쓴다. 별점 리뷰(reviews-store)와는
// 별개의 저장소다: 같은 영화를 리뷰로도 남기고 로그로도 남길 수 있고, 달력은
// 두 소스를 합쳐서 보여준다(person-filmography.ts가 여러 발견 경로를 합치는 것과
// 같은 방식). 이 코드베이스의 다른 클라이언트 스토어와 같은 구독/알림 패턴을 쓴다.

const BASE_STORAGE_KEY = "review-site:diary-log:v1";
let currentStorageKey = BASE_STORAGE_KEY;

export function initForUser(userId: string | null): void {
  const newKey = userId ? `${BASE_STORAGE_KEY}:${userId}` : BASE_STORAGE_KEY;
  if (newKey === currentStorageKey) return;
  currentStorageKey = newKey;
  cached = null;
  // No listener notification here — calling this during render would trigger
  // setState in other subscribed components, which React forbids. useSyncExternalStore
  // re-reads getDiaryLogSnapshot after initForUser runs, so the correct key is
  // already active when the snapshot is first taken.
}

export type DiaryLogEntry = {
  id: string;
  movieId: string; // "kobis-<movieCd>"
  movieTitle: string;
  moviePosterUrl: string | null;
  movieGradient: string;
  movieCd: string | null;
  watchedDate: string; // "YYYY-MM-DD" — 리뷰의 createdAt과 달리 사용자가 직접 고른 날짜
  createdAt: string; // ISO — 정렬/식별용
};

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// useSyncExternalStore가 참조 안정성을 요구해서(안 바뀌었으면 같은 배열 참조를
// 돌려줘야 무한 렌더링을 피한다) 읽은 값을 캐시해 두고, 변경이 생겼을 때만 비운다.
let cached: DiaryLogEntry[] | null = null;

function emitChange() {
  cached = null;
  listeners.forEach((listener) => listener());
}

function readEntries(): DiaryLogEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(currentStorageKey);
    return raw ? (JSON.parse(raw) as DiaryLogEntry[]) : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: DiaryLogEntry[]) {
  window.localStorage.setItem(currentStorageKey, JSON.stringify(entries));
}

const EMPTY: DiaryLogEntry[] = [];

export function getDiaryLogSnapshot(): DiaryLogEntry[] {
  if (typeof window === "undefined") return EMPTY;
  if (!cached) cached = readEntries();
  return cached;
}

export function getServerDiaryLogSnapshot(): DiaryLogEntry[] {
  return EMPTY;
}

export function addDiaryLogEntry(entry: Omit<DiaryLogEntry, "id" | "createdAt">): DiaryLogEntry {
  const newEntry: DiaryLogEntry = {
    ...entry,
    id: `diary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  writeEntries([...readEntries(), newEntry]);
  emitChange();
  return newEntry;
}

export function removeDiaryLogEntry(id: string) {
  writeEntries(readEntries().filter((e) => e.id !== id));
  emitChange();
}

// 무비 다이어리에서 "삭제"를 누르면(별점 리뷰가 아니라 로그로만 남아있던 경우)
// 그 날짜의 그 영화 로그를 지운다.
export function removeDiaryLogForMovieOnDate(movieId: string, watchedDate: string) {
  writeEntries(readEntries().filter((e) => !(e.movieId === movieId && e.watchedDate === watchedDate)));
  emitChange();
}
