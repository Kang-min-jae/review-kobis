import SiteHeader from "../../_components/SiteHeader";
import BackBar from "../../_components/BackBar";
import ResetPasswordForm from "../../_components/ResetPasswordForm";

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="px-5 py-6">
        <BackBar />
        <div className="flex items-center justify-center py-10">
          <ResetPasswordForm token={token} />
        </div>
      </div>
    </main>
  );
}
