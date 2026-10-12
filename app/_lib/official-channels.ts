// 예고편을 올린 YouTube 채널이 "배급사·제작사 공식 채널"인지 판별한다.
//
// TMDB의 official 표시는 TMDB 회원이 직접 입력하는 값이라, "예고편 저장소" 같은 개인·모음
// 채널 영상도 official=true로 등록돼 있는 경우가 있다. 그래서 TMDB 표시와 별개로, 영상을 실제로
// 올린 채널(YouTube oEmbed의 author_name/author_url)을 확인해 아래 목록에 있는 채널만 통과시킨다.
// 목록에 없는 채널은 공식이어도 일단 숨긴다(엄격 모드) — 관리자가 상세 페이지 예고편 박스에서
// "채널 공식 허용"을 누르면 TrailerChannelRule에 저장돼 바로 보이게 된다(반대로 "채널 차단"도 가능).

// 채널 이름은 비교 전에 정규화한다(대소문자·띄어쓰기·문장부호 무시). 비슷한 이름의 사칭 채널이
// 통과하지 않도록 "포함"이 아니라 "정확히 같은 이름"만 인정한다.
export function normalizeChannelName(name: string): string {
  return name.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
}

const OFFICIAL_CHANNEL_NAMES: readonly string[] = [
  // ── 국내 배급·투자사 ──
  "CJ ENM Movie", "CJ ENM MOVIE 영화", "CJ ENM 영화", "CJ엔터테인먼트",
  "롯데엔터테인먼트", "LOTTE ENTERTAINMENT", "Lotte Entertainment",
  "쇼박스", "SHOWBOX", "쇼박스 SHOWBOX",
  "NEW", "NEW 뉴", "Next Entertainment World",
  "플러스엠", "플러스엠 엔터테인먼트", "Plus M Entertainment", "메가박스중앙 플러스엠",
  "에이스메이커무비웍스", "ACEMAKER MOVIEWORKS",
  "바른손이앤에이", "BARUNSON E&A",
  "키다리스튜디오", "마인드마크", "스튜디오 디에이치엘",
  "엣나인필름", "찬란", "그린나래미디어", "판씨네마", "영화사 진진", "오드", "AUD",
  "콘텐츠판다", "Contents Panda", "TCO 더콘텐츠온", "NK컨텐츠", "트리플픽쳐스",
  "워터홀컴퍼니", "에스와이코마드", "제이앤씨미디어그룹", "조이앤시네마", "와이드릴리즈",
  "누리픽쳐스", "더쿱디스트리뷰션", "대원미디어", "애니플러스", "CGV ICECON", "CGV아트하우스",
  "디스테이션", "인디스토리", "시네마달", "필름다빈", "영화특별시SMC", "M&M인터내셔널",
  // ── 해외 스튜디오 한국 지사 ──
  "Disney Korea", "디즈니 코리아", "월트디즈니컴퍼니코리아", "Marvel Korea", "마블 코리아",
  "20th Century Studios Korea", "20세기 스튜디오 코리아",
  "Warner Bros. Korea", "워너브러더스 코리아", "워너 브러더스 코리아",
  "Universal Pictures Korea", "유니버설 픽쳐스 코리아", "UPI 코리아",
  "Sony Pictures Korea", "소니픽쳐스 코리아", "소니픽쳐스",
  "Paramount Pictures Korea", "파라마운트 픽쳐스 코리아",
  "Netflix Korea", "넷플릭스 코리아",
  // ── 해외 스튜디오·배급사 본사 ──
  "Walt Disney Studios", "Disney", "Disney Studios", "Marvel Entertainment", "Pixar", "Lucasfilm", "Star Wars",
  "20th Century Studios", "Searchlight Pictures",
  "Warner Bros.", "Warner Bros. Pictures", "Warner Bros. Entertainment", "Warner Bros. UK & Ireland", "DC",
  "Universal Pictures", "Universal Pictures UK", "Illumination", "DreamWorks Animation", "Focus Features",
  "Sony Pictures Entertainment", "Sony Pictures Classics", "Sony Pictures Animation",
  "Paramount Pictures", "Paramount Pictures UK", "Paramount Animation",
  "Lionsgate Movies", "Lionsgate", "A24", "NEON", "MGM", "Amazon MGM Studios", "Prime Video",
  "Netflix", "Apple TV", "Legendary", "Blumhouse", "STUDIOCANAL", "STUDIOCANAL UK",
  "Bleecker Street", "Magnolia Pictures & Magnet Releasing", "IFC Films", "Roadside Attractions", "Angel Studios",
  "Toho", "東宝MOVIEチャンネル", "TOHO animation チャンネル", "スタジオジブリ", "GKIDS", "Crunchyroll",
  "Aniplex", "Toei Animation", "KADOKAWAanime", "Gaumont", "Pathé",
];

const OFFICIAL_NAME_SET = new Set(OFFICIAL_CHANNEL_NAMES.map(normalizeChannelName));

// oEmbed author_url("https://www.youtube.com/@handle", ".../channel/UC…", ".../user/name", ".../c/name")에서
// 채널을 가리키는 고유 키를 뽑는다. 핸들·user·c 이름은 대소문자 구분이 없어 소문자로 통일한다.
export function channelKeyFromUrl(url: unknown): string | null {
  if (typeof url !== "string") return null;
  let path: string;
  try {
    const u = new URL(url);
    if (!/(^|\.)youtube\.com$/.test(u.hostname)) return null;
    path = decodeURIComponent(u.pathname);
  } catch {
    return null;
  }
  const handle = /^\/(@[^/\s?#]{1,100})/.exec(path);
  if (handle) return handle[1].toLowerCase();
  const channel = /^\/channel\/([A-Za-z0-9_-]{1,64})/.exec(path);
  if (channel) return `channel/${channel[1]}`;
  const named = /^\/(user|c)\/([^/\s?#]{1,100})/.exec(path);
  if (named) return `${named[1]}/${named[2].toLowerCase()}`;
  return null;
}

export const CHANNEL_KEY_PATTERN = /^(@[^/\s?#]{1,100}|channel\/[A-Za-z0-9_-]{1,64}|(user|c)\/[^/\s?#]{1,100})$/;

export type ChannelRules = { allowed: Set<string>; blocked: Set<string> };

export type ChannelVerdict = "official" | "unverified" | "channel-blocked";

// 관리자 규칙(차단 > 허용)이 기본 목록보다 우선한다.
export function judgeChannel(channelName: string | null, channelKey: string | null, rules: ChannelRules): ChannelVerdict {
  if (channelKey && rules.blocked.has(channelKey)) return "channel-blocked";
  if (channelKey && rules.allowed.has(channelKey)) return "official";
  if (channelName && OFFICIAL_NAME_SET.has(normalizeChannelName(channelName))) return "official";
  return "unverified";
}
