// PersonIdentityMapping에 이미 동명이인 문제가 실제로 확인된 이름들을 시드로
// 등록한다. kmdbId는 이 대화에서 사용자님이 probe-kmdb-person-search.mjs로 직접
// 확인해준 실제 값이다(추측 아님) — 유명한 쪽(credit 수가 훨씬 많고 최근까지
// 활동 중인 쪽)을 채택했다.
//   - 박정민(배우): kmdbId=00045706 (credit 20, 2011~2025) — 동명이인 kmdbId=00195313(credit 2)와 구분
//   - 안재홍(배우): kmdbId=00012168 (실제 출연 확인된 영화 4편 — 밤의 해변에서 혼자/
//     조작된 도시/산나물 처녀/걷기왕 — 의 출연진 목록에서 직접 읽어 교차 확인됨.
//     이전에 잘못 쓰던 00187551은 전혀 다른 동명이인의 코드였다 — 그 코드로는
//     1996~2014년의 완전히 다른 8편만 나왔고 실제 프로필과 하나도 안 겹쳤다.)
//   - 황정민(배우): kmdbId=00007364 (credit 24, "Hwang Jung-min") — 동명이인 kmdbId=00037870("Hwang Jeong-min")와 구분
//
// koficPeopleCd는 KOFIC 영화인 상세정보 API 구조가 아직 완전히 검증되지 않아
// 비워뒀다 — scripts/probe-kofic-people.mjs 실행 결과로 확인되면 채워 넣을 것.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/seed-person-mapping.mts

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

const SEEDS: { personName: string; role: "감독" | "배우"; kmdbId: string; note: string }[] = [
  {
    personName: "박정민",
    role: "배우",
    kmdbId: "00045706",
    note: "동명이인 kmdbId=00195313(credit 2)와 혼동되던 사례 — 이쪽이 실제 유명 배우(credit 20, 2011~2025)",
  },
  {
    personName: "안재홍",
    role: "배우",
    kmdbId: "00012168",
    note:
      "실제 출연이 확인된 영화 4편(밤의 해변에서 혼자/조작된 도시/산나물 처녀/걷기왕)의 " +
      "출연진 목록에서 직접 교차 확인된 kmdbId. 이전에 잘못 쓰던 00187551은 전혀 다른 " +
      "동명이인(1996~2014년의 무관한 영화들)의 코드였다.",
  },
  {
    personName: "황정민",
    role: "배우",
    kmdbId: "00007364",
    note: "동명이인 kmdbId=00037870(credit 4, 영문표기 Hwang Jeong-min)와 혼동되던 사례 — 이쪽이 실제 유명 배우(credit 24)",
  },
];

async function main() {
  for (const seed of SEEDS) {
    const row = await db.personIdentityMapping.upsert({
      where: { personName_role: { personName: seed.personName, role: seed.role } },
      create: { personName: seed.personName, role: seed.role, kmdbId: seed.kmdbId, note: seed.note },
      update: { kmdbId: seed.kmdbId, note: seed.note },
    });
    console.log(`등록: ${row.personName} (${row.role}) -> kmdbId=${row.kmdbId}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
