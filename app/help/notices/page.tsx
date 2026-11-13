import { connection } from "next/server";
import { getNotices } from "../../_lib/notices";
import BackBar from "../../_components/BackBar";

export const metadata = { title: "공지사항" };

const TYPE_STYLE: Record<string, string> = {
  "업데이트": "bg-brand/20 text-brand",
  "신규 기능": "bg-blue-500/20 text-blue-400",
  "점검 안내": "bg-yellow-500/20 text-yellow-400",
  "공지": "bg-neutral-600/40 text-muted",
};

export default async function NoticesPage() {
  // 빌드 때가 아니라 요청 때 만든다(빌드 중 DB에 붙지 않게). 목록은 하루 캐시된 것을 읽는다(notices.ts) —
  // 방문마다 DB를 깨우지 않고, 관리자가 공지를 올리거나 지우면 바로 새로 읽는다.
  await connection();
  const notices = await getNotices().catch((error) => {
    console.error("[notices] 공지 조회 실패:", error);
    return [];
  });

  return (
    <div className="mx-auto max-w-lg px-4 pb-12 pt-4">
      <BackBar />
      <h1 className="mt-4 text-xl font-bold text-text">공지사항</h1>
      <p className="mt-1 text-sm text-muted">업데이트, 점검 일정을 알려드려요</p>

      {notices.length === 0 && <p className="mt-5 text-sm text-muted">아직 등록된 공지사항이 없어요.</p>}

      <ul className="mt-5 space-y-2">
        {notices.map((n) => (
          <li key={n.id} className="rounded-xl bg-surface px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-2">
                  {n.isNew && (
                    <span className="rounded bg-brand px-1.5 py-0.5 text-[10px] font-bold text-white">
                      NEW
                    </span>
                  )}
                  <span
                    className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                      TYPE_STYLE[n.type] ?? "bg-neutral-700 text-muted"
                    }`}
                  >
                    {n.type}
                  </span>
                </div>
                <p className="text-sm font-semibold text-text">{n.title}</p>
                {n.content && (
                  <p className="mt-1 text-xs leading-relaxed text-muted">{n.content}</p>
                )}
              </div>
              <p className="shrink-0 text-xs text-muted">
                {new Date(n.createdAt).toLocaleDateString("ko-KR", {
                  year: "numeric",
                  month: "numeric",
                  day: "numeric",
                })}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
