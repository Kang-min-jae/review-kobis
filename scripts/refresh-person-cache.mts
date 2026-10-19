// 특정 인물의 CachedPerson 캐시를 이름(PersonIdentityMapping에 등록돼 있으면 그
// kmdbId 사용) 또는 kmdbId로 직접 지정해서 지운다. 지우고 나면 다음 방문 때 지금
// 코드(personId 전용 매칭, KOFIC 교차검증 등)로 새로 계산되어 캐시가 다시 채워진다.
//
// 왜 필요한가: getPersonFilmography는 personId로 CachedPerson을 찾아 신선하면
// (3일 TTL) 그 값을 그대로 반환한다 — 로직을 아무리 고쳐도, 이미 저장된 캐시
// 행 자체는 알아서 다시 계산되지 않는다. "검색 드롭다운에선 42편으로 정확히
// 나오는데 상세페이지는 여전히 71편"처럼 보이는 증상은 거의 항상 이 캐시 때문이다.
//
// 실행 방법 (프로젝트 루트에서):
//   npx tsx scripts/refresh-person-cache.mts 박정민 안재홍 황정민
//   npx tsx scripts/refresh-person-cache.mts --kmdbId 00045706

import { config } from "dotenv";
config();
config({ path: ".env.local", override: true });

import { PrismaClient } from "../app/generated/prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { configureNeon } from "../app/_lib/neon-config";

configureNeon(process.env.DATABASE_URL, { announce: true });

const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL });
const db = new PrismaClient({ adapter });

async function main() {
  const args = process.argv.slice(2);
  const kmdbIdFlagIndex = args.indexOf("--kmdbId");

  if (kmdbIdFlagIndex !== -1) {
    const kmdbId = args[kmdbIdFlagIndex + 1];
    if (!kmdbId) {
      console.error("사용법: npx tsx scripts/refresh-person-cache.mts --kmdbId <kmdbId>");
      process.exitCode = 1;
      return;
    }
    const result = await db.cachedPerson.deleteMany({ where: { kmdbId } });
    console.log(`kmdbId=${kmdbId}: ${result.count}개 캐시 삭제됨.`);
    return;
  }

  const names = args;
  if (names.length === 0) {
    console.error("사용법: npx tsx scripts/refresh-person-cache.mts <이름...> 또는 --kmdbId <kmdbId>");
    process.exitCode = 1;
    return;
  }

  for (const name of names) {
    // CachedPerson.name은 유니크가 아니다 — 같은 이름(예: "안재홍")이 배우 kmdbId
    // 하나, 감독 kmdbId 하나(때로는 그 이상)로 각각 별도 행에 캐시돼 있을 수 있다.
    // 예전엔 PersonIdentityMapping에 매핑이 하나라도 있으면 그 kmdbId만 지우고
    // "이름으로 전체 삭제"는 건너뛰어서, 매핑에 없는 다른 role/다른 kmdbId의 캐시
    // (예: 배우 안재홍만 매핑돼 있고 감독 안재홍은 매핑에 없는 경우)가 그대로
    // 남아있는 문제가 있었다 — 항상 이름으로도 전부 지운다.
    const byName = await db.cachedPerson.deleteMany({ where: { name } });
    console.log(`"${name}": 이름으로 캐시 ${byName.count}개 삭제됨.`);

    const mappings = await db.personIdentityMapping.findMany({ where: { personName: name } });
    for (const m of mappings) {
      if (!m.kmdbId) continue;
      // 위에서 이름으로 이미 지웠어도, 혹시 이름 표기가 살짝 다르게 저장된 캐시가
      // 있을 수 있어 매핑된 kmdbId로 한 번 더 확인 삭제한다.
      const byKmdbId = await db.cachedPerson.deleteMany({ where: { kmdbId: m.kmdbId } });
      if (byKmdbId.count > 0) {
        console.log(`"${name}" (${m.role}, kmdbId=${m.kmdbId}): 이름으로 안 지워진 캐시 ${byKmdbId.count}개 추가 삭제됨.`);
      }
    }
  }

  console.log("\n각 인물 페이지에 다시 접속하면 최신 로직으로 재계산됩니다.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
