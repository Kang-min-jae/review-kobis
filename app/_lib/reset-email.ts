// 비밀번호 재설정 코드를 받을 이메일 관련 공용 함수(서버 전용).
import { db } from "./db";

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 재설정 코드를 받을 이메일 → 계정. 소셜 로그인 제공자가 확인한 계정 이메일(User.email)을 먼저 보고,
// 없으면 회원이 등록한 비밀번호 찾기용 이메일(RecoveryEmail)을 본다. 코드 요청과 재설정 때
// 같은 순서로 찾으므로 둘이 다른 계정을 가리키지 않는다.
export async function findUserIdByResetEmail(email: string): Promise<string | null> {
  const byAccountEmail = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (byAccountEmail) return byAccountEmail.id;
  const byRecovery = await db.recoveryEmail
    .findUnique({ where: { email }, select: { userId: true } })
    .catch(() => null); // 표가 아직 없을 때(마이그레이션 전)
  return byRecovery?.userId ?? null;
}
