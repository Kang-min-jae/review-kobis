// 포스터 주소 변환 단위 테스트 — npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { posterLoader, posterSrc } from "../app/_lib/poster-loader";

test("KMDb 포스터는 우리 서버 중계 주소로 바뀐다(http·https 모두)", () => {
  assert.equal(posterSrc("http://file.koreafilm.or.kr/thm/02/00/01/46/tn_DPK0001.jpg"), "/api/poster/kmdb/thm/02/00/01/46/tn_DPK0001.jpg");
  assert.equal(posterSrc("https://file.koreafilm.or.kr/thm/02/x.JPG"), "/api/poster/kmdb/thm/02/x.JPG");
  assert.equal(posterLoader({ src: "http://file.koreafilm.or.kr/thm/a.jpg", width: 384 }), "/api/poster/kmdb/thm/a.jpg");
});

test("TMDB 포스터는 크기만 바꾸고, 그 밖의 주소는 그대로", () => {
  assert.equal(posterLoader({ src: "https://image.tmdb.org/t/p/w500/abc.jpg", width: 128 }), "https://image.tmdb.org/t/p/w185/abc.jpg");
  assert.equal(posterSrc("/images/hero-theater.webp"), "/images/hero-theater.webp");
  assert.equal(posterSrc("https://evil.example/file.koreafilm.or.kr/x.jpg"), "https://evil.example/file.koreafilm.or.kr/x.jpg");
});
