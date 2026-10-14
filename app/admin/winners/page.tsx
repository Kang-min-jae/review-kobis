import { auth } from "../../../auth";
import { redirect } from "next/navigation";
import WinnersManager from "./WinnersManager";
import Link from "next/link";

export default async function WinnersPage() {
  const session = await auth();
  if (session?.user?.role !== "ADMIN") redirect("/");

  return (
    <div className="mx-auto max-w-2xl px-4 pb-16 pt-6">
      <div className="flex items-center gap-3 mb-6">
        <Link prefetch={false} href="/admin" className="text-sm text-muted hover:text-text">← 관리자</Link>
        <h1 className="text-xl font-bold text-text">공식 수상작 관리</h1>
      </div>
      <WinnersManager />
    </div>
  );
}
