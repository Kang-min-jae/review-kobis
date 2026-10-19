This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## 로컬 DB로 개발하기 (운영 DB 전송량 아끼기)

내 컴퓨터에서 `npm run dev`나 `scripts/` 안의 스크립트를 운영 DB(Neon)에 붙여 돌리면, 그 조회가 전부 운영 DB의 무료 전송량(월 5GB)에 잡혀요. 개발은 내 컴퓨터의 Postgres로 해요.

1. Docker Desktop을 켜고 로컬 DB를 띄워요.
   ```bash
   docker compose up -d
   ```
   Postgres(5432)와 Neon 웹소켓 중계기(5433)가 함께 떠요. 사이트의 DB 드라이버가 웹소켓으로만 붙기 때문이에요.
2. `.env.example`을 `.env.local`로 복사해요. `.env.local`의 `DATABASE_URL`이 로컬 DB를 가리켜요. 외부 API 키는 기존 `.env`의 값을 그대로 써도 돼요.
3. 로컬 DB에 테이블을 만들어요.
   ```bash
   npm run db:local
   ```
   `.env.local`의 주소가 로컬일 때만 실행돼요. 그냥 `npx prisma db push`를 하면 `.env`의 운영 DB 구조를 바꿀 수 있으니 쓰지 않아요.
4. 개발 서버를 켜요.
   ```bash
   npm run dev
   ```
   영화·인물 정보는 처음 볼 때 KOBIS·TMDB에서 받아 로컬 DB에 쌓여요. 회원·리뷰는 로컬에서 새로 만들어요.

안전장치는 이렇게 동작해요.
- 개발 서버는 원격 DB 주소로는 시작하지 않고 안내 메시지를 보여요. 꼭 필요할 때만 `ALLOW_REMOTE_DB_IN_DEV=1 npm run dev`를 쓰고, 그때도 운영 대신 개발용 Neon 브랜치를 써요(브랜치 전송량도 같은 프로젝트 한도에 잡혀요).
- 관리 스크립트는 실행할 때마다 어느 DB(로컬/원격)에 붙는지 먼저 알려 줘요. `.env.local`이 있으면 그 주소를 써요. 운영 DB에서 꼭 돌려야 하는 관리 작업만 `.env.local` 없이 실행해요.

## 협업 필터링(CF) — "추천 N%" 하이브리드

"추천 N%"는 기본적으로 내 평점으로 만든 취향 점수(A, `app/_lib/calculateAffinity.ts`)예요. 사이트에 평가가 충분히 쌓이고 `CF_ENABLED=true`로 켜면, 비슷한 취향 회원들의 평가로 만든 CF 점수(B)를 조금씩 섞어요.

- 최종 = (1 − α) × A + α × B
- α = `CF_ALPHA_MAX` × min(1, 내 평점 수 / `CF_FULL_USER_RATINGS`) × min(1, 유효 이웃 수 / `CF_FULL_NEIGHBORS`)
- 다음 중 하나라도 해당하면 α = 0이고, 예전과 완전히 같은 점수가 나와요.
  - `CF_ENABLED`가 `true`가 아님
  - 전체 평점 수나 평점을 남긴 회원 수가 기준 미만
  - 내 평점이 `CF_MIN_USER_RATINGS`개 미만
  - 그 영화에 CF 근거가 없음

코드 위치:
- `app/_lib/cf-core.ts`: 계산식
- `app/_lib/cf-data.ts`: 요청 시 처리
- `app/_lib/cf-similarity-compute.ts`: 야간 계산
- `app/_lib/cf-config.ts`: 설정

| 환경변수 | 기본값 | 설명 |
| --- | --- | --- |
| `CF_ENABLED` | `false` | 수동 스위치. `true`일 때만 CF를 쓸 수 있어요. 아래 기준도 함께 넘어야 실제로 켜져요. |
| `CF_MIN_TOTAL_RATINGS` | `2000` | 사이트 전체 "전체" 평점 수 기준 |
| `CF_MIN_USERS` | `200` | 평점을 1개 이상 남긴 회원 수 기준 |
| `CF_MIN_CO_RATERS` | `5` | 영화 한 쌍을 둘 다 평가한 회원 수 기준. 미만인 쌍은 유사도에 쓰지 않아요. |
| `CF_SHRINKAGE` | `10` | 유사도 축소 상수 λ: sim' = sim × n / (n + λ) |
| `CF_ALPHA_MAX` | `0.6` | CF 최대 반영 비율(0~1) |
| `CF_NEIGHBORS_K` | `50` | 영화당 저장하고 예측에 쓰는 이웃 영화 최대 수 |
| `CF_MIN_USER_RATINGS` | `5` | CF를 적용하려면 필요한 내 평점 수 |
| `CF_FULL_USER_RATINGS` | `30` | 내 평점이 이만큼이면 개인 가중치가 최대 |
| `CF_FULL_NEIGHBORS` | `10` | 유효 이웃이 이만큼이면 영화 가중치가 최대 |

숫자 값이 잘못되면 기본값을 쓰고 서버 로그에 경고를 남겨요. 코드 상수(`cf-config.ts`):
- 유사도 하한: 0.1
- 계산 대상 영화의 최소 평가자 수: 5명
- 크론 묶음 크기: 200편
- 시간 예산: 40초
- 캐시: 10분

운영 방법:
- **야간 계산:** 기존 크론 `/api/cron/movie-similarity`(매일, `Authorization: Bearer $CRON_SECRET`)가 CF 통계(`CfStats`)와 유사도(`MovieCfSimilarity`)를 함께 계산해요. 한 번에 다 못 끝내면 다음 실행이 이어서 해요.
- **상태 확인:** `curl https://stilltheater.com/api/admin/cf-status -H "Authorization: Bearer $ADMIN_SECRET"`
- **켜기 전 검증:** `npm run cf:eval`. 하이브리드가 현재 방식보다 부정확하면 종료 코드 1로 끝나요.
- **단위 테스트:** `npm test`
