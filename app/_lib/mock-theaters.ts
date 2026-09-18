// 실제 상영 시간표를 주는 API가 없어서, 지점별 상영작 배정은 결정적 규칙으로 근사한다.
// 상영작 목록 자체는 항상 실시간 KOBIS 데이터(현재 상영중 + 재개봉 중)에서 받아온다.

export type TheaterBranch = {
  name: string;
  url: string;
  movieIds: string[]; // 이 지점에서 상영 중인 것으로 배정된 영화 id들
};

export type TheaterChain = {
  chain: string;
  url: string;
  branches: TheaterBranch[];
};

function naverSearchUrl(query: string): string {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`;
}

// CGV/롯데시네마/메가박스는 공식 예매 페이지로 바로 연결한다.
// 독립/예술극장은 도메인이 바뀌거나 없어지는 경우가 많아 네이버 검색 결과로 연결하거나
// 검증된 공식 도메인을 사용한다.
const CHAIN_URLS: Record<string, string> = {
  CGV: "https://www.cgv.co.kr/ticketing/",
  롯데시네마: "https://www.lottecinema.co.kr/NLCHS/Ticketing",
  메가박스: "https://www.megabox.co.kr/booking",
};

export const INDIE_THEATERS: { name: string; url: string }[] = [
  { name: "아트나인", url: "https://www.dtryx.com/cinema/main.do?cgid=FE8EF4D2-F22D-4802-A39A-D58F23A29C1E&BrandCd=etc&CinemaCd=000162" },
  { name: "아트하우스 모모", url: "https://arthousemomo.co.kr/" },
  { name: "씨네큐브 광화문", url: "https://www.cinecube.co.kr" },
  { name: "에무시네마", url: naverSearchUrl("에무시네마 예매") },
];

const chainBranchNames: Record<string, string[]> = {
  CGV: ["용산아이파크몰", "강남", "왕십리", "센텀시티(부산)", "대구", "대전"],
  롯데시네마: ["월드타워", "건대입구", "인천터미널", "부산광복", "광주", "울산"],
  메가박스: ["코엑스", "성수", "송도", "부산서면", "대구신세계", "제주"],
  독립예술극장: INDIE_THEATERS.map((t) => t.name),
};

function branchUrl(chain: string, branchName: string): string {
  return CHAIN_URLS[chain] ?? naverSearchUrl(`${chain} ${branchName} 예매`);
}

// 지점마다 상영작을 결정적으로 배정 (실제 상영 시간표가 생기기 전까지의 근사치)
function moviesForBranch(branchIndex: number, movies: { id: string }[]): string[] {
  return movies
    .filter((_, movieIndex) => (branchIndex + movieIndex) % 3 !== 0)
    .map((movie) => movie.id);
}

export function getNationwideTheaters(movies: { id: string }[]): TheaterChain[] {
  let branchCursor = 0;
  return Object.entries(chainBranchNames).map(([chain, names]) => ({
    chain,
    url: CHAIN_URLS[chain] ?? naverSearchUrl(`${chain} 예매`),
    branches: names.map((name) => ({
      name,
      url: branchUrl(chain, name),
      movieIds: moviesForBranch(branchCursor++, movies),
    })),
  }));
}
