// 안재홍(배우, kmdbId=00187551) 필모그래피가 실제 43편 안팎인데 사이트엔 3편만
// 나오는 문제의 원인을 단계별로 확인하는 진단 스크립트. 지난번 회귀(71->29->33편)가
// 추측성 수정 때문에 반복됐던 걸 감안해서, 이번엔 각 발견 경로(KMDb/KOFIC/역방향 조회/
// 매핑/오버라이드)의 결과를 하나씩 따로 찍어서 어느 단계에서 몇 편이 빠지는지부터
// 눈으로 확인한다.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/probe-anjaehong-filmography.mts

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { configureNeon } from "../app/_lib/neon-config";

configureNeon(process.env.DATABASE_URL, { announce: true });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const NAME = "안재홍";
const KMDB_ID = "00187551";
const ROLE = "배우" as const;

function normalize(s: string): string {
  return s.replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

async function main() {
  // config() 호출 이후에 실행되도록 앱 코드 import는 전부 동적 import로 미룬다
  // (app/_lib/db.ts가 모듈 로드 시점에 process.env.DATABASE_URL을 읽기 때문 —
  // probe-cast-reverse-lookup.mts에서 겪은 것과 같은 원인).
  const { searchKmdbFilmography } = await import("../app/_lib/kmdb");
  const { searchKoficPeopleList } = await import("../app/_lib/kobis");
  const { findMoviesByCastKmdbId, getPersonFilmography } = await import("../app/_lib/person-filmography");

  console.log(`\n========== 0) PersonIdentityMapping / PersonFilmographyOverride 확인 ==========`);
  const mapping = await db.personIdentityMapping.findUnique({
    where: { personName_role: { personName: NAME, role: ROLE } },
  });
  console.log(`매핑: ${mapping ? `kmdbId=${mapping.kmdbId} (${mapping.note ?? "메모 없음"})` : "없음"}`);
  const overrides = await db.personFilmographyOverride.findMany({ where: { personKmdbId: KMDB_ID } });
  console.log(`PersonFilmographyOverride: 총 ${overrides.length}건`);
  for (const o of overrides) console.log(`  - ${o.action} movieCd=${o.movieCd} (${o.reason})`);

  console.log(`\n========== 1) KMDb 발견 경로: searchKmdbFilmography("${NAME}", "${KMDB_ID}", "${ROLE}") ==========`);
  const kmdbMovies = await searchKmdbFilmography(NAME, KMDB_ID, ROLE);
  console.log(`결과: ${kmdbMovies.length}편`);
  console.log(kmdbMovies.map((m) => `${m.title}(${m.prodYear ?? "?"})`).join(", "));

  console.log(`\n========== 2) KOFIC 발견 경로: searchKoficPeopleList("${NAME}") ==========`);
  const koficHits = await searchKoficPeopleList(NAME);
  console.log(`KOFIC에 등록된 동명 후보 수: ${koficHits.length}`);
  const knownTitles = new Set(kmdbMovies.map((m) => normalize(m.title)));
  for (const hit of koficHits) {
    const overlap = hit.filmoNames.filter((t) => knownTitles.has(normalize(t)));
    console.log(
      `  - peopleCd=${hit.peopleCd} filmoNames ${hit.filmoNames.length}개, ` +
        `KMDb와 겹치는 제목 ${overlap.length}개${overlap.length > 0 ? `: ${overlap.join(", ")}` : ""}`
    );
  }
  const sameName = koficHits.filter((h) => h.name === NAME);
  const withOverlap = sameName.filter((h) => h.filmoNames.some((t) => knownTitles.has(normalize(t))));
  console.log(
    `-> person-filmography.ts의 채택 조건(이름 일치 후보 1명, 또는 겹치는 후보 정확히 1명) 충족 여부: ` +
      `${sameName.length === 1 || withOverlap.length === 1 ? "충족(KOFIC 보완 작동함)" : "미충족(KOFIC 보완 포기됨)"}`
  );

  console.log(`\n========== 3) 역방향 조회: findMoviesByCastKmdbId("${KMDB_ID}", "${ROLE}") ==========`);
  const reverseRows = await findMoviesByCastKmdbId(KMDB_ID, ROLE);
  console.log(`결과: ${reverseRows.length}편`);
  console.log(reverseRows.map((r) => r.title).join(", "));

  console.log(`\n========== 4) CachedPerson 현재 상태 ==========`);
  const cachedPerson = await db.cachedPerson.findUnique({ where: { kmdbId: KMDB_ID } });
  if (cachedPerson) {
    const ageMs = Date.now() - cachedPerson.updatedAt.getTime();
    console.log(
      `있음: 저장된 편수=${(cachedPerson.filmography as unknown[]).length}편, ` +
        `마지막 갱신 ${Math.round(ageMs / (1000 * 60 * 60))}시간 전`
    );
  } else {
    console.log("없음(아직 캐시된 적 없음)");
  }

  console.log(`\n========== 5) 캐시를 지우고 getPersonFilmography로 강제 재계산 ==========`);
  await db.cachedPerson.deleteMany({ where: { kmdbId: KMDB_ID } });
  const { movies: finalMovies } = await getPersonFilmography(NAME, KMDB_ID, ROLE);
  console.log(`최종 병합 결과: ${finalMovies.length}편`);
  console.log(finalMovies.map((m) => m.title).join(", "));
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
