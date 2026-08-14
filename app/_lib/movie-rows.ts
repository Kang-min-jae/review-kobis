import { allMovies, type Movie } from "./mock-movies";
import {
  discoverMovies,
  getTmdbMovieInfo,
  getTrendingMoviesWeek,
  type TmdbMovieSummary,
} from "./tmdb";

export type RowMovie = {
  id: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
  isNowShowing: boolean;
};

// TMDB 카탈로그에서 온 영화는 로컬 그라디언트가 없으니 통일된 폴백을 쓴다.
const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toRowMovie(summary: TmdbMovieSummary): RowMovie {
  return {
    id: `tmdb-${summary.id}`,
    title: summary.title,
    posterUrl: summary.posterUrl,
    gradient: FALLBACK_GRADIENT,
    // TMDB 카탈로그 전체에 대한 실제 상영 시간표가 없어서 예매 플로우는 로컬 큐레이션
    // 영화(현재 상영중/재개봉)에만 연결한다.
    isNowShowing: false,
  };
}

export function getNowShowing(): Movie[] {
  return allMovies.filter((m) => m.isNowShowing);
}

export function getRereleases(): Movie[] {
  return allMovies.filter((m) => m.isRerelease);
}

// 로컬 큐레이션 영화를 화면에 낼 때는 TMDB에서 포스터만 찾아 붙인다 (제목 검색, 한글→영문 폴백).
export async function resolveLocalMovieCards(movies: Movie[]): Promise<RowMovie[]> {
  const infos = await Promise.all(
    movies.map((m) => getTmdbMovieInfo({ title: m.title, englishTitle: m.englishTitle }))
  );
  return movies.map((movie, i) => ({
    id: movie.id,
    title: movie.title,
    posterUrl: infos[i]?.posterUrl ?? null,
    gradient: movie.gradient,
    isNowShowing: movie.isNowShowing,
  }));
}

// "사용자 추천 영화" — 실제 개인화 추천 알고리즘 대신 TMDB 주간 트렌딩으로 대체.
export async function getRecommendedRow(): Promise<RowMovie[]> {
  const trending = await getTrendingMoviesWeek(8);
  return trending.map(toRowMovie);
}

// 최근 영화: 올해 개봉작 중 인기 많은 20편.
export async function getRecentMoviesRow(): Promise<RowMovie[]> {
  const year = new Date().getFullYear();
  const results = await discoverMovies(
    { sort_by: "popularity.desc", primary_release_year: String(year) },
    20
  );
  return results.map(toRowMovie);
}

// 이 달의 Best: 이번 달 개봉작 중 인기 많은 순.
export async function getMonthlyBestRow(): Promise<RowMovie[]> {
  const now = new Date();
  const gte = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const lte = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(lastDay)}`;
  const results = await discoverMovies(
    {
      sort_by: "popularity.desc",
      "primary_release_date.gte": gte,
      "primary_release_date.lte": lte,
    },
    10
  );
  return results.map(toRowMovie);
}

// 올해의 Best: 올해 개봉작 중 인기 많은 10편.
export async function getYearlyBestRow(): Promise<RowMovie[]> {
  const year = new Date().getFullYear();
  const results = await discoverMovies(
    { sort_by: "popularity.desc", primary_release_year: String(year) },
    10
  );
  return results.map(toRowMovie);
}

// 평가(투표수) 데이터가 vote_count 기준을 못 채우는 구간은 인기 순으로 남은 자리를 채운다.
async function getTopRatedWithinYears(
  years: number,
  limit: number,
  minVoteCount: string
): Promise<RowMovie[]> {
  const now = new Date();
  const gte = `${now.getFullYear() - years}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;

  const rated = await discoverMovies(
    {
      sort_by: "vote_average.desc",
      "vote_count.gte": minVoteCount,
      "primary_release_date.gte": gte,
    },
    limit
  );
  if (rated.length >= limit) return rated.map(toRowMovie);

  const popular = await discoverMovies(
    { sort_by: "popularity.desc", "primary_release_date.gte": gte },
    limit
  );
  const seen = new Set(rated.map((m) => m.id));
  const filler = popular.filter((m) => !seen.has(m.id));
  return [...rated, ...filler].slice(0, limit).map(toRowMovie);
}

export async function getBestOf3YearsRow(): Promise<RowMovie[]> {
  return getTopRatedWithinYears(3, 20, "200");
}

export async function getBestOf5YearsRow(): Promise<RowMovie[]> {
  return getTopRatedWithinYears(5, 20, "200");
}

export async function getAllTimeBestRow(): Promise<RowMovie[]> {
  const rated = await discoverMovies(
    { sort_by: "vote_average.desc", "vote_count.gte": "1000" },
    30
  );
  if (rated.length >= 30) return rated.map(toRowMovie);

  const popular = await discoverMovies({ sort_by: "popularity.desc" }, 30);
  const seen = new Set(rated.map((m) => m.id));
  const filler = popular.filter((m) => !seen.has(m.id));
  return [...rated, ...filler].slice(0, 30).map(toRowMovie);
}
