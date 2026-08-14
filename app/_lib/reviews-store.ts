import { seedReviews, type Review, type ReviewType } from "./mock-reviews";
import { getGuestIdentity } from "./guest-identity";

const STORAGE_KEY = "review-site:user-reviews:v1";

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emitChange() {
  reviewsCache.clear();
  reviewsByAuthorCache.clear();
  cachedUserReviewedMovieIds = null;
  listeners.forEach((listener) => listener());
}

function readUserReviews(): Review[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Review[]) : [];
  } catch {
    return [];
  }
}

function writeUserReviews(reviews: Review[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reviews));
}

function average(reviews: Review[]): number | null {
  if (reviews.length === 0) return null;
  return reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
}

function sortByNewest(reviews: Review[]): Review[] {
  return [...reviews].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

// 서버 렌더 / 하이드레이션 시점의 스냅샷. 시드 데이터만 사용하므로 서버와 클라이언트 첫 렌더가 항상 일치한다.
// useSyncExternalStore는 참조 안정성을 요구하므로 키별로 캐시해 둔다.
const seedReviewsCache = new Map<string, Review[]>();
export function getSeedReviewsSnapshot(movieId: string, type: ReviewType): Review[] {
  const key = `${movieId}:${type}`;
  let cached = seedReviewsCache.get(key);
  if (!cached) {
    cached = sortByNewest(seedReviews.filter((r) => r.movieId === movieId && r.type === type));
    seedReviewsCache.set(key, cached);
  }
  return cached;
}

export function getSeedAverageRating(movieId: string, type: ReviewType): number | null {
  return average(getSeedReviewsSnapshot(movieId, type));
}

// 하이드레이션 이후 클라이언트에서 사용하는 스냅샷 (로컬 저장소 반영). addReview가 호출되면 캐시를 비워 갱신한다.
const reviewsCache = new Map<string, Review[]>();
export function getReviewsSnapshot(movieId: string, type: ReviewType): Review[] {
  const key = `${movieId}:${type}`;
  let cached = reviewsCache.get(key);
  if (!cached) {
    cached = sortByNewest(
      [...seedReviews, ...readUserReviews()].filter((r) => r.movieId === movieId && r.type === type)
    );
    reviewsCache.set(key, cached);
  }
  return cached;
}

export function getAverageRating(movieId: string, type: ReviewType): number | null {
  return average(getReviewsSnapshot(movieId, type));
}

// 현재 브라우저 사용자가 직접 평점을 남긴 영화 id 목록 (시드 리뷰는 제외 — "내가" 평가한 것만).
const EMPTY_IDS: string[] = [];
let cachedUserReviewedMovieIds: string[] | null = null;

export function getUserReviewedMovieIdsSnapshot(): string[] {
  if (typeof window === "undefined") return EMPTY_IDS;
  if (!cachedUserReviewedMovieIds) {
    cachedUserReviewedMovieIds = Array.from(new Set(readUserReviews().map((r) => r.movieId)));
  }
  return cachedUserReviewedMovieIds;
}

export function getServerUserReviewedMovieIdsSnapshot(): string[] {
  return EMPTY_IDS;
}

// 특정 작성자가 남긴 모든 리뷰 (영화 불문). 프로필 페이지에서 사용.
const EMPTY_REVIEWS: Review[] = [];
const reviewsByAuthorCache = new Map<string, Review[]>();

export function getReviewsByAuthorSnapshot(authorId: string): Review[] {
  if (typeof window === "undefined") return EMPTY_REVIEWS;
  let cached = reviewsByAuthorCache.get(authorId);
  if (!cached) {
    cached = sortByNewest(
      [...seedReviews, ...readUserReviews()].filter((r) => r.authorId === authorId)
    );
    reviewsByAuthorCache.set(authorId, cached);
  }
  return cached;
}

export function getServerReviewsByAuthorSnapshot(): Review[] {
  return EMPTY_REVIEWS;
}

export function addReview(review: Omit<Review, "id" | "createdAt" | "authorId" | "authorName">): Review {
  const identity = getGuestIdentity();
  const newReview: Review = {
    ...review,
    authorId: identity.id,
    authorName: identity.name,
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString(),
  };
  writeUserReviews([...readUserReviews(), newReview]);
  emitChange();
  return newReview;
}
