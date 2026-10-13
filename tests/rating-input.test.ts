// 평점 가능 ID 판단 단위 테스트 — npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { isRatableMovieId, rateHrefFor } from "../app/_lib/rating-input";

test("서버가 평점을 받는 ID 형식은 모두 평점 가능", () => {
  for (const id of ["kobis-20240001", "tmdb-1233413", "tmdb-tv-1399", "kmdb-F36255", "wikidata-Q123", "wikidata-Q123-남우주연상"]) {
    assert.equal(isRatableMovieId(id), true, id);
  }
});

test("알 수 없는 형식은 평점 준비중", () => {
  for (const id of ["", "20240001", "kobis-abc", "tmdb-", "wikidata-abc", "unknown-1"]) {
    assert.equal(isRatableMovieId(id), false, id);
  }
});

test("시리즈는 /series, 나머지는 /movies 평점 페이지", () => {
  assert.equal(rateHrefFor("tmdb-tv-1399"), "/series/tmdb-tv-1399/rate");
  assert.equal(rateHrefFor("wikidata-Q123"), "/movies/wikidata-Q123/rate");
  assert.equal(rateHrefFor("kobis-1"), "/movies/kobis-1/rate");
});
