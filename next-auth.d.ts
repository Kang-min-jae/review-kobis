import type { DefaultSession } from "next-auth";

// 세션에서 session.user.id를 쓰려면(예: 리뷰 작성자 식별) 기본 타입에 없는
// id 필드를 타입 선언에 추가해줘야 한다.
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}
