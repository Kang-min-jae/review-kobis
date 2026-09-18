"use server";

import { randomBytes } from "node:crypto";
import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { Prisma } from "../generated/prisma/client";
import { signIn } from "../../auth";
import { db } from "./db";
import { sendPasswordResetEmail } from "./mailer";

const MIN_PASSWORD_LENGTH = 8;
const RESET_TOKEN_TTL_MS = 1000 * 60 * 60; // 1시간

// 비밀번호 재설정 요청 레이트 리미터 — 이메일당 1분에 최대 3회.
// 단일 인스턴스 배포에서 완전 동작한다. 멀티 인스턴스라면 DB/Redis 기반으로 교체해야 한다.
const RESET_RATE_WINDOW_MS = 60 * 1000;
const RESET_RATE_MAX = 3;
const resetRateMap = new Map<string, number[]>();

function checkResetRateLimit(email: string): boolean {
  const now = Date.now();
  const prev = (resetRateMap.get(email) ?? []).filter((t) => now - t < RESET_RATE_WINDOW_MS);
  if (prev.length >= RESET_RATE_MAX) return false;
  resetRateMap.set(email, [...prev, now]);
  return true;
}

export type ActionResult = { error: string } | { ok: true };

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// 회원가입 후 곧바로 로그인시킨다(가입만 하고 다시 로그인 화면으로 보내는 건
// 불필요한 한 단계다).
export async function signUpAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const emailRaw = String(formData.get("email") ?? "").trim().toLowerCase();
  const email = emailRaw || null; // 이메일은 선택 — 미입력 시 null
  const password = String(formData.get("password") ?? "");
  const nicknameInput = String(formData.get("nickname") ?? "").trim();
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");

  if (email && !isValidEmail(email)) return { error: "올바른 이메일 형식이 아니에요." };
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.` };
  }

  if (email) {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return {
        error: existing.password
          ? "이미 가입된 이메일이에요. 로그인해 주세요."
          : "이미 소셜 로그인으로 가입된 이메일이에요. Google/Kakao/Naver로 로그인해 주세요.",
      };
    }
  }

  // 닉네임 필수 — 이메일 없이 가입할 때는 닉네임이 유일한 식별자가 된다.
  if (!nicknameInput) return { error: "닉네임을 입력해 주세요." };
  if (nicknameInput.length < 2) return { error: "닉네임은 2자 이상이어야 해요." };

  const nicknameTaken = await db.user.findUnique({ where: { nickname: nicknameInput } });
  if (nicknameTaken) return { error: "이미 사용 중인 닉네임이에요." };

  const passwordHash = await hash(password, 10);
  try {
    await db.user.create({ data: { email, password: passwordHash, nickname: nicknameInput } });
  } catch (error) {
    // 위에서 확인한 뒤 실제로 만들기 전 사이에 다른 요청이 같은 닉네임/이메일을 먼저
    // 가져갔을 수 있다(동시 가입) — DB의 유니크 제약이 최종 방어선이다.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "이미 사용 중인 닉네임 또는 이메일이에요. 다시 시도해 주세요." };
    }
    throw error;
  }

  // 자동 로그인: 이메일 있으면 이메일로, 없으면 닉네임으로 로그인
  const loginIdentifier = email ?? nicknameInput;
  try {
    await signIn("credentials", { email: loginIdentifier, password, redirectTo: callbackUrl });
  } catch (error) {
    if (error instanceof AuthError) return { error: "가입은 됐지만 자동 로그인에 실패했어요. 다시 로그인해 주세요." };
    throw error; // NEXT_REDIRECT는 그대로 다시 던져야 실제 리다이렉트가 된다.
  }
  return { ok: true };
}

export async function signInWithCredentialsAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const rawIdentifier = String(formData.get("email") ?? "").trim();
  // 이메일이면 소문자로, 닉네임이면 그대로
  const identifier = rawIdentifier.includes("@") ? rawIdentifier.toLowerCase() : rawIdentifier;
  const password = String(formData.get("password") ?? "");
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");

  if (!identifier || !password) return { error: "아이디(또는 이메일)와 비밀번호를 입력해 주세요." };

  try {
    await signIn("credentials", { email: identifier, password, redirectTo: callbackUrl });
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "아이디(이메일) 또는 비밀번호가 올바르지 않아요." };
    }
    throw error;
  }
  return { ok: true };
}

// 이메일이 실제로 가입돼 있는지 여부와 무관하게 항상 같은 메시지를 보여준다
// (가입 여부를 외부에 노출하지 않기 위한 흔한 관례) — 그래서 error/ok 두 갈래인
// ActionResult 대신, "보여줄 메시지 하나"만 있는 전용 타입을 쓴다.
const GENERIC_RESET_MESSAGE = "해당 이메일로 가입된 계정이 있다면, 비밀번호 재설정 링크를 보냈어요.";

export type ResetRequestResult = { message: string; isError?: boolean };

export async function requestPasswordResetAction(
  _prevState: ResetRequestResult | null,
  formData: FormData
): Promise<ResetRequestResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!isValidEmail(email)) return { message: "올바른 이메일 형식이 아니에요.", isError: true };

  if (!checkResetRateLimit(email)) {
    return { message: "잠시 후 다시 시도해 주세요. (1분에 최대 3회)", isError: true };
  }

  const user = await db.user.findUnique({ where: { email } });
  if (user) {
    const token = randomBytes(32).toString("hex");
    await db.passwordResetToken.create({
      data: { userId: user.id, token, expires: new Date(Date.now() + RESET_TOKEN_TTL_MS) },
    });
    const baseUrl = process.env.NEXTAUTH_URL || process.env.AUTH_URL || "http://localhost:3000";
    const resetUrl = `${baseUrl}/reset-password/${token}`;
    await sendPasswordResetEmail(email, resetUrl);
  }

  return { message: GENERIC_RESET_MESSAGE };
}

export async function resetPasswordAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const token = String(formData.get("token") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.` };
  }

  const resetToken = await db.passwordResetToken.findUnique({ where: { token } });
  if (!resetToken || resetToken.expires < new Date()) {
    return { error: "링크가 만료됐거나 유효하지 않아요. 다시 요청해 주세요." };
  }

  const passwordHash = await hash(password, 10);
  await db.$transaction([
    db.user.update({ where: { id: resetToken.userId }, data: { password: passwordHash } }),
    db.passwordResetToken.deleteMany({ where: { userId: resetToken.userId } }),
  ]);

  return { ok: true };
}
