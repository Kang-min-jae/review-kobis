// 막을 봇 목록 — 이 파일 한 곳만 고치면 된다. 새 봇은 이름(User-Agent에 들어가는 그대로, 대소문자 포함)을 알맞은
// 목록에 한 줄 넣는다. 쓰는 곳:
//   · next.config.ts — 이 봇들의 요청을 페이지를 만들기 전에 403(/blocked-bot)으로 바꾼다. 페이지를 그리지 않고
//     DB·외부 API도 쓰지 않는다(Vercel Firewall 규칙 수와도 상관없다).
//   · app/robots.ts — robots.txt에서 사이트 전체를 막는다.
//
// 절대 넣지 않는 봇: 구글(Googlebot), 네이버(Yeti), 빙(bingbot), 다음(Daum) 검색봇 — 검색 노출이 사라진다.
// Claude-SearchBot도 넣지 않는다 — 나중에 robots.txt의 Crawl-delay로 속도만 줄여 허용할 수 있게 남겨 둔다.

// 학습용 데이터를 대량으로 긁어 가는 AI 수집봇 — 검색 노출과 무관하고 서버 사용량만 크게 늘린다.
export const AI_TRAINING_BOTS = ["GPTBot", "CCBot", "Bytespider", "ClaudeBot", "meta-externalagent", "Amazonbot"];

// AI 검색 서비스의 수집봇 중 처음 보는 영화 페이지를 하루 수천~수만 건씩 열어 사용량 한도를 넘긴 봇.
// (2026년 11월: PerplexityBot 하루 약 6만 건, Amzn-SearchBot 하루 약 8천 건 — Vercel Firewall에서도 막고 있다.)
export const AI_SEARCH_BOTS = ["PerplexityBot", "Amzn-SearchBot"];

// SEO 분석 도구의 수집봇 — 모든 상세 페이지를 몇 초 간격으로 훑어 서버 함수·DB 전송량·KOBIS 하루 호출 한도를 쓴다.
export const SEO_TOOL_BOTS = ["AhrefsBot", "SemrushBot", "MJ12bot", "DotBot", "PetalBot", "DataForSeoBot", "BLEXBot", "SeekportBot", "serpstatbot", "Barkrowler"];

export const BLOCKED_BOTS = [...AI_TRAINING_BOTS, ...AI_SEARCH_BOTS, ...SEO_TOOL_BOTS];

// User-Agent 문자열에 위 이름 중 하나가 들어 있으면 맞는 정규식(대소문자 구분 — 봇 이름은 정해진 표기로 온다).
export const BLOCKED_BOT_PATTERN = `.*(${BLOCKED_BOTS.map((name) => name.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")).join("|")}).*`;
