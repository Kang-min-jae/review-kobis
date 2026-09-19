import { auth } from "../../auth";
import { getUserProfile } from "../_lib/user-profile";
import SideMenu from "./SideMenu";

// Async RSC — auth() + DB 조회가 끝나야 렌더된다.
// SearchBar에서 Suspense로 감싸 헤더 프레임과 SearchInput은 즉시 스트리밍되고
// 이 컴포넌트만 독립적으로 비동기 스트리밍된다.
export default async function SideMenuWithData() {
  const session = await auth();

  let nickname: string | null = null;
  let monthlyRatingCount: number | undefined;
  let followerCount = 0;

  if (session?.user?.id) {
    const profile = await getUserProfile(session.user.id);
    nickname = profile.nickname;
    monthlyRatingCount = profile.monthlyRatingCount;
    followerCount = profile.followerCount;
  }

  return (
    <SideMenu
      session={session}
      nickname={nickname}
      monthlyRatingCount={monthlyRatingCount}
      followerCount={followerCount}
    />
  );
}
