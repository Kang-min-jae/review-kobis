// 봇 차단 기준 — 이 파일 한 곳만 고치면 된다(Vercel Firewall 규칙과 같은 기준).
//
// 쓰는 곳:
//   · proxy.ts(미들웨어) — User-Agent에 BLOCK_WORDS가 들어 있으면 페이지를 만들기 전에 403을 돌려준다.
//     ALLOWED_BOTS(검색엔진·링크 미리보기)는 그보다 먼저 확인해 통과시킨다. DB·세션·외부 API는 쓰지 않는다.
//   · app/robots.ts — ROBOTS_DISALLOWED_BOTS는 robots.txt에서 사이트 전체를 막는다.
//
// 2026년 11월: 이름을 하나씩 막는 방식으로는 새 봇(ElevenlabsCrawler, SERankingBacklinksBot, Dataprovider.com …)이
// 올 때마다 처음 보는 영화 페이지를 차례로 열어 서버 함수·DB(Neon)를 하루 종일 깨웠다. 그래서 "봇이면 일단
// 막고, 필요한 봇만 허용"으로 바꿨다.

// 절대 막지 않는 봇 — User-Agent에 이 이름이 들어 있으면(대소문자 무시) 통과시킨다.
// 새로 허용할 봇은 여기에 이름을 한 줄 넣는다.
export const ALLOWED_BOTS = [
  // 검색엔진
  "Googlebot",
  "Google-InspectionTool",
  "AdsBot-Google",
  "Mediapartners-Google",
  "Storebot-Google",
  "Yeti", // 네이버
  "bingbot",
  "Daum",
  // 링크 미리보기(메신저·SNS에 주소를 붙였을 때 제목·이미지를 가져간다)
  "facebookexternalhit", // 페이스북·인스타그램
  "kakaotalk-scrap",
  "Twitterbot",
  "Slackbot",
  "Discordbot",
  "TelegramBot",
  "LinkedInBot",
];

// User-Agent에 이 단어가 들어 있으면(대소문자 무시) 막는다. 영문 소문자·숫자·하이픈만 쓴다.
// 바꾸면 proxy.ts의 matcher 조건도 같이 바꾼다(빌드 때 글자 그대로 읽혀 변수로 넣을 수 없다 —
// tests/bots.test.ts가 둘이 같은지 확인한다).
export const BLOCK_WORDS = ["bot", "crawl", "spider", "scraper", "python-requests", "curl", "go-http-client"];

// 이 요청을 막아야 하는지 — 허용 목록을 먼저 본다.
export function isBlockedUserAgent(userAgent: string | null | undefined): boolean {
  if (!userAgent) return false;
  const ua = userAgent.toLowerCase();
  if (ALLOWED_BOTS.some((name) => ua.includes(name.toLowerCase()))) return false;
  return BLOCK_WORDS.some((word) => ua.includes(word));
}

// proxy.ts matcher의 user-agent 조건(정규식) — 차단 단어가 하나라도 들어 있는 요청에서만 미들웨어가 돌게 한다.
// 대소문자를 가리지 않게 글자마다 [bB]처럼 쓴다. 허용 봇도 "bot"이 들어 있으면 미들웨어까지는 오고, 거기서 통과한다.
export const BLOCK_WORDS_MATCHER = `.*(${BLOCK_WORDS.map((word) =>
  [...word].map((ch) => (/[a-z]/.test(ch) ? `[${ch}${ch.toUpperCase()}]` : ch)).join(""),
).join("|")}).*`;

// robots.txt에서 사이트 전체를 막는 봇 — 규칙을 지키는 봇은 여기서 먼저 돌아간다.
// 학습용 데이터를 대량으로 긁어 가는 AI 수집봇
export const AI_TRAINING_BOTS = ["GPTBot", "CCBot", "Bytespider", "ClaudeBot", "meta-externalagent", "Amazonbot"];
// AI 검색·수집 서비스의 봇 — 처음 보는 영화 페이지를 하루 수천~수만 건씩 열어 사용량 한도를 넘겼다.
export const AI_SEARCH_BOTS = ["Claude-SearchBot", "PerplexityBot", "Amzn-SearchBot", "ExaSearchBot", "ElevenlabsCrawler", "Dataprovider"];
// SEO 분석 도구의 수집봇 — 검색 노출과 무관하게 모든 상세 페이지를 몇 초 간격으로 훑는다.
export const SEO_TOOL_BOTS = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "PetalBot", "DataForSeoBot", "BLEXBot", "SeekportBot", "serpstatbot", "Barkrowler", "SERankingBacklinksBot"];

export const ROBOTS_DISALLOWED_BOTS = [...AI_TRAINING_BOTS, ...AI_SEARCH_BOTS, ...SEO_TOOL_BOTS];
