// 추천도 계산용 장르 표기 통일.
//
// 영화 장르는 출처마다 표기가 다르다 — KOBIS/KMDb는 "멜로/로맨스"·"어드벤처"·"공포(호러)"·
// "사극", TMDB는 "로맨스"·"모험"·"공포"·"역사", TMDB 시리즈는 "액션 & 어드벤처"·
// "SF & 판타지"처럼 두 장르를 묶어 쓴다. 표기가 다르면 같은 장르인데도 취향 계산에서
// 서로 다른 항목이 되어, TMDB 출처 로맨스 영화를 높게 준 사용자에게 KOBIS의 "멜로/로맨스"
// 영화가 전혀 매칭되지 않았다. 그래서 취향 계산에 쓰는 장르만 대표 이름으로 맞춘다
// (화면에 보이는 장르 표기는 원래 값 그대로 둔다).

const ALIASES: Record<string, string[]> = {
  "멜로/로맨스": ["로맨스"],
  멜로: ["로맨스"],
  어드벤처: ["모험"],
  "공포(호러)": ["공포"],
  호러: ["공포"],
  "서부극(웨스턴)": ["서부"],
  사극: ["역사"],
  음악: ["뮤지컬"],
  다큐: ["다큐멘터리"],
  "액션 & 어드벤처": ["액션", "모험"],
  "SF & 판타지": ["SF", "판타지"],
  "전쟁 & 정치": ["전쟁"],
};

// 취향 정보가 없는 분류 — 취향 벡터에 넣으면 잡음만 늘어난다.
const IGNORED = new Set(["기타", "TV 영화"]);

export function canonicalGenres(genres: readonly string[]): string[] {
  const out = new Set<string>();
  for (const raw of genres) {
    const genre = raw.trim();
    if (!genre || IGNORED.has(genre)) continue;
    for (const canonical of Object.hasOwn(ALIASES, genre) ? ALIASES[genre] : [genre]) out.add(canonical);
  }
  return [...out];
}

// 대표 장르 → DB genreAlt `contains` 검색어. 대표 이름만으로는 다른 표기("어드벤처"·"사극"·
// "음악")로 저장된 영화를 못 찾는다.
const QUERY_KEYWORDS: Record<string, string[]> = {
  로맨스: ["멜로", "로맨스"],
  모험: ["어드벤처", "모험"],
  공포: ["공포", "호러"],
  역사: ["사극", "역사"],
  뮤지컬: ["뮤지컬", "음악"],
  다큐멘터리: ["다큐"],
};

export function genreQueryKeywords(canonical: string): string[] {
  return Object.hasOwn(QUERY_KEYWORDS, canonical) ? QUERY_KEYWORDS[canonical] : [canonical];
}
