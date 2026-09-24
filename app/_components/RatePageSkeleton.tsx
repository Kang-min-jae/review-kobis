import SiteHeader from "./SiteHeader";

// 평점 페이지로 이동하는 동안 바로 보여주는 뼈대 — 실제 화면(포스터·정보·항목 평점·리뷰)과
// 같은 배치라 데이터가 들어와도 레이아웃이 크게 흔들리지 않는다.
export default function RatePageSkeleton() {
  return (
    <main>
      <SiteHeader />
      <div className="px-4 py-5 sm:px-5 sm:py-6" aria-busy="true" aria-label="영화 정보를 불러오는 중">
        <div className="h-5 w-16 animate-pulse rounded bg-neutral-800" />
        <div className="mt-4 flex gap-4 sm:gap-6">
          <div className="aspect-2/3 w-28 shrink-0 animate-pulse rounded-lg bg-neutral-800 sm:w-40" />
          <div className="flex-1 space-y-3">
            <div className="h-7 w-2/3 animate-pulse rounded bg-neutral-800" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-neutral-800" />
            <div className="h-4 w-full animate-pulse rounded bg-neutral-800" />
            <div className="h-4 w-5/6 animate-pulse rounded bg-neutral-800" />
            <div className="h-4 w-3/4 animate-pulse rounded bg-neutral-800" />
          </div>
        </div>
        <div className="mt-6 flex gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-14 flex-1 animate-pulse rounded-lg bg-neutral-800" />
          ))}
        </div>
        <div className="mt-6 space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-20 animate-pulse rounded-lg bg-neutral-800" />
          ))}
        </div>
      </div>
    </main>
  );
}
