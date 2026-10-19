#!/bin/bash
# Vercel "Ignored Build Step"(vercel.json의 ignoreCommand) — exit 0이면 이번 배포를 건너뛰고, exit 1이면 빌드한다.
# DB 전송량 원인을 찾는 동안 배포 횟수를 줄이려고 둔다.

# 1) 운영(main) 배포만 만든다. 미리보기(Preview) 배포는 환경 변수 설정에 따라 운영 DB를 그대로 쓰고,
#    빌드·서버 함수 사용량만 늘린다. 다시 켜려면 이 블록을 지운다.
if [ "$VERCEL_ENV" != "production" ]; then
  echo "미리보기 배포는 건너뜁니다(scripts/vercel-ignore-build.sh)."
  exit 0
fi

# 2) 사이트 동작과 무관한 파일(관리 스크립트, 문서, 테스트, 로컬 개발 설정)만 바뀌었으면 건너뛴다.
#    비교 기준은 마지막으로 배포에 성공한 커밋(없으면 바로 앞 커밋). 비교할 수 없으면 빌드한다.
BASE="${VERCEL_GIT_PREVIOUS_SHA:-HEAD^}"
if git diff --quiet "$BASE" HEAD -- . \
  ':(exclude)scripts' ':(exclude)*.md' ':(exclude)tests' \
  ':(exclude)docker-compose.yml' ':(exclude).env.example'; then
  echo "사이트 코드 변경이 없어 배포를 건너뜁니다."
  exit 0
fi
exit 1
