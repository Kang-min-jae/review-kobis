import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import Naver from "next-auth/providers/naver";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./app/_lib/db";

// Google/Kakao/Naver 클라이언트 ID·시크릿은 .env의 AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET,
// AUTH_KAKAO_ID/AUTH_KAKAO_SECRET, AUTH_NAVER_ID/AUTH_NAVER_SECRET에서 Auth.js가
// 자동으로 읽어온다(관례 이름이라 여기서 따로 안 넘겨줘도 됨).
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [Google, Kakao, Naver],
  session: { strategy: "database" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
});
