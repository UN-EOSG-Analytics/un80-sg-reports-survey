import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface SurveyResponseRow {
  proper_title: string;
  normalized_body: string;
  status: string;
  frequency: string | null;
  format: string | null;
}

/**
 * GET /api/survey-responses/entity-responses
 *
 * Returns all survey responses submitted by anyone in the current user's
 * entity, keyed by "proper_title|||normalized_body".
 *
 * Used by the entity dashboard's "Survey" column to reflect whether *any*
 * colleague (not just the logged-in user) has already responded to a report.
 * The per-user endpoint (/api/survey-responses/my-responses) is still used
 * for identifying which responses belong to the current user specifically.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ responses: {} });
  }

  if (!user.entity) {
    // No entity assigned — return empty; the caller will fall back to
    // per-user responses for the survey column.
    return NextResponse.json({ responses: {} });
  }

  try {
    // Fetch the first (most-recent) response per (proper_title, normalized_body)
    // from anyone in this entity. We use DISTINCT ON so the caller gets a
    // single representative status per report rather than a list.
    const rows = await query<SurveyResponseRow>(
      `SELECT DISTINCT ON (proper_title, normalized_body)
              proper_title, normalized_body, status, frequency, format
       FROM   ${DB_SCHEMA}.survey_responses
       WHERE  user_entity = $1
       ORDER  BY proper_title, normalized_body, updated_at DESC`,
      [user.entity]
    );

    const responses: Record<
      string,
      { status: string; frequency: string | null; format: string | null }
    > = {};

    for (const row of rows) {
      const key = `${row.proper_title}|||${row.normalized_body || ""}`;
      responses[key] = {
        status: row.status,
        frequency: row.frequency,
        format: row.format,
      };
    }

    return NextResponse.json({ responses });
  } catch (error) {
    console.error("Error fetching entity responses:", error);
    return NextResponse.json({ responses: {} });
  }
}
