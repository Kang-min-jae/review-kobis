import { seedReviews, type Review, type ReviewType } from "./mock-reviews";
import { getGuestIdentity } from "./guest-identity";
import type { RatingCategory } from "./category-ratings-store";

// 리뷰에 category 필드가 생기기 전에 저장된 데이터는 이 값이 없을 수 있다 — 그때는
// 전체 평가로 간주한다.
function categoryOf(review: Review): RatingCategory {
  return review.category ?? "전체";
}

const BASE_STORAGE_KEY = "review-site:user-reviews:v1";
let currentStorageKey = BASE_STORAGE_KEY;

// 로그인한 사용자의 userId로 스토리지 키를 격리한다.
// MyListView / CategoryRateForm 등 클라이언트 컴포넌트 렌더 초입에 호출해
// 모든 useSyncExternalStore 훅보다 먼저 키를 세팅하면 첫 렌더부터 올바른 사용자
// 데이터만 읽히고, 쓸 때도 같은 키에 저장돼 다른 계정 데이터와 섞이지 않는다.
export function initForUser(userId: string | null): void {
  const newKey = userId ? `${BASE_STORAGE_KEY}:${userId}` : BASE_STORAGE_KEY;
  if (newKey === currentStorageKey) return;
  currentStorageKey = newKey;
  reviewsCache.clear();
  reviewsByAuthorCache.clear();
  combinedRatingCache.clear();
  cachedUserReviewedMovies = null;
  cachedMyReviews = null;
  cachedMyMovieRatings = null;
}

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
  cachedMyReviews = null;
  cachedMyMovieRatings = null;
  listeners.forEach((listener) => listener());
}

function readUserReviews(): Review[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(currentStorageKey);
    return raw ? (JSON.parse(raw) as Review[]) : [];
  } catch {
    return [];
  }
}

// 플랫폼 전체 평균(모든 사용자 포함)을 계산할 때 사용 — 공유 키에서 읽는다.
function readAllReviews(): Review[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BASE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Review[]) : [];
  } catch {
    return [];
  }
}

function writeUserReviews(reviews: Review[]) {
  window.localStorage.setItem(currentStorageKey, JSON.stringify(reviews));
  // 사용자별 키에 쓸 때 공유 키도 동기화해 플랫폼 평균에 반영한다.
  if (currentStorageKey !== BASE_STORAGE_KEY) {
    const identity = getGuestIdentity();
    const shared = readAllReviews();
    const others = shared.filter((r) => r.authorId !== identity.id);
    window.localStorage.setItem(BASE_STORAGE_KEY, JSON.stringify([...others, ...reviews]));
  }
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
export function getSeedReviewsSnapshot(
  movieId: string,
  type: ReviewType,
  category: RatingCategory = "전체"
): Review[] {
  const key = `${movieId}:${type}:${category}`;
  let cached = seedReviewsCache.get(key);
  if (!cached) {
    cached = sortByNewest(
      seedReviews.filter((r) => r.movieId === movieId && r.type === type && categoryOf(r) === category)
    );
    seedReviewsCache.set(key, cached);
  }
  return cached;
}

export function getSeedAverageRating(
  movieId: string,
  type: ReviewType,
  category: RatingCategory = "전체"
): number | null {
  return average(getSeedReviewsSnapshot(movieId, type, category));
}

// 하이드레이션 이후 클라이언트에서 사용하는 스냅샷 (로컬 저장소 반영). addReview가 호출되면 캐시를 비워 갱신한다.
const reviewsCache = new Map<string, Review[]>();
export function getReviewsSnapshot(
  movieId: string,
  type: ReviewType,
  category: RatingCategory = "전체"
): Review[] {
  const key = `${movieId}:${type}:${category}`;
  let cached = reviewsCache.get(key);
  if (!cached) {
    cached = sortByNewest(
      [...seedReviews, ...readAllReviews()].filter(
        (r) => r.movieId === movieId && r.type === type && categoryOf(r) === category
      )
    );
    reviewsCache.set(key, cached);
  }
  return cached;
}

export function getAverageRating(
  movieId: string,
  type: ReviewType,
  category: RatingCategory = "전체"
): number | null {
  return average(getReviewsSnapshot(movieId, type, category));
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

// 홈 화면 정렬/카드 표시용 "이 영화의 전반적인 평가" — 항목별(연출/연기 등) 리뷰가 아니라
// 전체 리뷰만 합쳐서 계산한다.
export function getCombinedRatingSnapshot(movieId: string, category: RatingCategory = "전체"): CombinedRating {
  const key = `${movieId}:${category}`;
  let cached = combinedRatingCache.get(key);
  if (!cached) {
    const all = [...seedReviews, ...readAllReviews()].filter(
      (r) => r.movieId === movieId && categoryOf(r) === category
    );
    cached = { average: averageNormalized(all), count: all.length };
    combinedRatingCache.set(key, cached);
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

// 내가 남긴 리뷰 전체(중복 제거 없이) — 나만의 영화 리스트에서 영화별 리뷰 미리보기,
// 누적 좋아요 합산 등에 쓴다.
const EMPTY_MY_REVIEWS: Review[] = [];
let cachedMyReviews: Review[] | null = null;

export function getMyReviewsSnapshot(): Review[] {
  if (typeof window === "undefined") return EMPTY_MY_REVIEWS;
  if (!cachedMyReviews) cachedMyReviews = readUserReviews();
  return cachedMyReviews;
}

export function getServerMyReviewsSnapshot(): Review[] {
  return EMPTY_MY_REVIEWS;
}

// 영화별로 내가 남긴 평점을 하나로 합친 것 — 같은 영화에 항목별로 여러 리뷰를
// 남겼으면 가장 높은 정규화 평점(0~10)과, 가장 최근에 남긴 시각을 쓴다.
export type MyMovieRating = ReviewedMovie & {
  rating: number; // 0~10으로 정규화(한줄평 0~10, 장문평 0~100을 같은 기준으로 비교)
  ratedAt: string; // ISO — 이 영화에 남긴 리뷰 중 가장 최근 시각
};

const EMPTY_MY_MOVIE_RATINGS: MyMovieRating[] = [];
let cachedMyMovieRatings: MyMovieRating[] | null = null;

export function getMyMovieRatingsSnapshot(): MyMovieRating[] {
  if (typeof window === "undefined") return EMPTY_MY_MOVIE_RATINGS;
  if (!cachedMyMovieRatings) {
    const byMovie = new Map<string, MyMovieRating>();
    for (const review of readUserReviews()) {
      const normalized = (review.rating / (review.type === "short" ? 10 : 100)) * 10;
      const existing = byMovie.get(review.movieId);
      if (!existing) {
        byMovie.set(review.movieId, {
          id: review.movieId,
          title: review.movieTitle,
          posterUrl: review.moviePosterUrl,
          gradient: review.movieGradient,
          rating: normalized,
          ratedAt: review.createdAt,
        });
      } else {
        existing.rating = Math.max(existing.rating, normalized);
        if (review.createdAt > existing.ratedAt) existing.ratedAt = review.createdAt;
      }
    }
    cachedMyMovieRatings = Array.from(byMovie.values());
  }
  return cachedMyMovieRatings;
}

export function getServerMyMovieRatingsSnapshot(): MyMovieRating[] {
  return EMPTY_MY_MOVIE_RATINGS;
}

// 특정 작성자가 남긴 모든 리뷰 (영화 불문). 프로필 페이지에서 사용.
const EMPTY_REVIEWS: Review[] = [];
const reviewsByAuthorCache = new Map<string, Review[]>();

export function getReviewsByAuthorSnapshot(authorId: string): Review[] {
  if (typeof window === "undefined") return EMPTY_REVIEWS;
  let cached = reviewsByAuthorCache.get(authorId);
  if (!cached) {
    cached = sortByNewest(
      [...seedReviews, ...readAllReviews()].filter((r) => r.authorId === authorId)
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
    if (categoryOf(review) !== "전체") continue;
    const scale = review.type === "short" ? 10 : 100;
    const normalizedRating = review.rating / scale;
    const existing = bestByMovie.get(review.movieId);
    if (!existing || normalizedRating > existing.normalizedRating) {
      bestByMovie.set(review.movieId, { movieCd: review.movieCd, normalizedRating });
    }
  }

  return Array.from(bestByMovie.values())
    .sort((a, b) => b.normalizedRating - a.normalizedRating)
    .slice(0, 10)
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

// 서버에 저장된 리뷰를 localStorage에도 동기화한다 — 같은 영화+타입+카테고리의 기존
// 항목을 교체하고, 없으면 새로 추가한다.
export function upsertMyReview(
  review: Omit<Review, "id" | "authorId" | "authorName" | "createdAt"> & { createdAt?: string }
): void {
  const identity = getGuestIdentity();
  const existing = readUserReviews();
  const idx = existing.findIndex(
    (r) => r.movieId === review.movieId && r.type === review.type && (r.category ?? "전체") === (review.category ?? "전체")
  );
  const upserted: Review = {
    ...review,
    authorId: identity.id,
    authorName: identity.name,
    id: idx >= 0 ? existing[idx].id : `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: review.createdAt ?? existing[idx]?.createdAt ?? new Date().toISOString(),
  };
  const next = [...existing];
  if (idx >= 0) next[idx] = upserted; else next.push(upserted);
  writeUserReviews(next);
  emitChange();
}

// createdAt(ISO, UTC)을 이 리뷰를 남긴 사람의 로컬 날짜 기준 "YYYY-MM-DD" 키로
// 바꾼다 — MovieDiaryCalendar의 toLocalDateKey와 동일한 계산이다(무비 다이어리
// 칸이 이 키로 하루를 구분하므로, 삭제도 같은 기준으로 맞춰야 한다).
function toLocalDateKey(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// 무비 다이어리에서 "삭제"를 누르면 그 날짜에 그 영화로 남긴 리뷰를 전부(한줄평+
// 장문평, 항목별 리뷰 포함) 지운다 — "그 날 이 영화를 봤다는 기록 자체"를 지우는
// 개념이라 항목 하나만 남기지 않는다.
export function removeReviewsForMovieOnDate(movieId: string, dateKey: string) {
  const remaining = readUserReviews().filter(
    (r) => !(r.movieId === movieId && toLocalDateKey(r.createdAt) === dateKey)
  );
  writeUserReviews(remaining);
  emitChange();
}
