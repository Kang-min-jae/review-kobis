import { CONTACT_EMAIL } from "../_lib/site";

// 문의 메일 링크. 주변 회색 글자보다 조금 밝게 + 밑줄로 링크임을 알 수 있게 하고,
// 주소 중간에서 줄이 끊기지 않도록 한 덩어리로 둔다(좁은 화면에선 주소 앞에서 줄바꿈된다).
export default function ContactEmailLink({ className = "" }: { className?: string }) {
  return (
    <a
      href={`mailto:${CONTACT_EMAIL}`}
      className={`whitespace-nowrap text-text/80 underline underline-offset-2 transition-colors hover:text-text ${className}`}
    >
      {CONTACT_EMAIL}
    </a>
  );
}
