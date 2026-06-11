/**
 * Sends survey reminder emails to UN entity users.
 *
 * Uses the same Nodemailer transport as the magic-link email system
 * (src/lib/mail.ts). Reads SMTP config from environment variables.
 */

import nodemailer from "nodemailer";

interface ReminderEmailOptions {
  to: string;
  entity: string;
  confirmedReports: number;
}

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.mailbox.org",
    port: parseInt(process.env.SMTP_PORT || "587", 10),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER || "",
      pass: process.env.SMTP_PASS || "",
    },
  });
}

function getBaseUrl(): string {
  return (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
}

function getFromAddress(): string {
  const user = process.env.SMTP_USER || "noreply@example.org";
  return process.env.SMTP_FROM ? `SG Reports Survey <${process.env.SMTP_FROM}>` : `SG Reports Survey <${user}>`;
}

function buildEmailHtml(options: ReminderEmailOptions): string {
  const { entity, confirmedReports, to } = options;
  const dashboardUrl = `${getBaseUrl()}/`;
  const reportWord = confirmedReports === 1 ? "report" : "reports";

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>SG Reports Survey — Action Required</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f7fa; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 40px auto; background: #fff;
      border-radius: 8px; overflow: hidden;
      border: 1px solid #e2e8f0; }
    .header { background: #009edb; color: #fff; padding: 28px 32px 20px; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .header p { margin: 6px 0 0; font-size: 13px; opacity: 0.85; }
    .body { padding: 28px 32px; color: #1a202c; font-size: 15px; line-height: 1.6; }
    .stat-box { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px;
      padding: 16px 20px; margin: 20px 0; }
    .stat-box .number { font-size: 28px; font-weight: 700; color: #0284c7; }
    .stat-box .label { font-size: 13px; color: #64748b; margin-top: 2px; }
    .cta { display: inline-block; background: #009edb; color: #fff !important;
      text-decoration: none; padding: 12px 28px; border-radius: 6px;
      font-weight: 600; font-size: 15px; margin: 8px 0; }
    .footer { padding: 16px 32px; background: #f8fafc;
      border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>United Nations — SG Reports Survey</h1>
      <p>Your input is needed</p>
    </div>
    <div class="body">
      <p>Dear ${entity} colleague,</p>
      <p>
        The Secretary-General Reports Survey is open and your entity’s responses are still pending.
        We would appreciate your input to help shape the future of SG reporting.
      </p>
      <div class="stat-box">
        <div class="number">${confirmedReports}</div>
        <div class="label">report ${reportWord} assigned to ${entity} awaiting your review</div>
      </div>
      <p>
        For each report, you can recommend to
        <strong>continue</strong> (with or without changes to frequency or format),
        <strong>merge</strong> it with another series, or
        <strong>discontinue</strong> it.
      </p>
      <p>
        <a href="${dashboardUrl}" class="cta">Start your review &rarr;</a>
      </p>
      <p style="font-size:13px; color:#64748b;">
        Log in with your institutional email (${to}) to access the survey.
        Your survey responses are saved automatically.
      </p>
    </div>
    <div class="footer">
      You received this email because you are registered as a ${entity} representative
      in the UN SG Reports Survey system. Reply to this email if you have questions.
    </div>
  </div>
</body>
</html>`;
}

function buildEmailText(options: ReminderEmailOptions): string {
  const { entity, confirmedReports } = options;
  const dashboardUrl = `${getBaseUrl()}/`;
  const reportWord = confirmedReports === 1 ? "report" : "reports";
  return [
    `UN SG Reports Survey — Action Required`,
    ``,
    `Dear ${entity} colleague,`,
    ``,
    `The Secretary-General Reports Survey is open and your entity’s responses are pending.`,
    ``,
    `${confirmedReports} ${reportWord} assigned to ${entity} are awaiting your review.`,
    ``,
    `For each report, you can recommend to continue (with or without changes),`,
    `merge it with another series, or discontinue it.`,
    ``,
    `Start your review: ${dashboardUrl}`,
    ``,
    `Log in with your institutional email to access the survey.`,
  ].join("\n");
}

export async function sendReminderEmail(options: ReminderEmailOptions): Promise<void> {
  const transport = createTransport();
  const { to, entity } = options;

  await transport.sendMail({
    from: getFromAddress(),
    to,
    subject: `Action required: ${entity} survey responses pending — SG Reports Survey`,
    text: buildEmailText(options),
    html: buildEmailHtml(options),
  });
}
