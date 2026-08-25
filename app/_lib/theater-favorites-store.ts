export type FavoriteTheater = {
  chain: string;
  name: string;
  url: string;
};

const STORAGE_KEY = "review-site:theater-favorites:v1";
const EMPTY: FavoriteTheater[] = [];

const listeners = new Set<() => void>();
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

let cached: FavoriteTheater[] | null = null;

function load(): FavoriteTheater[] {
  if (cached) return cached;
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cached = raw ? (JSON.parse(raw) as FavoriteTheater[]) : [];
  } catch {
    cached = [];
  }
  return cached;
}

function persist(next: FavoriteTheater[]) {
  cached = next;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  listeners.forEach((listener) => listener());
}

export function getFavoriteTheatersSnapshot(): FavoriteTheater[] {
  return load();
}

export function getServerFavoriteTheatersSnapshot(): FavoriteTheater[] {
  return EMPTY;
}

function isSame(a: FavoriteTheater, b: Pick<FavoriteTheater, "chain" | "name">): boolean {
  return a.chain === b.chain && a.name === b.name;
}

export function isFavoriteTheater(
  favorites: FavoriteTheater[],
  theater: Pick<FavoriteTheater, "chain" | "name">
): boolean {
  return favorites.some((f) => isSame(f, theater));
}

export function toggleFavoriteTheater(theater: FavoriteTheater) {
  const current = load();
  if (isFavoriteTheater(current, theater)) {
    persist(current.filter((f) => !isSame(f, theater)));
  } else {
    persist([...current, theater]);
  }
}
