import { CONTACT_EMAIL } from "../_lib/site";

// 문의 메일 주소 표시(클릭 기능 없음 — 글자만, 복사는 가능). 주변 회색 글자보다 조금 밝게 하고,
// 주소 중간에서 줄이 끊기지 않도록 한 덩어리로 둔다(좁은 화면에선 주소 앞에서 줄바꿈된다).
export default function ContactEmail({ className = "" }: { className?: string }) {
  return <span className={`whitespace-nowrap text-text/80 ${className}`}>{CONTACT_EMAIL}</span>;
}
