import { safeSetItem } from "./safe-storage";
const STORAGE_KEY = "review-site:my-list:v1";
const EMPTY: string[] = [];

const listeners = new Set<() => void>();
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let cachedIds: string[] | null = null;

function load(): string[] {
  if (cachedIds) return cachedIds;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cachedIds = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    cachedIds = [];
  }
  return cachedIds;
}

function persist(next: string[]) {
  cachedIds = next;
  safeSetItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function getMyListSnapshot(): string[] {
  return load();
}

export function getServerMyListSnapshot(): string[] {
  return EMPTY;
}

export function addToMyList(movieId: string) {
  const current = load();
  if (current.includes(movieId)) return;
  persist([...current, movieId]);
}

export function removeFromMyList(movieId: string) {
  persist(load().filter((id) => id !== movieId));
}

export function moveInMyList(movieId: string, direction: "up" | "down") {
  const current = load();
  const index = current.indexOf(movieId);
  if (index === -1) return;
  const swapWith = direction === "up" ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= current.length) return;
  const next = [...current];
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  persist(next);
}
