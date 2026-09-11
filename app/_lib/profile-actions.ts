"use server";

import { hash, compare } from "bcryptjs";
import { Prisma } from "../generated/prisma/client";
import { auth, signOut } from "../../auth";
import { db } from "./db";

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

export async function deleteAccountAction(): Promise<ActionResult> {
  const session = await auth();
  if (!session?.user?.id) return { error: "로그인이 필요해요." };

  await db.user.delete({ where: { id: session.user.id } });
  await signOut({ redirectTo: "/" });
  return { ok: true };
}
