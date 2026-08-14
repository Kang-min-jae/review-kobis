// 로그인 시스템이 아직 없어서, 이 브라우저를 위한 익명 게스트 정체성을 하나 만들어
// 로컬에 고정해 둔다. 실제 계정 시스템이 생기면 이 자리를 로그인 사용자 정보로
// 바꾸면 되고, "작성자 프로필 보기" 같은 UI는 그대로 재사용할 수 있다.

const STORAGE_KEY = "review-site:guest-identity:v1";

export type GuestIdentity = {
  id: string;
  name: string;
};

const SERVER_DEFAULT: GuestIdentity = { id: "guest", name: "게스트" };

function generateGuestIdentity(): GuestIdentity {
  const id = `guest-${Math.random().toString(36).slice(2, 10)}`;
  const name = `게스트${Math.floor(1000 + Math.random() * 9000)}`;
  return { id, name };
}

let cached: GuestIdentity | null = null;

export function getGuestIdentity(): GuestIdentity {
  if (cached) return cached;
  if (typeof window === "undefined") return SERVER_DEFAULT;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      cached = JSON.parse(raw) as GuestIdentity;
      return cached;
    }
  } catch {
    // fall through to generate a fresh identity
  }

  const fresh = generateGuestIdentity();
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
  cached = fresh;
  return fresh;
}
