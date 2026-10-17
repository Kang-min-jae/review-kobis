import { Suspense } from "react";
import Link from "next/link";
import { unstable_cache } from "next/cache";
import SiteHeader from "../SiteHeader";
import BackBar from "../BackBar";
import FilmographyGrid from "../FilmographyGrid";
import { getPersonFilmography, getPersonTmdbId } from "../../_lib/person-filmography";
import { findNamesakeCandidates } from "../../_lib/kmdb";
import { getTmdbPersonBirthday } from "../../_lib/tmdb";
import { db } from "../../_lib/db";

// 인물 페이지 화면 — 로그인 방문자용(app/people/[id]/page.tsx, 요청마다 새로 그림)과 로그인 쿠키 없는
// 요청용 공용 캐시 페이지(app/anon/people/…/page.tsx)가 같이 쓴다. anonymous면 로그인 정보를 읽지 않는다.

export type Role = "감독" | "배우";

function candidateHref(name: string, role: Role, kmdbId: string): string {
  const params = new URLSearchParams({ role, pid: kmdbId });
  return `/people/${encodeURIComponent(name)}?${params.toString()}`;
}

// 처음 보는 인물이라 필모그래피를 다 계산하기 전에 일부만 보여 줄 때, 그 화면이 공용 캐시에 오래 남지
// 않게 한다 — 렌더 중에 부른 unstable_cache의 revalidate는 그 페이지 전체의 재생성 주기를 더 짧은 쪽으로
// 낮춘다(계산은 응답 뒤에 마저 끝나 DB에 저장되고, 30초 뒤 다음 방문 때 전체 필모그래피로 다시 만들어진다).
const shortenCacheLife = unstable_cache(async () => true, ["person-partial-filmography"], { revalidate: 30 });

// 페이지는 이름부터 바로 보여주고, 필모그래피·동명이인 안내·생년은 각자 준비되는 대로
// 따로 채운다(Suspense 스트리밍). 예전엔 셋을 모두 받을 때까지 — 특히 필모그래피가 끝난
// 뒤에야 생년월일을 조회해서 — 화면 전체가 가장 느린 조회를 기다렸다.
export default async function PersonView({
  name,
  pid,
  role,
  tmdbIdHint,
  anonymous,
}: {
  name: string;
  pid: string | null;
  role: Role | null;
  tmdbIdHint: string | null; // 검색 결과에서 바로 클릭해 온 경우 URL에 실리는 TMDB person ID
  anonymous: boolean;
}) {
  // URL에 pid가 없어도(예: 예전에 만들어진 링크), 이 이름이 사람이 직접 확인해둔
  // PersonIdentityMapping에 있으면 그 확정된 kmdbId를 우선 쓴다 — 이름만으로
  // 다시 추정하는 것보다 안전하다.
  let personId = pid;
  if (!personId && role) {
    const mapping = await db.personIdentityMapping.findUnique({
      where: { personName_role: { personName: name, role } },
    });
    if (mapping?.kmdbId) personId = mapping.kmdbId;
  }

  return (
    <main>
      <SiteHeader anonymous={anonymous} />
      <div className="px-5 py-6">
        <BackBar />

        <h1 className="mt-3 text-lg font-bold text-text">
          {name}
          <Suspense fallback={null}>
            <BirthYear personId={personId} tmdbIdHint={tmdbIdHint} />
          </Suspense>
        </h1>

        {role && (
          <Suspense fallback={null}>
            <NamesakeNotice name={name} role={role} personId={personId} />
          </Suspense>
        )}

        <Suspense fallback={<FilmographySkeleton />}>
          <Filmography name={name} personId={personId} role={role} tmdbIdHint={tmdbIdHint} anonymous={anonymous} />
        </Suspense>
      </div>
    </main>
  );
}

async function Filmography({
  name,
  personId,
  role,
  tmdbIdHint,
  anonymous,
}: {
  name: string;
  personId: string | null;
  role: Role | null;
  tmdbIdHint: string | null;
  anonymous: boolean;
}) {
  const { movies, partial } = await getPersonFilmography(name, personId, role, tmdbIdHint);
  // 일부만 계산됐거나, 외부 조회가 잠깐 실패해 하나도 못 찾았으면 공용 캐시에 오래 두지 않는다.
  if (anonymous && (partial || movies.length === 0)) await shortenCacheLife();
  return (
    <>
      <p className="mt-1 text-xs text-muted">참여작 {movies.length}편 · 평점 높은 순</p>
      {partial && (
        <p className="mt-3 rounded-lg border border-neutral-700 bg-surface p-3 text-xs text-muted">
          전체 참여작을 불러오는 중이에요 — 지금은 확인된 작품만 보여드려요. 잠시 후 새로고침하면 전체 필모그래피가 보여요.
        </p>
      )}
      <section className="mt-6">
        <FilmographyGrid movies={movies} />
      </section>
    </>
  );
}

function FilmographySkeleton() {
  return (
    <div aria-busy="true" aria-label="필모그래피를 불러오는 중">
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
  );
}

// 캐시에 저장된(또는 검색에서 넘어온) TMDB person_id로 생년월일을 참고 정보로 보여준다 —
// KMDb엔 없는 정보라 TMDB로만 보완 가능하다. 동명이인 확정 근거는 아니고 어디까지나 참고용.
async function BirthYear({ personId, tmdbIdHint }: { personId: string | null; tmdbIdHint: string | null }) {
  const tmdbId = (await getPersonTmdbId(personId).catch(() => null)) ?? tmdbIdHint;
  const birthday = tmdbId ? await getTmdbPersonBirthday(tmdbId).catch(() => null) : null;
  const birthYear = birthday?.slice(0, 4) || null;
  return birthYear ? <span className="ml-2 text-sm font-normal text-muted">{birthYear}년생</span> : null;
}

// 후보가 하나뿐이면 애초에 동명이인이 아니니 안내가 필요 없다. 여럿이면, 지금 personId가
// 그 후보들 중 하나로 이미 특정된 경우(검색에서 클릭했거나 매핑에 등록된 경우)엔 "다른
// 후보 보기" 링크만 주고, personId가 아예 없어서 이름만으로 조회된 경우엔(동명이인이
// 섞여 있을 위험이 실제로 있는 경우) 더 분명한 경고를 준다.
async function NamesakeNotice({ name, role, personId }: { name: string; role: Role; personId: string | null }) {
  const candidates = await findNamesakeCandidates(name, role).catch(() => []);
  if (candidates.length <= 1) return null;
  const others = candidates.filter((c) => c.kmdbId !== personId);
  const isDisambiguated = !!personId && others.length < candidates.length;

  return (
    <div className="mt-3 rounded-lg border border-brand/40 bg-brand/10 p-3 text-xs text-brand">
      {isDisambiguated ? (
        <p>같은 이름의 다른 인물이 {others.length}명 더 있어요 — 지금 보시는 필모그래피는 선택하신 분 기준이에요.</p>
      ) : (
        <p>같은 이름의 인물이 {candidates.length}명 등록돼 있어요 — 필모그래피에 다른 사람의 작품이 섞여 있을 수 있어요.</p>
      )}
      <p className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
        {(isDisambiguated ? others : candidates).map((c) => (
          <Link prefetch={false} key={c.kmdbId} href={candidateHref(name, c.role, c.kmdbId)} className="underline hover:no-underline">
            {isDisambiguated ? "다른 후보" : "선택"}: 참여작 {c.creditCount}편
            {c.latestYear ? ` · ${c.latestYear}년 최근작` : ""}
          </Link>
        ))}
      </p>
    </div>
  );
}

// 인물 페이지 로딩 뼈대 — 출연진·감독 이름을 누르면 바로 이 화면으로 넘어간다(app/people/[id]/loading.tsx,
// app/anon/people/…/loading.tsx). 예전엔 필모그래피 계산이 끝날 때까지 화면이 그대로 멈춰 있어서, 링크를
// 눌러도 들어가지지 않는 것처럼 보였다.
export function PersonPageSkeleton({ anonymous }: { anonymous: boolean }) {
  return (
    <main>
      <SiteHeader anonymous={anonymous} />
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
