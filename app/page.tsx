export default function Home() {
  return (
    <main>
      {/* 검색창 영역 */}
      <div style={{ padding: "20px" }}>
        <input
          type="text"
          placeholder="영화 제목 또는 배우/감독 이름 "
          style={{
            width: "100%",
            padding: "12px 16px",
            borderRadius: "8px",
            border: "1px solid #333",
            background: "#141414",
            color: "#f5f5f5",
          }}
        />
      </div>

      {/* 메뉴(카테고리) 영역 */}
      <nav
        style={{
          display: "flex",
          gap: "16px",
          padding: "0 20px 20px 20px",
        }}
      >
        <span style={{ color: "#e4302a", fontWeight: "bold" }}>전체</span>
        <span style={{ color: "#e4302a" }}>애니</span>
        <span style={{ color: "#e4302a" }}>액션</span>
        <span style={{ color: "#e4302a" }}>로맨스</span>
        <span style={{ color: "#e4302a" }}>독립/단편</span>
      </nav>
    </main>
  );
}