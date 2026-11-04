import { cache } from "react";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { KobisUnavailableError, kobisRetryAfterSeconds } from "./kobis";
import { TmdbUnavailableError } from "./tmdb";

// 작품 정보를 DB에도 갖고 있지 않은데 외부 API(KOBIS·TMDB)를 지금 쓸 수 없을 때(하루 이용량 초과·장애) 상세 페이지를
// 어떻게 끝낼지.
//
// 예전엔 오류를 그대로 던져 500("Function Invocation Failed")이 났고, 요청 하나에 같은 오류가 4~5줄씩 찍혔다.
// Next.js 페이지는 503을 직접 돌려줄 수 없어서(404·403·401·리다이렉트·500만 가능), 일시 중단 안내 주소
// (/temporarily-unavailable)로 잠깐 보내고 그 주소가 503 + Retry-After로 답한다. 검색봇은 503을 보고 나중에 다시
// 온다. 공용 캐시 페이지에서는 이 이동이 1분만 캐시되게 해서, 외부 API가 돌아오면 곧 정상 페이지로 다시 만들어진다.

export function isTemporarilyUnavailable(error: unknown): boolean {
  return error instanceof KobisUnavailableError || error instanceof TmdbUnavailableError;
}

function retryAfterSeconds(error: unknown): number {
  return error instanceof KobisUnavailableError ? kobisRetryAfterSeconds() : 600;
}

// 요청마다 한 번만 로그를 남긴다(제목 만들기와 본문이 각각 같은 오류를 만난다).
const loggedThisRequest = cache(() => ({ done: false }));

// 렌더 중에 부른 unstable_cache의 revalidate가 그 페이지의 재생성 주기를 짧은 쪽으로 낮춘다 — 이동 응답을 1분만 캐시한다.
const shortenCacheLife = unstable_cache(async () => true, ["temporarily-unavailable"], { revalidate: 60 });

export async function redirectTemporarilyUnavailable(error: unknown, path: string, anonymous: boolean): Promise<never> {
  const seconds = retryAfterSeconds(error);
  const log = loggedThisRequest();
  if (!log.done) {
    log.done = true;
    console.warn(`[detail] ${path} 일시 중단(503, ${seconds}초 뒤 다시) — 저장된 정보 없음:`, error instanceof Error ? error.message : error);
  }
  if (anonymous) await shortenCacheLife();
  redirect(`/temporarily-unavailable?retry=${seconds}&from=${encodeURIComponent(path)}`);
}
