// 사이드 메뉴의 "배경 테마" 선택 기능 — 사이트 배경(body의 그라데이션)을 몇 가지
// 프리셋 중에서 고를 수 있게 한다. 브라우저에만 저장되는 개인 취향 설정이라 DB에
// 넣지 않고 localStorage에 저장한다. 이 코드베이스의 다른 클라이언트 스토어
// (reviews-store 등)와 같은 구독/알림 패턴을 그대로 따른다.
//
// 기본값은 "네온 마퀴"다. 이미 선택된 프리셋을 다시 누르면 선택이 풀리고
// (id는 null), 이때는 그라데이션 없이 기본 배경색(검정, --color-bg)만 보인다.

export type BackgroundTheme = {
  id: string;
  label: string;
  gradient: string;
  // 배경이 밝아서(브라이트 프리셋) 스와치 위 라벨을 검정으로 써야 읽히는 경우 true.
  light?: boolean;
};

export const BACKGROUND_THEMES: BackgroundTheme[] = [
  {
    id: "neon-marquee",
    label: "네온 마퀴",
    gradient:
      "linear-gradient(135deg, #150f2b 0%, #2d1732 35%, #3a1a35 55%, #1a2f2c 78%, #0b201d 100%)",
  },
  {
    id: "glass-mesh",
    label: "글래스 메시",
    // 사용자가 devtools로 대각선 각도/색을 직접 맞춘 값 — 그대로 유지.
    gradient: "linear-gradient(to bottom right, #0b0c10, #3a4f68 50%, #0b0c10)",
  },
  {
    // 네온 마퀴와 정확히 같은 굴곡(각 위치)을 색상 없이 명도 차이만으로 표현한 버전.
    id: "grayscale",
    label: "그레이",
    gradient:
      "linear-gradient(135deg, #17171a 0%, #2c2c2f 35%, #38383b 55%, #202023 78%, #0c0c0d 100%)",
  },
  {
    // 네온 마퀴의 색조(보라·마젠타·틸)를 아주 낮은 채도로 남긴, 거의 검정에 가까운 버전.
    id: "true-black",
    label: "블랙",
    gradient:
      "linear-gradient(135deg, #0a0810 0%, #120a14 35%, #150b16 55%, #0a100f 78%, #050a09 100%)",
  },
  {
    // 라이트 모드용 흰 배경 + 옅은 파스텔 메시. 이 사이트의 본문 글자색은 밝은
    // 색(--color-text) 고정이라, 이 배경을 고르면 카드 바깥의 흰 배경에 놓인
    // 글자(섹션 제목 등)는 잘 안 보일 수 있다 — 전체 라이트 테마 적용은 아니다.
    id: "bright-pastel",
    label: "브라이트 1",
    gradient:
      "linear-gradient(135deg, #f3eefc 0%, #fbeef5 35%, #fdf0f2 55%, #eef8f5 78%, #eef6fb 100%)",
    light: true,
  },
  {
    // 같은 흰 배경에 채도를 올린 비비드 버전. 위와 같은 이유로 본문 글자가
    // 안 보일 수 있다.
    id: "bright-vivid",
    label: "브라이트 2",
    gradient:
      "linear-gradient(135deg, #d9c2f7 0%, #f5c6e3 35%, #ffd0d8 55%, #c7f0e0 78%, #c3e4fb 100%)",
    light: true,
  },
];

const DEFAULT_THEME_ID: string = "glass-mesh";
const STORAGE_KEY = "review-site:bg-theme:v1";
// localStorage엔 문자열만 저장할 수 있어서, "선택 안 함(null)" 상태를 나타내는
// 값이 따로 필요하다 — 이 키가 아예 없는 것("한 번도 안 건드림" = 기본값 사용)과
// 구분하기 위해 명시적인 값으로 저장해 둔다.
const NONE_SENTINEL = "__none__";

export function getThemeById(id: string): BackgroundTheme | undefined {
  return BACKGROUND_THEMES.find((t) => t.id === id);
}

function backgroundImageFor(id: string | null): string {
  if (id === null) return "none";
  return getThemeById(id)?.gradient ?? "none";
}

const listeners = new Set<() => void>();

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function readStoredId(): string | null {
  if (typeof window === "undefined") return DEFAULT_THEME_ID;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === NONE_SENTINEL) return null;
    if (raw && BACKGROUND_THEMES.some((t) => t.id === raw)) return raw;
  } catch {
    // 무시하고 기본값
  }
  return DEFAULT_THEME_ID;
}

// useSyncExternalStore가 참조 안정성을 요구하므로 한 번 읽은 값을 캐시해 둔다.
// undefined = 아직 안 읽음, null = 명시적으로 선택 해제됨.
let cachedId: string | null | undefined;

export function getBackgroundThemeIdSnapshot(): string | null {
  if (cachedId === undefined) cachedId = readStoredId();
  return cachedId;
}

export function getServerBackgroundThemeIdSnapshot(): string | null {
  return DEFAULT_THEME_ID;
}

// body에 실제로 그라데이션을 적용한다(null이면 그라데이션 없이 기본 배경색만).
// 마운트 시 한 번(저장된 값 복원)과 사용자가 프리셋을 고를 때 둘 다 이 함수를 쓴다.
// 배경이 밝은 프리셋(브라이트 1/2)이면 <html>에 data-bg-mode="light"를 달아서,
// globals.css가 이때만 본문 글자색(흰색 -> 검정, 회색 -> 진한 회색)을 바꿔치기하게
// 한다 — 나머지 프리셋(검정/어두운 배경)에서는 원래 밝은 글자색 그대로 유지한다.
export function applyBackgroundTheme(id: string | null) {
  if (typeof document !== "undefined") {
    document.body.style.backgroundImage = backgroundImageFor(id);
    const isLight = id !== null && getThemeById(id)?.light === true;
    document.documentElement.setAttribute("data-bg-mode", isLight ? "light" : "dark");
  }
}

export function setBackgroundThemeId(id: string | null) {
  cachedId = id;
  // 프리셋을 실제로 골랐다면 "다크모드" 스위치의 흰 배경 오버라이드는 의미가
  // 없어지므로 같이 풀어 준다 — 안 그러면 프리셋을 고른 뒤에도 흰 배경이 남는다.
  if (id !== null && getWhiteOverrideSnapshot()) {
    cachedWhiteOverride = false;
    if (typeof window !== "undefined") {
      try {
        window.localStorage.removeItem(WHITE_OVERRIDE_KEY);
      } catch {
        // 무시
      }
    }
  }
  applyBackgroundTheme(id);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, id === null ? NONE_SENTINEL : id);
    } catch {
      // 저장 실패해도 이번 방문에서 화면은 이미 바뀌었으니 무시한다.
    }
  }
  listeners.forEach((listener) => listener());
}

// 스와치를 눌렀을 때 쓴다 — 이미 선택된 걸 다시 누르면 해제(검정 배경으로),
// 아니면 그 프리셋을 새로 선택한다.
export function toggleBackgroundThemeId(id: string) {
  setBackgroundThemeId(getBackgroundThemeIdSnapshot() === id ? null : id);
}

// 사이드 메뉴의 "다크모드" 스위치 — 프리셋을 하나도 안 고른(검정 배경) 상태에서만
// 의미가 있어서, 프리셋이 선택돼 있으면(bgThemeId !== null) 스위치를 잠가 둔다.
// 켜져 있으면(기본값) 검정, 끄면 흰 배경으로 바뀐다. 프리셋을 새로 고르면 이
// 오버라이드는 자동으로 풀린다(아래 setBackgroundThemeId 참고).
const WHITE_OVERRIDE_KEY = "review-site:bg-white-override:v1";
let cachedWhiteOverride: boolean | undefined;

function readWhiteOverride(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(WHITE_OVERRIDE_KEY) === "1";
  } catch {
    return false;
  }
}

export function getWhiteOverrideSnapshot(): boolean {
  if (cachedWhiteOverride === undefined) cachedWhiteOverride = readWhiteOverride();
  return cachedWhiteOverride;
}

export function getServerWhiteOverrideSnapshot(): boolean {
  return false;
}

export function applyWhiteOverride(value: boolean) {
  if (typeof document === "undefined") return;
  if (value) {
    document.body.style.backgroundImage = "none";
    document.body.style.backgroundColor = "#ffffff";
    document.documentElement.setAttribute("data-bg-mode", "light");
  } else {
    document.body.style.backgroundColor = "";
    applyBackgroundTheme(getBackgroundThemeIdSnapshot());
  }
}

export function setWhiteOverride(value: boolean) {
  cachedWhiteOverride = value;
  applyWhiteOverride(value);
  if (typeof window !== "undefined") {
    try {
      if (value) window.localStorage.setItem(WHITE_OVERRIDE_KEY, "1");
      else window.localStorage.removeItem(WHITE_OVERRIDE_KEY);
    } catch {
      // 저장 실패해도 이번 방문에서 화면은 이미 바뀌었으니 무시한다.
    }
  }
  listeners.forEach((listener) => listener());
}
