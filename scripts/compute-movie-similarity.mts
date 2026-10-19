// "이 영화를 좋아한 사람들이 본" 유사도 테이블(MovieSimilarity)을 지금 바로 다시 계산한다.
// 운영에선 Vercel Cron이 매일 /api/cron/movie-similarity를 부르지만, 바로 반영하고 싶을 때 쓴다.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/compute-movie-similarity.mts

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { configureNeon } from "../app/_lib/neon-config";
import { recomputeMovieSimilarity } from "../app/_lib/movie-similarity-compute";

configureNeon(process.env.DATABASE_URL, { announce: true });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

try {
  const result = await recomputeMovieSimilarity(db);
  console.log(`완료: 영화 ${result.movies}편, 유사 영화 쌍 ${result.pairs}개 저장`);
} finally {
  await db.$disconnect();
}
