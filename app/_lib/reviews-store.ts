import { seedReviews, type Review, type ReviewType } from "./mock-reviews";
import { getGuestIdentity } from "./guest-identity";

const STORAGE_KEY = "review-site:user-reviews:v1";

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// 리뷰가 바뀔 때마다 올라가는 카운터 — useSyncExternalStore에서 "무언가 바뀌었다"는
// 신호로만 쓴다 (평점순 정렬처럼 매번 새 배열을 계산해야 하는 곳은 이 값을
// useMemo의 의존성으로 넣어 재계산 시점만 알아내고, 실제 배열은 직접 만든다 —
// getSnapshot이 매번 새 배열을 반환하면 무한 렌더 루프 경고가 뜨기 때문).
let reviewsVersion = 0;
export function getReviewsVersion(): number {
  return reviewsVersion;
}

function emitChange() {
  reviewsVersion += 1;
  reviewsCache.clear();
  reviewsByAuthorCache.clear();
  combinedRatingCache.clear();
  cachedUserReviewedMovies = null;
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

// "Best" 행 정렬용 — 한줄평(10점 만점)과 장문평(100점 만점)을 0~1로 정규화해 하나의
// 평점으로 합치고, 참여 평점 수도 같이 반환한다 (평점이 같으면 참여 수가 많은 쪽을
// 위로 올리기 위함).
function averageNormalized(reviews: Review[]): number | null {
  if (reviews.length === 0) return null;
  const sum = reviews.reduce((acc, r) => acc + r.rating / (r.type === "short" ? 10 : 100), 0);
  return sum / reviews.length;
}

export type CombinedRating = { average: number | null; count: number };
const combinedRatingCache = new Map<string, CombinedRating>();

export function getCombinedRatingSnapshot(movieId: string): CombinedRating {
  let cached = combinedRatingCache.get(movieId);
  if (!cached) {
    const all = [...seedReviews, ...readUserReviews()].filter((r) => r.movieId === movieId);
    cached = { average: averageNormalized(all), count: all.length };
    combinedRatingCache.set(movieId, cached);
  }
  return cached;
}

// 현재 브라우저 사용자가 직접 평점을 남긴 영화 목록 (시드 리뷰는 제외 — "내가" 평가한 것만).
// 제목/포스터는 리뷰에 스냅샷된 값을 그대로 쓴다 — KOBIS 카탈로그 영화는 로컬 목데이터에
// 없어서 movieId만으로는 다시 조회할 수 없기 때문 (나만의 영화 리스트에서 사용).
export type ReviewedMovie = {
  id: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
};

const EMPTY_REVIEWED_MOVIES: ReviewedMovie[] = [];
let cachedUserReviewedMovies: ReviewedMovie[] | null = null;

export function getUserReviewedMoviesSnapshot(): ReviewedMovie[] {
  if (typeof window === "undefined") return EMPTY_REVIEWED_MOVIES;
  if (!cachedUserReviewedMovies) {
    const byId = new Map<string, ReviewedMovie>();
    for (const review of readUserReviews()) {
      if (!byId.has(review.movieId)) {
        byId.set(review.movieId, {
          id: review.movieId,
          title: review.movieTitle,
          posterUrl: review.moviePosterUrl,
          gradient: review.movieGradient,
        });
      }
    }
    cachedUserReviewedMovies = Array.from(byId.values());
  }
  return cachedUserReviewedMovies;
}

export function getServerUserReviewedMoviesSnapshot(): ReviewedMovie[] {
  return EMPTY_REVIEWED_MOVIES;
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

// 내가 평가한 영화 중 KOBIS movieCd가 있는 것만, 높게 평가한 순으로 최대 5개.
// "사용자 추천 영화"가 장르 기반 추천 후보를 찾을 때 시드로 사용 (클라이언트 전용 —
// 서버 컴포넌트는 이 브라우저의 localStorage에 접근할 수 없어서 API 라우트를 거쳐 호출한다).
export function getUserRatedMovieCdsSnapshot(): string[] {
  if (typeof window === "undefined") return [];

  const bestByMovie = new Map<string, { movieCd: string; normalizedRating: number }>();
  for (const review of readUserReviews()) {
    if (review.movieCd == null) continue;
    const scale = review.type === "short" ? 10 : 100;
    const normalizedRating = review.rating / scale;
    const existing = bestByMovie.get(review.movieId);
    if (!existing || normalizedRating > existing.normalizedRating) {
      bestByMovie.set(review.movieId, { movieCd: review.movieCd, normalizedRating });
    }
  }

  return Array.from(bestByMovie.values())
    .sort((a, b) => b.normalizedRating - a.normalizedRating)
    .slice(0, 5)
    .map((entry) => entry.movieCd);
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
