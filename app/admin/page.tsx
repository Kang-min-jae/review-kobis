import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "../../auth";
import { getAdminStats } from "../_lib/review-actions";
import AdminNoticeAndInquiry from "./AdminNoticeAndInquiry";

export const metadata = { title: "관리자 페이지" };

const TILES = [
  { href: "/admin/inquiries", label: "1:1 문의 관리", icon: "💬", desc: "고객 문의 확인 및 답변" },
  { href: "/admin/reviews",   label: "리뷰 모더레이션", icon: "🚨", desc: "부적절한 리뷰 강제 삭제" },
  { href: "/admin/users",     label: "회원 관리",     icon: "👤", desc: "전체 유저 목록 조회" },
  { href: "/admin/winners",   label: "수상작 관리",   icon: "🏆", desc: "공식 수상작 등록/삭제" },
];

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") redirect("/");

  const stats = await getAdminStats();

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6 space-y-8">
      <div>
        <h1 className="text-xl font-bold text-text">관리자 센터</h1>
        <p className="mt-1 text-sm text-muted">서비스 모니터링 및 모더레이션</p>
      </div>

      {/* 요약 통계 */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard label="전체 회원" value={stats.totalUsers.toLocaleString()} />
        <StatCard label="오늘 신규 가입" value={`+${stats.newUsersToday}`} highlight={stats.newUsersToday > 0} />
        <StatCard label="총 리뷰 수" value={stats.totalReviews.toLocaleString()} />
        <StatCard label="미답변 문의" value={`${stats.pendingInquiries}건`} highlight={stats.pendingInquiries > 0} />
      </div>

      {/* 바로가기 타일 */}
      <div className="grid grid-cols-2 gap-3">
        {TILES.map((t) => (
          <Link prefetch={false}
            key={t.href}
            href={t.href}
            className="rounded-xl bg-surface p-4 flex flex-col gap-2 hover:bg-surface-hover transition-colors"
          >
            <span className="text-2xl">{t.icon}</span>
            <p className="text-sm font-semibold text-text">{t.label}</p>
            <p className="text-xs text-muted">{t.desc}</p>
          </Link>
        ))}
      </div>

      {/* 공지사항 & 시상식 캐시 (기존 기능 유지) */}
      <AdminNoticeAndInquiry />
    </div>
  );
}

function StatCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-xl bg-surface p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${highlight ? "text-brand" : "text-text"}`}>{value}</p>
    </div>
  );
}
