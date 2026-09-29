import { timingSafeEqual } from "node:crypto";

// 관리자 API의 x-admin-secret 헤더 확인. 문자열 !== 비교는 일치하는 앞부분 길이에 따라 걸리는
// 시간이 달라져(타이밍 공격) 비밀값을 한 글자씩 추측할 여지가 있어 고정 시간 비교를 쓴다.
export function isValidAdminSecret(provided: string | null, secret: string): boolean {
  if (!provided) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
