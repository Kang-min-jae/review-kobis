// 영화진흥위원회(KOFIC) 박스오피스 오픈API 연동 — 국내 실제 누적 관객수/매출액.
// TMDB에는 이 데이터가 아예 없다 (TMDB revenue는 전세계 흥행 수익이지 한국 관객수가 아니다).
// KOFIC_API_KEY는 TMDB 키와 별개로 kobis.or.kr에서 무료 발급받아야 하며, 없으면 조용히
// null을 반환한다.
//
// 중요한 제약: 공개된 일별/주간 박스오피스 엔드포인트는 "그 날짜/주의 TOP 10" 순위만 준다.
// 전체 영화를 관객수 기준으로 검색하는 기능은 없어서, 이 함수는 최근 며칠 이내의 박스오피스
// 상위권에 든 영화(대체로 현재 상영중인 영화)만 찾을 수 있다. 개봉이 오래된 영화는 못 찾는다.

const KOFIC_API_BASE = "https://kobis.or.kr/kobisopenapi/webservice/rest";

export type KoficBoxOffice = {
  audiAcc: number; // 누적 관객수
  salesAcc: number; // 누적 매출액 (원)
};

type DailyBoxOfficeItem = {
  movieNm?: string;
  audiAcc?: string;
  salesAcc?: string;
};

function normalizeTitle(title: string): string {
  return title.replace(/\s+/g, "").toLowerCase();
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toDateStamp(date: Date): string {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

async function fetchDailyBoxOffice(targetDt: string, apiKey: string): Promise<DailyBoxOfficeItem[]> {
  const url = new URL(`${KOFIC_API_BASE}/boxoffice/searchDailyBoxOfficeList.json`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("targetDt", targetDt);

  const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
  if (!res.ok) {
    console.warn(`[kofic] 일별 박스오피스(${targetDt}) 조회 실패: HTTP ${res.status}`);
    return [];
  }

  const data: { boxOfficeResult?: { dailyBoxOfficeList?: DailyBoxOfficeItem[] } } = await res.json();
  return data.boxOfficeResult?.dailyBoxOfficeList ?? [];
}

export type KoficWeeklyEntry = {
  rank: number;
  movieNm: string;
  audiAcc: number;
  salesAcc: number;
};

// 이번 주 박스오피스 TOP N. KOFIC 주간 박스오피스는 "월~일" 한 주를 그 주의 월요일 날짜로
// 조회한다. 이번 주는 아직 집계 중일 수 있어, 데이터가 확정된 지난 주 기준으로 가져온다.
export async function getWeeklyBoxOffice(limit = 10): Promise<KoficWeeklyEntry[]> {
  const apiKey = process.env.KOFIC_API_KEY;
  if (!apiKey) return [];

  const now = new Date();
  const diffToMonday = (now.getDay() + 6) % 7; // 오늘이 월요일이면 0
  const lastMonday = new Date(now);
  lastMonday.setDate(now.getDate() - diffToMonday - 7);

  const url = new URL(`${KOFIC_API_BASE}/boxoffice/searchWeeklyBoxOfficeList.json`);
  url.searchParams.set("key", apiKey);
  url.searchParams.set("targetDt", toDateStamp(lastMonday));
  url.searchParams.set("weekGb", "0"); // 0: 주간(월~일)

  try {
    const res = await fetch(url, { next: { revalidate: 60 * 60 * 6 } });
    if (!res.ok) {
      console.warn(`[kofic] 주간 박스오피스 조회 실패: HTTP ${res.status}`);
      return [];
    }
    const data: { boxOfficeResult?: { weeklyBoxOfficeList?: DailyBoxOfficeItem[] } } =
      await res.json();
    const list = data.boxOfficeResult?.weeklyBoxOfficeList ?? [];
    return list.slice(0, limit).map((item, index) => ({
      rank: index + 1,
      movieNm: item.movieNm ?? "제목 없음",
      audiAcc: Number(item.audiAcc ?? 0),
      salesAcc: Number(item.salesAcc ?? 0),
    }));
  } catch (error) {
    console.warn(`[kofic] 주간 박스오피스 요청 중 오류:`, error);
    return [];
  }
}

// 최근 며칠간의 일별 박스오피스에서 제목이 일치하는 영화를 찾는다.
export async function getKoficBoxOfficeByTitle(title: string): Promise<KoficBoxOffice | null> {
  const apiKey = process.env.KOFIC_API_KEY;
  if (!apiKey) return null;

  const target = normalizeTitle(title);

  try {
    // KOFIC은 당일 데이터가 아직 집계 전일 수 있어 어제부터 최대 3일 전까지 훑는다.
    for (let daysAgo = 1; daysAgo <= 3; daysAgo++) {
      const date = new Date();
      date.setDate(date.getDate() - daysAgo);
      const targetDt = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;

      const list = await fetchDailyBoxOffice(targetDt, apiKey);
      const match = list.find((item) => item.movieNm && normalizeTitle(item.movieNm) === target);
      if (match) {
        return {
          audiAcc: Number(match.audiAcc ?? 0),
          salesAcc: Number(match.salesAcc ?? 0),
        };
      }
    }
    return null;
  } catch (error) {
    console.warn(`[kofic] "${title}" 박스오피스 조회 중 오류:`, error);
    return null;
  }
}
