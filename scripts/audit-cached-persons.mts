// CachedPerson 전체를 훑어서 "동명이인 오염" 등 이상 신호가 있는 필모그래피를 찾는
// 조사 전용 스크립트 — 아무것도 삭제하지 않는다(삭제는 scripts/clean-cached-persons.mts
// 를 사람이 결과를 보고 나서 별도로 실행해야 한다).
//
// 확인하는 것:
//   c) 같은 인물의 필모그래피 안에서 개봉연도가 너무 넓게 퍼져 있는 경우(기본 25년) —
//      배우/감독의 활동 기간치고 부자연스러우면 동명이인이 섞였을 의심 신호.
//   d) 필모그래피 개수가 비정상적으로 많은 경우(기본 50편 이상) — 확인 필요 후보.
//
// a)/b)(생년월일 대비 개봉연도) 체크는 이번엔 못 넣었다 — KMDb search_json2 API의
// 배우/감독 sub-object가 실제로 생년월일 필드를 주는지 이 샌드박스에선 확인할 방법이
// 없었다(네트워크/키 없음, kmdb.or.kr 문서 페이지도 egress 차단). 존재 확인 안 된
// 필드를 가정하고 필터를 만들면 겉보기엔 "생년 체크 있음"인데 실제로는 아무 것도
// 걸러내지 못하는 게 더 위험하다고 판단해 뺐다. probe-kmdb-actor-match.mjs 실행
// 결과에서 그런 필드가 실제로 보이면 여기 이어서 추가할 수 있다.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/audit-cached-persons.mts
//
// 결과는 콘솔에 출력되고, 의심된 인물 목록은 scripts/.audit-output.json 에도 저장된다
// (clean-cached-persons.mts가 이 파일을 읽어서 실제 삭제에 쓴다).

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { writeFileSync } from "node:fs";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { configureNeon } from "../app/_lib/neon-config";

configureNeon(process.env.DATABASE_URL, { announce: true });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

const KOFIC_KEY = process.env.KOFIC_API_KEY;
const KOBIS_BASE = "https://kobis.or.kr/kobisopenapi/webservice/rest";

const YEAR_SPREAD_THRESHOLD = 25; // 이보다 넓으면 "의심 후보"
const MOVIE_COUNT_THRESHOLD = 50; // 이보다 많으면 "확인 필요 후보"

type FilmographyMovie = { id: string; title: string; releaseDate?: string | null };

const releaseDateCache = new Map<string, string | null>();

async function fetchReleaseDateFromKobis(movieCd: string): Promise<string | null> {
  if (!KOFIC_KEY) return null;
  if (releaseDateCache.has(movieCd)) return releaseDateCache.get(movieCd)!;
  try {
    const url = new URL(`${KOBIS_BASE}/movie/searchMovieInfo.json`);
    url.searchParams.set("key", KOFIC_KEY);
    url.searchParams.set("movieCd", movieCd);
    const res = await fetch(url);
    if (!res.ok) {
      releaseDateCache.set(movieCd, null);
      return null;
    }
    const data = await res.json();
    const openDt: string | undefined = data.movieInfoResult?.movieInfo?.openDt;
    const iso = openDt && openDt.length === 8 ? `${openDt.slice(0, 4)}-${openDt.slice(4, 6)}-${openDt.slice(6, 8)}` : null;
    releaseDateCache.set(movieCd, iso);
    return iso;
  } catch {
    releaseDateCache.set(movieCd, null);
    return null;
  }
}

// releaseDate가 캐시된 필모그래피 항목에 이미 있으면 그걸 쓰고(이번에 고친 코드로 새로
// 만들어진 항목), 없으면(예전 버전 로직으로 만들어진 캐시라 필드 자체가 없는 경우)
// CachedMovie에서 찾아보고, 그것도 없으면 KOFIC_API_KEY가 있을 때만 라이브로 조회한다.
async function resolveReleaseYear(movie: FilmographyMovie): Promise<number | null> {
  if (movie.releaseDate) {
    const y = Number(movie.releaseDate.slice(0, 4));
    if (!Number.isNaN(y)) return y;
  }
  const movieCd = movie.id.replace(/^kobis-/, "");
  const cached = await db.cachedMovie.findUnique({ where: { movieCd } });
  if (cached?.releaseDate) {
    const y = Number(cached.releaseDate.slice(0, 4));
    if (!Number.isNaN(y)) return y;
  }
  const live = await fetchReleaseDateFromKobis(movieCd);
  if (live) {
    const y = Number(live.slice(0, 4));
    if (!Number.isNaN(y)) return y;
  }
  return null;
}

async function main() {
  const persons = await db.cachedPerson.findMany();
  console.log(`CachedPerson 총 ${persons.length}명 스캔 시작${KOFIC_KEY ? "" : " (KOFIC_API_KEY 없음 — 캐시에 없는 영화는 연도 확인 불가로 표시됨)"}\n`);

  const suspects: { kmdbId: string; name: string; role: string; reasons: string[] }[] = [];
  let uncertainCount = 0;

  for (const person of persons) {
    const filmography = person.filmography as unknown as FilmographyMovie[];
    const reasons: string[] = [];

    const yearsWithTitle: { year: number; title: string }[] = [];
    let unresolvedCount = 0;
    for (const m of filmography) {
      const year = await resolveReleaseYear(m);
      if (year === null) {
        unresolvedCount++;
        continue;
      }
      yearsWithTitle.push({ year, title: m.title });
    }

    if (yearsWithTitle.length > 0) {
      const years = yearsWithTitle.map((y) => y.year);
      const min = Math.min(...years);
      const max = Math.max(...years);
      const spread = max - min;
      if (spread > YEAR_SPREAD_THRESHOLD) {
        const minTitle = yearsWithTitle.find((y) => y.year === min)?.title;
        const maxTitle = yearsWithTitle.find((y) => y.year === max)?.title;
        reasons.push(
          `(c) 개봉연도 범위가 ${spread}년으로 넓음: "${minTitle}"(${min}) ~ "${maxTitle}"(${max})`
        );
      }
    }

    if (filmography.length >= MOVIE_COUNT_THRESHOLD) {
      reasons.push(`(d) 필모그래피가 ${filmography.length}편으로 비정상적으로 많음`);
    }

    if (unresolvedCount > 0) uncertainCount++;

    if (reasons.length > 0) {
      suspects.push({ kmdbId: person.kmdbId, name: person.name, role: person.role, reasons });
      console.log(`\n[의심됨] ${person.name} (${person.role}, kmdbId=${person.kmdbId})`);
      for (const r of reasons) console.log(`  - ${r}`);
      if (unresolvedCount > 0) console.log(`  (연도 확인 못 한 영화 ${unresolvedCount}편 — 위 판단에서 제외됨)`);
    }
  }

  console.log(`\n\n========== 요약 ==========`);
  console.log(`전체: ${persons.length}명`);
  console.log(`의심됨: ${suspects.length}명 (${((suspects.length / Math.max(persons.length, 1)) * 100).toFixed(1)}%)`);
  console.log(`연도 확인 불가한 영화가 있었던 인물: ${uncertainCount}명 (KOFIC_API_KEY로 라이브 조회 실패했거나 KOBIS에 없는 작품 포함)`);
  console.log(`\n※ 생년월일 기반 체크(a/b)는 데이터 소스 미확인으로 이번엔 수행하지 않았습니다.`);
  console.log(`※ (c)/(d)는 "확정된 동명이인 오염"이 아니라 "의심 후보"입니다 — 실제로 활동 기간이 긴 배우/감독일 수도 있으니 목록을 직접 확인 후 정리하세요.`);

  const outputPath = new URL("./.audit-output.json", import.meta.url);
  writeFileSync(outputPath, JSON.stringify({ scannedAt: new Date().toISOString(), suspects }, null, 2));
  console.log(`\n의심 목록을 ${outputPath.pathname} 에 저장했습니다 — clean-cached-persons.mts가 이 파일을 사용합니다.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
