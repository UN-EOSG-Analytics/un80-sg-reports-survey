import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface SurveyResponseRow {
  proper_title: string;
  status: string;
  frequency: string | null;
  format: string | null;
}

// GET - Fetch all responses for the current user (for display in table)
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ responses: {} });
  }

  try {
    const rows = await query<SurveyResponseRow>(
      `SELECT proper_title, status, frequency, format
       FROM ${DB_SCHEMA}.survey_responses 
       WHERE user_email = $1`,
      [user.email]
    );

    // Convert to a map keyed by proper_title for easy lookup
    const responses: Record<string, { status: string; frequency: string | null; format: string | null }> = {};
    for (const row of rows) {
      responses[row.proper_title] = {
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
