import { NextRequest, NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { DB_SCHEMA } from "@/lib/config";

interface StatusRow {
  status: string;
  frequency: string | null;
  format: string | null;
  count: string;
}

interface EntityCountRow {
  entity: string;
  count: string;
}

/**
 * GET /api/survey-responses/aggregate
 *
 * Returns anonymised aggregate statistics for a given (properTitle, normalizedBody)
 * pair. Available to all authenticated users — individual entity identities are
 * not exposed here (admins get those via the main survey-responses endpoint).
 *
 * Response shape:
 * {
 *   responseCount: number;
 *   entityResponseCounts: Array<{ entity: string; count: number }>;
 *   statusDistribution: {
 *     continue: number;
 *     continueWithChanges: number;
 *     merge: number;
 *     discontinue: number;
 *   };
 * }
 */
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

  const normalizedBody = (req.nextUrl.searchParams.get("normalizedBody") ?? "").trim();

  try {
    const [statusRows, entityCountRows] = await Promise.all([
      query<StatusRow>(
        `SELECT status, frequency, format, COUNT(*)::text as count
         FROM ${DB_SCHEMA}.survey_responses
         WHERE proper_title = $1 AND normalized_body = $2
         GROUP BY status, frequency, format`,
        [properTitle, normalizedBody]
      ),
      query<EntityCountRow>(
        `SELECT user_entity as entity, COUNT(*)::text as count
         FROM ${DB_SCHEMA}.survey_responses
         WHERE proper_title = $1 AND normalized_body = $2
         GROUP BY user_entity
         ORDER BY count DESC`,
        [properTitle, normalizedBody]
      ),
    ]);

    const responseCount = statusRows.reduce(
      (sum, r) => sum + parseInt(r.count, 10),
      0
    );

    // Aggregate into the four frontend buckets:
    // "continue_with_changes" = continue AND (frequency IS NOT NULL OR format IS NOT NULL)
    const distribution = { continue: 0, continueWithChanges: 0, merge: 0, discontinue: 0 };
    for (const row of statusRows) {
      const n = parseInt(row.count, 10);
      if (row.status === "continue" && (row.frequency != null || row.format != null)) {
        distribution.continueWithChanges += n;
      } else if (row.status === "continue") {
        distribution.continue += n;
      } else if (row.status === "merge") {
        distribution.merge += n;
      } else if (row.status === "discontinue") {
        distribution.discontinue += n;
      }
    }

    return NextResponse.json({
      responseCount,
      // Non-admins see entity names but not which entity submitted what.
      // Admins can use the main endpoint to see individual responses.
      entityResponseCounts: entityCountRows.map((r) => ({
        entity: r.entity,
        count: parseInt(r.count, 10),
      })),
      statusDistribution: responseCount > 0 ? distribution : null,
    });
  } catch (error) {
    console.error("Error fetching aggregate survey response:", error);
    return NextResponse.json(
      { error: "Failed to fetch aggregate" },
      { status: 500 }
    );
  }
}
