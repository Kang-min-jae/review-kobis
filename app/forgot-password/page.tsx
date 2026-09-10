import SiteHeader from "../_components/SiteHeader";
import BackBar from "../_components/BackBar";
import ForgotPasswordForm from "../_components/ForgotPasswordForm";

export default function ForgotPasswordPage() {
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="px-5 py-6">
        <BackBar />
        <div className="flex items-center justify-center py-10">
          <ForgotPasswordForm />
        </div>
      </div>
    </main>
  );
}
