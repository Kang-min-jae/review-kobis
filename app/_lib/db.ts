import { PrismaClient } from "../generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Neon의 서버리스 드라이버는 웹소켓으로 붙는데, 브라우저와 달리 Node.js에는 전역
// WebSocket이 없어서 직접 구현체를 넣어줘야 한다 (Prisma+Neon 공식 가이드 그대로).
// 이걸 빼먹으면 접속 시도가 그냥 빈 ErrorEvent로 실패한다.
neonConfig.webSocketConstructor = ws;

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
