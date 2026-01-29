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

// GET - Fetch all responses for the current user's entity (for display in table)
export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.entity) {
    // No user or no entity - return empty responses
    return NextResponse.json({ responses: {} });
  }

  try {
    // Query by entity, not by email (one response per entity per report)
    const rows = await query<SurveyResponseRow>(
      `SELECT proper_title, status, frequency, format
       FROM ${DB_SCHEMA}.survey_responses 
       WHERE user_entity = $1`,
      [user.entity]
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
    console.error("Error fetching entity responses:", error);
    return NextResponse.json({ responses: {} });
  }
}
