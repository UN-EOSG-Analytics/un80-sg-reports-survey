import nodemailer from "nodemailer";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

function createTransport() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.mailbox.org",
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

export async function sendMagicLink(email: string, token: string) {
  const transport = createTransport();
  const url = `${BASE_URL}/verify?token=${token}`;
  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: "Sign in to SG Reports Survey",
    text: `Click the link below to sign in:\n\n${url}\n\nThis link expires in 15 minutes.`,
    html: `
      <p>Click the link below to sign in to the SG Reports Survey:</p>
      <p><a href="${url}" style="background:#009edb;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;display:inline-block">Sign In</a></p>
      <p style="color:#666;font-size:0.9em">Or copy this link: ${url}</p>
      <p style="color:#666;font-size:0.9em">This link expires in 15 minutes.</p>
    `,
  });
}

export interface DigestEntityRow {
  entity: string;
  confirmedReports: number;
  reportsWithResponse: number;
  userCount: number;
}

export interface ProgressDigestData {
  totalGroups: number;
  respondedGroups: number;
  totalResponses: number;
  coveragePct: number;
  notStartedEntities: Array<{
    entity: string;
    confirmedReports: number;
    userCount: number;
  }>;
  allEntities: DigestEntityRow[];
  generatedAt: string;
}

/**
 * Send a survey progress digest email to an admin.
 * Shows overall coverage, entities that haven't started, and a full entity table.
 */
export async function sendProgressDigest(
  recipientEmail: string,
  data: ProgressDigestData
): Promise<void> {
  const transport = createTransport();

  const entityTableRows = data.allEntities
    .map((e) => {
      const pct =
        e.confirmedReports > 0
          ? Math.round((e.reportsWithResponse / e.confirmedReports) * 100)
          : 0;
      const statusEmoji =
        pct === 100 ? "✅" : pct > 0 ? "🔄" : e.confirmedReports > 0 ? "⏳" : "—";
      return `<tr>
        <td style="padding:6px 12px;border-bottom:1px solid #eee">${e.entity}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${statusEmoji}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${e.reportsWithResponse} / ${e.confirmedReports}</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${pct}%</td>
        <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">${e.userCount}</td>
      </tr>`;
    })
    .join("\n");

  const notStartedHtml =
    data.notStartedEntities.length > 0
      ? `<p><strong>Entities with confirmed reports but no submissions yet (${data.notStartedEntities.length}):</strong></p>
         <ul>${data.notStartedEntities.map((e) => `<li>${e.entity} — ${e.confirmedReports} reports, ${e.userCount} registered user(s)</li>`).join("")}</ul>`
      : "<p>All entities with confirmed reports have submitted at least one response.</p>";

  const analysisUrl = `${BASE_URL}/analysis`;

  const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family:Arial,sans-serif;color:#333;max-width:700px;margin:0 auto">
      <div style="background:#009edb;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="color:white;margin:0;font-size:1.4em">SG Reports Survey — Progress Digest</h1>
        <p style="color:rgba(255,255,255,0.8);margin:4px 0 0">${new Date(data.generatedAt).toUTCString()}</p>
      </div>

      <div style="background:#f9fafb;padding:20px 24px;border:1px solid #e5e7eb;border-top:none">

        <!-- Coverage headline -->
        <div style="display:flex;gap:24px;flex-wrap:wrap;margin-bottom:16px">
          <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;flex:1;min-width:140px">
            <p style="margin:0;font-size:0.75em;color:#6b7280;text-transform:uppercase;font-weight:600">Coverage</p>
            <p style="margin:4px 0 0;font-size:2em;font-weight:700;color:#009edb">${data.coveragePct}%</p>
            <p style="margin:2px 0 0;font-size:0.8em;color:#9ca3af">${data.respondedGroups} / ${data.totalGroups} report groups</p>
          </div>
          <div style="background:white;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;flex:1;min-width:140px">
            <p style="margin:0;font-size:0.75em;color:#6b7280;text-transform:uppercase;font-weight:600">Total Responses</p>
            <p style="margin:4px 0 0;font-size:2em;font-weight:700;color:#111">${data.totalResponses}</p>
            <p style="margin:2px 0 0;font-size:0.8em;color:#9ca3af">survey submissions</p>
          </div>
        </div>

        <!-- Not started -->
        ${notStartedHtml}

        <!-- Entity table -->
        <h2 style="font-size:1em;margin:20px 0 8px">Entity Progress</h2>
        <table style="width:100%;border-collapse:collapse;font-size:0.85em">
          <thead>
            <tr style="background:#f3f4f6;text-align:left">
              <th style="padding:8px 12px">Entity</th>
              <th style="padding:8px 12px;text-align:center">Status</th>
              <th style="padding:8px 12px;text-align:right">Responses</th>
              <th style="padding:8px 12px;text-align:right">Progress</th>
              <th style="padding:8px 12px;text-align:right">Users</th>
            </tr>
          </thead>
          <tbody>
            ${entityTableRows}
          </tbody>
        </table>

        <p style="margin-top:20px">
          <a href="${analysisUrl}" style="background:#009edb;color:white;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold">View Full Analysis</a>
        </p>
      </div>
    </body>
    </html>
  `;

  const textLines = [
    `SG Reports Survey - Progress Digest`,
    `Generated: ${data.generatedAt}`,
    ``,
    `Coverage: ${data.coveragePct}% (${data.respondedGroups}/${data.totalGroups} report groups)`,
    `Total responses: ${data.totalResponses}`,
    ``,
    data.notStartedEntities.length > 0
      ? `Entities not started (${data.notStartedEntities.length}): ${data.notStartedEntities.map((e) => e.entity).join(", ")}`
      : "All entities with confirmed reports have submitted responses.",
    ``,
    `Full analysis: ${analysisUrl}`,
  ];

  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: recipientEmail,
    subject: `SG Reports Survey — Progress Digest (${data.coveragePct}% coverage)`,
    text: textLines.join("\n"),
    html,
  });
}
