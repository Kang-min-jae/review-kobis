// Wikidata SPARQL API 연동 — 세계 주요 영화제 최신 수상작 조회.
//
// UNION 쿼리는 Wikidata에서 느리므로, 영화-레벨(P166 직접)과 인물-레벨(P166+P1686)을
// 각각 별도 쿼리로 실행하고 TypeScript에서 합친다.

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

export type FestivalType = "academy" | "cannes" | "berlin" | "venice";

export type FestivalWinner = {
  categoryLabel: string;
  titleKo: string | null;
  titleEn: string;
  ceremonyYear: number;
  filmQid: string;
};

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
      next: { revalidate: 60 * 60 * 24 },
      signal: AbortSignal.timeout(40_000),
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

function parseQid(uri: string): string {
  return uri.split("/").pop() ?? "";
}

function shortenLabel(labelKo: string | null, labelEn: string): string {
  if (labelKo) {
    return labelKo
      .replace(/^아카데미\s+(시상식\s+)?/, "")
      .replace(/^칸\s+(국제\s+)?영화제\s+/, "")
      .replace(/^베를린\s+(국제\s+)?영화제\s+/, "")
      .replace(/^베니스\s+(국제\s+)?영화제\s+/, "")
      .trim() || labelKo;
  }
  return labelEn
    .replace(/^Academy Award for\s+/, "")
    .replace(/^Cannes Film Festival Award for\s+/, "")
    .replace(/\s*\(Cannes Film Festival\)$/, "")
    .replace(/\s*\(Berlinale\)$/, "")
    .replace(/\s*\(Venice Film Festival\)$/, "")
    .trim() || labelEn;
}

// 경로 1: P166이 영화 엔티티에 직접 붙어 있는 수상 (작품상, 황금종려상 등)
function buildFilmLevelQuery(festivalFilter: string, sinceYear: number): string {
  return `
SELECT DISTINCT ?award ?awardLabelEn ?awardLabelKo ?film ?year ?filmLabelKo ?filmLabelEn WHERE {
  ?film p:P166 ?stmt .
  ?stmt ps:P166 ?award .
  ?stmt pq:P585 ?date .
  FILTER NOT EXISTS { ?film wdt:P31 wd:Q5 }
  BIND(YEAR(?date) AS ?year)
  FILTER(?year >= ${sinceYear})
  ?award rdfs:label ?awardLabelEn FILTER(LANG(?awardLabelEn) = "en")
  FILTER(${festivalFilter})
  OPTIONAL { ?award rdfs:label ?awardLabelKo FILTER(LANG(?awardLabelKo) = "ko") }
  OPTIONAL { ?film rdfs:label ?filmLabelKo FILTER(LANG(?filmLabelKo) = "ko") }
  OPTIONAL { ?film rdfs:label ?filmLabelEn FILTER(LANG(?filmLabelEn) = "en") }
}
ORDER BY ?award DESC(?year)
LIMIT 300
`.trim();
}

// 경로 2: P166이 사람에 붙고 P1686(for work)으로 영화를 참조 (감독상, 남우주연상 등)
function buildPersonLevelQuery(festivalFilter: string, sinceYear: number): string {
  return `
SELECT DISTINCT ?award ?awardLabelEn ?awardLabelKo ?film ?year ?filmLabelKo ?filmLabelEn WHERE {
  ?person p:P166 ?stmt .
  ?stmt ps:P166 ?award .
  ?stmt pq:P1686 ?film .
  ?stmt pq:P585 ?date .
  ?person wdt:P31 wd:Q5 .
  BIND(YEAR(?date) AS ?year)
  FILTER(?year >= ${sinceYear})
  ?award rdfs:label ?awardLabelEn FILTER(LANG(?awardLabelEn) = "en")
  FILTER(${festivalFilter})
  OPTIONAL { ?award rdfs:label ?awardLabelKo FILTER(LANG(?awardLabelKo) = "ko") }
  OPTIONAL { ?film rdfs:label ?filmLabelKo FILTER(LANG(?filmLabelKo) = "ko") }
  OPTIONAL { ?film rdfs:label ?filmLabelEn FILTER(LANG(?filmLabelEn) = "en") }
}
ORDER BY ?award DESC(?year)
LIMIT 300
`.trim();
}

type RawRow = Record<string, { value: string }>;

function rowsToMap(rows: RawRow[], map: Map<string, FestivalWinner & { awardLabelEn: string }>) {
  for (const row of rows) {
    const filmQid = parseQid(row.film?.value ?? "");
    const awardQid = parseQid(row.award?.value ?? "");
    const awardLabelEn = row.awardLabelEn?.value ?? "";
    const awardLabelKo = row.awardLabelKo?.value ?? null;
    const titleKo = row.filmLabelKo?.value ?? null;
    const titleEn = row.filmLabelEn?.value ?? "";
    const year = parseInt(row.year?.value ?? "0", 10);

    if (!filmQid || (!titleEn && !titleKo) || !awardQid || !year) continue;

    const existing = map.get(awardQid);
    if (!existing || year > existing.ceremonyYear) {
      map.set(awardQid, {
        filmQid,
        titleKo,
        titleEn: titleEn || titleKo!,
        awardLabelEn,
        categoryLabel: shortenLabel(awardLabelKo, awardLabelEn),
        ceremonyYear: year,
      });
    }
  }
}

async function fetchFestivalWinnersRaw(
  festivalFilter: string,
  sinceYear: number,
): Promise<FestivalWinner[]> {
  // 두 쿼리를 병렬로 실행해 속도를 높인다
  const [filmRows, personRows] = await Promise.all([
    sparqlFetch(buildFilmLevelQuery(festivalFilter, sinceYear)),
    sparqlFetch(buildPersonLevelQuery(festivalFilter, sinceYear)),
  ]);

  const byAward = new Map<string, FestivalWinner & { awardLabelEn: string }>();
  rowsToMap(filmRows, byAward);
  rowsToMap(personRows, byAward);

  return Array.from(byAward.values()).sort((a, b) =>
    a.categoryLabel.localeCompare(b.categoryLabel, "ko")
  );
}

// SPARQL 전체 실패 시 최소한 보여줄 폴백 데이터 (하드코딩 QID 없음 — 제목만)
const FALLBACK_WINNERS: Record<FestivalType, FestivalWinner[]> = {
  academy: [
    { categoryLabel: "작품상", titleKo: "오펜하이머", titleEn: "Oppenheimer", ceremonyYear: 2024, filmQid: "Q171395" },
    { categoryLabel: "감독상", titleKo: "오펜하이머", titleEn: "Oppenheimer", ceremonyYear: 2024, filmQid: "Q171395" },
    { categoryLabel: "국제영화상", titleKo: "존재의 구역", titleEn: "The Zone of Interest", ceremonyYear: 2024, filmQid: "Q104070684" },
  ],
  cannes: [
    { categoryLabel: "황금종려상", titleKo: "아노라", titleEn: "Anora", ceremonyYear: 2024, filmQid: "Q125499906" },
    { categoryLabel: "심사위원대상", titleKo: "모두가 존재를 사랑한다", titleEn: "All We Imagine as Light", ceremonyYear: 2024, filmQid: "Q124949622" },
  ],
  berlin: [
    { categoryLabel: "황금곰상", titleKo: "다할리아", titleEn: "Dahomey", ceremonyYear: 2024, filmQid: "Q130185185" },
  ],
  venice: [
    { categoryLabel: "황금사자상", titleKo: "에이프릴", titleEn: "April", ceremonyYear: 2024, filmQid: "Q124831397" },
  ],
};

async function fetchWithFallback(type: FestivalType, sinceYear: number): Promise<FestivalWinner[]> {
  const results = await fetchFestivalWinnersRaw(FESTIVAL_FILTERS[type], sinceYear);
  if (results.length > 0) return results;
  console.warn(`[wikidata] ${type} SPARQL 결과 없음 — 폴백 사용`);
  return FALLBACK_WINNERS[type];
}

export async function fetchLatestAcademyWinners(sinceYear = new Date().getFullYear() - 3): Promise<FestivalWinner[]> {
  return fetchWithFallback("academy", sinceYear);
}

export async function fetchLatestCannesWinners(sinceYear = new Date().getFullYear() - 3): Promise<FestivalWinner[]> {
  return fetchWithFallback("cannes", sinceYear);
}

export async function fetchLatestBerlinWinners(sinceYear = new Date().getFullYear() - 3): Promise<FestivalWinner[]> {
  return fetchWithFallback("berlin", sinceYear);
}

export async function fetchLatestVeniceWinners(sinceYear = new Date().getFullYear() - 3): Promise<FestivalWinner[]> {
  return fetchWithFallback("venice", sinceYear);
}
