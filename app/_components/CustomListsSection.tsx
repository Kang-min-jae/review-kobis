"use client";

import { useRef, useState, useSyncExternalStore, type DragEvent } from "react";
import Link from "next/link";
import PosterImage from "./PosterImage";
import CustomListAddMovieModal from "./CustomListAddMovieModal";
import {
  subscribe,
  getCustomListsSnapshot,
  getServerCustomListsSnapshot,
  createList,
  renameList,
  deleteList,
  removeMovieFromList,
  reorderMovieInList,
  type CustomList,
} from "../_lib/custom-lists-store";
import { isRatableMovieId, rateHrefFor } from "../_lib/rating-input";

// 리스트 이름을 클릭하면 그 자리에서 바로 고칠 수 있는 입력창으로 바뀐다.
function EditableListName({ list }: { list: CustomList }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(list.name);

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          renameList(list.id, draft);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") e.currentTarget.blur();
          if (e.key === "Escape") {
            setDraft(list.name);
            setEditing(false);
          }
        }}
        className="rounded border border-brand bg-black/30 px-1.5 py-0.5 text-sm font-bold text-text focus:outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(list.name);
        setEditing(true);
      }}
      className="flex items-center gap-1.5 text-sm font-bold text-text hover:text-brand"
    >
      {list.name}
      <span className="text-[10px] font-normal text-muted">✎ 클릭해서 이름 변경</span>
    </button>
  );
}

function ListMovieCard({
  list,
  index,
  draggingIndex,
  onDragStart,
  onDragOver,
  onDrop,
  onDragEnd,
}: {
  list: CustomList;
  index: number;
  draggingIndex: number | null;
  onDragStart: (index: number) => void;
  onDragOver: (index: number) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const movie = list.movies[index];
  // 상세 페이지의 "리스트에 추가"로 KOBIS 외 영화(tmdb-*, kmdb-* 등)도 들어올 수 있다 — 전부 평점 페이지로 연결한다.
  const isRatable = isRatableMovieId(movie.movieId);
  const rateHref = rateHrefFor(movie.movieId);

  const poster = (
    <div
      className={`relative aspect-2/3 overflow-hidden rounded-lg ${
        movie.posterUrl ? "bg-black" : `bg-gradient-to-br ${movie.gradient}`
      }`}
    >
      {movie.posterUrl && <PosterImage src={movie.posterUrl} alt={`${movie.title} 포스터`} />}
    </div>
  );

  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e: DragEvent) => {
        e.preventDefault();
        onDragOver(index);
      }}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
      className={`group relative w-32 shrink-0 cursor-grab active:cursor-grabbing ${
        draggingIndex === index ? "opacity-40" : ""
      }`}
    >
      <span className="absolute left-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/80 text-xs font-bold text-star">
        {index + 1}
      </span>
      <button
        type="button"
        onClick={() => removeMovieFromList(list.id, movie.movieId)}
        aria-label={`${movie.title} 리스트에서 빼기`}
        className="absolute right-1.5 top-1.5 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-black/80 text-xs text-white opacity-0 transition-opacity hover:bg-brand group-hover:opacity-100"
      >
        ✕
      </button>
      {isRatable ? (
        <Link href={rateHref} draggable={false}>
          {poster}
        </Link>
      ) : (
        poster
      )}
      <span className="pointer-events-none absolute bottom-1.5 right-1.5 z-10 text-sm text-white/70">⠿</span>
      <p className="mt-2 line-clamp-2 text-xs font-medium text-text">{movie.title}</p>
    </div>
  );
}

// 리스트 삭제 버튼을 누르면 뜨는, 되돌릴 수 없다는 걸 강조하는 확인 모달.
function DeleteListConfirmModal({ list, onCancel, onConfirm }: { list: CustomList; onCancel: () => void; onConfirm: () => void }) {
  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/70" onClick={onCancel} />
      <div className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2.5rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-neutral-700 bg-[#1c1f26] p-6 text-center shadow-2xl">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-black/40 text-2xl">
          🗑️
        </div>
        <h3 className="mt-4 text-base font-bold text-text">리스트를 삭제하시겠습니까?</h3>
        <p className="mt-2 text-sm text-muted">
          &ldquo;{list.name}&rdquo; 리스트와 그 안의 영화 목록이 모두 사라져요. 이 작업은 되돌릴 수 없어요.
        </p>
        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg bg-neutral-700 py-2.5 text-sm font-semibold text-text transition-colors hover:bg-neutral-600"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-brand py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand/90"
          >
            삭제
          </button>
        </div>
      </div>
    </>
  );
}

function CustomListBlock({ list }: { list: CustomList }) {
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const overIndexRef = useRef<number | null>(null);

  const handleDrop = () => {
    if (draggingIndex === null || overIndexRef.current === null) return;
    reorderMovieInList(list.id, draggingIndex, overIndexRef.current);
    setDraggingIndex(null);
    overIndexRef.current = null;
  };

  return (
    <div className="relative mt-6 rounded-xl border border-neutral-800 bg-surface p-4">
      <button
        type="button"
        onClick={() => setDeleteModalOpen(true)}
        aria-label={`${list.name} 리스트 삭제`}
        title="리스트 삭제"
        className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full border border-neutral-700 text-sm text-muted transition-colors hover:border-brand hover:bg-brand hover:text-white"
      >
        🗑️
      </button>

      <div className="pr-10">
        <EditableListName list={list} />
        <p className="mt-0.5 text-xs text-muted">{list.movies.length}편 · 드래그해서 순서 변경</p>
      </div>

      <div className="row-scrollbar mt-3 flex gap-4 overflow-x-auto pb-2">
        {list.movies.map((movie, index) => (
          <ListMovieCard
            key={movie.movieId}
            list={list}
            index={index}
            draggingIndex={draggingIndex}
            onDragStart={setDraggingIndex}
            onDragOver={(i) => {
              overIndexRef.current = i;
            }}
            onDrop={handleDrop}
            onDragEnd={() => setDraggingIndex(null)}
          />
        ))}
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="flex aspect-2/3 w-32 shrink-0 flex-col items-center justify-center rounded-lg border border-dashed border-neutral-600 text-muted transition-colors hover:border-star hover:text-star"
        >
          <span className="text-2xl">+</span>
        </button>
      </div>

      {addModalOpen && <CustomListAddMovieModal list={list} onClose={() => setAddModalOpen(false)} />}
      {deleteModalOpen && (
        <DeleteListConfirmModal
          list={list}
          onCancel={() => setDeleteModalOpen(false)}
          onConfirm={() => {
            deleteList(list.id);
            setDeleteModalOpen(false);
          }}
        />
      )}
    </div>
  );
}

// "나만의 영화 리스트" 아래에 두는, 사용자가 직접 만들고 이름 붙이는 여러 개의
// 리스트(위시리스트 등) — 카드를 드래그해서 순서를 바꾸고, 이름을 클릭해서 바꾸고,
// "+"로 영화를 검색해 추가한다.
export default function CustomListsSection() {
  const lists = useSyncExternalStore(subscribe, getCustomListsSnapshot, getServerCustomListsSnapshot);

  return (
    <div className="mt-8">
      <h2 className="text-lg font-bold text-text">나만의 영화 리스트</h2>
      <p className="mt-1 text-xs text-muted">카드를 드래그해서 순서를 바꾸거나, 리스트 이름을 클릭해서 바꿔보세요.</p>

      {lists.map((list) => (
        <CustomListBlock key={list.id} list={list} />
      ))}

      <button
        type="button"
        onClick={() => createList("새 리스트")}
        className="mt-6 w-full rounded-lg border border-dashed border-neutral-600 py-3 text-center text-sm font-semibold text-muted transition-colors hover:border-star hover:text-star"
      >
        + 새 리스트 만들기
      </button>
    </div>
  );
}
