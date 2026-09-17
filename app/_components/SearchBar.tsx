import { Suspense } from "react";
import SearchInput from "./SearchInput";
import SideMenuWithData from "./SideMenuWithData";
import AuthButtonWithData from "./AuthButtonWithData";

// ── 스켈레톤 ─────────────────────────────────────────────────────────────────
// Suspense fallback으로 쓰인다. 데이터 로딩 중에도 헤더 레이아웃이 흔들리지 않도록
// 실제 버튼과 동일한 크기(h-9 w-9 / w-20)를 점유하게 만든다.
function SideMenuSkeleton() {
  return (
    // 실제 SideMenu 햄버거 버튼과 동일한 크기 — p-2 + h-5 w-5 아이콘
    <button
      type="button"
      aria-label="메뉴 열기"
      disabled
      className="shrink-0 rounded p-2 text-text opacity-40"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
        <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
      </svg>
    </button>
  );
}

function AuthButtonSkeleton() {
  // 실제 AuthButton(Sign in)과 동일한 크기·모양 — layout shift 방지
  return (
    <div className="shrink-0 animate-pulse rounded border border-neutral-700 px-3 py-1.5 w-[72px] h-[30px]" />
  );
}

// ── SearchBar ─────────────────────────────────────────────────────────────────
// sync 서버 컴포넌트 — DB 조회 없이 즉시 HTML 스트리밍 시작(TTFB 최소화).
// 유저 데이터가 필요한 SideMenu / AuthButton은 각자 독립 Suspense 경계 안에서
// 비동기 로딩되므로 검색창과 헤더 프레임은 0ms 에 즉시 렌더된다.
export default function SearchBar() {
  return (
    <div className="flex items-center gap-2 px-5 pt-5 pb-5">
      <Suspense fallback={<SideMenuSkeleton />}>
        <SideMenuWithData />
      </Suspense>

      <SearchInput />

      <Suspense fallback={<AuthButtonSkeleton />}>
        <AuthButtonWithData />
      </Suspense>
    </div>
  );
}
