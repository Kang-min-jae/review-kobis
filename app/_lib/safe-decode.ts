// 주소 조각을 디코딩한다. "%"가 잘못 들어간 주소(예: /people/100%)면 decodeURIComponent가
// URIError를 던져 페이지가 500으로 끝나므로, 그럴 땐 받은 값을 그대로 쓴다.
export function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
