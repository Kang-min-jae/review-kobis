"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setMovieHiddenAction } from "../_lib/movie-moderation-actions";

// 관리자 전용 "숨기기" / "숨김 해제" 버튼 — 상세 페이지에서 관리자에게만 보인다(MovieDetail).
export default function MovieModerationButton({ movieCd, hidden }: { movieCd: string; hidden: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  const onClick = () => {
    let reason: string | undefined;
    if (!hidden) {
      const answer = window.prompt("이 영화를 메인·추천·목록·검색에서 숨깁니다. 사유를 적어 주세요(선택).", "성인물");
      if (answer === null) return;
      reason = answer;
    } else if (!window.confirm("숨김을 해제할까요? 다시 메인·추천·목록에 나올 수 있어요.")) {
      return;
    }
    startTransition(async () => {
      const result = await setMovieHiddenAction({ movieCd, hidden: !hidden, reason });
      if ("error" in result) {
        setMessage(result.error);
        return;
      }
      setMessage(hidden ? "숨김을 해제했어요." : "숨겼어요.");
      router.refresh();
    });
  };

  return (
    <div className="mt-3 flex items-center gap-2 text-xs">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="rounded-lg border border-red-500/60 px-3 py-1.5 font-semibold text-red-300 hover:bg-red-500/10 disabled:opacity-50"
      >
        {pending ? "처리 중…" : hidden ? "관리자: 숨김 해제" : "관리자: 이 영화 숨기기"}
      </button>
      {message && <span className="text-muted">{message}</span>}
    </div>
  );
}
