"use client";

// Google/Kakao/Naver 등 OAuth 제공자 버튼 — AuthButton(헤더 드롭다운)과 로그인
// 페이지에서 똑같은 모양으로 재사용한다.
export default function ProviderButton({
  label,
  bg,
  fg,
  letter,
  onClick,
}: {
  label: string;
  bg: string;
  fg: string;
  letter: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2.5 rounded-lg border border-neutral-700 px-3 py-2.5 text-xs font-semibold text-text transition-colors hover:border-brand"
    >
      <span
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold"
        style={{ backgroundColor: bg, color: fg }}
      >
        {letter}
      </span>
      {label}
    </button>
  );
}
