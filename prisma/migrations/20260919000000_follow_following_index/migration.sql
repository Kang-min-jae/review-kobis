-- followingId 단독 조회(팔로워 목록, getFollowerCount) 가속용 인덱스
-- @@unique([followerId, followingId])는 첫 번째 컬럼이 고정돼야 효율적이므로
-- followingId 단독 조건에는 이 별도 인덱스가 필요하다.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Follow_followingId_idx" ON "Follow"("followingId");
