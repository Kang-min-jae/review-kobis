"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function LanguageSwitcher() {
  const router = useRouter();
  const [locale, setLocale] = useState<"ko" | "en">("ko");

  useEffect(() => {
    const match = document.cookie.match(/(?:^|;\s*)NEXT_LOCALE=([^;]+)/);
    if (match?.[1] === "en") setLocale("en");
  }, []);

  function toggle() {
    const next = locale === "ko" ? "en" : "ko";
    document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=31536000; SameSite=Lax`;
    setLocale(next);
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="shrink-0 rounded border border-neutral-700 px-2 py-1 text-xs font-semibold text-text transition-colors hover:border-brand hover:text-brand"
      aria-label="언어 전환"
    >
      {locale === "ko" ? "KO" : "EN"}
    </button>
  );
}
