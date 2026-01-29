import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface SurveyResponseInput {
  properTitle: string;
  latestSymbol: string;
  status: "continue" | "merge" | "discontinue";
  frequency?: string | null;
  format?: string | null;
  formatOther?: string | null;
  mergeTargets?: string[];
  discontinueReason?: string | null;
  comments?: string | null;
}

interface SurveyResponseRow {
  id: number;
  proper_title: string;
  latest_symbol: string;
  user_entity: string;
  status: string;
  frequency: string | null;
  format: string | null;
  format_other: string | null;
  merge_targets: string[] | null;
  discontinue_reason: string | null;
  comments: string | null;
  created_at: string;
  updated_at: string;
}

// GET - Fetch entity's response for a specific report
export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Entity is required for survey operations
  if (!user.entity) {
    return NextResponse.json(
      { error: "Entity required to view survey responses" },
      { status: 400 }
    );
  }

  const properTitle = req.nextUrl.searchParams.get("properTitle");
  if (!properTitle) {
    return NextResponse.json(
      { error: "properTitle parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Fetch response for the user's entity (not by email)
    const rows = await query<SurveyResponseRow>(
      `SELECT * FROM ${DB_SCHEMA}.survey_responses 
       WHERE proper_title = $1 AND user_entity = $2`,
      [properTitle, user.entity]
    );

    if (rows.length === 0) {
      return NextResponse.json({ response: null });
    }

    const row = rows[0];
    // Return response without user attribution (confidential)
    return NextResponse.json({
      response: {
        id: row.id,
        properTitle: row.proper_title,
        latestSymbol: row.latest_symbol,
        status: row.status,
        frequency: row.frequency,
        format: row.format,
        formatOther: row.format_other,
        mergeTargets: row.merge_targets || [],
        discontinueReason: row.discontinue_reason,
        comments: row.comments,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error("Error fetching survey response:", error);
    return NextResponse.json(
      { error: "Failed to fetch response" },
      { status: 500 }
    );
  }
}

// POST - Create or update a survey response (one per entity per report)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Entity is required for survey operations
  if (!user.entity) {
    return NextResponse.json(
      { error: "Entity required to submit survey responses" },
      { status: 400 }
    );
  }

  try {
    const body: SurveyResponseInput = await req.json();

    // Validate required fields
    if (!body.properTitle || !body.latestSymbol || !body.status) {
      return NextResponse.json(
        { error: "Missing required fields: properTitle, latestSymbol, status" },
        { status: 400 }
      );
    }

    // Validate status
    if (!["continue", "merge", "discontinue"].includes(body.status)) {
      return NextResponse.json(
        { error: "Invalid status value" },
        { status: 400 }
      );
    }

    // Upsert the response by entity (any user from the entity can edit)
    const result = await query<SurveyResponseRow>(
      `INSERT INTO ${DB_SCHEMA}.survey_responses (
        proper_title,
        latest_symbol,
        user_entity,
        created_by_email,
        updated_by_email,
        status,
        frequency,
        format,
        format_other,
        merge_targets,
        discontinue_reason,
        comments
      ) VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (proper_title, user_entity) 
      DO UPDATE SET
        latest_symbol = EXCLUDED.latest_symbol,
        updated_by_email = EXCLUDED.updated_by_email,
        status = EXCLUDED.status,
        frequency = EXCLUDED.frequency,
        format = EXCLUDED.format,
        format_other = EXCLUDED.format_other,
        merge_targets = EXCLUDED.merge_targets,
        discontinue_reason = EXCLUDED.discontinue_reason,
        comments = EXCLUDED.comments,
        updated_at = NOW()
      RETURNING *`,
      [
        body.properTitle,
        body.latestSymbol,
        user.entity,
        user.email, // For audit: created_by_email on insert, updated_by_email on update
        body.status,
        body.status !== "discontinue" ? body.frequency : null,
        body.status !== "discontinue" ? body.format : null,
        body.status !== "discontinue" && body.format === "other" ? body.formatOther : null,
        body.status === "merge" ? body.mergeTargets || [] : null,
        body.status === "discontinue" ? body.discontinueReason : null,
        body.comments || null,
      ]
    );

    const row = result[0];
    // Return response without user attribution (confidential)
    return NextResponse.json({
      success: true,
      response: {
        id: row.id,
        properTitle: row.proper_title,
        latestSymbol: row.latest_symbol,
        status: row.status,
        frequency: row.frequency,
        format: row.format,
        formatOther: row.format_other,
        mergeTargets: row.merge_targets || [],
        discontinueReason: row.discontinue_reason,
        comments: row.comments,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
    });
  } catch (error) {
    console.error("Error saving survey response:", error);
    return NextResponse.json(
      { error: "Failed to save response" },
      { status: 500 }
    );
  }
}

// DELETE - Remove an entity's survey response
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Entity is required for survey operations
  if (!user.entity) {
    return NextResponse.json(
      { error: "Entity required to delete survey responses" },
      { status: 400 }
    );
  }

  const properTitle = req.nextUrl.searchParams.get("properTitle");
  if (!properTitle) {
    return NextResponse.json(
      { error: "properTitle parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Delete by entity (any user from the entity can delete)
    await query(
      `DELETE FROM ${DB_SCHEMA}.survey_responses 
       WHERE proper_title = $1 AND user_entity = $2`,
      [properTitle, user.entity]
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting survey response:", error);
    return NextResponse.json(
      { error: "Failed to delete response" },
      { status: 500 }
    );
  }
}
