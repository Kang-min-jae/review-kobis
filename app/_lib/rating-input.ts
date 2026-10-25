// 추천·추천도 API가 받는 내 평점 입력과 영화 ID 규칙.
//
// 평점은 브라우저(localStorage)에서 오는 값이라 형식을 믿을 수 없다 — 숫자가 아니거나
// 범위를 벗어난 값, 수만 건짜리 배열이 와도 계산이 깨지거나 느려지지 않도록 한 곳에서
// 검증·정리한다.

export type RatingInput = {
  movieId: string;
  rating: number; // 0~10 ("전체" 평점)
  ratedAt: string | null; // ISO — 없거나 잘못된 값이면 null(최근성 가중치 1)
};

export type CategoryRatingInput = {
  movieId: string;
  category: string; // 연출·연기·각본·음악·편집
  value: number; // 0~10
};

export const CATEGORY_KEYS = ["연출", "연기", "각본", "음악", "편집"];

const MAX_RATINGS = 2000;
const MAX_CATEGORY_RATINGS = 5000;
const MAX_ID_LENGTH = 120;

function toScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(10, Math.max(0, value));
}

function toMovieId(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID_LENGTH ? value : null;
}

export function sanitizeRatings(raw: unknown): RatingInput[] {
  if (!Array.isArray(raw)) return [];
  const byMovie = new Map<string, RatingInput>();
  for (const item of raw.slice(0, MAX_RATINGS)) {
    if (!item || typeof item !== "object") continue;
    const { movieId, rating, ratedAt } = item as Record<string, unknown>;
    const id = toMovieId(movieId);
    const score = toScore(rating);
    if (id === null || score === null) continue;
    const date = typeof ratedAt === "string" && !Number.isNaN(Date.parse(ratedAt)) ? ratedAt : null;
    byMovie.set(id, { movieId: id, rating: score, ratedAt: date });
  }
  return [...byMovie.values()];
}

export function sanitizeCategoryRatings(raw: unknown): CategoryRatingInput[] {
  if (!Array.isArray(raw)) return [];
  const byKey = new Map<string, CategoryRatingInput>();
  for (const item of raw.slice(0, MAX_CATEGORY_RATINGS)) {
    if (!item || typeof item !== "object") continue;
    const { movieId, category, value } = item as Record<string, unknown>;
    const id = toMovieId(movieId);
    const score = toScore(value);
    if (id === null || score === null || typeof category !== "string" || !CATEGORY_KEYS.includes(category)) continue;
    byKey.set(`${id}|${category}`, { movieId: id, category, value: score });
  }
  return [...byKey.values()];
}

// 화면용 영화 ID → DB 키(CachedMovie.movieCd / CategoryRating.movieCd).
//   kobis-12345 → "12345", tmdb-123 / tmdb-tv-123 / kmdb-* → 그대로,
//   wikidata-Q123-작품상(수상작 카드) → "wikidata-Q123"
// 모르는 형식이면 null.
export function movieIdToCd(movieId: string): string | null {
  const kobis = /^kobis-(\d+)$/.exec(movieId);
  if (kobis) return kobis[1];
  if (/^tmdb-(tv-)?\d+$/.test(movieId) || movieId.startsWith("kmdb-")) return movieId;
  const wikidata = /^wikidata-Q\d+/.exec(movieId);
  return wikidata ? wikidata[0] : null;
}

// 평점 페이지가 있는 작품인지 — 서버가 평점을 받는 ID(movieIdToCd가 아는 형식: kobis-숫자, tmdb-숫자,
// tmdb-tv-숫자, kmdb-*, wikidata-Q숫자)면 평점을 남길 수 있다. 카드·코버플로우·다이어리가 모두 이 함수로
// 판단한다(예전엔 컴포넌트마다 목록이 달라 수상작(wikidata-*)이나 TMDB 영화가 "평점 준비중"으로 막혔다).
export function isRatableMovieId(movieId: string): boolean {
  return movieIdToCd(movieId) !== null;
}

// 평점 페이지 주소 — 시리즈는 /series, 나머지는 /movies. 카드·목록·알림이 모두 이 함수로 만든다
// (예전엔 컴포넌트마다 같은 조건식을 따로 써서, 한 곳만 고쳐지면 시리즈 링크가 /movies로 깨졌다).
export function rateHrefFor(movieId: string): string {
  return isSeriesCd(movieId) ? `/series/${movieId}/rate` : `/movies/${movieId}/rate`;
}

// 항목별 평점 페이지의 앞부분(…/rate/category) — 뒤에 "/<항목>"을 붙여 쓴다.
export function rateCategoryBase(movieId: string): string {
  return `${rateHrefFor(movieId)}/category`;
}

// DB 키 → 화면용 영화 ID. 숫자만 있는 KOBIS 코드에만 "kobis-"를 붙인다
// (tmdb-*·wikidata-* 앞에 붙이면 "kobis-tmdb-123" 같은 깨진 ID가 된다).
export function cdToMovieId(movieCd: string): string {
  return /^\d+$/.test(movieCd) ? `kobis-${movieCd}` : movieCd;
}

// 시리즈(TV) 작품인지 — 화면용 ID와 DB 키 모두 "tmdb-tv-"로 시작한다. 이 판단은 이 함수 하나만 쓴다.
export function isSeriesCd(movieCd: string): boolean {
  return movieCd.startsWith("tmdb-tv-");
}
