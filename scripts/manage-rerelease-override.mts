// RereleaseClassification 수동 검수 큐 관리용 CLI. 자동 판정(KMDb 개봉일 대조, KOBIS
// 원 개봉 대조, 제목 키워드, 제작연도-개봉연도 격차)이 전부 실패해 "미분류"로 남은
// 영화, 또는 자동 판정이 틀린 영화를 사람이 직접 확정한다. manualConfirmed=true로
// 표시된 행은 scripts/refresh-rerelease-classifications.mts가 다시 덮어쓰지 않는다.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/manage-rerelease-override.mts reset                # 수동 확정 아닌 판정 전체 삭제
//   npx tsx scripts/manage-rerelease-override.mts list                # 미분류 큐 보기
//   npx tsx scripts/manage-rerelease-override.mts list all            # 전체 판정 결과 보기
//   npx tsx scripts/manage-rerelease-override.mts confirm <movieCd> rerelease <원작연도> <재개봉일 YYYY-MM-DD>
//   npx tsx scripts/manage-rerelease-override.mts confirm <movieCd> new-release
//   npx tsx scripts/manage-rerelease-override.mts unconfirm <movieCd>   # 수동 확정 해제(다음 배치가 다시 계산)

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

function printUsage() {
  console.error("사용법:");
  console.error("  reset               # 수동 확정 아닌 판정 전체 삭제(판정 로직이 바뀌었을 때 재계산용)");
  console.error("  list                # 미분류(수동 검수 필요) 큐 보기");
  console.error("  list all            # 전체 판정 결과 보기");
  console.error("  confirm <movieCd> rerelease <원작연도> <재개봉일 YYYY-MM-DD>");
  console.error("  confirm <movieCd> new-release");
  console.error("  unconfirm <movieCd>");
}

async function main() {
  const [, , cmd, ...args] = process.argv;

  if (cmd === "list") {
    const [scope] = args;
    const rows = await db.rereleaseClassification.findMany({
      where: scope === "all" ? undefined : { status: "unclassified" },
      orderBy: { syncedAt: "desc" },
    });
    console.table(
      rows.map((r) => ({
        movieCd: r.movieCd,
        title: r.movieTitle,
        isRerelease: r.isRerelease,
        originalYear: r.originalYear,
        rereleaseDate: r.rereleaseDate,
        status: r.status,
        source: r.source,
        manualConfirmed: r.manualConfirmed,
      }))
    );
    return;
  }

  if (cmd === "confirm") {
    const [movieCd, kind, originalYear, rereleaseDate] = args;
    if (!movieCd || (kind !== "rerelease" && kind !== "new-release")) {
      console.error("사용법: confirm <movieCd> rerelease|new-release [원작연도] [재개봉일]");
      process.exitCode = 1;
      return;
    }
    const existing = await db.rereleaseClassification.findUnique({ where: { movieCd } });
    const movieTitle = existing?.movieTitle ?? movieCd;

    // 배치가 "애매함"(status: unclassified)으로 남긴 행은 이미 잠정 원작연도/재개봉일이
    // 채워져 있는 경우가 많다 — 관리자가 그 값에 동의하면 다시 안 입력해도 되게, 인자를
    // 생략하면 기존에 저장된 값을 그대로 쓴다.
    const finalOriginalYear = originalYear ?? existing?.originalYear ?? null;
    const finalRereleaseDate = rereleaseDate ?? existing?.rereleaseDate ?? null;

    if (kind === "rerelease" && (!finalOriginalYear || !finalRereleaseDate)) {
      console.error("재개봉으로 확정하려면 원작연도와 재개봉일이 모두 필요합니다(기존 값이 없으면 직접 입력).");
      console.error('사용법: confirm <movieCd> rerelease <원작연도> <재개봉일 YYYY-MM-DD>');
      process.exitCode = 1;
      return;
    }

    const data = {
      movieTitle,
      isRerelease: kind === "rerelease",
      originalYear: kind === "rerelease" ? finalOriginalYear : null,
      rereleaseDate: kind === "rerelease" ? finalRereleaseDate : null,
      status: "classified" as const,
      source: "manual",
      manualConfirmed: true,
      syncedAt: new Date(),
    };

    const row = await db.rereleaseClassification.upsert({
      where: { movieCd },
      create: { movieCd, audiAcc: existing?.audiAcc ?? null, ...data },
      update: data,
    });
    console.log("수동 확정됨:", row);
    return;
  }

  if (cmd === "unconfirm") {
    const [movieCd] = args;
    if (!movieCd) {
      console.error("사용법: unconfirm <movieCd>");
      process.exitCode = 1;
      return;
    }
    await db.rereleaseClassification.update({ where: { movieCd }, data: { manualConfirmed: false } });
    console.log(`movieCd=${movieCd}: 수동 확정 해제됨 — 다음 배치 실행 시 다시 자동 판정됩니다.`);
    return;
  }

  if (cmd === "reset") {
    // 판정 로직 자체가 바뀌었을 때(예: 동명이작 오탐 수정) 옛 로직으로 저장된 값들을
    // 한 번에 지우고 다음 배치가 새 로직으로 처음부터 다시 계산하게 한다. 사람이
    // 직접 확정한 값(manualConfirmed)은 자동 판정 오류와 무관하니 그대로 둔다.
    const result = await db.rereleaseClassification.deleteMany({ where: { manualConfirmed: false } });
    console.log(`수동 확정 아닌 판정 ${result.count}건 삭제됨. 배치를 다시 돌리면 새 로직으로 재계산됩니다.`);
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
