// 한글 자모 분리 + 레벤슈타인 거리 기반 유사도 계산
// 한글 음절을 초성·중성·종성 자모로 분리해 "젠데이이야" vs "젠데이아" 같은
// 철자 오류도 잡아낸다. 라이브러리 없이 자체 구현.

const JAMO_ONSET = [
  "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ",
  "ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ",
];
const JAMO_VOWEL = [
  "ㅏ","ㅐ","ㅑ","ㅒ","ㅓ","ㅔ","ㅕ","ㅖ","ㅗ","ㅘ","ㅙ","ㅚ",
  "ㅛ","ㅜ","ㅝ","ㅞ","ㅟ","ㅠ","ㅡ","ㅢ","ㅣ",
];
const JAMO_CODA = [
  "","ㄱ","ㄲ","ㄳ","ㄴ","ㄵ","ㄶ","ㄷ","ㄹ","ㄺ","ㄻ","ㄼ",
  "ㄽ","ㄾ","ㄿ","ㅀ","ㅁ","ㅂ","ㅄ","ㅅ","ㅆ","ㅇ","ㅈ","ㅊ",
  "ㅋ","ㅌ","ㅍ","ㅎ",
];

export function decomposeToJamo(str: string): string {
  return str
    .split("")
    .map((ch) => {
      const code = ch.charCodeAt(0);
      if (code >= 0xac00 && code <= 0xd7a3) {
        const offset = code - 0xac00;
        const onset = JAMO_ONSET[Math.floor(offset / 588)];
        const vowel = JAMO_VOWEL[Math.floor((offset % 588) / 28)];
        const coda = JAMO_CODA[offset % 28];
        return onset + vowel + coda;
      }
      return ch;
    })
    .join("");
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  // 메모리 최적화: 두 행만 유지
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      curr[j] =
        a[i - 1] === b[j - 1]
          ? prev[j - 1]
          : 1 + Math.min(prev[j], curr[j - 1], prev[j - 1]);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

// 자모 분리 후 정규화 레벤슈타인 유사도 (0~1, 1이 완전 일치)
export function koreanSimilarity(query: string, target: string): number {
  const q = decomposeToJamo(query.toLowerCase().replace(/\s+/g, ""));
  const t = decomposeToJamo(target.toLowerCase().replace(/\s+/g, ""));
  if (q.length === 0 && t.length === 0) return 1;
  const maxLen = Math.max(q.length, t.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(q, t) / maxLen;
}

export const FUZZY_THRESHOLD = 0.6;
