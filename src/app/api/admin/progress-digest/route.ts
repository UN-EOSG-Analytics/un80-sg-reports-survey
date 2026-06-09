import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { DB_SCHEMA, notAdminSQL } from "@/lib/config";
import { sendProgressDigest } from "@/lib/mail";

/**
 * POST /api/admin/progress-digest
 *
 * Admin-only endpoint that computes the current survey coverage and sends a
 * progress digest email to the requesting admin. Useful for weekly check-ins
 * without needing to open the analysis page.
 *
 * Body: { recipientEmail?: string }  (defaults to the logged-in admin's email)
 */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") {
    return NextResponse.json({ error: "Admin access required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const recipientEmail: string = body.recipientEmail || user.email;

  // Fetch the data we need for the digest
  const [totalRows, respondedRows, entityRows] = await Promise.all([
    query<{ total_groups: string }>(
      `SELECT COUNT(*) AS total_groups FROM ${DB_SCHEMA}.report_frequencies`
    ),
    query<{ responded_groups: string; total_responses: string }>(
      `SELECT
         (SELECT COUNT(DISTINCT (proper_title, normalized_body))
          FROM (
            SELECT proper_title, normalized_body FROM ${DB_SCHEMA}.survey_responses
            UNION
            SELECT proper_title, normalized_body FROM ${DB_SCHEMA}.report_frequency_confirmations
            WHERE frequency = 'one-time'
          ) AS completed
         ) AS responded_groups,
         COUNT(*) AS total_responses
       FROM ${DB_SCHEMA}.survey_responses`
    ),
    query<{
      entity: string;
      confirmed_reports: string;
      reports_with_response: string;
      user_count: string;
    }>(
      `WITH entity_confirmed AS (
         SELECT DISTINCT entity, rf.proper_title, rf.normalized_body
         FROM ${DB_SCHEMA}.report_entities re
         CROSS JOIN LATERAL unnest(COALESCE(re.confirmed_entities, ARRAY[]::text[])) AS entity
         JOIN ${DB_SCHEMA}.report_frequencies rf ON rf.proper_title = re.proper_title
       ),
       entity_responses AS (
         SELECT DISTINCT user_entity AS entity, proper_title, normalized_body
         FROM ${DB_SCHEMA}.survey_responses
         UNION
         SELECT DISTINCT u.entity, rfc.proper_title, rfc.normalized_body
         FROM ${DB_SCHEMA}.report_frequency_confirmations rfc
         JOIN ${DB_SCHEMA}.users u ON u.id = rfc.confirmed_by_user_id
         WHERE rfc.frequency = 'one-time' AND u.entity IS NOT NULL
       ),
       user_counts AS (
         SELECT entity, COUNT(*) AS user_count
         FROM ${DB_SCHEMA}.users u
         WHERE entity IS NOT NULL AND ${notAdminSQL()}
         GROUP BY entity
       )
       SELECT
         ec.entity,
         COUNT(DISTINCT (ec.proper_title, ec.normalized_body))::text AS confirmed_reports,
         COUNT(DISTINCT CASE WHEN er.proper_title IS NOT NULL THEN (ec.proper_title, ec.normalized_body) END)::text AS reports_with_response,
         COALESCE(uc.user_count::text, '0') AS user_count
       FROM entity_confirmed ec
       LEFT JOIN entity_responses er
         ON er.entity = ec.entity
         AND er.proper_title = ec.proper_title
         AND er.normalized_body = ec.normalized_body
       LEFT JOIN user_counts uc ON uc.entity = ec.entity
       GROUP BY ec.entity, uc.user_count
       ORDER BY confirmed_reports DESC`
    ),
  ]);

  const totalGroups = parseInt(totalRows[0]?.total_groups ?? "0");
  const respondedGroups = parseInt(respondedRows[0]?.responded_groups ?? "0");
  const totalResponses = parseInt(respondedRows[0]?.total_responses ?? "0");
  const coveragePct =
    totalGroups > 0 ? Math.round((respondedGroups / totalGroups) * 100) : 0;

  const notStarted = entityRows.filter(
    (e) =>
      parseInt(e.confirmed_reports) > 0 &&
      parseInt(e.reports_with_response) === 0
  );

  const digestData = {
    totalGroups,
    respondedGroups,
    totalResponses,
    coveragePct,
    notStartedEntities: notStarted.map((e) => ({
      entity: e.entity,
      confirmedReports: parseInt(e.confirmed_reports),
      userCount: parseInt(e.user_count),
    })),
    allEntities: entityRows.map((e) => ({
      entity: e.entity,
      confirmedReports: parseInt(e.confirmed_reports),
      reportsWithResponse: parseInt(e.reports_with_response),
      userCount: parseInt(e.user_count),
    })),
    generatedAt: new Date().toISOString(),
  };

  try {
    await sendProgressDigest(recipientEmail, digestData);
    return NextResponse.json({
      success: true,
      sentTo: recipientEmail,
      summary: {
        totalGroups,
        respondedGroups,
        coveragePct,
        notStartedCount: notStarted.length,
      },
    });
  } catch (error) {
    console.error("Failed to send progress digest:", error);
    return NextResponse.json(
      { error: "Failed to send email" },
      { status: 500 }
    );
  }
}
