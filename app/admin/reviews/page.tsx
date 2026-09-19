import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import BackBar from "../../_components/BackBar";
import SiteHeader from "../../_components/SiteHeader";
import ReviewModerator from "./ReviewModerator";

export const metadata = { title: "리뷰 모더레이션" };

export default async function AdminReviewsPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");
  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-4">
        <BackBar />
        <h1 className="mt-2 text-lg font-bold text-text">리뷰 모더레이션</h1>
        <p className="mt-1 text-sm text-muted">부적절한 리뷰를 강제 삭제할 수 있습니다.</p>
        <div className="mt-5">
          <ReviewModerator />
        </div>
      </div>
    </main>
  );
}
