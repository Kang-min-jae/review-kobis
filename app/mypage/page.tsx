import { redirect } from "next/navigation";
import SiteHeader from "../_components/SiteHeader";
import MyPageView from "../_components/MyPageView";
import { auth } from "../../auth";
import { db } from "../_lib/db";

export const metadata = { title: "계정설정" };

export default async function MyPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/mypage");

  const userId = session.user.id;

  const [user, accounts, ratingCount] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        email: true,
        image: true,
        password: true,
        createdAt: true,
      },
    }),
    db.account.findMany({
      where: { userId },
      select: { provider: true },
    }),
    db.review.findMany({
      where: { userId, category: "전체" },
      distinct: ["movieCd"],
      select: { movieCd: true },
    }).then((rows) => rows.length),
  ]);

  if (!user) redirect("/login");

  const linkedProviders = accounts.map((a) => a.provider);

  return (
    <main>
      <SiteHeader />
      <MyPageView
        user={{
          id: user.id,
          nickname: user.nickname ?? user.email?.split("@")[0] ?? "사용자",
          email: user.email ?? null,
          image: user.image ?? null,
          hasPassword: !!user.password,
          createdAt: user.createdAt.toISOString(),
        }}
        linkedProviders={linkedProviders}
        ratingCount={ratingCount}
      />
    </main>
  );
}
