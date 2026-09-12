import { auth } from "../../auth";
import { db } from "../_lib/db";
import { getFollowerCount } from "../_lib/follow-actions";
import AuthButton from "./AuthButton";
import SearchInput from "./SearchInput";
import SideMenu from "./SideMenu";

export default async function SearchBar() {
  const session = await auth();

  let nickname: string | null = null;
  let monthlyRatingCount: number | undefined;
  let followerCount = 0;
  if (session?.user?.id) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [user, count, fCount] = await Promise.all([
      db.user.findUnique({ where: { id: session.user.id }, select: { nickname: true } }),
      db.categoryRating.count({
        where: { userId: session.user.id, category: "전체", createdAt: { gte: monthStart, lt: monthEnd } },
      }),
      getFollowerCount(session.user.id),
    ]);
    nickname = user?.nickname ?? null;
    monthlyRatingCount = count;
    followerCount = fCount;
  }

  return (
    <div className="flex items-center gap-2 px-5 pt-5 pb-5">
      <SideMenu session={session} nickname={nickname} monthlyRatingCount={monthlyRatingCount} followerCount={followerCount} />
      <SearchInput />
      <AuthButton session={session} nickname={nickname} />
    </div>
  );
}
