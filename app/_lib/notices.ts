import { unstable_cache } from "next/cache";
import { db } from "./db";

// 공지 목록 — 모두에게 같고 관리자가 올리거나 지울 때만 바뀐다. 예전엔 고객센터·공지 페이지를 열 때마다
// DB를 읽어, 방문(검색봇 포함) 한 번이 잠든 DB(Neon)를 깨웠다. 하루 캐시하고, 관리자가 바꾸면 태그로 바로 지운다
// (app/api/admin/notice/route.ts).
export const NOTICES_TAG = "notices";

export type NoticeItem = { id: string; type: string; title: string; content: string | null; isNew: boolean; createdAt: string };

export const getNotices = unstable_cache(
  async (): Promise<NoticeItem[]> => {
    const rows = await db.notice.findMany({ orderBy: { createdAt: "desc" }, take: 30 });
    return rows.map((n) => ({ ...n, createdAt: n.createdAt.toISOString() }));
  },
  ["notices-v1"],
  { revalidate: 60 * 60 * 24, tags: [NOTICES_TAG] },
);
