export type Movie = {
  id: string;
  title: string;
  gradient: string;
  releaseDate: string; // ISO yyyy-mm-dd
  isNowShowing: boolean;
  isRerelease: boolean;
};

export const allMovies: Movie[] = [
  // 현재 상영중
  { id: "spider-man-brand-new-day", title: "스파이더맨: 브랜드 뉴 데이", gradient: "from-red-900 via-red-700 to-orange-500", releaseDate: "2026-08-05", isNowShowing: true, isRerelease: false },
  { id: "super-troopers-3", title: "슈퍼 트루퍼스 3", gradient: "from-blue-900 via-indigo-700 to-slate-500", releaseDate: "2026-08-01", isNowShowing: true, isRerelease: false },
  { id: "one-night-only", title: "원 나잇 온리", gradient: "from-emerald-900 via-teal-700 to-lime-500", releaseDate: "2026-08-07", isNowShowing: true, isRerelease: false },
  { id: "ice-cream-man", title: "아이스크림 맨", gradient: "from-sky-900 via-cyan-700 to-blue-400", releaseDate: "2026-07-30", isNowShowing: true, isRerelease: false },
  { id: "the-odyssey", title: "오디세이", gradient: "from-neutral-800 via-neutral-600 to-neutral-400", releaseDate: "2026-07-17", isNowShowing: true, isRerelease: false },

  // 현재 상영중 + 재개봉
  { id: "only-yesterday", title: "오직 어제만", gradient: "from-amber-800 via-yellow-600 to-orange-300", releaseDate: "2026-08-01", isNowShowing: true, isRerelease: true },
  { id: "your-name-anniversary", title: "너의 이름은. 10주년", gradient: "from-fuchsia-900 via-purple-700 to-indigo-400", releaseDate: "2026-08-03", isNowShowing: true, isRerelease: true },

  // 백카탈로그 (Best 목록용, 현재 미상영)
  { id: "spring-in-seoul", title: "봄, 서울에서", gradient: "from-pink-900 via-rose-700 to-orange-300", releaseDate: "2026-03-15", isNowShowing: false, isRerelease: false },
  { id: "midnight-runner", title: "미드나잇 러너", gradient: "from-slate-900 via-zinc-700 to-neutral-400", releaseDate: "2025-11-20", isNowShowing: false, isRerelease: false },
  { id: "the-last-orchard", title: "라스트 오차드", gradient: "from-lime-900 via-green-700 to-emerald-400", releaseDate: "2024-06-02", isNowShowing: false, isRerelease: false },
  { id: "silent-harbor", title: "사일런트 하버", gradient: "from-cyan-900 via-sky-700 to-blue-300", releaseDate: "2022-09-14", isNowShowing: false, isRerelease: false },
  { id: "glass-garden", title: "글라스 가든", gradient: "from-rose-900 via-pink-700 to-fuchsia-300", releaseDate: "2019-04-20", isNowShowing: false, isRerelease: false },
  { id: "harbor-lights", title: "하버 라이츠", gradient: "from-orange-900 via-amber-700 to-yellow-300", releaseDate: "2017-11-11", isNowShowing: false, isRerelease: false },
];

export const nowInTheaters = allMovies.filter((m) => m.isNowShowing);

export function getMovieById(id: string): Movie | undefined {
  return allMovies.find((m) => m.id === id);
}
