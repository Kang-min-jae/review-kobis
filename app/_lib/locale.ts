import { cookies } from "next/headers";

export type Locale = "ko" | "en";

export function localeToTmdbLang(locale: Locale | string): string {
  return locale === "en" ? "en-US" : "ko-KR";
}

// 서버 컴포넌트·서버 액션에서 현재 언어를 읽는다.
// 쿠키 NEXT_LOCALE="en" | "ko" — 없으면 한국어 기본값.
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const val = store.get("NEXT_LOCALE")?.value;
  return val === "en" ? "en" : "ko";
}
