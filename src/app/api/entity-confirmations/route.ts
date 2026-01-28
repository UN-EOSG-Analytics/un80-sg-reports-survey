import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface ConfirmationInput {
  properTitle: string;
  entity: string;
  notes?: string | null;
}

interface ConfirmationRow {
  id: number;
  proper_title: string;
  entity: string;
  confirmed_by_user_id: string;
  confirmed_at: string;
  notes: string | null;
  // Joined fields
  confirmed_by_email?: string;
}

// GET - Fetch confirmations with optional filters
export async function GET(req: NextRequest) {
  const properTitle = req.nextUrl.searchParams.get("properTitle");
  const entity = req.nextUrl.searchParams.get("entity");
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

    if (entity) {
      whereClauses.push(`c.entity = $${paramIndex}`);
      params.push(entity);
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

    const rows = await query<ConfirmationRow>(
      `SELECT 
        c.id,
        c.proper_title,
        c.entity,
        c.confirmed_by_user_id,
        c.confirmed_at,
        c.notes,
        u.email as confirmed_by_email
       FROM ${DB_SCHEMA}.report_entity_confirmations c
       LEFT JOIN ${DB_SCHEMA}.users u ON c.confirmed_by_user_id = u.id
       ${whereClause}
       ORDER BY c.confirmed_at DESC`,
      params
    );

    return NextResponse.json({
      confirmations: rows.map((row) => ({
        id: row.id,
        properTitle: row.proper_title,
        entity: row.entity,
        confirmedByUserId: row.confirmed_by_user_id,
        confirmedByEmail: row.confirmed_by_email,
        confirmedAt: row.confirmed_at,
        notes: row.notes,
      })),
    });
  } catch (error) {
    console.error("Error fetching confirmations:", error);
    return NextResponse.json(
      { error: "Failed to fetch confirmations" },
      { status: 500 }
    );
  }
}

// POST - Create a new entity confirmation
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body: ConfirmationInput = await req.json();

    // Validate required fields
    if (!body.properTitle || !body.entity) {
      return NextResponse.json(
        { error: "Missing required fields: properTitle, entity" },
        { status: 400 }
      );
    }

    // Verify the entity exists in the master list
    const entityCheck = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM systemchart.entities WHERE entity = $1`,
      [body.entity]
    );
    
    if (parseInt(entityCheck[0]?.count || "0") === 0) {
      return NextResponse.json(
        { error: "Invalid entity: not found in master entity list" },
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

    // Insert the confirmation (upsert - update if same user confirms same entity for same report)
    const result = await query<ConfirmationRow>(
      `INSERT INTO ${DB_SCHEMA}.report_entity_confirmations (
        proper_title,
        entity,
        confirmed_by_user_id,
        notes
      ) VALUES ($1, $2, $3, $4)
      ON CONFLICT (proper_title, entity) 
      DO UPDATE SET
        confirmed_by_user_id = EXCLUDED.confirmed_by_user_id,
        confirmed_at = NOW(),
        notes = EXCLUDED.notes
      RETURNING *`,
      [body.properTitle, body.entity, user.id, body.notes || null]
    );

    const row = result[0];
    return NextResponse.json({
      success: true,
      confirmation: {
        id: row.id,
        properTitle: row.proper_title,
        entity: row.entity,
        confirmedByUserId: row.confirmed_by_user_id,
        confirmedByEmail: user.email,
        confirmedAt: row.confirmed_at,
        notes: row.notes,
      },
    });
  } catch (error) {
    console.error("Error creating confirmation:", error);
    return NextResponse.json(
      { error: "Failed to create confirmation" },
      { status: 500 }
    );
  }
}

// DELETE - Remove an entity confirmation
export async function DELETE(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const properTitle = req.nextUrl.searchParams.get("properTitle");
  const entity = req.nextUrl.searchParams.get("entity");

  if (!properTitle || !entity) {
    return NextResponse.json(
      { error: "Both properTitle and entity parameters are required" },
      { status: 400 }
    );
  }

  try {
    // Users can only delete their own confirmations
    const result = await query<{ id: number }>(
      `DELETE FROM ${DB_SCHEMA}.report_entity_confirmations 
       WHERE proper_title = $1 AND entity = $2 AND confirmed_by_user_id = $3
       RETURNING id`,
      [properTitle, entity, user.id]
    );

    if (result.length === 0) {
      return NextResponse.json(
        { error: "Confirmation not found or you don't have permission to delete it" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting confirmation:", error);
    return NextResponse.json(
      { error: "Failed to delete confirmation" },
      { status: 500 }
    );
  }
}
