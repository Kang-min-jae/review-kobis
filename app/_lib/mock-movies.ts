export type Movie = {
  id: string;
  title: string;
<<<<<<< HEAD
  englishTitle?: string; // KOBIS 검색 폴백용 (한글 제목으로 못 찾을 때 재시도)
  description: string; // KOBIS엔 줄거리가 없어 못 가져왔을 때 쓰는 목데이터 설명
=======
  englishTitle?: string; // TMDB 검색 폴백용 (원어 제목이 매칭률이 더 높다)
  description: string; // TMDB 줄거리를 못 가져왔을 때 쓰는 목데이터 설명
>>>>>>> 508a22314e5b678532d46dcd244e06a99fcc8914
  gradient: string;
  releaseDate: string; // ISO yyyy-mm-dd
  isNowShowing: boolean;
  isRerelease: boolean;
};

export const allMovies: Movie[] = [
  // 현재 상영중
  {
    id: "spider-man-brand-new-day",
    title: "스파이더맨: 브랜드 뉴 데이",
    englishTitle: "Spider-Man: Brand New Day",
    description: "새로운 위협 앞에서 정체성을 다시 마주하게 된 스파이더맨의 이야기.",
    gradient: "from-red-900 via-red-700 to-orange-500",
    releaseDate: "2026-08-05",
    isNowShowing: true,
    isRerelease: false,
  },
  {
    id: "super-troopers-3",
    title: "슈퍼 트루퍼스 3",
    englishTitle: "Super Troopers 3",
    description: "괴짜 주 경찰관들이 돌아온 코미디 시리즈의 세 번째 이야기.",
    gradient: "from-blue-900 via-indigo-700 to-slate-500",
    releaseDate: "2026-08-01",
    isNowShowing: true,
    isRerelease: false,
  },
  {
    id: "one-night-only",
    title: "원 나잇 온리",
    englishTitle: "One Night Only",
    description: "하룻밤 사이 얽히고설킨 인연들을 그린 스릴러.",
    gradient: "from-emerald-900 via-teal-700 to-lime-500",
    releaseDate: "2026-08-07",
    isNowShowing: true,
    isRerelease: false,
  },
  {
    id: "ice-cream-man",
    title: "아이스크림 맨",
    englishTitle: "Ice Cream Man",
    description: "동네에 나타난 수상한 아이스크림 트럭을 둘러싼 공포 이야기.",
    gradient: "from-sky-900 via-cyan-700 to-blue-400",
    releaseDate: "2026-07-30",
    isNowShowing: true,
    isRerelease: false,
  },
  {
    id: "the-odyssey",
    title: "오디세이",
    englishTitle: "The Odyssey",
    description: "귀향을 향한 기나긴 여정을 그린 대서사시.",
    gradient: "from-neutral-800 via-neutral-600 to-neutral-400",
    releaseDate: "2026-07-17",
    isNowShowing: true,
    isRerelease: false,
  },

  // 현재 상영중 + 재개봉
  {
    id: "only-yesterday",
    title: "오직 어제만",
    englishTitle: "Only Yesterday",
    description: "지나간 기억과 마주하며 성장하는 한 여성의 이야기를 그린 애니메이션.",
    gradient: "from-amber-800 via-yellow-600 to-orange-300",
    releaseDate: "2026-08-01",
    isNowShowing: true,
    isRerelease: true,
  },
  {
    id: "your-name-anniversary",
    title: "너의 이름은. 10주년",
    englishTitle: "Your Name.",
    description: "서로 몸이 뒤바뀐 두 소년소녀가 운명적으로 얽히는 이야기, 10주년 재개봉판.",
    gradient: "from-fuchsia-900 via-purple-700 to-indigo-400",
    releaseDate: "2026-08-03",
    isNowShowing: true,
    isRerelease: true,
  },
];

export const nowInTheaters = allMovies.filter((m) => m.isNowShowing);

export function getMovieById(id: string): Movie | undefined {
  return allMovies.find((m) => m.id === id);
}
