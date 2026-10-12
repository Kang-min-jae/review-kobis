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

// ── 스포일러 표시(is_spoiler) ──────────────────────────────────────────────
// 한줄평 작성 때 "스포일러가 있어요"를 안 켰는데 본문에 아래 단어가 있으면, 등록 전에
// "스포일러로 표시할까요?" 확인 창을 띄운다(자동으로 켜지는 않는다 — 작성자가 고른다).
// 띄어쓰기 차이("쿠키 영상"/"쿠키영상")는 무시하고 비교한다.
export const SPOILER_WARNING_KEYWORDS = [
  "결말",
  "엔딩",
  "범인",
  "반전",
  "죽는다",
  "죽음",
  "정체",
  "쿠키영상",
  "마지막 장면",
] as const;

const NORMALIZED_WARNING_KEYWORDS = SPOILER_WARNING_KEYWORDS.map((k) => k.replace(/\s+/g, ""));

export function suggestsSpoiler(text: string): boolean {
  const normalized = text.replace(/\s+/g, "");
  return NORMALIZED_WARNING_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

// 서로 다른 회원 이만큼이 "스포일러 신고"를 하면 자동으로 스포일러로 표시한다.
export const SPOILER_REPORT_THRESHOLD = 3;

// 스포일러 본문 대신 미리보기·메타·알림 등에 쓰는 문구.
export const SPOILER_PLACEHOLDER = "스포일러가 포함된 한줄평";
