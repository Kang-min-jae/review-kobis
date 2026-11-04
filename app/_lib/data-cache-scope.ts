import { AsyncLocalStorage } from "node:async_hooks";

// 외부 API(KOBIS·KMDb·TMDB) 결과를 Next 데이터 캐시에 한 번 더 쓰지 않는 구간.
//
// 처음 보는 작품의 상세 정보를 만들 때 부르는 외부 조회(작품 상세, 제목·인물 검색)는 결과를 DB(CachedMovie·
// CachedSeries)에 저장하고 다음부터는 DB만 읽는다. 그런데 같은 결과를 Vercel 데이터 캐시에도 하나씩 따로 써서,
// 처음 보는 영화 한 편마다 데이터 캐시 쓰기가 14번 생겼다(ISR Write로 각 1단위 이상). 이 구간 안에서는
// 데이터 캐시를 건너뛰고 바로 부른다. 같은 서버에서 동시에 같은 조회가 오면 함께 기다리는 것(in-flight)과
// 하루 이용량·쿨다운 보호는 그대로다. 홈 행·검색처럼 DB에 저장하지 않는 조회는 지금처럼 캐시한다.
const scope = new AsyncLocalStorage<true>();

export function withoutDataCache<T>(run: () => Promise<T>): Promise<T> {
  return scope.run(true, run);
}

export function skipDataCache(): boolean {
  return scope.getStore() === true;
}
