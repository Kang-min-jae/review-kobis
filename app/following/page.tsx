import { redirect } from "next/navigation";
import { auth } from "../../auth";
import { getFollowingList } from "../_lib/follow-actions";
import BackBar from "../_components/BackBar";
import FollowingList from "./FollowingList";

export const metadata = { title: "팔로잉 목록" };

export default async function FollowingPage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/login?callbackUrl=/following");

  const followingList = await getFollowingList(userId);

  return (
    <div className="mx-auto max-w-lg px-4 pb-12 pt-4">
      <BackBar />
      <h1 className="mt-4 text-xl font-bold text-text">팔로잉 목록</h1>
      <p className="mt-1 text-sm text-muted">내가 팔로우하는 사람들이에요.</p>
      <FollowingList users={followingList} />
    </div>
  );
}
