// DB 연결 문제를 진단하기 위한 임시 스크립트.
// 실행: npx tsx -r dotenv/config debug-db.mjs
// (확인 끝나면 지워도 되는 파일입니다)
import { db } from "./app/_lib/db.ts";

console.log("DATABASE_URL:", process.env.DATABASE_URL);

try {
  const row = await db.cachedMovie.findFirst();
  console.log("접속 성공. 예시 행:", row);
} catch (err) {
  console.error("\n===== 전체 에러 내용 =====");
  console.error("타입:", err?.constructor?.name);
  console.error("message:", err?.message);
  console.error("code:", err?.code);
  console.error("cause:", err?.cause);
  console.error(err);
  console.error("\n===== JSON 형태 =====");
  console.error(JSON.stringify(err, Object.getOwnPropertyNames(err ?? {}), 2));
} finally {
  await db.$disconnect();
}
