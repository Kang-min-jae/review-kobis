// Wikidata SPARQL API 연동 — 세계 주요 영화제 최신 수상작 조회.
//
// 동적 부문 발견 전략:
//   1단계) 영어 레이블 STARTSWITH/CONTAINS 필터로 영화제별 수상 부문 QID를 조회
//   2단계) 필름-레벨(P166 직접) + 인물-레벨(P166+P1686 "for work" qualifier) UNION으로
//          각 부문의 최신 연도 수상작 1편씩 반환
//
// QID를 하드코딩하지 않고 Wikidata 레이블 인덱스를 활용하므로, 영화제가 새로운 부문을
// 추가해도 재배포 없이 자동으로 포함된다.

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

export type FestivalType = "academy" | "cannes" | "berlin" | "venice";

export type FestivalWinner = {
  categoryLabel: string; // Wikidata 한국어 레이블 (없으면 영어)
  titleKo: string | null;
  titleEn: string;
  ceremonyYear: number;
  filmQid: string;
};

// 영화제별 SPARQL FILTER 표현식 — 수상 부문 영어 레이블을 기준으로 필터링
const FESTIVAL_FILTERS: Record<FestivalType, string> = {
  academy: `STRSTARTS(LCASE(?awardLabelEn), "academy award for")`,
  cannes: `(STRSTARTS(LCASE(?awardLabelEn), "palme") || CONTAINS(LCASE(?awardLabelEn), "cannes film festival"))`,
  berlin: `(STRSTARTS(LCASE(?awardLabelEn), "golden bear") || STRSTARTS(LCASE(?awardLabelEn), "silver bear"))`,
  venice: `(STRSTARTS(LCASE(?awardLabelEn), "golden lion") || STRSTARTS(LCASE(?awardLabelEn), "silver lion") || CONTAINS(LCASE(?awardLabelEn), "venice film festival award"))`,
};

async function sparqlFetch(query: string): Promise<Record<string, { value: string }>[]> {
  const url = new URL(SPARQL_ENDPOINT);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");

  try {
    const res = await fetch(url.toString(), {
      headers: {
        Accept: "application/sparql-results+json",
        "User-Agent": "review-kobis/1.0 (https://github.com/Kang-min-jae/review-kobis)",
      },
      next: { revalidate: 60 * 60 * 24 }, // 24시간 캐시
      signal: AbortSignal.timeout(25_000),
    });
    if (!res.ok) {
      console.warn(`[wikidata] SPARQL 요청 실패: HTTP ${res.status}`);
      return [];
    }
    const json = (await res.json()) as { results?: { bindings?: Record<string, { value: string }>[] } };
    return json.results?.bindings ?? [];
  } catch (err) {
    console.warn("[wikidata] SPARQL 요청 오류:", err);
    return [];
  }
}

// filmQid 기준으로 QID만 파싱
function parseQid(uri: string): string {
  return uri.split("/").pop() ?? "";
}

// 영화제 한국어 레이블 축약: 긴 접두어("아카데미 시상식" 등)를 제거해 배지에 짧게 표시
function shortenLabel(labelKo: string | null, labelEn: string): string {
  if (labelKo) {
    // "아카데미 최우수 작품상" → "최우수 작품상" 같이 영화제 이름 접두어 제거
    return labelKo
      .replace(/^아카데미\s+(시상식\s+)?/, "")
      .replace(/^칸\s+(국제\s+)?영화제\s+/, "")
      .replace(/^베를린\s+(국제\s+)?영화제\s+/, "")
      .replace(/^베니스\s+(국제\s+)?영화제\s+/, "")
      .trim() || labelKo;
  }
  // 영어 폴백: "Academy Award for Best Picture" → "Best Picture"
  return labelEn
    .replace(/^Academy Award for\s+/, "")
    .replace(/^Cannes Film Festival Award for\s+/, "")
    .replace(/\s*\(Cannes Film Festival\)$/, "")
    .replace(/\s*\(Berlinale\)$/, "")
    .replace(/\s*\(Venice Film Festival\)$/, "")
    .trim() || labelEn;
}

// 핵심 SPARQL: 영화제 레이블 필터로 수상 부문을 동적 발견하면서,
// 필름-레벨(P166) + 인물-레벨(P166+P1686 "for work") 두 경로를 UNION으로 합친다.
// sinceYear 이후 수상작만 대상으로 하고, 부문별 최신 연도 1편만 보존한다.
async function fetchFestivalWinnersRaw(
  festivalFilter: string,
  sinceYear: number,
): Promise<FestivalWinner[]> {
  const query = `
SELECT DISTINCT ?award ?awardLabelEn ?awardLabelKo ?film ?year ?filmLabelKo ?filmLabelEn WHERE {
  {
    # 경로 1: P166이 영화 엔티티에 직접 붙어 있는 부문 (작품상, 황금종려상 등)
    ?film p:P166 ?stmt .
    ?stmt ps:P166 ?award .
    ?stmt pq:P585 ?date .
    FILTER NOT EXISTS { ?film wdt:P31 wd:Q5 }
    BIND(YEAR(?date) AS ?year)
  } UNION {
    # 경로 2: P166이 사람 엔티티에 붙고 P1686(for work)으로 영화를 참조하는 부문
    #          (감독상, 남우주연상 등 — 인물이 수상하지만 카드에는 영화를 보여준다)
    ?person p:P166 ?stmt .
    ?stmt ps:P166 ?award .
    ?stmt pq:P1686 ?film .
    ?stmt pq:P585 ?date .
    ?person wdt:P31 wd:Q5 .
    BIND(YEAR(?date) AS ?year)
  }
  FILTER(?year >= ${sinceYear})
  ?award rdfs:label ?awardLabelEn FILTER(LANG(?awardLabelEn) = "en")
  FILTER(${festivalFilter})
  OPTIONAL { ?award rdfs:label ?awardLabelKo FILTER(LANG(?awardLabelKo) = "ko") }
  OPTIONAL { ?film rdfs:label ?filmLabelKo FILTER(LANG(?filmLabelKo) = "ko") }
  OPTIONAL { ?film rdfs:label ?filmLabelEn FILTER(LANG(?filmLabelEn) = "en") }
}
ORDER BY ?award DESC(?year)
LIMIT 500
`.trim();

  const rows = await sparqlFetch(query);

  // 부문별로 가장 최근 연도 수상작 1편만 보존
  const byAward = new Map<string, FestivalWinner>();
  for (const row of rows) {
    const filmQid = parseQid(row.film?.value ?? "");
    const titleKo = row.filmLabelKo?.value ?? null;
    const titleEn = row.filmLabelEn?.value ?? "";
    const awardQid = parseQid(row.award?.value ?? "");
    const awardLabelEn = row.awardLabelEn?.value ?? "";
    const awardLabelKo = row.awardLabelKo?.value ?? null;
    const year = parseInt(row.year?.value ?? "0", 10);

    if (!filmQid || (!titleEn && !titleKo) || !awardQid || !year) continue;

    const existing = byAward.get(awardQid);
    if (!existing || year > existing.ceremonyYear) {
      byAward.set(awardQid, {
        filmQid,
        titleKo,
        titleEn: titleEn || titleKo!,
        awardLabelEn,
        categoryLabel: shortenLabel(awardLabelKo, awardLabelEn),
        ceremonyYear: year,
      } as FestivalWinner & { awardLabelEn: string });
    }
  }

  // awardLabelEn 기준으로 정렬 (알파벳 순 → 부문이 일관된 순서로 표시됨)
  return Array.from(byAward.values()).sort((a, b) =>
    // awardLabelEn이 내부 타입에만 있어서 categoryLabel로 정렬
    a.categoryLabel.localeCompare(b.categoryLabel, "ko")
  );
}

export async function fetchLatestAcademyWinners(sinceYear = new Date().getFullYear() - 5): Promise<FestivalWinner[]> {
  return fetchFestivalWinnersRaw(FESTIVAL_FILTERS.academy, sinceYear);
}

export async function fetchLatestCannesWinners(sinceYear = new Date().getFullYear() - 5): Promise<FestivalWinner[]> {
  return fetchFestivalWinnersRaw(FESTIVAL_FILTERS.cannes, sinceYear);
}

export async function fetchLatestBerlinWinners(sinceYear = new Date().getFullYear() - 5): Promise<FestivalWinner[]> {
  return fetchFestivalWinnersRaw(FESTIVAL_FILTERS.berlin, sinceYear);
}

export async function fetchLatestVeniceWinners(sinceYear = new Date().getFullYear() - 5): Promise<FestivalWinner[]> {
  return fetchFestivalWinnersRaw(FESTIVAL_FILTERS.venice, sinceYear);
}
