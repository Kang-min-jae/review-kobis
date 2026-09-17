import { cache } from "react";
import { db } from "./db";
import { getFollowerCount } from "./follow-actions";

// React.cache로 감싸면 같은 요청 내에서 여러 번 호출해도 DB 쿼리는 딱 한 번만 실행된다.
// SideMenuWithData + AuthButtonWithData 두 컴포넌트가 각자 호출해도 중복 쿼리가 없다.
export const getUserProfile = cache(async (userId: string) => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  const [user, monthlyRatingCount, followerCount] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { nickname: true } }),
    db.categoryRating.count({
      where: {
        userId,
        category: "전체",
        createdAt: { gte: monthStart, lt: monthEnd },
      },
    }),
    getFollowerCount(userId),
  ]);

  return {
    nickname: user?.nickname ?? null,
    monthlyRatingCount,
    followerCount,
  };
});
