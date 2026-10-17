import PersonView from "../../_components/people/PersonView";
import { safeDecode } from "../../_lib/safe-decode";

// 로그인한 방문자의 인물 페이지(요청마다 새로 그림). 로그인 쿠키가 없는 요청은 next.config.ts의 rewrite가
// 공용 캐시 페이지(app/anon/people/…)로 보낸다 — 화면은 둘 다 PersonView.

// 처음 보는 인물은 필모그래피 계산이 응답 뒤(after)까지 이어질 수 있어 넉넉히 잡는다.
export const maxDuration = 60;

export default async function PersonPage({ params, searchParams }: PageProps<"/people/[id]">) {
  const { id } = await params;
  const { pid, role, tmdbId } = await searchParams;
  return (
    <PersonView
      name={safeDecode(id)}
      pid={typeof pid === "string" ? pid : null}
      role={role === "감독" || role === "배우" ? role : null}
      tmdbIdHint={typeof tmdbId === "string" ? tmdbId : null}
      anonymous={false}
    />
  );
}
