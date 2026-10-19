// audit-cached-persons.mts가 저장한 의심 목록(scripts/.audit-output.json)을 읽어서,
// 그 인물들의 CachedPerson 캐시를 실제로 삭제한다. 삭제된 인물은 다음 페이지 접속 때
// 지금 고친 로직(personId 전용 매칭, KOBIS 교차검증, PersonFilmographyOverride 반영)
// 으로 새로 계산되어 다시 캐시된다.
//
// 반드시 audit-cached-persons.mts를 먼저 실행해서 결과를 눈으로 확인한 뒤에 이 스크립트를
// 실행하세요 — 자동으로 이어서 삭제하지 않도록 일부러 별도 스크립트로 분리했습니다.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/clean-cached-persons.mts

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { readFileSync } from "node:fs";
import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { configureNeon } from "../app/_lib/neon-config";

configureNeon(process.env.DATABASE_URL, { announce: true });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const inputPath = new URL("./.audit-output.json", import.meta.url);
  let raw: string;
  try {
    raw = readFileSync(inputPath, "utf-8");
  } catch {
    console.error(`${inputPath.pathname} 을 찾을 수 없습니다 — 먼저 다음을 실행하세요:`);
    console.error("  npx tsx scripts/audit-cached-persons.mts");
    process.exitCode = 1;
    return;
  }

  const { scannedAt, suspects } = JSON.parse(raw) as {
    scannedAt: string;
    suspects: { kmdbId: string; name: string; role: string; reasons: string[] }[];
  };

  if (suspects.length === 0) {
    console.log("의심 목록이 비어 있습니다 — 삭제할 게 없습니다.");
    return;
  }

  console.log(`${scannedAt}에 스캔된 의심 인물 ${suspects.length}명을 삭제합니다:\n`);
  for (const s of suspects) {
    console.log(`  - ${s.name} (${s.role}, kmdbId=${s.kmdbId}): ${s.reasons.join(" / ")}`);
  }

  const result = await db.cachedPerson.deleteMany({
    where: { kmdbId: { in: suspects.map((s) => s.kmdbId) } },
  });

  console.log(`\n${result.count}개 행을 삭제했습니다. 각 인물 페이지에 다시 접속하면 새 로직으로 재계산됩니다.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
