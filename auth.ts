import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import Naver from "next-auth/providers/naver";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { db } from "./app/_lib/db";

// Google/Kakao/Naver 클라이언트 ID·시크릿은 .env의 AUTH_GOOGLE_ID/AUTH_GOOGLE_SECRET,
// AUTH_KAKAO_ID/AUTH_KAKAO_SECRET, AUTH_NAVER_ID/AUTH_NAVER_SECRET에서 Auth.js가
// 자동으로 읽어온다(관례 이름이라 여기서 따로 안 넘겨줘도 됨).
//
// Credentials(이메일/비밀번호) 로그인을 추가하면서 세션 전략을 database에서 jwt로
// 바꿨다 — Auth.js는 Credentials 로그인 시 어댑터가 자동으로 DB 세션을 만들어주지
// 않아서(OAuth 계정과 달리 "이 사람이 맞다"를 우리가 authorize()에서 직접 확인하고
// 끝나는 구조라), Credentials를 쓰려면 jwt 세션이 사실상 필수다. PrismaAdapter는
// User/Account 저장(OAuth 계정 연결)에 계속 쓰이고, Session 테이블만 더 이상 쓰지
// 않게 된다.
export const { handlers, signIn, signOut, auth } = NextAuth({
  adapter: PrismaAdapter(db),
  providers: [
    Google,
    Kakao,
    Naver,
    Credentials({
      credentials: {
        // 이메일 또는 닉네임 둘 다 받는다 — 필드명은 하위호환을 위해 email 유지
        email: { label: "아이디 또는 이메일", type: "text" },
        password: { label: "비밀번호", type: "password" },
      },
      async authorize(credentials) {
        const identifier = credentials?.email;
        const password = credentials?.password;
        if (typeof identifier !== "string" || typeof password !== "string") return null;

        // @ 포함이면 이메일, 아니면 username → nickname 순으로 조회
        const isEmail = identifier.includes("@");
        const user = isEmail
          ? await db.user.findUnique({ where: { email: identifier.toLowerCase() } })
          : await db.user.findFirst({
              where: { OR: [{ username: identifier }, { nickname: identifier }] },
            });

        // OAuth로만 가입한 계정은 password가 없다 — 이메일/비밀번호로는 로그인 불가.
        if (!user?.password) return null;

        const valid = await compare(password, user.password);
        if (!valid) return null;

        return user;
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // role은 DB에서 읽어야 하므로 로그인 시점에 한 번 조회한다
        const dbUser = await db.user.findUnique({ where: { id: user.id as string }, select: { role: true } });
        token.role = dbUser?.role ?? "USER";
      }
      return token;
    },
    session({ session, token }) {
      if (typeof token.id === "string") session.user.id = token.id;
      if (typeof token.role === "string") session.user.role = token.role;
      return session;
    },
  },
});
