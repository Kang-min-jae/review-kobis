"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getNotifications, type Notifications } from "../_lib/notification-actions";
import { cdToMovieId } from "../_lib/rating-input";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "방금 전";
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}일 전`;
  return `${Math.floor(day / 30)}달 전`;
}

function Avatar({
  name,
  image,
  size = 8,
}: {
  name: string;
  image: string | null;
  size?: number;
}) {
  const cls = `h-${size} w-${size} shrink-0 rounded-full`;
  if (image)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={image} alt="" className={cls} />
    );
  return (
    <div
      className={`${cls} flex items-center justify-center bg-brand text-xs font-bold text-white`}
    >
      {name.slice(0, 1)}
    </div>
  );
}

export default function NotificationPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<Notifications | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getNotifications()
      .then((next) => { if (!cancelled) setData(next); })
      .catch(() => { /* 알림을 못 불러와도 패널은 연다(빈 목록) */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;

  const FOLLOWER_SHOW = 3;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/60" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-80 flex-col overflow-y-auto bg-surface p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-bold text-text">알림</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-muted hover:text-text"
            aria-label="닫기"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          </div>
        )}

        {!loading && data && (
          <div className="space-y-6">
            {/* 신고 누적으로 스포일러 표시된 내 리뷰 */}
            {data.spoilerFlags.length > 0 && (
              <section>
                <p className="mb-2 text-xs font-semibold text-muted">스포일러 표시</p>
                <ul className="space-y-3">
                  {data.spoilerFlags.map((n) => (
                    <li key={n.id} className="flex items-start gap-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-text">
                          <Link prefetch={false}
                            href={`/${n.movieCd.startsWith("tmdb-tv-") ? "series" : "movies"}/${cdToMovieId(n.movieCd)}/rate/category/${encodeURIComponent(n.category)}`}
                            onClick={onClose}
                            className="text-brand hover:underline"
                          >
                            {n.movieTitle}
                            {n.category !== "전체" ? ` (${n.category})` : ""}
                          </Link>{" "}
                          리뷰가 다른 회원들의 신고로 스포일러로 표시되었어요
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted">{timeAgo(n.flaggedAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 하트 받은 내역 */}
            <section>
              <p className="mb-2 text-xs font-semibold text-muted">받은 하트</p>
              {data.likes.length === 0 ? (
                <p className="text-xs text-muted">아직 받은 하트가 없어요.</p>
              ) : (
                <ul className="space-y-3">
                  {data.likes.map((n) => (
                    <li key={n.id} className="flex items-start gap-2.5">
                      <Link prefetch={false} href={`/user/${n.likerId}`} onClick={onClose}>
                        <Avatar name={n.likerName} image={n.likerImage} size={8} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-text">
                          <Link prefetch={false}
                            href={`/user/${n.likerId}`}
                            onClick={onClose}
                            className="font-semibold hover:underline"
                          >
                            {n.likerName}
                          </Link>
                          님이{" "}
                          <Link prefetch={false}
                            href={`/movies/${n.movieCd}/rate`}
                            onClick={onClose}
                            className="text-brand hover:underline"
                          >
                            {n.movieTitle}
                            {n.category !== "전체" ? ` (${n.category})` : ""}
                          </Link>{" "}
                          평점에 하트를 눌렀어요
                        </p>
                        <p className="mt-0.5 text-[10px] text-muted">{timeAgo(n.likedAt)}</p>
                      </div>
                      <span className="shrink-0 text-base">❤️</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* 팔로워 */}
            <section>
              <p className="mb-2 text-xs font-semibold text-muted">팔로워</p>
              {data.followers.length === 0 ? (
                <p className="text-xs text-muted">아직 팔로워가 없어요.</p>
              ) : (
                <>
                  <ul className="space-y-3">
                    {data.followers.slice(0, FOLLOWER_SHOW).map((f) => (
                      <li key={f.id} className="flex items-center gap-2.5">
                        <Link prefetch={false} href={`/user/${f.userId}`} onClick={onClose}>
                          <Avatar name={f.name} image={f.image} size={8} />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link prefetch={false}
                            href={`/user/${f.userId}`}
                            onClick={onClose}
                            className="text-xs font-semibold text-text hover:underline"
                          >
                            {f.name}
                          </Link>
                          <p className="text-[10px] text-muted">{timeAgo(f.followedAt)}</p>
                        </div>
                        <span className="shrink-0 text-[10px] text-muted">팔로잉</span>
                      </li>
                    ))}
                  </ul>
                  {data.followers.length > FOLLOWER_SHOW && (
                    <p className="mt-2 text-xs text-muted">
                      외 {data.followers.length - FOLLOWER_SHOW}명이 팔로우 중
                    </p>
                  )}
                </>
              )}
            </section>

            {/* 팔로잉 활동 */}
            <section>
              <p className="mb-2 text-xs font-semibold text-muted">팔로잉 소식</p>
              {data.followingActivity.length === 0 ? (
                <p className="text-xs text-muted">팔로우한 사람의 새 평점이 없어요.</p>
              ) : (
                <ul className="space-y-3">
                  {data.followingActivity.map((a) => (
                    <li key={a.id} className="flex items-start gap-2.5">
                      <Link prefetch={false} href={`/user/${a.userId}`} onClick={onClose}>
                        <Avatar name={a.userName} image={a.userImage} size={8} />
                      </Link>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-text">
                          <Link prefetch={false}
                            href={`/user/${a.userId}`}
                            onClick={onClose}
                            className="font-semibold hover:underline"
                          >
                            {a.userName}
                          </Link>
                          님이{" "}
                          <Link prefetch={false}
                            href={`/movies/${a.movieCd}/rate`}
                            onClick={onClose}
                            className="text-brand hover:underline"
                          >
                            {a.movieTitle}
                          </Link>
                          에 평점을 남겼어요
                        </p>
                        {a.moviePoster && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.moviePoster}
                            alt={a.movieTitle}
                            className="mt-1.5 h-12 w-8 rounded object-cover"
                          />
                        )}
                        <p className="mt-0.5 text-[10px] text-muted">{timeAgo(a.createdAt)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}

        {!loading && !data && (
          <p className="text-xs text-muted">로그인이 필요합니다.</p>
        )}
      </div>
    </>
  );
}
