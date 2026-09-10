// Wikidata SPARQL API 연동 — 세계 주요 영화제 최신 수상작 조회에 사용한다.
// 엔드포인트: https://query.wikidata.org/sparql
//
// "작품"에 수여되는 부문 QID만 사용한다. 배우·감독 개인에게 수여되는 연기상·감독상은
// Wikidata에서 P166(수상)이 사람 엔티티에 붙어 있어 영화 제목 대신 인명이 반환되므로
// 일부러 제외했다.
//
//  아카데미   - 작품상:       Q102427
//              국제장편영화상: Q203547
//              장편애니메이션상: Q173453
//  칸 영화제  - 황금종려상:   Q133420
//              심사위원대상:  Q163144
//              심사위원상:    Q195712
//  베를린 영화제 - 황금곰상:  Q213505
//  베니스 영화제 - 황금사자상: Q179084

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

export type WikidataAwardWinner = {
  filmQid: string;
  titleKo: string | null;
  titleEn: string;
  awardQid: string;
  ceremonyYear: number;
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
      next: { revalidate: 60 * 60 * 6 }, // 6시간 캐시 — 수상 결과는 거의 안 바뀐다
      signal: AbortSignal.timeout(15_000),
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

// 부문 QID 배열을 받아 각 부문의 가장 최근 수상 엔티티를 반환한다.
// FILTER NOT EXISTS { ?film wdt:P31 wd:Q5 } 로 사람 엔티티(Q5)를 제거해
// 배우·감독 수상 부문에서 인명이 섞이는 것을 원천 차단한다.
export async function fetchLatestWinners(awardQids: string[]): Promise<WikidataAwardWinner[]> {
  if (awardQids.length === 0) return [];

  const values = awardQids.map((q) => `wd:${q}`).join(" ");

  const query = `
SELECT ?award ?film ?year ?labelKo ?labelEn WHERE {
  VALUES ?award { ${values} }
  {
    SELECT ?award (MAX(?yr) AS ?maxYear) WHERE {
      ?f p:P166 ?stmt .
      ?stmt ps:P166 ?award .
      ?stmt pq:P585 ?d .
      FILTER NOT EXISTS { ?f wdt:P31 wd:Q5 }
      BIND(YEAR(?d) AS ?yr)
    }
    GROUP BY ?award
  }
  ?film p:P166 ?stmt2 .
  ?stmt2 ps:P166 ?award .
  ?stmt2 pq:P585 ?date2 .
  FILTER NOT EXISTS { ?film wdt:P31 wd:Q5 }
  BIND(YEAR(?date2) AS ?year)
  FILTER(?year = ?maxYear)
  OPTIONAL { ?film rdfs:label ?labelKo FILTER(LANG(?labelKo) = "ko") }
  OPTIONAL { ?film rdfs:label ?labelEn FILTER(LANG(?labelEn) = "en") }
}
`.trim();

  const rows = await sparqlFetch(query);

  const results: WikidataAwardWinner[] = [];
  for (const row of rows) {
    const filmUri = row.film?.value ?? "";
    const filmQid = filmUri.split("/").pop() ?? "";
    const titleKo = row.labelKo?.value ?? null;
    const titleEn = row.labelEn?.value ?? "";
    const awardUri = row.award?.value ?? "";
    const awardQid = awardUri.split("/").pop() ?? "";
    const year = parseInt(row.year?.value ?? "0", 10);
    if (!filmQid || !titleEn || !year) continue;
    results.push({ filmQid, titleKo, titleEn, awardQid, ceremonyYear: year });
  }
  return results;
}

// ── 영화제별 수상작 조회 ──────────────────────────────────────────────────────

export type FestivalWinner = {
  categoryLabel: string;
  titleKo: string | null;
  titleEn: string;
  ceremonyYear: number;
  filmQid: string;
};

export async function fetchLatestAcademyWinners(): Promise<FestivalWinner[]> {
  const CATEGORY_MAP: Record<string, string> = {
    Q102427: "작품상",
    Q203547: "국제장편영화상",
    Q173453: "장편애니메이션상",
  };
  const winners = await fetchLatestWinners(Object.keys(CATEGORY_MAP));
  return winners.map((w) => ({
    categoryLabel: CATEGORY_MAP[w.awardQid] ?? w.awardQid,
    titleKo: w.titleKo,
    titleEn: w.titleEn,
    ceremonyYear: w.ceremonyYear,
    filmQid: w.filmQid,
  }));
}

export async function fetchLatestCannesWinners(): Promise<FestivalWinner[]> {
  const CATEGORY_MAP: Record<string, string> = {
    Q133420: "황금종려상",
    Q163144: "심사위원대상",
    Q195712: "심사위원상",
  };
  const winners = await fetchLatestWinners(Object.keys(CATEGORY_MAP));
  return winners.map((w) => ({
    categoryLabel: CATEGORY_MAP[w.awardQid] ?? w.awardQid,
    titleKo: w.titleKo,
    titleEn: w.titleEn,
    ceremonyYear: w.ceremonyYear,
    filmQid: w.filmQid,
  }));
}

export async function fetchLatestBerlinWinners(): Promise<FestivalWinner[]> {
  const CATEGORY_MAP: Record<string, string> = {
    Q213505: "황금곰상",
  };
  const winners = await fetchLatestWinners(Object.keys(CATEGORY_MAP));
  return winners.map((w) => ({
    categoryLabel: CATEGORY_MAP[w.awardQid] ?? w.awardQid,
    titleKo: w.titleKo,
    titleEn: w.titleEn,
    ceremonyYear: w.ceremonyYear,
    filmQid: w.filmQid,
  }));
}

export async function fetchLatestVeniceWinners(): Promise<FestivalWinner[]> {
  const CATEGORY_MAP: Record<string, string> = {
    Q179084: "황금사자상",
  };
  const winners = await fetchLatestWinners(Object.keys(CATEGORY_MAP));
  return winners.map((w) => ({
    categoryLabel: CATEGORY_MAP[w.awardQid] ?? w.awardQid,
    titleKo: w.titleKo,
    titleEn: w.titleEn,
    ceremonyYear: w.ceremonyYear,
    filmQid: w.filmQid,
  }));
}
