// 이미 DB에 저장된 영화를 한 번 훑어 성인물 표시(MovieModeration.adult)를 채운다.
// 판정 규칙은 app/_lib/adult-content.ts 한 곳에 있다(사이트가 상세 정보를 처음 불러올 때 쓰는 것과 같은 규칙).
//
// 실행 방법 (프로젝트 루트에서):
//   1) 먼저 결과만 보기(아무것도 쓰지 않음):  npx tsx scripts/judge-adult-movies.mts --dry-run
//   2) 저장:                                    npx tsx scripts/judge-adult-movies.mts
//
// 어느 DB에 붙는지: .env → .env.local 순서로 읽은 DATABASE_URL. 실행하면 맨 먼저 접속 대상(호스트)을 보여 준다.
// 로컬 DB가 아니면(운영 Neon 등) --confirm-host=<호스트>를 정확히 붙여야만 실행된다 — 실수로 운영 DB에 쓰지 않게.
//
// 옵션
//   --dry-run            판정 결과만 보여 주고 DB에 쓰지 않는다
//   --confirm-host=HOST  로컬이 아닌 DB에서 실행할 때 필수(예: --confirm-host=ep-xxx.ap-southeast-1.aws.neon.tech)
//   --tmdb-limit=N       TMDB 상세(성인 여부·키워드·제작사·투표 수)를 새로 받을 최대 편수(기본 3000, 0이면 안 받음)
//   --kobis-limit=N      KOBIS 상세(원래 장르·관람 등급)를 새로 받을 최대 편수(기본 0 — KOBIS는 하루 이용량이 3,000건이라
//                        사이트 몫을 남기고 하루 1,000편 정도씩 나눠 돌린다. 등급을 받은 영화는 다음 실행에서 건너뛴다)
//   --recheck            이미 판정한 영화도 다시 본다
//
// 외부 API 호출은 TMDB만 기본으로 쓴다(한 편에 한 번, 키워드는 같은 요청에 함께 받는다). 이미 판정한 영화는 건너뛴다.

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(`--${name}`);
const option = (name: string, fallback: number) => {
  const raw = args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
};
const DRY_RUN = flag("dry-run");
const RECHECK = flag("recheck");
const TMDB_LIMIT = option("tmdb-limit", 3000);
const KOBIS_LIMIT = option("kobis-limit", 0);
const confirmHost = args.find((a) => a.startsWith("--confirm-host="))?.split("=")[1] ?? "";

const { databaseHost, isLocalDatabase } = await import("../app/_lib/neon-config");
const url = process.env.DATABASE_URL;
const host = databaseHost(url);
console.error(`[judge] 접속 대상 DB: ${host || "(DATABASE_URL 없음)"} ${isLocalDatabase(url) ? "(로컬)" : "(원격)"}${DRY_RUN ? " — 미리 보기(쓰지 않음)" : ""}`);
if (!host) process.exit(1);
if (!isLocalDatabase(url) && confirmHost !== host) {
  console.error(`[judge] 로컬 DB가 아닙니다. 이 DB가 맞으면 --confirm-host=${host} 를 붙여 다시 실행하세요. 멈춥니다.`);
  process.exit(1);
}

const { db } = await import("../app/_lib/db");
const { adultContentReason, isTeenRestrictedGrade, MIN_TMDB_VOTES_TEEN_RESTRICTED } = await import("../app/_lib/adult-content");
const { saveAdultJudgment } = await import("../app/_lib/movie-moderation");
const { getTmdbMovieDetailsById } = await import("../app/_lib/tmdb");
const { fetchMovieDetailsByCd } = await import("../app/_lib/kobis");

const movies = await db.cachedMovie.findMany({
  select: { movieCd: true, title: true, titleEn: true, genreAlt: true, watchGrade: true, tmdbId: true, posterUrl: true },
  // 최근 개봉작부터(메인에 나올 가능성이 큰 영화부터 외부 조회 한도를 쓴다).
  orderBy: [{ releaseDate: { sort: "desc", nulls: "last" } }, { movieCd: "asc" }],
});
const existing = new Map(
  (await db.movieModeration.findMany({ select: { movieCd: true, adult: true, checkedAt: true, tmdbVoteCount: true, hidden: true } }).catch((error) => {
    console.error("[judge] MovieModeration 테이블을 읽지 못했습니다 — 마이그레이션(npm run migrate)을 먼저 적용하세요.", error instanceof Error ? error.message : error);
    process.exit(1);
  })).map((m) => [m.movieCd, m]),
);
console.error(`[judge] 저장된 영화 ${movies.length}편, 이미 판정 ${[...existing.values()].filter((m) => m.checkedAt).length}편`);

let tmdbBudget = TMDB_LIMIT;
let kobisBudget = KOBIS_LIMIT;
let tmdbFetched = 0;
let kobisFetched = 0;
let written = 0;
const adult: { movieCd: string; title: string; reason: string; watchGrade: string | null }[] = [];
const lowProfileTeen: string[] = [];
const keptTeen: string[] = [];

async function judge(movie: (typeof movies)[number]) {
  const prev = existing.get(movie.movieCd);
  const tmdbId = movie.tmdbId ?? (/^tmdb-\d+$/.test(movie.movieCd) ? movie.movieCd.slice("tmdb-".length) : null);
  let tmdb: Awaited<ReturnType<typeof getTmdbMovieDetailsById>> = null;
  if (tmdbId && tmdbBudget > 0 && (RECHECK || !prev?.checkedAt)) {
    tmdbBudget--;
    tmdb = await getTmdbMovieDetailsById(tmdbId).catch(() => null);
    if (tmdb) tmdbFetched++;
  }
  let kobisGenre: string | null = null;
  let watchGrade = movie.watchGrade;
  // 관람 등급을 아직 모르는 KOBIS 영화만(받으면 CachedMovie.watchGrade에 저장되므로 다음 실행은 이어서 남은 영화를 본다).
  if (/^\d+$/.test(movie.movieCd) && !watchGrade && kobisBudget > 0) {
    kobisBudget--;
    const info = await fetchMovieDetailsByCd(movie.movieCd).catch(() => null);
    if (info) {
      kobisFetched++;
      kobisGenre = info.genreAlt;
      watchGrade = info.watchGrade;
      if (watchGrade && !DRY_RUN) {
        await db.cachedMovie.update({ where: { movieCd: movie.movieCd }, data: { watchGrade }, select: { movieCd: true } }).catch(() => null);
      }
    }
  }
  const signals = {
    title: movie.title,
    titleEn: movie.titleEn,
    genres: [movie.genreAlt, kobisGenre, tmdb?.genre],
    watchGrade,
    tmdbAdult: tmdb?.adult,
    keywords: tmdb?.keywords,
    companies: tmdb?.companies,
    tmdbVoteCount: tmdb?.voteCount ?? prev?.tmdbVoteCount ?? null,
  };
  const reason = adultContentReason(signals);
  const votes = signals.tmdbVoteCount;
  if (reason) adult.push({ movieCd: movie.movieCd, title: movie.title, reason, watchGrade });
  else if (isTeenRestrictedGrade(watchGrade)) {
    if (!movie.posterUrl || (votes != null && votes < MIN_TMDB_VOTES_TEEN_RESTRICTED)) lowProfileTeen.push(movie.title);
    else keptTeen.push(movie.title);
  }
  // 바뀐 게 있을 때만 쓴다(성인물이거나, 투표 수를 새로 알았거나, 예전 판정을 고쳐야 할 때) — 수만 편을 모두 쓰지 않는다.
  const shouldWrite = reason !== null || tmdb !== null || (prev?.adult ?? false);
  if (shouldWrite && !DRY_RUN) {
    await saveAdultJudgment(movie.movieCd, signals, { complete: tmdb?.detailsLoaded === true });
    written++;
  }
}

const BATCH = 8;
for (let i = 0; i < movies.length; i += BATCH) {
  await Promise.all(movies.slice(i, i + BATCH).map(judge));
  if ((i / BATCH) % 250 === 0 && i > 0) console.error(`[judge] ${i}/${movies.length}…`);
}

const byKind = new Map<string, number>();
for (const a of adult) {
  const kind = a.reason.split(":")[0];
  byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
}
console.log("");
console.log(`판정한 영화: ${movies.length}편 (TMDB 새로 조회 ${tmdbFetched}편, KOBIS 새로 조회 ${kobisFetched}편)`);
console.log(`성인물로 걸린 영화: ${adult.length}편 — ${[...byKind].map(([k, n]) => `${k} ${n}`).join(", ") || "없음"}`);
console.log("예시(최대 20편):");
for (const a of adult.slice(0, 20)) console.log(`  - ${a.title} [${a.movieCd}] ← ${a.reason}`);
const teenAdult = adult.filter((a) => isTeenRestrictedGrade(a.watchGrade));
console.log(`청소년관람불가·18세 등급 중 성인물로 걸린 영화(잘못 걸린 게 없는지 확인용): ${teenAdult.length}편`);
for (const a of teenAdult.slice(0, 20)) console.log(`  - ${a.title} [${a.movieCd}] ← ${a.reason}`);
console.log(`이름 없는 청불(포스터 없음 또는 TMDB 투표 ${MIN_TMDB_VOTES_TEEN_RESTRICTED}개 미만 — 메인·추천에서만 빠짐): ${lowProfileTeen.length}편`);
console.log(`그대로 남는 청불 영화: ${keptTeen.length}편${keptTeen.length ? ` (예: ${keptTeen.slice(0, 10).join(", ")})` : ""}`);
console.log(DRY_RUN ? "미리 보기라 DB에 쓰지 않았습니다." : `MovieModeration에 ${written}편을 저장했습니다. 메인·추천 목록은 매일 오전 10시 예약 작업 때 반영돼요. 바로 반영하려면 /api/admin/revalidate-moderation 을 부르세요(x-admin-secret).`);
await db.$disconnect();
