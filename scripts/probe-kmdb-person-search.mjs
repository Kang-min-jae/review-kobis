// 검색 자동완성에서 "황정민"/"박정민" 같은 동명이인이 실제로 KMDb에 몇 명이나
// 등록돼 있는지, 각 사람의 raw 데이터(생년월일류 필드 포함 여부)를 확인하는 스크립트.
// 이 샌드박스는 KMDB_API_KEY와 외부 네트워크가 없어 여기선 실행할 수 없다 — 사용자
// 컴퓨터에서 실행하고 출력을 다시 붙여넣어 달라고 요청하기 위해 작성했다.
//
// 실행 방법 (프로젝트 루트에서):
//   node scripts/probe-kmdb-person-search.mjs 황정민 박정민

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

const KEY = process.env.KMDB_API_KEY;
if (!KEY) {
  console.error("KMDB_API_KEY가 .env / .env.local 어디에도 없습니다.");
  process.exit(1);
}

const BASE = "http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp";
const names = process.argv.slice(2);
const NAMES = names.length > 0 ? names : ["황정민", "박정민"];

function stripHighlight(s) {
  return (s ?? "").replace(/!HS\s*/g, "").replace(/!HE\s*/g, "").trim();
}

async function search(query, listCount) {
  const url = new URL(BASE);
  url.searchParams.set("collection", "kmdb_new2");
  url.searchParams.set("detail", "Y");
  url.searchParams.set("listCount", String(listCount));
  url.searchParams.set("ServiceKey", KEY);
  url.searchParams.set("query", query);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`  HTTP ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.Data?.[0]?.Result ?? [];
}

for (const name of NAMES) {
  console.log(`\n############################################################`);
  console.log(`# "${name}" — 자동완성이 실제로 쓰는 것과 같은 listCount=30으로 검색`);
  console.log(`############################################################`);

  const results = await search(name, 30);
  console.log(`검색 결과(영화) ${results.length}건 스캔`);

  const idMap = new Map(); // kmdbId -> { role, count, years: [], sampleRaw }
  for (const r of results) {
    for (const d of r.directors?.director ?? []) {
      if (stripHighlight(d.directorNm) !== name || !d.directorId) continue;
      const e = idMap.get(d.directorId) ?? { role: "감독", count: 0, years: [], sampleRaw: d };
      e.count++;
      if (r.prodYear) e.years.push(r.prodYear);
      idMap.set(d.directorId, e);
    }
    for (const a of r.actors?.actor ?? []) {
      if (stripHighlight(a.actorNm) !== name || !a.actorId) continue;
      const e = idMap.get(a.actorId) ?? { role: "배우", count: 0, years: [], sampleRaw: a };
      e.count++;
      if (r.prodYear) e.years.push(r.prodYear);
      idMap.set(a.actorId, e);
    }
  }

  console.log(`\n이름+역할이 정확히 "${name}"으로 등록된 서로 다른 kmdbId: ${idMap.size}명`);
  for (const [id, e] of idMap) {
    const years = e.years.map(Number).filter((n) => !Number.isNaN(n));
    const range = years.length > 0 ? `${Math.min(...years)}~${Math.max(...years)}` : "확인 불가";
    console.log(`\n  kmdbId=${id} role=${e.role} credit수=${e.count} 활동연도범위=${range}`);
    console.log(`  raw 객체(원본, 생년월일류 필드 있는지 확인용): ${JSON.stringify(e.sampleRaw)}`);
  }

  if (idMap.size > 1) {
    console.log(`\n  -> 진짜 동명이인 ${idMap.size}명이 KMDb에 등록돼 있음(중복 렌더링 버그 아님).`);
    const ghostCandidates = Array.from(idMap.entries()).filter(([, e]) => e.count === 1);
    if (ghostCandidates.length > 0) {
      console.log(
        `  -> 이 중 credit이 1번뿐인 후보(유령 의심): ${ghostCandidates.map(([id]) => id).join(", ")} — 지금 코드는 동명이인이 여럿일 때 이런 후보를 자동완성에서 제외하도록 고쳤습니다.`
      );
    }
  }
}
