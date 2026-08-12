export type TheaterChain = {
  chain: string;
  branches: string[];
};

export const nationwideTheaters: TheaterChain[] = [
  { chain: "CGV", branches: ["용산아이파크몰", "강남", "왕십리", "센텀시티(부산)", "대구", "대전"] },
  { chain: "롯데시네마", branches: ["월드타워", "건대입구", "인천터미널", "부산광복", "광주", "울산"] },
  { chain: "메가박스", branches: ["코엑스", "성수", "송도", "부산서면", "대구신세계", "제주"] },
  { chain: "독립예술극장", branches: ["아트나인", "에무", "인디스페이스", "광주극장"] },
];
