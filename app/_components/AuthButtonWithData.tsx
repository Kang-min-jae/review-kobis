import { auth } from "../../auth";
import { getUserProfile } from "../_lib/user-profile";
import AuthButton from "./AuthButton";

// Async RSC — getUserProfile은 React.cache로 메모이즈되어 있어
// SideMenuWithData에서 이미 호출했다면 이 요청 내에선 DB를 다시 조회하지 않는다.
export default async function AuthButtonWithData() {
  const session = await auth();

  let nickname: string | null = null;
  if (session?.user?.id) {
    const profile = await getUserProfile(session.user.id);
    nickname = profile.nickname;
  }

  return <AuthButton session={session} nickname={nickname} />;
}
