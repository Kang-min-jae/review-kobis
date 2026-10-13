import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Kakao from "next-auth/providers/kakao";
import Naver from "next-auth/providers/naver";
import Credentials from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { cookies } from "next/headers";
import { db } from "./app/_lib/db";
import { hasCurrentConsent, recordConsent, PENDING_CONSENT_COOKIE } from "./app/_lib/terms-consent";

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
// 비밀번호 무차별 대입 방지 — 같은 아이디로 15분에 10번 틀리면 잠시 막는다.
// 서버리스 인스턴스별 메모리라 완벽하진 않지만, bcrypt 비용과 합쳐 대량 시도를 크게 늦춘다.
const LOGIN_FAIL_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_FAIL_MAX = 10;
const loginFailures = new Map<string, number[]>();

function recentFailures(key: string): number[] {
  const now = Date.now();
  return (loginFailures.get(key) ?? []).filter((t) => now - t < LOGIN_FAIL_WINDOW_MS);
}

function recordFailure(key: string) {
  if (loginFailures.size > 10_000) loginFailures.clear();
  loginFailures.set(key, [...recentFailures(key), Date.now()]);
}

// 소셜 가입 화면에서 약관에 동의하고 버튼을 눌렀으면(auth-actions.ts가 쿠키에 담아 둠) 새로 만들어진
// 계정에 그 동의를 기록한다. 쿠키가 없으면(로그인 화면에서 바로 소셜 가입) 기록하지 않고, 그 계정은
// 동의 화면(/consent)을 거치게 된다.
async function recordPendingConsent(userId: string) {
  try {
    const store = await cookies();
    const raw = store.get(PENDING_CONSENT_COOKIE)?.value;
    if (!raw) return;
    store.delete(PENDING_CONSENT_COOKIE);
    await recordConsent(userId);
  } catch (error) {
    console.warn("[auth] 소셜 가입 약관 동의 기록 실패:", error);
  }
}

export const { handlers, signIn, signOut, auth, unstable_update } = NextAuth({
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

        const rateKey = identifier.trim().toLowerCase();
        if (recentFailures(rateKey).length >= LOGIN_FAIL_MAX) return null;

        // @ 포함이면 이메일, 아니면 username을 먼저, 없을 때만 nickname으로 조회한다.
        // (OR 한 번으로 찾으면 다른 사람이 내 아이디와 같은 닉네임을 쓸 때 그 계정이
        // 먼저 잡혀 내 로그인이 막힐 수 있다.)
        const isEmail = identifier.includes("@");
        const user = isEmail
          ? await db.user.findUnique({ where: { email: identifier.toLowerCase() } })
          : (await db.user.findUnique({ where: { username: identifier } })) ??
            (await db.user.findUnique({ where: { nickname: identifier } }));

        // OAuth로만 가입한 계정은 password가 없다 — 이메일/비밀번호로는 로그인 불가.
        const valid = user?.password ? await compare(password, user.password) : false;
        if (!user || !valid) {
          recordFailure(rateKey);
          return null;
        }
        loginFailures.delete(rateKey);

        // 비밀번호 해시가 세션 계층으로 넘어가지 않도록 필요한 필드만 돌려준다.
        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  session: { strategy: "jwt" },
  // 기본 로그는 OAuth 제공자가 거절한 이유(예: 구글의 invalid_client)를 남기지 않아 원인을 알 수 없다.
  // 기본과 같은 줄에 더해, 제공자가 돌려준 오류 코드·설명·HTTP 상태만 함께 남긴다(비밀값은 들어 있지 않다).
  logger: {
    error(error) {
      const name = (error as { type?: string }).type ?? error.name;
      console.error(`[auth][error] ${name}: ${error.message}`);
      const cause = (error as { cause?: unknown }).cause;
      const err = cause && typeof cause === "object" && "err" in cause ? (cause as { err: unknown }).err : cause;
      if (err instanceof Error) {
        console.error("[auth][cause]", err.stack);
        const detail = err as Error & { error?: unknown; error_description?: unknown; status?: unknown };
        if (detail.error !== undefined || detail.status !== undefined) {
          console.error(
            "[auth][provider-response]",
            JSON.stringify({ error: detail.error, error_description: detail.error_description, status: detail.status }),
          );
        }
      }
      if (cause && typeof cause === "object" && "provider" in cause) {
        console.error("[auth][details]", JSON.stringify({ provider: (cause as { provider: unknown }).provider }));
      }
    },
  },
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        token.id = user.id;
        // role은 DB에서 읽어야 하므로 로그인 시점에 한 번 조회한다
        const dbUser = await db.user.findUnique({ where: { id: user.id as string }, select: { role: true } });
        token.role = dbUser?.role ?? "USER";
        if (trigger === "signUp" && user.id) await recordPendingConsent(user.id);
        // 현재 약관에 동의한 기록이 없으면 proxy.ts가 동의 화면으로 보낸다.
        token.needsConsent = user.id ? !(await hasCurrentConsent(user.id)) : false;
      } else if (token.needsConsent && typeof token.id === "string") {
        // 동의 화면에서 동의를 마치면(unstable_update로 이 콜백이 다시 불려 쿠키가 갱신됨) 표시를 지운다.
        token.needsConsent = !(await hasCurrentConsent(token.id));
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
