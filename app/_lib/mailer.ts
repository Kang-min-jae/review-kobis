import nodemailer from "nodemailer";

// 비밀번호 재설정 메일 발송용. SMTP 정보(.env의 EMAIL_SERVER_*)가 없으면 실제로
// 보내는 대신 링크를 서버 콘솔에 찍어서, 이메일 서버 없이도 로컬에서 흐름을
// 테스트할 수 있게 한다 — KMDB_API_KEY 등 다른 외부 키들과 같은 패턴("키 없으면
// 조용히 대체 동작").
function transporter() {
  const host = process.env.EMAIL_SERVER_HOST;
  const port = process.env.EMAIL_SERVER_PORT;
  const user = process.env.EMAIL_SERVER_USER;
  const pass = process.env.EMAIL_SERVER_PASSWORD;
  if (!host || !port || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
}

export async function sendPasswordResetEmail(to: string, resetUrl: string) {
  const transport = transporter();
  const from = process.env.EMAIL_FROM || "no-reply@localhost";

  if (!transport) {
    console.warn(
      `[mailer] EMAIL_SERVER_* 환경변수가 없어 실제 메일을 보내지 않았습니다. ` +
        `아래 링크를 직접 열어 비밀번호를 재설정하세요:\n  ${resetUrl}`
    );
    return;
  }

  await transport.sendMail({
    from,
    to,
    subject: "[무비리뷰] 비밀번호 재설정",
    text: `아래 링크에서 비밀번호를 재설정하세요 (1시간 내 유효):\n${resetUrl}`,
    html: `<p>아래 링크에서 비밀번호를 재설정하세요 (1시간 내 유효):</p><p><a href="${resetUrl}">${resetUrl}</a></p>`,
  });
}
