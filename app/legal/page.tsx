import SiteHeader from "../_components/SiteHeader";
import BackBar from "../_components/BackBar";
import { TERMS_OF_SERVICE, PRIVACY_POLICY, TERMS_VERSION } from "../_lib/legal-content";

export const metadata = { title: "이용약관·개인정보 처리방침" };

// 개인정보 처리방침은 가입하지 않은 사람도 볼 수 있게 공개해야 한다(개인정보 보호법 제30조) —
// 가입 화면의 접힌 약관과 같은 원문을 누구나 볼 수 있는 페이지로 보여준다.
export default function LegalPage() {
  const sections = [
    { id: "terms", title: "이용약관", body: TERMS_OF_SERVICE },
    { id: "privacy", title: "개인정보 처리방침", body: PRIVACY_POLICY },
  ];
  return (
    <main className="min-h-screen">
      <SiteHeader />
      <div className="mx-auto max-w-3xl px-5 py-6">
        <BackBar />
        <h1 className="mt-3 text-lg font-bold text-text">이용약관·개인정보 처리방침</h1>
        <p className="mt-1 text-xs text-muted">시행일 {TERMS_VERSION}</p>
        <nav className="mt-4 flex flex-wrap gap-3 text-xs">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="text-muted underline underline-offset-2 hover:text-text">
              {s.title}
            </a>
          ))}
        </nav>
        {sections.map((s) => (
          <section key={s.id} id={s.id} className="mt-8 scroll-mt-24">
            <h2 className="text-base font-bold text-text">{s.title}</h2>
            <div className="mt-3 whitespace-pre-line rounded-lg border border-neutral-700 bg-surface p-4 text-xs leading-relaxed text-muted">
              {s.body}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
