import SiteHeader from "../_components/SiteHeader";
import BackBar from "../_components/BackBar";
import SignUpForm from "../_components/SignUpForm";

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const { callbackUrl } = await searchParams;
  const callback = typeof callbackUrl === "string" ? callbackUrl : "/";

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="px-5 py-6">
        <BackBar />
        <div className="flex items-center justify-center py-10">
          <SignUpForm callbackUrl={callback} />
        </div>
      </div>
    </main>
  );
}
