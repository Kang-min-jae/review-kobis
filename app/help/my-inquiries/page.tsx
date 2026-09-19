import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "../../../auth";
import { db } from "../../_lib/db";
import BackBar from "../../_components/BackBar";

export const metadata = { title: "내 문의 내역" };

const STATUS_STYLE: Record<string, string> = {
  "답변 대기": "bg-yellow-500/20 text-yellow-400",
  "처리 완료": "bg-green-600/20 text-green-400",
};

export default async function MyInquiriesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?callbackUrl=/help/my-inquiries");

  const inquiries = await db.inquiry.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
    select: { id: true, category: true, title: true, status: true, createdAt: true },
  });

  return (
    <div className="mx-auto max-w-lg px-4 pb-12 pt-4">
      <BackBar />
      <h1 className="mt-4 text-xl font-bold text-text">내 문의 내역</h1>
      <p className="mt-1 text-sm text-muted">제보하신 내용의 처리 상태예요</p>

      {inquiries.length === 0 ? (
        <div className="mt-10 text-center">
          <p className="text-sm text-muted">아직 문의 내역이 없어요.</p>
          <Link
            href="/help/inquiry"
            className="mt-3 inline-block rounded-xl bg-surface px-5 py-2.5 text-sm text-text hover:bg-surface-hover"
          >
            문의 남기기
          </Link>
        </div>
      ) : (
        <ul className="mt-5 space-y-2">
          {inquiries.map((inq) => (
            <li key={inq.id} className="rounded-xl bg-surface px-4 py-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted">{inq.category}</p>
                  <p className="mt-0.5 truncate text-sm font-medium text-text">{inq.title}</p>
                  <p className="mt-1 text-xs text-muted">
                    {new Date(inq.createdAt).toLocaleDateString("ko-KR", {
                      year: "numeric",
                      month: "numeric",
                      day: "numeric",
                    })}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                    STATUS_STYLE[inq.status] ?? "bg-neutral-700 text-muted"
                  }`}
                >
                  {inq.status}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
