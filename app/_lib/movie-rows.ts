import { allMovies, type Movie } from "./mock-movies";
import { getSeedAverageRating } from "./reviews-store";

function overallSeedRating(movie: Movie): number {
  const short = getSeedAverageRating(movie.id, "short");
  const long = getSeedAverageRating(movie.id, "long");
  if (short === null && long === null) return 0;
  if (short === null) return long as number;
  if (long === null) return short;
  return (short + long) / 2;
}

function sortByRatingDesc(movies: Movie[]): Movie[] {
  return [...movies].sort((a, b) => overallSeedRating(b) - overallSeedRating(a));
}

function sortByDateDesc(movies: Movie[]): Movie[] {
  return [...movies].sort((a, b) => (a.releaseDate < b.releaseDate ? 1 : -1));
}

function releasedWithinYears(movies: Movie[], years: number): Movie[] {
  const cutoff = new Date();
  cutoff.setFullYear(cutoff.getFullYear() - years);
  const cutoffKey = cutoff.toISOString().slice(0, 10);
  return movies.filter((m) => m.releaseDate >= cutoffKey);
}

function releasedThisYear(movies: Movie[]): Movie[] {
  const year = new Date().getFullYear();
  return movies.filter((m) => m.releaseDate.startsWith(`${year}-`));
}

export function getNowShowing(): Movie[] {
  return allMovies.filter((m) => m.isNowShowing);
}

export function getRereleases(): Movie[] {
  return allMovies.filter((m) => m.isRerelease);
}

// 실제 추천 알고리즘 대신, 평점(70%) + 최신성(30%)을 섞은 목데이터 기반 추천
export function getRecommended(): Movie[] {
  const byDateDesc = sortByDateDesc(allMovies);
  const scored = allMovies.map((movie) => {
    const rating = overallSeedRating(movie);
    const rank = byDateDesc.findIndex((m) => m.id === movie.id);
    const recency = byDateDesc.length > 1 ? 10 - (rank / (byDateDesc.length - 1)) * 10 : 10;
    return { movie, score: rating * 0.7 + recency * 0.3 };
  });
  return scored
    .sort((a, b) => b.score - a.score)
    .map((s) => s.movie)
    .slice(0, 8);
}

export function getRecentMovies(): Movie[] {
  return sortByDateDesc(allMovies).slice(0, 8);
}

export function getMonthlyBest(): Movie[] {
  return sortByRatingDesc(getNowShowing());
}

export function getYearlyBest(): Movie[] {
  return sortByRatingDesc(releasedThisYear(allMovies));
}

export function getBestOf3Years(): Movie[] {
  return sortByRatingDesc(releasedWithinYears(allMovies, 3));
}

export function getBestOf5Years(): Movie[] {
  return sortByRatingDesc(releasedWithinYears(allMovies, 5));
}

export function getAllTimeBest(): Movie[] {
  return sortByRatingDesc(allMovies);
}
