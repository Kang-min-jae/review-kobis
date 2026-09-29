"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import BackBar from "./BackBar";
import {
  updateNicknameAction,
  updatePasswordAction,
  deleteAccountAction,
  type ActionResult,
} from "../_lib/profile-actions";

// ── 소셜 로그인 연결 서버 액션 ──────────────────────────────────────────────
import { signInWithGoogle, signInWithKakao, signInWithNaver } from "../_lib/auth-actions";

type User = {
  id: string;
  nickname: string;
  email: string | null;
  image: string | null;
  hasPassword: boolean;
  createdAt: string;
};

type Props = {
  user: User;
  linkedProviders: string[];
  ratingCount: number;
};

// 이메일을 일부 마스킹: "example@gmail.com" → "exa***@gmail.com"
function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const visible = local.slice(0, 3);
  return `${visible}***@${domain}`;
}

function formatJoinDate(isoString: string): string {
  const date = new Date(isoString);
  return `${date.getFullYear()}년 ${date.getMonth() + 1}월 가입`;
}

// ── 모달 래퍼 ────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70" onClick={onClose} />
      <div className="fixed inset-x-4 top-1/2 z-50 max-w-sm mx-auto -translate-y-1/2 rounded-2xl bg-surface p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-bold text-text">{title}</h3>
          <button type="button" onClick={onClose} className="text-muted hover:text-text text-xl leading-none">×</button>
        </div>
        {children}
      </div>
    </>
  );
}

// ── 닉네임 변경 모달 ─────────────────────────────────────────────────────────
function NicknameModal({ current, onClose }: { current: string; onClose: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updateNicknameAction, null);

  useEffect(() => {
    if (state && "ok" in state) {
      router.refresh();
      onClose();
    }
  }, [state, router, onClose]);

  return (
    <Modal title="닉네임 변경" onClose={onClose}>
      <form action={action} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">새 닉네임</label>
          <input
            name="nickname"
            defaultValue={current}
            maxLength={20}
            className="w-full rounded-lg border border-neutral-700 bg-bg px-3 py-2.5 text-sm text-text placeholder-muted outline-none focus:border-brand"
            placeholder="닉네임을 입력해 주세요"
          />
        </div>
        {state && "error" in state && (
          <p className="text-xs text-red-400">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-black disabled:opacity-50"
        >
          {pending ? "저장 중…" : "저장하기"}
        </button>
      </form>
    </Modal>
  );
}

// ── 비밀번호 변경 모달 ───────────────────────────────────────────────────────
function PasswordModal({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(updatePasswordAction, null);
  // 성공 여부는 액션 결과에서 바로 계산한다(effect로 상태를 한 번 더 옮길 필요가 없다).
  const done = !!state && "ok" in state;

  if (done) {
    return (
      <Modal title="비밀번호 변경" onClose={onClose}>
        <div className="py-4 text-center">
          <p className="text-4xl">✅</p>
          <p className="mt-3 text-sm font-semibold text-text">비밀번호가 변경됐어요.</p>
          <button
            type="button"
            onClick={onClose}
            className="mt-5 w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-black"
          >
            확인
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="비밀번호 변경" onClose={onClose}>
      <form action={action} className="space-y-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">현재 비밀번호</label>
          <input
            name="currentPassword"
            type="password"
            className="w-full rounded-lg border border-neutral-700 bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-brand"
            placeholder="현재 비밀번호"
          />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-muted">새 비밀번호</label>
          <input
            name="newPassword"
            type="password"
            className="w-full rounded-lg border border-neutral-700 bg-bg px-3 py-2.5 text-sm text-text outline-none focus:border-brand"
            placeholder="8자 이상"
          />
        </div>
        {state && "error" in state && (
          <p className="text-xs text-red-400">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-brand py-2.5 text-sm font-bold text-black disabled:opacity-50"
        >
          {pending ? "변경 중…" : "변경하기"}
        </button>
      </form>
    </Modal>
  );
}

// ── 계정 탈퇴 확인 모달 ──────────────────────────────────────────────────────
function DeleteAccountModal({ onClose }: { onClose: () => void }) {
  const [state, action, pending] = useActionState<ActionResult | null, FormData>(deleteAccountAction, null);
  const [confirmed, setConfirmed] = useState(false);

  return (
    <Modal title="계정 탈퇴" onClose={onClose}>
      <form action={action} className="space-y-4">
        <p className="text-sm text-muted leading-relaxed">
          탈퇴 시 평점, 리뷰, 나만의 리스트를 포함한 모든 데이터가 삭제되며 복구할 수 없어요.
        </p>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="h-4 w-4 accent-brand"
          />
          <span className="text-sm text-text">위 내용을 확인했어요.</span>
        </label>
        {state && "error" in state && (
          <p className="text-xs text-red-400">{state.error}</p>
        )}
        <button
          type="submit"
          disabled={!confirmed || pending}
          className="w-full rounded-xl border border-red-500 py-2.5 text-sm font-bold text-red-400 disabled:opacity-40 hover:bg-red-500/10 transition-colors"
        >
          {pending ? "처리 중…" : "계정 탈퇴하기"}
        </button>
      </form>
    </Modal>
  );
}

// ── 토글 스위치 ──────────────────────────────────────────────────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        on ? "bg-brand" : "bg-neutral-600"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

// ── 소셜 로그인 아이콘 ───────────────────────────────────────────────────────
const SOCIAL_PROVIDERS = [
  {
    id: "google",
    label: "Google",
    bg: "#fff",
    color: "#444",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" xmlns="http://www.w3.org/2000/svg">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
  {
    id: "kakao",
    label: "Kakao",
    bg: "#FEE500",
    color: "#000",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#000">
        <path d="M12 3C6.48 3 2 6.48 2 10.8c0 2.72 1.6 5.1 4 6.56l-.96 3.58 4.12-2.72c.93.18 1.88.28 2.84.28 5.52 0 10-3.48 10-7.7S17.52 3 12 3z"/>
      </svg>
    ),
  },
  {
    id: "naver",
    label: "Naver",
    bg: "#03C75A",
    color: "#fff",
    icon: (
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="#fff">
        <path d="M13.65 12.37L9.8 6H6v12h4.35V11.63L14.2 18H18V6h-4.35v6.37z"/>
      </svg>
    ),
  },
] as const;

// ── 섹션 카드 ─────────────────────────────────────────────────────────────────
function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-2xl bg-surface p-5 space-y-4">{children}</div>;
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-sm font-bold text-text">{children}</h2>;
}

function Row({
  label,
  value,
  action,
}: {
  label: string;
  value?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-xs font-semibold text-muted">{label}</p>
        {value && <p className="mt-0.5 text-sm text-text truncate">{value}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function ChangeButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-text hover:border-brand hover:text-brand transition-colors"
    >
      변경
    </button>
  );
}

// ── 마이페이지 메인 ───────────────────────────────────────────────────────────
type ModalType = "nickname" | "password" | "deleteAccount" | null;

export default function MyPageView({ user, linkedProviders, ratingCount }: Props) {
  const [modal, setModal] = useState<ModalType>(null);
  const close = () => setModal(null);

  // 알림 설정은 localStorage에 저장
  const [notifEmail, setNotifEmail] = useState(false);
  const [notifFollow, setNotifFollow] = useState(false);
  const [notifMarketing, setNotifMarketing] = useState(false);
  const notifLoaded = useRef(false);

  useEffect(() => {
    if (notifLoaded.current) return;
    notifLoaded.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem("notif_settings") ?? "{}");
      if (typeof saved.email === "boolean") setNotifEmail(saved.email);
      if (typeof saved.follow === "boolean") setNotifFollow(saved.follow);
      if (typeof saved.marketing === "boolean") setNotifMarketing(saved.marketing);
    } catch {}
  }, []);

  function saveNotif(key: string, value: boolean) {
    try {
      const saved = JSON.parse(localStorage.getItem("notif_settings") ?? "{}");
      localStorage.setItem("notif_settings", JSON.stringify({ ...saved, [key]: value }));
    } catch {}
  }

  const joinedAt = formatJoinDate(user.createdAt);
  const initial = (user.nickname ?? "U").slice(0, 1).toUpperCase();

  return (
    <div className="px-5 py-6 space-y-4 max-w-lg mx-auto pb-10">
      <BackBar />

      {/* 페이지 제목 */}
      <div className="pt-2">
        <h1 className="text-2xl font-bold text-text">마이페이지</h1>
        <p className="mt-1 text-sm text-muted">계정 정보와 설정을 관리해요</p>
      </div>

      {/* 프로필 헤더 카드 */}
      <Card>
        <div className="flex items-center gap-4">
          <div className="relative shrink-0">
            {user.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="h-16 w-16 rounded-full object-cover" />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-star text-2xl font-bold text-black">
                {initial}
              </div>
            )}
          </div>
          <div>
            <p className="text-lg font-bold text-text">{user.nickname}</p>
            <p className="text-xs text-muted mt-0.5">
              {joinedAt} · 평점 남긴 영화{" "}
              <span className="font-semibold text-brand">{ratingCount}</span>편
            </p>
          </div>
        </div>
      </Card>

      {/* 프로필 */}
      <Card>
        <SectionTitle>프로필</SectionTitle>
        <Row
          label="닉네임"
          value={user.nickname}
          action={<ChangeButton onClick={() => setModal("nickname")} />}
        />
      </Card>

      {/* 계정 */}
      <Card>
        <SectionTitle>계정</SectionTitle>
        {user.email && (
          <Row
            label="이메일"
            value={maskEmail(user.email)}
          />
        )}
        {user.hasPassword && (
          <Row
            label="비밀번호"
            value="설정되어 있음"
            action={<ChangeButton onClick={() => setModal("password")} />}
          />
        )}
        {!user.hasPassword && !user.email && (
          <p className="text-xs text-muted">소셜 로그인으로 가입된 계정이에요.</p>
        )}
      </Card>

      {/* 연결된 소셜 계정 */}
      <Card>
        <SectionTitle>연결된 소셜 계정</SectionTitle>
        <div className="space-y-3">
          {SOCIAL_PROVIDERS.map((p) => {
            const linked = linkedProviders.includes(p.id);
            return (
              <div key={p.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                    style={{ background: p.bg, color: p.color }}
                  >
                    {p.icon}
                  </div>
                  <span className="text-sm font-semibold text-text">{p.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  {linked ? (
                    <>
                      <span className="text-xs text-green-400 font-semibold">연결됨</span>
                      <button
                        type="button"
                        className="rounded-lg border border-star/60 px-3 py-1.5 text-xs font-semibold text-star hover:bg-star/10 transition-colors"
                        onClick={() => {}}
                      >
                        연결 해제
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-xs text-muted">연결 안 됨</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (p.id === "google") signInWithGoogle("/mypage");
                          if (p.id === "kakao") signInWithKakao("/mypage");
                          if (p.id === "naver") signInWithNaver("/mypage");
                        }}
                        className="rounded-lg border border-neutral-700 px-3 py-1.5 text-xs font-semibold text-text hover:border-brand hover:text-brand transition-colors"
                      >
                        연결하기
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 알림 설정 */}
      <Card>
        <SectionTitle>알림 설정</SectionTitle>
        <Row
          label="이메일로 알림 받기"
          action={
            <Toggle
              on={notifEmail}
              onToggle={() => {
                const next = !notifEmail;
                setNotifEmail(next);
                saveNotif("email", next);
              }}
            />
          }
        />
        <Row
          label="팔로우한 사람의 새 평점 알림"
          action={
            <Toggle
              on={notifFollow}
              onToggle={() => {
                const next = !notifFollow;
                setNotifFollow(next);
                saveNotif("follow", next);
              }}
            />
          }
        />
        <Row
          label="마케팅 정보 수신"
          action={
            <Toggle
              on={notifMarketing}
              onToggle={() => {
                const next = !notifMarketing;
                setNotifMarketing(next);
                saveNotif("marketing", next);
              }}
            />
          }
        />
      </Card>

      {/* 계정 탈퇴 */}
      <Card>
        <SectionTitle>계정 탈퇴</SectionTitle>
        <p className="text-xs text-muted leading-relaxed">
          탈퇴 시 평점, 리뷰, 나만의 리스트를 포함한 모든 데이터가 삭제되며 복구할 수 없어요.
        </p>
        <button
          type="button"
          onClick={() => setModal("deleteAccount")}
          className="rounded-xl border border-red-500/60 px-4 py-2.5 text-sm font-bold text-red-400 hover:bg-red-500/10 transition-colors"
        >
          계정 탈퇴하기
        </button>
      </Card>

      {/* 모달 */}
      {modal === "nickname" && (
        <NicknameModal current={user.nickname} onClose={close} />
      )}
      {modal === "password" && <PasswordModal onClose={close} />}
      {modal === "deleteAccount" && <DeleteAccountModal onClose={close} />}
    </div>
  );
}
