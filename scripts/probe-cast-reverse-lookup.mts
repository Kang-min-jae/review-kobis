// findMoviesByCastKmdbId(person-filmography.ts에 새로 추가된 역방향 조회)를 실제
// DB에 대고 확인하는 스크립트. 세 가지를 보여준다:
//   1) CachedMovie에 지금 몇 편이나 캐싱돼 있는지(커버리지) — 이 방식은 캐싱된
//      영화 안에서만 찾을 수 있어서, 이 숫자가 작으면 효과가 제한적이다.
//   2) "파수꾼"이 CachedMovie에 이미 캐싱돼 있는지.
//   3) findMoviesByCastKmdbId(00045706, "배우")로 박정민을 조회했을 때 실제로
//      몇 편이 나오고, 그 안에 "파수꾼"이 포함되는지.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/probe-cast-reverse-lookup.mts

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { configureNeon } from "../app/_lib/neon-config";

// person-filmography.ts를 정적(static) import로 걸어두면 안 된다 — ES 모듈은 import문을
// 파일 내 위치와 무관하게 먼저 로드/실행하므로, 위 config()들이 실행되기도 전에
// person-filmography.ts가 연쇄로 app/_lib/db.ts를 로드하면서 process.env.DATABASE_URL을
// (아직 비어 있는 채로) 읽어버린다. config() 호출 뒤에 실행되도록 동적 import로 미룬다.

configureNeon(process.env.DATABASE_URL, { announce: true });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const TARGET_KMDB_ID = "00045706"; // 박정민
const TARGET_ROLE = "배우";
const WATCHMAN_TITLE = "파수꾼";

async function main() {
  console.log(`\n========== 1) CachedMovie 커버리지 ==========`);
  const total = await db.cachedMovie.count();
  console.log(`CachedMovie에 캐싱된 영화 총 개수: ${total}편`);
  if (total < 200) {
    console.log(
      `-> 아직 크지 않은 규모입니다. 이 역방향 조회는 "한 번이라도 영화 페이지를 열어봐서` +
        ` 캐싱된 영화" 안에서만 찾을 수 있어서, 지금 당장은 보완 효과가 제한적일 수 있습니다` +
        ` — 사이트를 쓰면 쓸수록(다양한 영화 페이지를 볼수록) 자연히 커버리지가 넓어지고` +
        ` 이 방식의 효과도 같이 커집니다.`
    );
  }

  console.log(`\n========== 2) "${WATCHMAN_TITLE}"이 CachedMovie에 있는지 ==========`);
  const watchmanRow = await db.cachedMovie.findFirst({ where: { title: WATCHMAN_TITLE } });
  if (watchmanRow) {
    console.log(`있음: movieCd=${watchmanRow.movieCd}`);
    console.log(`cast: ${JSON.stringify(watchmanRow.cast)}`);
    console.log(`directorKmdbId: ${watchmanRow.directorKmdbId}`);
  } else {
    console.log(`없음 — 이 영화 페이지를 한 번도 안 열어봐서 아직 캐싱이 안 된 상태입니다.`);
    console.log(`(사이트에서 "파수꾼"을 검색해서 그 영화 상세/평점 페이지를 한 번 열어보면 캐싱됩니다.)`);
  }

  console.log(`\n========== 3) findMoviesByCastKmdbId(${TARGET_KMDB_ID}, "${TARGET_ROLE}") 결과 ==========`);
  const { findMoviesByCastKmdbId } = await import("../app/_lib/person-filmography");
  const reverseRows = await findMoviesByCastKmdbId(TARGET_KMDB_ID, TARGET_ROLE);
  console.log(`역방향 조회로 찾은 영화 수: ${reverseRows.length}편`);
  console.log(reverseRows.map((r) => r.title).join(", "));
  console.log(`\n"${WATCHMAN_TITLE}" 포함 여부: ${reverseRows.some((r) => r.title === WATCHMAN_TITLE)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
