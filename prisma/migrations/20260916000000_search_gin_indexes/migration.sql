-- ILIKE '%query%' 전체 테이블 스캔을 없애는 GIN trigram 인덱스
-- pg_trgm 확장이 없으면 자동 생성 후 인덱스를 만든다.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CachedMovie.title: 영화 제목 검색
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CachedMovie_title_idx"
  ON "CachedMovie" USING GIN ("title" gin_trgm_ops);

-- CachedPerson.name: 인물 한글명 검색
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CachedPerson_name_idx"
  ON "CachedPerson" USING GIN ("name" gin_trgm_ops);

-- CachedPerson.nameEn: 인물 영문명 검색 (nameEn이 NULL인 행은 자동 제외)
CREATE INDEX CONCURRENTLY IF NOT EXISTS "CachedPerson_nameEn_idx"
  ON "CachedPerson" USING GIN ("nameEn" gin_trgm_ops);
