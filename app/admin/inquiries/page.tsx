import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import BackBar from "../../_components/BackBar";
import SiteHeader from "../../_components/SiteHeader";
import InquiryManager from "./InquiryManager";

export const metadata = { title: "문의 관리" };

export default async function AdminInquiriesPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");
  return (
    <main>
      <SiteHeader />
      <div className="mx-auto max-w-2xl px-4 pb-16 pt-4">
        <BackBar />
        <h1 className="mt-2 text-lg font-bold text-text">1:1 문의 관리</h1>
        <div className="mt-5">
          <InquiryManager />
        </div>
      </div>
    </main>
  );
}
