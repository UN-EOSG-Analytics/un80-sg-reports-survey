import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

// Valid frequency values
const VALID_FREQUENCIES = ['multiple', 'annual', 'biennial', 'triennial', 'quadrennial', 'quinquennial', 'one-time', 'other'];

interface FrequencyConfirmationInput {
  properTitle: string;
  frequency: string;
  notes?: string | null;
}

interface FrequencyConfirmationRow {
  id: number;
  proper_title: string;
  frequency: string;
  confirmed_by_user_id: string;
  confirmed_at: string;
  notes: string | null;
  // Joined fields
  confirmed_by_email?: string;
}

// GET - Fetch frequency confirmation for a report
export async function GET(req: NextRequest) {
  const properTitle = req.nextUrl.searchParams.get("properTitle");
  const myConfirmations = req.nextUrl.searchParams.get("my") === "true";

  try {
    const whereClauses: string[] = [];
    const params: string[] = [];
    let paramIndex = 1;

    if (properTitle) {
      whereClauses.push(`c.proper_title = $${paramIndex}`);
      params.push(properTitle);
      paramIndex++;
    }

    // If requesting user's own confirmations, require auth
    if (myConfirmations) {
      const user = await getCurrentUser();
      if (!user) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      whereClauses.push(`c.confirmed_by_user_id = $${paramIndex}::uuid`);
      params.push(user.id);
      paramIndex++;
    }

    const whereClause = whereClauses.length > 0 
      ? `WHERE ${whereClauses.join(" AND ")}` 
      : "";

    const rows = await query<FrequencyConfirmationRow>(
      `SELECT 
        c.id,
        c.proper_title,
        c.frequency,
        c.confirmed_by_user_id,
        c.confirmed_at,
        c.notes,
        u.email as confirmed_by_email
       FROM ${DB_SCHEMA}.report_frequency_confirmations c
       LEFT JOIN ${DB_SCHEMA}.users u ON c.confirmed_by_user_id = u.id
       ${whereClause}
       ORDER BY c.confirmed_at DESC`,
      params
    );

    return NextResponse.json({
      confirmations: rows.map((row) => ({
        id: row.id,
        properTitle: row.proper_title,
        frequency: row.frequency,
        confirmedByUserId: row.confirmed_by_user_id,
        confirmedByEmail: row.confirmed_by_email,
        confirmedAt: row.confirmed_at,
        notes: row.notes,
      })),
      // For convenience when fetching single report
      confirmation: rows.length > 0 ? {
        id: rows[0].id,
        properTitle: rows[0].proper_title,
        frequency: rows[0].frequency,
        confirmedByUserId: rows[0].confirmed_by_user_id,
        confirmedByEmail: rows[0].confirmed_by_email,
        confirmedAt: rows[0].confirmed_at,
        notes: rows[0].notes,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching frequency confirmations:", error);
    return NextResponse.json(
      { error: "Failed to fetch frequency confirmations" },
      { status: 500 }
    );
  }
}

// POST - Create or update frequency confirmation
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: FrequencyConfirmationInput = await req.json();

    // Validate required fields
    if (!body.properTitle || !body.frequency) {
      return NextResponse.json(
        { error: "Missing required fields: properTitle, frequency" },
        { status: 400 }
      );
    }

    // Validate frequency value
    if (!VALID_FREQUENCIES.includes(body.frequency)) {
      return NextResponse.json(
        { error: `Invalid frequency. Must be one of: ${VALID_FREQUENCIES.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify the proper_title exists in documents
    const titleCheck = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM ${DB_SCHEMA}.documents WHERE proper_title = $1`,
      [body.properTitle]
    );
    
    if (parseInt(titleCheck[0]?.count || "0") === 0) {
      return NextResponse.json(
        { error: "Invalid properTitle: no documents found with this title" },
        { status: 400 }
      );
    }

    // Upsert - one frequency per report, anyone can confirm/update
    const result = await query<FrequencyConfirmationRow>(
      `INSERT INTO ${DB_SCHEMA}.report_frequency_confirmations (
        proper_title,
        frequency,
        confirmed_by_user_id,
        notes
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (proper_title) 
      DO UPDATE SET
        frequency = EXCLUDED.frequency,
        confirmed_by_user_id = EXCLUDED.confirmed_by_user_id,
        confirmed_at = NOW(),
        notes = EXCLUDED.notes
      RETURNING *`,
      [body.properTitle, body.frequency, user.id, body.notes || null]
    );

    const row = result[0];
    return NextResponse.json({
      success: true,
      confirmation: {
        id: row.id,
        properTitle: row.proper_title,
        frequency: row.frequency,
        confirmedByUserId: row.confirmed_by_user_id,
        confirmedByEmail: user.email,
        confirmedAt: row.confirmed_at,
        notes: row.notes,
      },
    });
  } catch (error) {
    console.error("Error creating frequency confirmation:", error);
    return NextResponse.json(
      { error: "Failed to create frequency confirmation" },
      { status: 500 }
    );
  }
}

// DELETE - Remove a frequency confirmation
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const properTitle = req.nextUrl.searchParams.get("properTitle");

  if (!properTitle) {
    return NextResponse.json(
      { error: "properTitle parameter is required" },
      { status: 400 }
    );
  }

  try {
    // Only allow deleting if user created it
    const result = await query<{ id: number }>(
      `DELETE FROM ${DB_SCHEMA}.report_frequency_confirmations 
       WHERE proper_title = $1 AND confirmed_by_user_id = $2
       RETURNING id`,
      [properTitle, user.id]
    );

    // Idempotent delete - if nothing was deleted, that's still success
    return NextResponse.json({ 
      success: true, 
      deleted: result.length > 0 
    });
  } catch (error) {
    console.error("Error deleting frequency confirmation:", error);
    return NextResponse.json(
      { error: "Failed to delete frequency confirmation" },
      { status: 500 }
    );
  }
}
