// 영화 한 편이 "신작"인지 "재개봉작"인지 가리는 로직. KOFIC(박스오피스/카탈로그)은
// 오늘 상영 중인 영화의 movieNm/openDt/movieCd는 실시간으로 주지만 그게 신작인지
// 재개봉인지는 알려주지 않고, KMDb는 영화별 제작연도/감독/출연/원제는 갖고 있지만
// "오늘 상영 중인 목록" 같은 실시간 정보가 없다 — 그래서 두 소스를 대조한다.
//
// 핵심 문제는 "제목만 같고 내용은 전혀 다른 동명이작"을 재개봉으로 잘못 묶는 것 —
// 실제로 "두 남자"(1971년작)와 전혀 무관한 최근작 동명 영화가 재개봉으로 잘못
// 판정된 사례가 있었다. 그래서 제목이 같은 후보가 여럿이면 감독(고신뢰) → 주연
// 배우 겹침(보조 신호) 순으로 "진짜 같은 작품"인지 검증한 뒤에만 재개봉으로
// 확정한다. 검증 근거가 부족한 경계 케이스는 자동 확정하지 않고 수동 검수로 넘긴다.
//
// 참고: 이 코드베이스가 실제로 쓰는 KMDb 엔드포인트(search_json2.jsp)는 영화당
// 대표 개봉일(repRlsDate) 하나만 주고, 전체 개봉 이력 배열은 제공하지 않는다 —
// 그래서 "원작의 최초 개봉일"은 이 대표 개봉일로 대신한다. 또한 "오늘 상영 중인
// 이 후보 자체의 제작연도"는 KOBIS 쪽엔 필드가 없어 독립적으로 알 수 없어서,
// 원 스펙의 "제작연도 완전 일치" 신호는 (동일 인물 확인이 없을 때) 쓰지 않고
// 주연 배우 겹침만 보조 신호로 쓴다 — 이 부분은 실제 API 한계에 따른 근사다.
//
// 이 조회 자체가 영화 한 편당 KMDb 검색 + KOBIS 상세조회까지 필요해 비용이 크므로,
// 요청마다 부르지 말고 scripts/refresh-rerelease-classifications.mts가 배치로
// 미리 계산해 DB(RereleaseClassification)에 저장해 둔 걸 프론트엔드가 읽어야 한다.

import { findOriginalReleaseByTitle, getMovieDetailsByCd, type KobisMovieSummary } from "./kobis";
import { searchKmdbMoviesByTitle, type KmdbMovieDetails } from "./kmdb";

export type ClassificationSource =
  | "kmdb-release-date"
  | "kobis-earliest-registration"
  | "title-keyword"
  | "year-gap-heuristic"
  | "new-release";

export type RereleaseClassificationResult = {
  isRerelease: boolean;
  originalYear: string | null;
  rereleaseDate: string | null;
  // 장르 필터링용(콤마 구분) — 판정 과정에서 이미 조회한 KMDb 결과에서 얻으므로
  // 추가 API 호출이 들지 않는다. 못 찾았으면 null.
  genreAlt: string | null;
  // "classified": 자동/수동으로 확정됨 · "unclassified": 자동 판정 근거가 아예 없거나,
  // 제목은 같은데 정말 같은 작품인지 애매해서(동명이작일 수도 있음) 수동 검수가 필요함.
  status: "classified" | "unclassified";
  source: ClassificationSource | null;
};

// 제작연도와 개봉연도가 이만큼(년) 이상 차이나면(다른 근거가 전혀 없을 때) 재개봉으로
// 추정한다 — 신원 확인 근거가 하나도 없을 때의 최후 수단이라 status는 항상
// "unclassified"로 남겨 수동 검수를 거치게 한다(이 신호 하나만으론 자동 확정 안 함).
const YEAR_GAP_THRESHOLD = 3;

const RERELEASE_KEYWORD_PATTERN =
  /재개봉|리마스터|주년|디렉터스\s*컷|파이널\s*컷|익스텐디드\s*컷|무삭제판|확장판/;

function yearOf(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  const y = Number(dateIso.slice(0, 4));
  return Number.isNaN(y) ? null : y;
}

function normalizeName(name: string): string {
  return name.replace(/\s+/g, "").toLowerCase();
}

function sharesName(a: string[], b: string[]): boolean {
  const setB = new Set(b.map(normalizeName));
  return a.some((name) => setB.has(normalizeName(name)));
}

function unclassifiedResult(genreAlt: string | null = null): RereleaseClassificationResult {
  return { isRerelease: false, originalYear: null, rereleaseDate: null, genreAlt, status: "unclassified", source: null };
}

function newReleaseResult(genreAlt: string | null): RereleaseClassificationResult {
  return {
    isRerelease: false,
    originalYear: null,
    rereleaseDate: null,
    genreAlt,
    status: "classified",
    source: "new-release",
  };
}

function rereleaseResult(
  originalYear: string | null,
  rereleaseDate: string,
  genreAlt: string | null,
  source: ClassificationSource,
  status: "classified" | "unclassified" = "classified"
): RereleaseClassificationResult {
  return { isRerelease: true, originalYear, rereleaseDate, genreAlt, status, source };
}

type IdentityVerdict = "confirmed" | "review_needed" | "different";

type IdentityInfo = { director: string | null; castTop2: string[]; titleEn: string | null };

// 제목이 같은 두 레코드(candidate = 지금 KOFIC에 잡힌 후보, other = 더 이른 개봉
// 기록을 가진 후보)가 실제로 같은 작품인지 판정한다.
// - 원제(영문/원어 제목)가 둘 다 있는데 다르면 그 자체로 "다른 작품" 확정(강한 반증).
// - 감독이 둘 다 확인되고 겹치면: 주연 배우(상위 1~2명)까지 겹치면 고신뢰로 확정,
//   배우가 안 겹치면(감독만 일치) 근거가 한쪽뿐이라 자동 확정하지 않고 수동 검수로.
// - 감독이 둘 다 확인됐는데 서로 다르면 "다른 작품"으로 확정.
// - 감독 정보 자체가 없으면(모르는 경우): 원제도 없고 배우도 안 겹치면 판정 근거가
//   아예 없는 것이므로 수동 검수로, 배우라도 겹치면 그 배우 겹침 자체는 신원을
//   확정할 만큼 강하지 않아 역시 수동 검수로 넘긴다.
// - 그 외(감독 정보 없고 배우도 안 겹침, 원제도 다르지 않지만 일치 신호도 없음)는
//   "다른 작품"으로 확정한다 — 예전엔 감독 정보가 둘 다 없으면 "모르니 같다고
//   가정"하고 넘어갔는데, 그게 바로 동명이작 오탐의 원인이었다.
function verifyIdentity(candidate: IdentityInfo, other: IdentityInfo): IdentityVerdict {
  if (candidate.titleEn && other.titleEn && normalizeName(candidate.titleEn) !== normalizeName(other.titleEn)) {
    return "different";
  }

  const directorKnown = !!candidate.director && !!other.director;
  const directorMatch = directorKnown && sharesName([candidate.director!], [other.director!]);
  const actorMatch =
    candidate.castTop2.length > 0 && other.castTop2.length > 0 && sharesName(candidate.castTop2, other.castTop2);

  if (directorMatch) {
    return actorMatch ? "confirmed" : "review_needed";
  }
  if (directorKnown && !directorMatch) {
    return "different"; // 감독이 서로 다르다고 확인됨
  }
  // 감독 정보가 없어 확인 불가능한 경우.
  if (actorMatch) return "review_needed"; // 배우는 겹치지만 근거가 약함
  return "different"; // 원제도 감독도 배우도 근거가 전혀 없음
}

async function candidateIdentity(
  movie: Pick<KobisMovieSummary, "movieCd" | "titleEn"> & { director?: string | null }
): Promise<IdentityInfo> {
  const detail = await getMovieDetailsByCd(movie.movieCd);
  return {
    director: movie.director ?? detail?.director?.name ?? null,
    castTop2: (detail?.cast ?? []).slice(0, 2).map((c) => c.name),
    titleEn: movie.titleEn ?? null,
  };
}

function kmdbIdentity(k: KmdbMovieDetails): IdentityInfo {
  return { director: k.director?.name ?? null, castTop2: k.cast.slice(0, 2).map((c) => c.name), titleEn: k.titleEng };
}

export async function classifyRerelease(
  movie: Pick<KobisMovieSummary, "movieCd" | "title" | "openDate" | "titleEn"> & { director?: string | null }
): Promise<RereleaseClassificationResult> {
  if (!movie.openDate) return unclassifiedResult();

  const identity = await candidateIdentity(movie);

  // 0단계: 제목이 같은 KMDb 레코드를 전부 찾는다. 후보가 하나뿐이면 동명이작 걱정이
  // 없으므로 검증 없이 곧장 날짜만 비교한다(스펙의 "1건이면 4단계로 직행").
  const homonyms = await searchKmdbMoviesByTitle(movie.title, movie.titleEn);

  if (homonyms.length === 1) {
    const only = homonyms[0];
    if (only.releaseDate) {
      if (only.releaseDate < movie.openDate) {
        return rereleaseResult(only.prodYear ?? only.releaseDate.slice(0, 4), movie.openDate, only.genre, "kmdb-release-date");
      }
      if (only.releaseDate === movie.openDate) {
        return newReleaseResult(only.genre);
      }
    }
  } else if (homonyms.length > 1) {
    // 1단계: 개봉일이 이번 openDt보다 이른 후보만 "원작"일 수 있다. 가장 이른
    // 순으로 하나씩 신원을 검증한다.
    const earlierCandidates = homonyms
      .filter((h): h is KmdbMovieDetails & { releaseDate: string } => !!h.releaseDate && h.releaseDate < movie.openDate!)
      .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate));

    for (const other of earlierCandidates) {
      const verdict = verifyIdentity(identity, kmdbIdentity(other));
      if (verdict === "confirmed") {
        return rereleaseResult(other.prodYear ?? other.releaseDate.slice(0, 4), movie.openDate, other.genre, "kmdb-release-date");
      }
      if (verdict === "review_needed") {
        return rereleaseResult(
          other.prodYear ?? other.releaseDate.slice(0, 4),
          movie.openDate,
          other.genre,
          "kmdb-release-date",
          "unclassified"
        );
      }
      // "different"면 동명이작으로 확정하고 다음 후보(있다면)로 넘어간다.
    }

    // 같은 날짜(오늘 이 상영과 동일한 등록)의 후보가 있으면 그건 신작 확인 근거다.
    if (homonyms.some((h) => h.releaseDate === movie.openDate)) {
      const self = homonyms.find((h) => h.releaseDate === movie.openDate)!;
      return newReleaseResult(self.genre);
    }
  }

  const genreAlt = homonyms[0]?.genre ?? null;

  // 2~3단계: KMDb에서 근거를 못 찾았으면, 같은 제목으로 KOBIS에 더 이른 별도 등록이
  // 있는지 본다. 여기서도 위와 같은 신원 검증(감독→배우)을 그대로 적용한다.
  const original = await findOriginalReleaseByTitle(movie.title);
  if (original && original.movieCd !== movie.movieCd && original.openDate && original.openDate < movie.openDate) {
    const originalDetail = await getMovieDetailsByCd(original.movieCd);
    const verdict = verifyIdentity(identity, {
      director: original.director,
      castTop2: (originalDetail?.cast ?? []).slice(0, 2).map((c) => c.name),
      titleEn: null, // KOBIS 원 개봉 검색 경로는 원제 정보가 없다 — "정보 없음"으로 취급(불일치 아님).
    });
    if (verdict === "confirmed") {
      return rereleaseResult(original.openDate.slice(0, 4), movie.openDate, genreAlt, "kobis-earliest-registration");
    }
    if (verdict === "review_needed") {
      return rereleaseResult(
        original.openDate.slice(0, 4),
        movie.openDate,
        genreAlt,
        "kobis-earliest-registration",
        "unclassified"
      );
    }
    // "different" — 동명이작으로 확정, 이 등록은 근거로 안 쓰고 계속 진행.
  }

  // 4) 제목에 "재개봉"류 수식어가 있는지 본다 — KOFIC 등록 제목 자체의 명시적 신호라
  //    신뢰도가 높아 자동 확정한다.
  if (RERELEASE_KEYWORD_PATTERN.test(movie.title)) {
    return rereleaseResult(null, movie.openDate, genreAlt, "title-keyword");
  }

  // 5) 최후 수단 — 신원 확인 근거가 전혀 없는 상태에서 제작연도-개봉연도 격차만으로
  //    추정하는 것이라, 자동 확정하지 않고 항상 수동 검수로 넘긴다.
  const anyProdYear = homonyms.find((h) => h.prodYear)?.prodYear ?? null;
  const prodYear = anyProdYear ? Number(anyProdYear) : null;
  const openYear = yearOf(movie.openDate);
  if (prodYear !== null && openYear !== null && openYear - prodYear >= YEAR_GAP_THRESHOLD) {
    return rereleaseResult(String(prodYear), movie.openDate, genreAlt, "year-gap-heuristic", "unclassified");
  }

  // KMDb/KOBIS 둘 중 하나라도 이 영화를 찾긴 했는데(조회 자체는 됐음) 재개봉으로 볼
  // 근거가 전혀 없으면 신작으로 판정한다. 둘 다 못 찾았으면(제목 검색 자체가 실패) 자동
  // 판정 근거가 없는 것이므로 수동 검수로 넘긴다.
  if (homonyms.length > 0 || original) return newReleaseResult(genreAlt);
  return unclassifiedResult();
}
