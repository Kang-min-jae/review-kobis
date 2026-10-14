"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  subscribe,
  getCustomListsSnapshot,
  getServerCustomListsSnapshot,
  addMovieToList,
  removeMovieFromList,
  createList,
} from "../_lib/custom-lists-store";

// 상세 페이지 "리스트에 추가" — 나만의 영화 리스트(/my-list 아래의 직접 만든 리스트들, 기본
// "보고 싶은 영화")에 이 영화를 넣거나 뺀다. 리스트가 없으면 이름을 정해 새로 만들 수 있다.
// 리스트는 다른 리스트 기능과 같은 브라우저 저장소(custom-lists-store)에 저장된다.
export default function AddToListButton({
  movieId,
  title,
  posterUrl,
  gradient,
}: {
  movieId: string;
  title: string;
  posterUrl: string | null;
  gradient: string;
}) {
  const lists = useSyncExternalStore(subscribe, getCustomListsSnapshot, getServerCustomListsSnapshot);
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [toast, setToast] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const addedCount = lists.filter((l) => l.movies.some((m) => m.movieId === movieId)).length;

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2000);
    return () => clearTimeout(t);
  }, [toast]);

  function toggle(listId: string, listName: string, included: boolean) {
    if (included) {
      removeMovieFromList(listId, movieId);
      setToast(`"${listName}"에서 뺐어요`);
    } else {
      addMovieToList(listId, { movieId, title, posterUrl, gradient });
      setToast(`"${listName}"에 추가했어요`);
    }
  }

  function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    createList(name);
    // createList는 맨 끝에 새 리스트를 붙인다 — 방금 만든 리스트에 바로 넣는다.
    const created = getCustomListsSnapshot().at(-1);
    if (created) addMovieToList(created.id, { movieId, title, posterUrl, gradient });
    setNewName("");
    setToast(`"${name}" 리스트를 만들고 추가했어요`);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
          addedCount > 0
            ? "border-star text-star"
            : "border-neutral-700 text-text hover:border-neutral-500"
        }`}
      >
        {addedCount > 0 ? `✓ 리스트에 추가됨` : "리스트에 추가"}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="나만의 영화 리스트에 추가"
          className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border border-neutral-700 bg-surface p-3 shadow-2xl"
        >
          <p className="text-xs font-bold text-text">나만의 영화 리스트</p>
          {lists.length === 0 ? (
            <p className="mt-2 text-xs text-muted">아직 만든 리스트가 없어요.</p>
          ) : (
            <ul className="mt-2 max-h-52 space-y-1 overflow-y-auto">
              {lists.map((list) => {
                const included = list.movies.some((m) => m.movieId === movieId);
                return (
                  <li key={list.id}>
                    <button
                      type="button"
                      onClick={() => toggle(list.id, list.name, included)}
                      aria-pressed={included}
                      className="flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-sm text-text transition-colors hover:bg-black/30"
                    >
                      <span className="min-w-0 truncate">{included ? list.name : `${list.name} 추가`}</span>
                      <span className={`shrink-0 text-xs ${included ? "font-bold text-star" : "text-muted"}`}>
                        {included ? "✓ 추가됨" : `${list.movies.length}편`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <form
            className="mt-2 flex gap-1.5 border-t border-neutral-800 pt-2"
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
          >
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={40}
              placeholder="새 리스트 이름"
              aria-label="새 리스트 이름"
              className="min-w-0 flex-1 rounded-full border border-neutral-700 bg-transparent px-3 py-1.5 text-xs text-text placeholder:text-neutral-500 focus:border-star focus:outline-none"
            />
            <button
              type="submit"
              disabled={!newName.trim()}
              className="shrink-0 rounded-full bg-star px-3 py-1.5 text-xs font-bold text-black disabled:opacity-40"
            >
              만들기
            </button>
          </form>
          <Link prefetch={false} href="/my-list#collections" className="mt-2 block text-right text-[11px] text-muted hover:text-text">
            나만의 영화 리스트 보기 →
          </Link>
        </div>
      )}

      {toast && (
        <p role="status" className="absolute left-0 top-full z-20 mt-2 whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-[11px] text-text">
          {toast}
        </p>
      )}
    </div>
  );
}
