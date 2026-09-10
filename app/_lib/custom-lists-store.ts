// "나만의 영화 리스트" 아래에 두는, 사용자가 직접 이름 붙이고 채우는 여러 개의
// 리스트(예: "보고 싶은 영화", "내가 뽑은 인생 영화 순위") — my-list-store.ts의
// 단일 순서 리스트와 별개다. 이 코드베이스의 다른 게스트 모드 클라이언트 스토어와
// 같은 구독/알림 패턴을 따른다.

const STORAGE_KEY = "review-site:custom-lists:v1";

export type CustomListMovie = {
  movieId: string; // "kobis-<movieCd>"
  title: string;
  posterUrl: string | null;
  gradient: string;
};

export type CustomList = {
  id: string;
  name: string;
  movies: CustomListMovie[];
};

// 한 번도 안 건드린 사용자에게 기본으로 보여줄 위시리스트 — 빈 리스트라 바로
// "+ 영화 추가"로 채우면 된다. 사용자가 지우거나 이름을 바꾸면 그 뒤로는
// localStorage에 저장된 값을 그대로 쓴다(다시 기본값으로 안 돌아감).
const DEFAULT_LISTS: CustomList[] = [{ id: "wishlist-default", name: "보고 싶은 영화", movies: [] }];

const listeners = new Set<() => void>();
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let cached: CustomList[] | null = null;

function emitChange() {
  listeners.forEach((listener) => listener());
}

function readLists(): CustomList[] {
  if (typeof window === "undefined") return DEFAULT_LISTS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_LISTS;
    return JSON.parse(raw) as CustomList[];
  } catch {
    return DEFAULT_LISTS;
  }
}

function writeLists(lists: CustomList[]) {
  cached = lists;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
  } catch {
    // 저장 실패해도 이번 방문에서 화면은 이미 바뀌었으니 무시한다.
  }
  emitChange();
}

const EMPTY: CustomList[] = [];

export function getCustomListsSnapshot(): CustomList[] {
  if (typeof window === "undefined") return EMPTY;
  if (!cached) cached = readLists();
  return cached;
}

export function getServerCustomListsSnapshot(): CustomList[] {
  return EMPTY;
}

function genId(): string {
  return `list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createList(name: string): void {
  const lists = getCustomListsSnapshot();
  writeLists([...lists, { id: genId(), name: name.trim() || "새 리스트", movies: [] }]);
}

export function renameList(listId: string, name: string): void {
  const trimmed = name.trim();
  if (!trimmed) return;
  writeLists(getCustomListsSnapshot().map((l) => (l.id === listId ? { ...l, name: trimmed } : l)));
}

export function deleteList(listId: string): void {
  writeLists(getCustomListsSnapshot().filter((l) => l.id !== listId));
}

export function addMovieToList(listId: string, movie: CustomListMovie): void {
  writeLists(
    getCustomListsSnapshot().map((l) => {
      if (l.id !== listId) return l;
      if (l.movies.some((m) => m.movieId === movie.movieId)) return l; // 이미 있으면 중복 추가 안 함
      return { ...l, movies: [...l.movies, movie] };
    })
  );
}

export function removeMovieFromList(listId: string, movieId: string): void {
  writeLists(
    getCustomListsSnapshot().map((l) =>
      l.id === listId ? { ...l, movies: l.movies.filter((m) => m.movieId !== movieId) } : l
    )
  );
}

// 드래그로 카드를 다른 위치에 놓았을 때 순서를 바꾼다.
export function reorderMovieInList(listId: string, fromIndex: number, toIndex: number): void {
  if (fromIndex === toIndex) return;
  writeLists(
    getCustomListsSnapshot().map((l) => {
      if (l.id !== listId) return l;
      const movies = [...l.movies];
      const [moved] = movies.splice(fromIndex, 1);
      movies.splice(toIndex, 0, moved);
      return { ...l, movies };
    })
  );
}
