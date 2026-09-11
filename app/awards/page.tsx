import SiteHeader from "../_components/SiteHeader";
import AwardsVoting from "../_components/AwardsVoting";
import { auth } from "../../auth";

export const metadata = { title: "수상작 투표" };

export default async function AwardsPage() {
  const session = await auth();
  const loggedIn = !!session?.user?.id;

  return (
    <main>
      <SiteHeader active="awards" />
      <AwardsVoting loggedIn={loggedIn} />
    </main>
  );
}
