// 성인물 판정 규칙(app/_lib/adult-content.ts) — 성인물은 걸리고 정상 청소년관람불가 영화는 남아야 한다.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adultContentReason,
  isAdultContent,
  isListableMovie,
  meetsRecommendationQuality,
  ADULT_KEYWORD_MAX_TMDB_VOTES,
} from "../app/_lib/adult-content";

test("TMDB adult: true", () => {
  assert.equal(adultContentReason({ title: "Secretaries in Heat 2", tmdbAdult: true }), "tmdb-adult");
});

test("KOBIS 성인물(에로)·KMDb 에로 장르 — 저장된 장르가 TMDB 장르로 덮였어도 출처별 장르로 잡는다", () => {
  assert.match(adultContentReason({ title: "젊은 아내의 비밀", genreAlt: "드라마", genres: ["성인물(에로),드라마"] }) ?? "", /^genre:/);
  assert.match(adultContentReason({ title: "어떤 영화", genres: [null, "에로"] }) ?? "", /^genre:/);
});

test("제한상영가", () => {
  assert.equal(adultContentReason({ title: "금지된 계약", watchGrade: "제한상영가" }), "grade:제한상영가");
});

test("성인물 제작사(대소문자·문장부호 무시, 단어 단위 앞부분)", () => {
  assert.equal(adultContentReason({ title: "Stars : French Touch", companies: ["Marc Dorcel"] }), "company:Marc Dorcel");
  assert.equal(adultContentReason({ title: "Stepping Into Sin 5", companies: ["Nubiles Films"] }), "company:Nubiles Films");
  assert.equal(adultContentReason({ title: "x", companies: ["Nubiles.net"] }), "company:Nubiles.net");
  // 이름 일부만 같은 일반 회사는 걸리지 않는다
  assert.equal(adultContentReason({ title: "x", companies: ["Vixenwood Studios", "Privateer Pictures"] }), null);
});

test("성인물 키워드 — 널리 알려진(투표 많은) 영화는 키워드만으로 거르지 않는다", () => {
  assert.equal(adultContentReason({ title: "La sera a Roma", keywords: ["softcore"], tmdbVoteCount: 4 }), "keyword:softcore");
  assert.equal(adultContentReason({ title: "La sera a Roma", keywords: ["Erotic Movie"], tmdbVoteCount: null }), "keyword:Erotic Movie");
  assert.equal(adultContentReason({ title: "아가씨", keywords: ["erotic movie", "lesbian"], tmdbVoteCount: 3000 }), null);
  assert.equal(adultContentReason({ title: "x", keywords: ["erotic thriller"], tmdbVoteCount: 1 }), null);
  assert.ok(ADULT_KEYWORD_MAX_TMDB_VOTES > 0);
});

test("정상 청소년관람불가 영화는 성인물이 아니고 메인에도 남는다", () => {
  for (const movie of [
    { title: "아가씨", genreAlt: "드라마,스릴러,로맨스", watchGrade: "청소년관람불가", tmdbVoteCount: 3000 },
    { title: "신세계", genreAlt: "범죄,드라마", watchGrade: "청소년관람불가", tmdbVoteCount: 1500 },
    { title: "올드보이", genreAlt: "미스터리,스릴러", watchGrade: "18세관람가", tmdbVoteCount: 8000 },
  ]) {
    assert.equal(isAdultContent(movie), false, movie.title);
    assert.equal(isListableMovie({ ...movie, posterUrl: "https://x/p.jpg" }), true, movie.title);
  }
});

test("메인·추천 카드: 포스터 없음, 이름 없는 청불(투표 아주 적음), 관리자 숨김은 뺀다", () => {
  const base = { movieCd: "20259004", title: "어느 밤의 손님", genreAlt: "스릴러", posterUrl: "https://x/p.jpg" };
  assert.equal(isListableMovie(base), true);
  assert.equal(isListableMovie({ ...base, posterUrl: null }), false);
  assert.equal(isListableMovie({ ...base, watchGrade: "청소년관람불가", tmdbVoteCount: 2 }), false);
  assert.equal(isListableMovie({ ...base, watchGrade: "청소년관람불가", tmdbVoteCount: null }), true); // 모르면 남긴다
  assert.equal(isListableMovie(base, new Set(["20259004"])), false);
});

test("추천 최소 품질 — TMDB 투표 수 또는 사이트 평점", () => {
  assert.equal(meetsRecommendationQuality(3, 0), false);
  assert.equal(meetsRecommendationQuality(3, 1), true);
  assert.equal(meetsRecommendationQuality(50, 0), true);
  assert.equal(meetsRecommendationQuality(null, 0), true); // 아직 판정 전이면 통과
});
