// localStorage 쓰기는 저장 공간이 가득 찼거나(QuotaExceededError) 브라우저가 저장을 막은
// 경우(사파리 개인정보 보호 모드·사이트 데이터 차단) 예외를 던진다. 화면을 그리는 도중이나
// 평점 저장 흐름 한가운데서 이 예외가 올라가면 페이지가 깨지므로, 실패는 경고만 남기고
// 메모리 상태로 계속 동작하게 한다.
export function safeSetItem(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`[storage] "${key}" 저장 실패:`, error);
    return false;
  }
}
