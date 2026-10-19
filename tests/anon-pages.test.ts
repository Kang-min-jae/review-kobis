// 로그인 쿠키 없는 요청이 받는 공용 캐시 페이지(app/anon/**/page.tsx)는 모두 force-static이어야 한다.
// 빠지면 렌더 중 외부 API를 부르는 cache: "no-store" fetch(예고편·TMDB·KMDb·KOBIS·Wikidata) 하나로
// "Page changed from static to dynamic at runtime" 오류가 나서 비로그인 방문이 전부 500이 된다(실제로 있었다).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

function findPages(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return findPages(path);
    return name === "page.tsx" ? [path] : [];
  });
}

const pages = findPages("app/anon");

test("공용 캐시 페이지가 하나 이상 있다", () => {
  assert.ok(pages.length >= 4, `app/anon 아래 page.tsx: ${pages.length}개`);
});

for (const page of pages) {
  test(`${page}: force-static이고 캐시 주기가 있다`, () => {
    // 주석은 빼고 코드만 본다(주석에 설명으로 적힌 cookies() 같은 말에 걸리지 않게).
    const source = readFileSync(page, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.match(source, /export const dynamic = "force-static";/, "export const dynamic = \"force-static\"; 이 없다");
    assert.match(source, /export const revalidate = \d+;/, "export const revalidate = <초>; 가 없다");
    // 공용 페이지에서 로그인 정보·요청 정보를 직접 읽으면 안 된다(force-static이면 빈 값이 되지만, 의도를 분명히).
    assert.doesNotMatch(source, /\b(cookies|headers|connection|draftMode)\(\)|\bauth\(\)/, "요청마다 달라지는 정보를 읽는다");
    assert.doesNotMatch(source, /searchParams/, "searchParams를 읽는다");
  });
}
