import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { DB_SCHEMA } from "@/lib/config";

const VALID_STATUSES = ["continue", "merge", "discontinue"] as const;
const VALID_FREQUENCIES = [
  "multiple-per-year",
  "annual",
  "biennial",
  "triennial",
  "quadrennial",
  "one-time",
] as const;
const VALID_FORMATS = [
  "shorter",
  "oral",
  "dashboard",
  "other",
  "no-change",
] as const;
const COMMENTS_MAX_LENGTH = 5000;

type SurveyStatus = (typeof VALID_STATUSES)[number];

interface SurveyResponseInput {
  properTitle: string;
  normalizedBody?: string | null;
  latestSymbol: string;
  status: SurveyStatus;
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
  normalized_body: string;
  latest_symbol: string;
  responded_by_user_id: string;
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

interface AdminResponseRow extends SurveyResponseRow {
  responder_email: string | null;
}

interface EntityResponseCountRow {
  entity: string;
  count: string;
}

interface OwnEntityResponderRow {
  email: string | null;
}

function normalizeBodyKey(value: string | null | undefined): string {
  return value?.trim() || "";
}

function toPublicResponse(row: SurveyResponseRow) {
  return {
    id: row.id,
    properTitle: row.proper_title,
    normalizedBody: row.normalized_body,
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
  };
}

// GET - Fetch current user's response + aggregate response count for a specific report/body
// Admins additionally receive all response contents across entities (read-only superpower).
export async function GET(req: NextRequest) {
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

  const normalizedBody = normalizeBodyKey(req.nextUrl.searchParams.get("normalizedBody"));
  const isAdmin = user.role === "admin";

  try {
    const [ownRows, countRows, entityCountRows, ownEntityResponderRows, adminRows] = await Promise.all([
      query<SurveyResponseRow>(
        `SELECT * FROM ${DB_SCHEMA}.survey_responses
         WHERE proper_title = $1 AND normalized_body = $2 AND responded_by_user_id = $3`,
        [properTitle, normalizedBody, user.id]
      ),
      query<{ count: string }>(
        `SELECT COUNT(*)::text as count
         FROM ${DB_SCHEMA}.survey_responses
         WHERE proper_title = $1 AND normalized_body = $2`,
        [properTitle, normalizedBody]
      ),
      query<EntityResponseCountRow>(
        `SELECT user_entity as entity, COUNT(*)::text as count
         FROM ${DB_SCHEMA}.survey_responses
         WHERE proper_title = $1 AND normalized_body = $2
         GROUP BY user_entity
         ORDER BY user_entity ASC`,
        [properTitle, normalizedBody]
      ),
      user.entity
        ? query<OwnEntityResponderRow>(
            `SELECT DISTINCT u.email
             FROM ${DB_SCHEMA}.survey_responses sr
             LEFT JOIN ${DB_SCHEMA}.users u ON u.id = sr.responded_by_user_id
             WHERE sr.proper_title = $1
               AND sr.normalized_body = $2
               AND sr.user_entity = $3
             ORDER BY u.email ASC`,
            [properTitle, normalizedBody, user.entity]
          )
        : Promise.resolve([] as OwnEntityResponderRow[]),
      isAdmin
        ? query<AdminResponseRow>(
            `SELECT sr.*, u.email as responder_email
             FROM ${DB_SCHEMA}.survey_responses sr
             LEFT JOIN ${DB_SCHEMA}.users u ON u.id = sr.responded_by_user_id
             WHERE sr.proper_title = $1 AND sr.normalized_body = $2
             ORDER BY sr.updated_at DESC`,
            [properTitle, normalizedBody]
          )
        : Promise.resolve([] as AdminResponseRow[]),
    ]);

    const ownResponse = ownRows[0] ? toPublicResponse(ownRows[0]) : null;
    const responseCount = parseInt(countRows[0]?.count || "0", 10);

    return NextResponse.json({
      response: ownResponse,
      responseCount,
      entityResponseCounts: entityCountRows.map((row) => ({
        entity: row.entity,
        count: parseInt(row.count, 10),
      })),
      ownEntityResponders: ownEntityResponderRows
        .map((row) => row.email)
        .filter((email): email is string => typeof email === "string" && email.length > 0),
      allResponses: isAdmin
        ? adminRows.map((row) => ({
            ...toPublicResponse(row),
            userEntity: row.user_entity,
            responderEmail: row.responder_email,
            respondedByUserId: row.responded_by_user_id,
          }))
        : undefined,
    });
  } catch (error) {
    console.error("Error fetching survey response:", error);
    return NextResponse.json(
      { error: "Failed to fetch response" },
      { status: 500 }
    );
  }
}

// POST - Create or update the current user's survey response (one per user per report/body)
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.entity) {
    return NextResponse.json(
      { error: "Entity required to submit survey responses" },
      { status: 400 }
    );
  }

  try {
    const body: SurveyResponseInput = await req.json();

    if (!body.properTitle || !body.latestSymbol || !body.status) {
      return NextResponse.json(
        { error: "Missing required fields: properTitle, latestSymbol, status" },
        { status: 400 }
      );
    }

    if (!(VALID_STATUSES as readonly string[]).includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status value. Must be one of: ${VALID_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate frequency if provided
    if (
      body.frequency != null &&
      !(VALID_FREQUENCIES as readonly string[]).includes(body.frequency)
    ) {
      return NextResponse.json(
        { error: `Invalid frequency value. Must be one of: ${VALID_FREQUENCIES.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate format if provided
    if (
      body.format != null &&
      !(VALID_FORMATS as readonly string[]).includes(body.format)
    ) {
      return NextResponse.json(
        { error: `Invalid format value. Must be one of: ${VALID_FORMATS.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate comments length
    if (body.comments && body.comments.length > COMMENTS_MAX_LENGTH) {
      return NextResponse.json(
        { error: `Comments must not exceed ${COMMENTS_MAX_LENGTH} characters` },
        { status: 400 }
      );
    }

    const normalizedBody = normalizeBodyKey(body.normalizedBody);

    const result = await query<SurveyResponseRow>(
      `INSERT INTO ${DB_SCHEMA}.survey_responses (
        proper_title,
        normalized_body,
        latest_symbol,
        responded_by_user_id,
        user_entity,
        status,
        frequency,
        format,
        format_other,
        merge_targets,
        discontinue_reason,
        comments
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      ON CONFLICT (proper_title, normalized_body, responded_by_user_id)
      DO UPDATE SET
        latest_symbol = EXCLUDED.latest_symbol,
        user_entity = EXCLUDED.user_entity,
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
        normalizedBody,
        body.latestSymbol,
        user.id,
        user.entity,
        body.status,
        body.status !== "discontinue" ? body.frequency : null,
        body.status !== "discontinue" ? body.format : null,
        body.status !== "discontinue" && body.format === "other" ? body.formatOther : null,
        body.status === "merge" ? body.mergeTargets || [] : null,
        body.status === "discontinue" ? body.discontinueReason : null,
        body.comments || null,
      ]
    );

    return NextResponse.json({
      success: true,
      response: toPublicResponse(result[0]),
    });
  } catch (error) {
    console.error("Error saving survey response:", error);
    return NextResponse.json(
      { error: "Failed to save response" },
      { status: 500 }
    );
  }
}

// DELETE - Remove current user's survey response for a specific report/body
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

  const normalizedBody = normalizeBodyKey(req.nextUrl.searchParams.get("normalizedBody"));

  try {
    await query(
      `DELETE FROM ${DB_SCHEMA}.survey_responses
       WHERE proper_title = $1 AND normalized_body = $2 AND responded_by_user_id = $3`,
      [properTitle, normalizedBody, user.id]
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
