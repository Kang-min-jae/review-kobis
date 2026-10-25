// 시리즈 여부와 상세 페이지 주소는 rating-input.ts의 함수 하나로만 정한다. 예전엔 컴포넌트마다 같은 조건식을
// 따로 써서, 일부만 고쳐졌을 때 시리즈 링크가 /movies로 깨졌다(실제로 있었다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { isSeriesCd, rateCategoryBase, rateHrefFor } from "../app/_lib/rating-input";

test("시리즈 판단과 평점 페이지 주소", () => {
  assert.equal(isSeriesCd("tmdb-tv-1399"), true);
  assert.equal(isSeriesCd("tmdb-1399"), false);
  assert.equal(isSeriesCd("kobis-20231234"), false);
  assert.equal(rateHrefFor("tmdb-tv-1399"), "/series/tmdb-tv-1399/rate");
  assert.equal(rateHrefFor("kobis-20231234"), "/movies/kobis-20231234/rate");
  assert.equal(rateCategoryBase("tmdb-tv-1399"), "/series/tmdb-tv-1399/rate/category");
  assert.equal(rateCategoryBase("tmdb-603"), "/movies/tmdb-603/rate/category");
});

test("시리즈 ID 접두사를 직접 검사하는 곳이 rating-input.ts 밖에 없다", () => {
  const hits = execFileSync("git", ["grep", "-n", 'startsWith("tmdb-tv-")', "--", "app"], { encoding: "utf8" }).trim().split("\n");
  assert.deepEqual(hits.filter((h) => !h.startsWith("app/_lib/rating-input.ts:")), []);
});
