// "로직은 고쳤는데 화면엔 여전히 옛날 결과가 보인다"를 확인하는 스크립트.
// CachedPerson(3일 TTL 인물 필모그래피 캐시)에 지금 실제로 뭐가 들어있는지, 언제
// 저장된 건지를 직접 보여준다 — 로직을 아무리 고쳐도 이 캐시가 예전 오염된 데이터를
// 들고 있으면 화면엔 반영되지 않는다(app/_lib/person-filmography.ts의
// getPersonFilmography가 TTL 안이면 이 값을 그대로 반환하기 때문).
//
// 실행 방법 (프로젝트 루트에서) — TypeScript라 tsx로 실행한다(없으면 npx가 그 자리에서
// 받아온다):
//   npx tsx scripts/inspect-cached-person.mts
//
// DATABASE_URL은 .env에서 그대로 읽는다(Neon 연결 문자열이 이미 들어있다고 하셨음).

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { configureNeon } from "../app/_lib/neon-config";

configureNeon(process.env.DATABASE_URL, { announce: true });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const NAMES = ["박정민", "안재홍"];

async function main() {
  const rows = await db.cachedPerson.findMany({ where: { name: { in: NAMES } } });

  if (rows.length === 0) {
    console.log(`CachedPerson에 ${NAMES.join(", ")}(으)로 캐시된 행이 하나도 없습니다.`);
    console.log("-> 캐시 문제는 아니고, 매번 새로 계산되고 있다는 뜻 — 로직 자체를 더 봐야 함.");
    return;
  }

  for (const row of rows) {
    const ageMs = Date.now() - row.updatedAt.getTime();
    const ageHours = (ageMs / (1000 * 60 * 60)).toFixed(1);
    const TTL_HOURS = 72;
    console.log(`\n=== ${row.name} ===`);
    console.log(`kmdbId: ${row.kmdbId}`);
    console.log(`role: ${row.role}`);
    console.log(`updatedAt: ${row.updatedAt.toISOString()} (${ageHours}시간 전, TTL=${TTL_HOURS}시간)`);
    console.log(`캐시 신선함(화면에 이 값 그대로 나감)? ${Number(ageHours) < TTL_HOURS ? "예 — 로직을 고쳐도 이 값이 계속 나간다" : "아니오 — 다음 조회 때 새로 계산됨"}`);
    const filmography = row.filmography as unknown as { title: string }[];
    console.log(`캐시된 영화 수: ${filmography.length}`);
    console.log(filmography.map((m) => m.title).join(", "));
  }

  console.log(`\n\n캐시가 오염돼 있고 지금 바로 새로 계산되게 하고 싶으면 이 행들을 지우세요:`);
  console.log(`  npx tsx -e "..."  대신 아래 SQL을 Neon SQL Editor / Prisma Studio에서 실행:`);
  console.log(`  DELETE FROM "CachedPerson" WHERE name IN ('박정민', '안재홍');`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
