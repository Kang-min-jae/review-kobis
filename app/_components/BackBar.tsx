"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { NAV_DEPTH_KEY } from "./NavHistoryTracker";

// 뒤로가기는 실제 브라우저 back()으로 동작한다 — router.push(직전경로)로 흉내 냈던
// 이전 버전은 "새 히스토리 항목을 추가하는 이동"이라 진짜 뒤로가기와 미묘하게 달랐다
// (버튼이 눌리는 건 확인되는데 화면이 안 바뀌는 증상의 유력한 원인).
// NavHistoryTracker가 이 세션에서 실제로 이동한 횟수를 세어두고, 그 값이 있을 때만
// back()을 쓴다 — 없으면(새 탭으로 바로 들어옴 등) back()이 사이트 밖으로 나가버릴 수
// 있어서 홈으로 대체한다. 히스토리가 없을 수도 있는 경우를 대비해 홈 버튼도 따로 둔다.
export default function BackBar() {
  const router = useRouter();

  function handleBack() {
    console.debug("[BackBar] ← 뒤로 클릭됨");
    try {
      const depth = Number(sessionStorage.getItem(NAV_DEPTH_KEY) ?? "0");
      console.debug("[BackBar] 이번 세션 이동 횟수:", depth);
      if (depth > 1) {
        sessionStorage.setItem(NAV_DEPTH_KEY, String(depth - 1));
        router.back();
        return;
      }
      console.debug("[BackBar] 이동 기록 없음 → 홈으로 이동");
    } catch (err) {
      console.warn("[BackBar] 방문 기록을 읽지 못해 홈으로 이동합니다:", err);
    }
    router.push("/");
  }

  return (
    <div className="fixed left-4 top-4 z-50 flex items-center gap-3 rounded-full bg-bg/80 px-3 py-1.5 text-sm shadow-sm backdrop-blur-sm">
      <button
        type="button"
        onClick={handleBack}
        className="cursor-pointer text-muted hover:text-text"
      >
        ← 뒤로
      </button>
      <span className="h-3 w-px bg-neutral-700" />
      <Link href="/" className="cursor-pointer text-muted hover:text-text">
        홈
      </Link>
    </div>
  );
}
