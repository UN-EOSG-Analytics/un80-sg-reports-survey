import { NextResponse } from "next/server";
import { query } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";

const DB_SCHEMA = process.env.DB_SCHEMA || "sg_reports_survey";

interface ProgressRow {
  total_reports: string;
  completed_surveys: string;
  one_time_confirmations: string;
}

export interface SurveyProgressData {
  /** Total distinct reports confirmed by the entity */
  totalReports: number;
  /** Reports with at least one survey_response from the entity */
  completedSurveys: number;
  /** Reports confirmed as "one-time" (count as complete without a survey form) */
  oneTimeConfirmations: number;
  /** Combined completion count (survey responses + one-time confirmations) */
  completedTotal: number;
  /** Percentage rounded to nearest integer */
  percentage: number;
  entity: string;
}

/**
 * GET /api/stats/progress
 *
 * Returns survey completion statistics for the current user's entity:
 * - totalReports: distinct reports confirmed by the entity
 * - completedSurveys: reports with >= 1 survey_response from the entity
 * - oneTimeConfirmations: reports whose confirmed frequency is "one-time"
 *   (these are treated as complete without a survey form)
 * - completedTotal: completedSurveys + oneTimeConfirmations (capped at totalReports)
 * - percentage: completedTotal / totalReports * 100 (0 if no reports)
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!user.entity) {
    return NextResponse.json({ error: "No entity assigned" }, { status: 400 });
  }

  try {
    const rows = await query<ProgressRow>(
      `SELECT
         -- Total reports confirmed by this entity
         (SELECT COUNT(DISTINCT rec.proper_title)
          FROM   ${DB_SCHEMA}.report_entity_confirmations rec
          WHERE  rec.entity = $1
         )::text AS total_reports,

         -- Reports with at least one survey response from this entity
         (SELECT COUNT(DISTINCT sr.proper_title)
          FROM   ${DB_SCHEMA}.survey_responses sr
          WHERE  sr.user_entity = $1
         )::text AS completed_surveys,

         -- Reports confirmed as one-time for this entity
         -- (frequency confirmations don't have per-entity columns yet, so we
         --  count reports where: entity has confirmed it AND confirmed frequency = one-time)
         (SELECT COUNT(DISTINCT rec.proper_title)
          FROM   ${DB_SCHEMA}.report_entity_confirmations rec
          JOIN   ${DB_SCHEMA}.report_frequency_confirmations rfc
            ON   rfc.proper_title = rec.proper_title
          WHERE  rec.entity = $1
            AND  rfc.frequency = 'one-time'
         )::text AS one_time_confirmations`,
      [user.entity]
    );

    const row = rows[0];
    const totalReports = parseInt(row?.total_reports || "0", 10);
    const completedSurveys = parseInt(row?.completed_surveys || "0", 10);
    const oneTimeConfirmations = parseInt(row?.one_time_confirmations || "0", 10);

    // A report is "complete" if it either has a survey response OR is one-time confirmed.
    // We cap at totalReports to avoid percentages > 100 in edge cases where a report
    // has both a survey response and a one-time confirmation.
    const completedTotal = Math.min(
      totalReports,
      completedSurveys + oneTimeConfirmations
    );

    const percentage =
      totalReports > 0 ? Math.round((completedTotal / totalReports) * 100) : 0;

    const result: SurveyProgressData = {
      totalReports,
      completedSurveys,
      oneTimeConfirmations,
      completedTotal,
      percentage,
      entity: user.entity,
    };

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching survey progress:", error);
    return NextResponse.json(
      { error: "Failed to fetch progress data" },
      { status: 500 }
    );
  }
}
