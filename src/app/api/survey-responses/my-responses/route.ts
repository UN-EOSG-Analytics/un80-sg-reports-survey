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

// GET - Fetch all responses created by the current user (for display in tables)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ responses: {} });
  }

  try {
    const rows = await query<SurveyResponseRow>(
      `SELECT proper_title, normalized_body, status, frequency, format
       FROM ${DB_SCHEMA}.survey_responses
       WHERE responded_by_user_id = $1`,
      [user.id]
    );

    const responses: Record<string, { status: string; frequency: string | null; format: string | null }> = {};
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
    console.error("Error fetching user responses:", error);
    return NextResponse.json({ responses: {} });
  }
}
