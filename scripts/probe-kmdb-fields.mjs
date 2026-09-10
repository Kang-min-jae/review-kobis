// "단편·독립영화" 탭 작업 1단계 — KMDb Open API 응답에 독립/예술영화를 구분할 만한
// 필드가 있는지 실제로 확인하기 위한 조사용 스크립트. 이 샌드박스는 외부 네트워크가
// 막혀 있고 실제 KMDB_API_KEY도 없어서 여기선 실행할 수 없다 — 사용자 컴퓨터에서
// 직접 실행하고 그 출력을 다시 붙여넣어 달라고 요청하기 위해 작성했다.
//
// 실행 방법 (프로젝트 루트에서):
//   node scripts/probe-kmdb-fields.mjs
// KMDB_API_KEY는 .env.local에 있다 — Next.js와 같은 순서로 .env를 먼저 읽고
// .env.local이 있으면 그 값으로 덮어쓴다.

import { config } from "dotenv";

config();
config({ path: ".env.local", override: true });

const KEY = process.env.KMDB_API_KEY;
if (!KEY) {
  console.error("KMDB_API_KEY가 .env / .env.local 어디에도 없습니다. 먼저 설정해주세요.");
  process.exit(1);
}

const BASE = "http://api.koreafilm.or.kr/openapi-data2/wisenut/search_api/search_json2.jsp";

// 알려진 장편 독립/예술영화 몇 편 + 일반 상업영화 1편(대조군) + 장르/키워드 검색 한 번.
// 실제 KMDb에 어떤 필드로 등록돼 있는지 원본 그대로 찍어본다.
const QUERIES = [
  { label: "독립영화(벌새, 2019)", query: "벌새", listCount: 5 },
  { label: "독립영화(소공녀, 2018)", query: "소공녀", listCount: 5 },
  { label: "독립영화(잘잘못, 2023)", query: "잘잘못", listCount: 5 },
  { label: "상업영화 대조군(범죄도시)", query: "범죄도시", listCount: 3 },
  { label: "장르 키워드 검색(독립영화)", query: "독립영화", listCount: 10 },
];

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

function summarize(result) {
  // 우리가 이미 아는 필드(genre/nation/type/rating/runtime) + 그 외 이 응답에 실제로
  // 존재하는 모든 최상위 키를 같이 보여준다. company/제작사/배급사/keyword 같은,
  // 지금 코드가 안 쓰는 필드가 있는지 확인하기 위함.
  const known = {
    title: result.title,
    prodYear: result.prodYear,
    genre: result.genre,
    nation: result.nation,
    type: result.type,
    rating: result.rating,
    runtime: result.runtime,
  };
  return { known, allTopLevelKeys: Object.keys(result) };
}

for (const { label, query, listCount } of QUERIES) {
  console.log(`\n=== ${label} — query="${query}" ===`);
  const results = await search(query, listCount);
  if (results.length === 0) {
    console.log("  (결과 없음)");
    continue;
  }
  for (const r of results.slice(0, 5)) {
    console.log(JSON.stringify(summarize(r), null, 2));
  }
}
