"use server";

import { randomInt } from "node:crypto";
import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { Prisma } from "../generated/prisma/client";
import { signIn } from "../../auth";
import { db } from "./db";
import { sendPasswordResetCodeEmail } from "./mailer";

const MIN_PASSWORD_LENGTH = 8;
const OTP_TTL_MS = 10 * 60 * 1000; // 10분

// 레이트 리미터 — 이메일당 1분에 최대 3회 (단일 인스턴스).
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
const USERNAME_RE = /^[a-zA-Z0-9_]{4,20}$/;

export async function signUpAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const usernameInput = String(formData.get("username") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const nicknameInput = String(formData.get("nickname") ?? "").trim();
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");

  if (!usernameInput) return { error: "아이디를 입력해 주세요." };
  if (usernameInput.length < 4) return { error: "아이디는 4자 이상이어야 해요." };
  if (usernameInput.length > 20) return { error: "아이디는 20자 이하여야 해요." };
  if (!USERNAME_RE.test(usernameInput)) return { error: "아이디는 영문, 숫자, 밑줄(_)만 사용 가능해요." };

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.` };
  }

  const usernameTaken = await db.user.findUnique({ where: { username: usernameInput } });
  if (usernameTaken) return { error: "이미 사용 중인 아이디예요." };

  if (!nicknameInput) return { error: "닉네임을 입력해 주세요." };
  if (nicknameInput.length < 2) return { error: "닉네임은 2자 이상이어야 해요." };

  const nicknameTaken = await db.user.findUnique({ where: { nickname: nicknameInput } });
  if (nicknameTaken) return { error: "이미 사용 중인 닉네임이에요." };

  const passwordHash = await hash(password, 10);
  try {
    await db.user.create({ data: { username: usernameInput, password: passwordHash, nickname: nicknameInput } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "이미 사용 중인 아이디 또는 닉네임이에요. 다시 시도해 주세요." };
    }
    throw error;
  }

  try {
    await signIn("credentials", { email: usernameInput, password, redirectTo: callbackUrl });
  } catch (error) {
    if (error instanceof AuthError) return { error: "가입은 됐지만 자동 로그인에 실패했어요. 다시 로그인해 주세요." };
    throw error;
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
// (가입 여부를 외부에 노출하지 않기 위한 흔한 관례).
const GENERIC_CODE_MESSAGE = "해당 이메일로 가입된 계정이 있다면, 6자리 인증 코드를 보냈어요.";

export type ResetRequestResult = { message: string; isError?: boolean; codeSent?: boolean };

export async function requestPasswordResetCodeAction(
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
    const code = randomInt(100000, 1000000).toString(); // 100000~999999
    const expiresAt = new Date(Date.now() + OTP_TTL_MS);
    await db.$transaction([
      db.passwordResetCode.deleteMany({ where: { email } }),
      db.passwordResetCode.create({ data: { email, code, expiresAt } }),
    ]);
    try {
      await sendPasswordResetCodeEmail(email, code);
    } catch (err) {
      console.error("[requestPasswordResetCodeAction] 이메일 발송 실패:", err);
      return { message: "이메일 발송에 실패했어요. 잠시 후 다시 시도해 주세요.", isError: true };
    }
  }

  return { message: GENERIC_CODE_MESSAGE, codeSent: true };
}

export async function resetPasswordWithCodeAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (password.length < MIN_PASSWORD_LENGTH) {
    return { error: `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.` };
  }

  const record = await db.passwordResetCode.findFirst({ where: { email, code } });
  if (!record) return { error: "인증 코드가 올바르지 않아요." };

  if (new Date() > record.expiresAt) {
    await db.passwordResetCode.delete({ where: { id: record.id } });
    return { error: "인증 코드가 만료됐어요. 다시 요청해 주세요." };
  }

  const passwordHash = await hash(password, 10);
  await db.$transaction([
    db.user.update({ where: { email }, data: { password: passwordHash } }),
    db.passwordResetCode.deleteMany({ where: { email } }),
  ]);

  return { ok: true };
}
