import { safeSetItem } from "./safe-storage";
// 리뷰별 좋아요/싫어요. 계정 시스템이 없으니 my-list의 팔로우/좋아요와 같은 방식으로,
// 기본 수치에 이 브라우저에서의 내 투표(+1/-1)를 얹어 흉내낸다.

const STORAGE_KEY = "review-site:review-votes:v1";

type Vote = "like" | "dislike" | null;

type VoteEntry = {
  likeBase: number;
  dislikeBase: number;
  myVote: Vote;
};

type VotesState = Record<string, VoteEntry>;

const DEFAULT_ENTRY: VoteEntry = { likeBase: 0, dislikeBase: 0, myVote: null };
const EMPTY_STATE: VotesState = {};

const listeners = new Set<() => void>();
export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function emitChange() {
  listeners.forEach((listener) => listener());
}

let cached: VotesState | null = null;

function load(): VotesState {
  if (cached) return cached;
  if (typeof window === "undefined") return EMPTY_STATE;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    cached = raw ? (JSON.parse(raw) as VotesState) : {};
  } catch {
    cached = {};
  }
  return cached;
}

function persist(next: VotesState) {
  cached = next;
  safeSetItem(STORAGE_KEY, JSON.stringify(next));
  emitChange();
}

export function getVotesSnapshot(): VotesState {
  return load();
}

export function getServerVotesSnapshot(): VotesState {
  return EMPTY_STATE;
}

export function getReviewVote(state: VotesState, reviewId: string) {
  const entry = state[reviewId] ?? DEFAULT_ENTRY;
  return {
    likes: entry.likeBase + (entry.myVote === "like" ? 1 : 0),
    dislikes: entry.dislikeBase + (entry.myVote === "dislike" ? 1 : 0),
    myVote: entry.myVote,
  };
}

export function toggleVote(reviewId: string, vote: "like" | "dislike") {
  const state = load();
  const entry = state[reviewId] ?? { ...DEFAULT_ENTRY };
  const nextVote = entry.myVote === vote ? null : vote;
  persist({ ...state, [reviewId]: { ...entry, myVote: nextVote } });
}
