// 수상작 캐시 포스터 오매핑 복구 스크립트.
//
// 배경: Wikidata FALLBACK_WINNERS에 잘못된 TMDB ID가 하드코딩돼 있어서
// CachedAwardWinners(wikidata.ts DB 캐시)와 CachedMovie(award-winners.ts가
// 저장하는 포스터 캐시) 양쪽에 엉뚱한 포스터 URL이 들어간 상태.
//
// 이 스크립트가 하는 일:
//   1. 올바른 TMDB ID로 포스터 URL을 직접 조회해서 CachedMovie를 갱신한다
//      (null로 비우는 데 그치지 않고 즉시 정상 포스터로 교체)
//   2. 오염된 CachedAwardWinners 레코드를 삭제
//      → 다음 요청 때 Wikidata SPARQL을 재조회한다(올바른 P4947 사용)
//   3. 메모리 캐시는 이 스크립트로 지울 수 없으므로, 서버 재시작이 필요하다
//      (또는 시간이 지나 TTL이 만료되길 기다린다)
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/fix-award-poster-cache.mts

import { PrismaClient } from "../app/generated/prisma/client.js";

const db = new PrismaClient();

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w500";
const TMDB_API_BASE = "https://api.themoviedb.org/3";

// 올바른 TMDB ID와 Wikidata QID 매핑
const CORRECT_MOVIES = [
  { qid: "Q125499906", titleKo: "아노라",         titleEn: "Anora",          tmdbId: "1064213"  },
  { qid: "Q108851477", titleKo: "더 브루탈리스트", titleEn: "The Brutalist",  tmdbId: "1010818"  },
  { qid: "Q128029218", titleKo: "콘클라베",        titleEn: "Conclave",       tmdbId: "1063879"  },
  { qid: "Q128023745", titleKo: "나는 여기 있다",   titleEn: "I'm Still Here", tmdbId: "1032823"  },
];

async function fetchTmdbPoster(tmdbId: string): Promise<string | null> {
  const apiKey = process.env.TMDB_API_KEY;
  if (!apiKey) {
    console.warn("  ⚠️  TMDB_API_KEY 없음 — posterUrl을 null로 초기화만 합니다");
    return null;
  }
  const url = `${TMDB_API_BASE}/movie/${tmdbId}?api_key=${apiKey}&language=ko-KR`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      console.warn(`  TMDB ${tmdbId} 응답 오류: ${res.status}`);
      return null;
    }
    const data = (await res.json()) as { poster_path?: string | null; title?: string };
    if (!data.poster_path) {
      console.warn(`  TMDB ${tmdbId} poster_path 없음 (title: ${data.title})`);
      return null;
    }
    return `${TMDB_IMAGE_BASE}${data.poster_path}`;
  } catch (e) {
    console.warn(`  TMDB ${tmdbId} fetch 실패:`, e);
    return null;
  }
}

async function main() {
  console.log("=== award poster cache fix ===\n");

  // 1. 각 영화별로 올바른 TMDB 포스터를 가져와 CachedMovie를 갱신
  for (const movie of CORRECT_MOVIES) {
    const movieCd = `wikidata-${movie.qid}`;
    process.stdout.write(`[CachedMovie] ${movie.titleEn} (${movieCd}) — `);

    const posterUrl = await fetchTmdbPoster(movie.tmdbId);
    const updated = await db.cachedMovie.updateMany({
      where: { movieCd },
      data: { posterUrl, tmdbId: movie.tmdbId },
    });

    if (updated.count === 0) {
      console.log("레코드 없음 (건너뜀)");
    } else if (posterUrl) {
      console.log(`포스터 갱신 완료 → ${posterUrl.slice(-30)}`);
    } else {
      console.log("포스터 null로 초기화 (다음 방문 시 재조회)");
    }
  }

  console.log();

  // 2. CachedAwardWinners 삭제 (v5·v6 모두 — 새 버전으로 재조회됨)
  const awardResult = await db.cachedAwardWinners.deleteMany({
    where: { id: { startsWith: "academy-" } },
  });
  console.log(`[CachedAwardWinners] academy 캐시 삭제: ${awardResult.count}건`);

  console.log("\n완료. 서버를 재시작하거나 메모리 캐시 TTL(12시간)이 만료된 후");
  console.log("수상작 페이지를 방문하면 올바른 포스터로 표시됩니다.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
