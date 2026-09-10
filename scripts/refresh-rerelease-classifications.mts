// "재개봉 칸"(최근 재개봉작/인기 재개봉작/재개봉 명작)에 쓸 신작·재개봉 판정을 하루
// 1회 배치로 미리 계산해 RereleaseClassification에 저장한다. 이 판정은 영화 한 편당
// KMDb 검색 + KOBIS 원 개봉 대조까지 필요해 비용이 커서, movie-rows.ts는 절대 요청마다
// 이 계산을 다시 하지 않고 여기서 저장해둔 값만 읽는다.
//
// 후보 수집(기본, 인자 없이 실행): (1) 최근 60일 안에 개봉 등록된 영화(카탈로그
// 스캔 — 박스오피스 순위에 없어도 실제로 상영 중인 재개봉작을 놓치지 않기 위함) +
// (2) 이번 주 박스오피스 TOP10(카탈로그 창 밖에 있어도, 오래 상영 중인 인기작을
// 놓치지 않기 위함이자 "인기 재개봉작" 정렬에 쓸 누적 관객수 확보용).
// 이 기본 모드는 "지금 상영 중이거나 최근에 상영했던" 재개봉작만 찾는다 — 예전에
// 재개봉했지만 지금은 상영이 끝난 작품은 애초에 후보에 안 들어가서 절대 안 잡힌다.
// 그런 과거 이력까지 찾으려면 --since <year> 백필 모드를 한 번 돌려야 한다: 연도별로
// KOBIS 카탈로그를 훑어서(한 번의 API 호출은 최대 500건까지만 주므로 연도마다 따로
// 호출) 그 시점 이후 개봉 등록된 모든 영화를 후보로 삼는다. 한 번 재개봉으로 판정된
// 영화는 DB에 영구히 남으므로(다시 상영 안 해도 사라지지 않음), 백필은 "그동안
// 놓친 과거 재개봉작을 한 번에 찾아 채워 넣는" 용도로 딱 한 번(또는 가끔) 돌리면
// 되고, 이후엔 기본 모드로 매일 최신 것만 유지하면 된다. 다만 연도 범위가 넓을수록
// 후보가 수백~수천 편이 되어 KMDb/KOBIS 호출이 그만큼 늘어나므로 시간이 오래 걸린다.
// 이미 "수동 확정"(manualConfirmed)된 영화는 사람이 직접 검수한 값이라 배치가
// 덮어쓰지 않고 건너뛴다.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/refresh-rerelease-classifications.mts            # 매일 돌리는 기본 모드
//   npx tsx scripts/refresh-rerelease-classifications.mts --since 2015  # 2015년 이후 과거 이력 백필

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { searchMovieCatalog, getWeeklyBoxOffice, type KobisMovieSummary } from "../app/_lib/kobis";
import { classifyRerelease } from "../app/_lib/rerelease-classifier";

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const CANDIDATE_WINDOW_DAYS = 60;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function isoDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

type Candidate = { movieCd: string; title: string; titleEn: string | null; openDate: string | null; director: string | null };

async function collectCandidates(
  sinceYear?: number
): Promise<{ candidates: Candidate[]; audiAccByCd: Map<string, number> }> {
  const now = new Date();
  const byCd = new Map<string, Candidate>();

  if (sinceYear) {
    // 백필 모드: 연도별로 나눠 훑는다 — searchMovieCatalog 한 번의 호출은 최대 500건까지만
    // 주기 때문에, 여러 해를 한 번에 넘기면 개봉작이 많은 해의 영화가 500건 밖으로
    // 밀려나 누락될 수 있다.
    for (let year = sinceYear; year <= now.getFullYear(); year++) {
      const yearStr = String(year);
      const pool = await searchMovieCatalog({ openStartDt: yearStr, openEndDt: yearStr }, 500);
      for (const m of pool) {
        byCd.set(m.movieCd, { movieCd: m.movieCd, title: m.title, titleEn: m.titleEn, openDate: m.openDate, director: m.director });
      }
      console.log(`  ${year}년: ${pool.length}편 조회됨 (누적 후보 ${byCd.size}편)`);
    }
  } else {
    const windowStart = new Date(now);
    windowStart.setDate(windowStart.getDate() - CANDIDATE_WINDOW_DAYS);
    const pool = await searchMovieCatalog(
      { openStartDt: windowStart.getFullYear().toString(), openEndDt: now.getFullYear().toString() },
      500
    );
    const recentlyOpened = pool.filter(
      (m) => m.openDate && m.openDate >= isoDate(windowStart) && m.openDate <= isoDate(now)
    );
    for (const m of recentlyOpened) {
      byCd.set(m.movieCd, { movieCd: m.movieCd, title: m.title, titleEn: m.titleEn, openDate: m.openDate, director: m.director });
    }
  }

  const weekly = await getWeeklyBoxOffice(10);
  const audiAccByCd = new Map<string, number>();
  for (const w of weekly) {
    if (!w.movieCd) continue;
    audiAccByCd.set(w.movieCd, w.audiAcc);
    if (!byCd.has(w.movieCd)) {
      byCd.set(w.movieCd, { movieCd: w.movieCd, title: w.movieNm, titleEn: null, openDate: w.openDate, director: null });
    }
  }

  return { candidates: Array.from(byCd.values()), audiAccByCd };
}

async function main() {
  const sinceFlagIndex = process.argv.indexOf("--since");
  let sinceYear: number | undefined;
  if (sinceFlagIndex !== -1) {
    sinceYear = Number(process.argv[sinceFlagIndex + 1]);
    if (!sinceYear || Number.isNaN(sinceYear)) {
      console.error("사용법: npx tsx scripts/refresh-rerelease-classifications.mts --since <year>  (예: --since 2015)");
      process.exitCode = 1;
      return;
    }
  }

  console.log(
    sinceYear
      ? `${sinceYear}년부터 지금까지 과거 이력을 훑는 백필 모드로 후보를 수집합니다. 편수가 많으면 꽤 오래 걸릴 수 있어요...`
      : "후보 영화 목록 수집 중..."
  );
  const { candidates, audiAccByCd } = await collectCandidates(sinceYear);
  console.log(`후보 ${candidates.length}편.`);

  const manuallyConfirmed = await db.rereleaseClassification.findMany({
    where: { movieCd: { in: candidates.map((c) => c.movieCd) }, manualConfirmed: true },
    select: { movieCd: true },
  });
  const confirmedSet = new Set(manuallyConfirmed.map((r) => r.movieCd));
  const toClassify = candidates.filter((c) => !confirmedSet.has(c.movieCd));
  console.log(`수동 확정 ${confirmedSet.size}편은 건너뛰고, ${toClassify.length}편 새로 판정합니다.`);

  let rereleaseCount = 0;
  let newReleaseCount = 0;
  let unclassifiedCount = 0;
  const unclassifiedTitles: string[] = [];

  // KMDb/KOBIS 양쪽에 요청이 몰리지 않도록 적당한 크기로 나눠 순차 처리한다.
  const BATCH_SIZE = 5;
  for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
    const chunk = toClassify.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(async (movie) => {
        const result = await classifyRerelease(
          movie as Pick<KobisMovieSummary, "movieCd" | "title" | "openDate" | "titleEn"> & { director?: string | null }
        );
        if (result.status === "unclassified") {
          unclassifiedCount += 1;
          unclassifiedTitles.push(`${movie.title} (${movie.movieCd})`);
        } else if (result.isRerelease) {
          rereleaseCount += 1;
        } else {
          newReleaseCount += 1;
        }

        await db.rereleaseClassification.upsert({
          where: { movieCd: movie.movieCd },
          create: {
            movieCd: movie.movieCd,
            movieTitle: movie.title,
            isRerelease: result.isRerelease,
            originalYear: result.originalYear,
            rereleaseDate: result.rereleaseDate,
            genreAlt: result.genreAlt,
            audiAcc: audiAccByCd.get(movie.movieCd) ?? null,
            status: result.status,
            source: result.source ?? "unclassified",
          },
          update: {
            movieTitle: movie.title,
            isRerelease: result.isRerelease,
            originalYear: result.originalYear,
            rereleaseDate: result.rereleaseDate,
            genreAlt: result.genreAlt,
            audiAcc: audiAccByCd.get(movie.movieCd) ?? null,
            status: result.status,
            source: result.source ?? "unclassified",
            syncedAt: new Date(),
          },
        });
      })
    );
  }

  console.log(`\n완료: 재개봉 ${rereleaseCount}편 · 신작 ${newReleaseCount}편 · 미분류(수동 검수 필요) ${unclassifiedCount}편`);
  if (unclassifiedTitles.length > 0) {
    console.log("\n미분류(자동 판정 근거 없음) — scripts/manage-rerelease-override.mts로 수동 확정하세요:");
    unclassifiedTitles.forEach((t) => console.log(`  - ${t}`));
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
