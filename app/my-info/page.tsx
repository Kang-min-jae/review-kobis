import { redirect } from "next/navigation";
import SiteHeader from "../_components/SiteHeader";
import MyInfoView from "../_components/MyInfoView";
import { auth } from "../../auth";
import { db } from "../_lib/db";
import { getUserProfile } from "../_lib/user-profile";

export const metadata = { title: "내 정보" };

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google",
  kakao: "Kakao",
  naver: "Naver",
};

export default async function MyInfoPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/my-info");

  const userId = session.user.id;

  const [user, accounts, profile] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        nickname: true,
        email: true,
        image: true,
        password: true,
        totalLikes: true,
      },
    }),
    db.account.findMany({ where: { userId }, select: { provider: true } }),
    getUserProfile(userId),
  ]);

  if (!user) redirect("/login");

  const providers = accounts.map((a) => PROVIDER_LABELS[a.provider] ?? a.provider);
  const loginMethod =
    providers.length > 0
      ? providers.join(", ")
      : user.password
      ? "이메일/비밀번호"
      : "알 수 없음";

  return (
    <main>
      <SiteHeader />
      <MyInfoView
        user={{
          id: user.id,
          nickname: user.nickname ?? user.email?.split("@")[0] ?? "사용자",
          email: user.email ?? null,
          image: user.image ?? null,
          hasPassword: !!user.password,
          totalLikes: user.totalLikes,
        }}
        loginMethod={loginMethod}
        monthlyRatingCount={profile.monthlyRatingCount}
        followerCount={profile.followerCount}
      />
    </main>
  );
}
