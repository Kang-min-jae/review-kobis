// 검색 드롭다운의 "N편"과 상세페이지 필모그래피 최종 편수가 왜 다른지, 정확히 어느
// 단계에서 몇 편이 왜 빠지는지 한 인물에 대해 처음부터 끝까지 재현해서 보여주는
// 스크립트. app/_lib/kmdb.ts의 searchKmdbFilmography, app/_lib/kobis.ts의
// findMovieCdByTitleAndPerson과 완전히 같은 절차를 그대로 재현한다.
//
// 이 샌드박스는 KMDB_API_KEY/KOFIC_API_KEY와 외부 네트워크가 없어 직접 실행해서
// 결과를 붙여넣을 수 없다 — 사용자 컴퓨터에서 실행해 달라고 요청하기 위해 작성했다.
//
// 실행 방법 (프로젝트 루트에서):
//   node scripts/probe-filmography-reconciliation.mjs 박정민 00045706 배우

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

const KMDB_KEY = process.env.KMDB_API_KEY;
const KOFIC_KEY = process.env.KOFIC_API_KEY;
if (!KMDB_KEY || !KOFIC_KEY) {
  console.error("KMDB_API_KEY와 KOFIC_API_KEY가 둘 다 .env / .env.local에 있어야 합니다.");
  process.exit(1);
}

const [, , NAME, TARGET_ID, ROLE_ARG] = process.argv;
if (!NAME || !TARGET_ID) {
  console.error("사용법: node scripts/probe-filmography-reconciliation.mjs <이름> <kmdbId> [배우|감독]");
  process.exit(1);
}
const ROLE = ROLE_ARG === "감독" ? "감독" : "배우";

const KMDB_BASE = "http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp";
const KOBIS_BASE = "https://kobis.or.kr/kobisopenapi/webservice/rest";

function stripHighlight(s) {
  return (s ?? "").replace(/!HS\s*/g, "").replace(/!HE\s*/g, "").trim();
}
function normalize(s) {
  return (s ?? "").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

// ── 1단계: app/_lib/kmdb.ts의 rawSearch(name, 100) + searchKmdbFilmography의
// personId 전용 매칭을 그대로 재현 ──────────────────────────────────────────
async function kmdbRawSearch(query, listCount) {
  const url = new URL(KMDB_BASE);
  url.searchParams.set("collection", "kmdb_new2");
  url.searchParams.set("detail", "Y");
  url.searchParams.set("listCount", String(listCount));
  url.searchParams.set("ServiceKey", KMDB_KEY);
  url.searchParams.set("query", query);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  [kmdb] HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.Data?.[0]?.Result ?? [];
}

async function findKmdbMatchedMovies(name, targetId, role) {
  const results = await kmdbRawSearch(name, 100);
  const includeDirectors = role !== "배우";
  const includeActors = role !== "감독";
  const matched = [];
  for (const r of results) {
    const directors = includeDirectors ? (r.directors?.director ?? []) : [];
    const actors = includeActors ? (r.actors?.actor ?? []) : [];
    const hit =
      directors.some((d) => d.directorId != null && String(d.directorId).trim() === targetId) ||
      actors.some((a) => a.actorId != null && String(a.actorId).trim() === targetId);
    if (hit) matched.push({ title: stripHighlight(r.title), titleEng: r.titleEng?.trim() || null, prodYear: r.prodYear });
  }
  // DOCID 중복 제거는 원본 코드도 하지만, 여기선 제목 기준 표시가 목적이라 제목+연도로 대략 dedupe.
  const seen = new Set();
  return matched.filter((m) => {
    const key = `${m.title}::${m.prodYear}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── 2단계: app/_lib/kobis.ts의 findMovieCdByTitleAndPerson을 그대로 재현 ──────
async function kobisSearchMovieList(movieNm) {
  const url = new URL(`${KOBIS_BASE}/movie/searchMovieList.json`);
  url.searchParams.set("key", KOFIC_KEY);
  url.searchParams.set("movieNm", movieNm);
  url.searchParams.set("itemPerPage", "20");
  const res = await fetch(url);
  if (!res.ok) return { error: `HTTP ${res.status}`, items: [] };
  const data = await res.json();
  return { error: null, items: data.movieListResult?.movieList ?? [] };
}

async function kobisMovieInfo(movieCd) {
  const url = new URL(`${KOBIS_BASE}/movie/searchMovieInfo.json`);
  url.searchParams.set("key", KOFIC_KEY);
  url.searchParams.set("movieCd", movieCd);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.movieInfoResult?.movieInfo ?? null;
}

async function resolveKobisMovieCd(title, personName, role) {
  const { error, items } = await kobisSearchMovieList(title);
  if (error) return { status: "KOBIS_API_ERROR", detail: error, movieCd: null };
  const exact = items.filter((it) => (it.movieNm ?? "").trim() === title);
  if (exact.length === 0) return { status: "NO_TITLE_MATCH_IN_KOBIS", detail: null, movieCd: null };
  if (exact.length === 1) return { status: "OK_SINGLE_MATCH", detail: null, movieCd: exact[0].movieCd };

  // 제목이 여럿이면 캐스팅 대조(실제 코드와 동일).
  const normalizedPerson = normalize(personName);
  for (const item of exact) {
    if (!item.movieCd) continue;
    const info = await kobisMovieInfo(item.movieCd);
    if (!info) continue;
    const names =
      role === "감독" ? (info.directors ?? []).map((d) => d.peopleNm) : (info.actors ?? []).map((a) => a.peopleNm);
    if (names.some((n) => normalize(n) === normalizedPerson)) {
      return { status: "OK_CAST_MATCH_AMONG_MULTIPLE", detail: `후보 ${exact.length}개 중 매칭`, movieCd: item.movieCd };
    }
  }
  return { status: "AMBIGUOUS_NO_CAST_MATCH", detail: `후보 ${exact.length}개, 캐스팅 대조 실패`, movieCd: null };
}

async function main() {
  console.log(`\n########## "${NAME}" (kmdbId=${TARGET_ID}, role=${ROLE}) 필모그래피 재구성 ##########\n`);

  const kmdbMatches = await findKmdbMatchedMovies(NAME, TARGET_ID, ROLE);
  console.log(`1단계 — KMDb rawSearch(name, 100)에서 이 kmdbId로 매칭된 영화: ${kmdbMatches.length}편`);
  console.log(`  (검색 드롭다운의 creditCount와 이 숫자가 같아야 정상 — 같은 데이터 소스·같은 필터를 쓰기 때문)\n`);

  const rows = [];
  for (const movie of kmdbMatches) {
    const result = await resolveKobisMovieCd(movie.title, NAME, ROLE);
    rows.push({ ...movie, ...result });
  }

  console.log("2단계 — 각 영화의 KOBIS movieCd 해결 결과:\n");
  console.table(
    rows.map((r) => ({
      title: r.title,
      prodYear: r.prodYear,
      status: r.status,
      movieCd: r.movieCd ?? "-",
    }))
  );

  const resolved = rows.filter((r) => r.movieCd);
  const excluded = rows.filter((r) => !r.movieCd);

  console.log(`\n========== 최종 요약 ==========`);
  console.log(`KMDb 기준 credit: ${kmdbMatches.length}편 (검색 드롭다운 숫자와 비교)`);
  console.log(`KOBIS movieCd 해결 성공(=상세페이지에 실제로 표시되는 편수): ${resolved.length}편`);
  console.log(`제외됨(평점 페이지로 연결할 KOBIS 등록이 없어서): ${excluded.length}편`);
  if (excluded.length > 0) {
    console.log(`\n제외된 작품과 이유:`);
    for (const r of excluded) console.log(`  - "${r.title}"(${r.prodYear}): ${r.status}${r.detail ? ` (${r.detail})` : ""}`);
  }
  console.log(
    `\n※ "${resolved.length}편"이 이 실행 시점의 정답 숫자입니다. 이 스크립트를 같은 조건으로 다시 실행했을 때도` +
      ` 같은 숫자가 나오면(KOBIS_API_ERROR가 하나도 없으면) 안정적인 것이고, 실행할 때마다 달라지면 그 원인은` +
      ` NO_TITLE_MATCH_IN_KOBIS/KOBIS_API_ERROR로 표시된 항목들의 그때그때 다른 네트워크 상태입니다.`
  );
}

main();
