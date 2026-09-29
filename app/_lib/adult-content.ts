// 성인물(에로) 판별 — 홈·장르 탭·추천 어디에도 에로 장르 영화가 뜨지 않도록 한 곳에서 판정한다.
//
// KOBIS 목록 API(searchMovieList)의 genreAlt는 비어 있는 경우가 많아, 목록 단계 필터만으로는
// 상세 조회 뒤 CachedMovie에 "성인물(에로)"로 저장된 영화를 못 거른다. 그래서 카드로 바꾸는
// 단계(CachedMovie 장르 기준)와 DB 조회 단계(where 조건)에서도 같은 기준으로 한 번 더 거른다.

const ADULT_GENRE_PATTERN = /성인|에로/;

// genreAlt만으로는 저예산 성인물이 "성인"/"에로" 장르 태그 없이 등록된 경우를 못 거른다 —
// 제목에 흔히 쓰이는 노골적인 표현도 같이 확인한다. "하룻밤"처럼 일반 영화 제목에도
// 흔히 쓰이는 단어는 오탐이 많아 넣지 않는다.
const ADULT_CONTENT_TITLE_PATTERN =
  /(거근|정사|불륜|스와핑|색정|음란|관음증?|애액|자위|후배위|몸종|씨받이|폭유|치정|섹스|19금|성인용|유부녀|신음|속궁합|육체를?\s*탐하|탐하는\s*(육체|몸)|구멍|다리\s*사이|가랑이|올라타[다는]?|올라탄|올라탔|욕정|발정|정욕|나체|알몸|은밀한\s*밤|불타는\s*밤)/;

export function isAdultGenre(genreAlt: string | readonly string[] | null | undefined): boolean {
  if (!genreAlt) return false;
  const genres = typeof genreAlt === "string" ? [genreAlt] : genreAlt;
  return genres.some((g) => ADULT_GENRE_PATTERN.test(g));
}

export function isAdultContent(movie: { title: string; genreAlt?: string | readonly string[] | null }): boolean {
  return isAdultGenre(movie.genreAlt) || ADULT_CONTENT_TITLE_PATTERN.test(movie.title);
}

// CachedMovie 조회용 where 조각 — 장르가 비어 있는(null) 영화는 남긴다. Prisma의 NOT은
// null 컬럼을 같이 빼버리므로 null을 명시적으로 허용해야 한다.
export const NOT_ADULT_GENRE_WHERE = {
  OR: [
    { genreAlt: null },
    { NOT: { OR: [{ genreAlt: { contains: "에로" } }, { genreAlt: { contains: "성인" } }] } },
  ],
};
