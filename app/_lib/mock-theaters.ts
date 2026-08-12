import { nowInTheaters } from "./mock-movies";

export const daysOfWeek = ["월", "화", "수", "목", "금", "토", "일"] as const;
export type DayOfWeek = (typeof daysOfWeek)[number];

export type Screening = {
  movieId: string;
  days: DayOfWeek[];
};

export type TheaterBranch = {
  name: string;
  screenings: Screening[];
};

export type TheaterChain = {
  chain: string;
  branches: TheaterBranch[];
};

const chainBranchNames: Record<string, string[]> = {
  CGV: ["용산아이파크몰", "강남", "왕십리", "센텀시티(부산)", "대구", "대전"],
  롯데시네마: ["월드타워", "건대입구", "인천터미널", "부산광복", "광주", "울산"],
  메가박스: ["코엑스", "성수", "송도", "부산서면", "대구신세계", "제주"],
  독립예술극장: ["아트나인", "에무", "인디스페이스", "광주극장"],
};

// 지점마다 상영작/상영 요일을 결정적으로 배정 (실제 상영 시간표가 생기기 전까지의 목데이터)
function screeningsForBranch(branchIndex: number): Screening[] {
  return nowInTheaters
    .map((movie, movieIndex) => ({ movie, movieIndex }))
    .filter(({ movieIndex }) => (branchIndex + movieIndex) % 3 !== 0)
    .map(({ movie, movieIndex }) => {
      const seed = branchIndex * 5 + movieIndex * 3;
      return {
        movieId: movie.id,
        // dayIndex * 4 mod 7 순회로 각 요일에 고르게 다른 값을 부여해 요일별로 상영 여부가 갈리게 함
        days: daysOfWeek.filter((_, dayIndex) => ((dayIndex * 4 + seed) % 7) < 4),
      };
    });
}

let branchCursor = 0;
export const nationwideTheaters: TheaterChain[] = Object.entries(chainBranchNames).map(
  ([chain, names]) => ({
    chain,
    branches: names.map((name) => ({
      name,
      screenings: screeningsForBranch(branchCursor++),
    })),
  })
);

export function getScreeningChains(movieId: string, day: DayOfWeek) {
  return nationwideTheaters
    .map((theater) => ({
      chain: theater.chain,
      branches: theater.branches.filter((branch) =>
        branch.screenings.some((s) => s.movieId === movieId && s.days.includes(day))
      ),
    }))
    .filter((theater) => theater.branches.length > 0);
}
