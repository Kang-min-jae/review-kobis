import PersonView from "../../../../../../_components/people/PersonView";
import { safeDecode } from "../../../../../../_lib/safe-decode";

// 로그인 쿠키가 없는 요청의 인물 페이지 — next.config.ts의 rewrite가 /people/<이름>?role=…&pid=…&tmdbId=…를
// 이 경로로 보낸다(쿼리 값은 경로 조각으로 옮기고, 없는 값은 "-"). 주소창에는 원래 주소가 보인다.
// 로그인 정보를 읽지 않아 모든 방문자에게 같은 화면이라 캐시(ISR)해 두고 CDN이 바로 응답한다 — 예전엔
// 검색봇·비로그인 방문마다 서버 함수가 돌고 필모그래피 JSON을 DB에서 새로 읽었다.
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
