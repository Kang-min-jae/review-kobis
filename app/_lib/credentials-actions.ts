"use server";

import { randomInt, timingSafeEqual } from "node:crypto";
import { hash } from "bcryptjs";
import { AuthError } from "next-auth";
import { Prisma } from "../generated/prisma/client";
import { signIn } from "../../auth";
import { db } from "./db";
import { sendPasswordResetCodeEmail } from "./mailer";
import { hasRequiredConsent, recordConsent } from "./terms-consent";

const MIN_PASSWORD_LENGTH = 8;
const OTP_TTL_MS = 10 * 60 * 1000; // 10분
// 6자리 코드(90만 가지)는 시도 제한이 없으면 10분 안에 자동화로 맞출 수 있다. 틀릴 때마다
// 만료 시각을 이만큼 당겨서, 코드 하나당 최대 5번까지만 시도할 수 있게 한다.
const RESET_MAX_ATTEMPTS = 5;
const ATTEMPT_PENALTY_MS = OTP_TTL_MS / RESET_MAX_ATTEMPTS;

function codesMatch(expected: string, actual: string): boolean {
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && timingSafeEqual(a, b);
}

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
  // 비밀번호 찾기용 이메일(선택) — 비밀번호를 잊었을 때 재설정 코드를 받는 데만 쓴다.
  const recoveryEmail = String(formData.get("recoveryEmail") ?? "").trim().toLowerCase();
  const callbackUrl = String(formData.get("callbackUrl") ?? "/");

  // 필수 약관 동의는 화면의 버튼 비활성화만으로는 강제되지 않는다(직접 요청하면 우회됨) — 서버에서 확인한다.
  if (!hasRequiredConsent(formData)) return { error: "필수 약관(이용약관·개인정보 수집·이용·만 14세 이상)에 동의해 주세요." };

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
  if (nicknameInput.length > 20) return { error: "닉네임은 20자 이하여야 해요." };

  const nicknameTaken = await db.user.findUnique({ where: { nickname: nicknameInput } });
  if (nicknameTaken) return { error: "이미 사용 중인 닉네임이에요." };

  if (recoveryEmail) {
    if (recoveryEmail.length > 254 || !isValidEmail(recoveryEmail)) return { error: "이메일 형식이 올바르지 않아요." };
    // 한 이메일로 재설정할 계정이 하나로 정해지도록, 다른 계정이 이미 쓰는 이메일은 받지 않는다.
    if (await findUserIdByResetEmail(recoveryEmail)) {
      return { error: "이미 다른 계정에서 쓰고 있는 이메일이에요. 다른 이메일을 입력하거나 비워 두세요." };
    }
  }

  const passwordHash = await hash(password, 10);
  try {
    const created = await db.user.create({ data: { username: usernameInput, password: passwordHash, nickname: nicknameInput } });
    // 동의 기록 저장에 실패해도(동의 표 마이그레이션 전 등) 가입은 막지 않는다 — 기록이 없으면 다음
    // 로그인 때 동의 화면에서 다시 동의를 받는다.
    await recordConsent(created.id).catch((error) => console.warn("[signup] 약관 동의 기록 실패:", error));
    if (recoveryEmail) {
      // 저장에 실패해도(동시에 같은 이메일로 가입 등) 가입은 막지 않는다 — 나중에 다시 등록하면 된다.
      await db.recoveryEmail
        .create({ data: { userId: created.id, email: recoveryEmail } })
        .catch((error) => console.warn("[signup] 비밀번호 찾기용 이메일 저장 실패:", error));
    }
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

// 재설정 코드를 받을 이메일 → 계정. 소셜 로그인 제공자가 확인한 계정 이메일(User.email)을 먼저 보고,
// 없으면 아이디 가입 때 적은 비밀번호 찾기용 이메일(RecoveryEmail)을 본다. 코드 요청과 재설정 때
// 같은 순서로 찾으므로 둘이 다른 계정을 가리키지 않는다.
async function findUserIdByResetEmail(email: string): Promise<string | null> {
  const byAccountEmail = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (byAccountEmail) return byAccountEmail.id;
  const byRecovery = await db.recoveryEmail
    .findUnique({ where: { email }, select: { userId: true } })
    .catch(() => null); // 표가 아직 없을 때(마이그레이션 전)
  return byRecovery?.userId ?? null;
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

  const userId = await findUserIdByResetEmail(email);
  if (userId) {
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

  const record = await db.passwordResetCode.findFirst({ where: { email }, orderBy: { createdAt: "desc" } });
  if (!record || new Date() >= record.expiresAt) {
    if (record) await db.passwordResetCode.deleteMany({ where: { id: record.id } });
    return { error: "인증 코드가 만료됐거나 올바르지 않아요. 다시 요청해 주세요." };
  }

  // 비교 전에 시도 1회를 원자적으로 차감한다(만료 시각 당기기). 같은 만료 시각을 본
  // 동시 요청 중 하나만 성공하므로, 요청을 병렬로 쏟아부어 여러 번 맞춰보는 것도 막힌다.
  const claimed = await db.passwordResetCode.updateMany({
    where: { id: record.id, expiresAt: record.expiresAt },
    data: { expiresAt: new Date(record.expiresAt.getTime() - ATTEMPT_PENALTY_MS) },
  });
  if (claimed.count === 0) return { error: "잠시 후 다시 시도해 주세요." };
  if (!codesMatch(record.code, code)) return { error: "인증 코드가 올바르지 않아요." };

  const userId = await findUserIdByResetEmail(email);
  if (!userId) {
    await db.passwordResetCode.deleteMany({ where: { email } });
    return { error: "인증 코드가 만료됐거나 올바르지 않아요. 다시 요청해 주세요." };
  }

  const passwordHash = await hash(password, 10);
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { password: passwordHash } }),
    db.passwordResetCode.deleteMany({ where: { email } }),
  ]);

  return { ok: true };
}
