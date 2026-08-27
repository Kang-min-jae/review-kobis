import BackBar from "../../_components/BackBar";
import FilmographyGrid from "../../_components/FilmographyGrid";
import { searchMovieCatalog, findMovieCdByTitleAndPerson } from "../../_lib/kobis";
import { searchKmdbFilmography } from "../../_lib/kmdb";
import { isRecentlyOpened, toRowMovie } from "../../_lib/movie-rows";
import type { RowMovie } from "../../_lib/movie-rows";

const FALLBACK_GRADIENT = "from-neutral-800 via-neutral-600 to-neutral-400";

// KMDb에서 이름(+가능하면 인물 코드, 역할)으로 감독/배우 참여작을 찾고, 평점 페이지로
// 연결하기 위해 각 작품을 KOBIS movieCd와 매칭한다 (KOBIS에 없는 — 국내 미개봉 — 작품은
// 평점을 남길 방법이 없어서 목록에서 제외한다). role을 주면 "배우 톰 홀랜드"에 이름만
// 같은 "감독 톰 홀랜드"의 작품이 섞이는 것을 막을 수 있다.
async function filmographyFromKmdb(
  name: string,
  personId: string | null,
  role: "감독" | "배우" | null
): Promise<RowMovie[]> {
  const movies = await searchKmdbFilmography(name, personId, role);
  if (movies.length === 0) return [];

  // 한글 제목으로 KOBIS에서 못 찾으면 영문 제목으로 재시도한다 — 외화는 KMDb와 KOBIS의
  // 한글 번역 표기가 다른 경우가 흔하다(특히 배우 필모그래피에 외화가 많을 때 영향이 크다).
  // 제목이 같은 동명이인 영화(예: "컨택트")가 여럿이면 실제 출연진에 이 사람 이름이
  // 있는 쪽만 채택한다 — 안 그러면 전혀 다른 영화 정보로 연결될 수 있다.
  const movieCds = await Promise.all(
    movies.map((m) => findMovieCdByTitleAndPerson(m.title, name, m.titleEng, role))
  );
  const rows: RowMovie[] = [];
  movies.forEach((movie, i) => {
    const movieCd = movieCds[i];
    if (!movieCd) return;
    rows.push({
      id: `kobis-${movieCd}`,
      title: movie.title,
      posterUrl: movie.posterUrl,
      gradient: FALLBACK_GRADIENT,
      isNowShowing: isRecentlyOpened(movie.releaseDate),
    });
  });
  return rows;
}

// KOBIS searchMovieList의 directorNm으로 감독 재검색 (배우 이름으로는 필터링 불가 —
// 배우일 경우 그냥 빈 배열이 온다). KMDb 검색은 전문(full-text) 검색이라 특정 인물의
// 작품을 다 못 찾는 경우가 있어서, KMDb 결과가 있어도 항상 같이 돌려서 합친다 —
// KOBIS의 정확한 감독명 필터가 KMDb에서 누락된 작품을 채워준다.
async function filmographyFromKobisDirector(name: string): Promise<RowMovie[]> {
  const candidates = await searchMovieCatalog({ directorNm: name }, 30);
  return Promise.all(candidates.map(toRowMovie));
}

export default async function PersonPage({ params, searchParams }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const { pid, role: roleParam } = await searchParams;
  const name = decodeURIComponent(id);
  const personId = typeof pid === "string" ? pid : null;
  const role = roleParam === "감독" || roleParam === "배우" ? roleParam : null;

  // KOBIS 감독명 검색은 감독만 걸러줄 수 있어서(배우로는 필터링이 안 됨), 이 사람이
  // 배우라고 이미 알고 있으면 아예 돌리지 않는다 — 안 그러면 이름만 같은 감독의 작품이
  // 배우 필모그래피에 섞여 들어온다.
  const shouldSearchKobisDirector = role !== "배우";

  const [kmdbRows, kobisDirectorRows] = await Promise.all([
    filmographyFromKmdb(name, personId, role),
    shouldSearchKobisDirector ? filmographyFromKobisDirector(name) : Promise.resolve([]),
  ]);

  // KMDb는 포스터가 있어 우선하고, KOBIS 감독 검색에만 있는 작품(KMDb 누락분)을 채워 넣는다.
  const byId = new Map<string, RowMovie>();
  for (const row of kmdbRows) byId.set(row.id, row);
  for (const row of kobisDirectorRows) if (!byId.has(row.id)) byId.set(row.id, row);
  const movies: RowMovie[] = Array.from(byId.values());

  return (
    <main className="px-5 py-6">
      <BackBar />

      <h1 className="mt-3 text-lg font-bold text-text">{name}</h1>
      <p className="mt-1 text-xs text-muted">참여작 {movies.length}편 · 평점 높은 순</p>

      <section className="mt-6">
        <FilmographyGrid movies={movies} />
      </section>
    </main>
  );
}
