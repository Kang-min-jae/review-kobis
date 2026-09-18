import { redirect } from "next/navigation";
import { auth } from "../../auth";
import AdminDashboard from "./AdminDashboard";

export const metadata = { title: "관리자 페이지" };

export default async function AdminPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "ADMIN") {
    redirect("/");
  }
  return <AdminDashboard />;
}
