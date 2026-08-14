import { allMovies, type Movie } from "./mock-movies";
import {
  discoverMovies,
  getTmdbMovieInfo,
  getTrendingMoviesWeek,
  getMovieRecommendations,
  type TmdbMovieSummary,
} from "./tmdb";
import { getWeeklyBoxOffice } from "./kofic";

export type RowMovie = {
  id: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
  isNowShowing: boolean;
  badge?: string;
};

// TMDB 카탈로그에서 온 영화는 로컬 그라디언트가 없으니 통일된 폴백을 쓴다.
const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function toRowMovie(summary: TmdbMovieSummary): RowMovie {
  return {
    id: `tmdb-${summary.id}`,
    title: summary.title,
    posterUrl: summary.posterUrl,
    gradient: FALLBACK_GRADIENT,
    // TMDB 카탈로그 전체에 대한 실제 상영 시간표가 없어서 기본은 예매 버튼을 숨긴다.
    // 로컬 큐레이션 상영작과 같은 영화로 확인되면 applyNowShowingOverrides가 true로 바꿔준다.
    isNowShowing: false,
  };
}

export function getNowShowing(): Movie[] {
  return allMovies.filter((m) => m.isNowShowing);
}

export function getRereleases(): Movie[] {
  return allMovies.filter((m) => m.isRerelease);
}

async function resolveLocalMovies(
  movies: Movie[]
): Promise<{ row: RowMovie; tmdbId: number | null }[]> {
  const infos = await Promise.all(
    movies.map((m) => getTmdbMovieInfo({ title: m.title, englishTitle: m.englishTitle }))
  );
  return movies.map((movie, i) => ({
    row: {
      id: movie.id,
      title: movie.title,
      posterUrl: infos[i]?.posterUrl ?? null,
      gradient: movie.gradient,
      isNowShowing: movie.isNowShowing,
    },
    tmdbId: infos[i]?.id ?? null,
  }));
}

// 로컬 큐레이션 영화를 화면에 낼 때는 TMDB에서 포스터만 찾아 붙인다 (제목 검색, 한글→영문 폴백).
export async function resolveLocalMovieCards(movies: Movie[]): Promise<RowMovie[]> {
  const resolved = await resolveLocalMovies(movies);
  return resolved.map((r) => r.row);
}

// 현재 상영중인 로컬 영화의 TMDB id → 로컬 카드 매핑. TMDB 카탈로그 행(최근/이달/올해/…)에
// 같은 영화가 섞여 나올 때, tmdb-<id> 카드 대신 예매 버튼이 붙은 로컬 카드로 바꿔치기하는 데 쓴다.
export async function getLocalNowShowingByTmdbId(): Promise<Map<number, RowMovie>> {
  const resolved = await resolveLocalMovies(getNowShowing());
  const map = new Map<number, RowMovie>();
  for (const { row, tmdbId } of resolved) {
    if (tmdbId != null) map.set(tmdbId, row);
  }
  return map;
}

// tmdb-<id> 카드 중 실제로 우리 상영작 목록에 있는 영화는 로컬 카드(예매 버튼 포함)로 교체한다.
// 원래 카드에 badge(순위 등)가 있었다면 교체된 카드에도 이어서 보여준다.
export function applyNowShowingOverrides(
  movies: RowMovie[],
  nowShowingMap: Map<number, RowMovie>
): RowMovie[] {
  if (nowShowingMap.size === 0) return movies;
  return movies.map((movie) => {
    if (!movie.id.startsWith("tmdb-")) return movie;
    const tmdbId = Number(movie.id.slice("tmdb-".length));
    const localMatch = nowShowingMap.get(tmdbId);
    if (!localMatch) return movie;
    return { ...localMatch, badge: movie.badge ?? localMatch.badge };
  });
}

// 이번 주 박스오피스 TOP N (실제 국내 관객수 기준, KOFIC 주간 박스오피스).
// KOFIC은 포스터가 없어서 TMDB에서 제목으로 찾아 붙이고, 못 찾으면(평점 페이지로 연결할
// 방법이 없어서) 그 항목은 건너뛴다.
export async function getWeeklyBoxOfficeRow(): Promise<RowMovie[]> {
  const entries = await getWeeklyBoxOffice(10);
  if (entries.length === 0) return [];

  const infos = await Promise.all(entries.map((entry) => getTmdbMovieInfo({ title: entry.movieNm })));

  const rows: RowMovie[] = [];
  entries.forEach((entry, i) => {
    const info = infos[i];
    if (!info) return;
    rows.push({
      id: `tmdb-${info.id}`,
      title: entry.movieNm,
      posterUrl: info.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: false,
      badge: `${entry.rank}위 · 누적 ${entry.audiAcc.toLocaleString("ko-KR")}명`,
    });
  });
  return rows;
}

// "사용자 추천 영화" — 내가 높게 평가한 영화들을 시드로 TMDB recommendations 조회.
// 평가한 영화가 아직 없으면 TMDB 주간 트렌딩으로 대체.
export async function getRecommendedForRatedRow(seedTmdbIds: number[]): Promise<RowMovie[]> {
  if (seedTmdbIds.length === 0) {
    const trending = await getTrendingMoviesWeek(8);
    return trending.map(toRowMovie);
  }
  const recommendations = await getMovieRecommendations(seedTmdbIds, 8);
  return recommendations.map(toRowMovie);
}

// 최근 영화: 올해 개봉작 중 인기(누적 관객 수 대신 TMDB 인기도 지표를 사용) 많은 20편.
// region: "KR"로 한국 기준 개봉일을 사용해 국내 개봉 시점에 더 맞게 필터링한다.
export async function getRecentMoviesRow(): Promise<RowMovie[]> {
  const year = new Date().getFullYear();
  const results = await discoverMovies(
    { sort_by: "popularity.desc", primary_release_year: String(year), region: "KR" },
    20
  );
  return results.map(toRowMovie);
}

// 이 달의 Best: 이번 달 개봉작 중 인기 많은 5편.
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
      region: "KR",
    },
    5
  );
  return results.map(toRowMovie);
}

// 올해의 Best: 올해 개봉작 중 인기 많은 10편.
export async function getYearlyBestRow(): Promise<RowMovie[]> {
  const year = new Date().getFullYear();
  const results = await discoverMovies(
    { sort_by: "popularity.desc", primary_release_year: String(year), region: "KR" },
    10
  );
  return results.map(toRowMovie);
}

// N년 이내 개봉작 중 인기 많은 순. 사이트 자체 평점 데이터가 아직 충분히 쌓이지 않아
// TMDB 평점(vote_average) 대신 인기도(popularity, 누적 조회·관심도 지표)로 정렬한다.
async function getPopularWithinYears(years: number, limit: number): Promise<RowMovie[]> {
  const now = new Date();
  const gte = `${now.getFullYear() - years}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
  const results = await discoverMovies(
    { sort_by: "popularity.desc", "primary_release_date.gte": gte, region: "KR" },
    limit
  );
  return results.map(toRowMovie);
}

export async function getBestOf3YearsRow(): Promise<RowMovie[]> {
  return getPopularWithinYears(3, 20);
}

export async function getBestOf5YearsRow(): Promise<RowMovie[]> {
  return getPopularWithinYears(5, 30);
}

export async function getAllTimeBestRow(): Promise<RowMovie[]> {
  const results = await discoverMovies({ sort_by: "popularity.desc", region: "KR" }, 30);
  return results.map(toRowMovie);
}

// 해외 Best: 원어가 한국어가 아닌 영화 중 인기 많은 10편. TMDB discover에는 "특정 언어 제외"
// 파라미터가 없어서, 넉넉히 가져온 뒤 한국어(ko) 원작만 걸러낸다.
export async function getInternationalBestRow(): Promise<RowMovie[]> {
  const results = await discoverMovies({ sort_by: "popularity.desc" }, 40);
  const foreign = results.filter((m) => m.originalLanguage !== "ko").slice(0, 10);
  return foreign.map(toRowMovie);
}

// TMDB 공식 장르 id (https://api.themoviedb.org/3/genre/movie/list 기준, 안정적으로 고정된 값).
export const GENRE_IDS: Record<string, number> = {
  액션: 28,
  스릴러: 53,
  로맨스: 10749,
  드라마: 18,
  애니메이션: 16,
  모험: 12,
  SF: 878,
  공포: 27,
};

export async function getGenreRow(genreLabel: string): Promise<RowMovie[]> {
  const genreId = GENRE_IDS[genreLabel];
  if (!genreId) return [];
  const results = await discoverMovies(
    { sort_by: "popularity.desc", with_genres: String(genreId), region: "KR" },
    20
  );
  return results.map(toRowMovie);
}
