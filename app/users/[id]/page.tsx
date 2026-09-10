import SiteHeader from "../../_components/SiteHeader";
import ProfileView from "../../_components/ProfileView";

export default async function UserProfilePage({ params }: PageProps<"/users/[id]">) {
  const { id } = await params;
  return (
    <main>
      <SiteHeader />
      <ProfileView authorId={id} />
    </main>
  );
}
