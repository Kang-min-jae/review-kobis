// PersonFilmographyOverride 관리용 CLI. 자동 매칭(동명이인 구분, KOBIS 교차검증 등)이
// 못 잡아내는 경우 — 특히 KMDb 원본 데이터 자체가 틀린 경우, 우리 로직으론 못 고친다 —
// 사람이 직접 "이 인물의 이 영화는 빼라/넣어라"를 등록해두는 수동 안전장치.
// 등록해두면 그 인물 페이지가 다음에 캐시를 새로 채울 때(또는 캐시를 지운 뒤) 반영된다.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/manage-filmography-override.mts add <personKmdbId> <movieCd> exclude "사유"
//   npx tsx scripts/manage-filmography-override.mts add <personKmdbId> <movieCd> include "사유"
//   npx tsx scripts/manage-filmography-override.mts remove <personKmdbId> <movieCd>
//   npx tsx scripts/manage-filmography-override.mts list [personKmdbId]

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

async function main() {
  const [, , cmd, ...args] = process.argv;

  if (cmd === "add") {
    const [personKmdbId, movieCd, action, reason] = args;
    if (!personKmdbId || !movieCd || (action !== "exclude" && action !== "include")) {
      console.error('사용법: add <personKmdbId> <movieCd> exclude|include "사유"');
      process.exitCode = 1;
      return;
    }
    const row = await db.personFilmographyOverride.upsert({
      where: { personKmdbId_movieCd: { personKmdbId, movieCd } },
      create: { personKmdbId, movieCd, action: action.toUpperCase() as "EXCLUDE" | "INCLUDE", reason: reason ?? null },
      update: { action: action.toUpperCase() as "EXCLUDE" | "INCLUDE", reason: reason ?? null },
    });
    console.log("등록됨:", row);
    console.log(
      "\n주의: 이 인물의 CachedPerson이 이미 캐시돼 있으면(3일 TTL) 바로 반영 안 됩니다 —"
    );
    console.log('  npx tsx scripts/clean-cached-persons.mts 로 해당 인물 캐시를 지우거나 TTL이 지나야 다음 조회에 반영됩니다.');
    return;
  }

  if (cmd === "remove") {
    const [personKmdbId, movieCd] = args;
    if (!personKmdbId || !movieCd) {
      console.error("사용법: remove <personKmdbId> <movieCd>");
      process.exitCode = 1;
      return;
    }
    await db.personFilmographyOverride.delete({ where: { personKmdbId_movieCd: { personKmdbId, movieCd } } });
    console.log("삭제됨.");
    return;
  }

  if (cmd === "list") {
    const [personKmdbId] = args;
    const rows = await db.personFilmographyOverride.findMany({
      where: personKmdbId ? { personKmdbId } : undefined,
      orderBy: { createdAt: "desc" },
    });
    console.table(rows.map((r) => ({ personKmdbId: r.personKmdbId, movieCd: r.movieCd, action: r.action, reason: r.reason })));
    return;
  }

  console.error("사용법:");
  console.error('  add <personKmdbId> <movieCd> exclude|include "사유"');
  console.error("  remove <personKmdbId> <movieCd>");
  console.error("  list [personKmdbId]");
  process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
