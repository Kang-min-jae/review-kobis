// 마침표/물음표/느낌표(전각 포함)를 문장 경계로 보는 간단한 휴리스틱.
// 문장 부호 없이 끝나는 마지막 구절도 하나의 문장으로 센다.
export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const chunks = trimmed.match(/[^.!?。？！]+[.!?。？！]*/g) ?? [];
  return chunks.filter((chunk) => chunk.trim().length > 0).length;
}
