// 한글 초성 검색 지원 — "브래드 피트"를 "ㅂㄹㄷㅍㅌ"처럼 초성만으로도 찾을 수 있게 한다.
const CHOSUNG_LIST = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
];

const HANGUL_BASE = 0xac00; // '가'
const HANGUL_LAST = 0xd7a3; // '힣'
const JUNGSUNG_COUNT = 21;
const JONGSUNG_COUNT = 28;

function toChosungChar(char: string): string {
  const code = char.charCodeAt(0);
  if (code < HANGUL_BASE || code > HANGUL_LAST) return char;
  const offset = code - HANGUL_BASE;
  const chosungIndex = Math.floor(offset / (JUNGSUNG_COUNT * JONGSUNG_COUNT));
  return CHOSUNG_LIST[chosungIndex];
}

// 완성형 한글 문자열을 초성 문자열로 바꾼다. 한글이 아닌 문자(영문/숫자/공백 등)는 그대로 둔다.
export function toChosung(text: string): string {
  return Array.from(text).map(toChosungChar).join("");
}

const CHOSUNG_SET = new Set(CHOSUNG_LIST);

// 검색어가 (공백 제외하고) 초성으로만 이뤄져 있는지 — "ㅂㄹㄷ ㅍㅌ" 같은 입력을 가려낸다.
export function isChosungOnly(text: string): boolean {
  const stripped = text.replace(/\s+/g, "");
  if (!stripped) return false;
  return Array.from(stripped).every((ch) => CHOSUNG_SET.has(ch));
}
