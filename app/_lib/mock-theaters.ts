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

// CGV/롯데시네마/메가박스는 잘 알려진 안정적인 공식 도메인이 있어 지점 칩도 실제
// 예매 사이트로 바로 연결한다(정확한 지점별 예매 코드까지는 없어서 체인 공통 예매
// 진입점으로 연결 — 사이트 안에서 지점을 고르면 된다). 독립예술극장은 체인마다 예매
// 방식이 제각각이고(디트릭스/자체 사이트/외부 티켓 서비스 등) 도메인이 바뀌거나
// 없어지는 경우도 있어(예: 아트나인의 옛 도메인이 관련 없는 페이지로 바뀐 사례), 항상
// 최신 정보로 연결되도록 검색 결과 페이지를 대신 쓴다.
const CHAIN_URLS: Record<string, string> = {
  CGV: "https://cgv.co.kr",
  롯데시네마: "https://www.lottecinema.co.kr/NLCHS/Ticketing",
  메가박스: "https://www.megabox.co.kr",
};

const chainBranchNames: Record<string, string[]> = {
  CGV: ["용산아이파크몰", "강남", "왕십리", "센텀시티(부산)", "대구", "대전"],
  롯데시네마: ["월드타워", "건대입구", "인천터미널", "부산광복", "광주", "울산"],
  메가박스: ["코엑스", "성수", "송도", "부산서면", "대구신세계", "제주"],
  독립예술극장: ["아트나인", "에무", "인디스페이스", "광주극장"],
};

function naverSearchUrl(query: string): string {
  return `https://search.naver.com/search.naver?query=${encodeURIComponent(query)}`;
}

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
