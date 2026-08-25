"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect } from "react";

export const NAV_DEPTH_KEY = "nav-depth";
const NAV_LAST_PATH_KEY = "nav-last-path";

// BackBar의 "뒤로"는 실제 브라우저 back()을 쓴다 — router.push(직전경로)는 새 히스토리
// 항목을 쌓는 "이동"이라 진짜 뒤로가기와 다르게 동작할 수 있어서다(스크롤 복원, 캐시된
// 렌더 재사용 방식 등이 back()과 다름). 다만 back()은 이 세션에서 실제로 이동한 적이
// 없으면(새 탭으로 바로 들어옴, 새로고침 등) 사이트 밖으로 나가버릴 수 있어서, "이번
// 세션에서 실제로 몇 번 이동했는지"만 카운트해뒀다가 그 값이 있을 때만 back()을 쓴다.
export default function NavHistoryTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const query = searchParams.toString();
    const full = query ? `${pathname}?${query}` : pathname;
    try {
      const lastPath = sessionStorage.getItem(NAV_LAST_PATH_KEY);
      if (lastPath === full) return; // 같은 화면 안에서의 리렌더 — 실제 이동 아님
      sessionStorage.setItem(NAV_LAST_PATH_KEY, full);
      const depth = Number(sessionStorage.getItem(NAV_DEPTH_KEY) ?? "0");
      sessionStorage.setItem(NAV_DEPTH_KEY, String(depth + 1));
    } catch {
      // 세션스토리지를 못 쓰는 환경(프라이빗 모드 등)이면 그냥 무시 — BackBar가 홈으로 대체한다.
    }
  }, [pathname, searchParams]);

  return null;
}
