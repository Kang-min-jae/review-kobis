// 로컬 개발 DB에 테이블을 만든다(npm run db:local). .env.local의 DATABASE_URL을 쓰고, 그 주소가 로컬이
// 아니면 멈춘다 — 그냥 `npx prisma db push`를 하면 prisma7.config.ts가 .env(운영 DB 주소)를 읽어 운영 DB
// 구조를 바꿀 수 있다.
//
// 마이그레이션 파일(prisma/migrations)은 운영 DB가 일부 db push로 만들어진 탓에 빈 DB에서 처음부터
// 적용되지 않는다. 로컬 DB는 schema.prisma에서 바로 만든다.
import { config } from "dotenv";
import { spawnSync } from "node:child_process";

config({ path: ".env.local", override: true });
const { databaseHost, isLocalDatabase } = await import("../app/_lib/neon-config");

const url = process.env.DATABASE_URL;
if (!isLocalDatabase(url)) {
  console.error(`[db:local] .env.local의 DATABASE_URL이 로컬 DB가 아닙니다(${databaseHost(url) || "없음"}). 멈춥니다.`);
  console.error("[db:local] .env.example을 .env.local로 복사하고, docker compose up -d로 로컬 DB를 띄운 뒤 다시 실행하세요.");
  process.exit(1);
}

console.error(`[db:local] 로컬 DB(${databaseHost(url)})에 테이블을 만듭니다.`);
const result = spawnSync("npx", ["prisma", "db", "push", "--config", "prisma7.config.ts"], {
  stdio: "inherit",
  env: { ...process.env, DATABASE_URL: url },
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
