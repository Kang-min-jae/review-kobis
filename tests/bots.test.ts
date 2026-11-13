// 봇 차단 기준(app/_lib/bots.ts) — 검색엔진·링크 미리보기 봇은 절대 막히지 않고, 그 밖의 봇은 막힌다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALLOWED_BOTS, BLOCK_WORDS, BLOCK_WORDS_MATCHER, isBlockedUserAgent } from "../app/_lib/bots";

test("막을 봇·도구는 걸린다", () => {
  for (const ua of [
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; PerplexityBot/1.0; +https://perplexity.ai/perplexitybot)",
    "Mozilla/5.0 (compatible; Amzn-SearchBot/0.1) Chrome/119.0.6045.214 Safari/537.36",
    "Mozilla/5.0 (compatible; ExaSearchBot/1.0; +https://exa.ai/bot)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; GPTBot/1.2; +https://openai.com/gptbot)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; ClaudeBot/1.0; +claudebot@anthropic.com)",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0; +Searchbot@anthropic.com)",
    "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)",
    "ElevenlabsCrawler/1.0",
    "Mozilla/5.0 (compatible; SERankingBacklinksBot/1.0; +https://seranking.com/backlinks-crawler)",
    "Mozilla/5.0 (compatible; Dataprovider.com)  crawler",
    "Mozilla/5.0 (compatible; SomeNewSPIDER/2.0)",
    "python-requests/2.32.3",
    "curl/8.5.0",
    "Go-http-client/2.0",
    "Scrapy/2.11 (+https://scrapy.org) scraper",
  ]) {
    assert.ok(isBlockedUserAgent(ua), ua);
  }
});

test("검색엔진·링크 미리보기 봇과 사람의 브라우저는 걸리지 않는다", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (Linux; Android 6.0.1; Nexus 5X Build/MMB29P) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.6778.204 Mobile Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; Google-InspectionTool/1.0;)",
    "AdsBot-Google (+http://www.google.com/adsbot.html)",
    "Mediapartners-Google",
    "Mozilla/5.0 (X11; Linux x86_64; Storebot-Google/1.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.88 Safari/537.36",
    "Mozilla/5.0 (compatible; Yeti/1.1; +https://naver.me/spd)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (compatible; Daum/4.1; +http://cs.daum.net/faq/15/4118.html?faqId=28966)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/t/scrap/33984",
    "Twitterbot/1.0",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "TelegramBot (like TwitterBot)",
    "LinkedInBot/1.0 (compatible; Mozilla/5.0; Apache-HttpClient +http://www.linkedin.com)",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "vercel-cron/1.0",
    "",
  ]) {
    assert.ok(!isBlockedUserAgent(ua), ua);
  }
  assert.equal(isBlockedUserAgent(null), false);
});

test("미들웨어 matcher의 user-agent 조건이 차단 단어 목록과 같다", () => {
  // matcher는 빌드 때 글자 그대로 읽혀 변수를 쓸 수 없다 — 목록을 바꾸고 proxy.ts를 안 고치면 여기서 걸린다.
  const proxy = readFileSync("proxy.ts", "utf8");
  assert.ok(proxy.includes(`value: "${BLOCK_WORDS_MATCHER}"`), "proxy.ts의 matcher를 BLOCK_WORDS_MATCHER와 같게 고쳐 주세요");
  // matcher에 걸리지 않으면 미들웨어가 아예 돌지 않는다 — 차단 단어가 든 요청은 모두 걸려야 한다.
  const matcher = new RegExp(`^${BLOCK_WORDS_MATCHER}$`);
  for (const word of BLOCK_WORDS) assert.ok(matcher.test(`x ${word.toUpperCase()} y`) && matcher.test(`x ${word} y`), word);
  // 허용 봇 이름에는 차단 단어 말고 따로 조건이 필요 없다(미들웨어 안에서 먼저 통과시킨다).
  assert.ok(ALLOWED_BOTS.length > 0);
});
