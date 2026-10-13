import { Suspense } from "react";
import SiteHeader from "../_components/SiteHeader";
import AwardsVoting from "../_components/AwardsVoting";
import BoxOfficeCoverflow from "../_components/BoxOfficeCoverflow";
import {
  getLatestAcademyWinnerRows,
  getLatestCannesWinnerRows,
  getLatestBerlinWinnerRows,
  getLatestVeniceWinnerRows,
  ceremonyLabel,
} from "../_lib/award-winners";
import { auth } from "../../auth";

export const metadata = { title: "수상작 투표" };

function RowSkeleton() {
  return (
    <section className="px-5 py-6">
      <div className="h-5 w-48 animate-pulse rounded bg-neutral-800" />
      <div className="mt-4 flex justify-center gap-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="aspect-2/3 w-32 shrink-0 animate-pulse rounded-xl bg-neutral-800" />
        ))}
      </div>
    </section>
  );
}

async function AcademySection() {
  const rows = await getLatestAcademyWinnerRows().catch(() => []); // 실패하면 이 영화제 구역만 숨긴다
  if (rows.length === 0) return null;
  return (
    <BoxOfficeCoverflow
      title="🏆 아카데미 시상식 수상작"
      subtitle={`${ceremonyLabel("academy", rows) ?? "최근"} 수상작`}
      movies={rows.map((r) => r.movie)}
    />
  );
}

async function CannesSection() {
  const rows = await getLatestCannesWinnerRows().catch(() => []); // 실패하면 이 영화제 구역만 숨긴다
  if (rows.length === 0) return null;
  return (
    <BoxOfficeCoverflow
      title="🌴 칸 영화제 수상작"
      subtitle={`${ceremonyLabel("cannes", rows) ?? "최근"} 수상작`}
      movies={rows.map((r) => r.movie)}
    />
  );
}

async function BerlinSection() {
  const rows = await getLatestBerlinWinnerRows().catch(() => []); // 실패하면 이 영화제 구역만 숨긴다
  if (rows.length === 0) return null;
  return (
    <BoxOfficeCoverflow
      title="🐻 베를린 영화제 수상작"
      subtitle={`${ceremonyLabel("berlin", rows) ?? "최근"} 수상작`}
      movies={rows.map((r) => r.movie)}
    />
  );
}

async function VeniceSection() {
  const rows = await getLatestVeniceWinnerRows().catch(() => []); // 실패하면 이 영화제 구역만 숨긴다
  if (rows.length === 0) return null;
  return (
    <BoxOfficeCoverflow
      title="🦁 베니스 영화제 수상작"
      subtitle={`${ceremonyLabel("venice", rows) ?? "최근"} 수상작`}
      movies={rows.map((r) => r.movie)}
    />
  );
}

export default async function AwardsPage() {
  const session = await auth();
  const loggedIn = !!session?.user?.id;

  return (
    <main>
      <SiteHeader active="awards" />
      {/* 투표 섹션 */}
      <AwardsVoting loggedIn={loggedIn} />

      {/* 실제 수상작 캐러셀 */}
      <div className="mx-auto max-w-3xl">
        <div className="mx-5 mt-4 border-t border-neutral-800 pt-6">
          <h2 className="text-lg font-bold text-text">최근 수상작</h2>
          <p className="mt-1 text-sm text-muted">Wikidata 기준 · 카드를 클릭하면 평점을 남길 수 있어요</p>
        </div>
        <Suspense fallback={<RowSkeleton />}>
          <AcademySection />
        </Suspense>
        <Suspense fallback={<RowSkeleton />}>
          <CannesSection />
        </Suspense>
        <Suspense fallback={<RowSkeleton />}>
          <BerlinSection />
        </Suspense>
        <Suspense fallback={<RowSkeleton />}>
          <VeniceSection />
        </Suspense>
      </div>
    </main>
  );
}
