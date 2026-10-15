// 관리자 예고편 직접 추가 — YouTube 주소 해석 단위 테스트 — npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseYouTubeVideoKey } from "../app/_lib/official-channels";

test("여러 형태의 YouTube 주소에서 영상 ID를 뽑는다", () => {
  for (const input of [
    "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtube.com/watch?v=dQw4w9WgXcQ&t=10s",
    "https://m.youtube.com/watch?v=dQw4w9WgXcQ",
    "https://youtu.be/dQw4w9WgXcQ?si=abc",
    "https://www.youtube.com/shorts/dQw4w9WgXcQ",
    "https://www.youtube.com/embed/dQw4w9WgXcQ",
    "www.youtube.com/watch?v=dQw4w9WgXcQ",
    "dQw4w9WgXcQ",
  ]) {
    assert.equal(parseYouTubeVideoKey(input), "dQw4w9WgXcQ", input);
  }
});

test("YouTube가 아니거나 형식이 틀리면 null", () => {
  for (const input of ["", "https://vimeo.com/123", "https://www.youtube.com/@cjenmmovie", "https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ", "javascript:alert(1)"]) {
    assert.equal(parseYouTubeVideoKey(input), null, input);
  }
});
