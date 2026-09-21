"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import BackBar from "./BackBar";
import {
  updateNicknameAction,
  updatePasswordAction,
  type ActionResult,
} from "../_lib/profile-actions";
import { getBadge, TIER_STYLES } from "../_lib/tier";

const inputClass =
  "w-full rounded-lg border border-neutral-700 bg-bg px-4 py-3 text-sm text-text placeholder:text-muted focus:border-brand focus:outline-none";

type User = {
  id: string;
  nickname: string;
  email: string | null;
  image: string | null;
  hasPassword: boolean;
  totalLikes: number;
};

type Props = {
  user: User;
  loginMethod: string;
  monthlyRatingCount: number;
  followerCount: number;
};

function Modal({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 z-50 max-w-sm mx-auto -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-2xl">
        {children}
      </div>
    </>
  );
}

function NicknameModal({ current, onClose }: { current: string; onClose: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(
    updateNicknameAction,
    null
  );

  useEffect(() => {
    if (state && "ok" in state) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  return (
    <Modal onClose={onClose}>
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-text">닉네임 변경</h3>
        <button type="button" onClick={onClose} className="text-xl text-muted hover:text-text">
          ×
        </button>
      </div>
      <form action={action} className="space-y-4">
        <input
          name="nickname"
          defaultValue={current}
          maxLength={20}
          className={inputClass}
          placeholder="새 닉네임을 입력해 주세요"
          autoFocus
        />
        {state && "error" in state && <p className="text-xs text-brand">{state.error}</p>}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
        >
          {pending ? "저장 중…" : "저장하기"}
        </button>
      </form>
    </Modal>
  );
}

export default function MyInfoView({
  user,
  loginMethod,
  monthlyRatingCount,
  followerCount,
}: Props) {
  const [showNicknameModal, setShowNicknameModal] = useState(false);
  const [pwState, pwAction, pwPending] = useActionState<ActionResult | null, FormData>(
    updatePasswordAction,
    null
  );
  const [pwDone, setPwDone] = useState(false);
  const [newPw, setNewPw] = useState("");
  const [pwConfirm, setPwConfirm] = useState("");

  useEffect(() => {
    if (pwState && "ok" in pwState) setPwDone(true);
  }, [pwState]);

  const tier = getBadge(user.totalLikes);
  const initial = (user.nickname ?? "U").slice(0, 1).toUpperCase();
  const pwMismatch = pwConfirm.length > 0 && newPw !== pwConfirm;

  return (
    <div className="mx-auto max-w-lg px-5 pb-16 pt-4 space-y-5">
      {/* 헤더 */}
      <div className="flex items-center gap-2">
        <BackBar />
      </div>
      <h1 className="text-xl font-bold text-text">내 정보</h1>

      {/* 프로필 */}
      <div className="flex items-center gap-4">
        {user.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-star text-xl font-bold text-black">
            {initial}
          </div>
        )}
        <div>
          <p className="flex items-center gap-2 font-bold text-text">
            <span>{user.nickname}님</span>
            <span
              className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${TIER_STYLES[tier].border} ${TIER_STYLES[tier].text} ${TIER_STYLES[tier].bg}`}
            >
              {tier}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-muted">
            이번 달 {monthlyRatingCount}편 관람 · 팔로워 {followerCount}
          </p>
        </div>
      </div>

      {/* 닉네임 */}
      <div className="rounded-2xl bg-surface p-5">
        <p className="mb-3 text-xs font-semibold text-muted">닉네임</p>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-text">{user.nickname}</p>
          <button
            type="button"
            onClick={() => setShowNicknameModal(true)}
            className="rounded-lg border border-brand px-4 py-1.5 text-xs font-semibold text-brand transition-colors hover:bg-brand/10"
          >
            변경
          </button>
        </div>
      </div>

      {/* 계정 정보 */}
      <div className="rounded-2xl bg-surface p-5 space-y-3">
        <p className="text-xs font-semibold text-muted">계정 정보</p>
        {user.email && (
          <div className="flex items-center justify-between gap-3">
            <p className="shrink-0 text-xs text-muted">이메일</p>
            <p className="truncate text-sm text-text">{user.email}</p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3">
          <p className="shrink-0 text-xs text-muted">로그인 방식</p>
          <p className="text-sm text-text">{loginMethod}</p>
        </div>
      </div>

      {/* 비밀번호 변경 — 크레덴셜 로그인 사용자만 표시 */}
      {user.hasPassword && (
        <div className="rounded-2xl bg-surface p-5 space-y-4">
          <p className="text-xs font-semibold text-muted">비밀번호 변경</p>

          {pwDone ? (
            <p className="text-sm font-semibold text-green-400">비밀번호가 변경됐어요. ✓</p>
          ) : (
            <form
              action={pwAction}
              onSubmit={(e) => { if (pwMismatch) e.preventDefault(); }}
              className="space-y-3"
            >
              <div>
                <p className="mb-1.5 text-xs text-muted">현재 비밀번호</p>
                <input
                  name="currentPassword"
                  type="password"
                  required
                  className={inputClass}
                  placeholder="현재 비밀번호를 입력하세요"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted">새 비밀번호</p>
                <input
                  name="newPassword"
                  type="password"
                  required
                  minLength={8}
                  value={newPw}
                  onChange={(e) => setNewPw(e.target.value)}
                  className={inputClass}
                  placeholder="새 비밀번호를 입력하세요"
                />
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted">새 비밀번호 확인</p>
                <input
                  type="password"
                  required
                  value={pwConfirm}
                  onChange={(e) => setPwConfirm(e.target.value)}
                  className={inputClass}
                  placeholder="새 비밀번호를 한 번 더 입력하세요"
                />
                {pwMismatch && (
                  <p className="mt-1 text-xs text-brand">비밀번호가 일치하지 않아요.</p>
                )}
              </div>
              {pwState && "error" in pwState && (
                <p className="text-xs text-brand">{pwState.error}</p>
              )}
              <button
                type="submit"
                disabled={pwPending || pwMismatch}
                className="w-full rounded-full bg-brand py-3 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
              >
                {pwPending ? "변경 중…" : "비밀번호 변경"}
              </button>
            </form>
          )}
        </div>
      )}

      {showNicknameModal && (
        <NicknameModal current={user.nickname} onClose={() => setShowNicknameModal(false)} />
      )}
    </div>
  );
}
