import { redirect } from "next/navigation";
import SiteHeader from "../_components/SiteHeader";
import ConsentForm from "../_components/ConsentForm";
import { auth } from "../../auth";
import { hasCurrentConsent } from "../_lib/terms-consent";

// 현재 약관에 동의한 기록이 없는 계정(로그인 화면에서 바로 소셜 가입했거나, 약관이 바뀐 뒤 처음
// 로그인한 경우)이 서비스를 쓰기 전에 거치는 화면. proxy.ts가 이리로 보낸다.
export default async function ConsentPage({ searchParams }: PageProps<"/consent">) {
  const { callbackUrl } = await searchParams;
  const callback = typeof callbackUrl === "string" && callbackUrl.startsWith("/") && !callbackUrl.startsWith("//") ? callbackUrl : "/";

  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=${encodeURIComponent(callback)}`);
  if (await hasCurrentConsent(session.user.id)) redirect(callback);

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="flex items-center justify-center px-5 py-10">
        <ConsentForm callbackUrl={callback} />
      </div>
    </main>
  );
}
