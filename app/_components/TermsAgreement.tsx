"use client";

import { useState } from "react";

type Item = {
  key: string;
  label: string;
  required: boolean;
  content: string;
};

// 필수/선택 약관 동의 체크박스 목록 + "전체 동의" + 항목별 "보기"(펼치면 실제
// 약관 내용을 보여줌). checked 상태는 부모가 들고 있어야 제출 버튼의 필수 동의
// 여부를 판단할 수 있다.
export default function TermsAgreement({
  items,
  checked,
  onChange,
}: {
  items: Item[];
  checked: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  const [openKey, setOpenKey] = useState<string | null>(null);

  const allChecked = items.every((item) => checked[item.key]);

  const toggleAll = () => {
    const next = !allChecked;
    onChange(Object.fromEntries(items.map((item) => [item.key, next])));
  };

  const toggleOne = (key: string) => {
    onChange({ ...checked, [key]: !checked[key] });
  };

  return (
    <div className="space-y-3 rounded-lg border border-neutral-700 p-3">
      <label className="flex items-center gap-2 border-b border-neutral-700 pb-3 text-sm font-semibold text-text">
        <input
          type="checkbox"
          checked={allChecked}
          onChange={toggleAll}
          className="h-4 w-4 shrink-0 accent-brand"
        />
        전체 동의
      </label>

      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.key}>
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-2 text-xs text-text">
                <input
                  type="checkbox"
                  name={`agree-${item.key}`}
                  checked={!!checked[item.key]}
                  onChange={() => toggleOne(item.key)}
                  className="h-4 w-4 shrink-0 accent-brand"
                />
                <span className={item.required ? "text-brand" : "text-muted"}>
                  [{item.required ? "필수" : "선택"}]
                </span>
                {item.label}
              </label>
              <button
                type="button"
                onClick={() => setOpenKey(openKey === item.key ? null : item.key)}
                className="shrink-0 text-xs text-muted underline underline-offset-2 hover:text-text"
              >
                보기
              </button>
            </div>
            {openKey === item.key && (
              <div className="mt-2 max-h-40 overflow-y-auto whitespace-pre-line rounded-md bg-bg p-3 text-[11px] leading-relaxed text-muted">
                {item.content}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
