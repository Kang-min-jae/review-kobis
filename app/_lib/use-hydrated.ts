"use client";

import { useSyncExternalStore } from "react";

const subscribeNothing = () => () => {};

// 브라우저에서 화면이 준비됐는지(하이드레이션 이후인지). 서버 렌더·하이드레이션 첫 렌더에선 false라
// localStorage처럼 브라우저에만 있는 값으로 화면을 바꾸는 부분을 그 뒤로 미룰 때 쓴다.
// (예전엔 useEffect(() => setMounted(true))로 했는데, 렌더를 한 번 더 일으켜 린트 규칙에 걸렸다.)
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNothing,
    () => true,
    () => false,
  );
}
