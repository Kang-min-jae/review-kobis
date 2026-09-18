import { Resend } from "resend";

// RESEND_API_KEY 없으면 실제 발송 대신 콘솔에 출력 — 로컬 개발 및
// 이메일 없이 가입한 계정에서 비밀번호 찾기 흐름을 테스트할 때 유용하다.
function getResend(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn("[mailer] RESEND_API_KEY 환경변수가 없어 실제 메일을 보내지 않습니다.");
    return null;
  }
  return new Resend(key);
}

const FROM = process.env.EMAIL_FROM || "onboarding@resend.dev";

export async function sendPasswordResetCodeEmail(to: string, code: string) {
  const resend = getResend();

  if (!resend) {
    console.warn(`[mailer] 인증 코드 (개발용 콘솔 출력): ${code}`);
    return;
  }

  const { error } = await resend.emails.send({
    from: FROM,
    to: [to],
    subject: "[무비리뷰] 비밀번호 재설정 인증 코드",
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;background:#18181b;color:#fff;border-radius:12px">
        <h2 style="color:#f43f5e;margin-bottom:16px">비밀번호 재설정 인증 코드</h2>
        <p style="color:#e4e4e7;line-height:1.5">비밀번호 재설정을 위해 아래 6자리 인증 코드를 입력해 주세요.</p>
        <div style="background:#27272a;padding:16px;border-radius:8px;text-align:center;margin:24px 0">
          <span style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#38bdf8">${code}</span>
        </div>
        <p style="font-size:13px;color:#71717a">
          * 이 코드는 10분 후 만료됩니다.<br/>
          * 본인이 요청하지 않은 경우 이 메일을 무시하세요.
        </p>
      </div>
    `,
  });

  if (error) {
    console.error("[mailer] 인증 메일 발송 실패:", error);
    throw new Error("이메일 발송에 실패했어요. 잠시 후 다시 시도해 주세요.");
  }
}
