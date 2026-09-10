// 지금까지 신고된, 실제로 그 인물이 출연하지 않은 게 확인된 영화들을 한 번에
// PersonFilmographyOverride(EXCLUDE)로 등록하고, 해당 인물의 CachedPerson을
// 지워서 다음 방문 때 새로 계산되게 하는 스크립트.
//
// 코드 레벨 매칭 로직을 더 고치는 것과 별개로, 지금 화면에 떠 있는 걸 바로
// 없애기 위한 실용적인 조치다 — 원인이 KMDb 원본 데이터 자체의 오류든, 아직
// 못 잡은 로직상의 문제든, 일단 확실히 틀린 걸로 확인된 건 이걸로 즉시 제거하고,
// 근본 원인은 계속 별도로 조사한다.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/exclude-known-bad-titles.mts

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

type FilmographyMovie = { id: string; title: string };

const CASES: { kmdbId: string; name: string; badTitles: string[] }[] = [
  {
    kmdbId: "00045706",
    name: "박정민",
    badTitles: [
      "하루",
      "군함도",
      "메소드",
      "왕을 참하라",
      "아이들",
      "위험한 상견례",
      "초감각 커플",
      "라라 선샤인",
      "꽃미남 연쇄 테러사건",
      "밀양",
      "나의 친구, 그의 아내",
      "파이스토리",
    ],
  },
  {
    kmdbId: "00187551",
    name: "안재홍",
    badTitles: ["몽정기", "반칙왕", "기막힌 사내들", "악어"],
  },
];

async function main() {
  for (const { kmdbId, name, badTitles } of CASES) {
    console.log(`\n=== ${name} (kmdbId=${kmdbId}) ===`);
    const cached = await db.cachedPerson.findUnique({ where: { kmdbId } });
    if (!cached) {
      console.log("  캐시된 필모그래피가 없습니다 — 건너뜁니다.");
      continue;
    }
    const filmography = cached.filmography as unknown as FilmographyMovie[];

    let matchedCount = 0;
    for (const title of badTitles) {
      const movie = filmography.find((m) => m.title === title);
      if (!movie) {
        console.log(`  "${title}" — 지금 캐시된 필모그래피에 없음(이미 빠졌거나 제목 표기가 다름), 건너뜀`);
        continue;
      }
      const movieCd = movie.id.replace(/^kobis-/, "");
      await db.personFilmographyOverride.upsert({
        where: { personKmdbId_movieCd: { personKmdbId: kmdbId, movieCd } },
        create: {
          personKmdbId: kmdbId,
          movieCd,
          action: "EXCLUDE",
          reason: `사용자 신고 — ${name} 실제 미출연 확인됨 (제목: ${title})`,
        },
        update: {},
      });
      console.log(`  "${title}" (movieCd=${movieCd}) -> EXCLUDE 등록됨`);
      matchedCount++;
    }

    if (matchedCount > 0) {
      await db.cachedPerson.delete({ where: { kmdbId } });
      console.log(`  ${matchedCount}건 등록 완료, CachedPerson 캐시 삭제함 — 다음 방문 때 새로 계산됩니다.`);
    }
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
