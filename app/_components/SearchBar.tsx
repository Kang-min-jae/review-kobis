import { auth } from "../../auth";
import { db } from "../_lib/db";
import AuthButton from "./AuthButton";
import SearchInput from "./SearchInput";
import SideMenu from "./SideMenu";

export default async function SearchBar() {
  const session = await auth();

  let nickname: string | null = null;
  if (session?.user?.id) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { nickname: true },
    });
    nickname = user?.nickname ?? null;
  }

  return (
    <div className="flex items-center gap-2 px-5 pt-5 pb-5">
      <SideMenu session={session} nickname={nickname} />
      <SearchInput />
      <AuthButton session={session} nickname={nickname} />
    </div>
  );
}
