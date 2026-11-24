// 로그인 쿠키 없는 요청이 받는 공용 캐시 페이지(app/anon/**/page.tsx)는 force-static이어야 한다(아래 예외 하나).
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

// 예외: 항목별 평점 페이지(…/rate/item/[category])는 봇이 주소를 대량으로 긁어 ISR 쓰기가 폭증해서 ISR에 저장하지
// 않는다(force-dynamic, revalidate 없음). 대신 next.config.ts의 headers()가 CDN 캐시 헤더를 붙인다.
const isCategoryPage = (page: string) => /[\\/]rate[\\/]item[\\/]\[category\][\\/]page\.tsx$/.test(page);

test("항목별 평점 공용 페이지가 영화·시리즈 둘 다 있다", () => {
  assert.equal(pages.filter(isCategoryPage).length, 2);
});

for (const page of pages) {
  test(`${page}: ${isCategoryPage(page) ? "ISR에 저장하지 않는다" : "force-static이고 캐시 주기가 있다"}`, () => {
    // 주석은 빼고 코드만 본다(주석에 설명으로 적힌 cookies() 같은 말에 걸리지 않게).
    const source = readFileSync(page, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    if (isCategoryPage(page)) {
      assert.match(source, /export const dynamic = "force-dynamic";/, "export const dynamic = \"force-dynamic\"; 이 없다");
      assert.doesNotMatch(source, /export const (revalidate|dynamicParams)\b|generateStaticParams/, "ISR 설정이 있다");
      assert.match(source, /categoryPage: true/, "검색 제외(noindex) 표시가 없다");
    } else {
      assert.match(source, /export const dynamic = "force-static";/, "export const dynamic = \"force-static\"; 이 없다");
      assert.match(source, /export const revalidate = \d+;/, "export const revalidate = <초>; 가 없다");
    }
    // 공용 페이지에서 로그인 정보·요청 정보를 직접 읽으면 안 된다(force-static이면 빈 값이 되지만, 의도를 분명히).
    assert.doesNotMatch(source, /\b(cookies|headers|connection|draftMode)\(\)|\bauth\(\)/, "요청마다 달라지는 정보를 읽는다");
    assert.doesNotMatch(source, /searchParams/, "searchParams를 읽는다");
  });
}

// 비로그인 항목별 평점 주소는 ISR에 저장하지 않는 경로로 가고, CDN 캐시 헤더는 비로그인 요청에만 붙는다.
test("항목별 평점 주소: 비로그인만 item 경로 + CDN 캐시 헤더, 대표 페이지(/rate)는 ISR 그대로", async () => {
  const { default: config } = await import("../next.config");
  const rewrites = await config.rewrites!();
  const beforeFiles = (Array.isArray(rewrites) ? rewrites : rewrites.beforeFiles) ?? [];
  const headers = await config.headers!();
  for (const section of ["movies", "series"]) {
    const category = beforeFiles.find((r) => r.source === `/${section}/:id/rate/category/:category` && r.missing);
    assert.equal(category?.destination, `/anon/${section}/:id/rate/item/:category`);
    const main = beforeFiles.find((r) => r.source === `/${section}/:id/rate` && r.missing);
    assert.match(main?.destination ?? "", new RegExp(`^/anon/${section}/:id/rate/category/`));
    const header = headers.find((h) => h.source === `/${section}/:id/rate/category/:category`);
    assert.deepEqual(header?.headers, [{ key: "Cache-Control", value: "public, s-maxage=3600, stale-while-revalidate=86400" }]);
    assert.deepEqual(header?.missing, category?.missing, "로그인 쿠키 조건이 rewrite와 같아야 한다");
    assert.ok(!headers.some((h) => h.source === `/${section}/:id/rate`), "대표 페이지에는 헤더를 붙이지 않는다");
  }
});
