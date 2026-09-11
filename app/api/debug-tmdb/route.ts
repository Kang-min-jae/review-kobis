import { NextResponse } from "next/server";

// TMDB API 키 및 시리즈 검색 동작을 직접 확인하기 위한 진단 엔드포인트.
// 브라우저에서 /api/debug-tmdb?q=밴드 로 호출하면 됨.
// 배포 전에 삭제해도 무방하나, 진단 중엔 유지한다.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "밴드 오브 브라더스";
  const key = process.env.TMDB_API_KEY;

  if (!key) {
    return NextResponse.json({
      error: "TMDB_API_KEY 환경변수가 설정되지 않았습니다.",
      hint: ".env 파일에 TMDB_API_KEY=your_key 추가 후 서버 재시작",
    }, { status: 500 });
  }

  const results: Record<string, unknown> = { apiKeySet: true, query: q };

  // ko-KR 검색
  try {
    const urlKo = new URL("https://api.themoviedb.org/3/search/tv");
    urlKo.searchParams.set("api_key", key);
    urlKo.searchParams.set("language", "ko-KR");
    urlKo.searchParams.set("query", q);
    const resKo = await fetch(urlKo.toString(), { signal: AbortSignal.timeout(10_000) });
    const dataKo = await resKo.json();
    results.koResults = (dataKo.results ?? []).slice(0, 3).map((r: Record<string, unknown>) => ({
      id: r.id, name: r.name, original_name: r.original_name, poster_path: r.poster_path,
    }));
    results.koTotal = dataKo.total_results ?? 0;
  } catch (e) {
    results.koError = String(e);
  }

  // en-US 검색
  try {
    const urlEn = new URL("https://api.themoviedb.org/3/search/tv");
    urlEn.searchParams.set("api_key", key);
    urlEn.searchParams.set("language", "en-US");
    urlEn.searchParams.set("query", q);
    const resEn = await fetch(urlEn.toString(), { signal: AbortSignal.timeout(10_000) });
    const dataEn = await resEn.json();
    results.enResults = (dataEn.results ?? []).slice(0, 3).map((r: Record<string, unknown>) => ({
      id: r.id, name: r.name, original_name: r.original_name, poster_path: r.poster_path,
    }));
    results.enTotal = dataEn.total_results ?? 0;
  } catch (e) {
    results.enError = String(e);
  }

  return NextResponse.json(results);
}
