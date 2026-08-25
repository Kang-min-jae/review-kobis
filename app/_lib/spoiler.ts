// 리뷰에 스포일러가 있는지 판단하는 기준 — "결말" 관련 표현과 생사 관련 표현을
// 키워드로 잡는다. 완벽한 판별은 아니지만, 이런 단어가 있으면 결말/사건의 핵심을
// 언급했을 가능성이 높아서 보수적으로 블러 처리한다.
const SPOILER_KEYWORDS = [
  "결말",
  "엔딩",
  "반전",
  "스포",
  "죽는다",
  "죽어요",
  "죽음",
  "죽었다",
  "죽인다",
  "사망",
  "살해",
  "살해당한다",
  "생존",
  "살아남",
  "부활",
  "범인은",
];

export function containsSpoilerKeyword(text: string): boolean {
  return SPOILER_KEYWORDS.some((keyword) => text.includes(keyword));
}
