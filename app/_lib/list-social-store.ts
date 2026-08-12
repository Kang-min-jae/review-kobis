// 실제 계정/백엔드가 없는 목데이터 단계이므로, "다른 사용자들의 팔로우/좋아요"는
// 기본 수치(base)에 이 브라우저에서의 내 토글(+1/-1)을 더해 흉내낸다.

const SOCIAL_KEY = "review-site:my-list-social:v1";
const VIEWS_KEY = "review-site:my-list-views:v1";

type SocialState = {
  following: boolean;
  liked: boolean;
  followerBase: number;
  likeBase: number;
};

type ViewsState = {
  total: number;
  byDate: Record<string, number>;
};

const DEFAULT_SOCIAL: SocialState = {
  following: false,
  liked: false,
  followerBase: 0,
  likeBase: 0,
};

const DEFAULT_VIEWS_SNAPSHOT = { total: 0, today: 0 };

const listeners = new Set<() => void>();
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function emitChange() {
  listeners.forEach((listener) => listener());
}

let cachedSocial: SocialState | null = null;

function loadSocial(): SocialState {
  if (cachedSocial) return cachedSocial;
  if (typeof window === "undefined") return DEFAULT_SOCIAL;
  try {
    const raw = window.localStorage.getItem(SOCIAL_KEY);
    cachedSocial = raw ? (JSON.parse(raw) as SocialState) : { ...DEFAULT_SOCIAL };
  } catch {
    cachedSocial = { ...DEFAULT_SOCIAL };
  }
  return cachedSocial;
}

function persistSocial(next: SocialState) {
  cachedSocial = next;
  window.localStorage.setItem(SOCIAL_KEY, JSON.stringify(next));
  emitChange();
}

export function getSocialSnapshot(): SocialState {
  return loadSocial();
}

export function getServerSocialSnapshot(): SocialState {
  return DEFAULT_SOCIAL;
}

export function getFollowerCount(state: SocialState): number {
  return state.followerBase + (state.following ? 1 : 0);
}

export function getLikeCount(state: SocialState): number {
  return state.likeBase + (state.liked ? 1 : 0);
}

export function toggleFollow() {
  const current = loadSocial();
  persistSocial({ ...current, following: !current.following });
}

export function toggleLike() {
  const current = loadSocial();
  persistSocial({ ...current, liked: !current.liked });
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

let cachedViews: ViewsState | null = null;

function loadViews(): ViewsState {
  if (cachedViews) return cachedViews;
  if (typeof window === "undefined") return { total: DEFAULT_VIEWS_SNAPSHOT.total, byDate: {} };
  try {
    const raw = window.localStorage.getItem(VIEWS_KEY);
    cachedViews = raw ? (JSON.parse(raw) as ViewsState) : { total: DEFAULT_VIEWS_SNAPSHOT.total, byDate: {} };
  } catch {
    cachedViews = { total: DEFAULT_VIEWS_SNAPSHOT.total, byDate: {} };
  }
  return cachedViews;
}

let cachedViewsSnapshot: { total: number; today: number } | null = null;
let cachedViewsSnapshotSource: ViewsState | null = null;

export function getViewsSnapshot(): { total: number; today: number } {
  const state = loadViews();
  if (cachedViewsSnapshotSource === state && cachedViewsSnapshot) return cachedViewsSnapshot;
  cachedViewsSnapshotSource = state;
  cachedViewsSnapshot = { total: state.total, today: state.byDate[todayKey()] ?? 0 };
  return cachedViewsSnapshot;
}

export function getServerViewsSnapshot(): { total: number; today: number } {
  return DEFAULT_VIEWS_SNAPSHOT;
}

let hasRecordedViewThisSession = false;
export function recordView() {
  if (typeof window === "undefined" || hasRecordedViewThisSession) return;
  hasRecordedViewThisSession = true;
  const state = loadViews();
  const key = todayKey();
  cachedViews = {
    total: state.total + 1,
    byDate: { ...state.byDate, [key]: (state.byDate[key] ?? 0) + 1 },
  };
  window.localStorage.setItem(VIEWS_KEY, JSON.stringify(cachedViews));
  emitChange();
}
