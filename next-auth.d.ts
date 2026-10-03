import type { DefaultSession } from "next-auth";

// 세션에서 session.user.id를 쓰려면(예: 리뷰 작성자 식별) 기본 타입에 없는
// id 필드를 타입 선언에 추가해줘야 한다.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: string;
    // 현재 버전 약관에 동의한 기록이 없는 계정 — proxy.ts가 동의 화면으로 보낸다.
    needsConsent?: boolean;
  }
}
