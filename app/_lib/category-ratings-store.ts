import { getGuestIdentity } from "./guest-identity";
import { safeSetItem } from "./safe-storage";

export const RATING_CATEGORIES = ["전체", "연출", "연기", "각본", "음악", "편집"] as const;
export type RatingCategory = (typeof RATING_CATEGORIES)[number];

export type CategoryRatingEntry = { authorId: string; value: number }; // value: 0~10점

const STORAGE_KEY = "review-site:category-ratings:v2";
type Store = Record<string, CategoryRatingEntry[]>; // key: `${movieId}:${category}`

function storeKey(movieId: string, category: RatingCategory): string {
  return `${movieId}:${category}`;
}

const listeners = new Set<() => void>();
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// 평점이 바뀔 때마다 올라가는 카운터 — useSyncExternalStore에서 "무언가 바뀌었다"는
// 신호로만 쓴다 (실제 평균 계산은 useMemo로 따로 한다).
let version = 0;
export function getVersion(): number {
  return version;
}

let cached: Store | null = null;
const EMPTY_ENTRIES: CategoryRatingEntry[] = [];

function load(): Store {
  if (cached) return cached;
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cached = raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    cached = {};
  }
  return cached;
}

function persist(next: Store) {
  cached = next;
  safeSetItem(STORAGE_KEY, JSON.stringify(next));
  version += 1;
  listeners.forEach((listener) => listener());
}

export function getCategoryRatingEntries(movieId: string, category: RatingCategory): CategoryRatingEntry[] {
  return load()[storeKey(movieId, category)] ?? EMPTY_ENTRIES;
}

export type CategoryAverage = { average: number | null; count: number };

// 이 영화의 해당 항목에 사용자들이 남긴 평점의 평균 (지금은 로그인 계정이 없어 브라우저별
// 게스트 정체성 단위로 집계된다 — review-store와 동일한 한계).
export function getCategoryAverage(movieId: string, category: RatingCategory): CategoryAverage {
  const entries = getCategoryRatingEntries(movieId, category);
  if (entries.length === 0) return { average: null, count: 0 };
  const sum = entries.reduce((acc, e) => acc + e.value, 0);
  return { average: sum / entries.length, count: entries.length };
}

// 이 브라우저(게스트)가 이 영화의 해당 항목에 이미 남긴 평점이 있으면 돌려준다.
export function getMyCategoryRating(movieId: string, category: RatingCategory): number | null {
  const identity = getGuestIdentity();
  const mine = getCategoryRatingEntries(movieId, category).find((e) => e.authorId === identity.id);
  return mine?.value ?? null;
}

// 평점을 등록/수정한다 — 같은 게스트가 다시 매기면 기존 값을 덮어쓴다(1인 1표).
export function submitCategoryRating(movieId: string, category: RatingCategory, value: number) {
  const identity = getGuestIdentity();
  const current = load();
  const key = storeKey(movieId, category);
  const next = (current[key] ?? []).filter((e) => e.authorId !== identity.id);
  next.push({ authorId: identity.id, value });
  persist({ ...current, [key]: next });
}
