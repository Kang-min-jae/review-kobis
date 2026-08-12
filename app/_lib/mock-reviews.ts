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
];
