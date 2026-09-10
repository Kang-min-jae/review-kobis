// 배우 필모그래피 동명이인 버그를 실제 API 응답으로 끝까지 확인하는 스크립트.
// 이 샌드박스는 KMDB_API_KEY/KOFIC_API_KEY가 없고 외부 네트워크도 막혀 있어 직접
// 실행해서 결과를 붙여넣을 수 없다 — 대신 우리 코드(app/_lib/kmdb.ts,
// app/_lib/kobis.ts, app/_lib/person-filmography.ts)가 실제로 하는 것과 똑같은
// 절차를 이 파일 안에 그대로 재현해서, 사용자 컴퓨터에서 실행하면 우리 서비스가
// 실제로 만들어내는 값을 한 단계씩 그대로 볼 수 있게 했다.
//
// 실행 방법 (프로젝트 루트에서):
//   node scripts/probe-kmdb-actor-match.mjs "박정민" 배우 \
//     "아이들" "위험한 상견례" "초감각 커플" "라라 선샤인" \
//     "꽃미남 연쇄 테러사건" "밀양" "나의 친구, 그의 아내" "파이스토리"
//
//   node scripts/probe-kmdb-actor-match.mjs "안재홍" 배우 \
//     "몽정기" "반칙왕" "기막힌 사내들" "악어"
//
// 인자: [이름] [역할: 배우|감독] [의심되는 영화 제목...]

import { config } from "dotenv";

config();
config({ path: ".env.local", override: true });

const KMDB_KEY = process.env.KMDB_API_KEY;
const KOFIC_KEY = process.env.KOFIC_API_KEY;
if (!KMDB_KEY) {
  console.error("KMDB_API_KEY가 .env / .env.local 어디에도 없습니다.");
  process.exit(1);
}

const [, , argName, argRole, ...argTitles] = process.argv;
const NAME = argName ?? "박정민";
const ROLE = argRole === "감독" ? "감독" : "배우";
const SUSPECT_TITLES =
  argTitles.length > 0
    ? argTitles
    : ["아이들", "위험한 상견례", "초감각 커플", "라라 선샤인", "꽃미남 연쇄 테러사건", "밀양", "나의 친구, 그의 아내", "파이스토리"];

const KMDB_BASE = "http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp";
const KOBIS_BASE = "https://kobis.or.kr/kobisopenapi/webservice/rest";

function stripHighlight(s) {
  return (s ?? "").replace(/!HS\s*/g, "").replace(/!HE\s*/g, "").trim();
}

async function kmdbSearch(query, listCount) {
  const url = new URL(KMDB_BASE);
  url.searchParams.set("collection", "kmdb_new2");
  url.searchParams.set("detail", "Y");
  url.searchParams.set("listCount", String(listCount));
  url.searchParams.set("ServiceKey", KMDB_KEY);
  url.searchParams.set("query", query);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  [kmdb] HTTP ${res.status} (query="${query}")`);
    return [];
  }
  const data = await res.json();
  return data.Data?.[0]?.Result ?? [];
}

async function kobisSearchMovieList(movieNm) {
  if (!KOFIC_KEY) return [];
  const url = new URL(`${KOBIS_BASE}/movie/searchMovieList.json`);
  url.searchParams.set("key", KOFIC_KEY);
  url.searchParams.set("movieNm", movieNm);
  url.searchParams.set("itemPerPage", "20");
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.movieListResult?.movieList ?? [];
}

async function kobisSearchByDirector(directorNm) {
  if (!KOFIC_KEY) return [];
  const url = new URL(`${KOBIS_BASE}/movie/searchMovieList.json`);
  url.searchParams.set("key", KOFIC_KEY);
  url.searchParams.set("directorNm", directorNm);
  url.searchParams.set("itemPerPage", "30");
  const res = await fetch(url);
  if (!res.ok) return [];
  const data = await res.json();
  return data.movieListResult?.movieList ?? [];
}

async function kobisMovieInfo(movieCd) {
  if (!KOFIC_KEY) return null;
  const url = new URL(`${KOBIS_BASE}/movie/searchMovieInfo.json`);
  url.searchParams.set("key", KOFIC_KEY);
  url.searchParams.set("movieCd", movieCd);
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  return data.movieInfoResult?.movieInfo ?? null;
}

function creditsByName(result, name, role) {
  const includeDirectors = role !== "배우";
  const includeActors = role !== "감독";
  const directors = includeDirectors
    ? (result.directors?.director ?? []).filter((d) => stripHighlight(d.directorNm) === name)
    : [];
  const actors = includeActors
    ? (result.actors?.actor ?? []).filter((a) => stripHighlight(a.actorNm) === name)
    : [];
  return { directors, actors };
}

console.log(`\n############################################################`);
console.log(`# 대상: "${NAME}" (${ROLE})`);
console.log(`############################################################`);

// ── a) 지금 코드(resolvePersonId)와 완전히 같은 절차로 kmdbId를 구한다 ─────────
// app/_lib/kmdb.ts의 searchKmdbPeople + resolvePersonId 로직을 그대로 재현했다.
// (실제 화면에서는 검색창 자동완성이나, 영화 상세정보의 cast 항목에 kmdbId가 없을 때
// withResolvedId(app/_lib/movie-rate-info.ts)가 이 절차로 코드를 역조회한다.)
console.log(`\n== a) resolvePersonId와 동일한 절차로 "${NAME}"의 kmdbId 조회 ==`);
const peopleSearchResults = await kmdbSearch(NAME, 100);
const hitMap = new Map(); // kmdbId -> {name, role}
for (const r of peopleSearchResults) {
  for (const d of r.directors?.director ?? []) {
    const clean = stripHighlight(d.directorNm);
    if (d.directorId && clean === NAME) hitMap.set(d.directorId, { name: clean, role: "감독" });
  }
  for (const a of r.actors?.actor ?? []) {
    const clean = stripHighlight(a.actorNm);
    if (a.actorId && clean === NAME) hitMap.set(a.actorId, { name: clean, role: "배우" });
  }
}
const sameRoleHits = Array.from(hitMap.entries()).filter(([, v]) => v.role === ROLE);
console.log(`이름+역할이 일치하는 서로 다른 kmdbId: ${sameRoleHits.length}개`);
for (const [id] of sameRoleHits) console.log(`  - ${id}`);
let resolvedId = null;
if (sameRoleHits.length === 1) {
  resolvedId = sameRoleHits[0][0];
  console.log(`-> resolvePersonId라면 "${resolvedId}"를 반환했을 것 (정확히 1명).`);
} else if (sameRoleHits.length === 0) {
  console.log(`-> resolvePersonId라면 null을 반환했을 것 (한 명도 못 찾음).`);
} else {
  console.log(`-> resolvePersonId라면 null을 반환했을 것 (동명이인 ${sameRoleHits.length}명 — 우리 수정 이후엔 못 고른다고 판단하고 포기).`);
  console.log(`   ※ 여러 명 중 어느 게 진짜 "${NAME}"인지는 이 정보만으론 알 수 없다 — 직접 KMDb 사이트에서 DOCID를 눌러 확인 필요.`);
}

// ── b) 위에서 구한(또는 후보) kmdbId로 실제 검색 결과 원본을 출력 ────────────
console.log(`\n== b) kmdbId 후보별 실제 KMDb raw 매칭 결과 ==`);
for (const [id] of sameRoleHits) {
  console.log(`\n--- kmdbId=${id} ---`);
  const matches = peopleSearchResults.filter((r) => {
    const { directors, actors } = creditsByName(r, NAME, ROLE);
    return directors.some((d) => d.directorId === id) || actors.some((a) => a.actorId === id);
  });
  console.log(`  이 ID로 매칭되는 영화 수(이름="${NAME}" 검색 결과 100건 중): ${matches.length}`);
  console.log(`  제목 목록: ${matches.map((m) => `${stripHighlight(m.title)}(${m.prodYear})`).join(", ")}`);
}

// ── c) 신고된 영화들을 개별 검색해서 그 안의 "이름" credit과 ID를 확인 ────────
console.log(`\n\n== c) 신고된 영화 ${SUSPECT_TITLES.length}개 개별 조회 ==`);
const rowsForTable = [];
for (const title of SUSPECT_TITLES) {
  console.log(`\n--- "${title}" ---`);
  const results = await kmdbSearch(title, 5);
  if (results.length === 0) {
    console.log("  (KMDb 검색 결과 없음)");
    continue;
  }
  for (const r of results) {
    const cleanTitle = stripHighlight(r.title);
    const { directors, actors } = creditsByName(r, NAME, ROLE);
    const entries = [...directors.map((d) => ({ id: d.directorId, raw: d })), ...actors.map((a) => ({ id: a.actorId, raw: a }))];
    console.log(`  DOCID=${r.DOCID} title="${cleanTitle}" prodYear=${r.prodYear}`);
    if (entries.length === 0) {
      console.log(`    -> "${NAME}"(${ROLE}) credit 없음`);
    } else {
      for (const e of entries) {
        console.log(`    -> credit 발견: id=${e.id}  raw=${JSON.stringify(e.raw)}`);
        rowsForTable.push({ title: cleanTitle, prodYear: r.prodYear, foundId: e.id ?? "(no id)" });
      }
    }
  }

  if (KOFIC_KEY) {
    const kobisCandidates = await kobisSearchMovieList(title);
    const exact = kobisCandidates.filter((m) => (m.movieNm ?? "").trim() === title);
    for (const m of exact) {
      const info = m.movieCd ? await kobisMovieInfo(m.movieCd) : null;
      const castNames = (info?.actors ?? []).map((a) => a.peopleNm);
      const directorNames = (info?.directors ?? []).map((d) => d.peopleNm);
      const inCast = ROLE === "배우" && castNames.some((n) => (n ?? "").trim() === NAME);
      const inDirectors = ROLE === "감독" && directorNames.some((n) => (n ?? "").trim() === NAME);
      console.log(
        `  [KOBIS 대조] movieCd=${m.movieCd} "${NAME}"이(가) 실제 출연/연출진에 있음? ${inCast || inDirectors} (출연진: ${castNames.join(", ")} / 감독: ${directorNames.join(", ")})`
      );
    }
  }
}

// ── d) 비교 표: 진짜 ID 후보 vs 신고된 영화에서 발견된 ID ────────────────────
console.log(`\n\n== d) 비교: "${NAME}"의 kmdbId 후보 vs 신고된 영화들에서 발견된 credit ID ==`);
const candidateIds = new Set(sameRoleHits.map(([id]) => id));
console.log(`후보 kmdbId 집합: ${JSON.stringify(Array.from(candidateIds))}`);
console.table(
  rowsForTable.map((r) => ({
    ...r,
    "후보와 일치?": candidateIds.has(r.foundId),
  }))
);

// ── e) role !== "배우"일 때만 도는 KOBIS 감독명 검색 경로도 별도로 확인 ──────
// person-filmography.ts의 filmographyFromKobisDirector와 완전히 같은 절차 — 이 이름의
// 다른(동명이인) 감독이 KOBIS에 등록돼 있어서 이 경로로 섞여 들어오는지 확인한다.
// 실제 배우 페이지에서는 role="배우"로 고정되어 이 경로가 아예 안 돌아야 정상이다.
if (KOFIC_KEY) {
  console.log(`\n\n== e) (참고) KOBIS directorNm="${NAME}" 검색 결과 — filmographyFromKobisDirector 재현 ==`);
  console.log(`   (정상적인 배우 페이지라면 role="배우"라서 이 함수 자체가 호출되지 않아야 한다.)`);
  const directorHits = await kobisSearchByDirector(NAME);
  console.log(`  결과 ${directorHits.length}건: ${directorHits.map((m) => `${m.movieNm}(${m.openDt?.slice(0, 4) ?? "?"})`).join(", ")}`);
  const overlap = directorHits.filter((m) => SUSPECT_TITLES.includes((m.movieNm ?? "").trim()));
  if (overlap.length > 0) {
    console.log(`  !! 신고된 영화 중 이 감독명 검색으로도 걸리는 것: ${overlap.map((m) => m.movieNm).join(", ")}`);
    console.log(`     -> role이 "배우"로 제대로 안 넘어가서 filmographyFromKobisDirector가 돌았다면 이게 원인일 수 있다.`);
  }
} else {
  console.log("\n(KOFIC_API_KEY 없어서 e) 단계는 생략)");
}
