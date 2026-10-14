import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-5 text-center">
      <p className="text-5xl font-bold text-brand">404</p>
      <h1 className="text-lg font-bold text-text">페이지를 찾을 수 없어요</h1>
      <p className="text-sm text-muted">요청하신 주소가 없거나 이동되었어요.</p>
      <Link prefetch={false}
        href="/"
        className="mt-2 rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-hover"
      >
        홈으로 돌아가기
      </Link>
    </div>
  );
}
