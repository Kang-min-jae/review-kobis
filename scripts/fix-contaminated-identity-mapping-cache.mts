// withResolvedId(movie-rate-info.ts)가 PersonIdentityMapping을 활동연도 검증 없이
// 적용하던 버그 때문에, 전혀 무관한 시기의 영화(예: "너와 나"(1967))에 매핑 대상
// 인물의 kmdbId가 잘못 붙어 CachedMovie에 그대로 저장된 사례가 있다. 코드는 이미
// 고쳤지만(활동연도 ±2년 범위 검증 추가), 이미 캐시에 저장된 오염 데이터는 코드를
// 고친 것만으로는 저절로 없어지지 않는다 — 이 스크립트가 실제로 오염된 행을 찾아서
// 지운다(다음 방문 때 고쳐진 로직으로 다시 계산되게).
//
// 각 PersonIdentityMapping(사람이 직접 확인한 이름->kmdbId)에 대해:
//   1) searchKmdbFilmography(personName, kmdbId, role)로 이 kmdbId의 실제 활동연도
//      범위를 구한다.
//   2) CachedMovie 전체를 훑어서, cast(또는 directorKmdbId)에 이 kmdbId가 붙어 있는데
//      영화 개봉연도가 그 활동연도 범위(±2년)를 벗어나는 행을 "오염된 행"으로 표시한다.
//   3) 오염된 행을 출력하고, 그 CachedMovie 행과 관련 CachedPerson 캐시를 삭제한다
//      (다음 방문 때 새로 계산됨).
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/fix-contaminated-identity-mapping-cache.mts

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
  // person-filmography.ts와 마찬가지로, config() 호출 이후에 실행되도록 동적 import로
  // 미룬다 (app/_lib/db.ts가 모듈 로드 시점에 process.env.DATABASE_URL을 읽기 때문).
  const { searchKmdbFilmography } = await import("../app/_lib/kmdb");

  const mappings = await db.personIdentityMapping.findMany();
  if (mappings.length === 0) {
    console.log("PersonIdentityMapping이 비어 있습니다.");
    return;
  }

  const allMovies = await db.cachedMovie.findMany();
  console.log(`CachedMovie 총 ${allMovies.length}편을 대상으로 검사합니다.\n`);

  for (const mapping of mappings) {
    const role = mapping.role as "감독" | "배우";
    console.log(`=== ${mapping.personName} (${role}, kmdbId=${mapping.kmdbId}) ===`);

    if (!mapping.kmdbId) {
      console.log("  이 매핑엔 kmdbId가 없어 건너뜁니다.\n");
      continue;
    }
    const kmdbId = mapping.kmdbId;

    const movies = await searchKmdbFilmography(mapping.personName, kmdbId, role);
    const years = movies
      .map((m) => (m.prodYear ? Number(m.prodYear) : null))
      .filter((y): y is number => y !== null && !Number.isNaN(y));

    if (years.length === 0) {
      console.log("  KMDb에서 이 kmdbId의 활동연도를 확인할 수 없어 검증을 건너뜁니다.");
      continue;
    }
    const min = Math.min(...years) - 2;
    const max = Math.max(...years) + 2;
    console.log(`  확인된 활동연도 범위(여유 ±2년 포함): ${min} ~ ${max}`);

    const contaminated = allMovies.filter((row) => {
      const releaseYear = row.releaseDate ? Number(row.releaseDate.slice(0, 4)) : null;
      if (releaseYear === null || Number.isNaN(releaseYear)) return false;
      if (releaseYear >= min && releaseYear <= max) return false;

      if (row.directorKmdbId === kmdbId) return true;
      const cast = (row.cast as CastMember[] | null) ?? [];
      return cast.some((c) => c.kmdbId === kmdbId);
    });

    if (contaminated.length === 0) {
      console.log("  오염된 CachedMovie 없음.\n");
      continue;
    }

    console.log(`  오염된 CachedMovie ${contaminated.length}건 발견:`);
    for (const row of contaminated) {
      console.log(`    - "${row.title}" (movieCd=${row.movieCd}, 개봉연도=${row.releaseDate})`);
    }

    await db.cachedMovie.deleteMany({ where: { movieCd: { in: contaminated.map((r) => r.movieCd) } } });
    const deletedPerson = await db.cachedPerson.deleteMany({ where: { kmdbId } });
    console.log(
      `  -> CachedMovie ${contaminated.length}건 삭제(다음 방문 때 고쳐진 로직으로 재계산), ` +
        `CachedPerson ${deletedPerson.count}건 삭제(필모그래피 재계산).\n`
    );
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
