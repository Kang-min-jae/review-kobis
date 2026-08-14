import ProfileView from "../../_components/ProfileView";

export default async function UserProfilePage({ params }: PageProps<"/users/[id]">) {
  const { id } = await params;
  return <ProfileView authorId={id} />;
}
