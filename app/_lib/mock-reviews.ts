export type ReviewType = "short" | "long";

export type Review = {
  id: string;
  movieId: string;
  type: ReviewType;
  rating: number; // 0 ~ 10
  content: string;
  createdAt: string; // ISO
};

export const seedReviews: Review[] = [
  { id: "seed-1", movieId: "spider-man-brand-new-day", type: "short", rating: 9, content: "액션이 미쳤다, 올해 최고", createdAt: "2026-08-01T00:00:00.000Z" },
  { id: "seed-2", movieId: "spider-man-brand-new-day", type: "short", rating: 9, content: "역대급 스파이더맨, 눈물 참기 힘들었음", createdAt: "2026-08-02T00:00:00.000Z" },
  { id: "seed-3", movieId: "spider-man-brand-new-day", type: "long", rating: 9, content: "액션 연출부터 캐릭터 서사까지 흠잡을 데가 없는 작품. 특히 후반부 전개가 인상 깊었다.", createdAt: "2026-08-03T00:00:00.000Z" },

  { id: "seed-4", movieId: "super-troopers-3", type: "short", rating: 4, content: "예전만큼의 재미는 아니었음", createdAt: "2026-08-01T00:00:00.000Z" },
  { id: "seed-5", movieId: "super-troopers-3", type: "short", rating: 6, content: "그래도 웃긴 장면 꽤 있었다", createdAt: "2026-08-02T00:00:00.000Z" },
  { id: "seed-6", movieId: "super-troopers-3", type: "long", rating: 5, content: "향수를 자극하는 개그는 여전하지만 신선함은 부족했다. 팬이라면 볼만함.", createdAt: "2026-08-03T00:00:00.000Z" },

  { id: "seed-7", movieId: "one-night-only", type: "short", rating: 4, content: "긴장감은 있는데 결말이 아쉬움", createdAt: "2026-08-01T00:00:00.000Z" },
  { id: "seed-8", movieId: "one-night-only", type: "short", rating: 5, content: "배우 연기는 좋았다", createdAt: "2026-08-02T00:00:00.000Z" },
  { id: "seed-9", movieId: "one-night-only", type: "long", rating: 4.5, content: "설정은 흥미로운데 중반부 늘어지는 느낌이 있다. 배우들 연기력으로 버틴 영화.", createdAt: "2026-08-03T00:00:00.000Z" },

  { id: "seed-10", movieId: "ice-cream-man", type: "short", rating: 2.5, content: "기대했는데 좀 별로였다", createdAt: "2026-08-01T00:00:00.000Z" },
  { id: "seed-11", movieId: "ice-cream-man", type: "short", rating: 3, content: "호불호 심하게 갈릴 듯", createdAt: "2026-08-02T00:00:00.000Z" },
  { id: "seed-12", movieId: "ice-cream-man", type: "long", rating: 3, content: "공포보다는 불쾌함이 앞서는 연출. 컨셉은 나쁘지 않았지만 아쉬운 완성도.", createdAt: "2026-08-03T00:00:00.000Z" },

  { id: "seed-13", movieId: "the-odyssey", type: "short", rating: 9.5, content: "놀란 감독 다운 스케일감", createdAt: "2026-08-01T00:00:00.000Z" },
  { id: "seed-14", movieId: "the-odyssey", type: "short", rating: 9.5, content: "IMAX로 꼭 봐야 하는 영화", createdAt: "2026-08-02T00:00:00.000Z" },
  { id: "seed-15", movieId: "the-odyssey", type: "long", rating: 9, content: "영상미와 사운드가 압도적이다. 서사가 다소 불친절하지만 그마저도 매력적으로 느껴진다.", createdAt: "2026-08-03T00:00:00.000Z" },

  { id: "seed-16", movieId: "only-yesterday", type: "short", rating: 10, content: "인생 애니메이션, 재개봉 감사합니다", createdAt: "2026-08-01T00:00:00.000Z" },
  { id: "seed-17", movieId: "only-yesterday", type: "short", rating: 10, content: "몇 번을 봐도 새롭다", createdAt: "2026-08-02T00:00:00.000Z" },
  { id: "seed-18", movieId: "only-yesterday", type: "long", rating: 10, content: "지브리 특유의 따뜻한 정서가 스크린에서 보니 더 깊게 다가온다. 완벽한 재개봉작.", createdAt: "2026-08-03T00:00:00.000Z" },

  { id: "seed-19", movieId: "your-name-anniversary", type: "short", rating: 10, content: "10주년 재개봉 놓치면 후회함", createdAt: "2026-08-01T00:00:00.000Z" },
  { id: "seed-20", movieId: "your-name-anniversary", type: "short", rating: 9.5, content: "스크린으로 다시 보니 또 운다", createdAt: "2026-08-02T00:00:00.000Z" },
  { id: "seed-21", movieId: "your-name-anniversary", type: "long", rating: 10, content: "신카이 마코토 연출의 정점. 10년이 지나도 전혀 낡지 않은 이야기.", createdAt: "2026-08-03T00:00:00.000Z" },

  { id: "seed-22", movieId: "spring-in-seoul", type: "short", rating: 8, content: "잔잔하지만 여운이 길다", createdAt: "2026-03-16T00:00:00.000Z" },
  { id: "seed-23", movieId: "spring-in-seoul", type: "short", rating: 8.5, content: "서울 로케이션이 예쁘게 담겼다", createdAt: "2026-03-18T00:00:00.000Z" },
  { id: "seed-24", movieId: "spring-in-seoul", type: "long", rating: 8.5, content: "잔잔한 전개 속에서도 캐릭터 감정선이 섬세하게 살아있는 작품.", createdAt: "2026-03-20T00:00:00.000Z" },

  { id: "seed-25", movieId: "midnight-runner", type: "short", rating: 7, content: "액션은 볼만함", createdAt: "2025-11-21T00:00:00.000Z" },
  { id: "seed-26", movieId: "midnight-runner", type: "short", rating: 8, content: "생각보다 재밌었다", createdAt: "2025-11-23T00:00:00.000Z" },
  { id: "seed-27", movieId: "midnight-runner", type: "long", rating: 7.5, content: "장르물로서 기본기는 탄탄하지만 신선함은 부족한 편.", createdAt: "2025-11-25T00:00:00.000Z" },

  { id: "seed-28", movieId: "the-last-orchard", type: "short", rating: 9, content: "숨겨진 명작", createdAt: "2024-06-03T00:00:00.000Z" },
  { id: "seed-29", movieId: "the-last-orchard", type: "short", rating: 8.5, content: "각본이 정말 좋다", createdAt: "2024-06-05T00:00:00.000Z" },
  { id: "seed-30", movieId: "the-last-orchard", type: "long", rating: 9, content: "가족 드라마의 정석. 후반부 감정 폭발이 인상적이었다.", createdAt: "2024-06-07T00:00:00.000Z" },

  { id: "seed-31", movieId: "silent-harbor", type: "short", rating: 6, content: "기대만큼은 아니었다", createdAt: "2022-09-15T00:00:00.000Z" },
  { id: "seed-32", movieId: "silent-harbor", type: "short", rating: 7, content: "분위기는 좋았음", createdAt: "2022-09-17T00:00:00.000Z" },
  { id: "seed-33", movieId: "silent-harbor", type: "long", rating: 6.5, content: "미스터리 설정은 흥미로웠지만 결말 처리가 아쉬웠다.", createdAt: "2022-09-19T00:00:00.000Z" },

  { id: "seed-34", movieId: "glass-garden", type: "short", rating: 9.5, content: "세월이 지나도 명작은 명작", createdAt: "2019-04-21T00:00:00.000Z" },
  { id: "seed-35", movieId: "glass-garden", type: "short", rating: 10, content: "인생 영화 등극", createdAt: "2019-04-23T00:00:00.000Z" },
  { id: "seed-36", movieId: "glass-garden", type: "long", rating: 9.5, content: "영상미, 음악, 연기 모든 것이 완벽에 가까운 클래식.", createdAt: "2019-04-25T00:00:00.000Z" },

  { id: "seed-37", movieId: "harbor-lights", type: "short", rating: 8, content: "잔잔하게 좋았다", createdAt: "2017-11-12T00:00:00.000Z" },
  { id: "seed-38", movieId: "harbor-lights", type: "short", rating: 8, content: "배경음악이 인상적", createdAt: "2017-11-14T00:00:00.000Z" },
  { id: "seed-39", movieId: "harbor-lights", type: "long", rating: 8, content: "잔잔한 드라마를 좋아한다면 추천할 만한 작품.", createdAt: "2017-11-16T00:00:00.000Z" },
];
