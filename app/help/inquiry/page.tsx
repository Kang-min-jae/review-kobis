import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import BackBar from "../../_components/BackBar";
import HelpInquiryForm from "../../_components/HelpInquiryForm";

export const metadata = { title: "1:1 문의 / 오류 제보" };

export default async function InquiryPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/help/inquiry");

  return (
    <div className="mx-auto max-w-lg px-4 pb-12 pt-4">
      <BackBar />
      <h1 className="mt-4 text-xl font-bold text-text">1:1 문의 / 오류 제보</h1>
      <p className="mt-1 text-sm text-muted">어떤 문제인지 알려주시면 빠르게 확인할게요</p>
      <HelpInquiryForm />
    </div>
  );
}
