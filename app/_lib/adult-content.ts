// 성인물(에로·포르노) 판정 — 메인·추천·목록·검색 어디에도 성인물이 뜨지 않도록 판정 규칙을 이 파일 한 곳에 모은다.
// (화면 코드에서도 쓰므로 DB를 읽지 않는 순수 함수만 둔다. DB에 저장된 판정·관리자 숨김은 movie-moderation.ts.)
//
// 아래 중 하나라도 맞으면 성인물로 본다.
//   ① TMDB 응답의 adult: true
//   ② 장르에 "성인물(에로)"(KOBIS)·"에로"(KMDb)
//   ③ 관람 등급 "제한상영가"
//   ④ TMDB 키워드가 ADULT_KEYWORDS에 있음 — 단, TMDB 투표가 많은(널리 알려진) 영화는 빼고(정상 청불 영화 보호)
//   ⑤ 제작사가 ADULT_COMPANIES에 있음
//   ⑥ 제목에 노골적인 표현(ADULT_CONTENT_TITLE_PATTERN)
//   ⑦ 관리자가 숨김 처리(movie-moderation.ts — 저장된 표시로 판정)
//
// 저장된 영화의 장르는 TMDB 장르로 덮어써져 KOBIS의 "성인물(에로)"가 사라진 경우가 많다. 그래서 상세 정보를
// 처음 불러올 때 KOBIS·KMDb·TMDB 장르와 등급·키워드·제작사를 모두 모아 판정하고 결과를 MovieModeration에
// 저장한다(movie-rate-info.ts). 목록은 그 저장된 결과와 아래 규칙을 함께 쓴다.

// ② 장르
const ADULT_GENRE_PATTERN = /성인|에로/;

// ③ 관람 등급 — 제한상영가는 성인물로 본다.
const RESTRICTED_GRADE_PATTERN = /제한\s*상영/;
// 청소년관람불가(KOBIS) · 18세관람가(KMDb) — 성인물은 아니지만, 포스터가 없거나 TMDB 투표가 아주 적으면
// 메인·추천에서 뺀다(이름 없는 에로 VOD가 대부분 여기 걸린다). 정상 청불 영화는 남는다.
const TEEN_RESTRICTED_PATTERN = /청소년\s*관람\s*불가|18세/;

// ④ TMDB 키워드(영문 이름, 소문자로 비교). 더할 때는 여기에만 적으면 된다.
// "erotic thriller"처럼 일반 영화에도 붙는 키워드는 넣지 않는다.
export const ADULT_KEYWORDS: readonly string[] = [
  "softcore",
  "soft porn",
  "erotic movie",
  "erotica",
  "pornography",
  "porn parody",
  "pornographic video",
  "hardcore pornography",
  "adult film",
  "adult movie",
  "xxx parody",
  "pink film",
  "roman porno",
  "sexploitation",
];
// 키워드는 정상 영화에도 가끔 붙는다 — TMDB 투표가 이 수 이상인(널리 알려진) 영화는 키워드만으로는 거르지 않는다.
export const ADULT_KEYWORD_MAX_TMDB_VOTES = 300;

// ⑤ 성인물 제작사(대소문자·문장부호 무시, 이름 전체 또는 앞부분이 단어 단위로 같으면 해당). 더할 때는 여기에만 적는다.
export const ADULT_COMPANIES: readonly string[] = [
  "Marc Dorcel",
  "Dorcel",
  "Nubiles",
  "Vixen",
  "Vixen Media Group",
  "Tushy",
  "Blacked",
  "Brazzers",
  "Digital Playground",
  "Evil Angel",
  "Wicked Pictures",
  "Private Media Group",
  "Reality Kings",
  "Naughty America",
  "Jules Jordan Video",
  "Elegant Angel",
  "New Sensations",
  "Pure Taboo",
  "Adult Time",
  "Girlsway",
  "Bang Bros",
  "Kink.com",
  "Hustler Video",
  "Penthouse Films",
  "Playboy TV",
  "Vivid Entertainment",
  "Zero Tolerance Entertainment",
  "Mile High Media",
  "Sweetheart Video",
  "Team Skeet",
];

// ⑥ 제목 — 저예산 성인물이 "성인"/"에로" 장르 태그 없이 등록된 경우를 잡는다. "하룻밤"처럼 일반 영화 제목에도
// 흔히 쓰이는 단어는 오탐이 많아 넣지 않는다.
const ADULT_CONTENT_TITLE_PATTERN =
  /(거근|정사|불륜|스와핑|색정|음란|관음증?|애액|자위|후배위|몸종|씨받이|폭유|치정|섹스|19금|성인용|유부녀|신음|속궁합|육체를?\s*탐하|탐하는\s*(육체|몸)|구멍|다리\s*사이|가랑이|올라타[다는]?|올라탄|올라탔|욕정|발정|정욕|나체|알몸|은밀한\s*밤|불타는\s*밤)/;

// 메인·추천 품질 기준(상수로 둔다).
// 청소년관람불가인데 TMDB 투표가 이보다 적으면 메인·추천에서 뺀다.
export const MIN_TMDB_VOTES_TEEN_RESTRICTED = 20;
// 추천 목록 최소 품질 — TMDB 투표가 이 수 이상이거나, 우리 사이트 평점이 MIN_SITE_RATINGS_FOR_RECOMMENDATION개 이상.
export const MIN_TMDB_VOTES_FOR_RECOMMENDATION = 10;
export const MIN_SITE_RATINGS_FOR_RECOMMENDATION = 1;

type GenreInput = string | readonly string[] | null | undefined;

export type AdultSignals = {
  title: string;
  titleEn?: string | null;
  // 출처별 장르를 모두 넘겨도 된다(KOBIS·KMDb·TMDB). 콤마 구분 문자열이나 배열.
  genreAlt?: GenreInput;
  genres?: readonly GenreInput[];
  watchGrade?: string | null;
  tmdbAdult?: boolean | null;
  keywords?: readonly string[] | null;
  companies?: readonly string[] | null;
  tmdbVoteCount?: number | null;
};

function genreList(signals: Pick<AdultSignals, "genreAlt" | "genres">): string[] {
  const all = [signals.genreAlt, ...(signals.genres ?? [])];
  return all.flatMap((g) => (!g ? [] : typeof g === "string" ? [g] : [...g]));
}

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, " ").trim();
}
const NORMALIZED_COMPANIES = ADULT_COMPANIES.map(normalizeName);
const NORMALIZED_KEYWORDS = new Set(ADULT_KEYWORDS.map((k) => k.toLowerCase().trim()));

export function adultCompanyOf(companies: readonly string[] | null | undefined): string | null {
  for (const company of companies ?? []) {
    const name = normalizeName(company);
    if (NORMALIZED_COMPANIES.some((c) => name === c || name.startsWith(`${c} `))) return company;
  }
  return null;
}

export function adultKeywordOf(keywords: readonly string[] | null | undefined): string | null {
  return (keywords ?? []).find((k) => NORMALIZED_KEYWORDS.has(k.toLowerCase().trim())) ?? null;
}

export function isAdultGenre(genreAlt: GenreInput): boolean {
  return genreList({ genreAlt }).some((g) => ADULT_GENRE_PATTERN.test(g));
}

export function isRestrictedGrade(watchGrade: string | null | undefined): boolean {
  return !!watchGrade && RESTRICTED_GRADE_PATTERN.test(watchGrade);
}

export function isTeenRestrictedGrade(watchGrade: string | null | undefined): boolean {
  return !!watchGrade && TEEN_RESTRICTED_PATTERN.test(watchGrade);
}

// 성인물이면 그 이유("tmdb-adult", "genre:…", "grade:…", "keyword:…", "company:…", "title"), 아니면 null.
export function adultContentReason(signals: AdultSignals): string | null {
  if (signals.tmdbAdult === true) return "tmdb-adult";
  const adultGenre = genreList(signals).find((g) => ADULT_GENRE_PATTERN.test(g));
  if (adultGenre) return `genre:${adultGenre.slice(0, 60)}`;
  if (isRestrictedGrade(signals.watchGrade)) return `grade:${signals.watchGrade}`;
  const company = adultCompanyOf(signals.companies);
  if (company) return `company:${company.slice(0, 80)}`;
  const keyword = adultKeywordOf(signals.keywords);
  const votes = signals.tmdbVoteCount;
  if (keyword && (votes == null || votes < ADULT_KEYWORD_MAX_TMDB_VOTES)) return `keyword:${keyword}`;
  if (ADULT_CONTENT_TITLE_PATTERN.test(signals.title)) return "title";
  return null;
}

export function isAdultContent(signals: AdultSignals): boolean {
  return adultContentReason(signals) !== null;
}

// 메인·추천 카드로 내보내도 되는지(성인물 판정 + 포스터 + 이름 없는 청불 영화). 관리자 숨김·저장된 판정은
// excluded(movie-moderation.ts의 getExcludedMovieCds)로 함께 넘긴다.
export function isListableMovie(
  movie: AdultSignals & { movieCd?: string; posterUrl?: string | null },
  excluded?: ReadonlySet<string>,
): boolean {
  if (!movie.posterUrl) return false;
  if (movie.movieCd && excluded?.has(movie.movieCd)) return false;
  if (isAdultContent(movie)) return false;
  if (isTeenRestrictedGrade(movie.watchGrade) && movie.tmdbVoteCount != null && movie.tmdbVoteCount < MIN_TMDB_VOTES_TEEN_RESTRICTED) return false;
  return true;
}

// 추천 최소 품질 — TMDB 투표 수를 모르면(아직 판정 전) 통과시킨다. 판정 스크립트를 돌리면 채워진다.
export function meetsRecommendationQuality(tmdbVoteCount: number | null | undefined, siteRatingCount: number): boolean {
  if (siteRatingCount >= MIN_SITE_RATINGS_FOR_RECOMMENDATION) return true;
  return tmdbVoteCount == null || tmdbVoteCount >= MIN_TMDB_VOTES_FOR_RECOMMENDATION;
}

// CachedMovie 조회용 where 조각 — 장르·등급이 비어 있는(null) 영화는 남긴다. Prisma의 NOT은 null 컬럼을 같이
// 빼버리므로 null을 명시적으로 허용해야 한다.
export const NOT_ADULT_GENRE_WHERE = {
  OR: [
    { genreAlt: null },
    { NOT: { OR: [{ genreAlt: { contains: "에로" } }, { genreAlt: { contains: "성인" } }] } },
  ],
};
export const NOT_RESTRICTED_GRADE_WHERE = {
  OR: [{ watchGrade: null }, { NOT: { watchGrade: { contains: "제한상영" } } }],
};
