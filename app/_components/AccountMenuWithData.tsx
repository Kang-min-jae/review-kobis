import { auth } from "../../auth";
import { getUserProfile } from "../_lib/user-profile";
import AccountMenu from "./AccountMenu";
import MyReviewsSync from "./MyReviewsSync";

// 헤더 계정 영역의 서버 쪽 — 기존 auth()로 세션을 확인하고 DB 닉네임을 붙여 AccountMenu에 넘긴다.
// getUserProfile은 React.cache로 감싸져 있어 같은 요청의 SideMenuWithData와 DB 조회를 나눠 쓴다.
export default async function AccountMenuWithData() {
  const session = await auth();
  if (!session?.user?.id) {
    return (
      <>
        <MyReviewsSync userId={null} />
        <AccountMenu user={null} />
      </>
    );
  }

  const profile = await getUserProfile(session.user.id).catch(() => null);
  // nickname(DB) 우선 → OAuth name → email의 @ 앞부분 → 기본값
  const rawFallback = session.user.name ?? session.user.email ?? null;
  const fallback = rawFallback?.includes("@") ? rawFallback.split("@")[0] : rawFallback;
  const nickname = profile?.nickname ?? fallback ?? "사용자";

  return (
    <>
      {/* 다른 기기에서 남긴 평점도 이 기기의 추천도·내 별점에 반영되도록 서버 평점과 맞춘다 */}
      <MyReviewsSync userId={session.user.id} />
      <AccountMenu user={{ nickname, image: session.user.image ?? null }} />
    </>
  );
}
