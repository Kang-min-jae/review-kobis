import SiteHeader from "../../_components/SiteHeader";

// 출연진·감독 이름을 누르면 바로 이 뼈대 화면으로 넘어간다 — 예전엔 필모그래피 계산이
// 끝날 때까지 화면이 그대로 멈춰 있어서, 링크를 눌러도 들어가지지 않는 것처럼 보였다.
export default function Loading() {
  return (
    <main>
      <SiteHeader />
      <div className="px-5 py-6" aria-busy="true" aria-label="필모그래피를 불러오는 중">
        <div className="h-4 w-24 animate-pulse rounded bg-neutral-800" />
        <div className="mt-4 h-6 w-32 animate-pulse rounded bg-neutral-800" />
        <div className="mt-2 h-3 w-40 animate-pulse rounded bg-neutral-800" />
        <div className="mt-8 flex flex-wrap gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="w-[130px] rounded-xl border border-white/10 p-2 sm:w-40">
              <div className="aspect-2/3 animate-pulse rounded-lg bg-neutral-800" />
              <div className="mt-2.5 h-4 w-3/4 animate-pulse rounded bg-neutral-800" />
              <div className="mt-1.5 h-3 w-1/2 animate-pulse rounded bg-neutral-800" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
