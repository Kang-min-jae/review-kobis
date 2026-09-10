// KOFIC(KOBIS) Open API에 영화인(인물) 전용 엔드포인트가 있는지, 있다면 정확히
// 어떤 필드를 주는지 확인하는 스크립트. 이 샌드박스는 KOFIC_API_KEY와 외부
// 네트워크가 없어 여기선 실행할 수 없다 — 사용자 컴퓨터에서 실행하고 출력을
// 다시 붙여넣어 달라고 요청하기 위해 작성했다.
//
// 확인하는 것:
//   1) searchPeopleList — 이름으로 영화인 목록 조회. peopleCd/peopleNm/
//      repRoleNm/filmoNames 필드가 실제로 있는지, filmoNames가 단순 문자열인지
//      구조화된 배열인지.
//   2) searchPeopleInfo — searchMovieInfo와 같은 명명 규칙을 따른다면 존재할
//      "영화인 상세정보" 엔드포인트 추정 호출. 존재 여부 자체가 불확실하다.
//   3) searchMovieInfo(영화 상세정보)의 actors/directors 안에 peopleCd가 이미
//      들어있는지 — 있다면 영화 캐스팅 목록에서 바로 정확한 인물 코드를 얻을 수
//      있어서 이름 매칭 자체가 필요 없어진다(가장 중요한 확인 사항).
//
// 실행 방법 (프로젝트 루트에서):
//   node scripts/probe-kofic-people.mjs "박정민" "안재홍" "황정민"
//   (뒤에 영화 코드를 주면 3번도 같이 확인: node scripts/probe-kofic-people.mjs 박정민 -- 20115615)

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

const KEY = process.env.KOFIC_API_KEY;
if (!KEY) {
  console.error("KOFIC_API_KEY가 .env / .env.local 어디에도 없습니다.");
  process.exit(1);
}

const BASE = "https://kobis.or.kr/kobisopenapi/webservice/rest";

const args = process.argv.slice(2);
const sepIndex = args.indexOf("--");
const names = sepIndex === -1 ? args : args.slice(0, sepIndex);
const movieCds = sepIndex === -1 ? [] : args.slice(sepIndex + 1);
const NAMES = names.length > 0 ? names : ["박정민", "안재홍", "황정민"];

async function get(path, params) {
  const url = new URL(`${BASE}/${path}`);
  url.searchParams.set("key", KEY);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) {
    console.error(`  HTTP ${res.status}: ${text.slice(0, 300)}`);
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    console.error(`  JSON 파싱 실패, 원본 응답: ${text.slice(0, 300)}`);
    return null;
  }
}

console.log(`\n########## 1) searchPeopleList ##########`);
for (const name of NAMES) {
  console.log(`\n--- "${name}" ---`);
  const data = await get("people/searchPeopleList.json", { peopleNm: name, itemPerPage: "10" });
  if (!data) continue;
  console.log(JSON.stringify(data, null, 2));
}

console.log(`\n\n########## 2) searchPeopleInfo (존재 여부 불확실, 추정 호출) ##########`);
// 1번 응답에서 얻은 peopleCd로 시도한다. 이름만으로는 어떤 peopleCd를 넣어야 할지
// 모르니, 각 이름의 첫 번째 결과의 peopleCd를 재사용한다.
for (const name of NAMES) {
  const list = await get("people/searchPeopleList.json", { peopleNm: name, itemPerPage: "1" });
  const peopleCd = list?.peopleListResult?.peopleList?.[0]?.peopleCd;
  if (!peopleCd) {
    console.log(`\n--- "${name}": peopleCd를 못 구해서 상세조회 생략 ---`);
    continue;
  }
  console.log(`\n--- "${name}" (peopleCd=${peopleCd}) ---`);
  const info = await get("people/searchPeopleInfo.json", { peopleCd });
  if (info) console.log(JSON.stringify(info, null, 2));
}

if (movieCds.length > 0) {
  console.log(`\n\n########## 3) searchMovieInfo의 actors/directors 원본 (peopleCd 포함 여부) ##########`);
  for (const movieCd of movieCds) {
    console.log(`\n--- movieCd=${movieCd} ---`);
    const info = await get("movie/searchMovieInfo.json", { movieCd });
    const movieInfo = info?.movieInfoResult?.movieInfo;
    if (!movieInfo) continue;
    console.log("directors:", JSON.stringify(movieInfo.directors, null, 2));
    console.log("actors(상위 5명):", JSON.stringify(movieInfo.actors?.slice(0, 5), null, 2));
  }
} else {
  console.log(`\n\n########## 3) 영화 상세정보 확인은 생략됨 ##########`);
  console.log(`movieCd를 인자로 주면 확인합니다. 예: node scripts/probe-kofic-people.mjs 박정민 -- 20115615`);
}
