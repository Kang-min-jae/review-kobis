"use server";

import { hash, compare } from "bcryptjs";
import { Prisma } from "../generated/prisma/client";
import { auth, signOut } from "../../auth";
import { db } from "./db";
import { findUserIdByResetEmail, isValidEmail } from "./reset-email";

const MIN_PASSWORD_LENGTH = 8;
export type ActionResult = { error: string } | { ok: true };

export async function updateNicknameAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인이 필요해요." };

  const nickname = String(formData.get("nickname") ?? "").trim();
  if (!nickname) return { error: "닉네임을 입력해 주세요." };
  if (nickname.length > 20) return { error: "닉네임은 20자 이내로 입력해 주세요." };

  try {
    await db.user.update({ where: { id: session.user.id }, data: { nickname } });
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "이미 사용 중인 닉네임이에요." };
    }
    throw error;
  }
}

export async function updatePasswordAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인이 필요해요." };

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");

  if (!currentPassword) return { error: "현재 비밀번호를 입력해 주세요." };
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { error: `새 비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 해요.` };
  }

  const user = await db.user.findUnique({ where: { id: session.user.id } });
  if (!user?.password) return { error: "소셜 로그인 계정은 비밀번호를 변경할 수 없어요." };

  const valid = await compare(currentPassword, user.password);
  if (!valid) return { error: "현재 비밀번호가 올바르지 않아요." };

  const passwordHash = await hash(newPassword, 10);
  await db.user.update({ where: { id: session.user.id }, data: { password: passwordHash } });
  return { ok: true };
}

// 비밀번호 찾기용 이메일 등록·변경·삭제(빈 값). 아이디·비밀번호 계정만 쓴다. 로그인 상태를 누가 잠깐
// 빌려 쓰더라도 자기 이메일로 바꿔 계정을 가져가지 못하게 현재 비밀번호를 확인한다.
export async function updateRecoveryEmailAction(
  _prevState: ActionResult | null,
  formData: FormData
): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인이 필요해요." };
  const userId = session.user.id;

  const email = String(formData.get("recoveryEmail") ?? "").trim().toLowerCase();
  const currentPassword = String(formData.get("currentPassword") ?? "");
  if (!currentPassword) return { error: "현재 비밀번호를 입력해 주세요." };

  const user = await db.user.findUnique({ where: { id: userId }, select: { password: true } });
  if (!user?.password) return { error: "소셜 로그인 계정은 그 계정으로 로그인하면 돼요." };
  if (!(await compare(currentPassword, user.password))) return { error: "현재 비밀번호가 올바르지 않아요." };

  try {
    if (!email) {
      await db.recoveryEmail.deleteMany({ where: { userId } });
      return { ok: true };
    }
    if (email.length > 254 || !isValidEmail(email)) return { error: "이메일 형식이 올바르지 않아요." };
    // 한 이메일로 재설정할 계정이 하나로 정해지도록, 다른 계정이 이미 쓰는 이메일은 받지 않는다.
    const owner = await findUserIdByResetEmail(email);
    if (owner && owner !== userId) return { error: "이미 다른 계정에서 쓰고 있는 이메일이에요." };
    await db.recoveryEmail.upsert({
      where: { userId },
      update: { email },
      create: { userId, email },
    });
    return { ok: true };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "이미 다른 계정에서 쓰고 있는 이메일이에요." };
    }
    console.error("[recovery-email] 저장 실패:", error);
    return { error: "저장하지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}

export async function deleteAccountAction(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인이 필요해요." };

  await db.user.delete({ where: { id: session.user.id } });
  await signOut({ redirectTo: "/" });
  return { ok: true };
}
