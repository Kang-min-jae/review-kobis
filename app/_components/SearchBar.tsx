import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import SearchInput from "./SearchInput";
import SideMenuWithData from "./SideMenuWithData";
import AccountMenuWithData from "./AccountMenuWithData";
import { AccountMenuSkeleton } from "./AccountMenu";

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

// ── SearchBar ─────────────────────────────────────────────────────────────────
// sync 서버 컴포넌트 — DB 조회 없이 즉시 HTML 스트리밍 시작(TTFB 최소화).
// 유저 데이터가 필요한 SideMenu / 계정 영역(AccountMenu)은 각자 독립 Suspense 경계 안에서
// 비동기 로딩되므로 검색창과 헤더 프레임은 0ms 에 즉시 렌더된다.
export default function SearchBar() {
  return (
    <div className="flex items-center gap-2 px-3 pt-4 pb-4 sm:px-5 sm:pt-5 sm:pb-5">
      <Suspense fallback={<SideMenuSkeleton />}>
        <SideMenuWithData />
      </Suspense>

      {/* 로고 — 홈 히어로와 같은 극장 의자 사진 + STILL THEATER. 좁은 화면에선 사진만 보인다. */}
      <Link href="/" aria-label="STILL THEATER 홈" className="flex shrink-0 items-center gap-2 rounded-md">
        <Image
          src="/images/hero-theater.webp"
          alt=""
          width={72}
          height={40}
          priority
          className="h-9 w-14 rounded-md object-cover object-[60%_55%] sm:h-10 sm:w-[72px]"
        />
        <span className="hidden whitespace-nowrap text-base font-black tracking-[0.08em] text-text md:inline">STILL THEATER</span>
      </Link>

      <SearchInput />

      {/* 계정 영역 — 세션 확인 중엔 같은 크기의 자리 표시를 보여 검색창 너비가 흔들리지 않는다 */}
      <Suspense fallback={<AccountMenuSkeleton />}>
        <AccountMenuWithData />
      </Suspense>
    </div>
  );
}
