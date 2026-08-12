export type Movie = {
  id: string;
  title: string;
  gradient: string;
};

export const nowInTheaters: Movie[] = [
  { id: "spider-man-brand-new-day", title: "스파이더맨: 브랜드 뉴 데이", gradient: "from-red-900 via-red-700 to-orange-500" },
  { id: "super-troopers-3", title: "슈퍼 트루퍼스 3", gradient: "from-blue-900 via-indigo-700 to-slate-500" },
  { id: "one-night-only", title: "원 나잇 온리", gradient: "from-emerald-900 via-teal-700 to-lime-500" },
  { id: "ice-cream-man", title: "아이스크림 맨", gradient: "from-sky-900 via-cyan-700 to-blue-400" },
  { id: "the-odyssey", title: "오디세이", gradient: "from-neutral-800 via-neutral-600 to-neutral-400" },
  { id: "only-yesterday", title: "오직 어제만", gradient: "from-amber-800 via-yellow-600 to-orange-300" },
];
