// 작품 상세 페이지 캐시 무효화(서버 액션에서 부른다).
//
// 로그인한 사람의 상세 페이지(/movies|/series/<id>/rate/category/<항목>)는 요청마다 새로 만들어지지만, 로그인
// 쿠키 없는 요청에 내주는 공용 페이지(/anon/…)는 캐시(ISR)돼 있어서 리뷰·평점·공감이 바뀌면 바로 다시 만들게
// 해야 한다. 한 항목의 평점이 바뀌어도 모든 항목 탭에 보이는 "항목별 평점" 평균이 바뀌므로 공용 페이지는
// 항목 탭을 모두 무효화한다. 경로 표기(한글 그대로 / 퍼센트 인코딩)에 상관없이 지워지도록 둘 다 넘긴다.
import { revalidatePath } from "next/cache";

const CATEGORIES = ["전체", "연출", "연기", "각본", "음악", "편집"] as const;

function section(movieId: string): "movies" | "series" {
  return movieId.startsWith("tmdb-tv-") ? "series" : "movies";
}

export function revalidateDetailPages(movieId: string, category: string) {
  const base = `/${section(movieId)}/${movieId}/rate/category`;
  revalidatePath(`${base}/${encodeURIComponent(category)}`);
  for (const c of CATEGORIES) {
    revalidatePath(`/anon${base}/${c}`);
    revalidatePath(`/anon${base}/${encodeURIComponent(c)}`);
  }
}

// 관리자 도구(예고편 등)처럼 어느 작품인지 정하지 않고 모든 상세 페이지를 다시 만들 때.
export function revalidateAllDetailPages() {
  revalidatePath("/movies/[id]/rate/category/[category]", "page");
  revalidatePath("/series/[id]/rate/category/[category]", "page");
  revalidatePath("/anon/movies/[id]/rate/category/[category]", "page");
  revalidatePath("/anon/series/[id]/rate/category/[category]", "page");
}
