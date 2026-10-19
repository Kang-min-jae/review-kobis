import PersonView from "../../../../../../_components/people/PersonView";
import { safeDecode } from "../../../../../../_lib/safe-decode";

// 로그인 쿠키가 없는 요청의 인물 페이지 — next.config.ts의 rewrite가 /people/<이름>?role=…&pid=…&tmdbId=…를
// 이 경로로 보낸다(쿼리 값은 경로 조각으로 옮기고, 없는 값은 "-"). 주소창에는 원래 주소가 보인다.
// 로그인 정보를 읽지 않아 모든 방문자에게 같은 화면이라 캐시(ISR)해 두고 CDN이 바로 응답한다 — 예전엔
// 검색봇·비로그인 방문마다 서버 함수가 돌고 필모그래피 JSON을 DB에서 새로 읽었다.
// 공용 캐시 페이지는 요청마다 달라지는 정보를 읽지 않는다 — force-static이면 cookies()/headers()가 빈 값이
// 되어 로그인 정보가 섞일 수 없고, 외부 API를 부르는 cache: "no-store" fetch(예고편·TMDB·KMDb·KOBIS)도
// 페이지를 동적으로 바꾸지 않고 캐시 없이 실행만 된다. 이게 없으면 그런 fetch를 만나는 순간
// "Page changed from static to dynamic at runtime" 오류로 500이 났다(tests/anon-pages.test.ts가 지킨다).
export const dynamic = "force-static";
export const revalidate = 3600;
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

// 처음 보는 인물은 필모그래피 계산이 응답 뒤(after)까지 이어질 수 있어 넉넉히 잡는다.
export const maxDuration = 60;

const value = (segment: string) => {
  const decoded = safeDecode(segment);
  return decoded === "-" ? null : decoded;
};

export default async function AnonPersonPage({ params }: PageProps<"/anon/people/[id]/[role]/[pid]/[tmdbId]">) {
  const { id, role, pid, tmdbId } = await params;
  const roleValue = value(role);
  return (
    <PersonView
      name={safeDecode(id)}
      pid={value(pid)}
      role={roleValue === "감독" || roleValue === "배우" ? roleValue : null}
      tmdbIdHint={value(tmdbId)}
      anonymous
    />
  );
}
