import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

// Neon 서버리스 드라이버 설정 — 사이트(db.ts)와 관리 스크립트(scripts/*.mts)가 같이 쓴다.

export function databaseHost(url: string | undefined): string {
  try {
    return new URL(url ?? "").hostname;
  } catch {
    return "";
  }
}

export function isLocalDatabase(url: string | undefined): boolean {
  return ["localhost", "127.0.0.1", "[::1]", "::1"].includes(databaseHost(url));
}

// announce: 관리 스크립트용 — 어느 DB에 붙는지 실행할 때마다 알려 준다(운영 DB에서 실수로 돌리지 않게).
export function configureNeon(url: string | undefined, { announce = false }: { announce?: boolean } = {}): void {
  // Neon의 서버리스 드라이버는 웹소켓으로 붙는데, 브라우저와 달리 Node.js에는 전역
  // WebSocket이 없어서 직접 구현체를 넣어줘야 한다 (Prisma+Neon 공식 가이드 그대로).
  // 이걸 빼먹으면 접속 시도가 그냥 빈 ErrorEvent로 실패한다.
  neonConfig.webSocketConstructor = ws;

  // 로컬 개발 DB(docker-compose.yml의 Postgres) — Neon 드라이버는 Postgres에 바로 붙지 못하고 웹소켓 중계기
  // (Neon 공식 wsproxy, 5433번 포트)를 거친다. Neon 문서의 로컬 개발 설정 그대로다.
  if (isLocalDatabase(url)) {
    const proxyPort = process.env.LOCAL_DB_WSPROXY_PORT ?? "5433";
    neonConfig.wsProxy = (host) => `${host}:${proxyPort}/v1`;
    neonConfig.useSecureWebSocket = false;
    neonConfig.pipelineTLS = false;
    neonConfig.pipelineConnect = false;
  }

  if (announce) {
    const host = databaseHost(url) || "(DATABASE_URL 없음)";
    console.error(isLocalDatabase(url) ? `[db] 로컬 DB(${host})에 연결합니다.` : `[db] ⚠ 원격 DB(${host})에 연결합니다 — 운영 DB라면 전송량이 사용량에 잡혀요.`);
  }
}
