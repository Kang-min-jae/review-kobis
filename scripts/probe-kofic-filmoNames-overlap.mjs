// person-filmography.ts의 filmographyFromKofic이 실제로 왜 "파수꾼"을 못 찾는지
// 정확히 확인하는 스크립트. 두 가지를 직접 눈으로 보여준다:
//   1) KOFIC searchPeopleList("박정민")의 각 후보(peopleCd)별 filmoNames 전체 —
//      "파수꾼"이 어느 후보에게든 애초에 들어있는지.
//   2) 그 후보의 filmoNames가, 우리가 KMDb로 이미 확인한 이 사람의 진짜 필모그래피
//      (knownTitles)와 실제로 겹치는지 — 겹치는 후보가 정확히 하나여야 그 후보를
//      채택한다(현재 코드 로직 그대로 재현).
//
// 이 샌드박스는 KMDB_API_KEY/KOFIC_API_KEY와 네트워크가 없어 여기선 실행 못 한다 —
// 사용자 컴퓨터에서 실행해서 결과를 붙여넣어 달라고 요청하기 위해 작성했다.
//
// 실행 방법 (프로젝트 루트에서):
//   node scripts/probe-kofic-filmoNames-overlap.mjs 박정민 00045706 배우

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

const KMDB_KEY = process.env.KMDB_API_KEY;
const KOFIC_KEY = process.env.KOFIC_API_KEY;
if (!KMDB_KEY || !KOFIC_KEY) {
  console.error("KMDB_API_KEY와 KOFIC_API_KEY가 둘 다 필요합니다.");
  process.exit(1);
}

const [, , NAME, TARGET_KMDB_ID, ROLE_ARG] = process.argv;
if (!NAME || !TARGET_KMDB_ID) {
  console.error("사용법: node scripts/probe-kofic-filmoNames-overlap.mjs <이름> <kmdbId> [배우|감독]");
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

async function kmdbKnownTitles(name, targetId, role) {
  const url = new URL(KMDB_BASE);
  url.searchParams.set("collection", "kmdb_new2");
  url.searchParams.set("detail", "Y");
  url.searchParams.set("listCount", "100");
  url.searchParams.set("ServiceKey", KMDB_KEY);
  url.searchParams.set("query", name);
  const res = await fetch(url);
  const data = await res.json();
  const results = data.Data?.[0]?.Result ?? [];
  const includeDirectors = role !== "배우";
  const includeActors = role !== "감독";
  const titles = new Set();
  for (const r of results) {
    const directors = includeDirectors ? (r.directors?.director ?? []) : [];
    const actors = includeActors ? (r.actors?.actor ?? []) : [];
    const hit =
      directors.some((d) => d.directorId != null && String(d.directorId).trim() === targetId) ||
      actors.some((a) => a.actorId != null && String(a.actorId).trim() === targetId);
    if (hit) titles.add(normalize(stripHighlight(r.title)));
  }
  return titles;
}

async function koficPeopleList(peopleNm) {
  const url = new URL(`${KOBIS_BASE}/people/searchPeopleList.json`);
  url.searchParams.set("key", KOFIC_KEY);
  url.searchParams.set("peopleNm", peopleNm);
  url.searchParams.set("itemPerPage", "10");
  const res = await fetch(url);
  const text = await res.text();
  console.log(`\n[원본 응답] GET people/searchPeopleList.json?peopleNm=${peopleNm}`);
  console.log(text);
  const data = JSON.parse(text);
  return data.peopleListResult?.peopleList ?? [];
}

async function main() {
  console.log(`\n########## 1) KMDb에서 확인된 "${NAME}"(kmdbId=${TARGET_KMDB_ID})의 진짜 필모그래피 ##########`);
  const knownTitles = await kmdbKnownTitles(NAME, TARGET_KMDB_ID, ROLE);
  console.log(`${knownTitles.size}편: ${Array.from(knownTitles).join(", ")}`);
  console.log(`"파수꾼"이 이 목록에 있는가? ${knownTitles.has(normalize("파수꾼"))}`);

  console.log(`\n\n########## 2) KOFIC searchPeopleList("${NAME}") 후보별 filmoNames ##########`);
  const people = await koficPeopleList(NAME);
  if (people.length === 0) {
    console.log("KOFIC에 이 이름으로 등록된 인물이 없습니다.");
    return;
  }

  for (const p of people) {
    const filmoNames = (p.filmoNames ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const normalizedFilmoNames = filmoNames.map(normalize);
    const overlapWithKnown = filmoNames.filter((_, i) => knownTitles.has(normalizedFilmoNames[i]));
    const hasWatchman = normalizedFilmoNames.includes(normalize("파수꾼"));

    console.log(`\n--- peopleCd=${p.peopleCd} peopleNm=${p.peopleNm} repRoleNm=${p.repRoleNm ?? "(없음)"} ---`);
    console.log(`filmoNames 원본 문자열: "${p.filmoNames ?? ""}"`);
    console.log(`분리된 제목 수: ${filmoNames.length}`);
    console.log(`"파수꾼" 포함 여부: ${hasWatchman}`);
    console.log(`KMDb 확인 필모그래피와 겹치는 제목(${overlapWithKnown.length}개): ${overlapWithKnown.join(", ") || "(없음)"}`);
  }

  const withOverlap = people.filter((p) => {
    const filmoNames = (p.filmoNames ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return filmoNames.some((t) => knownTitles.has(normalize(t)));
  });
  console.log(`\n\n========== 최종 판정 (person-filmography.ts filmographyFromKofic과 동일 로직) ==========`);
  console.log(`이름이 정확히 일치하는 KOFIC 후보 수: ${people.filter((p) => p.peopleNm === NAME).length}`);
  console.log(`KMDb 필모그래피와 겹치는 후보 수: ${withOverlap.length}`);
  if (withOverlap.length === 1) {
    console.log(`-> 채택됨: peopleCd=${withOverlap[0].peopleCd}. 이 후보의 filmoNames에 "파수꾼"이 있는지가 관건.`);
  } else {
    console.log(`-> 채택 안 됨(0명 또는 여러 명 겹침) — 지금 코드는 이 경우 KOFIC 보완을 포기합니다.`);
  }
}

main();
