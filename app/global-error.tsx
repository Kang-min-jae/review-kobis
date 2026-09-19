"use client";

import { useEffect } from "react";

// 루트 layout.tsx 자체가 에러를 던질 때 잡아주는 최후 방어선.
// html/body를 직접 렌더해야 한다 — layout이 마운트되지 않은 상태이기 때문.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="ko">
      <body style={{ margin: 0, background: "#09090b", color: "#fafafa", fontFamily: "sans-serif" }}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100svh",
            gap: "1rem",
            padding: "1.25rem",
            textAlign: "center",
          }}
        >
          <p style={{ fontSize: "3rem", fontWeight: 700, color: "#f43f5e", margin: 0 }}>오류</p>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700, margin: 0 }}>
            서비스에 일시적인 문제가 생겼어요
          </h1>
          <p style={{ fontSize: "0.875rem", color: "#a1a1aa", margin: 0 }}>잠시 후 다시 시도해 주세요.</p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "0.5rem",
              borderRadius: "9999px",
              background: "#f43f5e",
              color: "#fff",
              padding: "0.625rem 1.5rem",
              fontSize: "0.875rem",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
            }}
          >
            다시 시도하기
          </button>
        </div>
      </body>
    </html>
  );
}
