// find-correct-anjaehong-kmdbid.mts로 확인된 진짜 코드(00012168)를 PersonIdentityMapping에
// 등록하고, 잘못된 코드(00187551) 때문에 오염됐을 수 있는 캐시를 정리한다.
//
// 주의: 이 오염은 PersonIdentityMapping을 통한 게 아니라(그 테이블엔 안재홍 항목이
// 아예 없었다), withResolvedId가 이름만으로 resolvePersonId를 호출했을 때 KMDb
// rawSearch(관련도순 100건) 안에서 엉뚱한 동명이인(00187551)을 골라버린 경우다.
// 그래서 CachedMovie를 이름+잘못된 코드 기준으로 직접 훑어서 찾아야 한다.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/fix-anjaehong-identity.mts

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const NAME = "안재홍";
const ROLE = "배우" as const;
const WRONG_KMDB_ID = "00187551";
const CORRECT_KMDB_ID = "00012168";

type CastMember = { name: string; kmdbId: string | null };

async function main() {
  console.log(`\n========== 1) PersonIdentityMapping 등록 ==========`);
  const mapping = await db.personIdentityMapping.upsert({
    where: { personName_role: { personName: NAME, role: ROLE } },
    create: {
      personName: NAME,
      role: ROLE,
      kmdbId: CORRECT_KMDB_ID,
      note: "밤의 해변에서 혼자/조작된 도시/산나물 처녀/걷기왕 출연진 목록에서 교차 확인됨",
    },
    update: {
      kmdbId: CORRECT_KMDB_ID,
      note: "밤의 해변에서 혼자/조작된 도시/산나물 처녀/걷기왕 출연진 목록에서 교차 확인됨",
    },
  });
  console.log(`등록됨: ${mapping.personName} (${mapping.role}) -> kmdbId=${mapping.kmdbId}`);

  console.log(`\n========== 2) 잘못된 코드(${WRONG_KMDB_ID})로 오염된 CachedMovie 정리 ==========`);
  const allMovies = await db.cachedMovie.findMany();
  const contaminated = allMovies.filter((row) => {
    if (row.directorName === NAME && row.directorKmdbId === WRONG_KMDB_ID) return true;
    const cast = (row.cast as CastMember[] | null) ?? [];
    return cast.some((c) => c.name === NAME && c.kmdbId === WRONG_KMDB_ID);
  });
  if (contaminated.length === 0) {
    console.log("오염된 CachedMovie 없음.");
  } else {
    console.log(`오염된 CachedMovie ${contaminated.length}건 발견:`);
    for (const row of contaminated) {
      console.log(`  - "${row.title}" (movieCd=${row.movieCd}, 개봉연도=${row.releaseDate})`);
    }
    await db.cachedMovie.deleteMany({ where: { movieCd: { in: contaminated.map((r) => r.movieCd) } } });
    console.log(`-> ${contaminated.length}건 삭제(다음 방문 때 올바른 코드로 재계산됨).`);
  }

  console.log(`\n========== 3) CachedPerson 캐시 정리(양쪽 코드 모두) ==========`);
  const deleted = await db.cachedPerson.deleteMany({ where: { kmdbId: { in: [WRONG_KMDB_ID, CORRECT_KMDB_ID] } } });
  console.log(`CachedPerson ${deleted.count}건 삭제 — 다음 방문 때 새로 계산됩니다.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
