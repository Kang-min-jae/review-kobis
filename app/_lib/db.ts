import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { configureNeon, databaseHost, isLocalDatabase } from "./neon-config";

configureNeon(process.env.DATABASE_URL);

// 개발 서버(next dev)가 운영 DB(Neon)에 붙지 않게 막는다 — 내 컴퓨터에서 페이지를 열 때마다 운영 DB의
// 무료 전송량(월 5GB)이 줄어든다. 로컬 DB를 쓰려면 README의 "로컬 DB로 개발하기"를 따른다. 꼭 원격 DB로
// 확인해야 할 때만 ALLOW_REMOTE_DB_IN_DEV=1을 붙인다(그때도 운영이 아닌 개발용 Neon 브랜치를 쓴다).
if (
  process.env.NODE_ENV === "development" &&
  process.env.DATABASE_URL &&
  !isLocalDatabase(process.env.DATABASE_URL) &&
  process.env.ALLOW_REMOTE_DB_IN_DEV !== "1"
) {
  throw new Error(
    `개발 서버가 원격 DB(${databaseHost(process.env.DATABASE_URL)})에 연결하려고 합니다. 운영 DB 전송량을 아끼기 위해 막았어요.\n` +
      "→ .env.local에 로컬 DB 주소를 넣어 주세요(README의 \"로컬 DB로 개발하기\").\n" +
      "→ 꼭 원격 DB가 필요하면 ALLOW_REMOTE_DB_IN_DEV=1 npm run dev",
  );
}

// Next.js 개발 서버는 파일을 바꿀 때마다 모듈을 다시 불러오는데(hot reload), 그때마다
// 새 PrismaClient를 만들면 커넥션이 계속 쌓인다. 그래서 global 객체에 하나만
// 만들어두고 재사용한다 — Prisma 공식 Next.js 가이드에서 권장하는 방식.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Prisma 7부터는 엔진 바이너리 없이 드라이버 어댑터를 통해 DB에 붙는다. Neon의
// 서버리스 드라이버(HTTP/웹소켓 기반)를 써서 Vercel 같은 서버리스 환경에서도
// 별도 커넥션 풀 없이 붙을 수 있다.
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });

export const db = globalForPrisma.prisma ?? new PrismaClient({ adapter, log: ["error", "warn"] });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}
