// 수상작 캐시 포스터 오매핑 복구 스크립트.
//
// 배경: Wikidata FALLBACK_WINNERS에 잘못된 TMDB ID가 하드코딩돼 있어서
// CachedAwardWinners(wikidata.ts DB 캐시)와 CachedMovie(award-winners.ts가
// 저장하는 포스터 캐시) 양쪽에 엉뚱한 포스터 URL이 들어간 상태.
//
// 이 스크립트가 하는 일:
//   1. 오염된 CachedMovie 레코드의 posterUrl을 null로 초기화
//      → 다음 요청 때 getPosterUrl이 새로 포스터를 가져온다
//   2. 오염된 CachedAwardWinners 레코드를 삭제
//      → 다음 요청 때 Wikidata SPARQL을 재조회한다(올바른 P4947 사용)
//   3. 메모리 캐시는 이 스크립트로 지울 수 없으므로, 서버 재시작이 필요하다
//      (또는 시간이 지나 TTL이 만료되길 기다린다)
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/fix-award-poster-cache.mts

import { PrismaClient } from "../app/generated/prisma/client.js";

const db = new PrismaClient();

// 오매핑이 확인된 수상작 Wikidata QID 목록
const CORRUPTED_QIDS = [
  "Q125499906", // 아노라 (Anora) — 잘못된 TMDB: 1209290(Justice League), 정상: 1064213
  "Q108851477", // The Brutalist        — 잘못된 TMDB: 1023919(동물 다큐),    정상: 1010818
  "Q128029218", // Conclave             — 잘못된 TMDB: 975902(Boudica),       정상: 1063879
  "Q128023745", // I'm Still Here       — 잘못된 TMDB: 1156593(Culpa tuya),   정상: 1032823
];

async function main() {
  console.log("=== award poster cache fix ===\n");

  // 1. CachedMovie.posterUrl 초기화 (null → 다음 방문 때 재조회)
  const movieResult = await db.cachedMovie.updateMany({
    where: { movieCd: { in: CORRUPTED_QIDS.map((q) => `wikidata-${q}`) } },
    data: { posterUrl: null },
  });
  console.log(`[CachedMovie] posterUrl을 null로 초기화: ${movieResult.count}건`);

  // 2. CachedAwardWinners 삭제 (v5·v6 모두 — 새 버전으로 재조회됨)
  const awardResult = await db.cachedAwardWinners.deleteMany({
    where: { id: { startsWith: "academy-" } },
  });
  console.log(`[CachedAwardWinners] academy 캐시 삭제: ${awardResult.count}건`);

  console.log("\n완료. 서버를 재시작하거나 메모리 캐시 TTL(1시간)이 만료된 후");
  console.log("수상작 페이지를 방문하면 올바른 포스터로 재조회됩니다.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
