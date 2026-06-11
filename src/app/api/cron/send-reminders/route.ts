/**
 * Cron: Send survey reminder emails
 *
 * Sends one reminder email per eligible user (at most once every
 * REMINDER_INTERVAL_DAYS days) to users whose entity has:
 *   - confirmed reports (reports the entity is responsible for), AND
 *   - zero survey responses submitted so far
 *
 * The cron should be scheduled weekly, e.g. every Monday at 8 AM UTC.
 * Vercel cron expression: `0 8 * * 1`
 *
 * Authentication: requires the `CRON_SECRET` header (Bearer token),
 * matching the CRON_SECRET environment variable.
 *
 * Rate-limit state is tracked in the `reminder_sent_at` column on the
 * `users` table (added by sql/migrations/add_reminder_sent_at.sql).
 */

import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { DB_SCHEMA } from "@/lib/config";
import { sendReminderEmail } from "@/lib/reminder-mail";

const REMINDER_INTERVAL_DAYS = 7;

interface EligibleUser {
  id: string;
  email: string;
  entity: string;
  confirmed_reports: string;
  reminder_sent_at: string | null;
}

export async function GET(req: NextRequest) {
  // Authenticate cron caller
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    // Find users whose entity has confirmed reports but no responses,
    // and who have not been reminded within the last REMINDER_INTERVAL_DAYS days.
    const eligibleUsers = await query<EligibleUser>(
      `SELECT
           u.id,
           u.email,
           u.entity,
           COUNT(DISTINCT (rec.proper_title, rec.normalized_body)) AS confirmed_reports,
           u.reminder_sent_at
         FROM ${DB_SCHEMA}.users u
         -- Join to get confirmed reports for this entity
         JOIN ${DB_SCHEMA}.report_entity_confirmations rec ON rec.entity = u.entity
         JOIN ${DB_SCHEMA}.report_frequencies rf
           ON rf.proper_title = rec.proper_title
         -- Exclude admins
         WHERE NOT EXISTS (
           SELECT 1 FROM ${DB_SCHEMA}.admin_emails ae WHERE ae.email = u.email
         )
         -- Only users with an entity set
         AND u.entity IS NOT NULL
         -- No reminder sent yet, or last reminder was more than N days ago
         AND (
           u.reminder_sent_at IS NULL
           OR u.reminder_sent_at < NOW() - ($1 || ' days')::INTERVAL
         )
         -- Entity must have zero survey responses so far
         AND NOT EXISTS (
           SELECT 1
           FROM ${DB_SCHEMA}.survey_responses sr
           WHERE sr.user_entity = u.entity
         )
         GROUP BY u.id, u.email, u.entity, u.reminder_sent_at
         -- Only send if the entity has at least one confirmed report
         HAVING COUNT(DISTINCT (rec.proper_title, rec.normalized_body)) > 0
         ORDER BY u.email`,
      [REMINDER_INTERVAL_DAYS]
    );

    if (eligibleUsers.length === 0) {
      return NextResponse.json({
        sent: 0,
        skipped: 0,
        message: "No eligible users found",
      });
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const user of eligibleUsers) {
      try {
        await sendReminderEmail({
          to: user.email,
          entity: user.entity,
          confirmedReports: parseInt(user.confirmed_reports, 10),
        });

        // Mark reminder as sent
        await query(
          `UPDATE ${DB_SCHEMA}.users SET reminder_sent_at = NOW() WHERE id = $1`,
          [user.id]
        );

        sent++;
      } catch (err) {
        failed++;
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`${user.email}: ${msg}`);
        console.error(`Failed to send reminder to ${user.email}:`, err);
      }
    }

    return NextResponse.json({
      sent,
      failed,
      total: eligibleUsers.length,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (error) {
    console.error("send-reminders cron error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
