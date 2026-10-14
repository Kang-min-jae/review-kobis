import Link from "next/link";
import { db } from "../_lib/db";
import { auth } from "../../auth";
import BackBar from "../_components/BackBar";
import FaqAccordion from "../_components/FaqAccordion";
import ContactEmail from "../_components/ContactEmail";

export const metadata = { title: "고객센터" };

const FAQ_ITEMS = [
  {
    q: "추천XX% 점수는 어떻게 계산되나요?",
    a: "기본은 내가 남긴 평점으로 만든 취향 점수예요. 평점 이력·장르 선호도·감독/배우 취향과 회원들의 평균 평점을 종합해 각 영화와의 취향 일치율을 0~100%로 산출합니다. 사이트에 평가가 충분히 쌓이면, 나와 비슷하게 평가한 회원들의 평가도 일부 반영해요(이때 배지에 안내 문구가 표시돼요). 다른 회원의 개별 평점이나 신원은 공개되지 않으며, 평점을 남긴 영화가 많을수록 정확도가 올라갑니다.",
  },
  {
    q: "찾는 영화가 검색에 나오지 않을 때 어떻게 하나요?",
    a: "1:1 문의의 '신규 영화 추가 요청' 카테고리로 제목과 개봉연도를 알려주시면 빠르게 검토 후 추가해 드립니다.",
  },
  {
    q: "한줄평과 장문평 작성 기준이 궁금해요.",
    a: "한줄평은 200자 이내 짧은 감상, 장문평은 제한 없이 상세한 리뷰를 남길 수 있습니다. 동일한 영화에 한줄평·장문평을 각각 하나씩 등록할 수 있고, 수정도 가능합니다.",
  },
  {
    q: "1:1 문의는 보통 얼마나 걸려서 답변이 오나요?",
    a: "평일 기준 1~3 영업일 내에 답변을 드리고 있습니다. '내 문의 내역'에서 처리 상태를 확인할 수 있습니다.",
  },
];

export default async function HelpPage() {
  const [session, recentNotices] = await Promise.all([
    auth(),
    db.notice.findMany({
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, type: true, title: true, isNew: true, createdAt: true },
    }),
  ]);

  const isAdmin = session?.user?.role === "ADMIN";
  const pendingCount = isAdmin
    ? await db.inquiry.count({ where: { status: "답변 대기" } })
    : 0;

  return (
    <div className="mx-auto max-w-lg px-4 pb-12 pt-4">
      <BackBar />

      <h1 className="mt-4 text-xl font-bold text-text">고객센터</h1>
      <p className="mt-1 text-sm text-muted">궁금한 점은 스스로 해결하고, 문제는 편하게 알려주세요.</p>

      {/* 관리자 전용 진입 카드 */}
      {isAdmin && (
        <Link prefetch={false}
          href="/admin/inquiries"
          className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 transition hover:bg-red-500/20"
        >
          <div className="flex items-center gap-3">
            <span className="text-lg">🚨</span>
            <div>
              <p className="text-sm font-semibold text-red-400">전체 1:1 문의 관리</p>
              <p className="text-xs text-muted">관리자 전용 — 모든 유저의 문의를 확인하고 답변하세요</p>
            </div>
          </div>
          {pendingCount > 0 && (
            <span className="shrink-0 rounded-full bg-red-500 px-2.5 py-0.5 text-xs font-bold text-white">
              {pendingCount}건 대기
            </span>
          )}
        </Link>
      )}

      {/* 빠른 이동 카드 */}
      <div className={`${isAdmin ? "mt-3" : "mt-5"} grid grid-cols-2 gap-3`}>
        <Link prefetch={false}
          href="/help/inquiry"
          className="rounded-xl bg-surface p-4 transition hover:bg-surface-hover"
        >
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-brand/20 text-brand">
            ✉
          </div>
          <p className="text-sm font-semibold text-text">1:1 문의 / 오류 제보</p>
          <p className="mt-0.5 text-xs text-muted">포스터 오류, 수상 정보 오류 등을 알려주세요</p>
        </Link>
        <Link prefetch={false}
          href="/help/my-inquiries"
          className="rounded-xl bg-surface p-4 transition hover:bg-surface-hover"
        >
          <div className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-brand/20 text-brand">
            📋
          </div>
          <p className="text-sm font-semibold text-text">내 문의 내역</p>
          <p className="mt-0.5 text-xs text-muted">제보하신 내용의 처리 상태를 확인하세요</p>
        </Link>
      </div>

      {/* FAQ */}
      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-1.5 text-sm font-semibold text-muted">
          <span>❓</span> 자주 묻는 질문
        </h2>
        <FaqAccordion items={FAQ_ITEMS} />
      </section>

      {/* 공지사항 */}
      {recentNotices.length > 0 && (
        <section className="mt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="flex items-center gap-1.5 text-sm font-semibold text-muted">
              <span>📢</span> 공지사항
            </h2>
            <Link prefetch={false} href="/help/notices" className="text-xs text-muted hover:text-text">
              전체보기 →
            </Link>
          </div>
          <ul className="space-y-1.5">
            {recentNotices.map((n) => (
              <li key={n.id} className="flex items-center justify-between rounded-xl bg-surface px-4 py-3">
                <div className="flex items-center gap-2 min-w-0">
                  {n.isNew && (
                    <span className="shrink-0 rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                      NEW
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-muted">[{n.type}]</span>
                  <span className="truncate text-sm text-text">{n.title}</span>
                </div>
                <span className="ml-3 shrink-0 text-xs text-muted">
                  {new Date(n.createdAt).toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 메일 문의 */}
      <p className="mt-10 text-center text-xs leading-relaxed text-muted">
        1:1 문의 외에 메일로도 문의하실 수 있어요: <ContactEmail />
      </p>
    </div>
  );
}
