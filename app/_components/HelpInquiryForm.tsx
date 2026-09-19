"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const CATEGORIES = [
  "영화 정보 오류 (포스터/수상/출연진)",
  "신규 영화 추가 요청",
  "버그 신고",
  "기타 문의",
] as const;

// 카테고리 표시용 → DB 저장용 키 매핑
const CATEGORY_KEY: Record<string, string> = {
  "영화 정보 오류 (포스터/수상/출연진)": "영화 정보 오류",
  "신규 영화 추가 요청": "신규 영화 추가 요청",
  "버그 신고": "버그 신고",
  "기타 문의": "기타 문의",
};

const MAX_IMAGES = 5;
const MAX_IMAGE_PX = 1200; // 리사이즈 최대 너비·높이

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > MAX_IMAGE_PX || height > MAX_IMAGE_PX) {
        const ratio = Math.min(MAX_IMAGE_PX / width, MAX_IMAGE_PX / height);
        width = Math.round(width * ratio);
        height = Math.round(height * ratio);
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")!.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.8));
    };
    img.onerror = reject;
    img.src = url;
  });
}

export default function HelpInquiryForm() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [category, setCategory] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    const remaining = MAX_IMAGES - images.length;
    const toProcess = Array.from(files).slice(0, remaining);
    const resized = await Promise.all(toProcess.map(resizeImage)).catch(() => null);
    if (!resized) return;
    setImages((prev) => [...prev, ...resized]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!category) { setError("카테고리를 선택해 주세요."); return; }
    if (!title.trim()) { setError("제목을 입력해 주세요."); return; }
    if (!content.trim()) { setError("내용을 입력해 주세요."); return; }

    setSubmitting(true);
    setError(null);

    const res = await fetch("/api/help/inquiries", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ category: CATEGORY_KEY[category], title, content, images }),
    });

    setSubmitting(false);

    if (!res.ok) {
      const data = await res.json().catch(() => ({})) as { error?: string };
      setError(data.error ?? "제출 중 오류가 발생했습니다.");
      return;
    }

    router.push("/help/my-inquiries");
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 space-y-5">
      {/* 카테고리 */}
      <div>
        <p className="mb-2 text-sm font-semibold text-text">카테고리</p>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                category === c
                  ? "border-brand bg-brand text-white"
                  : "border-white/10 bg-surface text-muted hover:border-white/30 hover:text-text"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </div>

      {/* 제목 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-text" htmlFor="inq-title">
          제목
        </label>
        <input
          id="inq-title"
          type="text"
          maxLength={100}
          placeholder="예) 아바타: 물과 재 포스터가 다른 영화로 나와요"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-xl bg-surface px-4 py-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand"
        />
      </div>

      {/* 내용 */}
      <div>
        <label className="mb-1.5 block text-sm font-semibold text-text" htmlFor="inq-content">
          내용
        </label>
        <textarea
          id="inq-content"
          rows={5}
          maxLength={2000}
          placeholder="어떤 화면에서, 어떤 문제가 있었는지 자세히 알려주세요"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          className="w-full resize-none rounded-xl bg-surface px-4 py-3 text-sm text-text placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-brand"
        />
        <p className="mt-1 text-right text-xs text-muted">{content.length}/2000</p>
      </div>

      {/* 이미지 첨부 */}
      <div>
        <p className="mb-1.5 text-sm font-semibold text-text">
          스크린샷 첨부 <span className="font-normal text-muted">(선택)</span>
        </p>
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={images.length >= MAX_IMAGES}
          className="flex w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-white/10 bg-surface py-5 text-sm text-muted transition hover:border-white/30 hover:text-text disabled:opacity-40"
        >
          <span className="text-lg">↑</span>
          <span>클릭하여 캡처 이미지 첨부</span>
          <span className="text-xs opacity-60">포스터 오류, 404 화면 등 · PNG, JPG · 최대 {MAX_IMAGES}장</span>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        {images.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {images.map((src, i) => (
              <div key={i} className="relative">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`첨부 ${i + 1}`} className="h-16 w-16 rounded-lg object-cover" />
                <button
                  type="button"
                  onClick={() => setImages((prev) => prev.filter((_, j) => j !== i))}
                  className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-neutral-800 text-[10px] text-white hover:bg-red-600"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-900/30 px-4 py-2.5 text-xs text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={submitting}
        className="w-full rounded-xl bg-brand py-3.5 text-sm font-bold text-white transition hover:bg-brand-hover disabled:opacity-50"
      >
        {submitting ? "제출 중..." : "제보하기"}
      </button>
    </form>
  );
}
