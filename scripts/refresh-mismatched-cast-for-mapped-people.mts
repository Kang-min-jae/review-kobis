// "족구왕"의 안재홍이 여전히 무관한 3편(울렁울렁 울렁대는 가슴안고/검은 돼지/열아홉,
// 연주)에 연결되는 문제의 원인 진단 + 수정.
//
// 지난 fix-anjaehong-identity.mts는 "잘못된 코드가 정확히 00187551인 경우"만 찾아
// 지웠는데, "족구왕"은 그것과 무관한 세 번째의(아마 이 매핑 체계가 생기기 전인 훨씬
// 이전에 캐싱된) 잘못된 kmdbId를 갖고 있었던 것으로 보인다 — 그래서 지난 정리에서
// 빠졌다. 이번엔 특정 값 하나가 아니라 "이름은 매핑 대상인데 저장된 kmdbId가 지금
// 확정된 올바른 코드와 다른 모든 경우"를 찾아서 정리한다.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/refresh-mismatched-cast-for-mapped-people.mts

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

type CastMember = { name: string; kmdbId: string | null };

async function main() {
  console.log(`\n========== 0) "족구왕" CachedMovie 원본 cast 확인 (요청하신 raw 데이터) ==========`);
  const jokguwang = await db.cachedMovie.findFirst({ where: { title: "족구왕" } });
  if (!jokguwang) {
    console.log(`"족구왕"이 CachedMovie에 없습니다 — 아직 캐싱된 적이 없거나 이미 정리된 상태입니다.`);
  } else {
    console.log(`movieCd=${jokguwang.movieCd}, 개봉연도=${jokguwang.releaseDate}`);
    console.log(`cast 원본: ${JSON.stringify(jokguwang.cast, null, 2)}`);
    const anJaeHongInCast = (jokguwang.cast as CastMember[]).find((c) => c.name === "안재홍");
    console.log(
      `"안재홍" cast 항목: ${anJaeHongInCast ? `kmdbId=${anJaeHongInCast.kmdbId}` : "cast 배열에 이름 자체가 없음"}`
    );

    if (anJaeHongInCast?.kmdbId) {
      const { findMoviesByCastKmdbId } = await import("../app/_lib/person-filmography");
      const wrongResult = await findMoviesByCastKmdbId(anJaeHongInCast.kmdbId, "배우");
      console.log(
        `\n이 kmdbId(${anJaeHongInCast.kmdbId})로 findMoviesByCastKmdbId 호출 결과: ` +
          `${wrongResult.length}편 (${wrongResult.map((m) => m.title).join(", ")})`
      );
      console.log(`-> 이 결과가 화면에서 보신 "3편"과 일치하면, 이 값이 바로 문제의 원인입니다.`);
    }
  }

  console.log(`\n========== 1) 매핑된 모든 인물에 대해, 이름은 같은데 코드가 다른 CachedMovie 정리 ==========`);
  const mappings = await db.personIdentityMapping.findMany();
  const allMovies = await db.cachedMovie.findMany();

  for (const mapping of mappings) {
    if (!mapping.kmdbId) continue;
    const correctId = mapping.kmdbId;
    const role = mapping.role as "감독" | "배우";
    console.log(`\n--- ${mapping.personName} (${role}) 올바른 코드=${correctId} ---`);

    const mismatched = allMovies.filter((row) => {
      if (role === "감독") {
        return row.directorName === mapping.personName && row.directorKmdbId !== correctId;
      }
      const cast = (row.cast as CastMember[] | null) ?? [];
      return cast.some((c) => c.name === mapping.personName && c.kmdbId !== correctId);
    });

    if (mismatched.length === 0) {
      console.log(`  불일치하는 CachedMovie 없음.`);
      continue;
    }

    console.log(`  코드가 다른(또는 없는) CachedMovie ${mismatched.length}건:`);
    for (const row of mismatched) {
      const cast = (row.cast as CastMember[] | null) ?? [];
      const found = cast.find((c) => c.name === mapping.personName);
      const storedId = role === "감독" ? row.directorKmdbId : (found?.kmdbId ?? null);
      console.log(`    - "${row.title}" (movieCd=${row.movieCd}), 저장된 kmdbId=${storedId}`);
    }

    await db.cachedMovie.deleteMany({ where: { movieCd: { in: mismatched.map((r) => r.movieCd) } } });
    console.log(`  -> ${mismatched.length}건 삭제(다음 방문 때 올바른 코드로 재계산됨).`);
  }

  console.log(`\n========== 2) 매핑된 인물들의 CachedPerson 캐시 전부 정리 ==========`);
  const kmdbIds = mappings.map((m) => m.kmdbId).filter((id): id is string => !!id);
  const deletedPerson = await db.cachedPerson.deleteMany({ where: { kmdbId: { in: kmdbIds } } });
  console.log(`CachedPerson ${deletedPerson.count}건 삭제.`);

  console.log(`\n========== 3) 재검증: 각 매핑 인물의 최종 필모그래피를 강제로 다시 계산 ==========`);
  const { getPersonFilmography } = await import("../app/_lib/person-filmography");
  for (const mapping of mappings) {
    if (!mapping.kmdbId) continue;
    const role = mapping.role as "감독" | "배우";
    const movies = await getPersonFilmography(mapping.personName, mapping.kmdbId, role);
    console.log(`\n${mapping.personName} (${role}, ${mapping.kmdbId}): ${movies.length}편`);
    console.log(movies.map((m) => m.title).join(", "));
    if (mapping.personName === "안재홍") {
      console.log(`"족구왕" 포함 여부: ${movies.some((m) => m.title === "족구왕")}`);
    }
    if (mapping.personName === "박정민") {
      console.log(`"파수꾼" 포함 여부: ${movies.some((m) => m.title === "파수꾼")}`);
      console.log(`"너와 나" 포함 여부(포함되면 안 됨): ${movies.some((m) => m.title === "너와 나")}`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
