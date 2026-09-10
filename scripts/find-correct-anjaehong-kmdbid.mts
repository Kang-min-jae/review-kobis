// probe-anjaehong-filmography.mts 결과, kmdbId=00187551로 찾은 필모그래피(슬로우 비디오,
// 무도리, 보리울의 여름, 몽정기, 호모 파베르, 반칙왕, 기막힌 사내들, 악어 — 전부
// 1996~2014년)가 사용자가 확인한 실제 프로필(밤의 해변에서 혼자/조작된 도시/산나물
// 처녀/걷기왕 등 2016~2017년 영화들)과 전혀 겹치지 않는다 — 즉 00187551 자체가
// 처음부터 동명이인의 잘못된 코드였을 가능성이 크다.
//
// 이름으로 검색하면(rawSearch) 관련도순 100건 안에 여러 사람이 섞여 신뢰할 수 없으므로,
// 반대로 접근한다: 실제 이 배우가 나온 것으로 알려진 영화 "제목"으로 먼저 영화를 찾고
// (searchKmdbMovie), 그 영화의 출연진 목록 안에서 "안재홍"에게 실제로 붙은 kmdbId를
// 읽어낸다. 여러 영화에서 같은 코드가 반복해서 나오면 그게 진짜 코드다.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/find-correct-anjaehong-kmdbid.mts

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

const NAME = "안재홍";
const KNOWN_TITLES: { title: string; yearHint: string }[] = [
  { title: "밤의 해변에서 혼자", yearHint: "2017" },
  { title: "조작된 도시", yearHint: "2017" },
  { title: "산나물 처녀", yearHint: "2016" },
  { title: "걷기왕", yearHint: "2016" },
];

async function main() {
  const { searchKmdbMovie } = await import("../app/_lib/kmdb");

  const foundIds = new Map<string, string[]>(); // kmdbId -> titles

  for (const { title, yearHint } of KNOWN_TITLES) {
    const movie = await searchKmdbMovie(title, yearHint);
    if (!movie) {
      console.log(`"${title}"(${yearHint}) — KMDb에서 영화 자체를 못 찾음`);
      continue;
    }
    const hit = movie.cast.find((c) => c.name === NAME) ?? (movie.director?.name === NAME ? movie.director : null);
    if (!hit) {
      console.log(
        `"${title}"(${yearHint}) 찾음(docId=${movie.docId}), 그런데 출연/감독진에 "${NAME}"이 없음. ` +
          `cast: ${movie.cast.map((c) => c.name).join(", ")}`
      );
      continue;
    }
    console.log(`"${title}"(${yearHint}) — "${NAME}"의 kmdbId = ${hit.kmdbId ?? "(없음)"}`);
    if (hit.kmdbId) {
      const list = foundIds.get(hit.kmdbId) ?? [];
      list.push(title);
      foundIds.set(hit.kmdbId, list);
    }
  }

  console.log(`\n========== 정리 ==========`);
  if (foundIds.size === 0) {
    console.log("어느 영화에서도 kmdbId를 확인하지 못했습니다.");
  } else {
    for (const [kmdbId, titles] of foundIds) {
      console.log(`kmdbId=${kmdbId} : ${titles.length}편에서 확인됨 (${titles.join(", ")})`);
    }
    if (foundIds.size === 1) {
      const [kmdbId] = foundIds.keys();
      console.log(`\n-> 모든 영화에서 같은 코드(${kmdbId})가 나왔습니다. 이게 진짜 안재홍(배우)의 kmdbId일 가능성이 큽니다.`);
      console.log(`   (참고로 기존에 잘못 쓰던 코드는 00187551 이었습니다.)`);
    } else {
      console.log(`\n-> 영화마다 다른 코드가 나왔습니다 — KMDb 데이터 자체의 일관성 문제일 수 있어 추가 확인이 필요합니다.`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
