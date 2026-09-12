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
  movieId: string;
  rating: number;  // 0-10 normalized
  ratedAt: string; // ISO
};

type IncomingCategoryRating = {
  movieId: string;
  category: string;
  value: number; // 0-10
};

type RequestBody = {
  myRatings: IncomingRating[];
  myCategoryRatings: IncomingCategoryRating[];
};

type UserProfile = {
  topGenres: string[];
  topDirectors: string[];
  topActors: string[];
  avoidedGenres: string[];
  avoidedDirectors: string[];
  categoryWeights: Record<string, number>;
  coldStart: boolean;
};

type DbMovie = {
  movieCd: string;
  title: string;
  posterUrl: string | null;
  genreAlt: string | null;
  directorName: string | null;
  cast: unknown;
};

type CandidateMovie = {
  movieCd: string;
  title: string;
  posterUrl: string | null;
  genreAlt: string | null;
  directorName: string | null;
  cast: { name: string }[];
  allGenres: string[];
  totalScore: number;
};

type LlmResult = { movieCd: string; score: number; reason: string }[];

// ─────────────────────────────────────────────────────
// 1. Temporal weighting
// ─────────────────────────────────────────────────────

// 최근 평가일수록, 높은/낮은 평점일수록 강하게 반영 (중립 5점은 거의 0에 수렴).
// 평가 개수가 적을수록 반감기를 길게 — 프로필이 급격히 흔들리지 않게.
function getTemporalWeight(rating: number, ratedAt: string, totalCount: number): number {
  const daysDiff = (Date.now() - new Date(ratedAt).getTime()) / 86400000;
  const halfLifeDays = totalCount < 10 ? 180 : totalCount < 30 ? 120 : 90;
  const timeWeight = Math.pow(0.5, daysDiff / halfLifeDays);
  return (rating - 5) * timeWeight; // -5~+5 범위
}

// ─────────────────────────────────────────────────────
// 2. Build user profile
// ─────────────────────────────────────────────────────

async function buildUserProfile(
  ratings: IncomingRating[],
  categoryRatings: IncomingCategoryRating[]
): Promise<UserProfile> {
  if (ratings.length === 0) {
    return { topGenres: [], topDirectors: [], topActors: [], avoidedGenres: [], avoidedDirectors: [], categoryWeights: {}, coldStart: true };
  }

  const movieCds = ratings
    .map((r) => r.movieId.replace(/^kobis-/, ""))
    .filter((cd) => /^\d+$/.test(cd));

  const cachedMovies = await db.cachedMovie.findMany({
    where: { movieCd: { in: movieCds } },
    select: { movieCd: true, genreAlt: true, directorName: true, cast: true },
  });
  const movieMeta = new Map(cachedMovies.map((m) => [m.movieCd, m]));

  const genreWeights = new Map<string, number>();
  const directorData = new Map<string, { score: number; count: number }>();
  const actorWeights = new Map<string, number>();

  for (const rating of ratings) {
    const movieCd = rating.movieId.replace(/^kobis-/, "");
    const meta = movieMeta.get(movieCd);
    if (!meta) continue;

    const w = getTemporalWeight(rating.rating, rating.ratedAt, ratings.length);

    for (const genre of splitGenres(meta.genreAlt)) {
      genreWeights.set(genre, (genreWeights.get(genre) ?? 0) + w);
    }
    if (meta.directorName) {
      const entry = directorData.get(meta.directorName) ?? { score: 0, count: 0 };
      entry.score += w;
      entry.count += 1;
      directorData.set(meta.directorName, entry);
    }
    const castArr = Array.isArray(meta.cast) ? (meta.cast as { name: string }[]) : [];
    for (const person of castArr.slice(0, 5)) {
      actorWeights.set(person.name, (actorWeights.get(person.name) ?? 0) + w);
    }
  }

  const topGenres = [...genreWeights.entries()]
    .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
  const avoidedGenres = [...genreWeights.entries()]
    .filter(([, s]) => s < 0).sort((a, b) => a[1] - b[1]).slice(0, 3).map(([g]) => g);

  const topDirectors = [...directorData.entries()]
    .filter(([, e]) => e.score > 0).sort((a, b) => b[1].score - a[1].score).slice(0, 5).map(([d]) => d);
  // 감독 기피는 데이터 2건 이상일 때만 — 단 1건의 낮은 평점으로 전체 감독을 블랙리스트에 넣지 않는다
  const avoidedDirectors = [...directorData.entries()]
    .filter(([, e]) => e.score < 0 && e.count >= 2).sort((a, b) => a[1].score - b[1].score).slice(0, 3).map(([d]) => d);

  const topActors = [...actorWeights.entries()]
    .filter(([, s]) => s > 0).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([a]) => a);

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
    categoryWeights[cat] = sum / count / 10;
  }

  return { topGenres, topDirectors, topActors, avoidedGenres, avoidedDirectors, categoryWeights, coldStart: false };
}

// ─────────────────────────────────────────────────────
// 3. Multi-channel candidate retrieval
// ─────────────────────────────────────────────────────

function parseCast(raw: unknown): { name: string }[] {
  return Array.isArray(raw) ? (raw as { name: string }[]) : [];
}

function toCandidate(m: DbMovie, score: number): CandidateMovie {
  return {
    movieCd: m.movieCd,
    title: m.title,
    posterUrl: m.posterUrl,
    genreAlt: m.genreAlt,
    directorName: m.directorName,
    cast: parseCast(m.cast),
    allGenres: splitGenres(m.genreAlt),
    totalScore: score,
  };
}

// Channel 1: 장르/감독 매칭 (Prisma ORM)
async function fetchByGenreDirector(profile: UserProfile, ratedMovieIds: Set<string>): Promise<DbMovie[]> {
  const conditions: object[] = [
    ...profile.topGenres.map((g) => ({ genreAlt: { contains: g } })),
    ...profile.topDirectors.map((d) => ({ directorName: d })),
  ];
  if (conditions.length === 0) return [];
  const rows = await db.cachedMovie.findMany({
    where: { posterUrl: { not: null }, OR: conditions },
    orderBy: { updatedAt: "desc" },
    take: 150,
    select: { movieCd: true, title: true, posterUrl: true, genreAlt: true, directorName: true, cast: true },
  });
  return rows.filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`)).slice(0, 100);
}

// Channel 1 보조: 배우 단독 매칭 (JSONB raw query — 배우 이름으로만 걸리는 영화도 포함)
async function fetchByActors(topActors: string[], ratedMovieIds: Set<string>): Promise<DbMovie[]> {
  if (topActors.length === 0) return [];
  // 배열 파라미터를 Prisma raw에 넘기기 위해 unnest 사용
  const rows = await db.$queryRaw<DbMovie[]>`
    SELECT DISTINCT "movieCd", "title", "posterUrl", "genreAlt", "directorName", "cast"
    FROM "CachedMovie"
    WHERE "posterUrl" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM jsonb_array_elements("cast"::jsonb) AS elem
        WHERE elem->>'name' = ANY(${topActors})
      )
    ORDER BY "updatedAt" DESC
    LIMIT 100
  `;
  return rows.filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`)).slice(0, 60);
}

// Channel 2: 항목별 선호 특화 (카테고리 가중치 최고 항목 기준)
async function fetchByCategory(profile: UserProfile, ratedMovieIds: Set<string>): Promise<DbMovie[]> {
  const cw = profile.categoryWeights;
  const maxEntry = Object.entries(cw).sort((a, b) => b[1] - a[1])[0];
  // 전체 항목이 고르거나 (최고값 < 0.5) → 채널 건너뜀
  if (!maxEntry || maxEntry[1] < 0.5) return [];

  const genreMap: Record<string, string[]> = {
    "연출": ["드라마", "스릴러", "SF", "범죄"],
    "편집": ["액션", "스릴러", "SF"],
    "각본": ["드라마", "미스터리", "스릴러"],
    "음악": ["뮤지컬", "애니메이션"],
    "연기": ["드라마", "멜로/로맨스"],
  };
  const targetGenres = genreMap[maxEntry[0]] ?? ["드라마"];

  const rows = await db.cachedMovie.findMany({
    where: { posterUrl: { not: null }, OR: targetGenres.map((g) => ({ genreAlt: { contains: g } })) },
    orderBy: { updatedAt: "desc" },
    take: 80,
    select: { movieCd: true, title: true, posterUrl: true, genreAlt: true, directorName: true, cast: true },
  });
  return rows.filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`)).slice(0, 60);
}

// Channel 3: 최근 2년 최신/인기작 (미관람 작 중 트렌딩)
async function fetchTrending(ratedMovieIds: Set<string>): Promise<DbMovie[]> {
  const twoYearsAgo = new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const rows = await db.cachedMovie.findMany({
    where: { posterUrl: { not: null }, releaseDate: { gte: twoYearsAgo } },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: { movieCd: true, title: true, posterUrl: true, genreAlt: true, directorName: true, cast: true },
  });
  return rows.filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`)).slice(0, 40);
}

// ─────────────────────────────────────────────────────
// 4. Candidate scoring
// ─────────────────────────────────────────────────────

function jaccard(movieGenres: string[], preferredSet: Set<string>): number {
  if (movieGenres.length === 0 || preferredSet.size === 0) return 0;
  const intersection = movieGenres.filter((g) => preferredSet.has(g)).length;
  const union = new Set([...movieGenres, ...preferredSet]).size;
  return intersection / union;
}

function scoreCandidateMovie(
  movie: CandidateMovie,
  profile: UserProfile,
  sets: {
    topGenreSet: Set<string>;
    topDirectorSet: Set<string>;
    topActorSet: Set<string>;
    avoidedGenreSet: Set<string>;
    avoidedDirectorSet: Set<string>;
  }
): number {
  const { topGenreSet, topDirectorSet, topActorSet, avoidedGenreSet, avoidedDirectorSet } = sets;

  const genreScore = jaccard(movie.allGenres, topGenreSet);
  const avoidedGenrePenalty = movie.allGenres.some((g) => avoidedGenreSet.has(g)) ? -0.3 : 0;

  const directorScore = movie.directorName
    ? topDirectorSet.has(movie.directorName) ? 1.0
      : avoidedDirectorSet.has(movie.directorName) ? -0.5
      : 0.0
    : 0.0;

  const actorOverlap = movie.cast.filter((a) => topActorSet.has(a.name)).length;
  const actorScore = Math.min(actorOverlap / 2, 1.0);

  // 항목별 선호도를 장르 프록시로 반영 (DB에 voteAverage/수상 데이터 없음)
  const cw = profile.categoryWeights;
  let categoryScore = 0;
  if ((cw["연출"] ?? 0) > 0.7 && ["드라마", "스릴러", "SF", "범죄"].some((g) => movie.allGenres.includes(g))) categoryScore += 0.5;
  if ((cw["편집"] ?? 0) > 0.7 && ["액션", "스릴러", "SF"].some((g) => movie.allGenres.includes(g))) categoryScore += 0.3;
  if ((cw["각본"] ?? 0) > 0.7 && ["드라마", "미스터리", "스릴러"].some((g) => movie.allGenres.includes(g))) categoryScore += 0.5;
  if ((cw["음악"] ?? 0) > 0.7 && (movie.allGenres.includes("뮤지컬") || movie.allGenres.includes("애니메이션"))) categoryScore += 0.5;
  if ((cw["연기"] ?? 0) > 0.7 && movie.allGenres.includes("드라마")) categoryScore += 0.3;
  categoryScore = Math.min(categoryScore, 1.0);

  const raw = 0.35 * genreScore + 0.25 * directorScore + 0.20 * actorScore + 0.20 * categoryScore + avoidedGenrePenalty;
  return Math.max(0, raw);
}

async function getCandidates(profile: UserProfile, ratedMovieIds: Set<string>): Promise<CandidateMovie[]> {
  // Cold start: 최신 영화 20편 그대로 반환
  if (profile.coldStart) {
    const recent = await db.cachedMovie.findMany({
      where: { posterUrl: { not: null }, releaseDate: { gte: new Date(Date.now() - 365 * 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10) } },
      orderBy: { updatedAt: "desc" },
      take: 25,
      select: { movieCd: true, title: true, posterUrl: true, genreAlt: true, directorName: true, cast: true },
    });
    return recent
      .filter((m) => !ratedMovieIds.has(`kobis-${m.movieCd}`))
      .slice(0, 20)
      .map((m) => toCandidate(m, 0));
  }

  // 3개 채널을 병렬로 가져오고 union (중복 제거)
  const [genreDirectorRows, actorRows, categoryRows, trendingRows] = await Promise.all([
    fetchByGenreDirector(profile, ratedMovieIds),
    fetchByActors(profile.topActors, ratedMovieIds),
    fetchByCategory(profile, ratedMovieIds),
    fetchTrending(ratedMovieIds),
  ]);

  const seen = new Set<string>();
  const all: DbMovie[] = [];
  for (const m of [...genreDirectorRows, ...actorRows, ...categoryRows, ...trendingRows]) {
    if (!seen.has(m.movieCd) && !ratedMovieIds.has(`kobis-${m.movieCd}`)) {
      seen.add(m.movieCd);
      all.push(m);
    }
  }

  const topGenreSet = new Set(profile.topGenres);
  const topDirectorSet = new Set(profile.topDirectors);
  const topActorSet = new Set(profile.topActors);
  const avoidedGenreSet = new Set(profile.avoidedGenres);
  const avoidedDirectorSet = new Set(profile.avoidedDirectors);
  const sets = { topGenreSet, topDirectorSet, topActorSet, avoidedGenreSet, avoidedDirectorSet };

  const scored = all.map((m) => {
    const candidate = toCandidate(m, 0);
    candidate.totalScore = scoreCandidateMovie(candidate, profile, sets);
    return candidate;
  });

  // 감독 1인당 최대 2편 제약 — LLM에 넘길 후보 풀의 쏠림 방지
  const directorCount = new Map<string, number>();
  const topN: CandidateMovie[] = [];
  for (const c of scored.sort((a, b) => b.totalScore - a.totalScore)) {
    const dir = c.directorName ?? "__unknown__";
    if ((directorCount.get(dir) ?? 0) >= 2) continue;
    directorCount.set(dir, (directorCount.get(dir) ?? 0) + 1);
    topN.push(c);
    if (topN.length >= 15) break;
  }
  return topN;
}

// ─────────────────────────────────────────────────────
// 5. LLM reranking (Haiku)
// ─────────────────────────────────────────────────────

async function callLlm(profile: UserProfile, candidates: CandidateMovie[]): Promise<LlmResult> {
  if (candidates.length === 0) return [];
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return [];

  const categoryDesc = Object.entries(profile.categoryWeights)
    .map(([cat, w]) => `${cat}: ${w >= 0.7 ? "매우 중시" : w >= 0.5 ? "중시" : "비중 낮음"}`)
    .join(", ");

  const profileSummary = {
    선호장르: profile.topGenres,
    기피장르: profile.avoidedGenres,
    선호감독: profile.topDirectors,
    기피감독: profile.avoidedDirectors,
    선호배우: profile.topActors.slice(0, 5),
    항목별선호도: categoryDesc || "없음",
  };

  const candidateList = candidates.map((c) => ({
    movieCd: c.movieCd,
    title: c.title,
    genres: c.allGenres,
    director: c.directorName,
    cast: c.cast.slice(0, 3).map((p) => p.name),
    initialScore: Math.round(c.totalScore * 100),
  }));

  const systemPrompt = `당신은 영화 추천 전문가입니다. 사용자 프로필과 후보 영화 목록을 보고 각 영화의 추천 점수(0~100)와 추천 이유를 작성하세요.

규칙:
- 응답은 JSON 배열만 반환 (다른 텍스트 없음)
- 형식: [{"movieCd":"...", "score":85, "reason":"...이유..."}, ...]
- score는 0~100 정수
- reason은 20~40자 한국어 한 문장 (사용자가 중시하는 항목을 자연스럽게 언급)
- initialScore는 1차 정량 점수(참고용) — 근거 없이 크게 뒤집지 말 것
- 기피 감독/장르 영화는 낮게 점수 부여
- 모든 후보 포함, score 내림차순 정렬`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: `사용자 프로필:\n${JSON.stringify(profileSummary, null, 2)}\n\n후보 영화:\n${JSON.stringify(candidateList, null, 2)}` }],
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
// 6. Final score blend + MMR diversity (→ Top 8)
// ─────────────────────────────────────────────────────

type ScoredCandidate = {
  candidate: CandidateMovie;
  finalScore: number;
  llmScore: number | undefined;
  reason: string | undefined;
};

function blendAndMMR(
  candidates: CandidateMovie[],
  llmMap: Map<string, { score: number; reason: string }>,
  limit: number
): ScoredCandidate[] {
  // 최종 점수 블렌딩 (LLM 변동성 완충: 정량 60% + LLM 40%)
  const scored: ScoredCandidate[] = candidates.map((c) => {
    const llm = llmMap.get(c.movieCd);
    const llmScore = llm?.score;
    const finalScore = llmScore !== undefined
      ? 0.6 * c.totalScore + 0.4 * (llmScore / 100)
      : c.totalScore;
    return { candidate: c, finalScore, llmScore, reason: llm?.reason };
  }).sort((a, b) => b.finalScore - a.finalScore);

  // MMR: 감독 1인당 최대 1편, 단일 장르 50% 상한
  const result: ScoredCandidate[] = [];
  const directorSeen = new Set<string>();
  const genreCount = new Map<string, number>();
  const genreCap = Math.floor(limit * 0.5);

  for (const item of scored) {
    if (result.length >= limit) break;
    const dir = item.candidate.directorName ?? "__unknown__";
    if (directorSeen.has(dir)) continue;
    if (item.candidate.allGenres.some((g) => (genreCount.get(g) ?? 0) >= genreCap)) continue;

    directorSeen.add(dir);
    for (const g of item.candidate.allGenres) genreCount.set(g, (genreCount.get(g) ?? 0) + 1);
    result.push(item);
  }
  return result;
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

  const movieCds = candidates.map((c) => c.movieCd);
  const [llmResults, metas] = await Promise.all([
    callLlm(profile, candidates).catch(() => [] as LlmResult),
    getMovieMetas(movieCds),
  ]);

  const llmMap = new Map(llmResults.map((r) => [r.movieCd, r]));
  const final = blendAndMMR(candidates, llmMap, 8);

  const results: RowMovie[] = final.map(({ candidate: c, finalScore, reason }) => {
    const meta = metas.get(c.movieCd);
    const rawScore = Math.round(100 * finalScore);
    const recommendScore = profile.coldStart
      ? undefined
      : Math.min(99, Math.max(1, rawScore));
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
      recommendReason: reason ?? undefined,
    };
  });

  return NextResponse.json({ results: results.filter((r) => r.posterUrl !== null) });
}

// Keep GET for backwards compatibility (returns empty)
export async function GET() {
  return NextResponse.json({ results: [] });
}
