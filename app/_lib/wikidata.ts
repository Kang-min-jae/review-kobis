// Wikidata SPARQL API 연동 — 세계 주요 영화제 최신 수상작 조회에 사용한다.
// 엔드포인트: https://query.wikidata.org/sparql
//
// 각 영화제별 수상 부문 Wikidata QID:
//  아카데미 - 작품상:    Q102427  감독상:     Q103360
//             여우주연상: Q103916  남우조연상:  Q106361
//             국제장편:  Q203547  장편애니:    Q173453
//             각본상:   Q103474  촬영상:      Q103537
//  칸 영화제 - 황금종려:  Q133420  심사위원대상: Q163144
//             심사위원상: Q195712  감독상:     Q151739
//             각본상:   Q4234340  남우주연상:  Q163139  여우주연상: Q163138

const SPARQL_ENDPOINT = "https://query.wikidata.org/sparql";

export type WikidataAwardWinner = {
  filmQid: string;
  titleKo: string | null;
  titleEn: string;
  awardQid: string;
  ceremonyYear: number;
};

// 지정된 부문(QID 목록) 각각의 가장 최근 수상작을 한 번에 조회한다.
// SERVICE wikibase:label로 ko → en 순서로 언어 폴백해 영화 제목을 가져온다.
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

// 부문 QID 배열을 받아 각 부문의 가장 최근 수상작 한 편씩 반환한다.
export async function fetchLatestWinners(awardQids: string[]): Promise<WikidataAwardWinner[]> {
  if (awardQids.length === 0) return [];

  // VALUES 절에 넣을 QID 목록 (wd:Qxxx 형식)
  const values = awardQids.map((q) => `wd:${q}`).join(" ");

  // 각 부문 중 가장 최신 연도(MAX) 수상작만 남기도록 서브쿼리로 연도를 먼저 구한 뒤
  // 본 쿼리에서 매칭해 상세 정보를 가져온다.
  const query = `
SELECT ?award ?film ?year ?labelKo ?labelEn WHERE {
  VALUES ?award { ${values} }
  {
    SELECT ?award (MAX(?yr) AS ?maxYear) WHERE {
      ?f p:P166 ?stmt .
      ?stmt ps:P166 ?award .
      ?stmt pq:P585 ?d .
      BIND(YEAR(?d) AS ?yr)
    }
    GROUP BY ?award
  }
  ?film p:P166 ?stmt2 .
  ?stmt2 ps:P166 ?award .
  ?stmt2 pq:P585 ?date2 .
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

// 아카데미 시상식 주요 부문 최신 수상작
export async function fetchLatestAcademyWinners(): Promise<FestivalWinner[]> {
  const CATEGORY_MAP: Record<string, string> = {
    Q102427: "작품상",
    Q103360: "감독상",
    Q103916: "여우주연상",
    Q106361: "남우조연상",
    Q203547: "국제장편영화상",
    Q173453: "장편애니메이션상",
    Q103474: "각본상",
    Q103537: "촬영상",
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

// 칸 영화제 주요 부문 최신 수상작
export async function fetchLatestCannesWinners(): Promise<FestivalWinner[]> {
  const CATEGORY_MAP: Record<string, string> = {
    Q133420: "황금종려상",
    Q163144: "심사위원대상",
    Q195712: "심사위원상",
    Q151739: "감독상",
    Q4234340: "각본상",
    Q163139: "남우주연상",
    Q163138: "여우주연상",
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
