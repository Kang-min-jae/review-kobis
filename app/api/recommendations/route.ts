import { NextResponse } from "next/server";
import { db } from "../../_lib/db";
import { getMovieMetas } from "../../_lib/movie-rate-info";
import { genreFields, splitGenres } from "../../_lib/movie-rows";
import type { RowMovie } from "../../_lib/movie-rows";

const FALLBACK_GRADIENT_VAL = "from-neutral-800 via-neutral-600 to-neutral-400";

// ─────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────

type IncomingRating = {
  movieId: string; // "kobis-XXXXXXXX"
  rating: number;  // 0-10 normalized
  ratedAt: string; // ISO
};

type IncomingCategoryRating = {
  movieId: string;
  category: string; // "연출"|"연기"|"각본"|"음악"|"편집"
  value: number;    // 0-10
};

type RequestBody = {
  myRatings: IncomingRating[];
  myCategoryRatings: IncomingCategoryRating[];
};

type UserProfile = {
  preferredGenres: string[];
  preferredDirectors: string[];
  preferredCast: string[];
  categoryWeights: Record<string, number>; // "연출"->0~1 etc.
  coldStart: boolean;
};

type CandidateMovie = {
  movieCd: string;
  title: string;
  posterUrl: string | null;
  genreAlt: string | null;
  directorName: string | null;
  cast: { name: string }[];
  allGenres: string[];
  genreScore: number;
  peopleScore: number;
  totalScore: number;
};

// ─────────────────────────────────────────────────────
// Build user profile from client-sent ratings
// ─────────────────────────────────────────────────────

async function buildUserProfile(
  ratings: IncomingRating[],
  categoryRatings: IncomingCategoryRating[]
): Promise<UserProfile> {
  const coldStart = ratings.length < 5;

  if (ratings.length === 0) {
    return {
      preferredGenres: [],
      preferredDirectors: [],
      preferredCast: [],
      categoryWeights: {},
      coldStart: true,
    };
  }

  // Extract movieCds from "kobis-XXXXXXXX" ids
  const movieCds = ratings
    .map((r) => r.movieId.replace(/^kobis-/, ""))
    .filter((cd) => /^\d+$/.test(cd));

  // Fetch movie metadata (genres, director, cast) from DB
  const cachedMovies = await db.cachedMovie.findMany({
    where: { movieCd: { in: movieCds } },
    select: { movieCd: true, genreAlt: true, directorName: true, cast: true },
  });
  const movieMeta = new Map(cachedMovies.map((m) => [m.movieCd, m]));

  // Weight genres by rating (higher rated = more weight)
  const genreWeights = new Map<string, number>();
  const directorCounts = new Map<string, number>();
  const castCounts = new Map<string, number>();

  for (const rating of ratings) {
    const movieCd = rating.movieId.replace(/^kobis-/, "");
    const meta = movieMeta.get(movieCd);
    if (!meta) continue;

    const weight = rating.rating / 10; // 0~1
    for (const genre of splitGenres(meta.genreAlt)) {
      genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + weight);
    }
    if (meta.directorName) {
      directorCounts.set(meta.directorName, (directorCounts.get(meta.directorName) ?? 0) + weight);
    }
    const castArr = Array.isArray(meta.cast)
      ? (meta.cast as { name: string }[])
      : [];
    for (const person of castArr.slice(0, 3)) {
      castCounts.set(person.name, (castCounts.get(person.name) ?? 0) + weight);
    }
  }

  const topGenres = [...genreWeights.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([g]) => g);

  const topDirectors = [...directorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([d]) => d);

  const topCast = [...castCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([c]) => c);

  // Category weights: average of user's category ratings normalized to 0~1
  const catSum = new Map<string, { sum: number; count: number }>();
  for (const cr of categoryRatings) {
    if (cr.category === "전체") continue;
    const entry = catSum.get(cr.category) ?? { sum: 0, count: 0 };
    entry.sum += cr.value;
    entry.count += 1;
    catSum.set(cr.category, entry);
  }
  const categoryWeights: Record<string, number> = {};
  for (const [cat, { sum, count }] of catSum) {
    categoryWeights[cat] = sum / count / 10; // normalize 0~10 to 0~1
  }

  return { preferredGenres: topGenres, preferredDirectors: topDirectors, preferredCast: topCast, categoryWeights, coldStart };
}

// ─────────────────────────────────────────────────────
// Get candidates from CachedMovie with scoring
// ─────────────────────────────────────────────────────

async function getCandidates(
  profile: UserProfile,
  ratedMovieIds: Set<string>
): Promise<CandidateMovie[]> {
  if (profile.preferredGenres.length === 0) {
    // Cold start or no genres: return recent movies with posters
    const recent = await db.cachedMovie.findMany({
      where: {
        posterUrl: { not: null },
        releaseDate: { gte: new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) },
      },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { movieCd: true, title: true, posterUrl: true, genreAlt: true, directorName: true, cast: true },
    });

    return recent
      .filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`))
      .slice(0, 20)
      .map((m) => ({
        movieCd: m.movieCd,
        title: m.title,
        posterUrl: m.posterUrl,
        genreAlt: m.genreAlt,
        directorName: m.directorName,
        cast: Array.isArray(m.cast) ? (m.cast as { name: string }[]) : [],
        allGenres: splitGenres(m.genreAlt),
        genreScore: 0,
        peopleScore: 0,
        totalScore: 0,
      }));
  }

  // Fetch genre-matching candidates
  const genreConditions = profile.preferredGenres.map((g) => ({
    genreAlt: { contains: g },
  }));

  const candidates = await db.cachedMovie.findMany({
    where: {
      posterUrl: { not: null },
      OR: genreConditions,
    },
    orderBy: { updatedAt: "desc" },
    take: 200,
    select: {
      movieCd: true,
      title: true,
      posterUrl: true,
      genreAlt: true,
      directorName: true,
      cast: true,
    },
  });

  const preferredGenreSet = new Set(profile.preferredGenres);
  const preferredDirectorSet = new Set(profile.preferredDirectors);
  const preferredCastSet = new Set(profile.preferredCast);

  const alpha = profile.coldStart ? 1.0 : 0.3;
  const beta = profile.coldStart ? 0.0 : 0.3;
  const gamma = profile.coldStart ? 0.0 : 0.4;

  const scored: CandidateMovie[] = [];
  const directorCount = new Map<string, number>();

  for (const m of candidates) {
    if (ratedMovieIds.has(`kobis-${m.movieCd}`)) continue;

    const allGenres = splitGenres(m.genreAlt);
    const matchingGenres = allGenres.filter((g) => preferredGenreSet.has(g)).length;
    const genreScore = allGenres.length > 0 ? matchingGenres / allGenres.length : 0;

    const castArr = Array.isArray(m.cast) ? (m.cast as { name: string }[]) : [];
    const directorMatch = m.directorName && preferredDirectorSet.has(m.directorName) ? 1 : 0;
    const castMatch =
      castArr.length > 0
        ? castArr.filter((c) => preferredCastSet.has(c.name)).length / Math.min(castArr.length, 5)
        : 0;
    const peopleScore = (directorMatch * 0.5 + castMatch * 0.5);

    // Diversity: max 2 films per director
    const director = m.directorName ?? "__unknown__";
    const dirCount = directorCount.get(director) ?? 0;
    if (dirCount >= 2) continue;
    directorCount.set(director, dirCount + 1);

    const totalScore = alpha * genreScore + beta * peopleScore + gamma * peopleScore;

    scored.push({
      movieCd: m.movieCd,
      title: m.title,
      posterUrl: m.posterUrl,
      genreAlt: m.genreAlt,
      directorName: m.directorName,
      cast: castArr,
      allGenres,
      genreScore,
      peopleScore,
      totalScore,
    });
  }

  return scored
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, 15);
}

// ─────────────────────────────────────────────────────
// LLM reranking with Claude
// ─────────────────────────────────────────────────────

type LlmResult = { movieCd: string; score: number; reason: string }[];

async function callLlm(profile: UserProfile, candidates: CandidateMovie[]): Promise<LlmResult> {
  if (candidates.length === 0) return [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const profileSummary = {
    선호장르: profile.preferredGenres,
    선호감독: profile.preferredDirectors,
    선호배우: profile.preferredCast.slice(0, 5),
    항목별선호도: profile.categoryWeights,
  };

  const candidateList = candidates.map((c) => ({
    movieCd: c.movieCd,
    title: c.title,
    genres: c.allGenres,
    director: c.directorName,
    cast: c.cast.slice(0, 3).map((p) => p.name),
  }));

  const systemPrompt = `당신은 영화 추천 전문가입니다. 사용자 프로필을 분석해 후보 영화들을 재순위화하고, 각 영화에 대해 추천 점수(0~100)와 추천 이유를 한 문장으로 작성하세요.

규칙:
- 응답은 반드시 JSON 배열만 반환하세요 (다른 텍스트 없음)
- 형식: [{"movieCd":"...", "score":85, "reason":"...이유..."}, ...]
- score는 0~100 정수
- reason은 20~40자 한국어 한 문장 (왜 이 사용자에게 맞는지)
- 모든 후보 영화를 포함하되 score 내림차순으로 정렬`;

  const userMessage = `사용자 프로필:
${JSON.stringify(profileSummary, null, 2)}

후보 영화 목록:
${JSON.stringify(candidateList, null, 2)}

위 사용자 프로필을 기반으로 각 영화를 재순위화하고 추천 이유를 작성해주세요.`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-opus-5",
        max_tokens: 2000,
        thinking: { type: "adaptive" },
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!res.ok) return [];

    const json = await res.json() as { content: { type: string; text: string }[] };
    const textBlock = json.content.find((b) => b.type === "text");
    if (!textBlock) return [];

    const raw = textBlock.text.trim();
    const jsonStr = raw.startsWith("[") ? raw : raw.slice(raw.indexOf("["));
    return JSON.parse(jsonStr) as LlmResult;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────
// POST /api/recommendations
// ─────────────────────────────────────────────────────

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = await request.json() as RequestBody;
  } catch {
    return NextResponse.json({ results: [] });
  }

  const { myRatings = [], myCategoryRatings = [] } = body;
  const ratedMovieIds = new Set(myRatings.map((r) => r.movieId));

  const profile = await buildUserProfile(myRatings, myCategoryRatings);
  const candidates = await getCandidates(profile, ratedMovieIds);

  if (candidates.length === 0) {
    return NextResponse.json({ results: [] });
  }

  // LLM reranking
  let llmResults: LlmResult = [];
  try {
    llmResults = await callLlm(profile, candidates);
  } catch {
    // fallback to score-sorted order
  }

  // Build final RowMovie list
  const movieCds = candidates.map((c) => c.movieCd);
  const metas = await getMovieMetas(movieCds);

  const llmMap = new Map(llmResults.map((r) => [r.movieCd, r]));

  // Sort by LLM score if available, else totalScore
  const sorted =
    llmResults.length > 0
      ? [...candidates].sort((a, b) => {
          const sa = llmMap.get(a.movieCd)?.score ?? 0;
          const sb = llmMap.get(b.movieCd)?.score ?? 0;
          return sb - sa;
        })
      : candidates;

  const results: RowMovie[] = sorted.slice(0, 8).map((c) => {
    const meta = metas.get(c.movieCd);
    const llm = llmMap.get(c.movieCd);
    const rawScore = llm?.score ?? Math.round(c.totalScore * 100);
    const recommendScore = Math.min(99, Math.max(1, rawScore));
    const { genre, allGenres } = genreFields(meta?.genreAlt ?? c.genreAlt);

    return {
      id: `kobis-${c.movieCd}`,
      title: c.title,
      posterUrl: meta?.posterUrl ?? c.posterUrl,
      gradient: FALLBACK_GRADIENT_VAL,
      isNowShowing: false,
      genre,
      allGenres,
      recommendScore,
      recommendReason: llm?.reason ?? undefined,
    };
  });

  // Filter out cards without posters
  const withPosters = results.filter((r) => r.posterUrl !== null);

  return NextResponse.json({ results: withPosters });
}

// Keep GET for backwards compatibility (returns empty)
export async function GET() {
  return NextResponse.json({ results: [] });
}
