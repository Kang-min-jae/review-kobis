// 필모그래피 동명이인 버그를 실제 KMDb/KOBIS 응답으로 확인하기 위한 스크립트.
// 이 샌드박스는 외부 네트워크가 막혀 있고 실제 KMDB_API_KEY/KOFIC_API_KEY도 없어
// 여기선 실행할 수 없다 — 사용자 컴퓨터에서 실행하고 출력을 다시 붙여넣어 달라고
// 요청하기 위해 작성했다.
//
// 확인하는 것:
//   1) KMDb에서 문제의 영화를 제목으로 조회했을 때, 그 배우 이름이 actors에 어떤
//      actorId로(또는 여러 개의 서로 다른 actorId로) 등록돼 있는지
//   2) 그 배우 이름 자체로 검색했을 때 서로 다른 actorId가 총 몇 개나 나오는지
//      (동명이인이 KMDb에 실제로 여러 명 등록돼 있는지)
//   3) actor 원본 객체를 통째로 dump해서, 생년월일 같은 필드가 실제로 존재하는지
//   4) (KOFIC_API_KEY가 있으면) KOBIS 쪽 출연진 목록에도 그 이름이 있는지 — 방금
//      추가한 kobis.ts의 교차검증 로직이 실제로 걸러줄지 미리 확인할 수 있다
//
// 실행 방법 (프로젝트 루트에서):
//   node scripts/probe-kmdb-person.mjs

import { config } from "dotenv";

config();
config({ path: ".env.local", override: true });

const KMDB_KEY = process.env.KMDB_API_KEY;
const KOFIC_KEY = process.env.KOFIC_API_KEY;
if (!KMDB_KEY) {
  console.error("KMDB_API_KEY가 .env / .env.local 어디에도 없습니다. 먼저 설정해주세요.");
  process.exit(1);
}

const KMDB_BASE = "http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp";
const KOBIS_BASE = "https://kobis.or.kr/kobisopenapi/webservice/rest";

const CASES = [
  { name: "박정민", suspectTitles: ["하루", "군함도", "메소드", "왕을 참하라"] },
  { name: "안재홍", suspectTitles: ["몽정기", "반칙왕", "기막힌 사내들", "악어"] },
];

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
    console.error(`  [kmdb] HTTP ${res.status}`);
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
  if (!res.ok) {
    console.error(`  [kobis] HTTP ${res.status}`);
    return [];
  }
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

function actorEntriesByName(result, name) {
  return (result.actors?.actor ?? []).filter((a) => stripHighlight(a.actorNm) === name);
}

for (const { name, suspectTitles } of CASES) {
  console.log(`\n\n############################################################`);
  console.log(`# "${name}"`);
  console.log(`############################################################`);

  console.log(`\n== 1) 문제 영화들을 제목으로 KMDb 조회 ==`);
  for (const title of suspectTitles) {
    console.log(`\n--- "${title}" (KMDb) ---`);
    const results = await kmdbSearch(title, 5);
    if (results.length === 0) {
      console.log("  (검색 결과 없음)");
    }
    for (const r of results) {
      const cleanTitle = stripHighlight(r.title);
      const entries = actorEntriesByName(r, name);
      console.log(`  DOCID=${r.DOCID} title="${cleanTitle}" prodYear=${r.prodYear}`);
      if (entries.length > 0) {
        // 필터 없이 원본 객체 그대로 — actorId 외에 birthYear류 필드가 있는지 눈으로 확인.
        console.log(`    -> "${name}" 배우 credit 원본:`, JSON.stringify(entries, null, 2));
      } else {
        console.log(`    -> "${name}"라는 이름의 배우 없음`);
      }
    }

    if (KOFIC_KEY) {
      console.log(`  --- "${title}" (KOBIS 대조) ---`);
      const kobisCandidates = await kobisSearchMovieList(title);
      const exact = kobisCandidates.filter((m) => (m.movieNm ?? "").trim() === title);
      if (exact.length === 0) {
        console.log("    (KOBIS에 정확히 일치하는 제목 없음)");
        continue;
      }
      for (const m of exact) {
        const info = m.movieCd ? await kobisMovieInfo(m.movieCd) : null;
        const castNames = (info?.actors ?? []).map((a) => a.peopleNm);
        const found = castNames.some((n) => (n ?? "").trim() === name);
        console.log(
          `    movieCd=${m.movieCd} openDt=${m.openDt} 출연진에 "${name}" 있음? ${found} (전체 출연진: ${castNames.join(", ")})`
        );
      }
    } else {
      console.log("  (KOFIC_API_KEY 없어서 KOBIS 대조는 생략)");
    }
  }

  console.log(`\n== 2) "${name}" 이름 검색 시 서로 다른 actorId 개수 (KMDb) ==`);
  const nameResults = await kmdbSearch(name, 100);
  const idMap = new Map();
  for (const r of nameResults) {
    const cleanTitle = stripHighlight(r.title);
    for (const entry of actorEntriesByName(r, name)) {
      const id = entry.actorId ?? "(no id)";
      if (!idMap.has(id)) idMap.set(id, []);
      idMap.get(id).push(`${cleanTitle}(${r.prodYear ?? "?"})`);
    }
  }
  console.log(`  서로 다른 actorId 수: ${idMap.size}`);
  for (const [id, titles] of idMap) {
    console.log(`    actorId=${id} : ${titles.slice(0, 6).join(", ")}${titles.length > 6 ? ` 외 ${titles.length - 6}편` : ""}`);
  }
}
